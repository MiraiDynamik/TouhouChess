/* 对香草可用的「第一手漏洞」穷举。不下棋，一分钟出结果。
   每实装一个新棋子就跑一遍，确认它不开一手杀或白吃子。

     部署方 = 只有将军对象 + 被测子一枚，自己绝不挡自己 —— 这是上界
     对面   = 整副香草（7、8 两行）

   枚举部署方全部合法第一手，逐手判：一手杀 / 净赚（吃到的分 −
   落点被反吃时自己的分）。净赚按「落点在落子后是否被对方攻击」算，
   这是保守下界：真正的反吃还要对方愿意走，按被攻击就算亏损不会高估漏洞。

   限制：只覆盖「第一手成杀或第一手净赚」。叉子型（第二手兑现）不在表内 ——
   camel 那条 a2-b5 同时叉 a8 和 c8 就是 4 层扫描抓到的，不是第一手抓到的。

   连带的设计准则：香草底线只有 a8/h8 两格无保护，而部署制让远程跳跃子
   一步从第 2 行进第 5 行。所以**新加能放兵位的棋子，先问它一手能不能
   进第 5 行**。现有兵位棋子全部枚举过，都安全。

   跑法：npx tsx tests/firstmove.ts [净赚阈值，默认 2]
*/
import {readFileSync} from 'node:fs';
import {W, B} from '../engine/board.js';
import {P, applyWeights} from '../engine/pieces.js';
import {buildState, mirrorSq} from '../engine/deploy.js';
import {legalMoves, applyMove, vanishPass, inCheck, isAttacked} from '../engine/rules.js';

applyWeights(JSON.parse(readFileSync(new URL('../engine/weights.json', import.meta.url), 'utf8')));

const nm = (i: number) => 'abcdefgh'[i & 7] + (8 - (i >> 3));
const sqi = (s: string) => (8 - (+s[1])) * 8 + 'abcdefgh'.indexOf(s[0]);
const THRESH = +(process.argv[2] ?? 2);

const SLOTSQ: Record<string, string[]> = {
  k: ['e1'], q: ['d1'], r: ['a1', 'h1'], n: ['b1', 'c1', 'f1', 'g1'],
  p: ['a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2'],
};
const BACK = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
const vanB = () => { const d: Record<string, string> = {};
  'abcdefgh'.split('').forEach((f, i) => { d[f + '1'] = BACK[i]; d[f + '2'] = 'p'; });
  return d; };
const toMap = (o: Record<string, string>, black = false) => {
  const m = new Map<number, string>();
  for (const k in o) m.set(black ? mirrorSq(sqi(k)) : sqi(k), o[k]);
  return m;
};

type Hit = {piece: string; glyph: string; cost: number; slot: string;
            from: string; to: string; cap: string; mate: boolean; net: number};
const out: Hit[] = [];

for (const t in P) {
  const d: any = P[t];
  if (!d.slots?.length) continue;                       // 不可部署
  for (const sl of d.slots) {
    for (const sq of (SLOTSQ[sl] ?? [])) {
      if (d.files && d.files.indexOf('abcdefgh'.indexOf(sq[0])) < 0) continue;  // 限定列
      const w: Record<string, string> = {[sq]: t};
      if (!d.royal) {
        if (sq === 'e1') continue;                       // 被王占了
        w['e1'] = 'k';
      }
      let s: any;
      try { s = buildState(toMap(w), toMap(vanB(), true)); } catch { continue; }
      if (!s || s.turn !== W) continue;
      let ms: any[];
      try { ms = legalMoves(s); } catch { continue; }
      for (const m of ms) {
        if (m.drop) continue;                            // 只看盘上的子动
        if (s.b[m.from].t !== t) continue;               // 只看被测子自己动
        const cap = s.b[m.to];
        let n2: any;
        try { n2 = vanishPass(applyMove(s, m)); } catch { continue; }
        let mate = false;
        try { mate = !!inCheck(n2, B) && legalMoves(n2).length === 0; } catch {}
        const gain = cap ? P[cap.t].value : 0;
        let risk = 0;
        if (!mate) { try { if (isAttacked(n2, m.to, B)) risk = P[t].value; } catch {} }
        const net = gain - risk;
        if (mate || net >= THRESH) {
          out.push({piece: d.name, glyph: d.g, cost: d.cost, slot: sl,
                    from: sq, to: nm(m.to), cap: cap ? P[cap.t].name : '',
                    mate, net});
        }
      }
    }
  }
}

out.sort((a, b) => (+b.mate - +a.mate) || (b.net - a.net));
console.log(`对香草可用的第一手（部署方只留将军对象+被测子，上界）`);
console.log(`净赚阈值 ${THRESH}；共 ${out.length} 条\n`);
if (out.length) {
  console.log('棋子'.padEnd(12) + 'cost 位  走法'.padEnd(20) + '吃到'.padEnd(10) + '净赚  一手杀');
  for (const r of out) {
    console.log((r.glyph + r.piece).padEnd(11) + String(r.cost).padEnd(5) + r.slot + '  '
      + (r.from + (r.cap ? 'x' : '-') + r.to).padEnd(11) + (r.cap || '—').padEnd(10)
      + (r.mate ? '  —' : String(r.net).padStart(4)) + '   ' + (r.mate ? '是' : ''));
  }
} else {
  console.log('（没有）');
}
/* 已知结论：只有三条，全是八云紫。多出来的就是新实装的棋子带进来的漏洞。 */
const expected = 3;
if (out.length !== expected) {
  console.log(`\n注意：期望 ${expected} 条（全是八云紫），实际 ${out.length} 条。`);
  console.log('多出来的是新棋子带进来的 —— 看上面的表。');
}
