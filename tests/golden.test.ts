/* 金标准测试：拆模块后的引擎必须和单文件版逐条一致。
   跑法：npx tsx tests/golden.test.ts

   比对四类（都是确定性的 —— 对局带随机，不能当金标准）：
     1. 每个局面的全部合法走法（排序后的记谱）
     2. 评估值 evalPos
     3. 定深搜索值 negamax（order 按 mscore 排序，确定）
     4. 25 个已实装棋子的 cost 与部署格集合

   这是重构的安全网。先有它再拆模块 —— 没有它的话回归是静默的，
   而这个项目已经被静默错误咬过两次。 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

import {W, B} from '../engine/index.js';
import {P, applyWeights} from '../engine/index.js';
import {buildState, mirrorSq} from '../engine/index.js';
import {legalMoves, applyMove, vanishPass, inCheck, notate,
        posKey, setPosHist} from '../engine/index.js';
import {evalPos} from '../engine/index.js';
import {negamax,PRUNE} from '../engine/index.js';
// Historical golden scores describe the non-selective search, not difficulty defaults.
PRUNE.inner=0;

const here = dirname(fileURLToPath(import.meta.url));
const gold = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8'));
const weights = JSON.parse(readFileSync(join(here, '../engine/weights.json'), 'utf8'));
applyWeights(weights);

const sqi = (s: string) => (8 - (+s[1])) * 8 + 'abcdefgh'.indexOf(s[0]);
/* 金标准里黑方也是用白方视角的格名写的（a1/a2…），所以要镜像。
   buildState 本身不镜像 —— 见 engine/deploy.ts 的约定说明。 */
const toMap = (o: Record<string, string>, black = false) => {
  const m = new Map<number, string>();
  for (const k in o) m.set(black ? mirrorSq(sqi(k)) : sqi(k), o[k]);
  return m;
};

let pass = 0, fail = 0;
const bad: string[] = [];
function eq(name: string, field: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  const trim = (x: string) => x.length > 180 ? x.slice(0, 180) + '…' : x;
  bad.push(`  ✗ ${name} / ${field}\n      得到 ${trim(g)}\n      应为 ${trim(w)}`);
}

/* ---- 局面 ---- */
for (const c of gold.cases) {
  if (c.error) continue;
  let s;
  try {
    s = buildState(toMap(c.def.w), toMap(c.def.b, true));
    for (const [a, b] of c.def.moves) {
      const from = sqi(a), to = sqi(b);
      const ms = legalMoves(s);
      const m = ms.find((x: any) => x.from === from && x.to === to && !x.drop && !x.promo)
             ?? ms.find((x: any) => x.from === from && x.to === to);
      if (!m) throw new Error(`走不了 ${a}-${b}`);
      s = vanishPass(applyMove(s, m));
    }
  } catch (e: any) {
    fail++; bad.push(`  ✗ ${c.name} / 建立局面抛错：${e.message}`); continue;
  }
  setPosHist([posKey(s)]);
  const ms = legalMoves(s);
  const notes = ms.map((m: any) => {
    const ns = applyMove(s, m);
    return notate(s, m, ns, legalMoves(ns));
  }).sort();

  eq(c.name, 'turn', s.turn, c.turn);
  eq(c.name, 'ammo', s.ammo, c.ammo);
  eq(c.name, 'posKey', posKey(s), c.key);
  eq(c.name, 'inCheck', {w: !!inCheck(s, W), b: !!inCheck(s, B)},
     {w: !!c.inCheck.w, b: !!c.inCheck.b});
  eq(c.name, '走法数', ms.length, c.moveCount);
  eq(c.name, '走法集', notes, c.moves);
  eq(c.name, 'eval', evalPos(s), c.eval);
  eq(c.name, 'negamax 深2', negamax(s, 2, -Infinity, Infinity, 0), c.nega2);
  eq(c.name, 'negamax 深3', negamax(s, 3, -Infinity, Infinity, 0), c.nega3);
}

/* ---- 棋子表 ---- */
const SLOTSQ: Record<string, string[]> = {
  k: ['e1'], q: ['d1'], r: ['a1', 'h1'], n: ['b1', 'c1', 'f1', 'g1'],
  p: ['a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2'],
};
for (const k in gold.deploy) {
  const want = gold.deploy[k], p: any = P[k];
  if (!p) { fail++; bad.push(`  ✗ 棋子 ${k} / 新引擎里不存在`); continue; }
  const sq: string[] = [];
  for (const sl of p.slots) for (const s of (SLOTSQ[sl] ?? [])) {
    if (p.files && p.files.indexOf('abcdefgh'.indexOf(s[0])) < 0) continue;
    sq.push(s);
  }
  eq(`棋子 ${k}`, 'value', p.value, want.v);
  eq(`棋子 ${k}`, 'cost', p.cost, want.v);      // 金标准里的 v 是旧的 cost
  eq(`棋子 ${k}`, '部署格', sq.sort(), want.squares);
  eq(`棋子 ${k}`, 'max', p.max ?? null, want.max);
  eq(`棋子 ${k}`, 'limit', p.limit ?? null, want.limit);
}

console.log(`金标准：通过 ${pass}  失败 ${fail}`);
if (bad.length) {
  console.log(bad.slice(0, 25).join('\n'));
  if (bad.length > 25) console.log(`  …还有 ${bad.length - 25} 条`);
}
process.exit(fail ? 1 : 0);
