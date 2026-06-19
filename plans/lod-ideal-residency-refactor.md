# LOD ideal-shape residency refactor (2026-06-19)

Re-anchors the disjointed LOD work into ONE sequenced refactor. Goal: bring map LOD back to the
clean simplicity of the one-group era (commit `ed70a538`, 2026-06-05) + finish the native-owned
residency model the whole arc was building toward. No patching; complete the rethink.

## Root causes (verified, agent-confirmed)

- **Pin WIGGLE (zoom, esp. zoom-out, around LOD changes):** native `driveNativeLod` runs every
  camera frame and a FIRST-EVER promote ADDS that marker's pin+label features to the shared
  `pinBundleSourceId` MID-GESTURE → Mapbox bumps sourceRevision → re-runs the placement/pixel-snap
  pass for the whole bundle → every `ignorePlacement` pin re-snaps a few px = the wiggle. The clean
  era did NOT wiggle because the JS decider DEFERRED source commits to SETTLE (no mid-gesture write).
  So the regression is specifically MID-GESTURE source mutation, new to the native path.
- **JANK:** same root — the ~570 mid-gesture bundle adds re-tile the scene.
- Both fixed by: every candidate's pin RESIDENT at opacity 0 → a promote is a pure stepper opacity
  write (no source add) → no re-layout. Pins must NOT share a source with labels, or a label add
  re-layouts the pins anyway.

## Label decision (locked): Option A — un-bundle, NOT fully-resident

Mapbox label collision (`textAllowOverlap:false`) is load-bearing: it picks 1 of 4 candidate sides
per marker + prevents overlap. Can't turn off (overlaps + no side pick). Fully-resident labels fail
because opacity-0 demoted labels still occupy Mapbox collision slots (collision ignores feature
state; can't filter by feature-state). Truly-resident labels would need native-driven collision (a
separate large rewrite) — deferred. So: PINS fully resident (own source, zero mutation in motion);
LABELS keep the 4-candidate Mapbox-collision model but in their OWN source (un-bundled), so their
small churn (4 feats × 1-2 markers per granular change) is isolated and never re-layouts pins.

## Ideal end-state

- ONE decider: NATIVE (driveNativeLod, top-N-by-rank-among-on-screen). JS publishes the resident
  catalog once per data change + selection/reveal commands. NO JS LOD decider.
- Residency: every candidate's PIN (+interaction) resident in the pin source at all times, demoted
  at opacity 0; promote/demote = stepper opacity feature-state only; membership changes only on data.
- Sources/layers: pin source (pins+interaction) | dot source | label source (4-candidate, Mapbox
  collision) | label-collision-obstacle source. Pins un-bundled from labels.
- For SHORTCUT (worldwide catalog): pins resident for the whole catalog so pan-to-new-areas renders
  (catalog metadata already resident; renderable pin features must be too). For viewport searches:
  resident = the viewport set (cheap); pan-far re-searches.

## Sequenced steps (verify each with the harness: render-truth missing~0, mut bundle add/rm→0 in
## motion, dtMs smooth, flashReversalCount/lod_snap_contract=0, and the wiggle gone on frames)

1. **Full PIN residency (native).** Separate resident-membership from promoted-opacity (currently
   conflated in `pinIdsInOrder`): add `promotedMarkerKeys` to DesiredPinSnapshotState; payload
   builders + snapshot iterate RESIDENT keys (rows with pinFeature); updateLivePinTransitions
   targetOpacity = promotedMarkerKeys.contains; currentOpacity fallback = featureState
   nativeLodOpacity; new-transition guard = opacity-change not membership-change. Don't reorder the
   source on promote (z is viewport-y) → no order churn. Verify: mut pin adds→0 in motion, wiggle
   gone, no flash.
2. **JS publishes ALL candidates' pin features resident** (not the rendered slice) so #1 has data
   for the whole catalog → pan-to-new-areas works. Remove the renderedLodCandidates slice gating.
3. **Un-bundle labels** into their own source so label add/remove on promote/demote never mutates
   the pin source. Pin layers read the pin source; label layers read the label source.
4. **Delete the JS decider (Phase 3):** buildMarkerRenderModel + buildStableSlotMap + isVisibleInBounds
   + padded-AABB fallback + map-render-model.ts(+spec). Native is the sole decider; JS publishes
   resident catalog only. Native must own the INITIAL/reveal promotion (no JS seed).
5. **Delete two-group badge cruft:** overlapRegionRequiresAutoZoom/overlapRadiusBounds (dead),
   in/out perf counters, SCALE_PROBE_*, stale comments; simplify region/badge back toward the clean
   inline form (consider rank-driven badge: top-N gets a rank badge regardless of geography).

Order rationale: 1 fixes wiggle+jank but needs 3 (un-bundle) for the wiggle to fully clear; do 1+3
together-ish, then 2 (pan), then the deletions 4+5. Each verified by harness before the next.

## CONFIRMED: steps 1 and 3 are INSEPARABLE (verified by attempting step 1)

makeDesiredPinSnapshotState drives BOTH the pin AND label revisions (labels are in the pin bundle).
So making the snapshot resident makes the bundled LABELS resident at opacity 0 too → Mapbox
collision pollution (demoted labels occupy collision slots; collision ignores opacity; can't filter
by feature-state). Therefore pins-resident REQUIRES labels un-bundled in the SAME change. Do not
land step 1 alone.

## Precise impl notes for step 1+3 (worked out; execute fresh, harness-verified, no broken middle)

NATIVE (SearchMapRenderController.swift):
- DesiredPinSnapshotState: add `promotedMarkerKeys: Set<String>`. pinIdsInOrder becomes the RESIDENT
  set in a STABLE order (never reordered on LOD): residentDotMarkerKeysInOrder (rank-ordered, stable
  per data change) filtered to rows with pinFeature, plus any pinnedMarkerKeysInOrder-with-pinFeature
  not already present (safety append). nextPinMarkerKeys (removal cleanup) uses the resident set.
  inputHash MUST append promotedMarkerKeys (else a promote/demote produces no new inputRevision → no
  opacity update).
- makeDesiredMarkerFamilyPayloads(roleTable): iterate the resident set (already requires pinFeature).
  But emit LABEL payloads ONLY for promoted markers (labels are NOT resident — un-bundled, promote-
  gated) — OR move labels to a separate snapshot/source entirely (the un-bundle).
- updateLivePinTransitions: nextPinIds/previousPinIds = resident membership (shouldRenderMarker stays
  true for all resident → all in source at their opacity). targetOpacity = promotedMarkerKeys.contains
  ? 1 : 0 (NOT nextPresent). currentOpacity fallback = featureState nativeLodOpacity ?? (promoted?1:0)
  (NOT previousPresent?1:0). New-transition guard = abs(currentOpacity-targetOpacity)>=0.001 (opacity
  change), NOT previousPresent!=nextPresent (membership change). The flash-suppression / commit-
  invariant logic is opacity-based → keep it; just feed it promoted-driven targetOpacity.
## UN-BUNDLE BLOCKER FOUND (2026-06-19, attempted + reverted): needs a DEDICATED wrapped-label render
## source — labelSourceId can't be it.

Attempted the un-bundle; reverted clean. The wall: the label LAYER filter requires
`nativeSlotFeatureKind=='label'` (search-map.tsx buildLabelPlacementFilter ~209). That tag is added
ONLY by the native slot-wrapping (promotedSlotFeatureRecord kind:"label") when bundling into
pinBundleSourceId. But state.labelSourceId is fed by the JS `labels` source delta (render owner sends
labelSourceStore → toNativeSourceId 'labels' → labelSourceId family; native reads it as nextLabels and
bundles). Those raw JS label features LACK nativeSlotFeatureKind. So pointing the label layers at
labelSourceId renders NOTHING (filter fails). Confirmed: RESTAURANT_LABEL_SOURCE_ID is never mounted
as a ShapeSource today; labels physically render from the bundle.
=> The un-bundle needs a NEW, DEDICATED physical render source for the WRAPPED (kind:"label") labels,
separate from the JS-fed labelSourceId family (which stays the raw-label input the prepare path reads).
Plumbing: new source id constant + mounted ShapeSource (JS) with the label layers pointed at it; native
state.labelRenderSourceId configured from the JS payload; prepareScoped/DerivedPinAndLabelOutput emit a
buildDirectSlotApplyPlans(sourceId: labelRenderSourceId, kind:"label"-wrapped labels, retainResident
Demotes:false); the stepper's labelPhysicalSourceId (SearchMapRenderController.swift ~8145) → label
RenderSourceId; the press/observation query allow-filters (~3164 labelSourceIds, ~9489 allowedSourceIds)
→ labelRenderSourceId; add labelRenderSourceId to visualSourceIds/visualAndInteractionSourceIds (~8998).
The EASY edits (layer source, opacity retarget, query filters, mount set) are known; the missing piece
is the new source-id plumbing through the native config payload (configureLabelObservation / the
labelSourceId payload ~1139). Do this as a focused pass with sim verification (labels render+fade,
reveal label-gate opens, label tap works) — getting it wrong silently breaks labels.

- UN-BUNDLE: labels move OUT of pinBundleSourceId into their own source (RESTAURANT_LABEL_SOURCE_ID
  already exists as a separate id — currently labels render off the bundle; point the label layers at
  the real label source and stop putting label records in the pin bundle in prepareScopedPinAndLabel
  Output / buildDirectSlotApplyPlans). Pin bundle = pin + interaction only → resident, never mutates
  in motion. Label source = promoted-only, add/remove on promote/demote (small, isolated, no pin
  wiggle). LABEL VARIANT (optional, if harness shows label re-tile cost): keep labels resident with a
  data-driven text-allow-overlap = ['get','nativeLabelActive'] property (demoted=true=no-collide/no-
  pollution, promoted=false=collide+side-pick), flipped on promote — verify iOS SDK supports
  data-driven text-allow-overlap first. (Feature-state can't drive collision — it's a LAYOUT prop.)

VERIFY each: [lodev] mut pin add/rm=0 while moving; extracted frames show no pin wiggle during zoom;
flashReversalCount==0 + lod_snap_contract silent; render-truth missing~0; dtMs smooth. Revert via git
if any flash detector trips.
