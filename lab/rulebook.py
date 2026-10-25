#!/usr/bin/env python3
"""规则书 Markdown → rules/pieces.toml

输入永远是 Mirai 手写的 Markdown（rules/rulebook.md），
输出是代码读的结构化表。只抽「必须和规则书一字不差」的那些字段：
价值、部署位、数量限制、名字、分级。走法几何不在这里 —— 那是代码
（恋的洪水填充、紫的边缘瞬移没法声明式表达），几何由 engine/geometry.ts 提供，
两边的键集合由 engine 的构建步骤交叉检查。

硬要求：棋子段里任何一个块解析不出完整条目就 **抛错退出**。
今天那个 Node 版解析器漏了三条（拉丁名里的 - 和 &）还照常输出，
漏解析等于漏检查，比不一致更危险。

用法:
    python lab/rulebook.py                # 转换并写入，打印 diff
    python lab/rulebook.py --check        # 只比对，有差异则退出码 1
"""
from __future__ import annotations
import re, sys, pathlib, argparse, difflib

ROOT = pathlib.Path(__file__).resolve().parent.parent
MD   = ROOT / "rules" / "rulebook.md"
TOML = ROOT / "rules" / "pieces.toml"

# 规则书的部署位词汇 → 槽位键
SLOT = {"王位": "king", "后位": "queen", "车位": "rook",
        "轻子位": "minor", "兵位": "pawn"}
BACKRANK = ["king", "queen", "rook", "minor"]        # 规则书的「底线」
VANILLA_SLOT = {"王": "王位", "后": "后位", "车": "车位",
                "马": "轻子位", "主教": "轻子位", "兵": "兵位"}
# 拉丁名允许的字符：字母、空格、& - ' .
LATIN = re.compile(r"[A-Za-z][A-Za-z0-9\s&\-'.]*$")


class ParseError(Exception):
    pass


def split_name(head: str):
    """'阴阳玉 Yin-Yang Orb' → ('阴阳玉', 'Yin-Yang Orb')
       'Master Spark'        → ('Master Spark', '')  纯拉丁名的棋子"""
    head = head.strip()
    m = LATIN.search(head)
    if m and m.start() > 0:
        return head[:m.start()].strip(), m.group(0).strip()
    if m and m.start() == 0:
        return head, ""                 # 整个名字就是拉丁文
    return head, ""                     # 没有拉丁名


def parse_value_line(line: str, name: str):
    """'价值2.5, 部署在轻子位, 兵位' → (2.5, ['minor','pawn'], {}, None)
       返回 (cost, slots, limits, files)；slots 为 [] 表示不可部署"""
    m = re.search(r"价值\s*([\d.]+)", line)
    if not m:
        # 赫卡提亚是「3枚总价值14」
        m = re.search(r"总价值\s*([\d.]+)", line)
    if not m:
        raise ParseError(f"{name}: 找不到价值 —— {line!r}")
    cost = float(m.group(1))

    limits, files = {}, None
    # 「每色格最多部署1枚」必须先判，否则会被下面的 最多部署N枚 误读成 max=1（今天的 bug）
    if "每色格最多部署1枚" in line:
        limits["per_square_color"] = 1
    elif (mm := re.search(r"最多部署\s*(\d+)\s*枚", line)):
        limits["max"] = int(mm.group(1))
    if re.search(r"最多部署\s*1\s*对", line):
        limits["max_pairs"] = 1
    if (mm := re.search(r"可以且仅可以部署\s*(\d+)\s*枚", line)):
        limits["exactly"] = int(mm.group(1))

    if "不可部署" in line:
        return cost, [], limits, files

    dm = re.search(r"部署在\s*(.+)$", line)
    if not dm:
        raise ParseError(f"{name}: 既没写「不可部署」也没写「部署在…」 —— {line!r}")
    tail = dm.group(1)
    slots: list[str] = []
    if "底线" in tail:
        slots += BACKRANK
    if "王翼车位" in tail:                 # 八云紫：后位 + 王翼车位（只有 h1）
        slots.append("rook")
        files = ["d", "h"]                # 后位是 d 列，王翼车位是 h 列
    for cn, key in SLOT.items():
        if cn in tail:
            slots.append(key)
    slots = sorted(set(slots), key=lambda k: BACKRANK.index(k) if k in BACKRANK else 9)
    if not slots:
        raise ParseError(f"{name}: 部署位读不出来 —— {tail!r}")
    return cost, slots, limits, files


def parse(md: str):
    lines = md.splitlines()
    # 只取 ## 棋子 到下一个 ## 之间
    try:
        i0 = next(i for i, l in enumerate(lines) if l.strip() == "## 棋子")
    except StopIteration:
        raise ParseError("找不到「## 棋子」小节")
    i1 = next((i for i in range(i0 + 1, len(lines))
               if lines[i].startswith("## ")), len(lines))

    pieces, tier, block, unparsed = [], "", [], []
    tier_notes: dict[str, str] = {}
    fresh_tier = False           # 刚过完分级标题，下一块可能是小节说明

    def flush():
        nonlocal block, fresh_tier
        if not block:
            return
        # 紧跟分级标题、且不含「价值」的那一块是小节说明（贤者级就有一条）。
        # 条件收得很窄：只认分级标题后的第一块，否则就是「解析不了就跳过」的后门。
        if fresh_tier and not any("价值" in l for l in block):
            tier_notes[tier] = " ".join(l.strip() for l in block).strip()
            block = []; fresh_tier = False
            return
        fresh_tier = False
        # 香草级那一块：名字一行、价值一行
        if len(block) >= 2 and re.fullmatch(r"王 后 车 马 主教 兵", block[0].strip()):
            vs = re.search(r"价值分别为\s*([\d.\s]+)", block[1])
            if not vs:
                raise ParseError("香草级：找不到「价值分别为」")
            nums = [float(x) for x in vs.group(1).split()]
            names = ["王", "后", "车", "马", "主教", "兵"]
            if len(nums) != len(names):
                raise ParseError(f"香草级：{len(names)} 个棋子但 {len(nums)} 个价值")
            for n, v in zip(names, nums):
                cost, slots, limits, files = parse_value_line(
                    f"价值{v}, 部署在{VANILLA_SLOT[n]}", n)
                pieces.append(dict(name=n, en="", tier=tier, cost=cost,
                                   slots=slots, limits=limits, files=files,
                                   desc=" ".join(block[2:]).strip()))
            block = []
            return
        head_line = block[0]
        ci = next((j for j, ch in enumerate(head_line) if ch in ":："), -1)
        if ci < 0:
            unparsed.append(list(block)); block = []; return
        zh, en = split_name(head_line[:ci])
        desc_parts = [head_line[ci + 1:].strip()]
        vline = None
        for l in block[1:]:
            if "价值" in l and vline is None:
                vline = l
            else:
                desc_parts.append(l.strip())
        if vline is None:
            unparsed.append(list(block)); block = []; return
        cost, slots, limits, files = parse_value_line(vline, zh or en)
        pieces.append(dict(name=zh, en=en, tier=tier, cost=cost,
                           slots=slots, limits=limits, files=files,
                           desc=" ".join(p for p in desc_parts if p)))
        block = []

    for l in lines[i0 + 1:i1]:
        s = l.strip()
        if s.startswith("####"):
            flush(); tier = s.lstrip("#").strip(); fresh_tier = True; continue
        if not s:
            flush(); continue
        block.append(l)
    flush()

    if unparsed:
        msg = "\n".join("  " + " / ".join(b) for b in unparsed)
        raise ParseError(f"有 {len(unparsed)} 块没解析出棋子条目：\n{msg}")
    return pieces, tier_notes


def parse_deploy(md: str):
    """## 部署 小节里的槽位格名。
    规则书是一行列出双方的格子：
      王位是e1, e8, 后位是d1, d8, 车位是a1, h1, a8, h8,
      轻子位是b-c1, f-g1, b-c8, f-g8, 兵位是2行和7行
    按槽位名切分（不是按逗号），只取白方那一半（1、2 行），
    并把 b-c1 这样的区间和「2行」展开成具体格名。
    任何一个槽位推不出格子就抛错 —— 部分解析过去咬过我一次。"""
    m = re.search(r"##\s*部署(.*?)(?:\n##|\Z)", md, re.S)
    if not m:
        raise ParseError("找不到「## 部署」小节")
    body = m.group(1)
    names = list(SLOT.keys())
    # 每个「X位是」的文本范围 = 到下一个「Y位是」或行尾
    marks = [(mm.start(), mm.group(1)) for mm in
             re.finditer(r"(" + "|".join(names) + r")是", body)]
    if len(marks) != len(names):
        raise ParseError(f"部署小节里找到 {len(marks)} 个槽位定义，应有 {len(names)} 个")
    out, raw = {}, {}
    for idx, (pos, cn) in enumerate(marks):
        end = marks[idx + 1][0] if idx + 1 < len(marks) else len(body)
        # 只取同一行：最后一个槽位的段落会一直延伸到小节末尾，
        # 把后面的「部署在车位的子可以…易位」整句吞进去（曾经因此生成了非法 TOML）
        seg = body[pos + len(cn) + 1:end].split("\n")[0].strip().rstrip(",，").strip()
        raw[SLOT[cn]] = seg
        sqs: list[str] = []
        for tok in re.split(r"[,，和]", seg):
            tok = tok.strip()
            if not tok:
                continue
            if (r2 := re.fullmatch(r"([12])行", tok)):          # 「2行」= a2..h2
                sqs += [f"{f}{r2.group(1)}" for f in "abcdefgh"]
            elif (r3 := re.fullmatch(r"([a-h])-([a-h])([12])", tok)):   # 「b-c1」
                a, b, rk = r3.group(1), r3.group(2), r3.group(3)
                sqs += [f"{chr(c)}{rk}" for c in range(ord(a), ord(b) + 1)]
            elif re.fullmatch(r"[a-h][12]", tok):               # 「e1」
                sqs.append(tok)
            # 7、8 行是黑方的镜像，这里不收
        if not sqs:
            raise ParseError(f"{cn}: 推不出白方格子 —— {seg!r}")
        out[SLOT[cn]] = sorted(set(sqs))
    notes = [l.strip() for l in body.splitlines()
             if l.strip() and not re.search(r"(" + "|".join(names) + r")是", l)
             and not l.strip().startswith("有五种部署位置")]
    return out, raw, notes


# ---- 生成 TOML（手写：要保留注释和顺序，而 tomllib 只能读不能写） ----
def to_toml(pieces, deploy, deploy_raw, deploy_notes, tier_notes) -> str:
    def arr(xs):
        return "[" + ", ".join('"%s"' % x for x in xs) + "]"
    L = [
        "# 本文件由 lab/rulebook.py 从 rules/rulebook.md 生成，不要手改。",
        "# 改规则请改 Markdown，然后重跑：python lab/rulebook.py",
        "#",
        "# 只含「必须和规则书一致」的声明性字段。走法几何不在这里 ——",
        "# 恋的洪水填充、紫的边缘瞬移没法声明式表达，几何在 engine/geometry.ts，",
        "# 两边的键集合由构建步骤交叉检查，少一边就报错。",
        "#",
        "# cost  = 部署花费（规则，玩家可见，必须等于规则书）",
        "# value = 引擎估价，默认等于 cost，标定时独立变动 → engine/weights.json",
        "",
        "[meta]",
        "budget = 45",
        "bodies = 16",
    ]
    if deploy_notes:
        L.append("deploy_notes = [")
        for n in deploy_notes:
            L.append(f'  "{n}",')
        L.append("]")
    L += ["", "[slots]", "# 白方格子（黑方镜像）。行末注释是规则书原文。"]
    for k, v in deploy.items():
        L.append(f"{k} = {arr(v)}   # {deploy_raw[k]}")
    if tier_notes:
        L += ["", "[tier_notes]"]
        for t, note in tier_notes.items():
            L.append(f'"{t}" = "{note}"')
    L.append("")
    for p in pieces:
        L.append("[[piece]]")
        L.append(f'name = "{p["name"]}"')
        if p["en"]:
            L.append(f'en = "{p["en"]}"')
        L.append(f'tier = "{p["tier"]}"')
        L.append(f'cost = {p["cost"]:g}')
        L.append(f'slots = {arr(p["slots"])}')
        if p["files"]:
            L.append(f'files = {arr(p["files"])}')
        for k in ("max", "per_square_color", "max_pairs", "exactly"):
            if k in p["limits"]:
                L.append(f'{k} = {p["limits"][k]}')
        L.append('desc = "%s"' % p["desc"].replace('"', '\\"'))
        L.append("")
    return "\n".join(L) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="只比对，不写入；有差异退出码 1")
    a = ap.parse_args()
    md = MD.read_text(encoding="utf-8")
    try:
        pieces, tier_notes = parse(md)
        deploy, deploy_raw, deploy_notes = parse_deploy(md)
    except ParseError as e:
        print("解析失败，没有写出任何东西：", file=sys.stderr)
        print(e, file=sys.stderr)
        sys.exit(2)
    new = to_toml(pieces, deploy, deploy_raw, deploy_notes, tier_notes)
    try:                              # 生成的东西自己先解析一遍，不把坏文件写出去
        import tomllib
        tomllib.loads(new)
    except Exception as e:
        print("生成的 TOML 自检失败，没有写出任何东西：", file=sys.stderr)
        print(e, file=sys.stderr)
        sys.exit(3)
    old = TOML.read_text(encoding="utf-8") if TOML.exists() else ""
    if old == new:
        print(f"规则书与 pieces.toml 一致（{len(pieces)} 个棋子）")
        return
    diff = list(difflib.unified_diff(old.splitlines(True), new.splitlines(True),
                                     "pieces.toml (旧)", "pieces.toml (新)"))
    print("".join(diff) if diff else "(无文本差异)")
    if a.check:
        print(f"\n--check：有差异，{len(pieces)} 个棋子待写入", file=sys.stderr)
        sys.exit(1)
    TOML.write_text(new, encoding="utf-8")
    print(f"\n已写入 {TOML.relative_to(ROOT)}（{len(pieces)} 个棋子）")


if __name__ == "__main__":
    main()
