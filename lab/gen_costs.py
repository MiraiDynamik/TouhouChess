#!/usr/bin/env python3
"""rules/pieces.toml + rules/keymap.toml → engine/costs.generated.ts

把「规则书说的 cost 和部署位」生成进引擎。引擎侧不解析 TOML ——
浏览器包里不该有 TOML 解析器，而且生成物可以被 git diff 审阅。

只生成已实装的棋子（keymap 的 key 表）。未实装的不生成，
这样 engine/pieces.ts 的交叉校验能发现「几何写了但规则书没有」
和「规则书有但几何没写」两种情况。
"""
from __future__ import annotations
import tomllib, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "engine" / "costs.generated.ts"
SLOT_TO_KEY = {"king": "k", "queen": "q", "rook": "r", "minor": "n", "pawn": "p"}


def main() -> int:
    book = tomllib.loads((ROOT / "rules/pieces.toml").read_text(encoding="utf-8"))
    km = tomllib.loads((ROOT / "rules/keymap.toml").read_text(encoding="utf-8"))
    key = dict(km["key"]); key.pop("unimplemented", None)
    # 待决项：保留当前实现的行为，不擅自采用规则书那一侧 ——
    # 否则「等人裁决」会变成「生成器悄悄替人决定了」。
    oq = {}
    f = ROOT / "rules/open_questions.toml"
    if f.exists():
        for o in tomllib.loads(f.read_text(encoding="utf-8")).get("open", []):
            oq[(o["piece"], o["field"])] = o

    rows = []
    for p in book["piece"]:
        k = key.get(p["name"])
        if k is None:
            continue
        slots = [SLOT_TO_KEY[s] for s in p["slots"]]
        lim = []
        pend = []
        if ("max" in p) or (p["name"], "max") in oq:
            o = oq.get((p["name"], "max"))
            if o and "max" not in p:
                # 规则书没写但实现有 —— 保留实现，等裁决
                lim.append(o["impl"].replace(" ", "").replace("=", ":"))
                pend.append(f"待决 {o['field']}：书「{o['book']}」")
            elif "max" in p:
                lim.append(f"max:{p['max']}")
        if p.get("per_square_color"):
            lim.append("limit:'sqcolor'")
        if p.get("files"):
            idx = ",".join(str("abcdefgh".index(f)) for f in p["files"])
            lim.append(f"files:[{idx}]")
        rows.append((k, p["name"], p["cost"], slots, lim, pend))

    L = ["// 本文件由 lab/gen_costs.py 从 rules/pieces.toml 生成，不要手改。",
         "// 改规则：改 rules/rulebook.md → python lab/rulebook.py → python lab/gen_costs.py",
         "//",
         "// cost = 部署花费（规则，玩家可见）。引擎估价 value 见 engine/weights.json，",
         "// 默认等于 cost，标定时独立变动 —— 把这两件事混成一个数曾经坑过我一整夜。",
         "",
         "export type PieceRule = {",
         "  name: string; cost: number; slots: string[];",
         "  max?: number; limit?: string; files?: number[];",
         "};",
         "",
         "export const RULES: Record<string, PieceRule> = {"]
    npend = 0
    for k, name, cost, slots, lim, pend in sorted(rows, key=lambda r: r[2]):
        sl = ", ".join("'%s'" % s for s in slots)
        extra = ("," + ", ".join(lim)) if lim else ""
        note = ("   // " + "；".join(pend)) if pend else ""
        if pend:
            npend += 1
        L.append(f"  {k}: {{name:'{name}', cost:{cost:g}, slots:[{sl}]{extra}}},{note}")
    L.append("};")
    L.append("")
    OUT.write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"已写入 {OUT.relative_to(ROOT)}（{len(rows)} 个已实装棋子）")
    if npend:
        print(f"  其中 {npend} 个带待决项：已保留实现的行为，见 rules/open_questions.toml")
    return 0


if __name__ == "__main__":
    sys.exit(main())
