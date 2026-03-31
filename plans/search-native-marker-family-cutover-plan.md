# Search Native Marker-Family Cutover Plan

Last updated: 2026-03-29
Status: active
Scope: `/Users/brandonkimble/crave-search/apps/mobile/ios/cravesearch/noop-file.swift`

## Objective

Replace the current split-owner native pin/label runtime with one canonical marker-family render model that emits pin, pin-interaction, label, and label-collision collections atomically.

## Why This Slice Exists

Current native pin/label fade behavior is not structurally sound.

Observed failure:

- moving-time native fade can reject with `Missing feature ... in replaceParsedFeatureCollection`
- before guard changes, that same class of inconsistency could hard-abort the process

Root cause:

- the native runtime currently assembles rendered families from overlapping state stores:
  - `DesiredPinSnapshotState`
  - `LivePinTransition`
  - previous rendered collections
  - transient feature-state maps
- `idsInOrder` and `featureById` are not emitted from one canonical derivation, so they can drift apart for a frame

## Non-Negotiable Product Constraints

- no crash or native frame rejection during moving LOD
- pin native fade must remain enabled
- labels must fade with pins during LOD, not snap independently
- dots must keep their current smooth native fade behavior
- no UX regression in reveal/dismiss behavior

## Target Shape

One canonical marker-family model per marker key owns:

- marker presence
- target family membership
- current/target opacity
- LOD rank/z
- pin interaction eligibility
- label payload set
- label collision payload

From that model, one atomic derivation emits:

1. pins
2. pin interactions
3. labels
4. label collisions

Rules:

- transition state stores only scalar animation metadata plus marker identity
- transition state does not own copied feature payloads
- `idsInOrder` and `featureById` are emitted together from the same derivation
- label fade reads the same marker opacity state as pin fade
- previous rendered collections are diff baselines only, not partial construction inputs

## Current Non-Ideal Areas To Delete

1. `DesiredPinSnapshotState` carries duplicated per-family feature payload maps.
2. `LivePinTransition` carries copied `pinFeature`, `labelFeatures`, and `pinInteractionFeature`.
3. `prepareDerivedPinAndLabelOutput` incrementally patches prior collections instead of deriving the next graph atomically.
4. Label interaction output is rebuilt from a separate visibility patch path instead of the same canonical marker-family projection.
5. Native safety/self-heal logic currently exists around mismatched collection assembly and should become unnecessary after cutover.

## Slice Order

### NM1: Canonical marker-family render state

Goal:

- introduce a native per-marker render model that captures the full pin/label family state without copied collection payload ownership in transitions

Exit gate:

- one canonical structure exists for marker-family render state
- live transition state references marker keys + scalar animation metadata only
- canonical state is sufficient to project all four visual families

Delete gate:

- remove copied feature payload ownership from `LivePinTransition`

### NM2: Atomic family projection

Goal:

- replace `prepareDerivedPinAndLabelOutput` incremental patch logic with one atomic projection from canonical marker-family state

Exit gate:

- pins, pin interactions, labels, and label collisions are derived in one pass
- `idsInOrder` and `featureById` are emitted together from the same source of truth
- no family builder depends on prior rendered collection contents for construction

Delete gate:

- remove `previousLabelIdsByMarkerKey` patch assembly and related incremental carry-forward logic

### NM3: Label interaction alignment

Goal:

- align label interaction derivation to the same canonical model + settled visibility inputs without separate ad hoc structure patching

Exit gate:

- label interaction ids/features derive from canonical label membership and settled visibility rules
- no cross-family drift path remains between label render family and label interaction family

Delete gate:

- remove the current grouped-id patch/repair path in `prepareDerivedLabelInteractionOutputPlans`

### NM4: Runtime cleanup and robustness deletion

Goal:

- remove temporary mismatch recovery logic once the canonical projection is stable

Exit gate:

- no missing-feature self-heal is needed in `replaceParsedFeatureCollection`
- native fade remains enabled and crash-free during moving LOD

Delete gate:

- delete temporary mismatch tolerance added during crash isolation

## Validation

Always:

- `swiftc -parse /Users/brandonkimble/crave-search/apps/mobile/ios/cravesearch/noop-file.swift`
- `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`

Manual/device validation after each meaningful slice:

- rerun the zoom/reverse crash flow on device
- confirm pin fade, label fade, and dot fade all remain live
- confirm no `native:setRenderFrame:reject` / frame sync errors

## Current Slice

### NM4: Runtime cleanup and verification

Current state:

1. pins, pin interactions, labels, and label collisions now project from canonical marker-family render state
2. label interactions now derive atomically from canonical marker state plus settled label visibility
3. `replaceParsedFeatureCollection` no longer skips missing features; mismatches surface as errors again
4. `DesiredPinSnapshotState` is back to dirtiness/order bookkeeping; per-marker payload dictionaries are frame-local instead of long-lived snapshot state

Remaining work:

1. confirm on-device that the removed mismatch tolerance is not needed in the stabilized path
2. delete any remaining dead code or diagnostics tied to the old split-owner label interaction assembly
3. keep validation focused on moving-time LOD, reveal, and reverse zoom flows
