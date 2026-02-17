# Search JS Frame-Budget Optimization Plan

## Straight Answer

No: the refactor plan so far was not primarily designed to eliminate catastrophic JS frame stalls.  
It improved ownership, correctness, and some median metrics, but the main JS hotspot still remains.

## Evidence Snapshot (Current Reality)

Recent shortcut-loop candidates still show `catastrophic.runCount = 3/3` with dominant catastrophic windows in:

- `results_hydration_commit`
- `visual_sync_state` (intermittent)

Examples:

- `/tmp/perf-shortcut-candidate-20260214T080200Z.json`
- `/tmp/perf-shortcut-candidate-20260214T080116Z.json`
- `/tmp/perf-shortcut-candidate-20260214T075908Z.json`
- `/tmp/perf-shortcut-candidate-20260214T075734Z.json`

Typical per-run JS stall max is still roughly `~930ms` to `~1160ms`, which is catastrophic by current thresholds.

## Root Cause Hypothesis (Code-Backed)

The critical path is not one tiny function; it is a synchronized "hydration commit burst":

1. Response/list hydration commit flips state.
2. Map marker visibility and render keys flip at the same time.
3. Map label/pin layer bootstrap/remount behavior also kicks in.
4. JS thread absorbs list + map derived model churn in one window.

Likely contributors in current code:

- Hydration commit scheduling is deferred, but commit is still a single state flip (`setHydratedResultsKeySync`) that unlocks heavier work in one burst.
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/scheduler/phase-b-materializer.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/read-models/read-model-selectors-runtime.tsx`
- Map render key changes force expensive map label/pin reset behavior.
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/search-map.tsx`
- Marker/layer feature transformations are repeated around the same transition window.
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/search-map.tsx`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-diff-applier.ts`
  - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-presentation-controller.ts`

## What Will Actually Help JS

Only one thing: **reduce synchronous work in the hydration/visual-sync window**.

That means:

- stop full map layer bootstrap/remount behavior on every request,
- split hydration commit into budgeted chunks across multiple frames,
- reduce list/map derived-model churn during the same frame window,
- enforce per-stage frame budgets as hard promotion criteria.

## Execution Plan (Separate From Ownership Slices)

### JS0: Attribution Lock (1 short slice)

Goal:

- measure exact cost contributors inside `results_hydration_commit` and `visual_sync_state`.

Changes:

- add fine-grained timing spans around:
  - list read-model build,
  - list render-key flips,
  - marker feature derivation,
  - map label bootstrap/re-epoch triggers,
  - hydration commit apply.
- emit these as structured perf events in the existing harness logs.

Files:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/read-models/read-model-selectors-runtime.tsx`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/search-map.tsx`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/telemetry/shortcut-harness-observer.ts`

Exit gate:

- top-3 contributors by ms are explicit in candidate JSON/log evidence.

### JS1: Hydration Burst Split (Primary Lift)

Goal:

- replace single hydration burst with progressive hydration under a strict per-frame budget.

Changes:

- replace binary hydration (`hydratedResultsKey` null -> full) with phased row hydration (for example 2 -> 6 -> full or request-size based slices).
- run slices via scheduler with per-frame budget and cancellation on superseded operation.
- keep overlay UX parity (no visible flash/regression).

Files:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/scheduler/phase-b-materializer.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/read-models/read-model-selectors-runtime.tsx`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-results-panel-spec.tsx`

Exit gate:

- catastrophic windows in `results_hydration_commit` are reduced in count and severity vs pre-JS1 baseline.

### JS2: Map Bootstrap Decoupling (Primary Lift)

Goal:

- stop request-key-driven map label bootstrap churn from firing in the hydration window.

Changes:

- decouple `markersRenderKey` identity from every request key change when geometry/topology is unchanged.
- gate label bootstrap epoch bumps to true style/collision invalidation events only.
- avoid full source/layer reset for hold/show toggles when feature topology did not materially change.

Files:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/search-map.tsx`

Exit gate:

- catastrophic stage family frequency in `results_hydration_commit` and `visual_sync_state` drops materially.

### JS3: Read-Model Churn Controls (Secondary Lift)

Goal:

- reduce JS object/array churn during commit windows.

Changes:

- cache marker/list projection artifacts by stable request/version signatures (not by every transient state).
- remove or delay expensive string joins used only for render keys (`join('|')`) on hot paths.
- limit recomputation triggers for map/list selectors to data changes, not UI-phase toggles.

Files:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/index.tsx`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-presentation-controller.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-diff-applier.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/read-models/read-model-selectors-runtime.tsx`

Exit gate:

- additional stall reduction after JS1/JS2; no regression in map/list parity.

### JS4: Promotion Rules Upgrade (No More Ambiguity)

Goal:

- make JS hotspot improvement mandatory for JS-focused work.

Changes:

- add a dedicated "JS optimization tranche" gate profile:
  - no catastrophic-waiver allowed for JS slices,
  - require directional improvement in `results_hydration_commit` catastrophic counts,
  - require median `stallP95Pct` improvement and non-regressive `uiFloorMean`.

Files:

- `/Users/brandonkimble/crave-search/scripts/perf-shortcut-local-ci.sh`
- `/Users/brandonkimble/crave-search/plans/shortcut-submit-architecture-refactor-plan.md`

Exit gate:

- JS tranche promotions cannot pass if catastrophic remains flat with no stage improvement.

## Promotion Metrics for This Plan

For JS tranche slices (JS1+), promotion requires:

1. `catastrophic.runCount` trend improves against locked baseline/candidate history for `results_hydration_commit`.
2. `stallP95` improves (median compare) by agreed threshold.
3. `uiFloorMean` is non-regressive beyond tolerance.
4. no new catastrophic stage families.

## Rollout / Risk Controls

- Keep operation cancellation precedence intact (no stale apply).
- Keep shadow/settle marker integrity intact.
- Keep current UX behavior (timing/animation feel may change, outcome should not).
- If parity drifts, rollback by feature flag at the JS tranche boundary, not per-commit ad hoc.

## Expected Outcome

If JS1 + JS2 are executed correctly, JS should stop failing primarily because of one hydration-window burst.  
That is the path to move catastrophic from persistent `3/3` toward passing thresholds, instead of only improving non-cat medians.
