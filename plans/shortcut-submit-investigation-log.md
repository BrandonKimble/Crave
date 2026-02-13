# Shortcut Submit Performance Investigation Log (Compacted)

Last updated: 2026-02-13 03:20
Owner: Codex autonomous loop sessions

## Objective

- Primary: raise shortcut-submit JS floor toward `>=25` with UX parity.
- Secondary: reduce JS stall p95 materially and repeatably.
- Decision metric: JS metrics first, UI FPS second.

## Active Thread Latch

- Strict no-checkpoint autonomy is ON for the current user thread.
- Current user-requested stop condition: report only when JS floor improves by `>+20` (or when a hard blocker requires user action).

## Canonical Harness Command

```bash
EXPO_FORCE_START=1 \
FOLLOW_METRO_LOGS=1 \
EXPO_PUBLIC_PERF_HARNESS_START_DELAY_MS=3000 \
EXPO_PUBLIC_PERF_HARNESS_RUNS=3 \
yarn ios:device:perf-shortcut-loop
```

Iteration mode: `runs=1-3` with all other knobs fixed.
Promotion mode for keep/revert confidence: `runs=6-8`.

## Current Status Snapshot

### Active conclusion

- The floor remains constrained by pre-response/visual-sync map churn and synchronous hydration/list commit windows.
- Moving coverage work outside settle windows shortens settle duration but does not lift floor materially.
- Recent architecture probes continue to shift _where_ the dip occurs (`coverage_loading` -> `results_hydration_commit`/`marker_reveal_state`) rather than removing the long frame.

### Latest key metrics (high signal only)

Metric method: per-run minimum JS sampler `floorFps` from `shortcut_loop_run_start` to `shortcut_loop_run_complete`, then mean across runs.

Calibration note (2026-02-13):

- parser/comparator contract is now schema-locked as `perf-shortcut-report.v1`,
- `stallMaxMean` and `stallP95` are computed from `[SearchPerf][JsFrameSampler]` window `stallLongestMs` values only,
- parser/comparator now also gate UI-lane metrics (`uiFloorMean`, `uiStallP95`, `uiStallMaxMean`),
- local CI path now enforces sampler defaults (`JS/UI windowMs=120`, `JS/UI fpsThreshold=240`) to guarantee parser window coverage,
- comparator now hard-fails when required metrics are missing (JS + UI),
- comparator enforces minimum expected/completed runs (`PERF_MIN_RUNS`, default `3`) for baseline and candidate,
- comparator enforces baseline/candidate harness signature parity (`harnessSignatureStable`) and environment parity (`launchTargetMode`, `runtimeTarget`, `launchPreferDevice`),
- catastrophic gate is absolute (candidate can fail even when baseline is already catastrophic),
- local gate flow (`bash ./scripts/perf-shortcut-local-ci.sh gate`) is the promotion source of truth until hosted live perf CI is reintroduced.

- Fresh baseline (`covdelay-base`):

  - log: `/Users/brandonkimble/crave-search/plans/perf-logs/perf-shortcut-loop-20260212T025050Z-covdelay-base.log`
  - JS floor mean: `3.27`
  - JS stall max mean: `219.4ms`
  - dominant floor stage: `coverage_loading`

- Candidate (`phaseA=4 + phaseB step4/80 + coverage post-settle delay 700ms`):

  - log: `/Users/brandonkimble/crave-search/plans/perf-logs/perf-shortcut-loop-20260212T025210Z-covdelay-phaseA4.log`
  - JS floor mean: `3.23` (`-0.03`)
  - JS stall max mean: `256.6ms` (`+37.2ms`)
  - run duration mean: `887.1ms` (`-888.7ms`)
  - dominant floor stage moved to `results_hydration_commit` / `marker_reveal_state`

- Candidate (`phaseA=4 + coverage delay + keep previous markers during loading`):

  - log: `/Users/brandonkimble/crave-search/plans/perf-logs/perf-shortcut-loop-20260212T025330Z-covdelay-phaseA4-keepprev.log`
  - JS floor mean: `3.17` (`-0.10`)
  - JS stall max mean: `230.5ms` (`+11.1ms`)
  - run duration mean: `1197.7ms` (`-578.1ms`)
  - dominant floor stage: `marker_reveal_state`

- Candidate (`map presentation freeze during submit`):

  - baseline log: `/Users/brandonkimble/crave-search/plans/perf-logs/perf-shortcut-loop-20260212T024500Z-mapfreeze-off.log`
  - candidate log: `/Users/brandonkimble/crave-search/plans/perf-logs/perf-shortcut-loop-20260212T024620Z-mapfreeze-on.log`
  - floor delta: `-0.87` (regression)
  - stall delta: `+60.7ms` (regression)

- Validation run (`P0.5 live harness wiring verification`, `runs=1`):

  - log: `/Users/brandonkimble/crave-search/plans/perf-logs/perf-shortcut-loop-20260213T023338Z-signin-rerun.log`
  - report: `/Users/brandonkimble/crave-search/plans/perf-logs/perf-shortcut-loop-20260213T023338Z-signin-rerun.report.json`
  - parser schema: `perf-shortcut-report.v1`
  - marker integrity: `complete=true` (all `shortcut_loop_*` markers present)
  - JS floor mean: `2.9`
  - JS stall max mean: `346.9ms`
  - dominant floor stage: `results_list_materialization`
  - note: JS/UI sampler `shortcutElapsedMs` and `shortcutStageAgeMs` are now non-negative in live logs.

- Local CI baseline lock refresh (`sampler window lock enabled`, `runs=1`):
  - log: `/Users/brandonkimble/crave-search/plans/perf-logs/perf-shortcut-live-baseline-20260213T024410Z.log`
  - report: `/Users/brandonkimble/crave-search/plans/perf-baselines/perf-shortcut-live-baseline.json`
  - parser schema: `perf-shortcut-report.v1`
  - marker integrity: `complete=true`
  - JS floor mean: `1.3`
  - JS stall p95: `695.86ms`
  - JS stall max mean: `776.5ms`
  - gate check: `scripts/perf-shortcut-local-ci.sh gate ...` passes against the P0.5 validation candidate log.
  - note: this is a `runs=1` lock for tooling readiness; refresh to `runs=3` in target environment before slice-promotion decisions.

### What this means

- Coverage deferral can reduce measured settle time but does not solve the floor problem.
- Floor is now repeatedly pinned by `results_hydration_commit` and/or pre-response `marker_reveal_state` map transitions.
- P0.5 harness runtime wiring and metric contract are now verified end-to-end; refactor slices no longer need to wait on instrumentation reactivation.
- The target `>+20` floor lift remains unmet by a wide margin.

## Proven Root-Cause Findings

1. A long synchronous JS window persists around `submit_resolved -> results_hydration_commit`.

- Evidence: repeated floor stages at `results_hydration_commit` under phase-split candidates even when coverage is deferred.

2. Pre-response map dataset churn contributes severe dips in some runs (`marker_reveal_state`).

- Evidence: low-floor runs with map dataset swaps before full visual-sync release, especially on run 2/3 in loop mode.

3. Suppression/probe truthfulness was previously incomplete and is now corrected in code.

- Evidence: map-disable now gates upstream derivations; placeholder/top-food probes are env-effective without perf debug master.

4. Coverage work is additive but not sole root cause.

- Evidence: moving coverage beyond settle changed duration/final stage but floor remained near `~3`.

## Accepted Improvements (Keep)

- Split release transition (default path).
- Cached-fit line-width skip in `restaurant-result-card`.
- Hydration immediate-commit fast path (when render gate not required).
- iOS refresh/simulator reliability guard.
- Default reveal/ramp shape `4 -> 12 -> 20`.
- Harness hardening:
  - run-id scoped logs
  - marker-based completion validation
  - auto-stop on configured runs
  - default `startDelay=3000`, `runs=3`
- Harness-state safety when submit trace is disabled.
- Sheet-owned ramp ownership (removed parent ramp status coupling in `SearchScreen`).
- Probe truthfulness wiring fixes:
  - map-disable skips upstream map derivation path
  - placeholder/top-food env probes are directly effective
- Direct submit/hydration timing instrumentation in `use-search-submit` + `Search`.

## Rejected / Do-Not-Retry (Without New Evidence)

- Sticky-label refresh off.
- Defer labels v1/v2.
- Top-N label cap.
- Single-candidate label anchor.
- Multiple ramp smoothing variants (`step10/interval30`, combined stress probes).
- Disable map interaction visibility queries as shipped behavior.
- Defer dot reveal until release.
- Transition-scheduled ramp state updates (`startTransition`).
- Visual-ready wait-frame tuning in either direction.
- Interaction-query deferral-until-touch as primary solution.
- Full trace-suppression as primary solution.
- Bounds-capture deferral candidate (`EXPO_PUBLIC_PERF_SHORTCUT_DEFER_BOUNDS_CAPTURE=1`) on rewritten topology.
- Step4 ramp variant on rewritten topology (`flashlow + trace off + step4`).
- Coverage-fetch disabled probe as primary solution (diagnostic only).
- Map-presentation-freeze during submit (`EXPO_PUBLIC_PERF_SHORTCUT_FREEZE_MAP_PRESENTATION_DURING_SUBMIT=1`) due floor/stall regression.
- `phaseA=4 + coverage delay` and `phaseA=4 + coverage delay + keep previous markers` as floor-lift solutions (both regressed floor).

## Dominant Bottleneck Statement

Combined bottleneck remains:

1. synchronous hydration/list commit work around `submit_resolved -> results_hydration_commit`,
2. pre-response/pre-release map dataset transition churn (`marker_reveal_state`) in looped runs,
3. coverage/map label updates as secondary additive pressure.

## Next Loop Plan

1. Attack hydration commit directly:

- split first paint to minimal list payload with lighter row composition during `results_hydration_commit`,
- defer expensive sectioning/detail decoration to phase B after first reveal.

2. Remove pre-response map churn:

- keep map source state stable until response-accepted boundary, then apply a single deterministic source update.

3. Validate with matched loops (`runs=3`, `startDelay=3000`) and keep only floor-positive changes.

## Compaction Rules (Mandatory)

- This file is canonical memory, but must stay compact.
- Every time a new loop entry is appended, compact older sections in the same edit.
- Keep only:
  - current accepted stack
  - current reject/do-not-retry list
  - latest baseline snapshot(s)
  - latest 3-5 high-signal loop decisions
  - active hypothesis and next plan
- Remove or collapse stale detailed history into one-line summaries.
- If file exceeds roughly `500` lines, run an immediate compaction pass before continuing new loop entries.
