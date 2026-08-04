# perf-baselines — RETIRED 2026-08-04 (audit F1654 / D58)

This directory held locked perf baselines and CI rule data for the shortcut-submit
refactor rail. **Its runner is gone and its numbers were wrong, so it is retired.**
This file is all that remains, on purpose: so a future reader who finds a `plans/perf-baselines/…`
path in the older plans (they are plentiful — `shortcut-submit-architecture-refactor-plan.md`,
`shortcut-submit-investigation-log.md`, `search-js-frame-budget-optimization-plan.md`)
learns what happened instead of hunting a deleted file.

## Git ref

Everything below is recoverable at **`0059c6fbd071d3a9e8a64f1d11355666968fe918`**
(`git show 0059c6fbd:plans/perf-baselines/<file>`).

## What was banked here, and why each went

| File                                | Fate              | Why                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`                         | deleted           | Its own documented update flow ran `scripts/perf-shortcut-local-ci.sh record-baseline` — a script that does not exist in the repo. A doc whose one command cannot run is worse than no doc.                                                                                                                                                                                      |
| `perf-shortcut-live-baseline.json`  | deleted           | 28 KB of locked JS/UI promotion baselines. Its ONLY runner was that same missing `perf-shortcut-local-ci.sh`. Nothing in the tree read it (banking re-grep: hits only in `plans/` archaeology + `audit/`). Its numbers are also no longer meaningful — `shortcut-submit-investigation-log.md:15` already records that its JS floor of 1.3 does not describe the shipped runtime. |
| `runtime-owner-loc-baseline.json`   | deleted           | A pure orphan: ZERO consumers anywhere (grep found only itself, the README, and `audit/`). It pinned `apps/mobile/src/screens/Search/index.tsx` at `baselineLoc 10634 / maxDelta 0` against a file that is ~87 lines today — off by more than 100x, and unable to say so because nothing ran it.                                                                                 |
| `runtime-root-ownership-gates.json` | **MOVED**, pruned | Now `scripts/search-runtime-root-ownership-gates.json`, next to its runner `scripts/search-runtime-root-ownership-gate.sh`. A gate reaching up out of `scripts/` into `plans/` for its truth is exactly how the rules and the tree rotted apart.                                                                                                                                 |

## The pruned slices (state at retirement, measured by running all ten by hand)

The rules file declared ten `enforcedSliceIds` while CI (`.github/workflows/ci.yml`)
consulted exactly **one** (S7). The other nine were unread, and five of them had been
exiting 1 for weeks where nobody could see — F702's disease in a second location.

| Slice | Exit             | Disposition                                                                                                                                                  |
| ----- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S7    | 0 (2 checks)     | KEPT — the one slice CI runs.                                                                                                                                |
| S8    | 0 (6 checks)     | KEPT — every declared path resolves.                                                                                                                         |
| S9B   | 0 (7 checks)     | KEPT — every declared path resolves.                                                                                                                         |
| S9C   | 0 (4 checks)     | KEPT — every declared path resolves.                                                                                                                         |
| S11   | **1** (8 checks) | KEPT — and it is RED for a TRUE reason (see below), not a stale path.                                                                                        |
| S9A   | 1                | DELETED — 2 dead paths (`map-presentation-controller.ts`, `map-diff-applier.ts`).                                                                            |
| S9D   | 1                | DELETED — 1 dead path (`profile-runtime-controller.ts`).                                                                                                     |
| S9E   | 1                | DELETED — 1 dead path (`shortcut-harness-observer.ts`).                                                                                                      |
| S9F   | 1                | DELETED — 1 dead path (`use-search-runtime-composition.ts`).                                                                                                 |
| S10   | 1                | DELETED — 4 dead paths (`polls-runtime-controller.ts`, `polls-autocomplete-owner.ts`, `use-onboarding-auth-lane.ts`, `use-navigation-bootstrap-runtime.ts`). |

Every deleted slice failed the same way — `Check <id> path does not exist` — naming files
that later refactors legitimately removed. The rule was measuring a tree that no longer
exists. The kept slices are exactly those whose every declared path resolves.

**S11 is a real RED, left standing on purpose.** Its only failing check is
`s11_no_console_log_submit_runtime`: a `__DEV__`-guarded `console.log('[FITALL] …')` at
`apps/mobile/src/screens/Search/hooks/use-search-submit-owner.ts:337`, which the slice bans
by name ("S11 requires removal of submit-runtime console logging debug probes"). That is
the rail working — a live guard catching a live violation the moment anyone ran it.
Deleting a dev probe is an owner call and was out of D58's scope, so the RED is recorded
rather than silenced. **Do not wire S11 into CI until that probe is resolved** (CI still
runs S7 only).
