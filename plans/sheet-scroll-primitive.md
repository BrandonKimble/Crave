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
3. **(Phase B — feel) Short-content BODY-LANE rubber-band (v2).** With no-bounce, a page
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
- Phase B v3 (commit c4d58a84) — THE ONE-VALUE FOLD (scroll-standard audit,
  5-agent + adversarial verify): the scene scroll stream now has domain
  [-tugRange, contentMax]; the pan writes the negative (rubber-band) region,
  native scroll the positive. ALL consumers derive from it: body-lane
  translate = min(offset,0); divider = abs(offset) via the canonical hook
  (fades during tugs, every header); collapse gate blocks until the negative
  region is repaid (down symmetry); zero-crossing handover exits tug mode at
  the seam so collapsePan continues the same finger; touch-down mid-spring
  cancels + re-anchors via inverseRubberBandDistance (d = rR/(C(R-r))).
  Sim-verified on favorites: content-under-stationary-header tug, and a
  down-drag that collapses with content riding rigidly (no double motion).
  DEFERRED (Step 4 of the ruling): rehouse the ~6 parallel per-scene scroll
  stores (offset registry, save/restore, content-fits metrics, scroll handles)
  into one sceneScrollStateRegistry record — largest touch, lowest urgency.
- Phase B v2 (commit 264ff380, superseded by v3): the tug output is a BODY-LANE translate
  (overlaySheetBodyTugOffsetValue applied to the page-frame body layer), NOT
  sheetY — lifting the sheet read as a grab (owner). Content + white plate +
  cutout holes all live inside the body lane and move as one; the white layer
  overdraws 96px below the lane so the tug never flashes frost. Detection
  unchanged (content-fits registry + arbiter capture). Sim-verified by
  recording: header/sheet pixel-stationary, avatar+metrics cutout slide under
  the header and spring back exactly.
- RNGH facts pinned: relation OR semantics (Android orchestrator :740, iOS
  RNGestureHandler.mm delegate), FlashList v2 CompatView root, Reanimated
  PropsFilter initial-spread.

## v5 (commit 6427788e) — THE STANDARD: every page IS a list; the tug is DELETED

Owner's world model, implemented literally: the result sheet's handoff is
already perfect; short pages just had nowhere to scroll. Fix: the container
pads content to viewport + SHORT_PAGE_SCROLL_ROOM_PX (96) — a short page
becomes a REAL list with real scroll room, and the ONE proven handoff covers
every page identically (pan fails into native scroll mid-finger; divider on a
real offset; scroll-to-top hands to collapse). ALL tug machinery deleted
(-260 lines): pan branches, tug/fits SVs, metrics context, PageFrame
translate, plate overdraw, inverse-rubber. The arbiter is back to the
long-proven pre-tug shape. THE LAW for new sheets: render through
ScrollComponent and you get scrollEnabled authority, per-instance handoff
gestures, no-overscroll, scroll room, and the divider — zero wiring.

## v4 (commit c7a3ee87) — superseded by v5 (the tug is gone)

Executed the plan below. Root causes confirmed: (1) the v3 zero-crossing only
cleared expandPanActive — the next touch-move re-activated the pan in
sheet-drag mode while collapsePan drove sheetY (two writers = the jitter) and
the unguarded onEnd double-fired springs; v4 marks the SAME handoff flags the
up-handoff uses so the pan FAILS OUT (single owner per phase, the result-sheet
shape). (2) The shared-stream echo (active-list mux / save-restore capture /
surface listeners) suppressed the visual tug; the tug is a dedicated SV again,
divider = max(scrollOffset, -tugOffset). Recording: one unbroken swipe from
docked — sheet rides to expanded, same finger rubber-bands the content under
the stationary header, springs back; down-drag collapses rigidly, zero jitter.
The one-value stream still arrives with the sceneScrollStateRegistry rehousing.

## Registry rehousing DONE (same day): overlays/sceneScrollStateRegistry.ts —
one record per scene (savedOffset+pendingRestore, content metrics,
scrollHandle, publishedOffsets stack) + the presented pointer + the
presented-scene UI-thread flags; four modules deleted, 15 consumers on one
import. Live gesture SVs stay host-owned (deliberate — see v3 lesson).
Runtime re-verification pending the map session's tree stabilizing; the
housed behavior was sim-verified on v4.

## v3 REGRESSION (owner, 2026-07-11 late) — jitter + broken mid-gesture up-handoff

v3's fold wrote the tug into the SHARED scrollOffset SV without auditing every
consumer for negative values (the ruling's Step 2 — skipped; that was the
mistake). Symptoms: sheet jitters during drags; up-drag from a bottom snap no
longer hands off to the tug mid-gesture (keeps pushing the sheet; requires a
finger lift). Prime suspects (verify by code + runtime, then fix):
1. Double release springs: the zero-crossing handover clears expandPanActive
   but the RNGH gesture stays active — expandPan.onEnd is UNGUARDED (success &&
   !didHandoff) and fires startSpring alongside collapsePan.onEnd → the shake.
   Fix: a tugDidHandoff flag consulted in onEnd, or fail() via stateManager.
2. Shared-stream side effects: scrollOffset feeds
   useBottomSheetSharedAnimatedSurfaceRuntime, scroll-events listeners,
   publications, save/restore — negative writes + native onScroll zeros
   interleave → oscillation. Fix (Step-0 shape the ruling actually ordered):
   keep the audited MECHANICS (tug-aware collapse gate, touch-down
   cancelAnimation+inverse-rubber re-anchor, zero-crossing handover) but on a
   DEDICATED tug SV again; derive divider as max(abs of tug, offset) and
   PageFrame translate from the tug SV; defer the true one-value stream to the
   sceneScrollStateRegistry rehousing (Step 4) where every consumer is
   audited in one pass.
3. Mid-gesture switchover: verify the sheet-drag→tug branch actually engages
   (fits flag timing at bottom-snap entry; instrument [TUGDBG]-style with a JS
   closure, NEVER runOnJS(console.log)).
Also study WHY the result sheet's up-handoff feels right: it FAILS the pan into
the native scroll (stateManager.fail()) — the tug switchover should mimic that
cleanly (single owner per phase), not keep two active pans.
