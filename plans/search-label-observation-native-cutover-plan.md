# Search Label Observation Finalization Plan

Last updated: 2026-03-29
Status: active
Scope:

- `/Users/brandonkimble/crave-search/apps/mobile/ios/cravesearch/noop-file.swift`
- `/Users/brandonkimble/crave-search/apps/mobile/android/app/src/main/java/com/crave/SearchMapRenderControllerModule.java`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/hooks/use-search-map-label-observation.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/hooks/use-search-map-label-runtime.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/hooks/use-search-map-label-sources.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/search-map-render-controller.ts`

## Objective

Finish the last non-ideal search-map ownership gaps using the app's normal planner/executor split:

- JS owns policy, planning, and source projection
- native owns render-local execution, observation, and coalescing

This slice covers label observation/sticky ownership, native observation cadence, Android strategy, `DesiredPinSnapshotState` cleanup decisions, and dead diagnostic removal.

## Why This Slice Exists

After the native marker-family cutover, the remaining non-ideal areas were:

- JS still owned sticky lock learning
- moving-time sticky acquisition depended on JS timer/query cadence
- native already owned render-local label observation primitives, but not the full cadence/state contract
- `DesiredPinSnapshotState` still carried revision/dirtiness maps with unclear permanence
- Android was only compatible, not aligned
- native still carried diagnostic/debug paths from the split-owner era

## Target Shape

### Ownership invariants

- JS planner owns:
  - sticky feature enablement and policy config
  - candidate projection from pin source store + sticky snapshot
  - source invalidation boundaries
- Native executor owns:
  - settled visible label ids
  - sticky candidate lock state
  - sticky revision + dirty identity tracking
  - rendered-label observation cadence/coalescing
  - layer/source resolution for observation
- Cross-boundary contract:
  - JS sends policy/config, not per-tick timing decisions
  - native returns observation snapshot state, not ad hoc render-local internals

### Design constraints

- no regression in pin/label LOD fade behavior
- no crash or `native:setRenderFrame:reject`
- sticky labels must keep the collision-driven side after collision clears
- moving-time smoothness must not regress
- delete gates are real when ownership is promoted

## Slice Order

### LO0: Ownership contract + policy surface

Exit gate:

- plan documents JS planner vs native executor boundaries explicitly
- bridge surface carries label observation policy/config instead of JS-owned sticky internals

Delete gate:

- remove any remaining ref/epoch-era sticky ownership language and APIs

### LO1: Native sticky ownership

Exit gate:

- sticky revision/candidate/dirty identity state lives in native
- `queryRenderedLabelObservation` returns sticky snapshot state
- JS no longer mutates sticky lock state itself

### LO2: JS observation simplification

Exit gate:

- `use-search-map-label-observation` is a thin scheduler/snapshot consumer
- JS sticky ref/epoch protocol is deleted
- candidate projection reads immutable sticky snapshot

### LO3: Native observation cadence/coalescing

Exit gate:

- JS no longer decides movement-time observation cadence
- native coalesces camera-motion / idle / reveal-driven label observation refreshes
- JS consumes latest observation snapshot or revisioned updates

Delete gate:

- remove JS timer/query cadence ownership for sticky acquisition

### LO4: `DesiredPinSnapshotState` decision

Exit gate:

- revision/dirtiness maps are either:
  - explicitly retained as planner bookkeeping with documented invariants, or
  - reduced/replaced with smaller canonical diff bookkeeping

Delete gate:

- remove any leftover snapshot fields that are no longer justified after the marker-family cutover

### LO5: Android parity strategy

Exit gate:

- Android is explicitly either:
  - aligned with the same observation snapshot contract, or
  - intentionally deferred with documented rationale and boundary

Delete gate:

- remove "compatible only" ambiguity in the runtime plan

### LO6: Cleanup

Exit gate:

- dead diagnostics/bridging leftovers from the old JS sticky state machine are removed
- dead diagnostics from the split-owner native pin/label crash hunt are deleted or justified
- native/JS declarations match runtime behavior

## Current State

1. LO0 is partially established in code, but not yet fully documented in the repo plan
2. LO1 is in progress: iOS native now owns sticky lock state and returns sticky snapshot data from `queryRenderedLabelObservation`
3. LO2 is in progress: JS observation hook now consumes the native sticky snapshot instead of mutating sticky refs/maps
4. LO3 is done on iOS: native owns label observation cadence/coalescing there
5. LO4 is decided: `DesiredPinSnapshotState` is now limited to planner bookkeeping only
  - retained intentionally:
    - `inputRevision`
    - `pinIdsInOrder`
    - per-family revision maps
    - `pinLodZByMarkerKey`
  - deleted:
    - long-lived dirty marker sets
6. LO5 is partially done: Android has native observation scaffolding, but JS still consumes the proven JS-managed sticky path there until sticky parity is verified
7. LO6 is done for the targeted split-owner crash-hunt diagnostics; any remaining diagnostics should be justified by active runtime risk

## Validation

Always:

- `swiftc -parse /Users/brandonkimble/crave-search/apps/mobile/ios/cravesearch/noop-file.swift`
- `yarn eslint /Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/hooks/use-search-map-label-observation.ts /Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/hooks/use-search-map-label-runtime.ts /Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/hooks/use-search-map-label-sources.ts /Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/search-map-render-controller.ts /Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/search-map.tsx`
- `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`

When relevant:

- `bash /Users/brandonkimble/crave-search/scripts/search-runtime-natural-cutover-contract.sh`

Manual/device validation after each meaningful slice:

- sticky labels keep the collision-driven side after collision clears
- moving-time map smoothness is preserved or improved
- promoted pins still acquire labels
- pin/label fade still works on demotion
- no crash or `native:setRenderFrame:reject`
