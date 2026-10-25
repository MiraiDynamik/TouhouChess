#!/usr/bin/env python3
"""评估权重调参。程序搜，人用棋理判读。

两种模式：

  ab     调一个评估项。同一个阵容双方对摆，一方用候选权重、一方用基准权重，
         按行棋方逐手切换 —— 每一方搜索整棵树都用自己那套评估。
         噪声两臂同等承受，只放大方差不产生偏差，所以这种设计扛得住
         引擎本身的失误幅度（绝对测量扛不住，这是上一轮作废六千局的原因）。

  value  调某个棋子的引擎估价。判据是：引擎内部给这个棋子的估价，
         在「用它的阵容胜率最高」时才算对 —— 估价偏低会被贱卖，
         偏高会舍不得兑换，两头都掉胜率。这是个有极值的优化问题，
         不是循环论证。cost（部署花费）在这个模式里不动。

输出一律用**兵**作单位，并且明确标出哪些参数数据定不住 ——
区间含基准值或者宽到没有判别力的，报成「定不住」而不是报一个点估计。
上一轮我报过好几个自助区间宽达 ±1.5 分的"精确"数字。
"""
from __future__ import annotations
import argparse, copy, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "lab"))
from harness import run, vanilla                      # noqa: E402
from stats import Rate, two_prop, need_n_text, wilson   # noqa: E402
import armies                                          # noqa: E402

WEIGHTS = ROOT / "engine" / "weights.json"


def getpath(d: dict, path: str):
    cur = d
    for k in path.split('.'):
        cur = cur[k]
    return cur


def setpath(d: dict, path: str, v):
    ks = path.split('.')
    cur = d
    for k in ks[:-1]:
        cur = cur.setdefault(k, {})
    cur[ks[-1]] = v


def base_weights() -> dict:
    w = json.loads(WEIGHTS.read_text(encoding='utf-8'))
    w.pop('_comment', None)
    return w


def army_of(name: str) -> dict:
    if name == '香草':
        return vanilla()
    if name not in armies.ARMIES:
        raise SystemExit(f"没有这个阵容：{name}\n可选：{', '.join(sorted(armies.ARMIES))}")
    return armies.ARMIES[name]


def sweep_ab(path: str, values: list[float], army: str, games: int,
             out: str, level: str, workers: int | None, **kw) -> list[tuple]:
    """同阵容双方对摆：A 用候选值，B 用基准值。得分率 >50% = 候选更好。"""
    base = base_weights()
    cur = getpath(base, path)
    dep = army_of(army)
    rows = []
    for v in values:
        wa = {}
        setpath(wa, path, v)
        tag = f"ab:{path}={v}:{army}"
        r = run(dep, dep, games, out, tag=tag, level=level, workers=workers,
                weightsA=wa, weightsB={}, maxPly=160, adjudicate=2, **kw)
        rows.append((v, Rate(sum(x['score'] for x in r), len(r))))
        print(f"    {path}={v:<8g} {rows[-1][1]}")
    return rows


def sweep_value(piece: str, values: list[float], army: str, ref: str,
                games: int, out: str, level: str, workers: int | None,
                **kw) -> list[tuple]:
    """改引擎对某个棋子的估价，看用它的阵容打参照阵容的胜率。
    胜率最高的那个估价就是对的 —— 偏低贱卖、偏高惜售，两头都差。"""
    dep, rdep = army_of(army), army_of(ref)
    rows = []
    for v in values:
        w = {'value': {piece: v}}
        tag = f"val:{piece}={v}:{army}vs{ref}"
        r = run(dep, rdep, games, out, tag=tag, level=level, workers=workers,
                weights=w, maxPly=160, adjudicate=2, **kw)
        rows.append((v, Rate(sum(x['score'] for x in r), len(r))))
        print(f"    value.{piece}={v:<6g} {rows[-1][1]}")
    return rows


def report_ab(path: str, cur: float, rows: list[tuple]):
    """A/B 的报告。基准值对应的格位理论上是 50%（自己打自己）。"""
    print(f"\n  参数 {path}   当前 {cur:g} 评估单位 = {cur/100:+.2f} 兵")
    print(f"  {'候选(兵)':>10}{'得分率':>9}{'  95%区间':>16}   判读")
    best, bestr = None, None
    for v, r in rows:
        lo, hi = wilson(r.wins, r.n)
        beats = lo > 50          # 区间整体在 50 以上才算真的更好
        worse = hi < 50
        verd = "优于基准" if beats else ("劣于基准" if worse else "与基准无法区分")
        print(f"  {v/100:>+10.2f}{r.pct:>8.1f}%   [{lo:5.1f},{hi:5.1f}]   {verd}")
        if best is None or r.pct > bestr.pct:
            best, bestr = v, r
    lo, hi = wilson(bestr.wins, bestr.n)
    print()
    if lo > 50:
        print(f"  → 最佳 {best/100:+.2f} 兵（{bestr.pct:.1f}%，区间下界 {lo:.1f} > 50）"
              f"，建议把 {path} 改成 {best:g}")
    else:
        print(f"  → 定不住。最佳格位 {bestr.pct:.1f}% 的区间仍含 50。")
        print(f"    {need_n_text(bestr.pct - 50)}（现在 {bestr.n}）。")
        print(f"    在拿到那么多局之前，不要改 {path}。")


def report_value(piece: str, cur: float, rows: list[tuple], army: str, ref: str):
    print(f"\n  棋子 {piece}   当前引擎估价 {cur:g} 分（cost 不变）")
    print(f"  阵容 {army} 对 {ref}")
    print(f"  {'估价':>8}{'得分率':>9}{'  95%区间':>16}")
    for v, r in rows:
        lo, hi = wilson(r.wins, r.n)
        print(f"  {v:>8g}{r.pct:>8.1f}%   [{lo:5.1f},{hi:5.1f}]")
    best = max(rows, key=lambda x: x[1].pct)
    others = [r for r in rows if r[0] != best[0]]
    print()
    # 最佳格位要和其余每个格位都显著才算定住
    sig = all(two_prop(r[1], best[1])['sig'] for r in others) if others else False
    if sig:
        print(f"  → 最佳估价 {best[0]:g} 分（{best[1].pct:.1f}%），"
              f"且显著优于其余候选。建议 value.{piece} = {best[0]:g}")
    else:
        span = max(r[1].pct for r in rows) - min(r[1].pct for r in rows)
        print(f"  → 定不住。候选之间的跨度只有 {span:.1f}pp，"
              f"{need_n_text(span)}（现在 {best[1].n}）。")
        print(f"    说明在这个阵容上，{piece} 的估价在这个范围内对胜率不敏感 ——")
        print(f"    要么换一个更依赖它的阵容，要么加局数。")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='mode', required=True)

    a = sub.add_parser('ab', help='调一个评估项')
    a.add_argument('path', help='权重路径，例如 open.heavyEarly / mobility')
    a.add_argument('values', help='候选值，逗号分隔；留空则用当前值的 0.5/1/2 倍')
    a.add_argument('--army', default='香草')
    a.add_argument('--games', type=int, default=60)

    v = sub.add_parser('value', help='调某个棋子的引擎估价')
    v.add_argument('piece', help='棋子键，例如 reimu')
    v.add_argument('values', help='候选估价，逗号分隔')
    v.add_argument('--army', required=True, help='用这个棋子的阵容')
    v.add_argument('--ref', default='香草', help='参照阵容')
    v.add_argument('--games', type=int, default=60)

    for p in (a, v):
        p.add_argument('--out', default=str(ROOT / 'lab/out/tune.jsonl'))
        p.add_argument('--level', default='dev')
        p.add_argument('--workers', type=int, default=None)

    args = ap.parse_args()
    base = base_weights()

    if args.mode == 'ab':
        cur = getpath(base, args.path)
        vals = ([float(x) for x in args.values.split(',')] if args.values
                else [cur * 0.5, cur, cur * 2])
        print(f"A/B 调参：{args.path}   阵容 {args.army}   每格 {args.games} 局   档位 {args.level}")
        rows = sweep_ab(args.path, vals, args.army, args.games,
                        args.out, args.level, args.workers)
        report_ab(args.path, cur, rows)
    else:
        cur = base.get('value', {}).get(args.piece)
        if cur is None:
            cur = armies.RULES[args.piece]['cost']
        vals = [float(x) for x in args.values.split(',')]
        print(f"估价调参：{args.piece}   阵容 {args.army} 对 {args.ref}   "
              f"每格 {args.games} 局   档位 {args.level}")
        rows = sweep_value(args.piece, vals, args.army, args.ref, args.games,
                           args.out, args.level, args.workers)
        report_value(args.piece, cur, rows, args.army, args.ref)
    return 0


if __name__ == '__main__':
    sys.exit(main())
