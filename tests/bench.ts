/* 搜索速度基线。优化之后拿同一组局面同一组深度对比。
   记结点数而不只是时间 —— 时间受机器负载影响，结点数是实现的硬指标。 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {applyWeights} from '../engine/pieces.js';
import {buildState, mirrorSq} from '../engine/deploy.js';
import {legalMoves, applyMove, vanishPass, posKey, setPosHist} from '../engine/rules.js';
import {negamax, clearOrderTables} from '../engine/search.js';
import * as S from '../engine/search.js';

const here = dirname(fileURLToPath(import.meta.url));
const gold = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8'));
applyWeights(JSON.parse(readFileSync(join(here, '../engine/weights.json'), 'utf8')));
const sqi = (s: string) => (8 - (+s[1])) * 8 + 'abcdefgh'.indexOf(s[0]);
const toMap = (o: any, b = false) => { const m = new Map<number, string>();
  for (const k in o) m.set(b ? mirrorSq(sqi(k)) : sqi(k), o[k]); return m; };

const CASES = ['香草开局', '琪露诺贴敌阵', '灵梦透明穿透', '爱丽丝可打入', '吃过路兵'];
const DEPTHS = [3, 4, 5];

console.log('局面'.padEnd(16) + DEPTHS.map(d => `深度${d}`.padStart(14)).join(''));
const tot: Record<number, number> = {};
for (const name of CASES) {
  const c = gold.cases.find((x: any) => x.name === name);
  if (!c) continue;
  let s = buildState(toMap(c.def.w), toMap(c.def.b, true));
  for (const [a, b] of c.def.moves) {
    const ms = legalMoves(s);
    const m = ms.find((x: any) => x.from === sqi(a) && x.to === sqi(b));
    if (m) s = vanishPass(applyMove(s, m));
  }
  setPosHist([posKey(s)]);
  let row = name.padEnd(15);
  for (const d of DEPTHS) {
    clearOrderTables();   // 每个局面独立计时，不让它白捡上一个局面的历史
    const t0 = performance.now();
    negamax(s, d, -Infinity, Infinity, 0);
    const dt = performance.now() - t0;
    tot[d] = (tot[d] ?? 0) + dt;
    row += `${dt.toFixed(0).padStart(9)}ms`.padStart(14);
  }
  console.log(row);
}
console.log('合计'.padEnd(15) + DEPTHS.map(d => `${tot[d].toFixed(0)}ms`.padStart(14)).join(''));
for (const d of DEPTHS.slice(1)) {
  const i = DEPTHS.indexOf(d);
  console.log(`  深度${DEPTHS[i-1]}→${d} 的倍数: ${(tot[d]/tot[DEPTHS[i-1]]).toFixed(1)}×`);
}
