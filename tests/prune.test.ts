/* 候选收窄省多少、改变多少选择。
   两个问题分开：
     省多少   —— 同深度下带剪枝 / 不带剪枝的耗时与最终候选数（确定性）
     改多少   —— 两者选出的走法有多少比例不同（改变率）
   「值不值」要靠等时对局，不在这个脚本里 —— 搜索值本身没有可比性。 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {applyWeights} from '../engine/pieces.js';
import {buildState, mirrorSq} from '../engine/deploy.js';
import {legalMoves, applyMove, vanishPass, posKey, setPosHist, notate} from '../engine/rules.js';
import {idSearch, clearOrderTables} from '../engine/search.js';

const here = dirname(fileURLToPath(import.meta.url));
const gold = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8'));
applyWeights(JSON.parse(readFileSync(join(here, '../engine/weights.json'), 'utf8')));
const sqi = (s: string) => (8 - (+s[1])) * 8 + 'abcdefgh'.indexOf(s[0]);
const toMap = (o: any, b = false) => { const m = new Map<number, string>();
  for (const k in o) m.set(b ? mirrorSq(sqi(k)) : sqi(k), o[k]); return m; };

const CASES = ['香草开局','琪露诺贴敌阵','灵梦透明穿透','爱丽丝可打入','吃过路兵','八云紫车位h1'];
const DEPTH = +(process.argv[2] ?? 5);

const txt = (s: any, m: any) => { if (!m) return '—';
  const ns = applyMove(s, m), t = s; const nms = legalMoves(ns);
  return notate(t, m, ns, nms); };

console.log(`候选收窄  深度 ${DEPTH}\n`);
console.log('局面'.padEnd(15) + '不剪枝'.padStart(10) + '剪枝'.padStart(10)
  + '省'.padStart(8) + '候选'.padStart(9) + '  选手是否相同');
let t0 = 0, t1 = 0, same = 0, n = 0;
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
  const total = legalMoves(s).length;
  /* 同一个局面各跑一次。idSearch 内部有同分随机，所以选手可能因随机而不同；
     这里只报是否相同，不把它当成剪枝造成的差异的精确度量 */
  clearOrderTables();
  const a0 = performance.now(); const r0 = idSearch(s, DEPTH, {prune: 0}); const d0 = performance.now() - a0;
  clearOrderTables();
  const a1 = performance.now(); const r1 = idSearch(s, DEPTH, {prune: 1}); const d1 = performance.now() - a1;
  t0 += d0; t1 += d1; n++;
  const eq = r0.move && r1.move && r0.move.from === r1.move.from && r0.move.to === r1.move.to;
  if (eq) same++;
  console.log(name.padEnd(14) + `${d0.toFixed(0)}ms`.padStart(10) + `${d1.toFixed(0)}ms`.padStart(10)
    + `${(d0 / Math.max(d1, 1e-9)).toFixed(1)}×`.padStart(8)
    + `${r1.cand}/${total}`.padStart(9) + '   ' + (eq ? '相同' : `不同 ${txt(s, r0.move)} → ${txt(s, r1.move)}`));
}
console.log('\n合计'.padEnd(14) + `${t0.toFixed(0)}ms`.padStart(10) + `${t1.toFixed(0)}ms`.padStart(10)
  + `${(t0 / Math.max(t1, 1e-9)).toFixed(1)}×`.padStart(8));
console.log(`选手相同 ${same}/${n}`);
console.log('\n注意：选手不同不一定是剪枝造成的 —— idSearch 内部有同分随机。');
console.log('「值不值」只能靠等时对局判断，搜索值本身没有可比性。');
