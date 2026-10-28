# Numeric engine rollout and reusable-state/key experiments

2026-10-28. Numeric boards and packed moves are now the production implementation. Reusable state frames and incremental position keys remain research prototypes: neither improved total search time in this experiment.

## What shipped

The shared `engine/` now stores an ordinary 64-element numeric board: zero is empty; five bits identify the piece, one its color and one its disappearance mark. Moves are packed numbers containing both squares, promotion/drop types, drop cost, castling, en passant and double-step flags. The TT stores that number directly instead of serializing/parsing a move signature.

[`representation.ts`](../engine/representation.ts) defines the encoding and stable numeric sorting. [`public.ts`](../engine/public.ts) converts public objects once at the search boundary. Recursive geometry, legality, evaluation and search operate directly on numbers. UI/Worker messages, PGN/FEN, editable public positions and root moves with `_n` children retain their existing interfaces. Public metadata/weight changes reach the same engine table. CLI and tests now import the canonical [`index.ts`](../engine/index.ts); internal modules use the numeric representation.

The 1,048,576-entry TT, deeper reuse, LMR, weights, rule behavior and difficulty budgets stay as previously configured. These representation changes preserve the measured search trees.

## Measured result

Same seven positions as the preceding study, depths 6 for five opening/middlegame positions and 9 for two endings. Six variants, five interleaved serial passes after shallower warm-up: **210 timed searches**. The prespecified primary analysis excludes the first complete pass uniformly, leaving 168 runs. Ratios use total paired elapsed time across the suite. The intervals resample complete repeat blocks; they measure repeat variability on this machine, not uncertainty across all chess positions or devices.

The production migration reduces time by **14.6%** against the saved production object implementation, which already had 1M TT and deeper reuse. The repeat-block interval is **12.0–17.4% less time**; throughput on this identical tree increases about **17.2%**. Nodes, scores, moves, completed depths and all TT statistics agree. There are **812,805 nodes per seven-position suite** in both implementations.

The following comparisons use the **new numeric/packed production engine** as baseline. Positive time changes mean slower.

| Research variant | Time change | 95% repeat-block interval | Node change |
|---|---:|---:|---:|
| Reusable state frames, still copying 64 squares | +23.5% | +9.4% to +41.4% | 0% |
| New hash layout, recomputed from the board | +5.5% | +1.7% to +8.6% | −0.29% |
| Same new hash, maintained incrementally | +17.8% | +15.2% to +21.0% | −0.29% |
| Reusable frames + incremental hash | +17.7% | +6.7% to +26.7% | −0.29% |

Recomputed and incremental keys use exactly the same TT layout and produce identical nodes, scores, moves, depth and TT statistics. Incremental maintenance is **11.7% slower than recomputing that hash**, with a +6.6% to +15.0% interval. This control separates maintenance cost from the effects of changing TT slots.

The hash layout visits **810,462 nodes** per suite, 2,343 fewer than production. All seven scores and chosen moves still agree here. A different hash layout can change ordering and selective search elsewhere; this is not a universal equivalence or playing-strength claim. Full position strings are verified after hash matches, so accidental hash collisions cannot supply another position's score.

## Scope and interpretation

The reusable-frame prototype retains one numeric board, state, castling object and ammo object per ply, plus a separate legality scratch frame. It overwrites all 64 squares, invalidates the reused board's frozen-set cache, safely inherits the no-freezer shortcut, and applies disappearance in place to exclusively owned child frames. Root children remain persistent. It removes repeated container allocation but replaces native array slicing with a copying loop. It is **not a make/unmake implementation**, and this negative result does not establish that make/unmake would fail.

The incremental prototype updates a deterministic Zobrist board hash for moved, captured, promoted, dropped, castling and en-passant pieces, and disappearance marks/removals. It mixes side, rights, en passant, ammo, halfmove clock and root/history/Q namespace at probe time. Public repetition keys remain unchanged strings. TT entries still retain exact position strings; this is not a compact numeric TT or a hash-only acceptance policy.

Maintaining a hash has a cost for each constructed child, including legality checks and internal quiescence positions that never probe the TT. The recomputed control only scans the board when building a TT key. The diagnostic counts below quantify that difference; they were collected separately from timing.

| One seven-position suite | Production | Recomputed hash | Incremental hash |
|---|---:|---:|---:|
| Constructed child positions | 992,750 | 990,273 | 990,273 |
| TT probes | 330,505 | 328,985 | 328,985 |
| Full-board hash scans | 0 | 328,985 | 7 |
| Full position strings, including repetition checks | 345,871 | 343,269 | 343,269 |

Incremental maintenance successfully eliminates almost all full-board hash scans, but updates about **3.01 child hashes per TT probe**. The hash variants still construct **327,903 exact TT strings for 328,985 probes (99.67%)**. They therefore add a numeric hash alongside almost all existing string construction, rather than removing that cost. The measured 11.7% slowdown is a net implementation result; these counts alone do not assign every millisecond to a particular operation or prove that a different exact-verification scheme cannot win. All 21 instrumented searches match the corresponding timing builds' nodes, scores and moves.

The timing run had substantial absolute-time drift and some slow frame samples. Every sample remains in the raw data; no outliers were removed. Including all five passes, the four experimental time changes are +21.4%, +6.3%, +17.7% and +19.3%. The median of the 28 paired frame/production ratios is +13.7%, compared with the aggregate +23.5%; the frame slowdown's precise size is consequently uncertain. Its direction was negative across these summaries. None of these intervals establishes performance on another JS runtime or mobile hardware.

## Correctness and application checks

- `npm run build && npm run test:all` passes, including all 305 unchanged golden assertions, generated bundles, Svelte integration, real Worker source executed in the Node Worker harness, PGN, TT policy/history checks and numeric representation checks. No live mobile-browser performance result is claimed.
- Production versus the frozen object engine: 253 positions, 6,127 transition comparisons, 7,542 attack-list comparisons and 28 searches covering 32-slot collision pressure/1M capacity and exact/deeper reuse. Search trees and TT statistics also match throughout the timed matrix.
- All five numeric experimental builds separately pass the 305 original goldens.
- Across those five builds: 30,635 transition comparisons and 37,710 attack-list comparisons on 253 positions, including every special move class and explicit disappearance edges.
- 112 paired search comparisons test storage equivalence or hash-layout equivalence at both table capacities and reuse policies. Another 21 searches force all hash values to collide and still match uncached exact searches. Six variants recover correctly after a deadline abort.
- Incremental hashes are compared with full recomputation at 518,406 searched positions across the two incremental variants. A separate 252-position check covers 12,168 transitions, including both colors' marking/removal edges, reused scratch frames and frozen-set cache identity.
- A short CLI game successfully uses the same public engine and returns JSONL.

## Evidence and reproduction

Raw timings, paired statistics, validation, diagnostics, build/test logs, generated research sources and source fingerprints are in `lab/out/state-key-research-20261028/` (Git-ignored). See [method and commands](../lab/out/state-key-research-20261028/METHOD.md) and [evidence archive](../lab/out/state-key-research-20261028/state-key-evidence.zip). Python schedules and analyzes the experiment in the `TouhouChess` environment; the Node boundary invokes generated shared-engine builds. No Python chess logic or separately maintained rules implementation was added.

The production decision is to keep numeric boards and packed moves, with the existing immutable child states and exact string position keys. The two further optimizations remain experiments. A future state experiment should measure make/unmake or a different frame-copy strategy independently; a future key experiment should account for unprobed quiescence/legality children and exact-identity storage costs.
