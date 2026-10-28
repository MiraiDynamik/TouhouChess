/* 树内部剪枝（LMR）省多少、以及同样时间能多搜几层。
   「同样时间多搜几层」才是真正要看的量 —— 省时间本身没有价值，
   省下来换成深度才有。 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {applyWeights} from '../engine/index.js';
import {buildState, mirrorSq} from '../engine/index.js';
import {legalMoves, applyMove, vanishPass, posKey, setPosHist} from '../engine/index.js';
import {negamax, clearOrderTables, PRUNE} from '../engine/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const gold = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8'));
applyWeights(JSON.parse(readFileSync(join(here, '../engine/weights.json'), 'utf8')));
const sqi = (s: string) => (8 - (+s[1])) * 8 + 'abcdefgh'.indexOf(s[0]);
const toMap = (o: any, b = false) => { const m = new Map<number, string>();
  for (const k in o) m.set(b ? mirrorSq(sqi(k)) : sqi(k), o[k]); return m; };
const build = (name: string) => {
  const c = gold.cases.find((x: any) => x.name === name);
  let s = buildState(toMap(c.def.w), toMap(c.def.b, true));
  for (const [a, b] of c.def.moves) {
    const ms = legalMoves(s);
    const m = ms.find((x: any) => x.from === sqi(a) && x.to === sqi(b));
    if (m) s = vanishPass(applyMove(s, m));
  }
  setPosHist([posKey(s)]);
  return s;
};
const CASES = ['香草开局','琪露诺贴敌阵','灵梦透明穿透','爱丽丝可打入','吃过路兵'];
const time = (s: any, d: number, inner: number) => {
  PRUNE.inner = inner; clearOrderTables();
  const t = performance.now(); const v = negamax(s, d, -Infinity, Infinity, 0);
  return {ms: performance.now() - t, v};
};

console.log('树内部剪枝（LMR）\n');
console.log('深度'.padEnd(6) + '精确'.padStart(11) + '剪枝'.padStart(11) + '省'.padStart(8)
  + '   值差（评估单位，正=剪枝更高）');
const tot: Record<number, [number, number]> = {};
for (const d of [3, 4, 5, 6]) {
  let a = 0, b = 0; const dv: number[] = [];
  for (const name of CASES) {
    const s = build(name);
    const r0 = time(s, d, 0), r1 = time(s, d, 1);
    a += r0.ms; b += r1.ms; dv.push(r1.v - r0.v);
  }
  tot[d] = [a, b];
  console.log(String(d).padEnd(6) + `${a.toFixed(0)}ms`.padStart(11) + `${b.toFixed(0)}ms`.padStart(11)
    + `${(a / Math.max(b, 1e-9)).toFixed(1)}×`.padStart(8) + '   [' + dv.join(', ') + ']');
}
PRUNE.inner = 0;
console.log('\n同样时间能多搜几层：');
for (const d of [3, 4, 5]) {
  const exact = tot[d][0];
  let reach = d;
  for (const dd of [d + 1, d + 2, d + 3]) if (tot[dd] && tot[dd][1] <= exact) reach = dd;
  console.log(`  精确深度 ${d} 的时间（${exact.toFixed(0)}ms）→ 剪枝能到深度 ${reach}`
    + (reach > d ? `  （+${reach - d} 层）` : '  （不够一层）'));
}
console.log('\n值差不为 0 是正常的：剪枝是启发式的，会漏掉东西。');
console.log('它换来的深度值不值，只能靠等时对局判断。');
