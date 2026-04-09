# Map Motion Pressure Cutover Plan

Last updated: 2026-04-03
Status: active follow-up slice; shared pressure state + planner/native publish admission are materially landed
Scope:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/**`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/hooks/use-search-map-native-render-owner.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/search-map.tsx`
- native render controller cadence plumbing only if required

## 1) Why This Slice Exists

The current map movement path is in a good behavioral state, but part of the smoothness story still depends on tactical local cadence/deferral rules spread across subsystems:

- viewport-only frame suppression and queued/deferred frame replacement in the native render owner
- map-moved/search-this-area reveal and poll-bounds publication still use some local pending-state glue in JS, but generic movement deferral now reads shared interaction + protected-transaction state from `MotionPressureState`
- camera-change handling and map-moved/search-this-area admission now share the same protected-transaction gate; the remaining non-ideal part is mostly the local pending refs and callback plumbing around those shared helpers

Those cuts were acceptable while stabilizing behavior, but they are not the cleanest architecture. They make motion handling "run at most every N ms" instead of "run when the viewport meaningfully changed and the downstream lane can absorb the work."

## 1.1 Sequencing Decision

This slice is important, but it is not first.

The correct sequence is:

1. prepared-snapshot presentation architecture for results reveal/dismiss, search-this-area, and restaurant profile open/close
2. map motion pressure cutover
3. cleanup pass deleting leftover throttles, duplicated orchestration, and stale diagnostics

Why this is subordinate:

- the current highest-value architecture problem is still presentation ownership and pre-visible churn
- motion pressure should never compensate for unstable presentation transactions
- movement-time planning must not be allowed to mutate or destabilize an active prepared presentation transaction

Authoritative related plan:

- `/Users/brandonkimble/crave-search/plans/prepared-snapshot-presentation-architecture-audit.md`

This document should be executed only after the prepared-snapshot presentation slice establishes stable transaction ownership for:

- results reveal/dismiss
- search-this-area rerun
- restaurant profile open/close

## 2) Current Tactical Pressure Controls

### 2.1 JS visible candidate coalescing

File:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-presentation-controller.ts`

Current behavior:

- visible-candidate publication is already identity/fingerprint gated rather than fixed-cadence gated
- a shared `MotionPressureState` exists in `map-motion-pressure.ts`
- candidate recompute now routes through shared planner admission in `map-motion-pressure.ts`
- candidate materiality checks are now helper-owned in `map-motion-pressure.ts`; `map-presentation-controller.ts` only stores the last invocation snapshot and rendered-candidate fingerprint

### 2.2 JS LOD coalescing

File:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-diff-applier.ts`

Current behavior:

- LOD planning no longer uses the old 90ms moving cadence gate
- map-moved/search-this-area admission and viewport publish suppression now read shared motion-pressure helpers/state
- LOD planner recompute now routes through shared planner admission in `map-motion-pressure.ts`
- LOD materiality checks are now helper-owned in `map-motion-pressure.ts`; `map-diff-applier.ts` only stores the last invocation snapshot and pinned-key output

### 2.2.1 JS movement deferral

Files:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-interaction-controller.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-search-map-movement-state.ts`

Current behavior:

- `shouldDeferMapMovementWork(...)` now checks local interaction state and shared protected-transaction state from `MotionPressureState`
- `MotionPressureState` now stores `isSearchInteracting` and `isAnySheetDragging`, and results-sheet orchestration updates those fields through the shared controller whenever dragging / scrolling / settling changes
- map idle / map camera-change handlers and deferred poll-bounds flushes all use that shared helper
- `resolveMapMovedRevealAdmission(...)` already gates Search This Area reveal publication on the same protected-transaction state

### 2.3 Native source publish suppression

File:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/hooks/use-search-map-native-render-owner.ts`

Current behavior:

- the old `48/96ms` moving source sync suppression window has been removed
- render-owner publish admission now records `nativeSyncInFlight`, publish-start, and publish-ack into shared `MotionPressureState`
- queued-frame replacement / owner-epoch retargeting / in-flight ack state now lives directly in `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/hooks/use-search-map-native-render-owner.ts`, so the queue mechanics stop pretending to be a separate shared runtime owner

### 2.4 Frame suppression / replacement

File:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/hooks/use-search-map-native-render-owner.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/hooks/use-search-map-native-render-owner.ts`

Current behavior:

- viewport-only frames can be dropped,
- moving source frames can be skipped,
- queued frames can be replaced,
- reveal/dismiss freeze windows can defer or suppress publication.

This queue path is now helper-owned. The native owner hook still builds frame payloads and interprets render-owner events, but replacement / owner-epoch retargeting / ack bookkeeping are no longer embedded as ad hoc hook-local mutation rules.

## 3) Target Architecture

### 3.1 Ownership model

JS is the planner.

- owns semantic viewport derivation
- owns visible-candidate derivation
- owns LOD pin planning
- owns source diff construction
- owns update priority classification

Native is the executor.

- owns render-local application
- owns animation / feature-state execution
- owns apply acknowledgements and in-flight sync state
- may expose backpressure state to JS, but does not own planning policy

### 3.2 Shared motion-pressure contract

Replace per-subsystem fixed throttles with one shared pressure contract:

- one motion token source
- one pressure lane state
- one publish-admission policy

The planner should decide work based on:

- whether the viewport changed materially,
- whether a higher-priority transition occurred,
- whether a lower-priority recompute is already in flight,
- whether the last publish has been acknowledged,
- whether the next diff is meaningfully different.

### 3.3 Transaction-awareness is mandatory

Motion pressure is subordinate to prepared presentation transactions.

That means:

- motion admission cannot mutate visible presentation transactions while a prepared reveal/dismiss/profile/search-this-area transaction is in its protected execution window
- motion work may prepare the next planner state, but it cannot destabilize the currently executing prepared snapshot
- transaction-critical publication outranks movement work, even when movement work would otherwise be admitted

So the architecture is:

- prepared snapshot owns visible presentation transaction boundaries
- motion pressure only governs movement-time planner work outside those protected boundaries

### 3.4 What "ideal" means here

Not:

- candidates run every 90ms,
- LOD runs every 90ms,
- each subsystem independently coalesces motion.

Yes:

- one motion semantic token,
- one planner-visible pressure state,
- one prioritization model,
- no scattered fixed cadence constants for ordinary movement work.

## 4) Canonical Concepts To Introduce

### 4.1 Motion semantic token

File target:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-motion-pressure.ts` (new)

Keep:

- scale bucket
- viewport cell
- settled vs moving class

Promote / add:

- gesture phase: `gesture | inertia | settled`
- semantic priority hints:
  - `selection_changed`
  - `presentation_changed`
  - `viewport_meaningful_change`
  - `viewport_minor_change`

Rename conceptually from "budget token" to "motion semantics token."

### 4.1.1 Materiality contract

This slice needs an explicit materiality contract, not just "changed" vs "unchanged."

Material viewport change should be defined as one or more of:

- motion token identity changed
- selected marker / focus target changed
- top-pin candidate frontier changed
- prepared transaction boundary changed
- source diff class changed in a way that affects mounted pin families

Non-material change should include:

- minor camera drift within the same semantic viewport cell
- lower-value candidate churn that does not affect the top-pin frontier
- helper/collision churn that does not change mounted families

Rule:

- only material change can directly admit movement work while pressure is present
- non-material change may be coalesced, but not lost forever

### 4.2 Motion pressure state

New file:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-motion-pressure.ts`

Current implemented shape:

```ts
export type MotionWorkClass = 'viewport_candidates' | 'lod_planner' | 'source_publish';

export type MotionPressureState = {
  motionTokenIdentity: string | null;
  phase: 'gesture' | 'inertia' | 'settled';
  nativeSyncInFlight: boolean;
  lastPublishAckAtMs: number;
  lastPublishStartedAtMs: number;
  lastMaterialViewportUpdateAtMs: number;
  lastNormalWorkAdmittedAtMs: number;
  coalescedNormalWorkCount: number;
  activePresentationTransaction: null | {
    kind: 'results_reveal' | 'results_dismiss' | 'profile_open' | 'profile_close';
    requestKey: string;
    phase: 'preparing' | 'committing' | 'executing';
  };
};

export type MotionAdmissionDecision = {
  shouldRun: boolean;
  reason:
    | 'bootstrap'
    | 'meaningful_change'
    | 'priority_change'
    | 'ack_cleared'
    | 'idle'
    | 'coalesced_minor_change'
    | 'publish_backpressured';
};
```

The shared pressure state should also expose whether a prepared transaction is active, for example:

```ts
activePresentationTransaction:
  | null
  | {
      kind: 'reveal' | 'dismiss' | 'search_this_area' | 'profile_open' | 'profile_close';
      requestKey: string;
      phase: 'preparing' | 'committing' | 'executing';
    };
```

### 4.3 Update priority classes

Planner-facing work classes:

- `critical`
  - selected marker changed
  - explicit reveal/dismiss transition boundary
  - source recovery / style recovery
- `high`
  - visible top pin set changed
  - LOD promotion/demotion affecting mounted pin family
- `normal`
  - visible candidates changed but not top-pin set
  - label collision source changes
- `low`
  - purely viewport-only diagnostics / non-material camera drift

The key rule:

- lower-priority work should not trigger recompute/publication just because a timer elapsed.

### 4.4 Fairness / starvation rules

Priority is necessary, but starvation is not acceptable.

Rules:

- `critical` always wins immediately
- `high` wins over `normal` and `low`
- `normal` and `low` may be coalesced behind `critical`/`high`
- but `normal` work must eventually be admitted once:
  - the active high-priority burst clears, or
  - the motion token remains stable long enough, or
  - the queued non-material diff becomes materially different

So the planner must not collapse into "top-pin updates forever, everything else never."

## 5) Cut Strategy

Do this as four slices.

### Slice MP1: Centralize motion semantics

Goal:

- candidates and LOD both consume the same planner-visible motion token + pressure contract
- this slice only starts after prepared-snapshot presentation transaction ownership is in place

Files:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-motion-pressure.ts` (new)
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-presentation-controller.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-diff-applier.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-diff-applier.ts`

Implementation:

- keep `buildViewportMotionToken(...)`
- remove local `minIntervalMs: 90` ownership from candidate + LOD callers
- move admission logic into shared helpers in `map-motion-pressure.ts`
- both candidate and LOD recompute use:
  - same motion token
  - same phase
  - same priority/admission language
  - same materiality contract

Additional requirement:

- candidate and LOD recompute must know whether a prepared presentation transaction is active and avoid destabilizing it

Delete gate:

- no subsystem-local fixed `90ms` moving cadence remains in candidate or LOD planner

Exit gate:

- behavior parity
- same or lower moving coalesced counts for equivalent runs
- no regression in pin/LOD correctness
- no movement work admitted inside protected prepared-transaction execution windows

### Slice MP2: Make native publish backpressure-aware

Goal:

- replace blind `48/96ms` moving source sync suppression with publish admission driven by in-flight / ack / diff priority
- make publish admission transaction-aware, not just pressure-aware

Files:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/hooks/use-search-map-native-render-owner.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/search-map-render-controller.ts` if extra event exposure is needed

Implementation:

- keep `syncInFlightRef` and queued-frame mechanics
- replace:
  - `MOVING_SOURCE_SYNC_MIN_INTERVAL_MS`
  - `INERTIA_SOURCE_SYNC_MIN_INTERVAL_MS`
- with admission based on:
  - sync already in flight,
  - queued frame already exists,
  - new diff priority,
  - source diff class,
  - whether the next frame supersedes the queued frame materially
  - whether a prepared presentation transaction is in a protected execution phase

Target behavior:

- critical/high diffs can replace queued moving work immediately
- low-priority moving churn gets coalesced behind in-flight sync
- inertia is not a separate magic time constant; it is just a lower-priority phase than active gesture
- active prepared presentation transactions cannot be destabilized by ordinary movement publication

Delete gate:

- fixed `48/96ms` moving publish suppression constants removed
- no fallback timer-first moving publish admission remains in the native render owner

Exit gate:

- no crash / no native reject regressions
- equal or fewer moving source publish bursts
- reveal/dismiss correctness unchanged
- protected prepared presentation transactions remain source-stable by construction

### Slice MP3: Unify planner publish priority

Goal:

- candidates, LOD, and source publication use the same work-priority model

Files:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-presentation-controller.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/map-diff-applier.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/hooks/use-search-map-native-render-owner.ts`

Implementation:

- derive planner output metadata:
  - `topPinSetChanged`
  - `selectedMarkerChanged`
  - `visibleCandidateSetChanged`
  - `snapshotClass`
  - `materialityClass`
- feed that into source publication admission
- treat visible-candidate-only drift as lower-priority than top-pin-set change

Delete gate:

- no hidden re-prioritization via ad hoc `isMoving` checks at call sites
- no parallel local priority logic remains in candidate planner, LOD planner, and native render owner

Exit gate:

- live LOD behavior preserved
- top-pin changes stay immediate during movement
- reduced source churn in moving perf diag runs
- lower-priority movement work eventually lands; no starvation-shaped drift

### Slice MP4: Remove leftover tactical motion throttles + cleanup

Goal:

- delete remaining movement-specific magic throttles that became redundant

Likely targets:

- duplicate moving coalesced counters that reflect old subsystem-local policy only
- dead comments or diagnostics that describe the old interval-driven approach
- any no-longer-used motion budget helper branches
- old motion refs and shared timers that only existed to support the timer-first model

Files:

- same files as MP1-MP3
- related plan docs if they still describe timer throttles as canonical

Delete gate:

- planner/executor motion-pressure ownership is explicit and singular
- no parallel throttle systems remain for ordinary movement work
- no stale shared moving-timer refs/constants survive in planner or native owner

Exit gate:

- code reads as one coherent pressure policy, not three local hacks

## 6) What Stays

These are not the problem and should stay unless evidence says otherwise:

- motion token concept itself
- viewport cell / scale bucket semantic coalescing
- queued frame replacement in native render owner
- reveal/dismiss freeze lanes
- source recovery deferral for style reload safety

The refactor target is not "remove coalescing." It is "replace timer-based coalescing with semantic/backpressure-aware coalescing."

## 7) Metrics And Verification

Always:

- `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`

When touched:

- `bash /Users/brandonkimble/crave-search/scripts/search-runtime-natural-cutover-contract.sh`

Perf-bearing validation:

- use the existing diag windows plus a short focused moving run

Metrics to compare before/after:

- `[MAP-LABEL-PERF-DIAG] window`
- JS/UI frame windows during movement
- `map_visible_candidates_moving_coalesced`
- `map_lod_moving_coalesced`
- source publish burst counts from native render owner
- count of label `replace` publishes vs `patch`

Success criteria:

- no regressions in LOD behavior
- no regressions in sticky label behavior
- same or better movement smoothness
- lower unnecessary source churn
- lower dependence on fixed movement intervals
- no destabilization of prepared reveal/dismiss/profile/search-this-area transactions

## 8) Recommendation

This cutover is worth doing.

The current behavior is acceptable, but the architecture is still partly tactical. The clean next move is:

1. MP1 centralize motion semantics,
2. MP2 replace native moving publish timers with backpressure-aware admission,
3. MP3 unify planner publish priority,
4. MP4 delete remaining tactical throttle leftovers.

That is the path from "smooth enough via scattered throttles" to "smooth because the pressure model itself is smarter."

But it is explicitly not the first presentation-performance slice.

The correct architectural sequencing is:

1. prepared-snapshot presentation architecture,
2. motion-pressure cutover,
3. delete-gate cleanup across both systems.
