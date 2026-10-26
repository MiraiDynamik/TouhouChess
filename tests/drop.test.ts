/* 引擎到底会不会打入人偶？
   单文件版的旧评估给弹药记 80/分，于是打入一个人偶净赚只有 +10 单位（0.1 分），
   比任何位置项都小，贤者 60 手一个不打 —— 那时候测「留几个人偶最优」
   一定测出「留 0 个」，而那是引擎缺陷不是答案。
   Mirai 定的原则：弹药本身没有价值，打入之后才有。所以评估里弹药记 0，
   打入 = 花掉零价值的东西换来 0.5 分的子 = 净 +0.5 分。
   这个测试就是守住这条。 */
import {readFileSync} from 'node:fs';
import {W} from '../engine/board.js';
import {P, applyWeights} from '../engine/pieces.js';
import {buildState, mirrorSq} from '../engine/deploy.js';
import {legalMoves, applyMove, vanishPass, outcome, posKey,
        setPosHist, pushPos} from '../engine/rules.js';
import {evalPos} from '../engine/eval.js';
import {lunaticMove} from '../engine/search.js';

applyWeights(JSON.parse(readFileSync(new URL('../engine/weights.json', import.meta.url), 'utf8')));
const sqi = (s: string) => (8 - (+s[1])) * 8 + 'abcdefgh'.indexOf(s[0]);
const BACK = ['r','n','b','q','k','b','n','r'];
const van = () => { const d: any = {}; 'abcdefgh'.split('').forEach((f,i)=>{d[f+'1']=BACK[i];d[f+'2']='p';}); return d; };
const toMap = (o: any, black=false) => { const m=new Map<number,string>();
  for (const k in o) m.set(black?mirrorSq(sqi(k)):sqi(k), o[k]); return m; };

/* 白方：f2 换爱丽丝，拿掉 a2/h2 两兵 → 弹药 2.5 分 = 5 个人偶 */
const w = van(); w.f2='alice'; delete w.a2; delete w.h2;
let s = buildState(toMap(w), toMap(van(), true));
setPosHist([posKey(s)]);

console.log(`开局 白弹药 ${s.ammo.w} 分（= ${s.ammo.w/0.5} 个人偶）`);
/* 评估里弹药必须不记分：同一局面，弹药多的一方不该因此得分 */
const w2 = van(); w2.f2='alice';
const s2 = buildState(toMap(w2), toMap(van(), true));
console.log(`弹药 2.5 的局面 eval = ${evalPos(s)}`);
console.log(`弹药 0.5 的局面 eval = ${evalPos(s2)}  ← 差额只该来自少掉的两个兵，不来自弹药`);

let drops = 0, promos = 0;
for (let ply = 0; ply < 40; ply++) {
  const ms = legalMoves(s);
  if (!ms.length) break;
  const m: any = lunaticMove(s, 0);
  if (!m) break;
  if (m.drop) { drops++;
    console.log(`  第${ply+1}手 打入${P[m.drop].name} → 余弹药 ${(s.ammo[s.turn]-(m.cost??0)).toFixed(1)}`); }
  if (m.promo === 'shanghai') { promos++; console.log(`  第${ply+1}手 人偶升变上海人偶`); }
  s = vanishPass(applyMove(s, m));
  pushPos(posKey(s));
  if (outcome(s, legalMoves(s)).over) break;
}
let onBoard = 0;
for (let i = 0; i < 64; i++) if (s.b[i]?.t === 'doll') onBoard++;
console.log(`\n40 手内：打入 ${drops} 次，升变 ${promos} 次，场上人偶 ${onBoard}，余弹药 ${s.ammo.w}`);
if (drops === 0) { console.log('✗ 引擎一个人偶都不打 —— 「留几个最优」没法测'); process.exit(1); }
console.log('✓ 引擎会使用人偶');
