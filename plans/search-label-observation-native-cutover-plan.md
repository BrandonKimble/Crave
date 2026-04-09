# Search Label Observation Finalization Plan

Last updated: 2026-04-03
Status: active, but now focused on final executor-shape cleanup rather than JS sticky ownership promotion
Scope:

- `/Users/brandonkimble/crave-search/apps/mobile/ios/cravesearch/SearchMapRenderController.swift`
- `/Users/brandonkimble/crave-search/apps/mobile/android/app/src/main/java/com/crave/SearchMapRenderControllerModule.java`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/use-map-label-sources.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/search-map.tsx`
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
  - marker existence and the static four-candidate label universe per marker
  - source invalidation boundaries for pin/candidate membership changes
  - optional semantic snapshots for diagnostics/non-render consumers
- Native executor owns:
  - settled visible label ids
  - sticky candidate lock state
  - sticky revision + dirty identity tracking
  - rendered-label observation cadence/coalescing
  - layer/source resolution for observation
  - live preferred-side application for label rendering
- Cross-boundary contract:
  - JS sends policy/config, not per-tick timing decisions
  - native returns compact observation/preference snapshots, but ordinary side-switching does not require JS to rewrite label source data

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

- the old single-use observation hook is deleted, and only minimal event-gating/reset glue remains inline in `search-map.tsx`
- JS sticky ref/epoch protocol is deleted
- candidate projection no longer rewrites label source properties just because a preferred side changed
- the remaining inline glue no longer carries query-era readiness or deferred-state behavior beyond minimal event gating/reset

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

### LO7: Static candidate source + native-owned preferred side

Exit gate:

- JS emits all four candidate label features for each mounted pin marker as a mostly static source universe
- ordinary sticky side changes do not dirty/rebuild the JS label source store
- native applies the currently preferred side locally without requiring JS to rewrite label source payloads
- Mapbox placement can still choose fallback sides immediately when collisions change
- sticky behavior remains live and immediate while moving

Delete gate:

- remove source-diff dependence on `labelPreference`
- remove sticky-revision-driven label source rebuilds from `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/use-map-label-sources.ts`
- remove native/source rewrite dependence on `labelPreference` / `labelMutexMode` as transport properties in favor of retained feature-state / render-local preference admission

## Current State

1. LO0/LO1/LO3 are now in place on iOS and Android:
   - native render controllers own sticky state, sticky memory, observation cadence, and revisioned observation snapshots
   - native observation configuration now executes under `use-search-map-native-render-owner.ts`
   - JS consumes `label_observation_updated` events instead of running moving-time observation queries
2. LO2 is largely in place:
   - the old single-use `use-search-map-label-observation` hook is now deleted entirely
   - native label-observation event listening now also terminates under `use-search-map-native-render-owner.ts` instead of `search-map.tsx` subscribing to controller events directly
   - `search-map.tsx` now keeps only settled visible-label-count/reset bookkeeping
   - there is no longer a separate JS wrapper boundary around native viewport/idle callbacks or native label-observation events
   - remaining non-ideal parts are residual inline settled-count/reset glue, not sticky ownership or a JS-owned configure loop
3. LO4 is decided: `DesiredPinSnapshotState` is now limited to planner bookkeeping only

- retained intentionally:
  - `inputRevision`
  - `pinIdsInOrder`
  - per-family revision maps
  - `pinLodZByMarkerKey`
- deleted:
  - long-lived dirty marker sets

5. LO5 is effectively done for cadence/snapshot parity: iOS and Android both use the native-managed observation contract.
6. LO6 is partially done: old component-local label source/runtime hooks were deleted, but diagnostic and transitional compatibility code still exists in map/profile/presentation runtime.
7. LO7 is materially landed and the former source-property seam is now deleted:
   - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/use-map-label-sources.ts` is candidate-static
   - ordinary sticky side changes no longer rebuild the JS label source store
   - `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/search-map.tsx` mounts the full candidate universe and native-owned `nativeLabelPreference` feature-state determines the active preference group
   - sticky memory now persists across temporary absence in native, so labels and re-promoted pins can resume their last successful side
   - native now drives preferred-side ordering through retained feature-state instead of rewriting source-feature properties before publication

## Remaining Non-Ideal Seams

- Native publishes baseline snapshots directly on configure/reset, and `use-search-map-native-render-owner.ts` now owns both native observation configuration and native observation event listening, but `search-map.tsx` still owns a small amount of settled visible-label-count/reset glue instead of being a completely stateless native event consumer.
- The plan’s true remaining work is therefore not ownership promotion. It is final executor-shape cleanup:
  - remove any remaining query-era/deferred/reset glue from the JS observation hook where safe
  - delete any stale diagnostics/compatibility seams left from the old JS sticky era

So the remaining work in this area is cleanup/final simplification, not a missing ownership promotion.

## Validation

Always:

- `swiftc -parse /Users/brandonkimble/crave-search/apps/mobile/ios/cravesearch/SearchMapRenderController.swift`
- `yarn eslint /Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/use-map-label-sources.ts /Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/map/search-map-render-controller.ts /Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/search-map.tsx`
- `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`

When relevant:

- `bash /Users/brandonkimble/crave-search/scripts/search-runtime-natural-cutover-contract.sh`

Manual/device validation after each meaningful slice:

- sticky labels keep the collision-driven side after collision clears
- moving-time map smoothness is preserved or improved
- promoted pins still acquire labels
- pin/label fade still works on demotion
- no crash or `native:setRenderFrame:reject`
