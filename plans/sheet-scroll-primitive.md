# The Sheet-Scroll Primitive — verified model + ideal shape (2026-07-11)

Owner directive: scroll must be a primitive of ALL sheets — the result-sheet feel
(both handoff directions, content never desyncs) everywhere, so good that a new
sheet gets perfect scroll by construction. This doc is the verified model (6-agent
red team, every load-bearing claim re-verified by hand against node_modules) and
the design of record.

## 1. The machine (verified)

One shared machine already serves every sheet body:

- **Three gestures** (`useBottomSheetSharedGestureRuntime`): `expandPan` +
  `collapsePan` (manual-activation pans on the sheet detector) + `Gesture.Native`
  on the scroll container. Relations: native `requireExternalGestureToFail(expandPan)`
  — **expandPan is the universal arbiter; no scroll starts until it fails** —
  and collapsePan runs `simultaneousWithExternalGesture` the native scroll.
- **UP handoff**: expandPan drives `sheetY`; at expanded it calls
  `handoffExpandGestureToScroll` → `stateManager.fail()` → the native
  UIScrollView pan activates mid-touch; same finger becomes list scroll.
  Re-entry guards: `expandHandoffLocked`, `expandGestureOwner`, axis lock.
- **DOWN handoff**: collapsePan evaluates every move while the list scrolls;
  activates only when `goingDown && atExpanded && isAtScrollTop && !isInMomentum`
  → same finger becomes sheet collapse the frame the list tops out.
- **No-desync invariants**: `SHEET_BODY_NO_OVERSCROLL` (bounces/alwaysBounce
  false + overScrollMode never), applied structurally in
  `BottomSheetScrollContainer` AFTER the prop spread. Load-bearing twice:
  (a) the down-handoff needs the list physically pinned at top (or content
  slides past the header while the sheet grabs); (b) the FrostCutout plate
  translates by `-scrollOffset` and cannot follow negative offsets.
  `scrollOffset`/`scrollTopOffset`/`isInMomentum` written only by the OWNING
  list's handlers (`useBottomSheetSharedScrollEventsRuntime`).

## 2. Root cause of the dead child-page scroll (proven)

Child pages froze `scrollEnabled=false`; the result sheet survived by accident.

1. Child legs first COMMIT mid page-switch while `interactionEnabled` is
   transiently false → `shouldEnableScroll=false` at mount
   (`useBottomSheetSharedRuntime.tsx:310`).
2. **No channel ever delivers `true` again:**
   - The "reactive SharedValue" channel (`useAnimatedProps` on
     `AnimatedFlashList`, the 2026-07-02 frame-drop fix) **never worked**:
     FlashList v2's root is a plain `CompatView` (RecyclerView.tsx ~481) — UI-thread
     animatedProps updates land there, where `scrollEnabled` is meaningless.
     Worse, Reanimated spreads `animatedProps.initial.value` into React props
     (PropsFilter.tsx ~60) and FlashList `{...rest}`-forwards that to the real
     `CompatScrollView` → the transient `false` is BAKED into the native scroll
     view permanently.
   - The JS re-render channel is deliberately starved:
     `areSceneBodyRuntimeSelectionsEqual` (BottomSheetSceneStackHost ~405)
     blocks `shouldEnableScroll`-only re-mints — an optimization whose premise
     ("the SV drives it reactively") is refuted above. Mounted bodies read the
     JS boolean inside this starved path (`useBottomSheetSceneStackBodyContentRuntime` ~308).
3. Second kill switch: the native gesture bakes `.enabled(shouldEnableScroll)`
   and re-mints per toggle, but the mount-stable ScrollComponent reads it from
   a ref at render time — same starvation leaves a stale `.enabled(false)`
   gesture attached. (The in-code "confined to a mid-transition frame" comment
   is wrong: a dead page produces no re-render to heal itself.)
4. Landmine (independent): ONE shared `Gesture.Native` instance is attached to
   MANY co-mounted legs' GestureDetectors; RNGH binds a gesture to one detector
   — which ScrollView owns the handler (and the arbiter relations!) is
   mount-order-dependent.
5. Result sheet: reads the JS boolean directly, first renders while active
   (true baked), re-renders constantly through its own data stores. Alive by
   coincidence, not by design.

## 3. The ideal shape: the container IS the primitive

`BottomSheetScrollContainer` is already the single native scroller every body
renders through, and already owns no-overscroll structurally. The fix and the
genericization are the same move — give it the remaining two authorities:

1. **scrollEnabled authority (UI-thread, mount-timing-proof).** The container
   applies `useAnimatedProps(() => ({ scrollEnabled: shouldEnableScrollShared.value }))`
   on its own `AnimatedScrollView` — a REAL ScrollView, so animatedProps work.
   The SV is already authority-synced on every runtime-config recompute
   (`syncRuntimeConfigSharedValuesOnUI`). React render liveness becomes
   irrelevant; the comparator stops lying and becomes correct.
   DELETE every consumer channel: SearchMountedSceneBody's JS-bool prop,
   list surface's dead animatedProps machinery, mounted path's JS-bool prop,
   BottomSheetWithFlashList's prop. Incoming `scrollEnabled`/`animatedProps`
   are stripped in the container so no scene can shadow the authority
   (same law as no-overscroll).
2. **Per-instance native gesture.** The container mints its own
   `Gesture.Native().requireExternalGestureToFail(expandPan).simultaneousWithExternalGesture(collapsePan)`
   per mounted instance. RNGH relations are OR'd across the pair (verified:
   GestureHandlerOrchestrator.kt:740; iOS delegate semantics), so native-side
   declarations suffice — the pans stop enumerating scroll gestures.
   Always `.enabled(true)` — transition gating is scrollEnabled's job (one
   owner per factor). Kills: the shared-instance landmine, the stale-ref
   staleness, the secondary-gesture machinery (`SecondaryScrollComponent`
   deleted — one component, any number of instances), and the gesture re-mint
   churn that motivated the ref dance.
3. **(Phase B — feel) Short-content sheet-elastic tug.** With no-bounce, a page
   whose content fits is a brick — reads as "scroll disabled" (the owner's
   always-scrollable decree; the round-2 direction-gated bounce was the wrong
   mechanism for this and broke both invariants). Ideal mechanism: when
   `atExpanded && atTop && contentFitsViewport`, an up-drag activates expandPan
   with top-elastic (existing `applyElasticBounds`) instead of handing off to a
   scroll that can't move — the WHOLE sheet tugs and springs back, so cutouts/
   plate/content move as one; desync is unrepresentable. Needs a scene-keyed
   content-fits signal (container knows both sizes; mirror the
   sceneHeaderScrollOffsetRegistry pattern — per-scene entry, presented-scene
   selection; NOT a single global SV, hidden legs' layout events would clobber).
   Down-drag on short content already collapses correctly.

Invariants preserved by construction: no-overscroll stays structural; handoff
preconditions unchanged; one writer per factor (scrollEnabled = the SV authority,
gesture enablement = always-on, ownership = pointerEvents layers as today —
non-owning co-mounted lists never receive touches and don't render through the
container anyway).

## 4. Status

- Root cause + model: verified 2026-07-11 (this doc).
- Phase A (authorities 1+2, channel deletions): BUILT + sim-verified,
  commit 369ba518.
- Phase B (content-fits tug): BUILT + sim-verified (screen recording: ~70px
  damped rise on the short profile page, pixel-identical spring-back;
  settings fits=0 unaffected). overlaySheetContentFitsRuntime +
  SheetSceneContentMetricsContext + two arbiter branches. Committed same day.
- RNGH facts pinned: relation OR semantics (Android orchestrator :740, iOS
  RNGestureHandler.mm delegate), FlashList v2 CompatView root, Reanimated
  PropsFilter initial-spread.
