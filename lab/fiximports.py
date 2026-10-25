#!/usr/bin/env python3
"""按「实际用到的标识符」重新生成 engine/*.ts 的 import 行。

手写 import 列表会漏，而漏一个就是运行时 ReferenceError。
这里逐行扫描导出声明 —— 不要用 DOTALL 的非贪婪匹配：
`export const X=...;   // 注释` 会让 `;\\s*$` 失配，然后跨行回溯把下一行的
导出吞掉。GOLD 就是这样从 import 里静默消失的。
"""
import pathlib, re, sys
E = pathlib.Path(__file__).resolve().parent.parent / 'engine'
ID = r'[A-Za-z_$][\w$]*'

def strip_comment(line: str) -> str:
    # 够用：这些文件里没有带 // 的字符串字面量
    i = line.find('//')
    return line[:i] if i >= 0 else line

def exported(f: str) -> set[str]:
    out: set[str] = set()
    for raw in (E / f).read_text(encoding='utf-8').splitlines():
        line = strip_comment(raw).rstrip()
        m = re.match(rf'^export\s+function\s+({ID})', line)
        if m:
            out.add(m.group(1)); continue
        m = re.match(r'^export\s+(?:const|let)\s+(.*)$', line)
        if not m:
            continue
        decl = m.group(1).rstrip(';')
        depth, cur, parts = 0, '', []
        for ch in decl:
            if ch in '([{': depth += 1
            elif ch in ')]}': depth -= 1
            if ch == ',' and depth == 0:
                parts.append(cur); cur = ''
            else:
                cur += ch
        parts.append(cur)
        for part in parts:
            n = part.split('=')[0].strip()
            if re.fullmatch(ID, n):
                out.add(n)
    return out

def used(f: str) -> set[str]:
    body = "\n".join(strip_comment(l) for l in
                     (E / f).read_text(encoding='utf-8').splitlines())
    body = re.sub(r'^import .*$', '', body, flags=re.M)
    return set(re.findall(rf'\b{ID}\b', body))

def fix(f: str, sources):
    p = E / f
    s = p.read_text(encoding='utf-8')
    # import 可能跨多行（import {a,\n        b} from '...';），所以要删到分号为止。
    # 只按行删会留下孤儿续行，而那是语法错误 —— 发生过一次。
    s = re.sub(r'^import\b[^;]*;[ \t]*\n', '', s, flags=re.M)
    own, u = exported(f), used(f)
    lines, taken = [], set()
    for names, mod in sources:
        need = sorted((names & u) - own - taken)
        if need:
            taken |= set(need)
            lines.append(f"import {{{','.join(need)}}} from '{mod}';")
    i = s.index('*/') + 2
    p.write_text(s[:i] + "\n" + "\n".join(lines) + "\n" + s[i:], encoding='utf-8')
    return lines

BOARD = exported('board.ts')
GEO   = exported('geometry.ts')
PIECES = {'P', 'RULES', 'WEIGHTS', 'applyWeights'}
RULESX = exported('rules.ts')
EVALX  = exported('eval.ts')
BOARD_NO_P = BOARD - {'P'}      # P 要从 pieces.js 取（cost/value 是那里盖上去的）

plan = [
    ('geometry.ts', [(BOARD, './board.js')]),                       # 这里的 P 就是注册表本身
    ('rules.ts',    [(PIECES, './pieces.js'), (BOARD_NO_P, './board.js'), (GEO, './geometry.js')]),
    ('deploy.ts',   [(PIECES, './pieces.js'), (BOARD_NO_P, './board.js')]),
    ('eval.ts',     [(PIECES, './pieces.js'), (BOARD_NO_P, './board.js'), (RULESX, './rules.js')]),
    ('search.ts',   [(PIECES, './pieces.js'), (BOARD_NO_P, './board.js'),
                     (RULESX, './rules.js'), (EVALX, './eval.js')]),
]
print(f"board 导出 {len(BOARD)} 个")
for f, src in plan:
    print(f"\n{f}")
    for l in fix(f, src):
        print("  " + l)
