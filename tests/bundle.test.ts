/* 和 golden.test.ts 同一套断言，但跑在 web/engine.mjs 这个构建产物上。
   产物能 import 不等于行为一致 —— 这个文件就是用来证明一致的。
   断言数必须和 golden.test.ts 完全相同。 */
import {readFileSync} from 'node:fs';
import {B,P,W,applyMove,applyWeights,buildState,evalPos,inCheck,legalMoves,mirrorSq,negamax,notate,posKey,setPosHist,vanishPass} from '../web/engine.mjs';

import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';


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
