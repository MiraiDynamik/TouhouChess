#!/usr/bin/env python3
"""规则书 ↔ 实现 的比对。替掉旧的 checkbook.js。

和旧版的区别：旧版把规则书的内容**手抄**进脚本里再比对，结果我把
「部署在轻子位, 兵位」抄成「轻子位」，然后拿抄错的东西去"修"正确的代码。
这版两边都从文件读 —— 规则书读 rules/pieces.toml（由 Markdown 生成），
实现读 tests/golden.json（由引擎导出）—— 中间只有一张纯名字映射表。

检查三件事：
  1. 映射表双向完整：规则书每个名字都有键或在未实装名单里；映射里没有多余名字
  2. 已实装棋子的 cost 和部署位与规则书一致
  3. 数量限制（max / 每色格 / 对）一致

退出码 0 = 全部一致，1 = 有不一致。
"""
from __future__ import annotations
import tomllib, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SLOT_TO_KEY = {"king": "k", "queen": "q", "rook": "r", "minor": "n", "pawn": "p"}


def load_open():
    f = ROOT / "rules/open_questions.toml"
    if not f.exists():
        return {}
    d = tomllib.loads(f.read_text(encoding="utf-8"))
    return {(o["piece"], o["field"]): o for o in d.get("open", [])}


def load():
    book = tomllib.loads((ROOT / "rules/pieces.toml").read_text(encoding="utf-8"))
    km = tomllib.loads((ROOT / "rules/keymap.toml").read_text(encoding="utf-8"))
    gold = json.loads((ROOT / "tests/golden.json").read_text(encoding="utf-8"))
    key = dict(km["key"])
    unimp = set(key.pop("unimplemented", []))
    return book, key, unimp, gold["deploy"]


def main() -> int:
    book, key, unimp, impl = load()
    openq = load_open()
    names = {p["name"] for p in book["piece"]}
    problems: list[str] = []

    # 1. 映射双向完整
    miss = sorted(n for n in names if n not in key and n not in unimp)
    extra = sorted(n for n in key if n not in names)
    print(f"规则书 {len(names)} 个棋子；映射 {len(key)} 个；未实装 {len(unimp)} 个")
    if miss:
        problems.append(f"规则书里有、映射和未实装名单都没提到：{miss}")
    if extra:
        problems.append(f"映射里的名字规则书里没有：{extra}")
    # 实现里的键必须都被指到
    pointed = set(key.values())
    orphan = sorted(k for k in impl if k not in pointed)
    if orphan:
        problems.append(f"实现里有键但没有名字指向它：{orphan}")
    if not (miss or extra or orphan):
        print("  ✓ 映射双向完整")

    # 2/3. 逐条比对
    print(f"\n{'名':<12}{'键':<11}{'cost 书/码':<13}{'部署位 书':<20}{'部署位 码':<20}判定")
    bad = 0
    for p in sorted(book["piece"], key=lambda x: (x["cost"], x["name"])):
        n = p["name"]
        if n in unimp:
            continue
        k = key.get(n)
        if k is None or k not in impl:
            print(f"{n:<12}{str(k):<11}实现里找不到")
            bad += 1
            continue
        d = impl[k]
        bs = sorted(SLOT_TO_KEY[s] for s in p["slots"])
        cs = sorted(d["slots"])
        notes = []
        if abs(d["v"] - p["cost"]) > 1e-9:
            notes.append("cost 不一致")
        if bs != cs:
            notes.append("部署位不一致")
        # 数量限制
        want_max = p.get("max")
        if want_max != d.get("max"):
            notes.append(f"数量限制不一致（书 max={want_max} 码 max={d.get('max')}）")
        want_sqc = p.get("per_square_color")
        has_sqc = d.get("limit") == "sqcolor"
        if bool(want_sqc) != has_sqc:
            notes.append(f"每色格限制不一致（书 {want_sqc} 码 {d.get('limit')}）")
        bf = p.get("files")
        cf = d.get("files")
        cf_letters = sorted("abcdefgh"[i] for i in cf) if cf else None
        if (sorted(bf) if bf else None) != cf_letters:
            notes.append(f"列限制不一致（书 {bf} 码 {cf_letters}）")
        # 已知待决项：照样打印，但不算失败
        pending = [t for t in notes if (n, "max") in openq and "数量限制" in t]
        notes = [t for t in notes if t not in pending]
        if notes:
            bad += 1
        tag = "一致" if not notes and not pending else "；".join(notes + ["待决：" + t for t in pending])
        print(f"{n:<12}{k:<11}{p['cost']:g}/{d['v']:<11g}"
              f"{'/'.join(bs) or '不可部署':<20}{'/'.join(cs) or '不可部署':<20}{tag}")

    print(f"\n不一致 {bad} 处")
    if openq:
        print(f"待决 {len(openq)} 项（不计入失败）：")
        for (pn, fd), o in openq.items():
            print(f"  · {pn}.{fd}：书「{o['book']}」码「{o['impl']}」")
            print(f"    {o['question']}")
    for q in problems:
        print("  ✗ " + q)
    return 1 if (bad or problems) else 0


if __name__ == "__main__":
    sys.exit(main())
