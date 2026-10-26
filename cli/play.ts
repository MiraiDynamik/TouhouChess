/* 批量对局 CLI。设计上保持笨：只按规格打完、吐 JSONL，
   阵容生成、参数搜索、统计全在 lab/*.py —— Mirai 跑的那一层。

   用法：
     npx tsx cli/play.ts spec.json  > out.jsonl
     cat spec.json | npx tsx cli/play.ts - > out.jsonl

   规格（白方视角的格名；黑方自动镜像）：
   {
     "white": {"a1":"r","b1":"n",...},
     "black": {...},
     "games": 100,
     "level": "lunatic",        // easy | normal | hard | lunatic
                                //   旧名 sage/youkai/human/baka 仍可用（见 LEVEL_ALIAS）
     "depthBonus": 0,           // 额外深度（叠加在 depthFor 的少子加深之上）
     "prune": 0,                // 树内部前向剪枝（futility + LMR）。
                                //   深度5 省 7 倍、深度6 省 13 倍，且测过的局面上
                                //   搜索值未变。开了之后可以用更深的 fixedDepth。
     "pruneA": null,            // 只给被测方开/关（等时对局用），null = 跟随 prune
     "fixedDepthA": null,       // 只给被测方用这个深度（等时对局用）
     "fixedDepth": 0,           // >0 则忽略少子加深，各阶段都用这个深度。
                                //   测量仪器应当各阶段一致：少子加深让分辨率
                                //   随局面阶段变化，而残局收不掉有封盘裁定兜着。
                                //   depthBonus 1 实际是 4/5/6（按阶段），
                                //   深度6 约是深度4 的 25 倍 —— 成本极难预估。
     "maxPly": 160,
     "adjudicate": 2,           // 到 maxPly 时按子力差裁定，领先这么多分判胜
     "openRandom": {"plies":4,"margin":30,"topk":3},   // 开局随机化，只为让各局不同
     "seed": 12345,
     "swapColors": true,        // 奇数局把白黑对调，消掉先手优势
     "weights": { ... },        // 覆盖 engine/weights.json
     "weightsA": { ... },       // 被测方（side）的权重；给了就按行棋方逐手切换
     "weightsB": { ... }        // 对手的权重。两者都给 = A/B 两套评估对打
   }

   每局输出一行：
   {"i":0,"side":"w","result":"w","code":"mates","plies":87,
    "matFirst":2,"matLast":-5,"ammo":[2,2],"open8":"e2e4 e7e5 ..."}
   open8 = 前 8 手，用来判断 n 局是不是真的 n 局：开局剪得狠之后引擎
   更确定，同一阵容的多局可能走出几乎相同的棋，那时置信区间是假的。
   result 是「被测方(side)」的视角：w=被测方赢。 */
import {readFileSync} from 'node:fs';
import {W, B} from '../engine/board.js';
import {P, applyWeights} from '../engine/pieces.js';
import {buildState, mirrorSq} from '../engine/deploy.js';
import {legalMoves, applyMove, vanishPass, inCheck, outcome,
        posKey, setPosHist, pushPos} from '../engine/rules.js';
import {negamax, pickMove, lunaticMove, lunaticMoveAt, LEVELS, depthFor, kid,
        PRUNE, resolveLevel} from '../engine/search.js';

const arg = process.argv[2];
if (!arg) { console.error('用法: tsx cli/play.ts <spec.json | ->'); process.exit(2); }
const spec = JSON.parse(arg === '-' ? readFileSync(0, 'utf8') : readFileSync(arg, 'utf8'));

const base = JSON.parse(readFileSync(new URL('../engine/weights.json', import.meta.url), 'utf8'));
const merge = (o: any) => ({...base, ...(spec.weights ?? {}),
  ...(o ?? {}), value: {...(base.value ?? {}), ...(spec.weights?.value ?? {}), ...(o?.value ?? {})}});
const WA = merge(spec.weightsA), WB = merge(spec.weightsB);
const twoSided = !!(spec.weightsA || spec.weightsB);
applyWeights(WA);

/* 双方用不同评估时，按行棋方逐手切换权重。
   这样每一方搜索整棵树都用自己那套评估 —— 和两个真实引擎对打一致，
   不是「一棵树里混用两套评估」。切换只是重写 25 个 value 字段，开销可忽略。 */
let curSide: string | null = null;
function useWeightsFor(side: string, testSide: string) {
  if (!twoSided) return;
  const want = side === testSide ? 'A' : 'B';
  if (curSide === want) return;
  applyWeights(want === 'A' ? WA : WB);
  curSide = want;
}

const sqi = (s: string) => (8 - (+s[1])) * 8 + 'abcdefgh'.indexOf(s[0]);
const toMap = (o: Record<string, string>, black: boolean) => {
  const m = new Map<number, string>();
  for (const k in o) m.set(black ? mirrorSq(sqi(k)) : sqi(k), o[k]);
  return m;
};

/* 可复现的随机数 —— Math.random 不能喂种子，而研究要能复跑 */
function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}

const matDiff = (s: any) => {
  let v = 0;
  for (let i = 0; i < 64; i++) {
    const p = s.b[i];
    if (!p || P[p.t].royal) continue;
    v += (p.c === W ? 1 : -1) * P[p.t].value;
  }
  return v;
};

const LV = resolveLevel(spec.level ?? 'lunatic');
const DB = spec.depthBonus ?? 0;
const FD = spec.fixedDepth ?? 0;
const BASE_PRUNE = spec.prune === undefined ? PRUNE.inner : (spec.prune ? 1 : 0);
PRUNE.inner = BASE_PRUNE;
/* 等时对局：被测方可以用不同的剪枝/深度，按行棋方逐手切换 */
const PA = (spec.pruneA === null || spec.pruneA === undefined) ? null : (spec.pruneA ? 1 : 0);
const FDA = spec.fixedDepthA ?? null;
const MAXPLY = spec.maxPly ?? 160;
const ADJ = spec.adjudicate ?? 2;
const OR = spec.openRandom ?? {plies: 4, margin: 30, topk: 3};
const rand = rng(spec.seed ?? 1);

/* 开局随机化：只为让 n 局不是同一局。松动开得很小，
   否则随机化本身送掉的子力会盖住要测的信号。 */
function spread(s: any, margin: number, topk: number) {
  const ms = legalMoves(s);
  if (!ms.length) return [];
  const sc = ms.map((m: any) => ({m, v: -negamax(kid(m), 1, -1e9, 1e9, 1)}));
  sc.sort((a, b) => b.v - a.v);
  const best = sc[0].v;
  return sc.filter((x, i) => i < topk && x.v >= best - margin).map(x => x.m);
}

function move(s: any, testSide?: string) {
  const mine = testSide && s.turn === testSide;
  if (PA !== null) PRUNE.inner = mine ? PA : BASE_PRUNE;
  const fd = (FDA !== null && mine) ? FDA : FD;
  if (LV === 'lunatic') {
    if (fd) return lunaticMoveAt(s, fd);
    return lunaticMove(s, DB);
  }
  const lv = LEVELS[LV];
  if (!lv) throw new Error('未知级别 ' + LV);
  return pickMove(s, (FD ? FD : depthFor(lv, s) + DB), lv.selection, lv.preferCheck);
}

const sqName = (i: number) => 'abcdefgh'[i & 7] + (8 - (i >> 3));
function game(wDep: Map<number, string>, bDep: Map<number, string>, testSide: string) {
  let s = buildState(wDep, bDep);
  setPosHist([posKey(s)]);
  const mat0 = matDiff(s);
  const ammo0 = [s.ammo.w, s.ammo.b];
  const open: string[] = [];
  for (let ply = 0; ply < MAXPLY; ply++) {
    const ms = legalMoves(s);
    if (!ms.length) {
      const c = inCheck(s, s.turn);
      return {result: c ? (s.turn === W ? B : W) : 'd',
              code: c ? 'mates' : 'stalemate', plies: ply,
              mat0, mat1: matDiff(s), ammo0, open8: open.join(' ')};
    }
    useWeightsFor(s.turn, testSide);
    const c = ply < OR.plies ? spread(s, OR.margin, OR.topk) : null;
    const m = (c && c.length) ? c[Math.floor(rand() * c.length)] : move(s, testSide);
    if (!m) return {result: 'd', code: 'nomove', plies: ply, mat0, mat1: matDiff(s), ammo0,
                    open8: open.join(' ')};
    if (open.length < 8) open.push(sqName(m.from) + sqName(m.to));
    s = vanishPass(applyMove(s, m));
    pushPos(posKey(s));
    const o = outcome(s, legalMoves(s));
    if (o.over) {
      return {result: o.winner ?? 'd', code: o.code, plies: ply + 1,
              mat0, mat1: matDiff(s), ammo0, open8: open.join(' ')};
    }
  }
  /* 到手数上限：按子力差裁定。否则「赢定但没赢完」会被当成和棋算进噪声 */
  const md = matDiff(s);
  return {result: md >= ADJ ? W : md <= -ADJ ? B : 'd', code: 'adjudicated',
          plies: MAXPLY, mat0, mat1: md, ammo0, open8: open.join(' ')};
}

const wm = toMap(spec.white, false), bm = toMap(spec.black, true);
const wmB = toMap(spec.white, true), bmW = toMap(spec.black, false);
const N = spec.games ?? 1;
for (let i = 0; i < N; i++) {
  /* 奇数局对调颜色：被测阵容执黑，消掉先手优势 */
  const side = (spec.swapColors !== false && i % 2) ? B : W;
  curSide = null;
  const r = side === W ? game(wm, bm, W) : game(bmW, wmB, B);
  const sc = r.result === side ? 1 : (r.result === 'd' ? 0.5 : 0);
  process.stdout.write(JSON.stringify({
    i, side, result: r.result, score: sc, code: r.code, plies: r.plies,
    matFirst: r.mat0, matLast: r.mat1, ammo: r.ammo0, open8: r.open8,
  }) + '\n');
}
