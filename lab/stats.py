#!/usr/bin/env python3
"""胜率统计。纯 Python 零依赖 —— 在哪台机器上都能跑。

这个模块存在的理由是上一轮研究踩过的几个坑，每个都对应一个函数：

  wilson        n=20 的区间宽到 ±20pp，却被我当成结论报出去过。
                所有胜率必须带区间。
  two_prop      「A 比 B 高 8.6pp」要看标准误才知道有没有意义。
  bootstrap     v = logit(p)/a 这类估计量，噪声大的斜率在分母上会发散，
                点估计看着精确、真实区间宽到没有判别力。要重采样才看得出来。
  monotonic     少 1/2/3 个兵的胜率必须单调递减。这是最便宜的健全性检查，
                而我把它留到最后才做 —— 深度 2 在这一关上不及格。
"""
from __future__ import annotations
import math, random
from dataclasses import dataclass

Z95 = 1.959963984540054


@dataclass
class Rate:
    """一组对局的得分率。score 可以含 0.5（和棋）"""
    wins: float
    n: int

    @property
    def p(self) -> float:
        return self.wins / self.n if self.n else 0.0

    @property
    def pct(self) -> float:
        return self.p * 100

    def __str__(self) -> str:
        lo, hi = wilson(self.wins, self.n)
        return f"{self.pct:5.1f}%  CI[{lo:4.1f},{hi:4.1f}]  n={self.n}"


def wilson(wins: float, n: int, z: float = Z95) -> tuple[float, float]:
    """Wilson 区间（百分数）。小样本比正态近似靠谱，而研究里 n 常常只有几十。"""
    if n <= 0:
        return (0.0, 100.0)
    p = wins / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    m = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return ((c - m) * 100, (c + m) * 100)


def two_prop(a: Rate, b: Rate) -> dict:
    """两组得分率之差。返回差值、标准误、z、是否显著（双侧 0.05）。
    「b 比 a 高多少」。"""
    if not a.n or not b.n:
        return dict(diff=0.0, se=float('inf'), z=0.0, sig=False)
    pa, pb = a.p, b.p
    se = math.sqrt(pa * (1 - pa) / a.n + pb * (1 - pb) / b.n) * 100
    diff = (pb - pa) * 100
    z = diff / se if se else 0.0
    return dict(diff=diff, se=se, z=z, sig=abs(z) >= Z95,
                lo=diff - Z95 * se, hi=diff + Z95 * se)


def need_n(diff_pp: float, p: float = 0.5, power_z: float = Z95) -> int | None:
    """要让 diff_pp 这么大的差显著，每组大约需要多少局。
    用来在开跑前判断「这个实验值不值得跑」，而不是跑完才发现样本不够。

    差小于 0.5pp 时返回 None：那个量级下这个公式会给出天文数字
    （观测差 0.0pp 曾让它打印出 1.9e22 局），而一个会打印荒谬数字的工具
    会让人不再信它其余的输出。调用方改说「观测差接近 0」。"""
    if diff_pp < 0.5:
        return None
    var = 2 * p * (1 - p) * 100 * 100
    return math.ceil(var * (power_z / diff_pp) ** 2)


def need_n_text(diff_pp: float) -> str:
    """给人看的样本量说明，自动处理「差接近 0」的情况"""
    n = need_n(abs(diff_pp))
    if n is None:
        return "观测差接近 0，样本量估计无意义（换更敏感的格位或更大的候选间距）"
    return f"每格约需 {n} 局"


def bootstrap(samples: list[float], stat, reps: int = 20000,
              seed: int = 1) -> dict:
    """对 samples 重采样，返回 stat 的中位数和 95% 区间。
    stat 接一个列表、返回一个数；返回 None 的抽样被丢弃（估计量发散时会这样）。

    为什么需要它：配对拟合那类估计量把噪声大的斜率放在分母上，
    点估计看着精确（1.86），自助区间却是 [-0.25, 3.33] —— 没有判别力。
    点估计不带这个区间就不要往外报。
    """
    rnd = random.Random(seed)
    n = len(samples)
    out: list[float] = []
    drop = 0
    for _ in range(reps):
        res = stat([samples[rnd.randrange(n)] for _ in range(n)])
        if res is None or not math.isfinite(res):
            drop += 1
            continue
        out.append(res)
    if not out:
        return dict(median=None, lo=None, hi=None, usable=0, dropped=drop)
    out.sort()
    q = lambda f: out[min(len(out) - 1, int(len(out) * f))]
    return dict(median=q(.5), lo=q(.025), hi=q(.975),
                usable=len(out), dropped=drop)


def monotonic(points: list[tuple[float, Rate]], decreasing: bool = True) -> dict:
    """单调性检查。points 是 [(自变量, 得分率)]，按自变量排序后看是否单调。
    返回每一段的方向、是否全程单调、以及违例。

    这是开发者级引擎的验收标准：白方少 1/2/3 个兵的胜率必须单调递减。
    不及格就说明仪器的分辨率比信号粗，这时候测任何棋子都是在测噪声。
    """
    pts = sorted(points, key=lambda x: x[0])
    segs, bad = [], []
    for (x0, r0), (x1, r1) in zip(pts, pts[1:]):
        d = r1.pct - r0.pct
        okay = (d <= 0) if decreasing else (d >= 0)
        segs.append(dict(frm=x0, to=x1, delta=d, ok=okay))
        if not okay:
            bad.append(f"{x0}→{x1} 反向 {d:+.1f}pp")
    return dict(segments=segs, monotonic=not bad, violations=bad,
                span=pts[-1][1].pct - pts[0][1].pct if len(pts) > 1 else 0.0)


def diversity(rows: list[dict]) -> dict:
    """n 局里有几条不同的开局路线。

    为什么要看：开局剪枝变狠之后引擎更确定，同一个阵容的多局可能走出
    几乎相同的棋。那时 40 局提供的信息量接近 1 局，而 Wilson 区间的前提
    （样本独立）不成立 —— 区间会显得比真实情况窄得多。
    研究脚本里挡着这件事的是前几手的开局随机化，这个函数就是用来确认
    它还在起作用。
    """
    lines = [r.get("open8", "") for r in rows if r.get("open8")]
    if not lines:
        return dict(n=len(rows), distinct=None, ratio=None, top=None)
    from collections import Counter
    c = Counter(lines)
    return dict(n=len(lines), distinct=len(c),
                ratio=len(c) / len(lines),
                top=c.most_common(3))


def pawns(ev_units: float) -> float:
    """评估单位 → 兵。引擎里 1 分 = 100 单位。
    报告一律用兵做单位 —— 调参结果要能用棋理判读，而不是一堆评估单位。"""
    return ev_units / 100.0


if __name__ == "__main__":
    # 自检：用上一轮真实数据跑一遍，确认函数给出的结论和当时手算的一致
    print("自检（用上一轮的真实数据）")
    van = Rate(0.558 * 60, 60)
    noheavy = Rate(0.342 * 60, 60)
    print("  香草 全开     ", van)
    print("  香草 -heavy   ", noheavy)
    t = two_prop(van, noheavy)
    print(f"  关掉 heavy：{t['diff']:+.1f}pp  z={t['z']:.2f}  显著={t['sig']}  "
          f"（当时手算 -21.7pp, z=-2.44）")
    r = Rate(0.369 * 80, 80)
    rn = Rate(0.569 * 80, 80)
    t2 = two_prop(r, rn)
    print(f"  灵梦3枚：{t2['diff']:+.1f}pp  z={t2['z']:.2f}  显著={t2['sig']}  "
          f"（当时手算 +20.0pp, z=2.59）")
    print(f"\n  要让 20pp 的差显著，每组需要约 {need_n(20)} 局")
    print(f"  要让 5pp 的差显著，每组需要约 {need_n(5)} 局")
    m = monotonic([(1, Rate(.475 * 200, 200)), (2, Rate(.483 * 200, 200)),
                   (3, Rate(.473 * 200, 200))])
    print(f"\n  深度2 的少兵测试单调？{m['monotonic']}  违例 {m['violations']}")
    print("  （这就是开发者级不能用深度 2 的原因）")
