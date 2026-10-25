#!/usr/bin/env python3
"""阵容表。从原型的 armies.js 搬过来，并按 rules/pieces.toml 重新校验。

每个阵容是 {白方视角格名: 棋子键}。check() 验四件事：
部署位合法、列限制、数量限制、点数不超预算、将军对象恰好一个。

原型里非法阵容会被静默塞进一个 ILLEGAL 数组然后跳过 —— 于是我给紫加了
d/h 列限制之后，「车位紫」那个阵容悄悄失效，而我还在引用它的旧数据。
这里改成：非法就抛错，要容忍必须显式写进 KNOWN_ILLEGAL。
"""
from __future__ import annotations
import tomllib, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent


ARMIES: dict[str, dict[str, str]] = {
    "香草": {"a1":"r", "b1":"n", "c1":"b", "d1":"q", "e1":"k", "f1":"b", "g1":"n", "h1":"r", "a2":"p", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"p", "g2":"p", "h2":"p"},   # 基准 43分2弹16身位
    "b1空": {"a1":"r", "c1":"b", "d1":"q", "e1":"k", "f1":"b", "g1":"n", "h1":"r", "a2":"p", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"p", "g2":"p", "h2":"p"},   # 轻子位留空，算边际价值用
    "a2空": {"a1":"r", "b1":"n", "c1":"b", "d1":"q", "e1":"k", "f1":"b", "g1":"n", "h1":"r", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"p", "g2":"p", "h2":"p"},   # 兵位留空，算边际价值用
    "n位兔子": {"a1":"r", "b1":"rabbit", "c1":"b", "d1":"q", "e1":"k", "f1":"b", "g1":"n", "h1":"r", "a2":"p", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"p", "g2":"p", "h2":"p"},   # b1 马→兔子
    "n位妖精": {"a1":"r", "b1":"fairy", "c1":"b", "d1":"q", "e1":"k", "f1":"b", "g1":"n", "h1":"r", "a2":"p", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"p", "g2":"p", "h2":"p"},   # b1 马→妖精
    "n位桑尼": {"a1":"r", "b1":"sunny", "c1":"b", "d1":"q", "e1":"k", "f1":"b", "g1":"n", "h1":"r", "a2":"p", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"p", "g2":"p", "h2":"p"},   # b1 马→桑尼
    "n位恋": {"a1":"r", "b1":"koishi", "c1":"b", "d1":"q", "e1":"k", "f1":"b", "g1":"n", "h1":"r", "a2":"p", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"p", "g2":"p", "h2":"p"},   # b1 马→恋
    "n位爱丽丝": {"a1":"r", "b1":"alice", "c1":"b", "d1":"q", "e1":"k", "f1":"b", "g1":"n", "h1":"r", "a2":"p", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"p", "g2":"p", "h2":"p"},   # b1 马→爱丽丝
    "n位露米娅": {"a1":"r", "b1":"lumia", "c1":"b", "d1":"q", "e1":"k", "f1":"b", "g1":"n", "h1":"r", "a2":"p", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"p", "g2":"p", "h2":"p"},   # b1 马→露米娅
    "n位灵梦": {"a1":"r", "b1":"reimu", "c1":"b", "d1":"q", "e1":"k", "f1":"b", "g1":"n", "h1":"r", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"p", "g2":"p"},   # b1 马→灵梦，减2兵
    "p位毛玉": {"a1":"r", "b1":"n", "c1":"b", "d1":"q", "e1":"k", "f1":"b", "g1":"n", "h1":"r", "a2":"keda", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"p", "g2":"p", "h2":"p"},   # a2 兵→毛玉
    "p位阴阳玉": {"a1":"r", "b1":"n", "c1":"b", "d1":"q", "e1":"k", "f1":"b", "g1":"n", "h1":"r", "a2":"onmyo", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"p", "g2":"p", "h2":"p"},   # a2 兵→阴阳玉
    "p位幽灵": {"a1":"r", "b1":"n", "c1":"b", "d1":"q", "e1":"k", "f1":"b", "g1":"n", "h1":"r", "a2":"ghost", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"p", "g2":"p", "h2":"p"},   # a2 兵→幽灵
    "p位兔子": {"a1":"r", "b1":"n", "c1":"b", "d1":"q", "e1":"k", "f1":"b", "g1":"n", "h1":"r", "a2":"rabbit", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"p", "g2":"p", "h2":"p"},   # a2 兵→兔子
    "p位妖精": {"a1":"r", "b1":"n", "c1":"b", "d1":"q", "e1":"k", "f1":"b", "g1":"n", "h1":"r", "a2":"fairy", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"p", "g2":"p", "h2":"p"},   # a2 兵→妖精
    "p位桑尼": {"a1":"r", "b1":"n", "c1":"b", "d1":"q", "e1":"k", "f1":"b", "g1":"n", "h1":"r", "a2":"sunny", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"p", "g2":"p", "h2":"p"},   # a2 兵→桑尼
    "p位琪露诺": {"a1":"r", "b1":"n", "c1":"b", "d1":"q", "e1":"k", "f1":"b", "g1":"n", "h1":"r", "a2":"cirno", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"p", "g2":"p", "h2":"p"},   # a2 兵→琪露诺
    "p位恋": {"a1":"r", "b1":"n", "c1":"b", "d1":"q", "e1":"k", "f1":"b", "g1":"n", "h1":"r", "a2":"koishi", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"p", "g2":"p", "h2":"p"},   # a2 兵→恋
    "p位爱丽丝": {"a1":"r", "b1":"n", "c1":"b", "d1":"q", "e1":"k", "f1":"b", "g1":"n", "h1":"r", "a2":"alice", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"p", "g2":"p", "h2":"p"},   # a2 兵→爱丽丝
    "p位露米娅": {"a1":"r", "b1":"n", "c1":"b", "d1":"q", "e1":"k", "f1":"b", "g1":"n", "h1":"r", "a2":"lumia", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"p", "g2":"p"},   # a2 兵→露米娅，减1兵
    "爱丽丝1枚": {"a1":"r", "b1":"n", "c1":"b", "d1":"q", "e1":"k", "f1":"b", "g1":"n", "h1":"r", "a2":"p", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"alice", "g2":"p", "h2":"p"},   # f2 单枚，44.5分
    "爱丽丝2兵位": {"a1":"r", "b1":"n", "c1":"b", "d1":"q", "e1":"k", "h1":"r", "a2":"p", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"alice", "g2":"alice", "h2":"p"},   # 围玉型，可短易位
    "爱丽丝2轻子位": {"a1":"r", "b1":"n", "c1":"b", "d1":"q", "e1":"k", "f1":"alice", "g1":"alice", "h1":"r", "a2":"p", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "h2":"p"},   # 同分同身位对照
    "爱丽丝2分置": {"a1":"r", "c1":"b", "d1":"q", "e1":"k", "f1":"b", "h1":"r", "a2":"p", "b2":"alice", "c2":"p", "d2":"p", "e2":"p", "f2":"p", "g2":"alice", "h2":"p"},   # 两翼各一
    "爱丽丝4枚": {"a1":"r", "d1":"q", "e1":"k", "h1":"r", "a2":"p", "b2":"alice", "c2":"alice", "d2":"p", "e2":"p", "f2":"alice", "g2":"alice", "h2":"p"},   # 四枚，12身位8弹
    "围玉弹药2": {"a1":"r", "b1":"n", "c1":"b", "d1":"q", "e1":"k", "f1":"n", "h1":"r", "a2":"p", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"alice", "g2":"alice", "h2":"p"},   # 补回一马
    "围玉弹药5": {"a1":"r", "b1":"n", "c1":"b", "d1":"q", "e1":"k", "h1":"r", "a2":"p", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"alice", "g2":"alice", "h2":"p"},   # 基准
    "围玉弹药8": {"a1":"r", "b1":"n", "d1":"q", "e1":"k", "h1":"r", "a2":"p", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"alice", "g2":"alice", "h2":"p"},   # 少一象
    "围玉弹药11": {"a1":"r", "d1":"q", "e1":"k", "h1":"r", "a2":"p", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"alice", "g2":"alice", "h2":"p"},   # 少一象一马
    "r位灵梦": {"a1":"reimu", "b1":"n", "c1":"b", "d1":"q", "e1":"k", "f1":"b", "g1":"n", "h1":"r", "c2":"p", "d2":"p", "e2":"p", "f2":"p", "g2":"p", "h2":"p"},   # a1 车→灵梦，减2兵
    "r位早苗": {"a1":"sanae", "b1":"n", "c1":"b", "d1":"q", "e1":"k", "f1":"b", "g1":"n", "h1":"r", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"p", "g2":"p", "h2":"p"},   # a1 车→早苗，减1兵
    "r位露米娅": {"a1":"lumia", "b1":"n", "c1":"b", "d1":"q", "e1":"k", "f1":"b", "g1":"n", "h1":"r", "a2":"p", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"p", "g2":"p", "h2":"p"},   # a1 车→露米娅
    "后位紫": {"a1":"r", "b1":"n", "c1":"b", "d1":"yukari", "e1":"sanae", "f1":"b", "g1":"n", "h1":"r", "a2":"p", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"p", "g2":"p", "h2":"p"},   # 紫d1+早苗e1，43分16身位
    "后位紫王位灵梦": {"a1":"r", "b1":"n", "c1":"b", "d1":"yukari", "e1":"reimu", "f1":"b", "g1":"n", "h1":"r", "d2":"p", "e2":"p", "f2":"p", "g2":"p", "h2":"p"},   # 紫d1+灵梦e1
    "后位灵梦": {"a1":"r", "b1":"n", "c1":"b", "d1":"reimu", "e1":"k", "f1":"b", "g1":"n", "h1":"r", "a2":"p", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"p", "g2":"p", "h2":"p"},   # 后→灵梦，省2分当弹药
    "灵梦2枚": {"a1":"reimu", "b1":"n", "c1":"b", "d1":"q", "e1":"k", "h1":"reimu", "a2":"p", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"p", "g2":"p", "h2":"p"},   # 双车→双灵梦，去两轻子
    "灵梦3枚": {"a1":"reimu", "b1":"n", "c1":"b", "d1":"reimu", "e1":"k", "f1":"b", "g1":"n", "h1":"reimu", "a2":"p", "b2":"p", "c2":"p", "d2":"p", "e2":"p", "f2":"p", "g2":"p", "h2":"p"},   # 三灵梦换二车一后，45分16身位
    "八兔": {"a1":"r", "b1":"n", "c1":"b", "d1":"q", "e1":"k", "f1":"b", "g1":"n", "h1":"r", "a2":"rabbit", "b2":"rabbit", "c2":"rabbit", "d2":"rabbit", "e2":"rabbit", "f2":"rabbit", "g2":"rabbit", "h2":"rabbit"},   # 兵全换兔子，同价
    "八毛玉": {"a1":"r", "b1":"n", "c1":"b", "d1":"q", "e1":"k", "f1":"b", "g1":"n", "h1":"r", "a2":"keda", "b2":"keda", "c2":"keda", "d2":"keda", "e2":"keda", "f2":"keda", "g2":"keda", "h2":"keda"},   # 兵全换毛玉，6弹
    "毛玉阴阳玉混": {"a1":"r", "b1":"n", "c1":"b", "d1":"q", "e1":"k", "f1":"b", "g1":"n", "h1":"r", "a2":"keda", "b2":"keda", "c2":"keda", "d2":"keda", "e2":"onmyo", "f2":"onmyo", "g2":"onmyo", "h2":"onmyo"},   # 左四毛玉右四阴阳玉
    "四幽灵": {"a1":"r", "b1":"n", "c1":"b", "d1":"q", "e1":"k", "f1":"b", "g1":"n", "h1":"r", "a2":"ghost", "b2":"ghost", "c2":"p", "d2":"p", "e2":"p", "f2":"p", "g2":"ghost", "h2":"ghost"},   # 四兵→幽灵
    "八妖精": {"a1":"r", "d1":"q", "e1":"k", "f1":"b", "g1":"n", "h1":"r", "a2":"fairy", "b2":"fairy", "c2":"fairy", "d2":"fairy", "e2":"fairy", "f2":"fairy", "g2":"fairy", "h2":"fairy"},   # 兵全换妖精，去两轻子
}


def _rules():
    book = tomllib.loads((ROOT / "rules/pieces.toml").read_text(encoding="utf-8"))
    km = tomllib.loads((ROOT / "rules/keymap.toml").read_text(encoding="utf-8"))
    key = dict(km["key"]); key.pop("unimplemented", None)
    SL = {"king": "k", "queen": "q", "rook": "r", "minor": "n", "pawn": "p"}
    out = {}
    for p in book["piece"]:
        k = key.get(p["name"])
        if k is None:
            continue
        out[k] = dict(name=p["name"], cost=p["cost"],
                      slots=[SL[s] for s in p["slots"]],
                      files=p.get("files"), max=p.get("max"),
                      sqcolor=p.get("per_square_color"),
                      royal=p["name"] in ("王", "八云紫", "洩矢诹访子",
                                          "西行寺幽幽子", "赫卡提亚拉碧斯拉祖利"))
    return out


RULES = _rules()
BUDGET, BODIES = 45, 16
KNOWN_ILLEGAL: set[str] = set()      # 显式容忍的非法阵容（目前没有）


def slot_of(sq: str) -> str | None:
    f, r = "abcdefgh".index(sq[0]), int(sq[1])
    if r == 2:
        return "p"
    if r == 1:
        return "k" if f == 4 else "q" if f == 3 else ("r" if f in (0, 7) else "n")
    return None


def check(name: str, dep: dict[str, str]) -> dict:
    """合法性检查。不合法就抛 ValueError —— 静默跳过咬过我一次。"""
    cnt: dict[str, int] = {}
    roy = 0
    for sq, t in dep.items():
        if t not in RULES:
            raise ValueError(f"{name}: 未实装的棋子 {t}")
        d = RULES[t]
        sl = slot_of(sq)
        if sl is None:
            raise ValueError(f"{name}: {sq} 不是合法部署格")
        if sl not in d["slots"]:
            raise ValueError(f"{name}: {d['name']} 不能放在 {sq}（{sl}位）")
        if d["files"] and sq[0] not in d["files"]:
            raise ValueError(f"{name}: {d['name']} 只能放在 {'/'.join(d['files'])} 列")
        cnt[t] = cnt.get(t, 0) + 1
        if d["royal"]:
            roy += 1
    if roy != 1:
        raise ValueError(f"{name}: 将军对象 {roy} 个，应为 1")
    if len(dep) > BODIES:
        raise ValueError(f"{name}: {len(dep)} 身位，上限 {BODIES}")
    pts = round(sum(RULES[t]["cost"] for t in dep.values()), 1)
    if pts > BUDGET:
        raise ValueError(f"{name}: {pts} 分超预算 {BUDGET}")
    for t, c in cnt.items():
        d = RULES[t]
        if d["max"] and c > d["max"]:
            raise ValueError(f"{name}: {d['name']} {c} 枚，上限 {d['max']}")
        if d["sqcolor"]:
            cols = {("abcdefgh".index(sq[0]) + int(sq[1])) % 2
                    for sq, tt in dep.items() if tt == t}
            if c > 2 or len(cols) != c:
                raise ValueError(f"{name}: {d['name']} 违反每色格限制")
    return dict(pts=pts, bodies=len(dep), ammo=round(BUDGET - pts, 1))


def legal() -> dict[str, dict]:
    """全部合法阵容 → 元数据。非法的会抛错，不会被静默跳过。"""
    out = {}
    bad = []
    for n, d in ARMIES.items():
        try:
            out[n] = check(n, d)
        except ValueError as e:
            if n in KNOWN_ILLEGAL:
                continue
            bad.append(str(e))
    if bad:
        raise ValueError("阵容表里有非法阵容（要容忍请加进 KNOWN_ILLEGAL）：\n  "
                         + "\n  ".join(bad))
    return out


if __name__ == "__main__":
    import sys
    try:
        meta = legal()
    except ValueError as e:
        print(e); sys.exit(1)
    print(f"{len(meta)} 个阵容全部合法\n")
    print(f"{'阵容':<16}{'分':>5}{'身位':>5}{'剩余':>6}  打入手")
    for n, m in sorted(meta.items(), key=lambda kv: -kv[1]["pts"]):
        dr = any(t == "alice" for t in ARMIES[n].values())
        print(f"{n:<14}{m['pts']:>6}{m['bodies']:>5}{m['ammo']:>6}  "
              + ("有" if dr else ("—" if m["ammo"] == 0 else "无（剩余是死分）")))
