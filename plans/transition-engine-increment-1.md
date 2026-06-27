# Transition Engine — Increment 1 build plan (gapless scene-stack body↔body crossfade)

> **⚠️ SUPERSEDED (2026-06-27): this doc's "kept DORMANT / activation reverted / Stage-1-3 is the
> load-bearing prerequisite" conclusion is STALE.** The engine is now ACTIVATED and the gapless
> crossfade + INSTANT-COVER WORK on the common search-entangled flows (polls→pollDetail/pollCreation),
> achieved by SURGICAL gating + a `mode:'instant'` snap cover — NOT the Stage-1-3 SearchSurfaceRuntime
> fold-up (which stays owner-deferred). Two adversarial reviews fixed all regressions. The map-flash
> the dormant decision feared was solved differently (relabel the held outgoing leg to the 'polls'
> feed + instant-cover the partial→full sheet). CANONICAL state: memory `page-transition-and-results-engine.md`.

Status: **BUILD (in progress, uncommitted).** Derived from `sheet-transition-engine-design.md` via a
ground→architect→red-team workflow (run wf_5920bd11). Owner decision: the CROSSFADE makes the page switch
instant/seamless; the incoming page shows the existing loading **squircle** while its DATA loads AFTER the
crossfade reveals the frame (skeleton/pulsing placeholders deferred). Each step lands with on-device proof;
nothing committed until the owner has seen it work.

## Scope
IN: scene-stack body↔body crossfade — `result↔restaurant`, `polls↔pollDetail`, top-level bodySwap.
OUT (later increments): search-surface cross-canvas (Stage 1–3), navPush clip, modal, the sheetY-driven
interruptible driver (design-doc Step 7). MUST NOT regress: the just-landed poll↔favorite swap deny-list, the
3-way search reveal join, the collapsed-only dismiss handoff, the native camera/marker LOD lane (no wiggle).

## Three new state pieces
1. **`transitionProgress` SharedValue** (0=outgoing shown, 1=incoming shown; default 1). Home:
   `use-app-route-shared-sheet-values-runtime.ts` next to `sheetTranslateY`; surfaced on the runtime contract;
   threaded into the host exactly where `sheetYValue` is, down into BOTH the search display target AND every
   non-search body/chrome layer. **Writer = a `useDerivedValue`/`useAnimatedReaction` worklet in the long-lived
   host runtime, NOT a memo body component, NOT a spec hook** (CLAUDE.md: effects don't fire in spec hooks).
   **Increment-1 driver = clock-only**: `withTiming(1, …, onFinish→completeFromContentSettle)` armed by a
   settleToken change. Do NOT branch on sheetTranslateY (shared draggable docked-poll lane → drag would drive
   the crossfade — reviewer-2 high).
2. **`'content'` settle plane.** Widen `RouteSceneSwitchMotionPlane` with `'content'`. Pushed in
   `resolveMotionPlanes` ONLY when `sourceSceneKey !== targetSceneKey` (hole #1). Completes from the crossfade
   `onFinish` via a new `completeFromContentSettle(settleToken)` on the motion executor wired DIRECTLY from the
   render (not through the sheet host — avoids re-coupling to the dismiss-deadlock class). **BOUNDED by a net-new
   timeout (~600ms) — a SHIP-BLOCKER, not a refinement** (React Animated onFinish isn't worklet-guaranteed; an
   interrupted swap would deadlock). Seed at barrier-open keyed by settleToken; clear in completeTransition /
   commitIdle / dispose.
3. **Two-leg `{outgoingSceneKey, incomingSceneKey}` descriptor** on the surface-body snapshot (keep
   `displayedSceneKey = incoming` for back-compat). `outgoingSceneKey` = `preservedOutgoingFrameSceneKey`
   (sourced from `transitionContract.sourceSceneKey ?? handoffSceneKey` — the PRE-flip key, hole #2).
   `incomingSceneKey` = the existing four-way coalesce WITHOUT the preserve branch, with the deny-list gates
   (`isNonSearchTopLevelFrame`) still AND-ed in (poll↔favorite swap preserved).

## STAGE 1 scope, now precise (2026-06-26): the held outgoing IS the search surface, and it descends when held

Activated the engine on top of the displayedSceneKey fix and re-recorded polls→pollDetail: the incoming crossfade
engages, but the **sheet DESCENDS to the bare map** before pollDetail fades in. Root cause pinned:
`resolveTransitionSheetPresentationSceneKey` (app-route-scene-stack-runtime.ts:864-888) returns `handoffSceneKey`
as the held scene during `preserveOutgoingUntilSettle`, and for polls→pollDetail `handoffSceneKey === 'search'`
(polls is the docked lane UNDER search). So "hold the outgoing" == "hold the search surface", and the search
surface runs its OWN dismiss/descent when held in-flight. There is NO route-level shortcut — the descent is the
search surface's behavior. **Stage 1 = make the search surface FADE (opacity ramp off transitionProgress) instead
of dismiss/descend when it is the held outgoing during a content-plane crossfade**, routed through the existing
`effectiveDisplayedSceneKey`/`searchSurfaceOwnsVisibleSheet` path, and SUPPRESS the dismiss-descent for the
crossfade window — keeping `commitDismissBoundary`@collapsed byte-identical (the 2026-06-22 deadlock seam, so
Stage-0 LOD/dismiss-harness baseline FIRST). Until then: keep activation OFF; the displayedSceneKey fix already
gives a clean held-source → child slide with no gap.

## ✅ GAP FIXED (2026-06-26, video + sim verified) — and it did NOT need the crossfade engine

Root cause of the page-switch "gap": during an openChild switch (e.g. polls→pollDetail) the controller's
`displayedSceneKey` momentarily resolved to `'search'` (the idle search home) because its fall-through read the
OSCILLATING `activeSceneFrameEntry.sceneKey` (which flips to 'search'/'searchRoute' mid-switch, the search-surface
frame lifecycle). That `displayedSceneKey='search'` flash let the search surface take over and DROP the sheet to
the bare home (~80ms) before the child presented. PRE-EXISTING (baseline `swapImmediately` flashed too).

**FIX (one targeted change, `app-route-sheet-host-authority-controller.ts`):** the `displayedSceneKey` fall-through
(and the crossfade `incomingSceneKey`) now prefer the STABLE `transitionContract.targetSceneKey` over the
oscillating frame — so the displayed scene holds the real target (pollDetail) through the switch and never flips to
'search'. The search-override branches (results-dismiss / results-header / persistent-poll-lane deny-list) are
unchanged and still take precedence, so it only stabilizes the fall-through.

VIDEO-PROVEN (60fps): polls are HELD, then pollDetail slides up over them — **no bare-home flash** (vs the baseline
which collapsed the sheet to full home). SIM-VERIFIED no regression: favorites panel shows favorites not polls
(swap fix holds), single-restaurant favorites-as-search results render, real search results render, home renders,
zero errors. The native-LOD lane uses a SEPARATE displayedSceneKey (native-overlay authority) so the map is
untouched. The crossfade engine stays DORMANT (it's a separate fade-vs-slide enhancement; the slide-up is already
seamless now).

## REFRAMING (2026-06-26, video-proven): the user's "page-switch GAP" is a PRE-EXISTING search-surface dismiss, NOT a crossfade problem

Captured the polls→pollDetail transition in BOTH the dormant baseline (`swapImmediately`, current shipping
behavior) AND the activated engine, 60fps frame extraction:
- **BASELINE** (dormant): polls sheet → **bare home map (~80ms, sheet collapsed)** → pollDetail HARD-CUTS in
  fully opaque. The map-flash gap is ALREADY THERE in the old code.
- **ACTIVATED**: same map-flash → pollDetail **fades in** (250ms ramp, map visible through the translucent
  sheet). The engine improves the INCOMING entrance but rides OVER the same pre-existing flash.

So the gap the owner perceives = the **search-surface sheet collapsing to the map** when opening a child from
the polls/search-owned sheet (a dismiss-then-re-present handoff). The crossfade engine does NOT touch it. The
REAL gap fix = **hold the search surface's bundle + sheet through the transition** so it never collapses to the
map (the spec's Stage-1 / the fragile 2026-06-22 dismiss-handoff seam). The crossfade then layers cleanly on top.
Implication: prioritize the search-surface HOLD (the dismiss handoff), not more crossfade work — and gate it on
the LOD/dismiss harness baseline (Stage 0) because it IS the deadlock seam.

## OUTCOME (2026-06-26): engine BUILT, kept DORMANT — runtime proof that Stage 1-3 (search surface) is a PREREQUISITE, not optional

The full increment-1 engine is implemented + tsc-clean + boots + **zero regression** (render rewiring's idle
path is behavior-identical to the old boolean visibility; favorites-as-search, polls, swap-fix all verified
intact). What it is NOT: visibly engaging on the app's COMMON transitions — and I have hard runtime evidence
why. Instrumented the live transition (`[XFADE3]` controller vs `[XFADE4]` host):
- **polls→pollDetail** (and result→restaurant, and tab switches through the favorites/search sheet) are
  SEARCH-SURFACE-ENTANGLED. The source/active frame is `'search'` (polls is the docked lane UNDER search), and
  `activeSceneFrameEntry.sceneKey` **oscillates** between the target (`pollDetail`) and `'search'`/`'searchRoute'`
  (the empty frame) across recomputes during the switch. So `incomingSceneKey` keeps collapsing to `'search'`
  (== outgoing) → `contentTransitionToken` goes null → the crossfade ramp never fires. The controller computes
  the right descriptor (`out=search in=pollDetail token=2`) but the host lands on `out=search in=search token=null`.
- The engine DOES engage cleanly only for PURE scene-stack↔scene-stack transitions (neither leg is the search
  surface) — but those are uncommon entry points; nearly every real page switch touches the search surface.

**UPDATE — the engine NOW ENGAGES + the incoming visibly crossfades (video-proven), Stage 1-3 narrowed to one
concrete issue.** Two fixes got it there: (1) the `ActiveSceneStackSurfaceHost` React.memo comparator was missing
the new descriptor props (so it skipped the in-flight re-render); (2) `incomingSceneKey` now keys off the STABLE
`transitionContract.targetSceneKey` instead of the oscillating `activeSceneFrameEntry` — so the descriptor holds
`out=search in=pollDetail token=2` and the ramp fires. Recorded polls→pollDetail (60fps frame extraction): the
pollDetail header + body **fade in** (intermediate-opacity frames, map showing through the translucent sheet).
The engine WORKS. The REMAINING Stage-1-3 issue is now precise: during the in-flight hold the OUTGOING search
surface/sheet **drops to a ~200ms map-flash** (sheet collapses to the bare map) before the incoming fades back
in — the search surface isn't told to hold its content/sheet during the crossfade window. So the incoming
crossfades but over a map-flash instead of over the polls list. Holding the search surface (its bundle + sheet)
through the content-plane window is THE Stage-1 task. Kept dormant (no map-flash regression) pending that.

This is the spec's **hole #6 / Stage 1-3** (fold the SearchSurfaceRuntime transaction lifecycle into the engine)
proven load-bearing by runtime attribution: **the visible payoff requires Stage 1-3**, increment 1 alone cannot
deliver it on common flows. DECISION: activation reverted (handoff default back to `swapImmediately`; content
plane NOT pushed) so common flows behave EXACTLY as before — no in-flight-latency regression, no half-working
crossfade. The engine infra stays in place, dormant, as the Stage 1-3 foundation.

DORMANT engine pieces in place (all tsc-clean): content-plane type + completer + timeout + `transitionProgress`;
retain-outgoing-body; two-leg `{outgoing,incoming,contentTransitionToken}` descriptor on the surface-body
snapshot (controller-computed, threaded host→ActiveSceneStackSurfaceHost via the memo-fixed prop chain);
`SceneStackTransitionDisplayContext` + role-based animated leaf opacity (body frame + chrome `isVisible`), the
clock-only layout-effect driver, `SceneStackBodyFrame`→`Animated.View`. TO ACTIVATE (after Stage 1-3): uncomment
the content-plane push in `resolveMotionPlanes`, flip `resolveContentHandoff` default, and make
`incomingSceneKey`/`activeSceneFrameEntry` stable across the search-surface transaction (the real Stage-1 work).

## Progress (2026-06-26)
**DONE + tsc-clean + boot-verified (foundation half — inert, content plane NOT yet pushed, so no behavior change except the harmless retained-outgoing body):** steps 1, 3, 4, 5, 6.
- 1 ✅ `RouteSceneSwitchMotionPlane` += `'content'`.
- 3 ✅ `transitionProgress = useSharedValue(1)` on the shared-sheet runtime (contract + values runtime + owner assembly).
- 4 ✅ `completeFromContentSettle(settleToken)` on the motion executor + motion controller + `AppRouteSceneMotionRuntime` interface.
- 5 ✅ `contentPlaneTimeoutByToken` + `clearContentPlaneTimeout`/`clearAllContentPlaneTimeouts` in the switch controller; seeded at barrier-open when motionPlanes has 'content' (600ms), cleared on plane-complete / transition-complete / idle / dispose. **The deadlock guard.**
- 6 ✅ `shouldRenderListBody`/`shouldAttachMountedContent` OR `isTransitionParticipant` (retain outgoing body so 1−p doesn't fade a blank).

**REMAINING (the render half — NOT started; this is the high-blast-radius part, needs per-step on-device proof):** steps 7–11 + activation (step 2). Recommended simplification vetted while mapping: thread the stable `transitionProgress` SV + the `{effectiveOutgoing, effectiveIncoming}` descriptor via a `SceneStackTransitionDisplayContext` provided at `ActiveSceneStackSurfaceHost` (where `searchSurfaceOwnsVisibleSheet`/`effectiveDisplayedSceneKey` live), consumed at the leaf `SceneStackBodyFrame`/chrome frames — avoids threading + memo-rewriting through 6 nested components (the per-frame-scalar / memo-fan-out risk the red-team flagged). Per-leg override stays OUTGOING-only. Driver = clock-only `withTiming` keyed to a new settleToken, hosted where transition state + firing effects exist; onFinish→`completeFromContentSettle`. ACTIVATE LAST: push 'content' plane (`source!==target`) in `resolveMotionPlanes` + flip `resolveContentHandoff` default to `preserveOutgoingUntilSettle`.

## Steps (each tsc- or sim-verified before the next)
1. `app-overlay-route-transition-contract.ts`: widen `RouteSceneSwitchMotionPlane` += `'content'`. [tsc]
2. `app-route-scene-transition-policy-runtime.ts`: (a) `resolveMotionPlanes` gains source/target params (widen
   its Pick), pushes `'content'` when `source!==target`. (b) `resolveContentHandoff` default →
   `preserveOutgoingUntilSettle`. [tsc + unit-trace]
3. `use-app-route-shared-sheet-values-runtime.ts`: add `transitionProgress = useSharedValue(1)`; surface on
   contract. [tsc]
4. `app-route-scene-motion-executor.ts`: add `completeFromContentSettle(settleToken)` → `completeMotionPlane(
   token,'content')`; expose on the motion runtime contract. No dispatch branch. [tsc]
5. `app-route-scene-switch-controller.ts`: seed `contentPlaneTimeoutByToken` at barrier-open (≈:1052) when
   motionPlanes has 'content'; clear in completeTransition (:1153) / commitIdle (:1110) / dispose (:541). On
   fire → `completeRouteSceneSwitchMotionPlane(token,'content')`. [sim: [CONTENTTIMER] one armed/cleared per
   switch; suppress onFinish → timeout still settles]
6. **RETAIN OUTGOING BODY (review-added prerequisite).** `app-route-scene-stack-runtime.ts`: OR
   `isTransitionParticipant` into `shouldRenderListBody` (:1970) AND the mounted-body retention for the polls
   body, so BOTH legs paint during the window (else 1−p fades a blank outgoing). [sim: outgoing
   shouldRenderListBody stays true through p:0→1; renderP==roleP]
7. `BottomSheetSceneStackHost.tsx`: delete `resolveSceneStackStaticVisibility` as the opacity source; add
   `resolveSceneStackLegRole(sceneKey,{outgoing,incoming})`. Thread `{outgoing,incoming}` + `transitionProgress`
   down to body AND chrome layers. `effectiveDisplayedSceneKey`: map the override **per-leg, OUTGOING ONLY** (a
   leg∈{null,search,polls} → 'search' only when surface-owns AND it's the outgoing/frozen-results leg; the
   incoming leg keeps its real key — reviewer-2 high). Body frame `<View>`→`Animated.View`, opacity =
   role==='incoming'?p : role==='outgoing'?1−p : 0, zIndex follows p. **Same-scene short-circuit**:
   outgoing===incoming → opacity 1, no ramp (hole #1 render side).
8. `SearchMountedScenePageBundleAuthority.tsx` (or the body-display-target runtime with FIRING effects): the
   `useDerivedValue`/`useAnimatedReaction` worklet driver — reset progress to 0 on new contract, `withTiming` to
   1 gated on paint-ack under the step-5 timeout, onFinish→`completeFromContentSettle`. [sim: [PROGRESS] ramps
   0→1; onFinish fires once]
9. AWAIT-PAINT: `SceneStackBodyFrameHost` + `BottomSheetSceneStackPageFrame.tsx`: pass `onBodyViewportLayout`
   (only when this scene is the incoming participant) to mark the paint gate the step-8 driver reads. onLayout
   is a cheap lower-bound gating ramp START; SETTLE rides onFinish; timeout bounds it. Don't clobber the
   search-telemetry `bodyViewportRef`. [sim: [PAINTACK] fires for incoming]
10. CHROME rides the ramp (reviewer-2 medium): `BottomSheetSceneStackBodyLayer.tsx` + `…DecorLayers.tsx`:
    `<View>`→`Animated.View`; per-scene background/overlay/underlay decor ride opacity 1−p/p (shared pinned
    header stays boolean). **Equality fan-out**: add `outgoing`/`incoming` + the STABLE `transitionProgress` SV
    ref to every per-host memo that compared only `displayedSceneKey`; add to
    `shouldSkipSceneStackBodyContentLayerUpdate` (incl. its 'search' sub-branch),
    `areAppRouteSheetHostSurfaceBodySnapshotsEqual`, and `areDisplaySnapshotsEqual` (**STABLE per-transition
    token only** — never per-frame, else native LOD wiggle — reviewer-2 medium).
11. shellSpec both-legs gate (hole #4): emit the 2-leg descriptor ONLY when BOTH legs' `shellSpec != null`;
    else fall back to incoming-only snap (never drop the outgoing → blank).

## Acceptance (falsifiable, on-sim, fresh full bundle + [BUILDCHECK])
PRIMARY: polls→pollDetail AND result→restaurant — NO blank, both frames opacity-live ([XFADE] shows outgoing
1→0, incoming 0→1 over the window, not a 1-frame snap); incoming squircle present during overlap.
SETTLE: [CONTENTTIMER] one armed/cleared per source≠target switch; suppress onFinish → timeout still settles.
REGRESSION (byte-identical): (1) poll↔favorite swap deny-list — favorites frame on bookmarks, never polls
over it. (2) search reveal join — renderP catches roleP, render_frame_synced intact, no render_owner_invalidated.
(3) search↔polls dismiss — commitDismissBoundary on collapsed, identical timing, no leftover sheet. (4)
same-scene sort-flip/param update — constant opacity 1 (no self-flicker). LOD harness: no native wiggle
(bundle:[*,*,0], renderP==roleP).
