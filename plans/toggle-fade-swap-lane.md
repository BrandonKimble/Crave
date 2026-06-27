# Toggle Fade-Swap Lane — the ideal toggle transition

**Status:** designed (2026-06-21). BUILD STILL NEEDED — the residency owner's reveal-deadlock fix
landed (`467b14c5`) but did NOT fix the toggle (re-verified 2026-06-22, see below). Blocked only
by their ACTIVE editing of the file (a clean build window is needed). Root cause proven via
harness; design grounded in a full map of the native pipeline + JS routing.

## RE-TEST RESULT (2026-06-22): reveal fix landed, toggle STILL hangs — fade_swap NOT obviated

`467b14c5` ("reveal can't deadlock") is committed and fixed the INITIAL reveal (harness:
`frame reason:"camera_idle" promoted:17`). But re-running the toggle on the fresh binary at 5:42 PM
(Open now returns plenty — NOT the empty case): the toggle still hangs — `roleP:0, renderP:0,
paintedRanks:""`, `activePin:9 pinMidFade:9→0` (old pins fade out, new set never re-promotes),
sheet cover stuck spinning, NO projection frame fired for the toggle. So their fix addressed the
reveal LABEL-PLACEMENT deadlock; the toggle's cause is the SEPARATE camera-static projection gap
(`projectAndEmitOnScreenMarkers` never runs on a static-camera re-search) — exactly what the
fade_swap reproject fixes. ⇒ fade_swap (or at minimum the static-camera reproject on the toggle
re-search) is STILL REQUIRED. Blocker now is purely the residency owner's continuous active editing
of SearchMapRenderController.swift (reveal fix → now a "CHOPPY FIX" for pan/zoom, uncommitted) —
need a clean window or hand them the recipe (they're in the file with full context).

## ⚠️ CRITICAL (2026-06-21): the residency owner is fixing the SAME root cause from the reveal side

Caught the residency owner LIVE-editing `SearchMapRenderController.swift` (a fade_swap edit was
auto-rejected: file changed under me). Their change: `handleRenderFrameFinishedForHiddenPlacement`
— a deterministic under-cover label-placement commit driven by `onRenderFrameFinished`, fixing
`reveal_start_deadlock_placement_uncommitted` (the reveal deadlocking because the label-placement
gate never opens). The enter-lane mount (`emitExecutionBatchMountedHidden` → JS
`nativeMarkerFrameReady`) is GATED on "labels placed" — so "placement never commits → mount never
fires → cover stuck" IS the toggle stuck-cover, seen from the reveal side. Their fix de-races the
exact lane the fade_swap was going to bypass.

⇒ DO NOT build fade_swap in parallel (live collision + likely redundant). SEQUENCE:
1. Let their reveal-placement fix land; re-test toggles with the harness ([lodev] roleP>0, cover
   settles). If toggles now settle deterministically, M0/M1 (the stuck-cover fix) is DONE from the
   reveal side — no fade_swap lane needed.
2. Only the M2 pin-fade aesthetic (fade-out → swap → fade-in) may remain as an OPTIONAL
   enhancement, built ON their now-stable reveal lane + opacity engine (reuse, not fork).

The recipe below stays valid IF toggles still hang after their fix; otherwise it collapses to just
the M2 polish.

## Problem (proven)

A toggle (dish/restaurant segment OR filter: open-now / votes / rising / price) re-runs the
search and currently routes through the **full reveal lane** in
`SearchMapRenderController.swift`: `preparingReveal → mount-hidden → armed → revealing →
settle → visible`. That lane is:

- **Racy / intermittent**: toggling into a changed pin set (esp. a sparse filtered set)
  sometimes settles, sometimes hangs. When it hangs, the native enter-lane never fires
  `presentation_execution_batch_mounted_hidden` → JS `nativeMarkerFrameReady` stays false →
  the `interaction_loading` cover never lifts (infinite spinner, blank map).
  Proven via `[EMPTYDIAG]`: blocked on `map_sources_not_ready` + `native_marker_frame_not_ready`
  with `redrawCards=true, redrawSheet=true, hasNoRenderable=false`. And via `[lodev]`:
  `roleP:0, snapPromoted:0, no frame/cwork event` = projection never ran (camera static).
- **A hard cut, not a fade** — a re-enter can't crossfade.
- **Heavy** — label re-arm, collision restoration, preroll, on every toggle.

Why the projection doesn't run: `projectAndEmitOnScreenMarkers` runs only from
`handleNativeCameraChanged` (early-returns on an unchanged camera). A toggle keeps the camera
static → no projection → new markers never promote/mount. `setCandidateCatalog` even comments
"force the next camera tick to re-emit" — but there is no camera tick on a static re-search.
(The initial reveal works because `settleEnterAfterRenderedFrame` has a one-shot
`reveal_promote` kick — but a static toggle re-search intermittently never reaches settle.)

## The ideal: a third transition lane (`fade_swap`), reusing the committed opacity engine

Add a `fade_swap` lane ALONGSIDE reveal + dismiss, reusing the SAME
`animatePresentationOpacity` / `PresentationOpacityAnimator` engine (so it extends the
residency owner's pipeline, not forks it). For a same-viewport content change while `.visible`:

1. Stay `.visible` (never enter the reveal/dismiss lanes — no preroll, no label re-arm).
2. `animatePresentationOpacity(to: 0, reason: "fade_swap_out")` — fade current pins out.
3. On fade-out complete (the `progress >= 1` hook in `stepPresentationOpacityAnimation`,
   ~line 9071): apply the new source data, then
   `projectAndEmitOnScreenMarkers(reason: "fade_swap")` + `driveNativeLod` — reproject the new
   on-screen set with the STATIC camera (the projection that's otherwise camera-gated).
4. `animatePresentationOpacity(to: 1, reason: "fade_swap_in")` — fade new pins in.
5. Emit `presentation_fade_swap_settled` → JS lifts the `interaction_loading` cover.

Deterministic (fades have known duration, projection is synchronous) → **always settles**.
It IS the pin-fade (fade out → swap → fade in). Faster (no teardown). One mechanism for every
toggle.

## Native injection points (SearchMapRenderController.swift, lines approx, pre-edit)

- `applyPresentationPayload` (~2504): recognize a new `fade_swap` transaction kind while
  `.visible`; branch to the fade-swap lane instead of `beginRevealVisualLifecycle`.
- Opacity engine: `animatePresentationOpacity` (~8977), `stepPresentationOpacityAnimation`
  (~9041) — the `progress >= 1` completion hook (~9071) is where to chain phase 3→4. Will need
  a per-instance `fadeSwapPhase` field (out / swapping / in) so the completion hook chains.
- `projectAndEmitOnScreenMarkers` (~11233) — runs in `.visible` (its guard already allows it);
  reuse for the static-camera reproject.
- `lastVisibleMarkerSetSignature` — cleared on data change so the fade writes hit the new set.
- Emit a new `presentation_fade_swap_settled` event (mirror `presentation_enter_settled`).

## JS plumbing

- New `presentationIntentKind: 'fade_swap'` (template: the existing `'search_this_area'`
  lighter replace-in-place path). `use-search-submit-entry-owner.ts` SearchSubmitPresentationIntentKind.
- Route toggles to it: `query-mutation-orchestrator.ts` `fireRerunActiveSearch(...)` and the
  segment toggle pass `presentationIntentKind: 'fade_swap'`.
- New cover/transaction handling: gate the `interaction_loading` cover lift on the deterministic
  `presentation_fade_swap_settled` (a new readiness signal) instead of the racy enter-lane
  `nativeMarkerFrameReady`. Files: `search-surface-runtime.ts` (redraw readiness),
  `use-results-presentation-surface-transaction-runtime.ts`, `search-surface-results-transaction.ts`,
  and the native-event handler in `use-search-map-native-render-owner.ts` +
  `use-results-presentation-marker-enter-runtime.ts`.

## Cross-session coherence (do NOT make it patchy)

This lives in the residency owner's core presentation pipeline; they are actively refining the
reveal/dismiss fade choreography. The fade-swap MUST reuse their committed
`animatePresentationOpacity` engine (one fade engine, three lanes), not a parallel animator.
If they rework the fade engine, this lane rides on top. Keep the lane additive + behind the
new `fade_swap` kind so it can't regress reveal/dismiss.

## Refinements (2026-06-21) — dot collision + dependency relaxation

SDK facts (confirmed): `allow-overlap`/`ignore-placement` are LAYOUT props (flipping them
re-runs placement = a flicker); feature-state feeds only PAINT expressions, never layout/
collision; a `CircleLayer` doesn't collide, which is why dots are pre-baked icon SymbolLayers.
⇒ dot-vs-dot culling REQUIRES collision on the visible dot layer (you can't cull a pure-paint
layer, and feature-state can't drive culling). So dots KEEP visible-layer collision; only
labels can go pure-paint + invisible obstacle proxy (the residency owner's dismiss-crossfade
rework).

What this means for fade_swap (GOOD — relaxes the dependency):
- **swap-at-opacity-0 hides the dot re-placement.** Mapbox runs placement regardless of
  opacity (placement=layout, opacity=paint). So when fade_swap swaps data + reprojects AT
  opacity 0, Mapbox culls the new dot set while invisible; we fade in the already-culled set.
  Visible-dot collision therefore causes ZERO visible churn during a toggle — the fade-out
  trough IS the cover for the collision-heavy placement. This STRENGTHENS Option A (native):
  the swap must land precisely at opacity 0, which is native-controlled; JS two-phase (B) risks
  the placement landing while partially visible (churn returns). **Decision: Option A.**
- **Street-label crossfade is a DISMISS concern, not a toggle concern.** A toggle is
  results→results — we WANT our objects suppressing basemap labels throughout, so nothing to
  crossfade. Only a toggle to an EMPTY set wants basemap labels back (the dismiss-like edge
  case) → reuse the residency owner's label proxy THEN (later enhancement, not a blocker).
- **Dependency relaxed:** the fade_swap CORE (stuck-cover fix + pin crossfade) depends only on
  the committed `nativePresentationOpacity` engine + static-camera `projectAndEmitOnScreenMarkers`
  — NOT on the sibling's collision-decoupling. Build it on the current committed base; keep fade
  durations/easing coherent with their dismiss/reveal choreography; layer the empty-toggle
  basemap-label crossfade on later when the label proxy lands.

## TURNKEY M1 RECIPE (deterministic settle + fade-in + no churn) — every change located

Milestones: **M1** = new `fade_swap` native kind that snaps to opacity 0 → applies source +
reprojects (invisible, no churn) → fades in → fires a deterministic settled signal (kills the
stuck cover). **M2** = press-time fade-OUT of the old content (the full crossfade) — B-style:
JS sends a fade-out signal on press, the data frame does M1's apply+fade-in. M1 is independently
committable.

NATIVE (`SearchMapRenderController.swift`):
1. `setRenderFrame` switch (~line 1551, beside `case "hidden_preload","bootstrap","live_update"`):
   add `case "fade_swap":` →
   ```
   try markFrameSourceAdmission(sourceReady: false)
   try applyPresentation()                       // JSON has NO reveal/dismiss key → bookkeeping only, stays .visible
   if sourceFrameIsReady && shouldApplySourcePayload {
     // snap to 0 BEFORE applySnapshot so the source swap + dot re-placement are INVISIBLE (no churn)
     if var s = self.instances[instanceId] { try self.setPresentationOpacityImmediate(0, for:&s, instanceId:instanceId, reason:"fade_swap_hide"); self.instances[instanceId]=s }
     let result = try applySnapshot(); didSyncResidentFrame = result.didSyncResidentFrame; sourceAdmissionOutcome = result.sourceAdmissionOutcome
     if var s = self.instances[instanceId], s.visualSourceLifecycleState == .visible, let h = self.currentResolvedMapHandle(for:s.mapTag) {
       _ = self.projectAndEmitOnScreenMarkers(instanceId:instanceId, state:&s, handle:h, reason:"fade_swap", isMoving:false); self.instances[instanceId]=s
       self.driveNativeLod(instanceId:instanceId)
       if var s2 = self.instances[instanceId] { try self.animatePresentationOpacity(to:1, for:&s2, instanceId:instanceId, reason:"fade_swap_in"); self.instances[instanceId]=s2 }
     }
   } else { didSyncResidentFrame = true; sourceAdmissionOutcome = "source_pending" }
   ```
2. `stepPresentationOpacityAnimation` completion hook (`if progress >= 1`, ~line 9071): add
   `if animator.reason == "fade_swap_in" { self.emit(["type":"presentation_fade_swap_settled","instanceId":instanceId,"requestKey": state.lastFadeSwapRequestKey as Any]) }`
   (or carry the requestKey via the animator; simplest: emit with the active frame's batch id).

JS:
3. `search-map-render-controller.ts`: add `'fade_swap'` to `SearchMapVisualFrameTransactionKind`
   (~440); add a `presentation_fade_swap_settled` event to the status-event union (~169-197).
4. `use-search-map-native-render-owner.ts`:
   - `deriveSearchMapVisualFrameTransactionKind` (~720): when the re-search is an IN-PLACE toggle
     (mutationKind 'toggle'/'filter_*' AND currently `.visible`/showing results, NOT initial) →
     return `'fade_swap'` instead of `'enter'`. Thread the mutationKind/in-place flag into this
     fn (it currently only takes presentationPhase/presentationState/isInitialNativeFrame).
   - Handle the new `presentation_fade_swap_settled` event (~2490 block) → call
     `getSearchSurfaceRuntime().markRedrawNativeMarkerFrameReady(...)` → **reuses the existing
     cover gate** (cardsReady && nativeMarkerFrameReady && sheetReady) unchanged. This is the key
     trick: no new cover plumbing; just fire the existing readiness from the deterministic event.
5. The presentation-state JSON for a fade_swap frame must carry NO enter/dismiss requestKey (so
   `applyPresentationPayload` does bookkeeping only and stays `.visible`). Verify the toggle's
   redraw-transaction → presentation-phase path emits `presentationPhase: 'live'` (→ today derives
   'live_update'); the derive override (#4) upgrades the in-place toggle case to 'fade_swap'.

RISK NOTE: #4's derive change touches the SHARED kind-derivation — gate the `'fade_swap'` branch
tightly (only the explicit in-place-toggle condition) so a non-toggle can't mis-route. Build +
harness-verify before trusting. `live_update` (the existing in-place kind) is the proven template.

## Verification (per CLAUDE.md harness)

- `[lodev]` frame event with `reason:"fade_swap"`, `roleP>0`, `promotedRanks` matching cards.
- Toggle into a sparse/empty filtered set → cover ALWAYS lifts (no infinite spinner).
- Rapid-tap a toggle → coalesces, settles once.
- Verify binary mtime > source mtime before measuring; watch for `error:` lines.
