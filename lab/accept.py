#!/usr/bin/env python3
"""开发者级的验收测试。后面所有阵容/子力测量都要先过这一关。

  白方 = 香草少 k 个兵，黑方 = 整副香草，其余完全相同。
  两边都没有打入手，所以省下的弹药花不出去 —— 这是真让子，
  不是「材料换弹药」。（这一点我一度搞错，详见 engine/eval.ts 的说明。）

格位跨过 50%，因为胜率在那里最灵敏：
  k=0  两边一样    必须 ≈50%      对照，检验颜色偏差
  k=1  少1兵       应明显低于50%   主判据
  k=3  少3兵       应低于 k=1      更少子力更差

样本按信息量分配，不平均分：主判据给得最多。
深度 2 在这一关不及格（少1/2/3兵给出 47.5/48.3/47.3，无趋势），
这就是把测量仪器换成开发者级的原因。
"""
from __future__ import annotations
import sys, pathlib, argparse
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "lab"))
from harness import vanilla, mod, run, points
from stats import (Rate, two_prop, monotonic, need_n_text, wilson,
                   diversity)

DROP = ['a2', 'h2', 'b2']          # 拿掉的兵两翼交替，别把缺口堆在一边

def army(k: int) -> dict:
    return mod(**{DROP[i]: None for i in range(k)})

# 验收和标度是两件事，之前混在一起让验收贵了 3 倍：
#
#   验收（默认）  仪器能不能感知子力 + 有没有颜色偏差
#                 用大效应格位最便宜：少3兵效应约 -35pp，每格 ~22 局就显著
#   标度（--calibrate）  一个兵值多少 pp
#                 必须用小效应格位：少1兵效应约 10pp，每格要 ~193 局
#
# 每次改引擎都要重跑验收，所以它必须便宜；标度是偶尔做一次的事。
# 研究用的标准深度。实测的阈值效应：
#   深度3+少子加深  38.8%  z=-1.12  不通过  重复 2.5%  终局子力差 -5.9
#   深度4 固定      36.7%  z=-1.69  不通过  重复 20%   终局子力差 -3.9
#   深度5 固定      15.0%  z=-4.43  通过    重复 0%    终局子力差 -8.6
# 3→4 只差 2.1pp，4→5 差 21.7pp —— 这是道坎不是渐变曲线。
# 深度 5 是引擎第一次能把子力优势转化成胜势的深度（优势被扩大而非还回去）。
# 成本 123 秒/局（2核）；优化前深度3 是 71 秒/局，所以现在跨过这道坎
# 的代价不到以前深度3 的两倍。
RESEARCH_DEPTH = 5

ACCEPT_CELLS   = [(3, 50), (0, 40)]
CALIBRATE_CELL = (1, 200)

def h2h(a) -> int:
    """等时对局：剪枝方多搜一层，对精确方。

    为什么这是「等时」甚至对剪枝方不利：实测剪枝深度 6 单次 2514ms，
    精确深度 5 单次 5412ms —— 剪枝方多搜一层还快一倍。所以如果它赢，
    结论是稳的；如果它输，说明漏掉的弃子战术比多一层更值钱。

    判据三种走向都有用：
      显著 > 50%  → 采用剪枝，并且可以考虑把 dev 并进 eirin
      显著 < 50%  → 研究用的仪器退回精确搜索（玩家那边仍可用剪枝）
      区间含 50%  → 两者等价，仍然采用剪枝，因为它便宜两倍
    """
    d = a.fixed_depth
    out = str(ROOT / "lab/out/prune_h2h.jsonl")
    print(f"等时对局：剪枝方深度 {d+1}  对  精确方深度 {d}")
    print(f"被测方（剪枝方）逐局换颜色，score 是它的视角\n")
    rows = run(vanilla(), vanilla(), a.h2h_games, out,
               tag=f"p{d+1}vse{d}", level=a.level,
               fixedDepth=d, prune=0, pruneA=1, fixedDepthA=d + 1,
               maxPly=140, adjudicate=2, workers=a.workers)
    if not rows:
        print("没有结果 —— 一局都没跑完")
        return 1
    r = Rate(sum(x['score'] for x in rows), len(rows))
    print(f"\n剪枝方得分率  {r}")
    dv = diversity(rows)
    if dv['distinct'] is not None:
        print(f"开局多样性    {dv['distinct']}/{dv['n']} 条不同"
              f"（比例 {dv['ratio']:.2f}）"
              + ("" if dv['ratio'] > .5 else "  ← 偏低，区间可能偏窄"))
    lo, hi = wilson(r.wins, r.n)
    if lo > 50:
        print("\n判定：剪枝方显著更强 → 采用剪枝")
    elif hi < 50:
        print("\n判定：剪枝方显著更弱 → 研究用的仪器退回精确搜索")
    else:
        print(f"\n判定：区间 [{lo:.1f},{hi:.1f}] 含 50%，两者等价 → "
              "仍采用剪枝（便宜两倍）")
        print(f"      想分出高下：{need_n_text(abs(r.pct - 50))}")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "lab/out/accept.jsonl"))
    ap.add_argument("--fixed-depth", type=int, default=RESEARCH_DEPTH,
                    help="固定深度，各阶段一致。研究标准是 5 —— 见下方说明")
    ap.add_argument("--depth-bonus", type=int, default=0,
                    help="叠加在少子加深之上。只在 --fixed-depth 0 时生效")
    ap.add_argument("--workers", type=int, default=None)
    ap.add_argument("--scale", type=float, default=1.0, help="局数倍率")
    ap.add_argument("--level", default="dev", help="冒烟测试时可换成 human 提速")
    ap.add_argument("--calibrate", action="store_true",
                    help="额外跑少1兵（每格 200 局），标度「一个兵值多少 pp」")
    ap.add_argument("--prune", type=int, default=1,
                    help="验收时是否开前向剪枝（默认开）。仪器改过就要重新验收")
    ap.add_argument("--h2h", action="store_true",
                    help="等时对局：剪枝方深度+1 对 精确方。判剪枝值不值")
    ap.add_argument("--h2h-games", type=int, default=40)
    a = ap.parse_args()

    if a.h2h:
        return h2h(a)

    print(f"开发者级验收  档位 {a.level}  "
          + (f"固定深度 {a.fixed_depth}" if a.fixed_depth
             else f"少子加深 + {a.depth_bonus}"))
    print(f"香草场上点数 {points(vanilla())} 分\n")
    cells = list(ACCEPT_CELLS)
    if a.calibrate:
        cells.append(CALIBRATE_CELL)
    res = {}
    for k, n in cells:
        n = int(n * a.scale)
        w = army(k)
        print(f"少{k}兵（{points(w)} 分）× {n} 局")
        tag = (f"k{k}fd{a.fixed_depth}{a.level}" if a.fixed_depth
               else f"k{k}d{a.depth_bonus}{a.level}")
        tag += f"p{a.prune}"
        rows = run(w, vanilla(), n, a.out, tag=tag, level=a.level,
                   fixedDepth=a.fixed_depth, depthBonus=a.depth_bonus,
                   prune=a.prune,
                   maxPly=160, adjudicate=2, workers=a.workers)
        res[k] = Rate(sum(r['score'] for r in rows), len(rows))

    print("\n" + "=" * 58)
    for k in sorted(res):
        print(f"  少{k}兵   {res[k]}")

    ok = True
    print()
    # 0. 没有数据就不要往下判 —— n=0 时标准误是 inf，任何偏离都会被
    #    判成「在范围内」，于是空跑一次也能「通过」。踩过这种坑。
    if not any(res[k].n for k in res):
        print("  一局都没有 —— 不做判定")
        print("\n验收：无结论（没有数据）")
        return 1
    # 1. 对照必须接近 50%
    if 0 in res:
        t = two_prop(Rate(res[0].n * 0.5, res[0].n), res[0])
        v = abs(res[0].pct - 50) < 2 * t['se'] if t['se'] else False
        print(f"  对照 k=0：{res[0].pct:.1f}%  偏离 50% "
              f"{res[0].pct-50:+.1f}pp（±{2*t['se']:.1f} 内算正常）→ "
              + ("正常" if v else "有偏差，先查这个"))
        ok &= v
    # 2. 主判据：少3兵必须被显著感知（大效应，便宜）
    if 0 in res and 3 in res:
        t = two_prop(res[0], res[3])
        print(f"  少3兵 对 对照：{t['diff']:+.1f}pp  z={t['z']:.2f} → "
              + ("显著，仪器能感知子力" if t['sig'] and t['diff'] < 0
                 else "不显著 —— 仪器分辨不出三个兵，不能用来测任何东西"))
        ok &= bool(t['sig'] and t['diff'] < 0)
        if not t['sig']:
            print(f"      要让这个差显著，{need_n_text(t['diff'])}")
    # 3. 标度（可选）：一个兵值多少 pp
    if a.calibrate and 0 in res and 1 in res:
        t = two_prop(res[0], res[1])
        print(f"\n  标度：一个兵 = {-t['diff']:.1f} pp"
              f"（区间 {-t['hi']:.1f} ~ {-t['lo']:.1f}）")
        if not t['sig']:
            print(f"      区间含 0，还定不住；{need_n_text(t['diff'])}")

    print("\n验收：" + ("通过 —— 可以用它测阵容和子力" if ok
                      else "不通过 —— 加深度（--depth-bonus 1）再跑"))
    return 0 if ok else 1

if __name__ == "__main__":
    sys.exit(main())
