import {compactKinds, compactTypeId, compactType, compactColor, compactMove} from './representation.js';
/* 本文件由 engine/extract.py 从单文件版机械抽取，之后手工改模块边界。
   抽取时不改任何逻辑 —— 行为必须和 tests/golden.json 完全一致，
   先搬后改：倒过来做的话出了差异分不清是搬错还是改错。 */
export const W = 'w', B = 'b';
export const rank = i => i >> 3, file = i => i & 7, at = (r, f) => r * 8 + f;
export const ok = (r, f) => r >= 0 && r < 8 && f >= 0 && f < 8;
export const nm = i => "abcdefgh"[file(i)] + (8 - rank(i));
export const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
export const ALL8 = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
export const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
export const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
export const DABBABA = [[2, 0], [-2, 0], [0, 2], [0, -2]];
export const ALFIL = [[2, 2], [2, -2], [-2, 2], [-2, -2]];
export const REIMU_ATK = KNIGHT.concat(DIAG).concat(ALFIL); // 马+ferz+alfil，全部避开正交线
// 将棋的金：前、左前、右前、左、右、正后（缺两个后斜）
export const GOLD = c => [[fw(c), 0], [fw(c), -1], [fw(c), 1], [0, -1], [0, 1], [-fw(c), 0]];
export const SILVER = c => [[fw(c), 0], [fw(c), -1], [fw(c), 1], [-fw(c), -1], [-fw(c), 1]];
export const fw = c => c === W ? -1 : 1;
export const lf = c => c === W ? -1 : 1;
export const rt = c => c === W ? 1 : -1;
export const P = {};
export const def = (t, o) => { P[t] = o; compactKinds[compactTypeId(t)] = o; };
export const transparent = p => compactType(p) === 'reimu';
export const pushm = (s, i, to, out) => { const q = s.b[to]; if (!q || compactColor(q) !== compactColor(s.b[i]))
    out.push(compactMove(i, to, undefined, undefined, undefined, undefined, undefined, undefined)); };
export function leapAtk(s, i, offs) {
    const r = rank(i), f = file(i), o = [];
    for (const [dr, df] of offs)
        if (ok(r + dr, f + df))
            o.push(at(r + dr, f + df));
    return o;
}
export function slideAtk(s, i, dirs) {
    const r = rank(i), f = file(i), o = [];
    for (const [dr, df] of dirs) {
        let nr = r + dr, nf = f + df;
        while (ok(nr, nf)) {
            const t = at(nr, nf);
            o.push(t);
            if (s.b[t] && !transparent(s.b[t]))
                break;
            nr += dr;
            nf += df;
        }
    }
    return o;
}
export function leapGen(s, i, offs, capturesOnly = false) {
    const r = rank(i), f = file(i), o = [];
    for (const [dr, df] of offs)
        if (ok(r + dr, f + df) && (!capturesOnly || s.b[at(r + dr, f + df)]))
            pushm(s, i, at(r + dr, f + df), o);
    return o;
}
export function slideGen(s, i, dirs, capturesOnly = false) {
    const me = compactColor(s.b[i]), r = rank(i), f = file(i), o = [];
    for (const [dr, df] of dirs) {
        let nr = r + dr, nf = f + df;
        while (ok(nr, nf)) {
            const t = at(nr, nf), q = s.b[t];
            if (!q) {
                if (!capturesOnly)
                    o.push(compactMove(i, t, undefined, undefined, undefined, undefined, undefined, undefined));
            }
            else {
                if (compactColor(q) !== me)
                    o.push(compactMove(i, t, undefined, undefined, undefined, undefined, undefined, undefined));
                if (!transparent(q))
                    break;
            }
            nr += dr;
            nf += df;
        }
    }
    return o;
}
export const promoOpts = () => ['q', 'r', 'b', 'n'];
// Boolean attack queries avoid allocating the full attack list.
export function leapHits(s, i, target, offs) {
    const dr = rank(target) - rank(i), df = file(target) - file(i);
    for (const [r, f] of offs)
        if (r === dr && f === df)
            return true;
    return false;
}
export function slideHits(s, i, target, dirs) {
    const r = rank(i), f = file(i), tr = rank(target) - r, tf = file(target) - f;
    for (const [dr, df] of dirs) {
        const steps = dr ? tr / dr : tf / df;
        if (steps <= 0 || !Number.isInteger(steps) || dr * steps !== tr || df * steps !== tf)
            continue;
        for (let k = 1; k < steps; k++) {
            const p = s.b[at(r + dr * k, f + df * k)];
            if (p && !transparent(p))
                return false;
        }
        return true;
    }
    return false;
}
// Fixed leaper attacks depend only on the square, not on board occupancy.
export function leapTable(offs) {
    const table = Array.from({ length: 64 }, (_, i) => Object.freeze(leapAtk(null, i, offs)));
    return (s, i) => table[i];
}
