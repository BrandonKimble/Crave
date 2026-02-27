# Presentation Transition Controller Spec

## Objective

Create one authoritative transition system that coordinates results-sheet presentation and map presentation across:

- Initial search load
- Tab segment switches (`restaurants` / `dishes`)
- Filter/rank/price/votes/open-now mutations

The goals are:

1. Toggle UI remains fully responsive and decoupled from heavy work.
2. No data work starts during rapid toggle interaction settle window.
3. Cards and map reveal atomically for the same intent.
4. No stale response or stale map-ready event can release UI.

## Current Reality (from code)

1. Initial search and most filter changes run network search (`runSearch` via `submitSearch`/`runBestHere`).
2. Segment tab switch is local projection (no network request).
3. Toggle interactions already use settle coordination (`use-toggle-interaction-coordinator`, 300ms), but initial load uses a separate path.
4. Initial reveal can release cards before fully perceived map reveal because visual-ready gating is "ready enough", not strict final reveal settle.

## First-Principles Model

Use a single `PresentationTransitionController` (PTC) that owns presentation timing and reveal decisions.

Separate concerns:

1. `Draft UI state`:
- Immediate chip/segmented visual response on UI thread.
- No heavy compute requirement.

2. `Committed data state`:
- The currently revealed cards + map payload.

3. `Pending transaction state`:
- Next intent, next payload, next map visual token, and readiness flags.

Only PTC can move from pending to committed reveal.

## Mutation Taxonomy

### Local-only mutation

- Segment tab (`restaurants`/`dishes`), if source data already present for both tabs.
- Producer: local projection only.

### Network-backed mutation

- Open now
- Votes filter
- Price apply
- Rank apply
- Initial query submit
- Search-this-area
- Shortcut reruns

Producer must run network only after settle lock, except initial load (no settle delay required).

## Global State Contract

Add a single presentation transaction contract to runtime bus.

```ts
type PresentationMutationKind =
  | 'initial_search'
  | 'tab_switch'
  | 'filter_open_now'
  | 'filter_votes'
  | 'filter_price'
  | 'filter_rank'
  | 'search_this_area'
  | 'shortcut_rerun';

type PresentationPhase =
  | 'idle'
  | 'settling'
  | 'executing'
  | 'awaiting_readiness'
  | 'revealing'
  | 'settled'
  | 'cancelled';

type PresentationLoadingMode = 'none' | 'initial_cover' | 'interaction_frost';

type PresentationTransactionState = {
  intentId: string | null;
  phase: PresentationPhase;
  kind: PresentationMutationKind | null;
  loadingMode: PresentationLoadingMode;
  startedAtMs: number | null;
  settleDeadlineMs: number | null;
  // readiness for this specific intentId
  dataReady: boolean;
  listReady: boolean;
  mapReady: boolean;
  coverageReady: boolean; // shortcut-only, otherwise true
  // final reveal token
  revealEpoch: number;
};
```

Replace split booleans over time:

- `isFilterTogglePending`
- `isVisualSyncPending`
- `visualSyncCandidateRequestKey`
- `visualReadyRequestKey`
- `markerRevealCommitId`

with a unified `intentId`-scoped readiness protocol.

## Events

PTC accepts:

1. `beginIntent({ kind, loadingMode, settleMs, requirements })`
2. `updateDraftUI(...)`
3. `commitIntent()` (after settle for interactive mutations, immediate for initial search)
4. `onDataReady(intentId, payloadRef)`
5. `onListReady(intentId)` (hydration/materialization complete)
6. `onMapReady(intentId)` (strict map reveal settled)
7. `onCoverageReady(intentId)` (shortcut mode only)
8. `cancelIntent(intentId, reason)`

PTC emits:

1. `presentation_phase_changed`
2. `reveal_commit(intentId, revealEpoch)`
3. `stale_event_dropped(intentId, source)`

## State Machine

### States

1. `idle`
2. `settling`
3. `executing`
4. `awaiting_readiness`
5. `revealing`
6. `settled`
7. `cancelled`

### Transitions

1. `idle -> settling`
- on user interaction intent (except initial search).
- set loading mode `interaction_frost`.
- clear visible cards/map presentation.
- keep draft UI responsive.

2. `idle -> executing`
- on initial search submit.
- set loading mode `initial_cover`.

3. `settling -> executing`
- when settle timer expires with latest intent still active.
- start producer work (network or local projection).

4. `executing -> awaiting_readiness`
- when producer has started and PTC awaits required readiness signals.

5. `awaiting_readiness -> revealing`
- only when all required readiness flags are true for same `intentId`.

6. `revealing -> settled`
- commit pending payload to committed payload.
- hide loading mode.
- publish final active tab/filter state.

7. `* -> cancelled`
- superseded by newer intent or explicit cancel.
- drop stale callbacks/events by `intentId`.

## Readiness Barrier (atomic reveal)

For each intent, reveal requires:

```txt
dataReady
AND listReady
AND mapReady
AND (coverageReady if shortcut mode)
```

Notes:

1. `mapReady` must be based on marker reveal settled callback for same `intentId`.
2. `onVisualReady` can still exist as telemetry, but reveal barrier uses settled signal.
3. Keep watchdog timeout only as fail-safe and mark telemetry when used.

## Producer Rules

### Initial load producer

1. Starts immediately (`executing`).
2. Network request.
3. Stages response in pending payload.
4. Computes list/map projections in pending channel.
5. Emits `dataReady`.

### Tab switch producer

1. Starts after settle.
2. Local projection only (no network).
3. Should use precomputed rows/catalog by tab.
4. Emits `dataReady` almost immediately.

### Filter/rank/price/open/votes producers

1. UI chip text/state updates immediately in draft lane.
2. Network rerun starts after settle.
3. Until settle, no list/map recompute for next intent.
4. On response, stage pending payload and emit `dataReady`.

## UI Thread and JS Thread Boundaries

### UI thread

1. Segmented and chip press handling.
2. Toggle indicator and text color animation.
3. Immediate draft visual state.

### JS thread

1. Intent creation and settle timers.
2. Network requests.
3. Read model building.
4. Map/list committed reveal.

Rule:

- JS commit path must not block UI-thread animations.
- No render-heavy updates on each tap while in `settling`.

## Surface Policy

Single source of truth from `loadingMode`:

1. `initial_cover`: full white cover path only for initial search.
2. `interaction_frost`: frosty-only loading (header + toggle strip + spinner on existing frosty background), no white wash.
3. `none`: committed cards + map visible.

This prevents mixed loading surfaces and flashing.

## Stale-Echo Guard

Every callback includes `intentId`:

1. `dataReady(intentId)`
2. `listReady(intentId)`
3. `mapReady(intentId)`
4. `coverageReady(intentId)`

PTC ignores any callback where `intentId !== activeIntentId`.

This replaces ad-hoc candidate/ready key mismatch checks with one guard.

## Migration Plan (Slices)

### Slice 1: Introduce PTC state and event plumbing

1. Add `PresentationTransactionState` to runtime bus.
2. Build PTC module with no behavior change.
3. Mirror current booleans into PTC telemetry to verify parity.

Delete gate:

- No writes to new state outside PTC.

### Slice 2: Toggle interactions to PTC settle/execute

1. Route segment + filter mutations through PTC.
2. Move settle ownership out of feature hooks into PTC.
3. Keep current network calls; just defer start until settle.

Delete gate:

- Remove direct `isFilterTogglePending` writes from mutation paths.

### Slice 3: Initial load to PTC

1. Route initial load cover logic through `loadingMode='initial_cover'`.
2. Remove duplicate initial-cover state logic in panel spec.

Delete gate:

- Remove `isInitialResultsLoadPending` as reveal authority.

### Slice 4: Atomic reveal barrier

1. Commit cards/map only on PTC reveal decision.
2. Use strict map settled event for `mapReady`.
3. Keep timeout watchdog.

Delete gate:

- Remove direct card release on old visual-sync flags.

### Slice 5: Legacy cleanup

1. Remove `isVisualSyncPending`/candidate/ready/marker commit fields.
2. Remove `isFilterTogglePending`.
3. Remove duplicated gate subscribers and fallback paths.

Delete gate:

- No legacy reads remain for reveal behavior.

## Acceptance Criteria

1. Rapid tap any toggle:
- toggle UI stays smooth and immediate.
- no network work starts until settle window expires.

2. Initial load:
- only initial white cover.
- one reveal event.
- cards and map become visible atomically.

3. Interaction load:
- only frosty interaction loading surface.
- no white cover flashes.

4. Stale responses:
- never release UI for superseded intent.

5. Telemetry:
- each transaction shows phase sequence with one reveal commit.

