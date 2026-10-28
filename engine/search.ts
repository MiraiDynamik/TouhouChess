import {compactKind, compactMove, compactFrom, compactTo, compactPromo, compactDrop, compactCastle, compactEpc, compactChildren, compactOrder} from './representation.js';
/* 搜索。从单文件版抽取，砍掉了界面胶水（botMaybe 那一段属于 web/）。

   srchEnd 是搜索时限：界面线程里跑的分析搜索必须能被打断，
   否则深一层就会把页面冻住。srchEnd=0 表示不限时（批量测试走这条）。 */
import { P, WEIGHTS } from './pieces.js';
import { applyMove, hasLegal, inCheck, legalMoves, posHist, posKey, pseudoAll, pseudoCaptures, withRuleCache, tryMove, vanishPass } from './rules.js';
import { MATE, OPT, evalPos } from './eval.js';
import { TT, newTranspositionSearch, ttPositionKey, probeTransposition, storeTransposition, scoreFromTT, matchesMove, transpositionIndex, countTTCutoff, transpositionStats } from './transposition.js';
export { TT, clearTranspositionTable, transpositionStats } from './transposition.js';
let cacheContext = null;
let lastCacheHistory = '', cacheHistoryVersion = 0;
/** Scope cache use so raw negamax remains a useful uncached reference.
 * Evaluator/weights/pruning changes invalidate scores and move ordering together.
 * Root-relative repetition logic affects plies 0..2 only. Those entries carry
 * both ply and the exact history set; deeper nodes can safely survive new turns.
 */
export function withSearchCache(run, { hist = [], enabled = TT.enabled, newSearch = true } = {}) {
    const saved = cacheContext;
    if (enabled) {
        if (newSearch)
            newTranspositionSearch(JSON.stringify([OPT, WEIGHTS, PRUNE,
                Object.entries(P).map(([t, p]) => [t, p.value, p.cost])]));
        const history = JSON.stringify([...new Set(hist)].sort());
        // Compare the full history once, then use a collision-free session token.
        // Do not duplicate a potentially long game history into every shallow key.
        if (history !== lastCacheHistory) {
            lastCacheHistory = history;
            cacheHistoryVersion++;
        }
        cacheContext = { history: cacheHistoryVersion };
    }
    else
        cacheContext = null;
    try {
        return withRuleCache(run);
    }
    finally {
        cacheContext = saved;
    }
}
const cacheKey = (s, ply) => ttPositionKey(s) + (ply <= 2 ? '|root:' + ply + '|hist:' + cacheContext.history : '|deep');
/* ---- 走法排序：杀手走法 + 历史启发 ----
   这两样只改枚举顺序，不改搜索的返回值 —— 全窗口的 alpha-beta 根值
   与枚举顺序无关。所以 tests/golden.test.ts 的 280 项必须一字不变，
   变了就是实现错了。这是个很硬的判据，所以先做这一批，
   置换表独立管理搜索结果；原始 negamax 可作为无缓存的回归参照。 */
const KMAX = 64; // 最大 ply
const K1 = new Int32Array(KMAX), K2 = new Int32Array(KMAX); // 每层两个杀手
const HIST = new Int32Array(64 * 64);
/* 走法签名：同一层里区分「同一个起终点的不同升变/打入」没必要，
   排序只需要粗粒度相同即可 */
const sig = m => (compactFrom(m) << 6) | compactTo(m);
export function clearOrderTables() {
    K1.fill(0);
    K2.fill(0);
    HIST.fill(0);
}
/* 吃子/升变/打入用静态分值；安静走法用杀手和历史。
   分层：吃子 >= 1000 > 杀手 900/850 > 历史 < 800，所以吃子永远先试。 */
export function mscore(s, m, ply = 0) {
    const vic = s.b[compactTo(m)];
    let v = 0;
    if (vic)
        v += 1000 + compactKind(vic).value * 10 - compactKind(s.b[compactFrom(m)]).value;
    if (compactPromo(m))
        v += 500;
    if (compactDrop(m))
        v += P[compactDrop(m)].value * 10; // 打入是净得子，排序别把它压到最后
    if (!vic && !compactPromo(m) && !compactDrop(m)) {
        const g = sig(m);
        if (ply < KMAX && K1[ply] === g)
            v += 900;
        else if (ply < KMAX && K2[ply] === g)
            v += 850;
        else {
            const h = HIST[g];
            v += h > 799 ? 799 : h;
        } // 历史不许越过杀手
    }
    return v;
}
export function order(s, ms, ply = 0) {
    return compactOrder(s, ms, ply, mscore);
}
/* beta 截断时记下这个安静走法：同一层下次先试它 */
function onCut(s, m, d, ply) {
    if (s.b[compactTo(m)] || compactPromo(m) || compactDrop(m))
        return; // 吃子已经排在最前，不用记
    const g = sig(m);
    if (ply < KMAX && K1[ply] !== g) {
        K2[ply] = K1[ply];
        K1[ply] = g;
    }
    HIST[g] += d * d; // 深层的截断更有信息量
}
export const kid = (m, s) => vanishPass(compactChildren.get(s).get(m));
export function qsearch(s, alpha, beta, ply, rootPly = 0) {
    checkDeadline();
    const checked = inCheck(s, s.turn);
    // Standing pat is only legal outside check. Evasions may be quiet moves.
    let best = checked ? -Infinity : evalPos(s);
    if (!checked) {
        if (ply > 6 || best >= beta)
            return best;
        if (best > alpha)
            alpha = best;
    }
    const ms = order(s, checked ? pseudoAll(s) : pseudoCaptures(s));
    let any = false;
    for (const m of ms) {
        const ns = tryMove(s, m);
        if (!ns)
            continue;
        any = true;
        // Bound checking sequences without treating checkmate as a static score.
        if (ply >= 64)
            return 0;
        const sc = -qsearch(vanishPass(ns), -beta, -alpha, ply + 1, rootPly);
        if (sc > best)
            best = sc;
        if (best > alpha)
            alpha = best;
        if (alpha >= beta)
            break;
    }
    return checked && !any ? -(MATE - rootPly - ply) : best;
}
export let srchRep = null;
/* 搜索时限。evalPanel 这种在界面线程里跑的搜索必须能被打断：
   每 256 个搜索/静态搜索结点查一次钟，超时就抛 EVABORT，调用方丢弃这次的部分结果。
   srchEnd=0 表示不限时（固定深度离线测试使用）。 */
export let srchEnd = 0, srchNodes = 0;
export const EVABORT = { abort: 1 };
/** Mutable module bindings must be changed here, never on a bundled export copy. */
export function setSearchState({ end = 0, rep = null, nodes = 0 } = {}) {
    srchEnd = end;
    srchRep = rep;
    srchNodes = nodes;
}
export function clearSearchDeadline() { srchEnd = 0; }
function checkDeadline(force = false) {
    if (srchEnd && (force || !(++srchNodes & 255)) && performance.now() >= srchEnd)
        throw EVABORT;
}
export function negamax(s, d, alpha, beta, ply) {
    checkDeadline();
    if (ply && ply <= 2 && srchRep && srchRep.has(posKey(s)))
        return 0; /* 踩回已出现过的局面当和棋算 */
    const originalAlpha = alpha, key = cacheContext ? cacheKey(s, ply) + (d > 0 ? '' : '|qroot') : null;
    const slot = key ? transpositionIndex(key) : 0;
    const cached = key ? probeTransposition(key, slot) : null;
    // Main-search scores may satisfy shallower requests by default. Exact-depth
    // remains available for reference tests; qsearch keeps its own namespace.
    if (cached && (cached.depth === d || PRUNE.ttDeep && d > 0 && cached.depth > d)) {
        const value = scoreFromTT(cached.value, ply);
        if (cached.bound === 'exact' || cached.bound === 'lower' && value >= beta || cached.bound === 'upper' && value <= alpha) {
            countTTCutoff();
            return value;
        }
    }
    if (!(d > 0)) {
        // Cache only a fresh qsearch root, never a partially consumed qsearch horizon.
        const value = !hasLegal(s) ? (inCheck(s, s.turn) ? -(MATE - ply) : 0) : qsearch(s, alpha, beta, 0, ply);
        if (key)
            storeTransposition(key, d, value, value <= originalAlpha ? 'upper' : value >= beta ? 'lower' : 'exact', null, ply, slot);
        return value;
    }
    const ms = pseudoAll(s);
    order(s, ms, ply);
    if (cached?.move) {
        const i = ms.findIndex(m => matchesMove(m, cached.move));
        if (i > 0)
            ms.unshift(...ms.splice(i, 1));
    }
    let best = -Infinity, bestMove = null, any = false, tried = 0;
    const pr = PRUNE.inner;
    /* 被将军时一律不剪：那时候每一手都可能是唯一解 */
    const chk = pr ? !!inCheck(s, s.turn) : false;
    /* 阶段：开局剪得狠，中局残局手松。用场上非王子力判断 */
    let lAfter = PRUNE.lmrAfter;
    if (pr) {
        let mat = 0;
        for (let i = 0; i < 64; i++) {
            const q = s.b[i];
            if (q && !compactKind(q).royal)
                mat += compactKind(q).value;
        }
        if (mat >= PRUNE.openMaterial)
            lAfter = PRUNE.openLmrAfter;
    }
    for (const m of ms) {
        const ns = tryMove(s, m);
        if (!ns)
            continue; // 非法，跳过
        any = true;
        tried++;
        const quiet = !s.b[compactTo(m)] && !compactPromo(m) && !compactDrop(m) && !compactEpc(m);
        /* LMR：排序靠后的安静走法先用削减深度看一眼，高于 alpha 才全深度重搜 */
        let red = 0;
        if (pr && quiet && !chk && d >= PRUNE.lmrMinDepth && tried > lAfter)
            red = tried > lAfter * 2 ? 2 : 1;
        if (red >= d)
            red = d - 1;
        const child = vanishPass(ns);
        let sc = -negamax(child, d - 1 - red, -beta, -alpha, ply + 1);
        if (red && sc > alpha)
            sc = -negamax(child, d - 1, -beta, -alpha, ply + 1);
        if (sc > best) {
            best = sc;
            bestMove = m;
        }
        if (best > alpha)
            alpha = best;
        if (alpha >= beta) {
            onCut(s, m, d, ply);
            break;
        }
    }
    if (!any)
        best = inCheck(s, s.turn) ? -(MATE - ply) : 0;
    if (best === -Infinity)
        return alpha; // No completed score: don't cache it.
    if (key)
        storeTransposition(key, d, best, best <= originalAlpha ? 'upper' : best >= beta ? 'lower' : 'exact', bestMove, ply, slot);
    return best;
}
/* 四档互斥策略概率（每手只抽一次），评分 100 = 一个兵。
   lossBand: 相对最优损失 100–300；suboptimal: 排除第一名、距第二名不超过 100。
   难度键与界面角色名无关。 */
export const LEVELS = {
    easy: { d: 3, timeMs: 475, preferCheck: true, selection: { random: .10, lossBand: .60, suboptimal: .20, best: .10 } },
    normal: { d: 4, timeMs: 950, selection: { random: .02, lossBand: .08, suboptimal: .40, best: .50 } },
    hard: { d: 5, timeMs: 1900, deepen: 1, timeOnlyAtPieces: 18, selection: { random: 0, lossBand: .01, suboptimal: .20, best: .79 } },
    // Lunatic 使用通用评估，不含手写开局原则项。
    lunatic: { d: 4, timeMs: 2850, timeOnly: 1, deepen: 1, plain: 1,
        selection: { random: 0, lossBand: 0, suboptimal: 0, best: 1 } }
};
/** 一次抽签，四个概率都是无条件概率。纯最优不消耗随机数。 */
export function drawMoveStrategy(selection = LEVELS.lunatic.selection) {
    const modes = ['random', 'lossBand', 'suboptimal', 'best'];
    const weights = modes.map(k => selection[k]);
    if (weights.some(w => !Number.isFinite(w) || w < 0) || Math.abs(weights.reduce((a, b) => a + b, 0) - 1) > 1e-9)
        throw new Error('Move selection probabilities must sum to 1');
    if (selection.best === 1)
        return 'best';
    const roll = Math.random();
    let cumulative = 0;
    for (let i = 0; i < modes.length; i++) {
        cumulative += weights[i];
        if (roll < cumulative)
            return modes[i];
    }
    return 'best';
}
/** ranked 必须来自同一完整深度、全窗口评分，且按分数降序排列。 */
export function chooseRankedMove(ranked, strategy, preferCheck = false) {
    if (!ranked.length)
        return null;
    if ((strategy === 'best' && !preferCheck) || ranked.length === 1)
        return ranked[0];
    let pool;
    if (strategy === 'best') {
        pool = ranked.filter(x => x.v === ranked[0].v);
    }
    else if (strategy === 'suboptimal') {
        pool = ranked.slice(1).filter(x => x.v >= ranked[1].v - 100);
    }
    else if (strategy === 'lossBand') {
        const loss = x => ranked[0].v - x.v;
        const distance = x => Math.max(100 - loss(x), loss(x) - 300, 0);
        const nearest = Math.min(...ranked.map(distance));
        // 有区间内走法时 distance=0；否则选最近的，允许回退到最优。
        pool = ranked.filter(x => distance(x) === nearest);
    }
    else
        throw new Error('Unknown ranked move strategy: ' + strategy);
    return chooseFromMovePool(pool, preferCheck);
}
/** Filter only inside the selected pool; check the real post-move variant position. */
export function chooseFromMovePool(pool, preferCheck = false) {
    if (!pool.length)
        return null;
    if (preferCheck) {
        const checks = pool.filter(x => { const ns = vanishPass(x.n); return inCheck(ns, ns.turn); });
        if (checks.length)
            pool = checks;
    }
    return pool[Math.floor(Math.random() * pool.length)];
}
/* 开发者级的唯一入口。研究脚本只调这个，不自己去动 OPT —— 忘记关是个静默错误 */
/* 固定深度的开发者级。测量用：各阶段同一个深度，成本可预估。
   lunaticMove 走 depthFor，会按子数加深（4/5/6），深度6 约是深度4 的 25 倍。 */
/* 旧名别名 —— 研究脚本里散落着 level='human' 之类，不该因为改名而断 */
// 仅在输入边界兼容历史实验规格；内部配置只有四档。
export const LEVEL_ALIAS = { cirno: "easy", baka: "easy", rinnosuke: "normal", human: "normal", patchouli: "hard", youkai: "hard", dev: "lunatic", eirin: "lunatic", sage: "lunatic" };
export const resolveLevel = k => LEVEL_ALIAS[k] || k;
export function lunaticMoveAt(s, depth) {
    const save = OPT.open;
    OPT.open = 0;
    try {
        return pickMove(s, depth);
    }
    finally {
        OPT.open = save;
    }
}
export function lunaticMove(s, extraDepth) {
    const save = OPT.open;
    OPT.open = 0;
    try {
        return pickMove(s, depthFor(LEVELS.lunatic, s) + (extraDepth || 0));
    }
    finally {
        OPT.open = save;
    }
}
/* 固定深度入口按少子局面加深；交互永琳使用 timedMove 的时间预算，无固定深度上限。 */
export function depthFor(lv, s) {
    if (!lv.deepen)
        return lv.d;
    let n = 0;
    for (let i = 0; i < 64; i++)
        if (s.b[i])
            n++;
    return lv.d + (n <= 7 ? 2 : n <= 18 ? 1 : 0);
}
/** Only timed searches may have no depth cap; offline fixed-depth callers stay bounded. */
export function timedDepthFor(lv, s) {
    if (lv.timeOnly)
        return Infinity;
    if (lv.timeOnlyAtPieces !== undefined && s.b.filter(Boolean).length <= lv.timeOnlyAtPieces)
        return Infinity;
    return depthFor(lv, s);
}
/* 根节点逐手全窗口打分并降序排列。不能用 alpha-beta：
   被剪枝的走法拿到的是界限不是真值，排名不可信 */
export function rankMoves(s, d) {
    const ms = legalMoves(s);
    if (!ms.length)
        return [];
    for (let i = ms.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = ms[i];
        ms[i] = ms[j];
        ms[j] = t;
    } /* 同分随机 */
    const sc = ms.map(m => { checkDeadline(true); return { m, n: compactChildren.get(s).get(m), v: -negamax(kid(m, s), d - 1, -Infinity, Infinity, 1) }; });
    sc.sort((a, b) => b.v - a.v);
    return sc;
}
/* ---- 根节点迭代加深 + 候选收窄（前向剪枝） ----
   逐层加深，每层结束后把落后最佳超过阈值的候选丢掉，不再进下一层。
   Mirai 的设定：第3层落后 2 分、第4层 0.7 分、第5层 0.3 分就不再往下算。

   这是**启发式**剪枝，和 alpha-beta 性质不同：alpha-beta 剪掉的是已经
   证明无关的分支（精确，不改结果），这里剪掉的是「浅层看着差」的分支
   （会漏东西，换来深度）。漏的主要是弃子杀、弃子兑、牺牲短期优势换局面、
   五步以上长战术 —— 对一个不面向 GM 的对手引擎，这个交换是划算的。

   实现上的要点：阈值直接当搜索窗口用。每个候选用窗口
   (最佳-阈值, 最佳+1) 搜 —— 返回值 ≤ 最佳-阈值 就说明它至少落后那么多，
   可以安全丢掉；高于最佳则重搜确认。先全窗口算准再丢会贵得多，
   而且非最佳走法在收窄窗口下拿到的只是上界，没法比较落后幅度。

   negamax 本身没动，所以 tests/golden.test.ts 的搜索值仍然有效 ——
   这里改变的是**选哪一手**，不是某个深度的搜索值。 */
export const PRUNE = {
    on: 1, /* 根节点候选收窄 */
    ttDeep: 1, /* 默认允许更深的主搜索结果满足较浅搜索；0保留精确深度对照 */
    /* 树内部的前向剪枝。只跳过安静走法（非吃子非升变非打入），
       而且被将军时完全不剪 —— 所以漏掉的是「中途出现重大劣势」那一类，
       不是所有战术。基线（不剪枝但浅）漏掉的战术更多，所以这个交换划算。
       inner=0 时 negamax 走精确路径，tests/golden.test.ts 测的就是那条。 */
    inner: 1, /* 内部剪枝仅保留 LMR；实验可显式关闭 */
    lmrAfter: 3, /* 前这么多手不削减 */
    lmrMinDepth: 3, /* 剩余深度 ≥ 这个值才削减 */
    /* 开局剪得更狠：开局分支因子最高，而多考虑一个开局候选的边际价值最低 ——
       只要剩下的开局成立就够，砍掉大部分开局不影响棋力。
       判据用场上子力（和 depthFor 用的是同一个信号）。 */
    openMaterial: 55, /* 双方非王子力合计 ≥ 这个值算开局 */
    openLmrAfter: 1, /* 开局阶段：第 2 手起就削减 */
    /* 层数 → 阈值（评估单位，100 = 1 分）。没列到的层沿用最后一个。
       越深阈值越紧：深层评估更可信，可以剪得更狠。 */
    margins: { 1: 1e9, 2: 1e9, 3: 200, 4: 70, 5: 30 },
    minCand: 2, /* 至少留这么多候选，否则没有替代选择 */
};
function marginAt(d, mg) {
    if (mg[d] !== undefined)
        return mg[d];
    const ks = Object.keys(mg).map(Number).sort((a, b) => a - b);
    return mg[ks[ks.length - 1]];
}
/* 返回 {move, score, depth, cand, nodes}。cand = 最后一层剩下几个候选 */
export function idSearch(s, maxDepth, opt) {
    opt = opt || {};
    const prune = opt.prune !== undefined ? opt.prune : PRUNE.on;
    const mg = opt.margins || PRUNE.margins;
    const minC = opt.minCand !== undefined ? opt.minCand : PRUNE.minCand;
    let cand = legalMoves(s);
    if (!cand.length)
        return { move: null, score: 0, depth: 0, cand: 0 };
    for (let i = cand.length - 1; i > 0; i--) { /* 同分随机，免得每局一样 */
        const j = Math.floor(Math.random() * (i + 1));
        const t = cand[i];
        cand[i] = cand[j];
        cand[j] = t;
    }
    let sc = cand.map(m => ({ m, v: 0 }));
    let bm = sc[0].m, bv = 0, reached = 0;
    for (let d = 1; d <= maxDepth; d++) {
        checkDeadline(true);
        sc.sort((a, b) => b.v - a.v); /* 上一层最佳排最前 */
        const margin = marginAt(d, mg);
        /* 第一个候选全窗口，拿到可比的基准 */
        bv = -negamax(kid(sc[0].m, s), d - 1, -Infinity, Infinity, 1);
        sc[0].v = bv;
        bm = sc[0].m;
        for (let i = 1; i < sc.length; i++) {
            checkDeadline(true);
            const lo = bv - margin;
            let v = -negamax(kid(sc[i].m, s), d - 1, -(bv + 1), -lo, 1);
            if (v > bv) { /* 可能更好，重搜确认 */
                v = -negamax(kid(sc[i].m, s), d - 1, -Infinity, Infinity, 1);
                if (v > bv) {
                    bv = v;
                    bm = sc[i].m;
                }
            }
            sc[i].v = v;
        }
        reached = d;
        opt.onDepth?.({ move: bm, score: bv, depth: d, cand: sc.length });
        if (opt.stopOnMate && Math.abs(bv) > MATE / 2)
            break;
        if (prune && d < maxDepth) {
            const keep = sc.filter(e => e.v > bv - margin);
            sc = keep.length >= minC ? keep : sc.slice(0, Math.max(minC, 1));
            if (sc.length <= 1)
                break;
        } /* 只剩一手，不用再深 */
    }
    return { move: bm, score: bv, depth: reached, cand: sc.length };
}
export function pickMove(s, d, selection = LEVELS.lunatic.selection, preferCheck = false) {
    srchRep = new Set(posHist);
    return withSearchCache(() => {
        const ms = legalMoves(s);
        if (!ms.length)
            return null;
        const strategy = drawMoveStrategy(selection);
        if (strategy === 'random')
            return chooseFromMovePool(ms.map(m => ({ m, n: compactChildren.get(s).get(m) })), preferCheck).m;
        if (strategy !== 'best' || preferCheck)
            return chooseRankedMove(rankMoves(s, d), strategy, preferCheck)?.m || ms[0];
        return idSearch(s, d, { prune: PRUNE.on }).move || ms[0];
    }, { hist: posHist });
}
/** Analysis root search shared by the Worker and UI fallback.
 * Yields between root moves so the UI fallback can schedule short slices.
 * Worker and fallback consume this one implementation; neither implements search.
 */
export function* analysisSteps(s, { hist = [], plain = true } = {}) {
    srchRep = new Set(hist);
    clearOrderTables();
    let prev = null;
    for (let depth = 1;; depth++) {
        const start = performance.now(), ms = pseudoAll(s);
        if (!ms.length)
            return;
        if (prev) {
            const j = ms.findIndex(m => compactFrom(m) === compactFrom(prev) && compactTo(m) === compactTo(prev));
            if (j > 0)
                [ms[0], ms[j]] = [ms[j], ms[0]];
        }
        let best = null, bv = -Infinity, legal = 0;
        for (const m of ms) {
            const ns = tryMove(s, m);
            if (!ns)
                continue;
            legal++;
            const saved = OPT.open;
            let v;
            try {
                OPT.open = plain ? 0 : 1;
                v = withSearchCache(() => -negamax(vanishPass(ns), depth - 1, -Infinity, Infinity, 1), { hist });
            }
            finally {
                OPT.open = saved;
            }
            if (v > bv) {
                bv = v;
                best = m;
            }
            yield { progress: true };
        }
        if (!legal)
            return;
        prev = best;
        yield { depth, score: bv, ms: performance.now() - start,
            move: compactMove(compactFrom(best), compactTo(best), compactPromo(best) || null, compactDrop(best) || null, undefined, compactCastle(best), undefined, undefined) };
    }
}
/** Interactive selection: keep only completed iterations on timeout.
 * Fixed-depth research entry points remain available and do not gain a time limit.
 */
export function timedMove(s, levelKey, { hist = [], timeMs, onDepth = () => { }, tt = TT.enabled } = {}) {
    const lv = LEVELS[resolveLevel(levelKey)] || LEVELS.normal;
    const start = performance.now(), savedOpen = OPT.open;
    const ms = legalMoves(s);
    let completed = { move: ms[0] || null, score: null, depth: 0 };
    if (!ms.length)
        return { ...completed, ms: performance.now() - start };
    const budget = timeMs ?? lv.timeMs;
    if (!Number.isFinite(budget) || budget < 0)
        throw new Error('Invalid search time budget');
    setSearchState({ end: start + budget, rep: new Set(hist) });
    clearOrderTables();
    OPT.open = lv.plain ? 0 : 1;
    const remember = result => { completed = { ...result }; onDepth({ ...completed, ms: performance.now() - start }); };
    try {
        withSearchCache(() => {
            checkDeadline(true);
            const strategy = drawMoveStrategy(lv.selection);
            if (strategy === 'random') {
                completed.move = chooseFromMovePool(ms.map(m => ({ m, n: compactChildren.get(s).get(m) })), lv.preferCheck).m;
            }
            else if (strategy !== 'best' || lv.preferCheck) {
                for (let depth = 1; depth <= timedDepthFor(lv, s); depth++) {
                    checkDeadline(true);
                    const ranked = rankMoves(s, depth);
                    const chosen = chooseRankedMove(ranked, strategy, lv.preferCheck);
                    remember({ move: chosen.m, score: chosen.v, depth });
                }
            }
            else {
                idSearch(s, timedDepthFor(lv, s), { onDepth: remember, stopOnMate: true });
            }
        }, { hist, enabled: tt });
    }
    catch (error) {
        if (error !== EVABORT)
            throw error;
    }
    finally {
        OPT.open = savedOpen;
        clearSearchDeadline();
        srchRep = null;
    }
    return { ...completed, ms: performance.now() - start, tt: transpositionStats() };
}
