# Search Map Label Snap Cutover Plan

Last updated: 2026-03-30
Status: active implementation plan
Scope:

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/search-map.tsx`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/hooks/use-map-marker-engine.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/hooks/use-search-map-label-runtime.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/hooks/use-search-map-label-sources.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/components/hooks/use-search-map-native-render-owner.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/ios/cravesearch/SearchMapRenderController.swift`
- `/Users/brandonkimble/crave-search/apps/mobile/android/app/src/main/java/com/crave/SearchMapRenderControllerModule.java`

## Objective

Cut over to a simpler hybrid map architecture where ordinary label position changes snap to the newly committed candidate instead of fading out of the old position and fading into the new one.

The goal is not just visual simplification. The goal is to remove label-move transition machinery from the motion hot path so movement-time work becomes cheaper, more stable, and easier to reason about.

## Product Contract

Keep:

- pin and dot LOD promote/demote animation
- whole-presentation reveal and dismiss behavior
- sticky label hysteresis / anti-flap behavior
- current ranking / candidate / collision semantics unless explicitly changed

Change:

- ordinary label candidate changes are discrete snaps
- no fade choreography for label side switches during motion or sticky resolution
- label opacity animation remains only when a label is entering or exiting with its owning pin/dot LOD bundle

Must preserve:

- no rapid sticky flapping at edge decisions
- no stale label candidate ownership after a semantic source update
- no UX regression where labels disappear for an extra frame just because the candidate changed

## Ideal End State

### Ownership split

JS owns:

- semantic marker catalog
- stable pin and label candidate definitions
- ranking / text / candidate metadata
- coarse structural publication only on semantic or settle-time changes

Native owns:

- rendered-label observation
- committed vs observed sticky candidate
- anti-flap / hysteresis
- whole-presentation opacity
- pin / dot LOD animate-in and animate-out

Neither JS nor native should do heavy structural label work every camera sample.

### Label behavior

For labels, the winning candidate is a single committed state.

When native decides the winner changed:

- the preferred candidate property/state changes
- the label snaps to the new position
- there is no per-label crossfade, no old/new overlap window, and no transition progress state for label moves

Label opacity may still animate when the owning pin/dot LOD bundle is entering or exiting.
That is a separate concern from candidate re-anchoring.

### Pin / dot behavior

Pin and dot LOD changes may still animate:

- pin opacity via `nativeLodOpacity`
- pin rank opacity via `nativeLodRankOpacity`
- dot opacity via `nativeDotOpacity`
- label opacity when the label is entering/exiting with the owning pin bundle

That animation stays because it carries real UX value and is already aligned with structural promote/demote boundaries.

## Current Misalignment

The current cutover still carries label transition machinery inside the live pin transition system.

Evidence in code:

- JS map style multiplies label opacity by `nativeLabelOpacity`
- iOS and Android both apply transient label feature-state during live pin transitions
- label features participate in per-frame native transition updates even though the desired end state is a discrete candidate snap

That means:

- label moves still inherit pin transition churn
- label side changes are more expensive than they need to be
- motion-time work still includes label transient state bookkeeping

## Delete Gates

This cutover is only complete when all of the following are true.

### Gate A: no label move transition state

Delete or stop using:

- any label transition state that exists only to animate candidate re-anchoring
- any old/new label overlap path for side changes
- any label transition progress state that is not required for LOD bundle enter/exit
- JS label-layer opacity transition if it only exists to smooth candidate-side changes

Allowed remaining label opacity:

- whole-presentation opacity via `nativePresentationOpacity`
- LOD-bundle opacity via label opacity tied to owning pin/dot enter/exit

### Gate B: label move is driven only by committed candidate

Label move behavior must derive from:

- semantic candidate universe from JS
- native committed sticky candidate / preference

Not from:

- label transition progress for candidate changes
- label transient opacity state
- pin transition lifecycle

Exception:

- label opacity may still mirror the owning pin bundle during LOD promote/demote

### Gate C: structural source stability during motion

Ordinary camera motion should not continuously republish:

- pin source store
- dot source store
- label candidate source store

Allowed movement-time updates:

- native observation events
- native sticky commits
- native pin/dot LOD opacity animation frames

### Gate D: diagnostics become simpler

After cutover, there should no longer be label-specific transient diagnostics in the live reveal system that imply label fade ownership.

## Implementation Slices

### Slice 1: lock target contract

Define the snap contract explicitly in code comments and implementation:

- labels snap on candidate change
- pins/dots may still animate
- presentation opacity remains separate from label movement

Exit gate:

- current label-move ownership points are identified on JS, iOS, and Android

### Slice 2: remove label re-anchor transition ownership from native live transition system

iOS and Android:

- keep label opacity only when it is part of pin/dot LOD enter/exit
- remove any label transition ownership that exists only for candidate repositioning
- keep pin and dot transitions intact
- keep label participation only where needed for pin/label bundle opacity

Exit gate:

- native live transition frame loop no longer carries candidate-reanchor ownership for labels
- any remaining label opacity updates are justified only by LOD bundle enter/exit

### Slice 3: simplify JS label style stack

JS:

- keep label opacity hooks only if they are serving bundle enter/exit
- remove label opacity hooks used only for candidate re-anchor choreography
- label candidate layers snap between candidates while still allowing presentation and LOD bundle opacity

Exit gate:

- label layer style no longer depends on label-move transition state
- any remaining label opacity dependency is explicitly tied to LOD bundle animation

### Slice 4: finish structural stabilization

Ensure movement does not republish label structural snapshots just because viewport-driven LOD changes are oscillating.

Likely actions:

- keep pin / dot stores frozen to settled snapshots during motion
- make label candidate source store derive from the settled structural store during motion
- keep native sticky ownership intact

Exit gate:

- `js:renderFrameTransport` stops showing continuous pin/label churn during ordinary movement

### Slice 5: tune and validate

Validate:

- cold first reveal
- big pans
- twisty zooms
- sticky edge cases
- LOD promote/demote behavior

Exit gate:

- label snaps feel stable, not flickery
- movement is smoother than the current native-heavy path
- no regression in pin/dot LOD animation

## Validation

Always run:

- relevant lint/tests for touched files
- `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`

Run when relevant:

- `bash /Users/brandonkimble/crave-search/scripts/search-runtime-natural-cutover-contract.sh`

Native compile checks:

- `swiftc -parse /Users/brandonkimble/crave-search/apps/mobile/ios/cravesearch/SearchMapRenderController.swift`
- `./gradlew app:compileDebugJavaWithJavac`

Device validation focus:

- compare movement smoothness before/after
- inspect `[MAP-LABEL-PERF-DIAG]` windows for lower observation pressure
- inspect `[MAP-CHURN-DIAG] js:renderFrameTransport` for reduced source churn

## Notes

This plan intentionally does not revert the useful architecture wins:

- native sticky ownership
- native hysteresis
- semantic/render transport separation

It narrows the native responsibility back to the right kind of motion-time work:

- observe
- commit
- snap

Not:

- animate label moves
- keep label transition state alive in the hot path
