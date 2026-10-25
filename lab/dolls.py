#!/usr/bin/env python3
"""爱丽丝该留多少人偶？

弹药每 0.5 分 = 一个人偶，所以"留多少弹药"就是"留多少人偶"。
多留弹药必然少放子力，这正是要测的权衡：这一分该变成人偶还是留在场上。

格位统一只拿掉兵（每少一个兵 = 多两个人偶），避免混进"少了哪个子"的干扰：

    爱丽丝@f2 基准    44.5分  弹药 0.5   1 个人偶
    再少 a2           43.5分  弹药 1.5   3 个
    再少 a2 h2        42.5分  弹药 2.5   5 个
    再少 a2 h2 b2     41.5分  弹药 3.5   7 个
    再少 a2 h2 b2 g2  40.5分  弹药 4.5   9 个

曲线应该有拐点：规则书写「每列最多存在 1 个己方人偶」，8 列所以同时
最多 8 个人偶在场。超过 4 分弹药之后多出来的只能当"被吃了再补"的替补，
收益一定衰减 —— 问题是在第几个开始衰减。

两个前提都已经验证过：
  1. 引擎真的会打人偶（tests/drop.test.ts）。改之前它一个都不打，
     因为旧评估给弹药记 80/分，打入净赚只有 0.1 分，比任何位置项都小 ——
     那时候测出来一定是"留 0 个最优"，而那是引擎缺陷不是答案。
  2. 用开发者级测，不用贤者级：贤者级带手写开局项，同一项在香草 +21.7pp、
     在灵梦阵容 -20.0pp，拿它量东西是在量偏差。

样本分配：先测两端，不平均铺。两端差得大的话每格 50 局就够；
真要铺五个格位，按 10pp 的效应算每格要 193 局，跑不完。
"""
from __future__ import annotations
import argparse, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "lab"))
from harness import vanilla, mod, run, points      # noqa: E402
from stats import Rate, two_prop, need_n_text, wilson  # noqa: E402

DROP = ['a2', 'h2', 'b2', 'g2']       # 拿掉的兵两翼交替

def army(extra_pawns: int) -> dict:
    """f2 换爱丽丝，再拿掉 extra_pawns 个兵"""
    ch = {'f2': 'alice'}
    for i in range(extra_pawns):
        ch[DROP[i]] = None
    return mod(**ch)

# (多拿掉几个兵, 局数)。先两端后中间 —— 中途被砍也先拿到最有判别力的那对
PLAN = [(0, 50), (4, 50), (2, 50), (1, 40), (3, 40)]


def dolls_of(dep: dict) -> float:
    return round((45 - points(dep)) / 0.5)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=str(ROOT / 'lab/out/dolls.jsonl'))
    ap.add_argument('--level', default='dev')
    ap.add_argument('--depth', type=int, default=5,
                    help='固定深度。研究标准 5：深度4 测不出三个兵（z=-1.69），深度5 能（z=-4.43）')
    ap.add_argument('--games', type=int, default=None, help='覆盖每格局数')
    ap.add_argument('--workers', type=int, default=None)
    ap.add_argument('--cells', default=None, help='只跑这些格位，如 0,4')
    a = ap.parse_args()

    want = None if not a.cells else {int(x) for x in a.cells.split(',')}
    res: dict[int, tuple[int, Rate]] = {}
    print(f"爱丽丝的人偶储备曲线   档位 {a.level}\n")
    for k, n in PLAN:
        if want is not None and k not in want:
            continue
        n = a.games or n
        dep = army(k)
        d = dolls_of(dep)
        print(f"少{k}兵 → {points(dep)}分，弹药 {45-points(dep):.1f} = {d} 个人偶 × {n} 局")
        rows = run(dep, vanilla(), n, a.out, tag=f"dolls{k}d{a.depth}{a.level}",
                   level=a.level, fixedDepth=a.depth, maxPly=160,
                   adjudicate=2, workers=a.workers)
        res[k] = (d, Rate(sum(r['score'] for r in rows), len(rows)))

    print("\n" + "=" * 62)
    print(f"{'人偶上限':>8}{'场上分':>8}{'得分率':>9}{'  95%区间':>16}")
    for k in sorted(res):
        d, r = res[k]
        lo, hi = wilson(r.wins, r.n)
        print(f"{d:>8}{points(army(k)):>8.1f}{r.pct:>8.1f}%   [{lo:5.1f},{hi:5.1f}]  n={r.n}")

    if len(res) >= 2:
        ks = sorted(res)
        best = max(ks, key=lambda k: res[k][1].pct)
        print(f"\n最高：{res[best][0]} 个人偶（{res[best][1].pct:.1f}%）")
        # 最佳要显著优于两端才算定住
        ends = [k for k in (ks[0], ks[-1]) if k != best]
        sigs = [(k, two_prop(res[k][1], res[best][1])) for k in ends]
        for k, t in sigs:
            print(f"  对 {res[k][0]} 个人偶：{t['diff']:+.1f}pp  z={t['z']:.2f}  "
                  + ("显著" if t['sig'] else f"不显著（{need_n_text(t['diff'])}）"))
        if sigs and all(t['sig'] for _, t in sigs):
            print(f"\n→ 最优储备约 {res[best][0]} 个人偶")
        else:
            span = max(res[k][1].pct for k in ks) - min(res[k][1].pct for k in ks)
            print(f"\n→ 还定不住。全部格位的跨度 {span:.1f}pp，"
                  f"{need_n_text(span)}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
