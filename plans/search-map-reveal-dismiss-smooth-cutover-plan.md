# Search Map Reveal/Dismiss Smoothness Cutover Plan

## Current status (2026-06-16)

This doc carried TWO contradictory models for a while — an older 8-cluster
"One-Slice Plan" built around lane separation, and a newer **resident-data +
dormant-layers End-state**. The resident-data + dormant-layers End-state is the
**authoritative** model and is now **IMPLEMENTED on iOS** (commits b40aa545,
d40d0d08, cec34d26, af0c415e, eab742c3). Where the older One-Slice/lane material
below disagrees, the End-state wins.

DONE (iOS):

- Gates A / B / D / E.
- The resident dismiss (marker sources stay resident across dismiss; dismiss
  dorms label render + collision layers via Mapbox `visibility:none`; the
  source-clear was deleted).
- The interruptible dimmer (reveal/dismiss are opacity-only via the native
  CADisplayLink stepper, retargeting-from-current).
- The resident-unchanged reveal skip (the enter case skips snapshot reconcile
  on a resident-unchanged re-reveal).

NOT done:

- **Cluster 2** — split structural/presentation apply. Presentation-only frames
  still ride the structural `setRenderFrame` path (the remaining Class-1 leaks).
- **Cluster 6** — sheet/chrome lane staging. `allowSheetSnap` currently has zero
  consumers.
- **Cluster 7** — sticky reapply queue.

Android parity is pending (a separate task owns the Android port).

Last updated: 2026-03-31
Status: active implementation plan
Scope:

- `/Users/brandonkimble/Crave/apps/mobile/src/screens/Search/index.tsx`
- `/Users/brandonkimble/Crave/apps/mobile/src/screens/Search/components/search-map.tsx`
- `/Users/brandonkimble/Crave/apps/mobile/src/screens/Search/components/search-results-sheet.tsx`
- `/Users/brandonkimble/Crave/apps/mobile/src/screens/Search/components/hooks/use-search-map-native-render-owner.ts`
- `/Users/brandonkimble/Crave/apps/mobile/src/screens/Search/hooks/use-search-presentation-controller.ts`
- `/Users/brandonkimble/Crave/apps/mobile/src/screens/Search/runtime/controller/presentation-transition-controller.ts`
- `/Users/brandonkimble/Crave/apps/mobile/src/screens/Search/components/hooks/use-search-map-label-observation.ts`
- `/Users/brandonkimble/Crave/apps/mobile/src/screens/Search/components/hooks/use-search-map-label-runtime.ts`
- `/Users/brandonkimble/Crave/apps/mobile/ios/cravesearch/SearchMapRenderController.swift`
- `/Users/brandonkimble/Crave/apps/mobile/android/app/src/main/java/com/crave/SearchMapRenderControllerModule.java`

## Objective

Cut over reveal and dismiss to an architecture where those presentation flows are visually smooth because they are almost entirely presentation-only.

The target is not a small tuning pass. The target is a large ownership cut:

- structural map publication happens outside the visible reveal/dismiss animation window,
- rendered-label observation is not allowed to wake up inside covered or dismissing phases,
- bottom-sheet snap motion is not allowed to overlap the heaviest map presentation work,
- reveal/dismiss become cheap native presentation lanes instead of multi-system overlap windows.

This should preserve current UX semantics while making startup reveal and close feel intentionally smooth instead of coincidentally acceptable.

## End-state model (authoritative — added 2026-06-15)

The target is the **resident-data + dormant-layers** model. It is the same single
principle the whole map is converging on (one owner; data stays put; only
opacity/visibility moves), now extended to cover reveal/dismiss/interrupt.

### The two-level residency

Mapbox has two distinct "off" switches and the design needs BOTH:

- **Opacity → 0**: invisible, but the symbol is still laid out / collided every camera
  frame (NOT free).
- **Layer `visibility: none`**: the layer is dropped from the layout/placement pipeline
  entirely (truly free). The collision layers ALREADY use this
  (SearchMapRenderController.swift `setLabelCollisionObstacleLayersVisible` ~6151) — the
  mechanism is proven in-house; the marker (pin/dot/label) layers must adopt it.

So:

- **Source DATA is resident** from the first search onward — pins/dots/labels stay in the
  Mapbox sources (and the JS source frame). This gives instant re-reveal (no republish /
  rebuild), crossfade-from-old-data, and trivial interruption.
- **Layers go dormant** (`visibility: none`) the moment a dismiss SETTLES → zero per-frame
  layout/placement/GPU cost while panning the empty (between-searches) map.

### Current code this REPLACES

Today, dismiss-settle calls `clearResidentSourcesAndTransientFeatureStates()`
(SearchMapRenderController.swift ~6076) — it DELETES the marker features, and the JS
controller commits `EMPTY_SEARCH_MAP_SOURCE_FRAME_SNAPSHOT`
(use-direct-search-map-source-controller.ts ~1277). That delete is how the map gets zero
idle cost today — but it is also why dismiss is structural (Gate B leak), why re-reveal
rebuilds, and why interrupting a close is messy. The cutover swaps "delete on dismiss" for
"resident data + `visibility:none` on dismiss-settle".

### What STAYS (already correct — verified 2026-06-15)

All decision work is already gated off when hidden and must remain so:

- Native camera projection / `computeOnScreenMarkerKeys` early-returns via
  `isVisualSourceInactiveOrDismissing` (~10648).
- Both CADisplayLink steppers (`updateLivePinTransitions`, `stepPresentationOpacityAnimation`)
  idle / invalidate their display link when hidden (~7443, ~8561).
- Label observation (schedule + commit) gated off when hidden (~8750, ~8998) and in JS by
  lane policy (`isPresentationLive`).
- JS LOD candidate selection / promoted-set (`buildMarkerRenderModel`) is short-circuited
  before it runs by the `isSearchVisualProjectionLive` gate (~1271).

These gates key off the hidden lifecycle state, so they keep working as long as
dismiss-settle still transitions to `.hidden` (we keep that; only the source-clearing
ACTION becomes a layer-visibility flip).

### Lifecycle (the single dimmer)

1. **Reveal**: marker layers → `visible`, then presentation opacity dimmer 0→1 (native
   stepper). Source publish happens under cover / on data-change, never as a reveal step.
2. **Live**: normal.
3. **Dismiss**: opacity dimmer 1→0. Sources resident, layers stay `visible` during the
   fade → NO structural work in the visible window (Gate B by construction).
4. **Dismiss settled** (already invisible): flip marker layers → `visibility: none`. Cheap,
   unseen, zero idle cost afterward.
5. **Interrupt (reversible/interruptible)**: reveal can be interrupted by close, dismiss by
   submit, etc. An interrupt is JUST a new dimmer target; the stepper fades from the CURRENT
   value toward it. Layers only go dormant at a SETTLED dismiss, so an interrupted close
   never reaches dormancy. (Requires the presentation stepper to retarget-from-current — the
   opposite of the LOD stepper's run-to-completion commit invariant, because a user interrupt
   is a legitimate reversal, not a stale automated flip.)
6. **New different search**: the source data delta-swaps (the ONE legitimate structural
   moment — only a real results change ever touches sources), decoupled from the dimmer; the
   old resident data is the backdrop so the transition crossfades instead of flashing.

### Idle-cost requirement (between searches, no results)

Panning the empty map after the first search must be frame-drop free. Achieved by: layers
`visibility:none` (zero placement), and all decision work already gated off when hidden.
Optional micro-opt: bail at the top of the viewport subscription when not live, to skip the
minor pre-gate state reads.

### Implementation clusters (mapped to code 2026-06-15)

Native paths (apps/mobile/ios/cravesearch/SearchMapRenderController.swift):

- Dismiss-settle (as IMPLEMENTED): `completeDismissVisualLifecycle` dorms the
  label render + collision layers and sets `.hidden`. The previous design caching
  step `residentDesiredSourceCacheBySourceId` and the
  `restoreResidentDesiredSourceCacheForEnter` restore are both **DELETED**
  (commit eab742c3) — there is no resident-source-cache machinery anymore; the
  sources simply stay resident. The old `clearResidentSourcesAndTransientFeatureStates`
  source-clear no longer runs on dismiss.
- Enter: the cache restore is **deleted**; on a resident-unchanged re-reveal the
  enter case skips the snapshot reconcile entirely (af0c415e).
- The proven dormancy mechanism that was mirrored: `setLabelCollisionObstacleLayersVisible`
  → `setLayerProperty(... "visibility", "none"/"visible")`.

Cluster I (native) — marker-layer dormancy (IMPLEMENTED):

- The real helper is `setLabelRenderLayersVisible` (NOT `setMarkerLayersVisible`,
  which does not exist). It dorms ONLY the **label + collision** layers via
  `visibility:none`. The pins/dots are `ignorePlacement` symbols and are kept
  **resident at opacity 0** rather than dormed — they cost no placement work, so
  there is no need to drop them from the layout pipeline.
- In `completeDismissVisualLifecycle`: the source-clear is removed; sources stay
  populated; `.hidden` + opacity-0 transitions are kept (so all existing
  hidden-gating stays active).
- On the enter path the layers are re-shown before the opacity dimmer (with
  opacity feature-state still 0 to avoid a flash). The old cache-restore is
  **deleted**, and a resident-unchanged re-reveal skips snapshot reconcile.

Cluster II (JS) — stop publishing the empty frame on dismiss:

- use-direct-search-map-source-controller.ts ~1271-1280: when `!isSearchVisualProjectionLive`
  AND the phase forbids structural apply (visible dismiss), keep the resident frame instead
  of `commitResidentSourceFrameSnapshot(EMPTY_SEARCH_MAP_SOURCE_FRAME_SNAPSHOT)`.

Cluster III (native) — interruptible dimmer:

- Ensure `stepPresentationOpacityAnimation` retargets from the CURRENT opacity value when the
  target flips mid-flight (reveal↔dismiss interrupt), rather than restarting/snap. Distinct
  from the LOD stepper's run-to-completion commit invariant.

Cluster IV — new-data-while-hidden: a new search while hidden/dismissing must update the
resident (still-populated) sources normally and flip layers visible; verify the existing
data path works when sources are already populated rather than empty.

Cluster V — validation: reveal/dismiss flow shows zero `isStructuralApplyLaneLeak` (Gate B/C),
idle pan of the empty between-searches map stays 60fps (visibility:none), and interrupt
cases (reveal interrupted by close; dismiss interrupted by submit; dismiss interrupted by a
DIFFERENT submit) are smooth + crossfade with no flash.

## Product Contract

Keep:

- current search results reveal and dismiss behavior
- current pin/dot/label rendering semantics
- current sticky label ownership model
- current LOD promote/demote bundle behavior
- current sheet snap targets and chrome semantics unless explicitly changed below

Change:

- reveal and dismiss no longer overlap expensive structural work, label observation refresh, and sheet snap motion in the same hot window
- presentation phases become almost entirely native visual state changes
- structural publication and cleanup move to pre-reveal or post-dismiss boundaries

Must preserve:

- no blank map flash between submit and visible results
- no stale result ownership after a new semantic batch arrives
- no regression in close/open semantics of the results sheet
- no regression in sticky label correctness

## Root Problem

Current reveal and dismiss are choppy because too many systems wake up in the same interval:

- full native snapshot reconcile/apply
- rendered-label observation/query
- presentation controller lane changes
- results-sheet snap motion
- list first-paint readiness
- sticky reconcile/reapply

Even when individual pieces are reasonable on their own, the aggregate window is too dense.

The current path is still effectively:

1. prepare semantic results
2. begin cover
3. mount/snap/list/map readiness all overlap
4. native apply + label observation can still happen near reveal start
5. reveal begins while other lanes are still active

Dismiss has the same problem in reverse:

1. dismiss preroll starts
2. map dismiss work overlaps sheet collapse
3. interaction suppression and state cleanup happen in the same interval
4. structural cleanup can race with visible motion

## Ideal End State

### Core principle

Reveal and dismiss should be presentation lanes, not structural lanes.

Only one of these classes of work should be hot at a time:

- structural publication
- presentation animation
- observation/sticky refresh
- sheet/chrome motion

### Lane model

The target architecture has four explicit lanes.

#### 1. Structural lane

Owns:

- pin source publication
- dot source publication
- label candidate source publication
- collision source publication
- interaction source publication
- native desired snapshot generation

Rules:

- semantic batch changes enter this lane
- structural lane may run while covered
- structural lane may run after dismiss settles
- structural lane must not run during visible reveal or visible dismiss unless there is a true semantic invalidation that cannot wait

#### 2. Presentation lane

Owns:

- covered
- reveal requested
- mounted hidden
- revealing
- live
- dismiss preroll
- dismissing
- idle

Rules:

- this lane is native-first
- during visible reveal/dismiss, it should only change opacity/phase state and other tiny local presentation state
- no full source republish
- no label observation refresh

#### 3. Observation lane

Owns:

- rendered-label query
- sticky candidate observation
- post-live sticky updates

Rules:

- disabled during `covered`
- disabled during `reveal_requested`
- disabled during `mounted_hidden`
- disabled during `dismiss_preroll`
- disabled during `dismissing`
- enabled only in `live`, and optionally late in `revealing` if strictly needed after first visible frame

#### 4. Chrome lane

Owns:

- results-sheet snap motion
- overlay chrome freeze/resume
- bottom-nav/header choreography

Rules:

- chrome motion must not overlap the heaviest map presentation work
- sheet snap timing is staged relative to reveal/dismiss, not fired opportunistically whenever state changes

## Ideal Reveal Sequence

This is the target reveal shape.

### Phase R0: semantic prepare

JS owns:

- search response apply
- semantic marker catalog build
- list data ready

Native owns nothing visible yet.

Rules:

- no label observation refresh
- no visible map reveal

### Phase R1: covered structural publish

> NOTE (2026-06-16): this describes the superseded publish/clear model. In the
> resident end-state, marker sources stay resident across dismiss, so re-reveal
> usually has nothing to publish (resident-unchanged re-reveal skips the reconcile).

While cover is visible:

- structural lane publishes one hidden semantic batch
- native applies desired snapshot to mounted-hidden state
- list first paint completes
- if the sheet must move to its open snap, it does so here or after reveal, but not during visible reveal

Rules:

- structural publication may be heavy here because cover hides it
- observation lane remains disabled

### Phase R2: native-only reveal

After hidden mount is ready:

- reveal starts
- map presentation opacity animates from hidden to visible
- no structural republish
- no label query/refresh
- no sticky refresh
- no sheet snap motion in this interval

Rules:

- reveal should be a pure presentation animation

### Phase R3: post-reveal settle

After first visible frame or settled reveal:

- observation lane resumes
- sticky reconciliation can resume
- any deferred sheet/chrome motion can complete if it was intentionally staged after reveal

Rules:

- heavy refreshes begin only after visible reveal is no longer on the critical path

## Ideal Dismiss Sequence

This is the target dismiss shape.

### Phase D0: dismiss preroll

- observation lane is disabled immediately
- sticky refresh stops
- no structural cleanup yet

### Phase D1: native-only dismiss

- map presentation opacity animates out
- no structural source clearing
- no heavy reconcile
- no concurrent sheet collapse

### Phase D2: post-dismiss cleanup

> NOTE (2026-06-16): this describes the superseded publish/clear model. In the
> resident end-state, dismiss NEVER clears the marker sources — the source-clearing
> described here is a no-op. Dismiss-settle only dorms the label + collision layers
> via `visibility:none`; the data stays resident.

After dismiss settles:

- sheet collapse runs if needed
- interaction sources can be suppressed/cleared
- structural cleanup and source clearing happen here
- results state reset can happen here

Rules:

- the visible dismiss window remains presentation-only

## Measured state (2026-06-15, scenario search_map_lod_reveal_dismiss, 5+ cycles)

Gate E is implemented: `native_set_render_frame_bridge_slice` now carries
`liveExecutionStage` + `lanePolicyAllowsStructuralApply` + `isStructuralApplyLaneLeak`
(use-search-map-native-render-owner.ts), and the observation contract already carries its
own enablement. Measured against the gates:

- **Gate A (reveal observation-free): PASS** — zero observation enabled during
  `enter_executing` (closed by Cluster 1 lane policy).
- **Gate D (observation staged): PASS** — observation never enabled while
  `isResultsExitActive` (no observation in dismiss/covered-forbidden windows).
- **Gate E (lane-attributable diagnostics): PASS.**
- **Gate C (reveal structural-staged): FAIL — 2 leaks** during `enter_executing`. Both are
  `sourceDeltaCount:0` / `snapshotChanged:false` (presentation-only + control-state-only),
  but each still drives a full native resident-frame re-sync (`nativeDidSyncResidentFrame:true`,
  35ms and 114ms). Class 1.
- **Gate B (dismiss presentation-only): PASS (updated 2026-06-16).** The original
  measurement showed 4 leaks — 2 Class 1 and 2 Class 2 (real source clearing,
  `replaceSourceCount:5`, empty snapshot, `pinCount:0`). The **Class-2 source-clears
  are now fixed** by the resident dismiss (d40d0d08 + cec34d26): dismiss no longer
  clears sources, so the "structural source clearing during visible dismiss" Gate B
  forbids no longer occurs. Only **Class-1 presentation-only-frame leaks** remain
  (= Cluster 2), and those are the residual Class-1 work, not a Gate-B violation.

### The two fix-classes (the remaining real work)

- **Class 1 — non-structural change routed through the structural apply path.** A
  presentation-only or control-state-only frame (no source delta) still calls
  `flushLatestDesiredFrame` → native `setRenderFrame`, paying 12–114ms of resident-frame
  re-sync inside the hot window. Fix = Cluster 2: route presentation/control-only changes
  through a cheap presentation-only apply (or suppress the structural flush when
  `sourceDeltaCount===0` during a forbidden phase). Now that the native stepper owns reveal
  opacity, many of these presentation frames may be fully redundant.
- **Class 2 — real source clearing during visible dismiss.** The empty-snapshot replace
  that clears pins/dots/labels fires in `exit_executing`. Fix = Cluster 4: defer source
  clearing to post-dismiss settle (`idle`), keeping the visible dismiss source-stable.

## Current Misalignment

The current implementation is still misaligned in these ways:

1. Structural reconcile can still be triggered close to reveal/dismiss boundaries.
2. Label observation can still wake up too early around reveal or too late around dismiss.
3. Sticky-driven reconcile can still land near presentation windows.
4. Sheet snap motion is still orchestrated near reveal and dismiss instead of being explicitly staged.
5. Presentation controller readiness gates are correct semantically, but they still permit too many concurrent lanes.

## Architecture Decision

Do not revert to the old architecture.

Keep:

- native-owned presentation phase
- native-owned sticky/stateful label placement
- JS-owned semantic marker catalog
- structural/render separation

Change:

- presentation phases become stricter lane boundaries
- sticky observation is post-reveal work, not reveal work
- reveal/dismiss become source-stable windows
- sheet/chrome motion is staged, not co-fired

## Delete Gates

This cutover is only complete when all of the following are true.

### Gate A: visible reveal is presentation-only

During visible reveal:

- no label observation refresh
- no sticky reconcile-triggered full snapshot apply
- no structural source republish
- no bottom-sheet snap animation

### Gate B: visible dismiss is presentation-only

During visible dismiss:

- no label observation refresh
- no structural source clearing
- no sticky reconcile-triggered full snapshot apply
- no bottom-sheet snap animation

### Gate C: structural work is staged

Structural source publication happens:

- before reveal while covered, or
- after dismiss settles

Not:

- during visible reveal
- during visible dismiss

### Gate D: observation is staged

Rendered-label observation and sticky refresh only run when the presentation lane allows it.

They must not run in:

- `covered`
- `reveal_requested`
- `mounted_hidden`
- `dismiss_preroll`
- `dismissing`

### Gate E: diagnostics are lane-attributable

Diagnostics must clearly separate:

- structural apply cost
- presentation animation cost
- label observation/query cost
- sheet snap cost

So a future slow reveal/dismiss window can be attributed without guesswork.

## One-Slice Implementation Plan

This is a single large continuous slice, but it still has ordered clusters inside it. The cutover is not promotable until all clusters are complete.

### Cluster 1: lock presentation-lane boundaries

Define explicit phase policy in code:

- reveal phases where observation is forbidden
- dismiss phases where observation is forbidden
- reveal/dismiss phases where structural apply is forbidden except for already-mounted presentation-only changes

Likely files:

- `presentation-transition-controller.ts`
- `use-search-presentation-controller.ts`
- `use-search-map-native-render-owner.ts`
- native render owner modules

Exit gate:

- presentation lane has an explicit “allowed work by phase” contract

### Cluster 2: split structural apply from presentation apply

Refactor native render owner so it distinguishes:

- structural desired snapshot apply
- presentation-only apply

Structural apply should be used for:

- semantic batch publication
- post-dismiss cleanup
- true data changes

Presentation-only apply should be used for:

- reveal opacity transitions
- dismiss opacity transitions
- mounted-hidden to visible flips

Exit gate:

- visible reveal/dismiss no longer require full desired snapshot reconciliation

### Cluster 3: move reveal structural work under cover

Change reveal sequencing so:

- hidden mount and structural publication complete while cover is visible
- reveal starts only after hidden mount and list first paint are ready
- reveal does not itself trigger structural apply

Exit gate:

- first visible reveal frame occurs after structural work is already finished

### Cluster 4: move dismiss cleanup after visual settle

Change dismiss sequencing so:

- dismiss starts immediately as presentation-only fade
- state cleanup and source clearing happen only after dismiss settled
- interaction suppression stays correct without forcing heavy structural churn during visible close

Exit gate:

- dismiss visual window contains no structural cleanup work

### Cluster 5: hard-gate observation by presentation phase

Observation controller must obey presentation lane policy:

- no queryRenderedFeatures during forbidden phases
- no sticky refresh during forbidden phases
- no sticky-triggered snapshot reapply during forbidden phases
- if sticky changes are discovered near a forbidden phase, queue them until allowed

Exit gate:

- reveal/dismiss logs show zero observation work inside forbidden windows

### Cluster 6: stage sheet/chrome motion explicitly

Pick one of two legal models and cut fully to it:

Option A:

- snap sheet under cover before visible reveal
- visible reveal is map-only

Option B:

- reveal map first
- snap sheet only after reveal first visible frame or settled

For dismiss:

- fade map first
- collapse sheet after dismiss settled

The implementation should choose one model and remove the other implicit overlap path.

Exit gate:

- sheet snap and visible map reveal/dismiss do not overlap

### Cluster 7: simplify sticky reapply during presentation windows

Sticky state can still change while live, but it should not perturb reveal/dismiss.

Rules:

- if presentation phase forbids structural apply, sticky reapply queues
- when phase returns to allowed, native applies the updated lock/search state

Exit gate:

- sticky correctness is preserved without stealing time from reveal/dismiss

### Cluster 8: diagnostics and proof

Add or refine diagnostics so each reveal/dismiss window reports:

- structural apply count and total ms
- presentation-only apply count and total ms
- label observation query count and total ms
- sticky reapply count
- sheet snap overlap state
- first visible frame timing
- dismiss settled timing

Exit gate:

- logs can prove whether reveal/dismiss are now presentation-only windows

## Validation

Always run:

- relevant lint/tests for touched files
- `bash /Users/brandonkimble/Crave/scripts/no-bypass-search-runtime.sh`

Run when relevant:

- `bash /Users/brandonkimble/Crave/scripts/search-runtime-natural-cutover-contract.sh`

Native compile checks:

- `swiftc -parse /Users/brandonkimble/Crave/apps/mobile/ios/cravesearch/SearchMapRenderController.swift`
- `./gradlew app:compileDebugJavaWithJavac`

Perf validation:

- run the same submit/reveal/close flow on device
- capture `[PRESENTATION-DIAG]`, `[MAP-LABEL-PERF-DIAG]`, `[BOTTOM-SHEET-DIAG]`, and any new reveal/dismiss lane diagnostics

Device validation focus:

- cold startup reveal
- dismiss after live results
- repeat submit reveal
- repeat close/open cycles
- verify no regression in sticky label correctness

## Expected End-State Signals

If the cutover is correct, the logs should show:

- reveal window:
  - no `map_label_refresh_query`
  - no structural apply churn
  - one clean reveal batch lifecycle
- dismiss window:
  - no structural cleanup before visual settle
  - no label observation activity
  - no overlap with sheet collapse
- post-reveal live window:
  - observation resumes
  - sticky updates resume

## Notes

This plan intentionally pushes toward a stricter architecture than the current one.

The right answer is not “keep tuning everything inside reveal/dismiss.”
The right answer is “make reveal/dismiss cheap by construction.”

That means:

- fewer allowed lanes,
- harder phase boundaries,
- staged structural work,
- staged chrome work,
- and presentation-only visible animations.
