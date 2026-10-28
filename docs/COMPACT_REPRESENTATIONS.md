# Compact board and move representations

2026-10-28 · Apple M2 · Node v22.13.1 · Shared-source isolated prototypes

Subsequent implementation: numeric boards and packed moves have now shipped after the user's authorization. The full application boundary, fresh production measurements and reusable-state/incremental-key results are in [the rollout report](STATE_KEY_EXPERIMENTS.md). The prototype-only status statements below describe this earlier experiment.

## Production change completed first

The shared engine now defaults to **1,048,576 TT entries and deeper main-search score reuse**, as authorized by the user. The Svelte application, browser bundles, analysis/bot Workers and CLI use these same defaults. Generated files were rebuilt with the project build. No Q-cache prototype, bucket replacement or deferred generator was adopted. Difficulty budgets, selection probabilities, rules and weights are unchanged.

`npm run build && npm run test:all` passed, including the unchanged 305 goldens. Existing exact-horizon cache tests now select exact-depth mode explicitly; separate assertions verify the production defaults and actual deeper-score reuse. Additional assertions on two requests to the bot Worker source, running in the existing Node Worker harness, verify the 1M capacity and retained table. The updated Worker test passed; this does not substitute for browser/mobile performance measurements.

## Representation result

**Numeric board cells plus packed moves reduced elapsed time by 15.0% relative to the newly adopted 1M/deeper-reuse engine**, equivalent to 17.6% higher node throughput on the same tree. Every representation searched exactly the same nodes, returned the same score and move, and completed the same depth on every measured comparison.

Most of the gain comes from the numeric board representation. Packed moves alone have a small benefit. Ordinary numeric arrays and byte arrays with packed moves finish close together; this sample does not establish a reliable winner between them. These are Node measurements, not browser/mobile performance or playing-strength results.

The experiment measures only representation changes. It still allocates/copies child state, retains string position keys and scans the board for evaluation. It does not implement the report’s complete compact search core, preallocated state frames, make/unmake, incremental hashing or incremental evaluation. The earlier 1.5× continuation threshold was for that broader prototype; this narrower experiment reaches about 1.18×.

## Timing results

Seven established positions at depths 6/9; six representations; five serial interleaved passes = **210 complete timed searches**. Pass 0 is uniformly excluded from the primary analysis as planned in advance, leaving four passes / 168 searches. All-pass sensitivity is retained. Tables, history-token identity, move ordering and random seed reset for every search. Initial board conversion and final move decoding are included in the clock.

| Representation | Time change vs current production policy | Paired 95% interval | Node change | Search-result mismatches |
|---|---:|---|---:|---:|
| Current object board + object moves | +0.0% | +0.0% to +0.0% | 0.0% | 0 / 28 |
| Object board + packed moves | -1.7% | -2.8% to -0.5% | 0.0% | 0 / 28 |
| Numeric array board + object moves | -13.7% | -14.1% to -13.1% | 0.0% | 0 / 28 |
| Numeric array board + packed moves | -15.0% | -16.2% to -13.8% | 0.0% | 0 / 28 |
| Byte array board + object moves | -12.0% | -12.9% to -10.9% | 0.0% | 0 / 28 |
| Byte array board + packed moves | -14.5% | -14.8% to -14.3% | 0.0% | 0 / 28 |

Intervals resample whole repetition blocks over the fixed seven-position suite; they quantify observed repeat variability, not generalization to unseen positions. Raw heap deltas are retained as diagnostics but are not reported as peak-memory savings.

### Combined representation by position

| Position | Nodes, identical in all variants | Numeric array + packed moves: time change | Byte array + packed moves: time change |
|---|---:|---:|---:|
| 香草开局 | 77,496 | -14.9% | -12.4% |
| Nf3 d5 g3 | 101,877 | -15.9% | -15.5% |
| 香草展开后 | 299,128 | -16.9% | -17.1% |
| 灵梦透明穿透 | 121,161 | -14.6% | -12.1% |
| 爱丽丝可打入 | 69,901 | -12.4% | -14.7% |
| 王车对王 | 119,036 | -5.6% | -6.4% |
| 兵残局 | 24,206 | -8.9% | -5.1% |

### Sensitivity

Including all five passes, numeric-array/packed time is -15.5% and byte-array/packed time is -15.1%. Primary last-four values are -15.0% and -14.5% respectively. Repeated node/score/move/depth identities are deterministic for every configuration and fixture.

## What was changed in the prototype

- Piece type, color and disappearance mark become numeric fields. The byte-board variant uses 64 payload bytes for the squares, excluding the wrapper and all other state. The original board already shares piece objects between children; this is not eliminating 64 freshly allocated pieces per move. Numeric lookup also avoids repeated piece-object property access and string-indexed type-definition lookup.
- Packed moves preserve from/to, promotion, drop type and cost, castling side, en passant and double-step flags. They are generated directly in numeric form. The existing half-point drop cost is represented exactly.
- Sorting preserves the original stable order using reusable numeric score/move buffers. Previously attached child states move to a root-side map. Those costs are included in the measurements.
- Public object states convert once at the search boundary. The same maintained geometry, legality, evaluation and search functions are mechanically transformed; Python only orchestrates and summarizes experiments.
- No production compact representation was enabled. The prototype does not yet provide complete application/PGN integration, a permanent maintainable representation API, or browser/mobile performance acceptance.

## Equivalence evidence

- All six variants pass the 305 original golden assertions without changing their expected values.
- 253 positions, 36,762 move-transition comparisons and 45,252 attack-list comparisons across the six representations.
- 168 preliminary searches compare node/score/move/depth at both 32-slot collision pressure and 1M slots, with exact and deeper reuse.
- Generation order, sorted order, opening-aware/plain evaluation, checks, freezing, darkness, material draws, outcomes, state immutability and full position-key strings agree.
- Special moves include promotion, castling, en passant, pawn double steps and drops, with explicit disappearance/marking edges.
- The generated unchanged baseline matches the actual rebuilt production engine. Every full-depth measured run matches the reference search identity; no result-changing optimization is mixed into the timing claim.

## Evidence and reproduction

[Method and commands](../lab/out/compact-research-20261028/METHOD.md) · [Evidence ZIP](../lab/out/compact-research-20261028/compact-evidence.zip)

Raw JSONL, paired summaries, validation results, generated research source, source fingerprints and build/test logs are retained in `lab/out/compact-research-20261028/` (Git-ignored). The evidence archive includes this report and the required fixture source. Production implementation: [TT capacity](../engine/transposition.ts#L7), [reuse default](../engine/search.ts#L275), [TT policy tests](../tests/transposition.test.mjs), [real Worker checks](../tests/timed.test.mjs).
