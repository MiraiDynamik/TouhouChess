# Eirin TT interaction study

2026-10-28 · Apple M2 · Node v22.13.1 · Isolated research; production engine unchanged

Subsequent adoption: the user authorized 1M entries and deeper reuse after this study. They are now production defaults; [rollout validation and compact-representation research](COMPACT_REPRESENTATIONS.md) document the next step. The measurements below retain the original 32K baseline and frozen source identity.

## Findings

**Depth matters, but the measured components do not form an all-or-nothing dependency.** At depths 5/8, 1M entries plus deeper reuse save 4.0% time and 6.1% nodes. At depths 6/9, they save 13.6% time and 19.8% nodes. Deeper reuse alone with the original 32K table already saves 16.1% of nodes at the latter depth. The earlier shallow negative results therefore need a scope correction.

The original internal Q cache is not unlocked by those changes: at 1M/deeper it adds 11.2% time at depths 5/8 and 12.1% at depths 6/9, for only 1.6% and 1.5% additional node savings. At depths 6/9 the independently multiplied single-factor node ratios predict a 23.2% reduction; the actual all-three reduction is 21.0%, indicating overlapping benefits rather than a large positive combination effect.

Existing TT-move ordering already reduces nodes by 20.4% with default settings at depths 5/8, versus 23.3% with all three changes. At depths 6/9 those reductions are 24.9% and 25.4%. These are ablations of a selective search, not equal-strength proofs. The separate deferred-generation prototype preserves the search tree but has not shown a robust unlock from the original three factors. The requested 1M continuation below further tests replacement and selective Q lookup costs.

The requested 1M continuation independently reproduces the 19.8% node reduction from capacity plus deeper reuse; elapsed time falls 16.7% in that batch, compared with 13.6% in the preceding batch. Treat approximately 14–17% less time as the observed range, not a precise universal speedup. At 1M/deeper, selective Q lookup reduces the original Q overhead from 13.6% to 3.1% but still costs more time than it saves. Four-slot buckets add 4.9% time for 0.3% fewer nodes, and deferred generation adds 3.0% time with the ordinary 1M/deeper settings.

## Question and interpretation

Can main TT capacity, permission to reuse deeper results, and internal quiescence caching unlock each other? Does their combination improve the benefit of TT-move priority or deferred candidate generation?

These mechanisms can interact in principle. More retention can supply more reusable results, while deeper reuse can make retained entries usable. They can also overlap: a main-search cutoff removes the entire subtree, including opportunities for Q caching and deferred move generation. This experiment measures the specific existing Eirin implementations rather than inferring benefits from their presence in other engines.

Capacity is a count of stored positions, not a depth limit. A 32,768-slot table can store a depth-20 result. Eirin already prefers deeper entries against some replacements. The reuse switch changes whether a stored depth-8 score can satisfy a depth-6 request; it does not raise the actual search depth. Separately, the stored move can guide move order even when its score is ineligible. See [score eligibility and move priority](../engine/search.ts#L123) and [replacement policy](../engine/transposition.ts#L38).

The extra Q cache stores results inside the capture/check-evasion continuation after ordinary search reaches its horizon. Existing Eirin already caches complete Q-search entry results. A normal-search depth and a local Q budget are different quantities; this prototype retains their distinction. More Q entries do not automatically make deep main-search entries more reusable.

## Experimental scope

The main factorial varies 32,768 / 262,144 / 1,048,576 main TT entries, exact-depth / deeper-result reuse, extra internal Q cache off/on, and eager/deferred generation. It has 24 combinations. Eight additional controls remove existing TT-move priority while retaining TT score cutoffs and the other ordering heuristics.

The seven established fixtures are the starting position, Nf3 d5 g3, Spanish opening, Reimu transparency, Alice drops, KR vs K, and a pawn ending. Main depths are 5 for the first five and 8 for the endings. Six passes produce 1,344 timed searches. The first pass is retained but excluded from the primary timing summary because first-use variation remained after shallow warmup; the primary analysis contains five passes / 1,120 searches. All-pass sensitivity results are reported below.

A second full eager factorial at endpoint capacities increases depth by one (6/9), plus deferred and priority-disabled controls at baseline and fully combined settings: 12 configurations × 7 positions × 3 passes = 252 searches. The last two passes form the primary deeper timing summary. Another 112 searches use separate diagnostic bundles; their timings are not used.

All timed searches run sequentially. Order is randomized by fixture, reversed in adjacent passes and rotated between pass pairs. Tables, ordering state, history-token identity and random seed reset for each search. There is no time cutoff. Forced GC occurs before timing. This is a cold-table experiment with iterative deepening, not a continuous game with warm tables. Detailed method and exact reproduction commands: [METHOD.md](../lab/out/tt-interactions-20261028/METHOD.md).

The Q-on factor is the earlier `qcache2` prototype: a **separate** fixed-slot table as large as the main TT, local Q plies 0–3 only, exact local-horizon identity and normalized mate distance. Q-on therefore gets extra memory. It does not implement Stockfish-style shared main/Q entries, arbitrary-depth Q reuse, cheap incremental hashing, or selective capture pruning. Conclusions about this Q cache must not be generalized to all Q-cache designs.

“Priority” means Eirin’s already-enabled main-search TT-move ordering. “Deferred” keeps that priority but delays generating the other candidates, preserving the original ordering via history/killer snapshots. Disabling priority changes search order and can change LMR results.

## Main factorial: change relative to default

Lower time or node count is better. Time ratios use the sum of measured search times. Intervals are paired 95% bootstrap intervals resampling complete repetition blocks over this fixed seven-position suite; they do not measure generalization to new positions.

| Main TT entries | Deeper reuse | Extra Q cache | Time change | Timing interval | Node change | Score / move differences |
|---:|:---:|:---:|---:|---|---:|---:|
| 32,768 | False | False | +0.0% | +0.0% to +0.0% | +0.0% | 0 / 0 of 35 |
| 32,768 | False | True | +8.2% | +7.0% to +9.5% | -1.7% | 0 / 0 of 35 |
| 32,768 | True | False | +0.9% | -3.8% to +8.2% | -3.9% | 0 / 0 of 35 |
| 32,768 | True | True | +6.9% | +5.7% to +8.1% | -5.5% | 0 / 0 of 35 |
| 262,144 | False | False | +0.6% | -2.6% to +4.0% | -2.3% | 0 / 0 of 35 |
| 262,144 | False | True | +9.5% | +7.9% to +10.8% | -3.9% | 0 / 0 of 35 |
| 262,144 | True | False | -0.0% | -2.7% to +2.9% | -5.8% | 0 / 0 of 35 |
| 262,144 | True | True | +8.4% | +5.9% to +10.4% | -7.4% | 0 / 0 of 35 |
| 1,048,576 | False | False | +1.0% | -3.7% to +9.0% | -1.8% | 0 / 0 of 35 |
| 1,048,576 | False | True | +9.0% | +6.7% to +10.6% | -3.4% | 0 / 0 of 35 |
| 1,048,576 | True | False | -4.0% | -6.5% to -1.5% | -6.1% | 0 / 0 of 35 |
| 1,048,576 | True | True | +6.8% | +5.1% to +8.7% | -7.6% | 0 / 0 of 35 |

## Interaction rather than isolated effects

The independent multiplicative prediction is `(capacity-only/default) × (deeper-only/default) × (Q-only/default)`. An observed combined ratio below that prediction indicates a beneficial interaction under this measure; above it indicates less benefit than independent multiplication predicts. This diagnostic is not an assumption that mechanisms actually act independently.

| Workload | Metric | Independent prediction | Observed all-three combination | Observed / prediction |
|---|---|---:|---:|---:|
| Depth 5/8 | ms | 1.1021 | 1.0678 | 0.9689 |
| Depth 5/8 | nodes | 0.9274 | 0.9237 | 0.9960 |
| Depth 6/9 | ms | 0.9278 | 0.9682 | 1.0435 |
| Depth 6/9 | nodes | 0.7683 | 0.7897 | 1.0278 |

### Conditional effects

| Change | Other settings | Time change | Timing interval | Node change |
|---|---|---:|---|---:|
| q_on | 32,768 entries; deeper=0 | +8.2% | +7.0% to +9.5% | -1.7% |
| deep_on | 32,768 entries; Q=0 | +0.9% | -3.8% to +8.2% | -3.9% |
| deep_on | 32,768 entries; Q=1 | -1.2% | -2.5% to -0.2% | -3.9% |
| q_on | 32,768 entries; deeper=1 | +6.0% | -1.0% to +10.5% | -1.7% |
| q_on | 1,048,576 entries; deeper=0 | +7.9% | +0.4% to +13.7% | -1.6% |
| deep_on | 1,048,576 entries; Q=0 | -4.9% | -10.6% to -0.2% | -4.4% |
| deep_on | 1,048,576 entries; Q=1 | -2.0% | -4.3% to +0.4% | -4.4% |
| q_on | 1,048,576 entries; deeper=1 | +11.2% | +8.6% to +14.0% | -1.6% |

## Existing TT priority versus deferred generation

Each row compares the named feature with its counterpart under the same capacity/reuse/Q settings. For `priority_on`, the reference is priority disabled; for `deferred`, the reference is ordinary eager generation with TT priority already on.

| Feature | Entries | Deeper | Q cache | Time change | Timing interval | Node change |
|---|---:|:---:|:---:|---:|---|---:|
| deferred | 32,768 | False | False | -0.8% | -2.2% to +0.2% | +0.0% |
| priority_on | 32,768 | False | False | -19.9% | -20.8% to -19.2% | -20.4% |
| deferred | 32,768 | False | True | +0.8% | -0.9% to +2.9% | +0.0% |
| priority_on | 32,768 | False | True | -21.4% | -22.4% to -20.6% | -20.4% |
| deferred | 32,768 | True | False | -2.8% | -8.7% to +1.5% | +0.0% |
| priority_on | 32,768 | True | False | -22.2% | -23.8% to -20.6% | -23.2% |
| deferred | 32,768 | True | True | +0.2% | -1.1% to +1.6% | +0.0% |
| priority_on | 32,768 | True | True | -26.0% | -29.3% to -23.2% | -23.2% |
| deferred | 262,144 | False | False | +2.1% | -1.5% to +4.7% | +0.0% |
| deferred | 262,144 | False | True | +4.7% | +2.4% to +8.5% | +0.0% |
| deferred | 262,144 | True | False | -2.8% | -5.2% to -0.4% | +0.0% |
| deferred | 262,144 | True | True | +2.9% | -0.8% to +7.6% | +0.0% |
| deferred | 1,048,576 | False | False | -0.7% | -9.0% to +5.4% | +0.0% |
| priority_on | 1,048,576 | False | False | -18.7% | -19.7% to -17.6% | -19.9% |
| deferred | 1,048,576 | False | True | +1.7% | +0.3% to +2.9% | +0.0% |
| priority_on | 1,048,576 | False | True | -21.3% | -22.6% to -19.7% | -19.9% |
| deferred | 1,048,576 | True | False | +3.6% | +0.5% to +7.3% | +0.0% |
| priority_on | 1,048,576 | True | False | -23.3% | -24.3% to -22.4% | -23.3% |
| deferred | 1,048,576 | True | True | +2.9% | -0.1% to +6.2% | +0.0% |
| priority_on | 1,048,576 | True | True | -24.4% | -26.0% to -22.6% | -23.3% |

## One-ply-deeper follow-up

| Entries | Deeper reuse | Q cache | Time change | Node change | Score / move differences |
|---:|:---:|:---:|---:|---:|---:|
| 32,768 | False | False | +0.0% | +0.0% | 0 / 0 of 14 |
| 32,768 | False | True | +10.0% | -1.6% | 0 / 0 of 14 |
| 32,768 | True | False | -12.6% | -16.1% | 2 / 0 of 14 |
| 32,768 | True | True | +0.1% | -17.4% | 2 / 0 of 14 |
| 1,048,576 | False | False | -3.5% | -6.9% | 0 / 0 of 14 |
| 1,048,576 | False | True | +6.4% | -8.4% | 0 / 0 of 14 |
| 1,048,576 | True | False | -13.6% | -19.8% | 2 / 0 of 14 |
| 1,048,576 | True | True | -3.2% | -21.0% | 2 / 0 of 14 |

### Combined setting by position

| Position | Original depth: time / nodes | Extra ply: time / nodes |
|---|---:|---:|
| 香草开局 | +16.0% / -1.1% | +11.1% / -7.2% |
| Nf3 d5 g3 | +4.5% / -2.4% | +11.8% / -2.0% |
| 香草展开后 | +4.7% / -4.0% | -2.6% / -13.0% |
| 灵梦透明穿透 | +13.7% / +1.3% | +24.8% / -1.5% |
| 爱丽丝可打入 | +7.5% / -8.1% | -35.4% / -43.9% |
| 王车对王 | -4.5% / -24.0% | -37.1% / -46.5% |
| 兵残局 | +27.1% / -6.4% | +2.7% / -9.2% |

## Requested continuation: hold capacity at 1M

A separate interleaved batch contains 210 searches (ten configurations × seven positions × three passes), all at depths 6/9. The last two passes are the primary summary; every configuration has a contemporaneous baseline. Compare timings within this batch rather than mixing times from separate runs.

The bucket variant keeps total main capacity at 1,048,576 but gives each indexed bucket four candidate entries and retains deeper/exact results preferentially. `qcheck` caches only internal check evasions at local Q plies 1–3. `qguard` caches local Q plies 1–3 only after a failed stand-pat cutoff test. Both reuse the already-computed check/evaluation state, keep the exact local Q horizon, and use a separate Q table. Existing main TT caching already handles Q entry results.

| Variant | Time vs original default | Nodes vs original default | Time vs 1M + deeper | Nodes vs 1M + deeper | Score / move differences vs default |
|---|---:|---:|---:|---:|---:|
| baseline | +0.0% | +0.0% | +20.0% | +24.7% | 0 / 0 of 14 |
| 1m-exact | -8.5% | -6.9% | +9.8% | +16.1% | 0 / 0 of 14 |
| 1m-deep | -16.7% | -19.8% | +0.0% | +0.0% | 2 / 0 of 14 |
| 1m-deep-qall | -5.4% | -21.0% | +13.6% | -1.5% | 2 / 0 of 14 |
| 1m-deep-qcheck | -15.2% | -19.9% | +1.8% | -0.1% | 2 / 0 of 14 |
| 1m-deep-qguard | -14.1% | -21.0% | +3.1% | -1.5% | 2 / 0 of 14 |
| 1m-bucket | -12.6% | -20.1% | +4.9% | -0.3% | 2 / 0 of 14 |
| 1m-bucket-qguard | -9.0% | -21.3% | +9.2% | -1.8% | 2 / 0 of 14 |
| 1m-deep-deferred | -14.2% | -19.8% | +3.0% | +0.0% | 2 / 0 of 14 |
| 1m-bucket-qguard-deferred | -7.8% | -21.3% | +10.6% | -1.8% | 2 / 0 of 14 |

### Q overhead in the 1M continuation

| Cache policy, ordinary main TT | Probes | Cutoffs | Cutoffs / probes | Stores |
|---|---:|---:|---:|---:|
| 1m-deep-qall | 707,628 | 14,996 | 2.12% | 692,632 |
| 1m-deep-qcheck | 19,746 | 856 | 4.34% | 18,890 |
| 1m-deep-qguard | 216,800 | 10,616 | 4.90% | 206,184 |

Q counts above cover two complete suites. They describe cache management, not independent saved nodes: a cache return can remove an entire subtree, and many Q returns would otherwise be cheap.

All three passes give 1M/deeper time -15.7% versus -16.7% in the primary last-two summary. The two deferred/eager comparisons have 0 full-depth node/score/move/depth mismatches across 42 pairs. Extra prototype validation passed three sets of 305 unchanged golden assertions, 5,400 Q-window checks, and 14 preliminary search pairs.

This follow-up tests retention and selective lookup policies while keeping the object/string implementation. It does not claim to reproduce all aspects of a modern compact TT. Small time differences from two measured passes are provisional. Full timing intervals and all-pass sensitivity are retained in `extended.summary.json`.


## Mechanism counts (untimed diagnostic run)

Main counts distinguish a cache hit from a depth-eligible hit and an actual early return. Q cutoffs below are for the extra internal Q cache, excluding Eirin’s existing Q-entry TT cache.

| Entries / deeper / Q | Main hits | Depth-eligible hits | Main TT cutoffs | Existing Q-entry cutoffs | Extra Q probes / cutoffs |
|---|---:|---:|---:|---:|---:|
| 32,768 / 0 / 0 | 22,301 | 14,197 | 13,479 | 24,781 | 0 / 0 |
| 32,768 / 0 / 1 | 22,301 | 14,197 | 13,479 | 24,781 | 178,459 / 5,689 |
| 32,768 / 1 / 0 | 17,401 | 11,928 | 10,933 | 19,326 | 0 / 0 |
| 32,768 / 1 / 1 | 17,401 | 11,928 | 10,934 | 19,326 | 176,768 / 5,259 |
| 1,048,576 / 0 / 0 | 24,384 | 15,671 | 14,871 | 27,736 | 0 / 0 |
| 1,048,576 / 0 / 1 | 24,384 | 15,671 | 14,871 | 27,736 | 171,614 / 4,404 |
| 1,048,576 / 1 / 0 | 18,245 | 12,438 | 11,432 | 21,357 | 0 / 0 |
| 1,048,576 / 1 / 1 | 18,245 | 12,438 | 11,433 | 21,357 | 169,911 / 4,148 |

| Deferred setting | TT move opportunities | First-TT-move cutoffs | Full candidate lists avoided | Candidates avoided in full lists* |
|---|---:|---:|---:|---:|
| 32,768 / 0 / 0 | 8,822 | 4,274 | 4,274 | 65,275 |
| 1,048,576 / 1 / 1 | 6,812 | 3,078 | 3,078 | 52,242 |

*Excludes candidates created while validating the TT move from its own piece. This is not a count of total object allocations saved.


## Sensitivity, correctness and limits

- All six original passes: combined time +9.0%; primary last five passes: +6.8%. Both summaries and every raw sample are retained.
- Combined prototype: 305 existing golden checks passed. Q-window validation: 10,800 checks; 112 search-equivalence pairs passed.
- Main timing matrix: deterministic score/move/nodes per configuration and fixture = True; deferred/eager failures = 0. Deeper follow-up deferred/eager failures = 0.
- Different scores/moves under larger tables, deeper reuse or priority removal are reported, not hidden by rewriting goldens. These research policies can alter selective search. There is no fixed-time playing-strength or tournament result here.
- Seven positions, mostly opening/constructed/endgame fixtures, are not a population sample of all games. Cold tables and one additional ply do not settle long searches or warm cross-move reuse. Timing has limited repetitions, especially at the extra depth.
- At depths 6/9, the 1M/deeper variant ends with 9,608–46,888 occupied main slots per position (at most 4.5% of nominal capacity), versus 8,564–25,441 slots with the original 32K/default variant. Direct-mapped collisions can occur before a table is full, so occupancy alone is not a hit-rate measure. These tests do not exhaust the 1M capacity or establish its benefit in much longer searches; `audit.json` retains per-position occupancy.
- The deferred generator retains the earlier prototype’s snapshot costs. These results do not evaluate a redesigned compact move picker.
- Source fingerprints remain in `manifest.json`; frozen-engine fingerprint verification and normal project checks are recorded separately. Research bundles are generated from the sole maintained `engine/` implementation.

Production verification: `npm run build && npm run test:all` passed, including the unchanged 305 goldens. All 12 engine/weight source fingerprints match the initial manifest. The full output is retained as `project-checks.log`; evidence hashes are in `evidence-manifest.json`. No production engine defaults were changed.

## Evidence and reproduction

[Raw data and scripts](../lab/out/tt-interactions-20261028/METHOD.md) are in `lab/out/tt-interactions-20261028/` (Git-ignored). `matrix.jsonl`, `deeper.jsonl`, `extended.jsonl`, `diagnostic.jsonl`, their metadata and summary JSON files preserve the measurements. There are 1,806 completed timed searches and 112 separate diagnostic searches, excluding warmups, correctness checks and the explicitly discarded incomplete launch. [Evidence ZIP](../lab/out/tt-interactions-20261028/tt-interaction-evidence.zip) preserves the measurements, generated variants, scripts, required prior prototype files, report and checksums.
