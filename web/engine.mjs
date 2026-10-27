// engine/board.ts
var W = "w";
var B = "b";
var rank = (i) => i >> 3;
var file = (i) => i & 7;
var at = (r, f) => r * 8 + f;
var ok = (r, f) => r >= 0 && r < 8 && f >= 0 && f < 8;
var nm = (i) => "abcdefgh"[file(i)] + (8 - rank(i));
var KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
var ALL8 = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
var ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
var DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
var DABBABA = [[2, 0], [-2, 0], [0, 2], [0, -2]];
var ALFIL = [[2, 2], [2, -2], [-2, 2], [-2, -2]];
var REIMU_ATK = KNIGHT.concat(DIAG).concat(ALFIL);
var GOLD = (c) => [[fw(c), 0], [fw(c), -1], [fw(c), 1], [0, -1], [0, 1], [-fw(c), 0]];
var SILVER = (c) => [[fw(c), 0], [fw(c), -1], [fw(c), 1], [-fw(c), -1], [-fw(c), 1]];
var fw = (c) => c === W ? -1 : 1;
var lf = (c) => c === W ? -1 : 1;
var rt = (c) => c === W ? 1 : -1;
var P = {};
var def = (t, o) => {
  P[t] = o;
};
var transparent = (p) => p.t === "reimu";
var pushm = (s, i, to, out) => {
  const q = s.b[to];
  if (!q || q.c !== s.b[i].c) out.push({ from: i, to });
};
function leapAtk(s, i, offs) {
  const r = rank(i), f = file(i), o = [];
  for (const [dr, df] of offs) if (ok(r + dr, f + df)) o.push(at(r + dr, f + df));
  return o;
}
function slideAtk(s, i, dirs) {
  const r = rank(i), f = file(i), o = [];
  for (const [dr, df] of dirs) {
    let nr = r + dr, nf = f + df;
    while (ok(nr, nf)) {
      const t = at(nr, nf);
      o.push(t);
      if (s.b[t] && !transparent(s.b[t])) break;
      nr += dr;
      nf += df;
    }
  }
  return o;
}
function leapGen(s, i, offs) {
  const r = rank(i), f = file(i), o = [];
  for (const [dr, df] of offs) if (ok(r + dr, f + df)) pushm(s, i, at(r + dr, f + df), o);
  return o;
}
function slideGen(s, i, dirs) {
  const me = s.b[i].c, r = rank(i), f = file(i), o = [];
  for (const [dr, df] of dirs) {
    let nr = r + dr, nf = f + df;
    while (ok(nr, nf)) {
      const t = at(nr, nf), q = s.b[t];
      if (!q) o.push({ from: i, to: t });
      else {
        if (q.c !== me) o.push({ from: i, to: t });
        if (!transparent(q)) break;
      }
      nr += dr;
      nf += df;
    }
  }
  return o;
}
var promoOpts = () => ["q", "r", "b", "n"];

// engine/geometry.ts
def("k", { n: "\u738B", g: "\u265A", v: 4, slots: ["k"], royal: 1, atk: (s, i) => leapAtk(s, i, ALL8), gen: (s, i) => leapGen(s, i, ALL8) });
def("q", { n: "\u540E", g: "\u265B", v: 9, slots: ["q"], slider: 1, atk: (s, i) => slideAtk(s, i, ALL8), gen: (s, i) => slideGen(s, i, ALL8) });
def("r", { n: "\u8F66", g: "\u265C", v: 5, slots: ["r"], slider: 1, atk: (s, i) => slideAtk(s, i, ORTHO), gen: (s, i) => slideGen(s, i, ORTHO) });
def("b", { n: "\u8C61", g: "\u265D", v: 3, slots: ["n"], dev: 1, atk: (s, i) => slideAtk(s, i, DIAG), gen: (s, i) => slideGen(s, i, DIAG) });
def("n", { n: "\u9A6C", g: "\u265E", v: 3, slots: ["n"], dev: 1, atk: (s, i) => leapAtk(s, i, KNIGHT), gen: (s, i) => leapGen(s, i, KNIGHT) });
function pawnAtk(s, i, dirs) {
  const p = s.b[i], r = rank(i), f = file(i), d = fw(p.c), o = [];
  for (const df of dirs) if (ok(r + d, f + df)) o.push(at(r + d, f + df));
  return o;
}
function pawnGen(s, i, dirs, dbl) {
  const p = s.b[i], me = p.c, opp = me === W ? B : W, r = rank(i), f = file(i), d = fw(me), o = [];
  const last = me === W ? 0 : 7, home = me === W ? 6 : 1;
  if (ok(r + d, f)) {
    const one = at(r + d, f);
    if (!s.b[one]) {
      if (r + d === last) promoOpts().forEach((t) => o.push({ from: i, to: one, promo: t }));
      else o.push({ from: i, to: one });
      if (dbl && r === home && ok(r + 2 * d, f) && !s.b[at(r + 2 * d, f)]) o.push({ from: i, to: at(r + 2 * d, f), dbl: 1 });
    }
  }
  for (const df of dirs) {
    const nr = r + d, nf = f + df;
    if (!ok(nr, nf)) continue;
    const t = at(nr, nf), q = s.b[t];
    if (q && q.c === opp) {
      if (nr === last) promoOpts().forEach((pt) => o.push({ from: i, to: t, promo: pt }));
      else o.push({ from: i, to: t });
    } else if (!q && t === s.ep) o.push({ from: i, to: t, epc: 1 });
  }
  return o;
}
def("p", {
  n: "\u5175",
  g: "\u265F",
  v: 1,
  slots: ["p"],
  pawnish: 1,
  atk: (s, i) => pawnAtk(s, i, [-1, 1]),
  gen: (s, i) => pawnGen(s, i, [-1, 1], true)
});
def("keda", {
  n: "\u6BDB\u7389",
  g: "\u25CF",
  v: 0.5,
  slots: ["p"],
  vanish: 1,
  pawnish: 1,
  atk: (s, i) => pawnAtk(s, i, [lf(s.b[i].c)]),
  gen: (s, i) => pawnGen(s, i, [lf(s.b[i].c)], true)
});
def("onmyo", {
  n: "\u9634\u9633\u7389",
  g: "\u262F\uFE0E",
  v: 0.5,
  slots: ["p"],
  vanish: 1,
  pawnish: 1,
  atk: (s, i) => pawnAtk(s, i, [rt(s.b[i].c)]),
  gen: (s, i) => pawnGen(s, i, [rt(s.b[i].c)], true)
});
def("ghost", {
  n: "\u5E7D\u7075",
  g: "\u263B",
  v: 0.5,
  slots: ["p"],
  vanish: 1,
  pawnish: 1,
  atk: (s, i) => pawnAtk(s, i, [0]),
  gen: (s, i) => {
    const p = s.b[i], me = p.c, opp = me === W ? B : W, r = rank(i), f = file(i), d = fw(me), o = [];
    const home = me === W ? 6 : 1;
    for (const df of [-1, 1]) {
      if (ok(r + d, f + df) && !s.b[at(r + d, f + df)]) {
        o.push({ from: i, to: at(r + d, f + df) });
        if (r === home && ok(r + 2 * d, f + 2 * df) && !s.b[at(r + 2 * d, f + 2 * df)]) o.push({ from: i, to: at(r + 2 * d, f + 2 * df) });
      }
    }
    if (ok(r + d, f)) {
      const t = at(r + d, f), q = s.b[t];
      if (q && q.c === opp) o.push({ from: i, to: t });
    }
    return o;
  }
});
def("rabbit", {
  n: "\u5154\u5B50",
  g: "\u22C0",
  v: 1,
  slots: ["n", "p"],
  dev: 1,
  pawnish: 1,
  atk: (s, i) => pawnAtk(s, i, [-1, 1]),
  gen: (s, i) => {
    const p = s.b[i], me = p.c, opp = me === W ? B : W, r = rank(i), f = file(i), d = fw(me), o = [];
    const last = me === W ? 0 : 7, pen = me === W ? 1 : 6;
    const push = (nr, t) => o.push(nr === last || nr === pen ? { from: i, to: t, promo: "tewi" } : { from: i, to: t });
    for (const df of [-2, 2]) {
      const nr = r + 2 * d, nf = f + df;
      if (!ok(nr, nf)) continue;
      const t = at(nr, nf);
      if (s.b[t]) continue;
      push(nr, t);
    }
    for (const df of [-1, 1]) {
      const nr = r + d, nf = f + df;
      if (!ok(nr, nf)) continue;
      const t = at(nr, nf), q = s.b[t];
      if (q && q.c === opp) {
        push(nr, t);
        continue;
      }
      if (!q && t === s.ep) o.push({ from: i, to: t, epc: 1 });
    }
    return o;
  }
});
var TEWI = DIAG.concat(ALFIL);
def("tewi", {
  n: "\u56E0\u5E61\u5E1D",
  g: "\u2756",
  v: 2.5,
  slots: [],
  atk: (s, i) => leapAtk(s, i, TEWI),
  gen: (s, i) => leapGen(s, i, TEWI)
});
def("doll", {
  n: "\u4EBA\u5076",
  g: "\u2617",
  v: 0.5,
  slots: [],
  pawnish: 1,
  atk: (s, i) => pawnAtk(s, i, [0]),
  gen: (s, i) => {
    const me = s.b[i].c, opp = me === W ? B : W, r = rank(i), f = file(i), d = fw(me), o = [];
    const last = me === W ? 0 : 7;
    if (!ok(r + d, f)) return o;
    const t = at(r + d, f), q = s.b[t];
    if (!q || q.c === opp) {
      if (r + d === last) o.push({ from: i, to: t, promo: "shanghai" });
      else o.push({ from: i, to: t });
    }
    return o;
  }
});
def("shanghai", {
  n: "\u4E0A\u6D77\u4EBA\u5076",
  g: "\u2616",
  v: 1.5,
  slots: [],
  atk: (s, i) => slideAtk(s, i, [[-fw(s.b[i].c), 0]]),
  gen: (s, i) => slideGen(s, i, [[-fw(s.b[i].c), 0]])
});
function dollDropOK(s, to, me) {
  if (s.b[to]) return false;
  if (rank(to) === (me === W ? 0 : 7)) return false;
  for (let r = 0; r < 8; r++) {
    const q = s.b[at(r, file(to))];
    if (q && q.c === me && q.t === "doll") return false;
  }
  return true;
}
def("fairy", { n: "\u5996\u7CBE", g: "\u22C8", v: 1.5, slots: ["n", "p"], dev: 1, atk: (s, i) => leapAtk(s, i, DIAG), gen: (s, i) => leapGen(s, i, DIAG) });
def("daiyousei", {
  n: "\u5927\u5996\u7CBE",
  g: "\u29D3",
  v: 2,
  slots: ["n", "p"],
  dev: 1,
  atk: (s, i) => leapAtk(s, i, SILVER(s.b[i].c)),
  gen: (s, i) => leapGen(s, i, SILVER(s.b[i].c))
});
def("sunny", {
  n: "\u6851\u5C3C\u7C73\u5C14\u514B",
  g: "\u263C",
  v: 1.5,
  slots: ["n", "p"],
  dev: 1,
  lightbringer: 1,
  max: 1,
  atk: (s, i) => leapAtk(s, i, DIAG),
  gen: (s, i) => leapGen(s, i, DIAG)
});
def("cirno", {
  n: "\u742A\u9732\u8BFA",
  g: "\u2468",
  v: 3,
  slots: ["p"],
  freezer: 1,
  limit: "sqcolor",
  atk: (s, i) => leapAtk(s, i, DIAG),
  gen: (s, i) => leapGen(s, i, DIAG)
});
def("reimu", {
  n: "\u7075\u68A6",
  g: "\u26E9\uFE0E",
  v: 7.5,
  slots: ["k", "q", "r", "n"],
  atk: (s, i) => leapAtk(s, i, REIMU_ATK),
  gen: (s, i) => {
    const me = s.b[i].c, opp = me === W ? B : W, r = rank(i), f = file(i), o = [];
    for (const [dr, df] of ORTHO) {
      let nr = r + dr, nf = f + df;
      while (ok(nr, nf)) {
        const t = at(nr, nf);
        if (!s.b[t]) o.push({ from: i, to: t });
        nr += dr;
        nf += df;
      }
    }
    for (const [dr, df] of REIMU_ATK) {
      if (!ok(r + dr, f + df)) continue;
      const t = at(r + dr, f + df), q = s.b[t];
      if (q && q.c === opp) o.push({ from: i, to: t });
    }
    return o;
  }
});
var SANAE = (c) => [[fw(c), 0], [0, -1], [0, 1], [-fw(c), -1], [-fw(c), 1]];
def("sanae", {
  n: "\u65E9\u82D7",
  g: "\u2605",
  v: 6,
  slots: ["k", "q", "r"],
  slider: 1,
  atk: (s, i) => slideAtk(s, i, SANAE(s.b[i].c)),
  gen: (s, i) => slideGen(s, i, SANAE(s.b[i].c))
});
def("lumia", {
  n: "\u9732\u7C73\u5A05",
  g: "\u271D\uFE0E",
  v: 4,
  slots: ["k", "q", "r", "n", "p"],
  dev: 1,
  fogger: 1,
  max: 1,
  atk: (s, i) => leapAtk(s, i, ALL8),
  gen: (s, i) => leapGen(s, i, ALL8)
});
def("iku", {
  n: "\u6C38\u6C5F\u8863\u7396",
  g: "\u21AF",
  v: 5.5,
  slots: ["r"],
  slider: 1,
  atk: (s, i) => slideAtk(s, i, ORTHO),
  gen: (s, i) => {
    const last = s.b[i].c === W ? 0 : 7, o = [];
    for (const m of slideGen(s, i, ORTHO)) {
      o.push(m);
      if (rank(m.to) === last) o.push({ from: i, to: m.to, promo: "ryuu" });
    }
    return o;
  }
});
def("ryuu", {
  n: "\u9F99\u738B",
  g: "\u7ADC",
  v: 6,
  slots: [],
  slider: 1,
  atk: (s, i) => slideAtk(s, i, ORTHO).concat(leapAtk(s, i, DIAG)),
  gen: (s, i) => slideGen(s, i, ORTHO).concat(leapGen(s, i, DIAG))
});
def("koishi", {
  n: "\u53E4\u660E\u5730\u604B",
  g: "\u260F",
  v: 1,
  slots: ["n", "p"],
  atk: (s, i) => {
    const c = s.b[i].c, r = rank(i), f = file(i), o = [], d = -fw(c);
    for (const df of [-1, 0, 1]) if (ok(r + d, f + df)) o.push(at(r + d, f + df));
    return o;
  },
  gen: (s, i) => {
    const me = s.b[i].c, opp = me === W ? B : W, o = [], d = -fw(me), r = rank(i), f = file(i);
    const seen = /* @__PURE__ */ new Set([i]), qq = [i];
    while (qq.length) {
      const cur = qq.shift();
      for (const [dr, df] of ALL8) {
        const nr = rank(cur) + dr * 2, nf = file(cur) + df * 2;
        if (!ok(nr, nf)) continue;
        const t = at(nr, nf);
        if (s.b[t] || seen.has(t)) continue;
        seen.add(t);
        qq.push(t);
        o.push({ from: i, to: t });
      }
    }
    for (const df of [-1, 0, 1]) {
      if (!ok(r + d, f + df)) continue;
      const t = at(r + d, f + df), q = s.b[t];
      if (q && q.c === opp) o.push({ from: i, to: t });
    }
    return o;
  }
});
def("alice", {
  n: "\u7231\u4E3D\u4E1D",
  g: "\u7CF8",
  v: 2.5,
  slots: ["n", "p"],
  dropper: 1,
  atk: (s, i) => leapAtk(s, i, GOLD(s.b[i].c)),
  gen: (s, i) => {
    const me = s.b[i].c, r = rank(i), f = file(i), o = leapGen(s, i, GOLD(me));
    if (s.ammo[me] >= 0.5)
      for (const [dr, df] of GOLD(me)) {
        if (!ok(r + dr, f + df)) continue;
        const t = at(r + dr, f + df);
        if (dollDropOK(s, t, me)) o.push({ from: i, to: t, drop: "doll", cost: 0.5 });
      }
    return o;
  }
});
var rimDirs = (i) => {
  const r = rank(i), f = file(i), d = [];
  if (r === 0 || r === 7) d.push([0, -1], [0, 1]);
  if (f === 0 || f === 7) d.push([-1, 0], [1, 0]);
  return d;
};
var LEAP7 = [[7, 0], [-7, 0], [0, 7], [0, -7]];
def("yukari", {
  n: "\u516B\u4E91\u7D2B",
  g: "\u9593",
  v: 7,
  slots: ["q", "r"],
  royal: 1,
  files: [3, 7],
  atk: (s, i) => slideAtk(s, i, rimDirs(i)).concat(leapAtk(s, i, LEAP7)),
  gen: (s, i) => {
    const o = slideGen(s, i, rimDirs(i)).concat(leapGen(s, i, LEAP7));
    const seen = /* @__PURE__ */ new Set(), u = [];
    for (const m of o) {
      if (seen.has(m.to)) continue;
      seen.add(m.to);
      u.push(m);
    }
    return u;
  }
});

// engine/costs.generated.ts
var RULES = {
  keda: { name: "\u6BDB\u7389", cost: 0.5, slots: ["p"] },
  onmyo: { name: "\u9634\u9633\u7389", cost: 0.5, slots: ["p"] },
  ghost: { name: "\u5E7D\u7075", cost: 0.5, slots: ["p"] },
  doll: { name: "\u4EBA\u5076", cost: 0.5, slots: [] },
  p: { name: "\u5175", cost: 1, slots: ["p"] },
  rabbit: { name: "\u5154\u5B50", cost: 1, slots: ["n", "p"] },
  koishi: { name: "\u53E4\u660E\u5730\u604B", cost: 1, slots: ["n", "p"] },
  shanghai: { name: "\u4E0A\u6D77\u4EBA\u5076", cost: 1.5, slots: [] },
  fairy: { name: "\u5996\u7CBE", cost: 1.5, slots: ["n", "p"] },
  sunny: { name: "\u6851\u5C3C\u7C73\u5C14\u514B", cost: 1.5, slots: ["n", "p"] },
  daiyousei: { name: "\u5927\u5996\u7CBE", cost: 2, slots: ["n", "p"] },
  tewi: { name: "\u56E0\u5E61\u5E1D", cost: 2.5, slots: [] },
  alice: { name: "\u7231\u4E3D\u4E1D\u739B\u683C\u7279\u7F57\u4F0A\u5FB7", cost: 2.5, slots: ["n", "p"] },
  n: { name: "\u9A6C", cost: 3, slots: ["n"] },
  b: { name: "\u4E3B\u6559", cost: 3, slots: ["n"] },
  cirno: { name: "\u742A\u9732\u8BFA", cost: 3, slots: ["p"], limit: "sqcolor" },
  k: { name: "\u738B", cost: 4, slots: ["k"] },
  lumia: { name: "\u9732\u7C73\u5A05", cost: 4, slots: ["k", "q", "r", "n", "p"], max: 1 },
  r: { name: "\u8F66", cost: 5, slots: ["r"] },
  iku: { name: "\u6C38\u6C5F\u8863\u7396", cost: 5.5, slots: ["r"] },
  sanae: { name: "\u65E9\u82D7", cost: 6, slots: ["k", "q", "r"] },
  ryuu: { name: "\u9F99\u738B", cost: 6, slots: [] },
  yukari: { name: "\u516B\u4E91\u7D2B", cost: 7, slots: ["q", "r"], files: [3, 7] },
  reimu: { name: "\u7075\u68A6", cost: 7.5, slots: ["k", "q", "r", "n"] },
  q: { name: "\u540E", cost: 9, slots: ["q"] }
};

// engine/pieces.ts
function crossCheck() {
  const geo = Object.keys(P).sort(), rule = Object.keys(RULES).sort();
  const onlyGeo = geo.filter((k) => !(k in RULES));
  const onlyRule = rule.filter((k) => !(k in P));
  if (onlyGeo.length || onlyRule.length) {
    const msg = [];
    if (onlyGeo.length) msg.push(`\u51E0\u4F55\u91CC\u6709\u4F46\u89C4\u5219\u4E66\u6CA1\u6709\uFF1A${onlyGeo.join(", ")}`);
    if (onlyRule.length) msg.push(`\u89C4\u5219\u4E66\u6709\u4F46\u51E0\u4F55\u6CA1\u5199\uFF1A${onlyRule.join(", ")}`);
    throw new Error("\u68CB\u5B50\u8868\u5BF9\u4E0D\u4E0A \u2014\u2014 " + msg.join("\uFF1B"));
  }
}
function applyRules() {
  for (const k in RULES) {
    const r = RULES[k], p = P[k];
    p.name = r.name;
    p.cost = r.cost;
    p.slots = r.slots;
    if (r.max !== void 0) p.max = r.max;
    else delete p.max;
    if (r.limit !== void 0) p.limit = r.limit;
    else delete p.limit;
    if (r.files !== void 0) p.files = r.files;
    else delete p.files;
    delete p.v;
  }
}
var WEIGHTS;
function applyWeights(w) {
  WEIGHTS = w;
  for (const k in RULES) {
    const over = w.value && w.value[k];
    P[k].value = over === void 0 || over === null ? P[k].cost : over;
  }
}
crossCheck();
applyRules();

// engine/rules.ts
var NO_FROZEN = /* @__PURE__ */ new Set();
function frozenSet(s) {
  let z = null;
  for (let i = 0; i < 64; i++) {
    const p = s.b[i];
    if (!p || !P[p.t].freezer) continue;
    const r = rank(i), f = file(i);
    for (const [dr, df] of DIAG) {
      if (!ok(r + dr, f + df)) continue;
      const t = at(r + dr, f + df), q = s.b[t];
      if (q && P[q.t].royal) continue;
      if (z === null) z = /* @__PURE__ */ new Set();
      z.add(t);
    }
  }
  return z === null ? NO_FROZEN : z;
}
function darkSet(s) {
  const d = /* @__PURE__ */ new Set();
  for (let i = 0; i < 64; i++) {
    const p = s.b[i];
    if (!p || !P[p.t].fogger) continue;
    const r = rank(i), f = file(i);
    for (const [dr, df] of ALL8) if (ok(r + dr, f + df)) d.add(at(r + dr, f + df));
  }
  for (let i = 0; i < 64; i++) {
    const p = s.b[i];
    if (!p || !P[p.t].lightbringer) continue;
    const r = rank(i), f = file(i);
    for (const [dr, df] of DIAG) if (ok(r + dr, f + df)) d.delete(at(r + dr, f + df));
  }
  return d;
}
function attacksFrom(s, i, fz) {
  const p = s.b[i];
  if (!p) return [];
  if (fz && fz.has(i)) return [];
  return P[p.t].atk(s, i);
}
function isAttacked(s, sq, by, fz) {
  for (let i = 0; i < 64; i++) {
    const p = s.b[i];
    if (p && p.c === by && attacksFrom(s, i, fz).indexOf(sq) >= 0) return true;
  }
  return false;
}
function royals(s, c) {
  const o = [];
  for (let i = 0; i < 64; i++) {
    const p = s.b[i];
    if (p && p.c === c && P[p.t].royal) o.push(i);
  }
  return o;
}
function inCheck(s, c, fz) {
  fz = fz || frozenSet(s);
  const opp = c === W ? B : W;
  return royals(s, c).some((k) => isAttacked(s, k, opp, fz));
}
function pseudo(s, i, fz) {
  const p = s.b[i];
  if (!p || p.c !== s.turn) return [];
  if (fz.has(i)) return [];
  const o = P[p.t].gen(s, i);
  const back = p.c === W ? 7 : 0;
  if (i === at(back, 4) && P[p.t].royal && !inCheck(s, p.c, fz)) {
    const opp = p.c === W ? B : W;
    for (const rf of [7, 0]) {
      if (!s.cas[p.c + rf]) continue;
      const dir = rf === 7 ? 1 : -1;
      let clear = true;
      for (let f = 4 + dir; f !== rf; f += dir) if (s.b[at(back, f)]) {
        clear = false;
        break;
      }
      if (!clear) continue;
      if (isAttacked(s, at(back, 4 + dir), opp, fz) || isAttacked(s, at(back, 4 + 2 * dir), opp, fz)) continue;
      o.push({ from: i, to: at(back, 4 + 2 * dir), castle: rf });
    }
  }
  return o;
}
function applyMove(s, m) {
  const b = s.b.slice(), p = b[m.from], me = p.c, cas = { ...s.cas }, am = { ...s.ammo };
  let cap = null;
  if (m.drop) {
    cap = b[m.to];
    b[m.to] = { t: m.drop, c: me };
    am[me] -= m.cost;
    return { b, turn: me === W ? B : W, cas, ep: null, half: 0, full: me === B ? s.full + 1 : s.full, ammo: am, _cap: cap };
  }
  cap = b[m.to];
  b[m.to] = m.promo ? { t: m.promo, c: me } : p;
  b[m.from] = null;
  if (m.epc) {
    const cs = me === W ? m.to + 8 : m.to - 8;
    cap = b[cs];
    b[cs] = null;
  }
  if (m.castle !== void 0) {
    const back = me === W ? 7 : 0, rf = m.castle, dir = rf === 7 ? 1 : -1;
    b[at(back, 4 + dir)] = b[at(back, rf)];
    b[at(back, rf)] = null;
  }
  for (const col of [W, B]) {
    const back = col === W ? 7 : 0;
    for (const f of [0, 7])
      if (m.from === at(back, f) || m.to === at(back, f) || m.from === at(back, 4)) cas[col + f] = false;
  }
  return {
    b,
    turn: me === W ? B : W,
    cas,
    ep: m.dbl ? (m.from + m.to) / 2 : null,
    half: P[p.t].pawnish || cap ? 0 : s.half + 1,
    full: me === B ? s.full + 1 : s.full,
    ammo: am,
    _cap: cap
  };
}
function pseudoAll(s) {
  const fz = frozenSet(s), out = [];
  for (let i = 0; i < 64; i++) {
    const p = s.b[i];
    if (!p || p.c !== s.turn) continue;
    for (const m of pseudo(s, i, fz)) {
      const tgt = s.b[m.to];
      if (tgt && tgt.c !== p.c && P[tgt.t].royal) continue;
      out.push(m);
    }
  }
  return out;
}
function tryMove(s, m) {
  const ns = applyMove(s, m);
  if (inCheck(ns, s.turn)) return null;
  m._n = ns;
  return ns;
}
function hasLegal(s) {
  const fz = frozenSet(s);
  for (let i = 0; i < 64; i++) {
    const p = s.b[i];
    if (!p || p.c !== s.turn) continue;
    for (const m of pseudo(s, i, fz)) {
      const tgt = s.b[m.to];
      if (tgt && tgt.c !== p.c && P[tgt.t].royal) continue;
      if (!inCheck(applyMove(s, m), s.turn)) return true;
    }
  }
  return false;
}
function legalMoves(s) {
  const out = [];
  for (const m of pseudoAll(s)) {
    const ns = tryMove(s, m);
    if (ns) out.push(m);
  }
  return out;
}
function vanishPass(s) {
  const b = s.b.slice();
  let ch = false;
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p || !P[p.t].vanish) continue;
    const last = p.c === W ? 0 : 7;
    if (rank(i) === last) {
      if (p.mark) {
        b[i] = null;
      } else b[i] = { ...p, mark: 1 };
      ch = true;
    }
  }
  return ch ? { ...s, b } : s;
}
function posKey(s) {
  let k = s.turn + "|";
  for (let i = 0; i < 64; i++) {
    const p = s.b[i];
    k += p ? p.c + p.t + (p.mark ? "!" : "") + "," : ".";
  }
  return k + "|" + [s.cas.w0, s.cas.w7, s.cas.b0, s.cas.b7].map((x) => x ? 1 : 0).join("") + "|" + (s.ep === null ? "-" : s.ep) + "|" + s.ammo.w + "," + s.ammo.b;
}
var posHist = [];
function setPosHist(a) {
  posHist = a.slice();
}
function pushPos(k) {
  posHist.push(k);
}
function repCount(k) {
  let n = 0;
  for (const x of posHist) if (x === k) n++;
  return n;
}
function standardInsufficientMaterial(s) {
  if (s.b.some((p) => p && (!["p", "n", "b", "r", "q", "k"].includes(p.t) || p.mark))) return false;
  const pieces = s.b.map((p, i) => ({ p, i })).filter((x) => x.p && x.p.t !== "k");
  if (!pieces.length) return true;
  if (pieces.length === 1 && ["b", "n"].includes(pieces[0].p.t)) return true;
  return pieces.every((x) => x.p.t === "b") && pieces.every((x) => (file(x.i) + rank(x.i)) % 2 === (file(pieces[0].i) + rank(pieces[0].i)) % 2);
}
function outcome(s, ms) {
  const fz = frozenSet(s);
  if (!ms.length) {
    const c2 = inCheck(s, s.turn, fz);
    return c2 ? { over: 1, code: "mates", winner: s.turn === W ? B : W, alert: 1 } : { over: 1, code: "stalemate", winner: null, alert: 1 };
  }
  if (repCount(posKey(s)) >= 3) return { over: 1, code: "rep3", winner: null, alert: 1 };
  if (s.half >= 100) return { over: 1, code: "fifty", winner: null, alert: 1 };
  if (standardInsufficientMaterial(s)) return { over: 1, code: "material", winner: null, alert: 1 };
  const c = inCheck(s, s.turn, fz);
  return { over: 0, code: "toMove", winner: null, toMove: s.turn, check: !!c, alert: c };
}
function notate(s, m, ns, nms) {
  if (m.castle !== void 0) return m.castle === 7 ? "O-O" : "O-O-O";
  if (m.drop) return P[m.drop].g + "*" + nm(m.to);
  const g = P[s.b[m.from].t].g, cap = s.b[m.to] || m.epc;
  return g + nm(m.from) + (cap ? "x" : "-") + nm(m.to) + (m.promo ? "=" + P[m.promo].g : "") + (inCheck(ns, ns.turn) ? nms.length === 0 ? "#" : "+" : "");
}

// engine/deploy.ts
var BUDGET = 45;
var BODIES = 16;
var mirrorSq = (i) => (7 - (i >> 3)) * 8 + (i & 7);
function slotOf(i, c) {
  const r = rank(i), f = file(i);
  const back = c === W ? 7 : 0, pawn = c === W ? 6 : 1;
  if (r === pawn) return "p";
  if (r === back) return f === 4 ? "k" : f === 3 ? "q" : f === 0 || f === 7 ? "r" : "n";
  return null;
}
function pointsOf(dep) {
  let v = 0;
  for (const t of dep.values()) v += P[t].cost;
  return v;
}
function readySide(dep) {
  const rc = [...dep.values()].filter((t) => P[t].royal).length;
  return pointsOf(dep) <= BUDGET && rc === 1;
}
var fmt = (x) => (Math.round(x * 10) / 10).toString();
function canDeploy(deploy, c, t, i) {
  const d = P[t], slot = slotOf(i, c);
  if (!d || !slot || !d.slots.includes(slot) || deploy.w.has(i) || deploy.b.has(i)) return false;
  if (d.files && !d.files.includes(file(i))) return false;
  let same = 0, total = 0;
  const color = rank(i) + file(i) & 1;
  for (const [j, type] of deploy[c]) if (type === t) {
    total++;
    if ((rank(j) + file(j) & 1) === color) same++;
  }
  if (d.max && total >= d.max) return false;
  return d.limit !== "sqcolor" || same === 0 && total < 2;
}
function buildState(wDep, bDep) {
  const b = new Array(64).fill(null);
  for (const [i, t] of wDep) b[i] = { t, c: W };
  for (const [i, t] of bDep) b[i] = { t, c: B };
  const cas = {};
  for (const c of [W, B]) {
    const back = c === W ? 7 : 0;
    for (const f of [0, 7]) {
      const q = b[at(back, f)], k = b[at(back, 4)];
      cas[c + f] = !!(q && q.c === c && k && k.c === c);
    }
  }
  return {
    b,
    turn: W,
    cas,
    ep: null,
    half: 0,
    full: 1,
    ammo: {
      w: +(BUDGET - pointsOf(wDep)).toFixed(1),
      b: +(BUDGET - pointsOf(bDep)).toFixed(1)
    }
  };
}

// engine/eval.ts
var MATE = 1e6;
var HITW = new Uint8Array(64);
var HITB = new Uint8Array(64);
var OPT = { open: 1, ctr: 1, home: 1, out: 1, heavy: 1, cast: 1 };
var HEAVY = 5;
function evalPos(s) {
  const Wt = WEIGHTS;
  const me = s.turn, opp = me === W ? B : W, fz = frozenSet(s);
  let v = 0;
  HITW.fill(0);
  HITB.fill(0);
  const roy = [], nonRoy = { w: 0, b: 0 };
  for (let i = 0; i < 64; i++) {
    const p = s.b[i];
    if (!p) continue;
    const sg = p.c === me ? 1 : -1;
    v += sg * P[p.t].value * 100;
    if (P[p.t].royal) roy.push(i);
    else nonRoy[p.c] += P[p.t].value;
    if (fz.has(i)) continue;
    const a = P[p.t].atk(s, i);
    if (!P[p.t].royal) v += sg * a.length * Wt.mobility;
    const h = p.c === W ? HITW : HITB;
    for (let k = 0; k < a.length; k++) h[a[k]] = 1;
  }
  for (const i of roy) {
    const p = s.b[i], sg = p.c === me ? 1 : -1, h = p.c === W ? HITB : HITW;
    const r = rank(i), f = file(i);
    let n = 0;
    for (const [dr, df] of ALL8) if (ok(r + dr, f + df) && h[at(r + dr, f + df)]) n++;
    v -= sg * n * Wt.kingSafety;
  }
  if (roy.length === 2) {
    const bare = nonRoy.w <= 0.5 ? W : nonRoy.b <= 0.5 ? B : null;
    if (bare && nonRoy[bare === W ? B : W] >= 4) {
      const ri = roy[0], rj = roy[1];
      const bi = s.b[ri].c === bare ? ri : rj, si = bi === ri ? rj : ri;
      const br = rank(bi), bf = file(bi), sr = rank(si), sf = file(si);
      const edge = Math.max(Math.abs(3.5 - br), Math.abs(3.5 - bf));
      const near = Math.max(Math.abs(sr - br), Math.abs(sf - bf));
      const corner = Math.min(
        Math.max(br, bf),
        Math.max(br, 7 - bf),
        Math.max(7 - br, bf),
        Math.max(7 - br, 7 - bf)
      );
      const sg = s.b[si].c === me ? 1 : -1;
      v += sg * (edge * Wt.endgame.edge - near * Wt.endgame.near - corner * Wt.endgame.corner);
    }
  }
  if (OPT.open && nonRoy.w + nonRoy.b >= Wt.openMinMaterial) {
    for (const c of [W, B]) {
      const sg = c === me ? 1 : -1, back = c === W ? 7 : 0, h = c === W ? HITW : HITB;
      let ctr = 0;
      for (const [r, f] of [[3, 3], [3, 4], [4, 3], [4, 4]]) if (h[at(r, f)]) ctr++;
      if (OPT.ctr) v += sg * ctr * Wt.open.center;
      let home = 0, dev = 0, early = 0, castled = 0;
      for (const f of [1, 2, 5, 6]) {
        const q = s.b[at(back, f)];
        if (q && q.c === c && P[q.t].dev) home++;
      }
      if (OPT.home) v -= sg * home * Wt.open.homeBlock;
      for (let i = 0; i < 64; i++) {
        const q = s.b[i];
        if (!q || q.c !== c || P[q.t].royal) continue;
        if (P[q.t].dev && rank(i) !== back) dev++;
        if (P[q.t].value >= HEAVY && P[q.t].slider && rank(i) !== back) early++;
      }
      if (OPT.out) v += sg * dev * Wt.open.develop;
      if (OPT.heavy) v -= sg * early * Wt.open.heavyEarly;
      for (const i of roy) if (s.b[i].c === c && rank(i) === back && (file(i) === 6 || file(i) === 2)) castled = 1;
      if (OPT.cast) v += sg * castled * Wt.open.castled;
    }
  }
  return v;
}

// engine/transposition.ts
var TT = { enabled: true, slots: 32768 };
var moveKey = (m) => m ? JSON.stringify([
  m.from,
  m.to,
  m.promo ?? null,
  m.drop ?? null,
  m.cost ?? null,
  m.castle ?? null,
  m.epc ?? null,
  m.dbl ?? null
]) : null;
var ttPositionKey = (s) => posKey(s) + "|half:" + s.half;
var scoreToTT = (v, ply) => v > MATE / 2 ? v + ply : v < -MATE / 2 ? v - ply : v;
var scoreFromTT = (v, ply) => v > MATE / 2 ? v - ply : v < -MATE / 2 ? v + ply : v;
var table = [];
var configuration = "";
var generation = 0;
var used = 0;
var counters = { probes: 0, hits: 0, cutoffs: 0, stores: 0 };
function clearTranspositionTable() {
  table = [];
  configuration = "";
  generation = 0;
  used = 0;
  counters = { probes: 0, hits: 0, cutoffs: 0, stores: 0 };
}
var transpositionStats = () => ({ ...counters, entries: used, capacity: TT.slots, generation });
function newTranspositionSearch(config) {
  if (!Number.isInteger(TT.slots) || TT.slots < 1 || TT.slots > 1048576) throw Error("Invalid TT slot count");
  const identity = config + "|slots:" + TT.slots;
  if (identity !== configuration) {
    clearTranspositionTable();
    configuration = identity;
  }
  generation++;
}
function index(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 0) % TT.slots;
}
function probeTransposition(key) {
  counters.probes++;
  const e = table[index(key)];
  if (e?.key !== key) return null;
  counters.hits++;
  return e;
}
function countTTCutoff() {
  counters.cutoffs++;
}
function storeTransposition(key, depth, value, bound, move, ply) {
  if (!Number.isFinite(value)) return;
  const i = index(key), old = table[i];
  if (old && old.generation === generation && old.depth > depth && bound !== "exact") return;
  if (!old) used++;
  table[i] = { key, depth, value: scoreToTT(value, ply), bound, move: moveKey(move), generation };
  counters.stores++;
}

// engine/search.ts
var cacheContext = null;
var lastCacheHistory = "";
var cacheHistoryVersion = 0;
function withSearchCache(run, { hist = [], enabled = TT.enabled, newSearch = true } = {}) {
  const saved = cacheContext;
  if (enabled) {
    if (newSearch) newTranspositionSearch(JSON.stringify([
      OPT,
      WEIGHTS,
      PRUNE,
      Object.entries(P).map(([t, p]) => [t, p.value, p.cost])
    ]));
    const history = JSON.stringify([...new Set(hist)].sort());
    if (history !== lastCacheHistory) {
      lastCacheHistory = history;
      cacheHistoryVersion++;
    }
    cacheContext = { history: cacheHistoryVersion };
  } else cacheContext = null;
  try {
    return run();
  } finally {
    cacheContext = saved;
  }
}
var cacheKey = (s, ply) => ttPositionKey(s) + (ply <= 2 ? "|root:" + ply + "|hist:" + cacheContext.history : "|deep");
var KMAX = 64;
var K1 = new Int32Array(KMAX);
var K2 = new Int32Array(KMAX);
var HIST = new Int32Array(64 * 64);
var sig = (m) => m.from << 6 | m.to;
function clearOrderTables() {
  K1.fill(0);
  K2.fill(0);
  HIST.fill(0);
}
function mscore(s, m, ply = 0) {
  const vic = s.b[m.to];
  let v = 0;
  if (vic) v += 1e3 + P[vic.t].value * 10 - P[s.b[m.from].t].value;
  if (m.promo) v += 500;
  if (m.drop) v += P[m.drop].value * 10;
  if (!vic && !m.promo && !m.drop) {
    const g = sig(m);
    if (ply < KMAX && K1[ply] === g) v += 900;
    else if (ply < KMAX && K2[ply] === g) v += 850;
    else {
      const h = HIST[g];
      v += h > 799 ? 799 : h;
    }
  }
  return v;
}
var order = (s, ms, ply = 0) => ms.sort((a, b) => mscore(s, b, ply) - mscore(s, a, ply));
function onCut(s, m, d, ply) {
  if (s.b[m.to] || m.promo || m.drop) return;
  const g = sig(m);
  if (ply < KMAX && K1[ply] !== g) {
    K2[ply] = K1[ply];
    K1[ply] = g;
  }
  HIST[g] += d * d;
}
var kid = (m) => vanishPass(m._n);
function qsearch(s, alpha, beta, ply) {
  checkDeadline();
  let best = evalPos(s);
  if (ply > 6 || best >= beta) return best;
  if (best > alpha) alpha = best;
  const ms = order(s, pseudoAll(s).filter((m) => s.b[m.to] || m.epc));
  for (const m of ms) {
    const ns = tryMove(s, m);
    if (!ns) continue;
    const sc = -qsearch(vanishPass(ns), -beta, -alpha, ply + 1);
    if (sc > best) best = sc;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}
var srchRep = null;
var srchEnd = 0;
var srchNodes = 0;
var EVABORT = { abort: 1 };
function setSearchState({ end = 0, rep = null, nodes = 0 } = {}) {
  srchEnd = end;
  srchRep = rep;
  srchNodes = nodes;
}
function clearSearchDeadline() {
  srchEnd = 0;
}
function checkDeadline(force = false) {
  if (srchEnd && (force || !(++srchNodes & 255)) && performance.now() >= srchEnd) throw EVABORT;
}
function negamax(s, d, alpha, beta, ply) {
  checkDeadline();
  if (ply && ply <= 2 && srchRep && srchRep.has(posKey(s))) return 0;
  const originalAlpha = alpha, key = cacheContext ? cacheKey(s, ply) + (d > 0 ? "" : "|qroot") : null;
  const cached = key ? probeTransposition(key) : null;
  if (cached && cached.depth === d) {
    const value = scoreFromTT(cached.value, ply);
    if (cached.bound === "exact" || cached.bound === "lower" && value >= beta || cached.bound === "upper" && value <= alpha) {
      countTTCutoff();
      return value;
    }
  }
  if (!(d > 0)) {
    const value = !hasLegal(s) ? inCheck(s, s.turn) ? -(MATE - ply) : 0 : qsearch(s, alpha, beta, 0);
    if (key) storeTransposition(key, d, value, value <= originalAlpha ? "upper" : value >= beta ? "lower" : "exact", null, ply);
    return value;
  }
  const ms = pseudoAll(s);
  order(s, ms, ply);
  if (cached?.move) {
    const i = ms.findIndex((m) => moveKey(m) === cached.move);
    if (i > 0) ms.unshift(...ms.splice(i, 1));
  }
  let best = -Infinity, bestMove = null, any = false, tried = 0;
  const pr = PRUNE.inner;
  const chk = pr ? !!inCheck(s, s.turn) : false;
  let fDepth = PRUNE.futilityDepth, fMargin = PRUNE.futilityMargin, lAfter = PRUNE.lmrAfter;
  if (pr) {
    let mat = 0;
    for (let i = 0; i < 64; i++) {
      const q = s.b[i];
      if (q && !P[q.t].royal) mat += P[q.t].value;
    }
    if (mat >= PRUNE.openMaterial) {
      fDepth = PRUNE.openFutilityDepth;
      fMargin = PRUNE.openFutilityMargin;
      lAfter = PRUNE.openLmrAfter;
    }
  }
  let stat = null;
  for (const m of ms) {
    const ns = tryMove(s, m);
    if (!ns) continue;
    any = true;
    tried++;
    const quiet = !s.b[m.to] && !m.promo && !m.drop && !m.epc;
    if (pr && quiet && !chk && d <= fDepth && tried > 1) {
      if (stat === null) stat = evalPos(s);
      if (stat + fMargin * d <= alpha) continue;
    }
    let red = 0;
    if (pr && quiet && !chk && d >= PRUNE.lmrMinDepth && tried > lAfter)
      red = tried > lAfter * 2 ? 2 : 1;
    if (red >= d) red = d - 1;
    let sc = -negamax(vanishPass(ns), d - 1 - red, -beta, -alpha, ply + 1);
    if (red && sc > alpha) sc = -negamax(vanishPass(ns), d - 1, -beta, -alpha, ply + 1);
    if (sc > best) {
      best = sc;
      bestMove = m;
    }
    if (best > alpha) alpha = best;
    if (alpha >= beta) {
      onCut(s, m, d, ply);
      break;
    }
  }
  if (!any) best = inCheck(s, s.turn) ? -(MATE - ply) : 0;
  if (best === -Infinity) return alpha;
  if (key) storeTransposition(key, d, best, best <= originalAlpha ? "upper" : best >= beta ? "lower" : "exact", bestMove, ply);
  return best;
}
var LEVELS = {
  easy: { d: 3, timeMs: 500, preferCheck: true, selection: { random: 0.1, lossBand: 0.6, suboptimal: 0.2, best: 0.1 } },
  normal: { d: 4, timeMs: 1e3, selection: { random: 0.05, lossBand: 0.15, suboptimal: 0.4, best: 0.4 } },
  hard: { d: 5, timeMs: 2e3, deepen: 1, timeOnlyAtPieces: 18, selection: { random: 0, lossBand: 0.01, suboptimal: 0.2, best: 0.79 } },
  // Lunatic 使用通用评估，不含手写开局原则项。
  lunatic: {
    d: 4,
    timeMs: 3e3,
    timeOnly: 1,
    deepen: 1,
    plain: 1,
    selection: { random: 0, lossBand: 0, suboptimal: 0, best: 1 }
  }
};
function drawMoveStrategy(selection = LEVELS.lunatic.selection) {
  const modes = ["random", "lossBand", "suboptimal", "best"];
  const weights = modes.map((k) => selection[k]);
  if (weights.some((w) => !Number.isFinite(w) || w < 0) || Math.abs(weights.reduce((a, b) => a + b, 0) - 1) > 1e-9)
    throw new Error("Move selection probabilities must sum to 1");
  if (selection.best === 1) return "best";
  const roll = Math.random();
  let cumulative = 0;
  for (let i = 0; i < modes.length; i++) {
    cumulative += weights[i];
    if (roll < cumulative) return modes[i];
  }
  return "best";
}
function chooseRankedMove(ranked, strategy, preferCheck = false) {
  if (!ranked.length) return null;
  if (strategy === "best" && !preferCheck || ranked.length === 1) return ranked[0];
  let pool;
  if (strategy === "best") {
    pool = ranked.filter((x) => x.v === ranked[0].v);
  } else if (strategy === "suboptimal") {
    pool = ranked.slice(1).filter((x) => x.v >= ranked[1].v - 100);
  } else if (strategy === "lossBand") {
    const loss = (x) => ranked[0].v - x.v;
    const distance = (x) => Math.max(100 - loss(x), loss(x) - 300, 0);
    const nearest = Math.min(...ranked.map(distance));
    pool = ranked.filter((x) => distance(x) === nearest);
  } else throw new Error("Unknown ranked move strategy: " + strategy);
  return chooseFromMovePool(pool, preferCheck);
}
function chooseFromMovePool(pool, preferCheck = false) {
  if (!pool.length) return null;
  if (preferCheck) {
    const checks = pool.filter((x) => {
      const ns = kid(x.m);
      return inCheck(ns, ns.turn);
    });
    if (checks.length) pool = checks;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}
var LEVEL_ALIAS = { cirno: "easy", baka: "easy", rinnosuke: "normal", human: "normal", patchouli: "hard", youkai: "hard", dev: "lunatic", eirin: "lunatic", sage: "lunatic" };
var resolveLevel = (k) => LEVEL_ALIAS[k] || k;
function lunaticMoveAt(s, depth) {
  const save = OPT.open;
  OPT.open = 0;
  try {
    return pickMove(s, depth);
  } finally {
    OPT.open = save;
  }
}
function lunaticMove(s, extraDepth) {
  const save = OPT.open;
  OPT.open = 0;
  try {
    return pickMove(s, depthFor(LEVELS.lunatic, s) + (extraDepth || 0));
  } finally {
    OPT.open = save;
  }
}
function depthFor(lv, s) {
  if (!lv.deepen) return lv.d;
  let n = 0;
  for (let i = 0; i < 64; i++) if (s.b[i]) n++;
  return lv.d + (n <= 7 ? 2 : n <= 18 ? 1 : 0);
}
function timedDepthFor(lv, s) {
  if (lv.timeOnly) return Infinity;
  if (lv.timeOnlyAtPieces !== void 0 && s.b.filter(Boolean).length <= lv.timeOnlyAtPieces) return Infinity;
  return depthFor(lv, s);
}
function rankMoves(s, d) {
  const ms = legalMoves(s);
  if (!ms.length) return [];
  for (let i = ms.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = ms[i];
    ms[i] = ms[j];
    ms[j] = t;
  }
  const sc = ms.map((m) => {
    checkDeadline(true);
    return { m, v: -negamax(kid(m), d - 1, -Infinity, Infinity, 1) };
  });
  sc.sort((a, b) => b.v - a.v);
  return sc;
}
var PRUNE = {
  on: 1,
  /* 根节点候选收窄 */
  /* 树内部的前向剪枝。只跳过安静走法（非吃子非升变非打入），
     而且被将军时完全不剪 —— 所以漏掉的是「中途出现重大劣势」那一类，
     不是所有战术。基线（不剪枝但浅）漏掉的战术更多，所以这个交换划算。
     inner=0 时 negamax 走精确路径，tests/golden.test.ts 测的就是那条。 */
  inner: 1,
  /* 用户授权默认开启 futility + LMR；实验可显式关闭 */
  futilityDepth: 2,
  /* 剩余深度 ≤ 这个值才做 futility */
  futilityMargin: 120,
  /* 每层余量（评估单位）。静态评估 + 余量仍低于 alpha 就跳过 */
  lmrAfter: 3,
  /* 前这么多手不削减 */
  lmrMinDepth: 3,
  /* 剩余深度 ≥ 这个值才削减 */
  /* 开局剪得更狠：开局分支因子最高，而多考虑一个开局候选的边际价值最低 ——
     只要剩下的开局成立就够，砍掉大部分开局不影响棋力。
     判据用场上子力（和 depthFor 用的是同一个信号）。 */
  openMaterial: 55,
  /* 双方非王子力合计 ≥ 这个值算开局 */
  openLmrAfter: 1,
  /* 开局阶段：第 2 手起就削减 */
  openFutilityDepth: 3,
  /* 开局阶段：剩余深度 ≤3 都做 futility */
  openFutilityMargin: 220,
  /* 层数 → 阈值（评估单位，100 = 1 分）。没列到的层沿用最后一个。
     越深阈值越紧：深层评估更可信，可以剪得更狠。 */
  margins: { 1: 1e9, 2: 1e9, 3: 200, 4: 70, 5: 30 },
  minCand: 2
  /* 至少留这么多候选，否则没有替代选择 */
};
function marginAt(d, mg) {
  if (mg[d] !== void 0) return mg[d];
  const ks = Object.keys(mg).map(Number).sort((a, b) => a - b);
  return mg[ks[ks.length - 1]];
}
function idSearch(s, maxDepth, opt) {
  opt = opt || {};
  const prune = opt.prune !== void 0 ? opt.prune : PRUNE.on;
  const mg = opt.margins || PRUNE.margins;
  const minC = opt.minCand !== void 0 ? opt.minCand : PRUNE.minCand;
  let cand = legalMoves(s);
  if (!cand.length) return { move: null, score: 0, depth: 0, cand: 0 };
  for (let i = cand.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = cand[i];
    cand[i] = cand[j];
    cand[j] = t;
  }
  let sc = cand.map((m) => ({ m, v: 0 }));
  let bm = sc[0].m, bv = 0, reached = 0;
  for (let d = 1; d <= maxDepth; d++) {
    checkDeadline(true);
    sc.sort((a, b) => b.v - a.v);
    const margin = marginAt(d, mg);
    bv = -negamax(kid(sc[0].m), d - 1, -Infinity, Infinity, 1);
    sc[0].v = bv;
    bm = sc[0].m;
    for (let i = 1; i < sc.length; i++) {
      checkDeadline(true);
      const lo = bv - margin;
      let v = -negamax(kid(sc[i].m), d - 1, -(bv + 1), -lo, 1);
      if (v > bv) {
        v = -negamax(kid(sc[i].m), d - 1, -Infinity, Infinity, 1);
        if (v > bv) {
          bv = v;
          bm = sc[i].m;
        }
      }
      sc[i].v = v;
    }
    reached = d;
    opt.onDepth?.({ move: bm, score: bv, depth: d, cand: sc.length });
    if (opt.stopOnMate && Math.abs(bv) > MATE / 2) break;
    if (prune && d < maxDepth) {
      const keep = sc.filter((e) => e.v > bv - margin);
      sc = keep.length >= minC ? keep : sc.slice(0, Math.max(minC, 1));
      if (sc.length <= 1) break;
    }
  }
  return { move: bm, score: bv, depth: reached, cand: sc.length };
}
function pickMove(s, d, selection = LEVELS.lunatic.selection, preferCheck = false) {
  srchRep = new Set(posHist);
  return withSearchCache(() => {
    const ms = legalMoves(s);
    if (!ms.length) return null;
    const strategy = drawMoveStrategy(selection);
    if (strategy === "random") return chooseFromMovePool(ms.map((m) => ({ m })), preferCheck).m;
    if (strategy !== "best" || preferCheck) return chooseRankedMove(rankMoves(s, d), strategy, preferCheck)?.m || ms[0];
    return idSearch(s, d, { prune: PRUNE.on }).move || ms[0];
  }, { hist: posHist });
}
function* analysisSteps(s, { hist = [], plain = true } = {}) {
  srchRep = new Set(hist);
  clearOrderTables();
  let prev = null;
  for (let depth = 1; ; depth++) {
    const start = performance.now(), ms = pseudoAll(s);
    if (!ms.length) return;
    if (prev) {
      const j = ms.findIndex((m) => m.from === prev.from && m.to === prev.to);
      if (j > 0) [ms[0], ms[j]] = [ms[j], ms[0]];
    }
    let best = null, bv = -Infinity, legal = 0;
    for (const m of ms) {
      const ns = tryMove(s, m);
      if (!ns) continue;
      legal++;
      const saved = OPT.open;
      let v;
      try {
        OPT.open = plain ? 0 : 1;
        v = withSearchCache(() => {
          if (legal === 1) return -negamax(vanishPass(ns), depth - 1, -Infinity, Infinity, 1);
          else {
            v = -negamax(vanishPass(ns), depth - 1, -(bv + 1), -bv, 1);
            if (v > bv) v = -negamax(vanishPass(ns), depth - 1, -Infinity, Infinity, 1);
            return v;
          }
        }, { hist });
      } finally {
        OPT.open = saved;
      }
      if (v > bv) {
        bv = v;
        best = m;
      }
      yield { progress: true };
    }
    if (!legal) return;
    prev = best;
    yield {
      depth,
      score: bv,
      ms: performance.now() - start,
      move: {
        from: best.from,
        to: best.to,
        promo: best.promo || null,
        drop: best.drop || null,
        castle: best.castle
      }
    };
  }
}
function timedMove(s, levelKey, { hist = [], timeMs, onDepth = () => {
}, tt = TT.enabled } = {}) {
  const lv = LEVELS[resolveLevel(levelKey)] || LEVELS.normal;
  const start = performance.now(), savedOpen = OPT.open;
  const ms = legalMoves(s);
  let completed = { move: ms[0] || null, score: null, depth: 0 };
  if (!ms.length) return { ...completed, ms: performance.now() - start };
  const budget = timeMs ?? lv.timeMs;
  if (!Number.isFinite(budget) || budget < 0) throw new Error("Invalid search time budget");
  setSearchState({ end: start + budget, rep: new Set(hist) });
  clearOrderTables();
  OPT.open = lv.plain ? 0 : 1;
  const remember = (result) => {
    completed = { ...result };
    onDepth({ ...completed, ms: performance.now() - start });
  };
  try {
    withSearchCache(() => {
      checkDeadline(true);
      const strategy = drawMoveStrategy(lv.selection);
      if (strategy === "random") {
        completed.move = chooseFromMovePool(ms.map((m) => ({ m })), lv.preferCheck).m;
      } else if (strategy !== "best" || lv.preferCheck) {
        for (let depth = 1; depth <= timedDepthFor(lv, s); depth++) {
          checkDeadline(true);
          const ranked = rankMoves(s, depth);
          const chosen = chooseRankedMove(ranked, strategy, lv.preferCheck);
          remember({ move: chosen.m, score: chosen.v, depth });
        }
      } else {
        idSearch(s, timedDepthFor(lv, s), { onDepth: remember, stopOnMate: true });
      }
    }, { hist, enabled: tt });
  } catch (error) {
    if (error !== EVABORT) throw error;
  } finally {
    OPT.open = savedOpen;
    clearSearchDeadline();
    srchRep = null;
  }
  return { ...completed, ms: performance.now() - start, tt: transpositionStats() };
}

// engine/pgn.ts
var START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
var ordinary = (t) => ["p", "n", "b", "r", "q", "k"].includes(t);
var square = (x) => {
  if (!/^[a-h][1-8]$/.test(x)) throw Error("Invalid square: " + x);
  return (8 - Number(x[1])) * 8 + x.charCodeAt(0) - 97;
};
var recordedMove = (m) => Object.fromEntries(["from", "to", "promo", "drop", "castle", "epc", "dbl", "cost"].filter((k) => m[k] !== void 0).map((k) => [k, m[k]]));
var sameMove = (a, b) => ["from", "to", "promo", "drop", "castle"].every((k) => (a[k] ?? null) === (b[k] ?? null));
function resolveRecordedMove(s, m) {
  const found = legalMoves(s).find((x) => sameMove(x, m));
  if (!found) throw Error("Illegal move: " + JSON.stringify(m));
  return found;
}
var nextPosition = (s, m) => vanishPass(applyMove(s, m));
function checkedState(s) {
  if (!s || !Array.isArray(s.b) || s.b.length !== 64 || !["w", "b"].includes(s.turn)) throw Error("Invalid initial position");
  const b = s.b.map((p) => {
    if (p === null) return null;
    if (!p || !Object.hasOwn(P, p.t) || !["w", "b"].includes(p.c) || ![void 0, 0, 1].includes(p.mark)) throw Error("Invalid piece");
    return { t: p.t, c: p.c, ...p.mark ? { mark: 1 } : {} };
  });
  for (const c of ["w", "b"]) if (b.filter((p) => p?.c === c && P[p.t].royal).length !== 1) throw Error("Exactly one royal per side is required");
  if (!Number.isInteger(s.half) || s.half < 0 || !Number.isInteger(s.full) || s.full < 1) throw Error("Invalid move counters");
  if (s.ep !== null && (!Number.isInteger(s.ep) || s.ep < 0 || s.ep > 63)) throw Error("Invalid en passant square");
  const cas = {};
  for (const k of ["w0", "w7", "b0", "b7"]) {
    if (typeof s.cas?.[k] !== "boolean") throw Error("Invalid castling rights");
    cas[k] = s.cas[k];
  }
  for (const c of ["w", "b"]) if (!Number.isFinite(s.ammo?.[c]) || s.ammo[c] < 0) throw Error("Invalid ammunition");
  const result = { b, turn: s.turn, cas, ep: s.ep, half: s.half, full: s.full, ammo: { w: s.ammo.w, b: s.ammo.b } };
  if (inCheck(result, s.turn === "w" ? "b" : "w")) throw Error("The side that just moved is in check");
  return result;
}
function fromFEN(fen) {
  const parts = fen.trim().split(/\s+/);
  if (parts.length !== 6) throw Error("FEN must have six fields");
  const [board, turn, rights, ep, half, full] = parts;
  const b = [];
  const rows = board.split("/");
  if (rows.length !== 8) throw Error("FEN must have eight ranks");
  for (const row of rows) {
    const start = b.length;
    for (const ch of row) {
      if (/[1-8]/.test(ch)) b.push(...Array(Number(ch)).fill(null));
      else if (/[pnbrqk]/i.test(ch)) b.push({ t: ch.toLowerCase(), c: ch === ch.toUpperCase() ? "w" : "b" });
      else throw Error("Unknown FEN piece");
    }
    if (b.length - start !== 8) throw Error("Invalid FEN rank");
  }
  if (!/^(?:-|K?Q?k?q?)$/.test(rights) || !rights || !/^\d+$/.test(half) || !/^\d+$/.test(full)) throw Error("Invalid FEN fields");
  const cas = { w7: rights.includes("K"), w0: rights.includes("Q"), b7: rights.includes("k"), b0: rights.includes("q") };
  const s = checkedState({ b, turn, cas, ep: ep === "-" ? null : square(ep), half: Number(half), full: Number(full), ammo: { w: 0, b: 0 } });
  for (const [flag, k, r, c] of [["w7", 60, 63, "w"], ["w0", 60, 56, "w"], ["b7", 4, 7, "b"], ["b0", 4, 0, "b"]]) {
    if (cas[flag] && !(b[k]?.t === "k" && b[k]?.c === c && b[r]?.t === "r" && b[r]?.c === c)) throw Error("Castling rights do not match king/rook");
  }
  if (b.some((p, i) => p?.t === "p" && (rank(i) === 0 || rank(i) === 7))) throw Error("Unpromoted pawn on last rank");
  if (s.ep !== null) {
    const pawn = s.ep + (turn === "w" ? 8 : -8);
    if (rank(s.ep) !== (turn === "w" ? 2 : 5) || b[s.ep] || b[pawn]?.t !== "p" || b[pawn]?.c === turn) throw Error("Invalid en passant target");
  }
  return s;
}
function toFEN(s) {
  if (s.b.some((p) => p && (!ordinary(p.t) || p.mark))) throw Error("Fairy pieces require TFC extension");
  const rows = [];
  for (let r = 0; r < 8; r++) {
    let row = "", empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = s.b[r * 8 + f];
      if (!p) {
        empty++;
        continue;
      }
      if (empty) {
        row += empty;
        empty = 0;
      }
      row += p.c === "w" ? p.t.toUpperCase() : p.t;
    }
    if (empty) row += empty;
    rows.push(row);
  }
  const rights = [["w7", "K"], ["w0", "Q"], ["b7", "k"], ["b0", "q"]].filter(([k]) => s.cas[k]).map(([, v]) => v).join("") || "-";
  return `${rows.join("/")} ${s.turn} ${rights} ${s.ep === null ? "-" : nm(s.ep)} ${s.half} ${s.full}`;
}
function san(s, m, moves = legalMoves(s)) {
  const p = s.b[m.from];
  let text;
  if (m.castle !== void 0) text = m.castle === 7 ? "O-O" : "O-O-O";
  else if (m.drop) text = `D${m.drop}_${nm(m.from)}_${nm(m.to)}`;
  else if (!ordinary(p.t)) text = `X${p.t}_${nm(m.from)}${s.b[m.to] || m.epc ? "x" : "-"}${nm(m.to)}` + (m.promo ? "=" + m.promo : "");
  else {
    const capture = !!(s.b[m.to] || m.epc);
    let dis = "";
    if (p.t !== "p") {
      const others = moves.filter((x) => !x.drop && x.from !== m.from && x.to === m.to && s.b[x.from]?.t === p.t);
      if (others.length) dis = others.every((x) => file(x.from) !== file(m.from)) ? nm(m.from)[0] : others.every((x) => rank(x.from) !== rank(m.from)) ? nm(m.from)[1] : nm(m.from);
    }
    text = (p.t === "p" ? capture ? nm(m.from)[0] : "" : p.t.toUpperCase() + dis) + (capture ? "x" : "") + nm(m.to) + (m.promo ? "=" + m.promo.toUpperCase() : "");
  }
  const next = nextPosition(s, m);
  return text + (inCheck(next, next.turn) ? hasLegal(next) ? "+" : "#" : "");
}
var normalized = (s) => s.replace(/0/g, "O").replace(/[!?]+$/, "").replace(/[+#]+$/, "");
var results = ["1-0", "0-1", "1/2-1/2", "*"];
function parsePGN(text) {
  if (typeof text !== "string" || text.length > 2e6) throw Error("PGN is too large");
  text = text.replace(/^\uFEFF/, "").replace(/^%[^\n]*$/gm, "").trim();
  const headers = /* @__PURE__ */ Object.create(null);
  let match;
  const tag = /^\[([A-Za-z0-9_]+)\s+"((?:\\.|[^"\\])*)"\s*\]\s*/;
  while (match = tag.exec(text)) {
    if (Object.hasOwn(headers, match[1])) throw Error("Duplicate PGN tag");
    headers[match[1]] = match[2].replace(/\\(["\\])/g, "$1");
    text = text.slice(match[0].length);
  }
  if (headers.Variant && !["Standard", "Chess", "Touhou Fairy Chess"].includes(headers.Variant)) throw Error("Unsupported Variant: " + headers.Variant);
  let initial;
  if (headers.Variant === "Touhou Fairy Chess") {
    if (headers.TFCVersion !== "1" || !headers.TFCState) throw Error("Unsupported or missing TFC version/state");
    initial = checkedState(JSON.parse(decodeURIComponent(headers.TFCState)));
  } else {
    if (headers.TFCState || headers.TFCVersion) throw Error("TFC tags require Variant");
    if (headers.SetUp && !["0", "1"].includes(headers.SetUp)) throw Error("Invalid SetUp tag");
    if (headers.SetUp === "1" && !headers.FEN) throw Error("SetUp requires FEN");
    initial = fromFEN(headers.FEN || START_FEN);
  }
  let clean = "", depth = 0, annotated = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") {
      annotated = true;
      const end = text.indexOf("}", i + 1);
      if (end < 0) throw Error("Unclosed comment");
      i = end;
      clean += " ";
      continue;
    }
    if (ch === ";") {
      annotated = true;
      const end = text.indexOf("\n", i);
      i = end < 0 ? text.length : end;
      clean += " ";
      continue;
    }
    if (ch === "(") {
      depth++;
      annotated = true;
      continue;
    }
    if (ch === ")") {
      if (!depth) throw Error("Unmatched variation");
      depth--;
      clean += " ";
      continue;
    }
    if (!depth) clean += ch;
  }
  if (depth) throw Error("Unclosed variation");
  if (/[\[\]{}]/.test(clean)) throw Error("Only one PGN game can be imported at a time");
  if (/\$\d+|[!?]/.test(clean)) annotated = true;
  clean = clean.replace(/\$\d+/g, " ").replace(/\d+\.(?:\.\.)?/g, " ");
  const moves = [], states = [initial], notations = [];
  let result = null;
  for (const token of clean.trim().split(/\s+/).filter(Boolean)) {
    if (results.includes(token)) {
      if (result !== null) throw Error("Multiple results");
      result = token;
      continue;
    }
    if (result !== null) throw Error("Moves after result");
    if (token === "e.p.") continue;
    if (moves.length >= 5e3) throw Error("Too many moves");
    const s = states.at(-1), legal = legalMoves(s), candidates = legal.filter((m2) => normalized(san(s, m2, legal)) === normalized(token));
    if (candidates.length !== 1) throw Error(`Ply ${moves.length + 1}: illegal or ambiguous SAN "${token}"`);
    const m = candidates[0];
    moves.push(recordedMove(m));
    notations.push(san(s, m, legal));
    states.push(nextPosition(s, m));
  }
  if (headers.Result && !results.includes(headers.Result)) throw Error("Invalid Result tag");
  if (result && headers.Result && result !== headers.Result) throw Error("Result tag and movetext disagree");
  return {
    initial,
    moves,
    states,
    notations,
    headers: { ...headers },
    result: result || headers.Result || "*",
    warnings: annotated ? ["Only the mainline is imported; comments, annotations and variations are omitted."] : []
  };
}
function exportPGN({ initial, moves, headers = {}, result = "*" }) {
  if (!results.includes(result)) throw Error("Invalid result");
  let s = checkedState(initial);
  const extension = s.b.some((p) => p && (!ordinary(p.t) || p.mark));
  const h = { Event: "?", Site: "?", Date: "????.??.??", Round: "?", White: "?", Black: "?", ...headers, Result: result };
  for (const key of ["FEN", "SetUp", "Variant", "TFCVersion", "TFCState"]) delete h[key];
  if (extension) {
    h.Variant = "Touhou Fairy Chess";
    h.TFCVersion = "1";
    h.TFCState = encodeURIComponent(JSON.stringify(s));
  } else {
    const fen = toFEN(s);
    if (fen !== START_FEN) {
      h.SetUp = "1";
      h.FEN = fen;
    }
  }
  const tokens = [];
  moves.forEach((record, i) => {
    const m = resolveRecordedMove(s, record);
    if (s.turn === "w") tokens.push(s.full + ".");
    else if (i === 0) tokens.push(s.full + "...");
    tokens.push(san(s, m));
    s = nextPosition(s, m);
  });
  tokens.push(result);
  const escape = (x) => String(x).replace(/[\r\n]/g, " ").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const lines = [];
  let line = "";
  for (const token of tokens) {
    if (line && line.length + token.length + 1 > 79) {
      lines.push(line);
      line = "";
    }
    line += (line ? " " : "") + token;
  }
  if (line) lines.push(line);
  return Object.entries(h).filter(([k]) => /^[A-Za-z0-9_]+$/.test(k)).map(([k, v]) => `[${k} "${escape(v)}"]`).join("\n") + "\n\n" + lines.join("\n") + "\n";
}

// engine/index.ts
function loadWeights(w) {
  applyWeights(w);
}
export {
  ALFIL,
  ALL8,
  B,
  BODIES,
  BUDGET,
  DABBABA,
  DIAG,
  EVABORT,
  GOLD,
  HEAVY,
  HITB,
  HITW,
  KNIGHT,
  LEAP7,
  LEVELS,
  LEVEL_ALIAS,
  MATE,
  OPT,
  ORTHO,
  P,
  PRUNE,
  REIMU_ATK,
  RULES,
  SANAE,
  SILVER,
  START_FEN,
  TEWI,
  TT,
  W,
  WEIGHTS,
  analysisSteps,
  applyMove,
  applyWeights,
  at,
  attacksFrom,
  buildState,
  canDeploy,
  chooseFromMovePool,
  chooseRankedMove,
  clearOrderTables,
  clearSearchDeadline,
  clearTranspositionTable,
  darkSet,
  def,
  depthFor,
  dollDropOK,
  drawMoveStrategy,
  evalPos,
  exportPGN,
  file,
  fmt,
  fromFEN,
  frozenSet,
  fw,
  hasLegal,
  idSearch,
  inCheck,
  isAttacked,
  kid,
  leapAtk,
  leapGen,
  legalMoves,
  lf,
  loadWeights,
  lunaticMove,
  lunaticMoveAt,
  mirrorSq,
  mscore,
  negamax,
  nextPosition,
  nm,
  notate,
  ok,
  order,
  outcome,
  parsePGN,
  pawnAtk,
  pawnGen,
  pickMove,
  pointsOf,
  posHist,
  posKey,
  promoOpts,
  pseudo,
  pseudoAll,
  pushPos,
  pushm,
  qsearch,
  rank,
  rankMoves,
  readySide,
  recordedMove,
  repCount,
  resolveLevel,
  resolveRecordedMove,
  rimDirs,
  royals,
  rt,
  san,
  setPosHist,
  setSearchState,
  slideAtk,
  slideGen,
  slotOf,
  srchEnd,
  srchNodes,
  srchRep,
  standardInsufficientMaterial,
  timedDepthFor,
  timedMove,
  toFEN,
  transparent,
  transpositionStats,
  tryMove,
  vanishPass,
  withSearchCache
};
