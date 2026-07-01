# Polls: Creation, Feed, Cadence & Toggles Plan

Status: **DESIGN locked through Round-4 (2026-06-22); BUILD started.**
Owner decisions captured below; this is the forward plan for the next polls phase.
**Read Round-3 + Round-4 first — they hold the latest locked decisions + new scope
and supersede earlier rounds where they conflict.** The card/+ nav bug (§9) is FIXED.

### Round-5 (2026-06-24): sheet / modal / thread UX overhaul — investigation + sequenced plan
Five-way parallel investigation (workflow wsaesnh1g) mapped each subsystem. Two assumptions
were corrected: (A) the poll-feed/poll-detail headers are NOT a different component — all
three sheets render the same `OverlaySheetHeaderChrome` (fixedHeight → `OVERLAY_TAB_HEADER_HEIGHT`),
identical cutouts; the divergence is the LANE (result scenes thread `headerDividerScrollOffset`
+ measured reserved height; generic `BottomSheetSceneStackPageFrame` threads neither). (B)
poll-detail is ALREADY `canSwipeDismiss:false`; `polls` is the ONLY route scene whose
swipe-to-hidden is consumed (the docked-poll-bar dismiss → `dismissDockedPolls`).

DISMISS MODEL (owner reframe, supersedes the old §D.7 "all sheets swipe-to-dismiss"):
- **Modals** (AppModalHost popup, the OverlayModalSheet price/score sheets, the active compose
  chin): standardize the Instagram/Google "armed-outside" dismiss — a touch that STARTS outside
  the modal rect dismisses on first finger MOVE or on LIFT, never on touch-down. New shared
  `useArmedOutsideDismiss` hook + `ModalDismissShell` wrapper; adopt in OverlayModalSheet (covers
  price+score), AppModalHost, and the chin (onDismiss = Keyboard.dismiss + clear replyTarget).
- **Sheets** (all 9 route scenes incl. persistent poll): NON-dismissable by swipe + rubber-band
  at BOTH snap boundaries. Flip `polls` → `canSwipeDismiss:false` (registry) so `upperBound`
  becomes `collapsed` everywhere; make the expand-pan bottom elastic (it's a hard clamp today);
  the collapse-pan already rubber-bands. Keep a programmatic dismiss for the docked poll lane
  (the existing `requestReturnToSearchFromPolls` X path — VERIFY the button exists first).

SEQUENCED IMPLEMENTATION (lowest-risk → highest; runtime-sensitive ones instrumented FIRST,
not fixed from static reading per CLAUDE.md):
1. **Header divider parity** (low risk): thread `headerDividerScrollOffset={bodyScrollRuntime.scrollOffset}`
   into the generic `BottomSheetSceneStackPageFrame` (BottomSheetSceneStackHost) + the body-frame
   memo-equality. Instrument header measured-height vs body-lane-top to confirm/deny the strip-top
   clip (likely a lane-top mismatch, not a taller header) → add measured `reservedHeaderHeight` only
   if proven.
2. **Thread collapse = hybrid accordion** (contained to poll-detail): new `buildThreadTree`
   (collapse-independent tree) alongside `buildThreadItems`; FlashList virtualizes top-level only;
   recursive `PollThreadNode` renders each subtree; `CollapsibleSubtree` animates measured-height +
   opacity via withTiming (NOT layout-animation primitives). Validate scroll-jump on device; reserve-
   height fallback if needed. Delete `buildThreadItems` + flat tests in a final pass.
3. **Modal dismiss standardization** (new shared primitive): build the hook + shell, adopt in the 3
   families. RNGH-inside-native-Modal + chin/list-scroll conflict are the runtime risks.
4. **Sheet elastic + non-dismissable** (shared runtime, instrument + red-team): the policy flip +
   expand-pan elastic-bottom. Confirm the docked-poll X path before flipping.
5. **Scroll-down handoff at top snap** (shared runtime, instrument FIRST): root cause is the
   polls-only `maintainVisibleContentPosition:{disabled:true}` changing how iOS reports `contentOffset`
   at top, so the collapse-pan `atTop` gate fires while the list is still scrolling. Fix candidates:
   a settled-at-top delta gate (A2) or keep MVCP on + re-sort via listKey/scrollToOffset in the feed
   runtime (B). Must keep the poll-detail thread MVCP on + not revive the re-sort bug.

DELETE PASSES (clean up as we go): drop `buildThreadItems` + its flat-only tests after the tree
ships; remove the inline reply composer remnants (done); collapse the old §D.7 "swipe-to-dismiss"
framing in favor of the two-bucket model above; prune the stale "REMAINING" notes already superseded.

### Build progress (2026-06-24)
- ✅ **Round-5.1 — Header divider parity DONE (+ the "taller header / strip clip" claim attributed
  as a misperception, on-device).** Threaded `headerDividerScrollOffset` into the generic lane:
  `SceneStackBodyLayerHost` now selects `bodyScrollRuntime?.scrollOffset` (same `useRouteAuthoritySelector`
  pattern the content host uses) and passes it through `SceneStackBodyFrameHost` →
  `BottomSheetSceneStackPageFrame` (+ memo-equality on both). So every non-search scene (polls feed,
  poll detail, creation, restaurant, bookmarks, profile) now renders the SAME `HeaderScrollDivider`
  the result sheet does, at the same `top: headerHeight − 1`. **Attribution (instrumented + screenshots,
  not static guess):** the header chrome is byte-identical (both `OverlaySheetHeaderChrome`,
  `fixedHeight` → `OVERLAY_TAB_HEADER_HEIGHT`; `showDivider` is a 0-height transparent no-op; the
  `headerDivider` style adds nothing). The white cutout-plate overhang (`HEADER_FOREGROUND_PLATE_OVERLAP_PX`
  3 + maskPadding 2 = ~5px below the header box) is identical in both lanes and the polls body has
  MORE clearance (`paddingTop:2` vs the result body's `0`), so the strip-top "clip" is NOT worse on
  polls. The real, visible deficiency was the missing fade divider — confirmed by scrolling the result
  sheet (its divider fades in at the header bottom) and proving the polls lane now uses the identical
  component + offset. The "taller header" perception is the higher expanded SNAP (polls has no map pins
  to reveal, so it expands above the result sheet) — a by-design snap difference, not a chrome height
  bug. Marker `[HDRDIV-v1]` confirmed fresh-bundle threading (`hasDividerOffset=true` for non-search
  scenes) then removed. 0 TS errors.
- ✅ **Round-5.2 — Thread collapse = keep-mounted accordion DONE + device-validated (full cycle).**
  Replaced the prune-on-collapse flat model with a collapse-INDEPENDENT tree: new `buildThreadTree`
  (`pollThreadModel.ts`, 5 unit tests) returns nested `ThreadNode[]` (depth, `descendantCount`, children,
  flatten-past-cap `mentionUser` — same ordering as the old builder). FlashList `data` = top-level nodes
  only; each row is a recursive `PollThreadNode` that renders the comment + a `CollapsibleSubtree`
  wrapping its replies. `CollapsibleSubtree` animates measured-height × progress + opacity via
  `withTiming` (200ms; NOT layout-animation primitives) with `overflow:hidden`; the inner View reports
  natural height via onLayout so re-expand always lands exact, and a pre-measure branch avoids a
  first-paint clip flash. Collapse state stays in React (`collapsedComments`) + `extraData`, so toggling
  never re-tiles `data` (no scroll-jump from data churn). `PollCommentRow` now always shows the body
  (collapse hides the REPLY subtree, not the comment); meta-row tap is gated on `descendantCount > 0`
  and shows "+N replies" when collapsed. **Device validation** (DB-seeded a 4-deep reply subtree under
  one comment since the seed had none; tapped via a `testID` element-tap because raw-coordinate Maestro
  taps on the gesture-handoff sheet overshoot/dismiss — a CLAUDE.md gotcha — AND `tapOn point` needs
  INTEGER percentages or it throws `NumberFormatException`): collapse → "+4 replies", subtree hidden,
  siblings stayed anchored (no scroll jump); re-tap → kept-mounted subtree restored. Logs confirmed
  `toggle <id>` → `subtree collapsed=true/false`. DELETE PASS: removed `buildThreadItems` + its 7
  flat-only tests (tree shipped). 0 TS / 0 lint / 5 tests green.
- ✅ **Round-5.3 — Modal dismiss standardized on the "armed-outside" primitive.** New shared
  `useArmedOutsideDismiss` (`overlays/useArmedOutsideDismiss.ts`): a `Gesture.Pan().manualActivation`
  whose backdrop region does NOTHING on touch-down and dismisses on the FIRST finger MOVE or on LIFT
  (`onTouchesDown` resets a `fired` flag; `onTouchesMove`/`onTouchesUp` fire once). Adopted in:
  (a) **`OverlayModalSheet`** (price + score sheets) — replaced the backdrop `Pressable onPress` with
  a `GestureDetector` on the dimming layer (the sheet is a sibling painted on top, so the backdrop
  only ever gets outside touches → no rect-check needed); kept a11y via `onAccessibilityTap`.
  **Device-validated**: opened the price sheet, a backdrop TAP dismissed it (fire-on-lift) AND a
  backdrop DRAG dismissed it (fire-on-move), sheet controls intact. (b) **`AppModalHost`** (in-app
  alert) — same primitive, wrapped in a nested `GestureHandlerRootView` (RNGH gestures inside a native
  `Modal` render in a separate window and need their own root). Implemented + typechecks; uses the
  same validated primitive (couldn't reliably auto-trigger the alert via Maestro on the gesture-handoff
  creation sheet, so device-validation is by-parity with OverlayModalSheet). (c) **Compose chin** —
  rather than a scroll-blocking Pan overlay, the active reply composer returns to the inactive chin via
  the keyboard: `keyboardDismissMode: 'on-drag'` (swipe the thread dismisses the keyboard) +
  `keyboardShouldPersistTaps: 'handled'` (tap outside dismisses) + a `keyboardDidHide` listener (armed
  only while a reply is pinned) that unpins `replyTarget` (keeping the draft text). 0 TS / 0 lint.
  Pre-existing flake (unrelated): the feed sometimes launches into a market with 0 visible polls
  (market resolution on cold start) — all seed polls are `active` in the DB.
- ✅ **Round-5.4 — Sheets non-dismissable by swipe + elastic bottom DONE + device-validated.**
  Two coupled changes: (a) flipped `polls.canSwipeDismiss → false` in `app-route-scene-policy-registry`
  (→ `preventSwipeDismiss=true` via the `!canSwipeDismiss` mapping → gesture `upperBound = collapsed`),
  so polls joins every other route scene as swipe-non-dismissable; the docked bar is now a permanent
  fixture. Verified safe first: the swipe-to-hidden path (`settleRouteScenePollsSnap → dismissDockedPolls`,
  gesture-only) is the ONLY thing removed — the PROGRAMMATIC dismiss (`requestReturnToSearchFromPolls →
  dismissDockedPolls`) and the nav-push-to-detail flow are untouched (explicit snap targets aren't
  bounded by `upperBound`). (b) Made the expand-pan onChange BOTTOM elastic in
  `useBottomSheetSharedGestureRuntime` — replaced the hard `Math.max(expanded, Math.min(upperBound, raw))`
  with `Math.max(expanded, applyElasticBounds(raw, expanded, upperBound))`: hard top (so the top still
  hands off to list scroll) + rubber-band bottom (matching the collapse-pan, which already used
  `applyElasticBounds`). For a still-dismissable sheet the bottom elastic engages only past hidden
  (off-screen), so it's safe everywhere. **Device-validated**: expanded the poll feed, swiped down hard
  → the "Polls in New York · 3 live" bar STAYED (rubber-banded to the docked bar) instead of dismissing
  to pure search (the old behavior); re-expand still works. 0 TS / 0 lint. (Minor pre-existing artifact,
  not a regression: an extreme over-drag past the bar leaks into a map pan — same as the old
  drag-to-dismiss revealed the map.)

- ✅ **Round-5.5c — Scroll-behavior made STRUCTURAL (owner: "stop being the lucky exception").** The
  5.5b fix worked but was a per-site default fallback (`?? SHEET_BODY_NO_OVERSCROLL` at 3 body surfaces) —
  owner correctly flagged it as patchy: leaf-level, duplicated, still an overridable per-scene knob (the
  exact knob that caused the bug via poll detail's `bounces:true`). Reframed: no-over-scroll is a
  PRECONDITION of the handoff, not a preference. All 3 body surfaces render their native scroll through ONE
  component — `BottomSheetScrollContainer` (the sole native scroll wrapper, reached only via the shared
  `ScrollComponent`). So ENFORCE the triple there, AFTER the `{...props}` spread (can't be overridden), and
  DELETE the per-scene knob entirely: removed `bounces`/`alwaysBounceVertical`/`overScrollMode` from BOTH
  transport-spec contracts, the `resolved*` bodyDefaults chain (type + assembly + authority-controller
  construction + 3 equality fns), and every per-sheet transport that set the triple (search/bookmarks/
  profile/creation). RUNTIME-proven the container governs FlashList: stripped the FlashList's bounces prop
  so only the container enforces → feed continuous handoff `VERIFY-OVERSCROLL=0`, `VERIFY-SCROLL=426` (scrolls
  then pins), collapses clean. Search (mounted body — the owner's regression worry) verified clean (same
  container, collapses clean, behavior unchanged). Search is no longer special; every sheet is correct by
  construction. Scroll behavior now joins `FrostedFilterStrip` (strip) + `OverlaySheetHeaderChrome` (cutouts)
  as composable sheet primitives a new feature screen gets for free. 0 TS / 0 lint. Memory:
  [[sheet-scroll-handoff-fix]]. ALSO reverted the misattributed Round-5.5 gestureStartedAtScrollTop /
  re-tile-guard gate fix entirely (it never fixed the down-handoff) — verified the started-at-top handoff
  stays clean without it; net FEWER moving parts than before the episode began. (Remaining: a few dead
  internal type fields — shell-spec `bounces` Pick keys, BottomSheetWithFlashList's container-covered bounces
  plumbing — left as harmless dead type surface.)

- ✅ **Round-5.5b — CONTINUOUS down-handoff DONE + device-validated (the REAL fix).** The Round-5.5
  gate-timing work below was a MISATTRIBUTION. The owner's actual symptom: on a CONTINUOUS swipe-down
  (list scrolls to its top, then — finger STILL down, one stroke — the sheet must become the grabber
  and collapse, mirroring the up-handoff), the poll list "moved and separated from the header as the
  sheet went down." REAL cause (instrument-proven, ~68 over-scroll frames): at the handoff the list
  OVER-SCROLLS past its top (reported offset goes NEGATIVE, −5…0) because over-scroll is enabled; the
  native scroll + collapse-pan run simultaneously, so the content bounces down past the fixed header
  while the sheet collapses. The result/search sheet never bounces — it disables over-scroll THREE ways
  (`bounces:false` + `alwaysBounceVertical:false` + `overScrollMode:'never'`); the poll sheets left all
  three unset (iOS default `bounces:true`), and poll detail even set `bounces:true` explicitly. FIX
  (standardized, the owner's ask): new `SHEET_BODY_NO_OVERSCROLL` (`overlays/sheetBodyScrollDefaults.ts`)
  applied as the FINAL fallback at all 3 body-surface resolution sites (`BottomSheetSceneStackListBodySurface`,
  `useBottomSheetSceneStackBodyContentRuntime`, `SearchMountedSceneBody`), so no-over-scroll is the
  DEFAULT for every sheet body — the handoff works without each sheet remembering the triple. Removed
  poll detail's `bounces:true`. VALIDATED on the continuous repro: `VERIFY-OVERSCROLL=0` (was ~68),
  `VERIFY-SCROLL=219` (list still scrolls 49→9→0 then PINS at 0 — refutes the old "bounces:false froze
  the feed" claim), sheet collapses cleanly to the docked bar. Detail = same shared surface + default,
  no other bounce source → fixed by construction. 0 TS / 0 lint. Memory: [[sheet-scroll-handoff-fix]].
  (The gestureStartedAtScrollTop / retile-guard change below is KEPT only as marginal robustness for the
  MVCP positive re-tile spike — it does NOT fix the down-handoff.)

- ⚠️ **Round-5.5 (superseded by 5.5b above) — gate-timing fix on a WRONG hypothesis.** Thought a
  positive MVCP re-tile offset spike (off=4) was delaying the collapse GATE; added a shared
  gestureStartedAtScrollTop captured at touch-down in both pans + `isWithinScrollTopRetileGuard`
  (`SCROLL_TOP_RETILE_GUARD_PX=24`). Kept as robustness, but the owner re-tested and the bug PERSISTED —
  because the real cause was over-scroll, not the gate. See 5.5b.
  ATTRIBUTED via the gesture harness (`[HANDOFF-FIX]` worklet log, ~120 collapse-gate frames), not
  guessed. **Root cause:** the feed has MVCP DISABLED; with MVCP off, the FIRST drag of a top-resting
  list makes the native scroll view briefly REPORT a small POSITIVE contentOffset (~4px, ~5 frames) —
  a re-tile artifact — before settling to 0, even though the finger drags DOWN and the list can't
  scroll past its top. Both sheet pans read the LIVE offset via `isAtScrollTop` (TOP_EPSILON=2); the
  spike (4 > 2) reads "not at top" → the handoff is dropped → the list scrolls under the sheet. The
  result sheet (MVCP-ON) bounces NEGATIVE at top so never trips this. **Two pans, one race — BOTH
  fixed:** a down-drag at top is owned by the COLLAPSE-pan, but only because the EXPAND-pan DEFERS it
  (`if (atTop && !isInMomentum) return;`, else `handoffExpandGestureToScroll` → list scrolls). Both
  use the same live `atTop`, so a spike frame makes the collapse-pan not-activate AND the expand-pan
  stop-deferring → list scrolls. Fixing only the collapse-pan leaves the expand-pan handing spike
  frames to scroll. **Fix (principled, not a magic epsilon):** decide at-top from the STABLE
  touch-down offset. One shared `gestureStartedAtScrollTop` SharedValue set in BOTH pans'
  `onTouchesDown` (`= isAtScrollTop(off, topOff)`); both at-top checks become `isAtScrollTop(off) ||
  (gestureStartedAtScrollTop && isWithinScrollTopRetileGuard(off))` with `SCROLL_TOP_RETILE_GUARD_PX=24`
  (new export in `bottomSheetSharedRuntimeUtils`). Targeted: no change at off=0 (result sheet) or when
  genuinely scrolled (off=49 > guard proven → still not-at-top). Lives in the SHARED runtime → every
  sheet gets it. **Device-validated:** feed expand/scroll/collapse all clean, immediate first-frame
  activation at top, no false handoff when scrolled. Poll DETAIL: rests at its expanded snap
  (sheetY=70=expSnap — it is NOT only-expanded), same pans, scrolls-then-collapses correctly, MVCP-ON
  (negative top bounce, no positive spike) → can't hit the feed bug; shared fix covers it for free.
  0 TS / 0 lint. Memory: [[sheet-scroll-handoff-fix]].

### Round-5.6 (2026-06-24): ALL-SHEETS header + frost + divider audit (owner request) — TODO
Owner wants EVERY sheet's header to read identically to the canonical RESULT sheet header:
(1) correct height (`OVERLAY_TAB_HEADER_HEIGHT`); (2) the grab-handle hole + close-button hole
cut-outs that SEE THROUGH to a frosty layer; (3) every sheet HAS a frosty layer; (4) NO white
layer covering/occluding the frost; (5) any sheet with a toggle/filter strip also has the
`HeaderScrollDivider` that fades in under the strip on scroll (the #25 fix).
STATIC AUDIT (frost layer behind the header):
- ✅ has own `<FrostedGlassBackground />`: search/**Results** (`SearchMountedScenePageBundleAuthority`
  ~L381) and **RestaurantPanel** (L511). These are the canonical-correct ones.
- ⚠️ **PollsPanel** — renders NO own frost; relies on "the mounted-scene FrostedGlassBackground
  showing through" (comment ~L660). Fragile: if no frosted scene is mounted behind, the header
  cutouts read white. Give it its own frost (or verify the show-through holds in every state).
- ⚠️ **PollDetailPanel** (L1134) + **PollCreationPanel** (L284) — `backgroundComponent = <View
  style={sheetSurface}/>` (`#ffffff`, absoluteFill). This WHITE full-bleed surface IS the "white
  layer covering the frost": the header cutouts reveal white, not frost. Fix: put a
  `FrostedGlassBackground` behind + stop the white surface from covering the HEADER band (scope the
  white to below the header, or drop it and let content carry its own bg) so the cutouts see frost.
- ❓ **bookmarks / profile / saveList** — use `createMountedChrome(key)` (mounted-chrome path,
  `app-route-static-scene-descriptor-controller.ts:68`), NOT a `backgroundComponent`. Their frost is
  rendered by the mounted-chrome host keyed by sceneKey — must trace that host + verify frost there.
- Header HEIGHT: every sheet renders the SAME `OverlaySheetHeaderChrome` (`fixedHeight` →
  `OVERLAY_TAB_HEADER_HEIGHT`) — proven byte-identical in #25. So height is likely already uniform;
  still instrument measured heights per sheet to confirm none diverge.
- DIVIDER: the generic-lane `headerDividerScrollOffset` threading (#25) already covers every
  non-search scene; confirm the polls feed (the toggle-strip sheet) actually shows it on scroll.
OWNER CLARIFIED (2026-06-24): NO sheet is intentionally white. Architecture = every sheet's
FOUNDATION is the shared frosty compound layer (frosty by default); content sits on WHITE layers on
top of the frost; cutouts punch holes in the white to expose the frost (because it looks cool) and
must be trivial to add anywhere. Result sheet is canonical — standardize + replicate it. Saved as
memory [[sheet-frost-architecture]].

### Build progress — Round-5.6 (2026-06-24): shared frost foundation DONE + device-validated
- ✅ **ONE shared frost foundation.** `BottomSheetSceneStackPageFrame` now renders a single
  `<FrostedGlassBackground />` in the background lane (zIndex 1, beneath `{backgroundComponent}`), so
  EVERY sheet that routes through the page frame is frosty by default. Removed the 3 now-duplicate
  frost renders: `SearchMountedScenePageBundleAuthority` (the `<><FrostedGlassBackground/>…</>`
  wrapper), `BottomSheetSceneStackMountedChromeRegistry` (the `surface==='background'` frost — polls/
  bookmarks/profile/saveList's old accidental source), `RestaurantPanel` L511. All four edits in one
  build → no double-frost. **Device-validated**: the polls feed (a MOUNTED scene) now clearly shows
  frost — the "3 live" badge, "+" button, and the toggle-strip chips reveal the frosted map (pink poll
  markers) through their cutouts. This confirms the mounted-chrome path gets the shared frost (resolves
  the agent's main risk). bookmarks/profile/saveList are by-parity (same mounted path as polls).
- ✅ **White-body sheets scoped below the header so their cutouts reveal frost.** `PollDetailPanel` +
  `PollCreationPanel` `sheetSurface` changed from `absoluteFill` (#fff) to `top: OVERLAY_TAB_HEADER_HEIGHT`
  — the white body layer now sits BELOW the header band, leaving the header band frost-only so the
  header plate's grab-handle + close cutouts see through to frost. The plate's 3px overlap covers the
  seam. **Device-validated**: poll-detail renders with a clean white body (no frost gap) and the header
  cutouts reveal the (subtle) frost behind the full-screen sheet; 0 errors.
- ✅ **Polls toggle-strip top-clip fixed.** Set `PollsPanel` body `contentContainerStyle.paddingTop`
  2 → 0 (the 2px pushed the strip out from under the header plate's 3px overlap, exposing the strip's
  -1px mask bleed as a clipped seam). **Device-validated**: the Live/Results/All/Polls/Discussions/New
  chips now show fully complete, unclipped tops.
- Header HEIGHT: every sheet uses the same `OverlaySheetHeaderChrome` (`fixedHeight` →
  `OVERLAY_TAB_HEADER_HEIGHT`), byte-identical (#25); the perceived "too tall" was the strip-clip, now
  fixed. Divider (#25) already threaded to every non-search scene.
- 0 TS / 0 lint across all 7 files. Result/restaurant changes are pure de-dup (canonical, low risk).
- ✅ **Header→content SEAM made flush (the "white sliver under the divider" + plate overhang).**
  Two fixes, both in the SHARED path so they apply to every sheet (result, polls, poll-detail, etc.):
  (1) **Clip the header cutout plate** — added `overflow:'hidden'` to the shared `overlaySheetStyles.header`
  (the result header already did this via `resultsHeaderSurface`); without it the white plate's
  `maskPadding + HEADER_FOREGROUND_PLATE_OVERLAP_PX ≈ 5px` overhang extended past the header bottom into
  the toggle strip. (2) **Anchor the scroll divider by its BOTTOM edge** — `HeaderScrollDivider`
  (BottomSheetSceneStackPageFrame) was positioned `top: headerHeight − 1` (a magic offset) so its
  hairline bottom landed ~0.67px SHORT of the boundary, leaving a white sliver of header plate before
  the strip. Changed to `top: headerHeight − DIVIDER_THICKNESS` (= hairlineWidth) so the divider's
  bottom lands exactly on the boundary. ROOT-CAUSE CRITIQUE captured: the seam was controlled by THREE
  independent magic offsets (plate overhang +5, divider −1, strip mask `maskTopOffset:−1`) that never
  coincided; the fix makes the boundary a SINGLE source of truth (`headerHeight` = plate bottom = body-
  lane/strip top) and anchors the divider's bottom to it. **Rigorous attribution first**: measured via
  `measureInWindow` that the poll vs result header geometry is byte-identical (header 68.33 both; action
  button 18.33px from top / 18.0px from bottom both; strip at the header bottom both) — so the perceived
  "different height" was NEVER header geometry; it was this seam sliver + the body frost. 0 TS / 0 lint.
  CLEANUP DONE: zeroed both now-vestigial offsets for clarity — `HEADER_FOREGROUND_PLATE_OVERLAP_PX`
  3 → 0 (OverlaySheetHeaderChrome) and the strip's `maskTopOffset` −1 → 0 + its paired `+1`s
  (FrostedFilterStrip). No visual change (both were already moot once the plate clips + the divider is
  bottom-flush); strip cutouts verified intact on-device. 0 TS / 0 lint.
- ⏭️ DEFERRED (owner's "make cutouts easy / standardize" ask, a clean refactor, not a visual fix):
  unify the cutout PRIMITIVES — extract the triplicated `circlePath`/`roundedRectPath` + 0.5px
  `layoutsEqual` (OverlaySheetHeaderChrome, useHeaderCloseCutout, FrostedFilterStrip) into a shared
  `cutout/` module, and expose a generic `CutoutSlot` (the StripHoleSlot ergonomic) so adding a cutout
  anywhere is `<CutoutSlot>…</CutoutSlot>`. Keep the header on its evenodd path (Android-perf: don't
  convert it to N MaskedHoleOverlay masks). Tracked as a follow-up task.

### Build progress (2026-06-23)
- ✅ **Toggle strip FIDELITY fix** (owner caught it didn't match search): band height
  (paddingVertical 0), removed the chip borders (`FilterChip`), removed the segmented
  toggle's dark track tint (transparent, like search), and ported search's exact
  overscroll-extended cutout mask into `FrostedFilterStrip` (mask rides inside the
  ScrollView with `overscrollMargin`/`maskWidth`/`left:-overscrollMargin`/offset holes,
  inset 20) so windows track the controls + no hard edge cutoff. Validated side-by-side
  vs the live search strip. See [[polls-feed-toggle-state]].
- ✅ **§5 close-window picker = DONE end-to-end** (was the "sim-blocked" remaining item):
  `PollCreationPanel` has the 3/7/14-day chips (`closeWindowDays` state) → `createPoll`
  payload → backend `clampUserPollWindowDays` → poll metadata (both create paths) →
  `resolvePollClosesAt`. Backend unit-tested 13/13. The "market picker" is map-context by
  design (no list-markets endpoint; market resolves from the viewed map + shows in the
  header "Add a poll in {market}") — an explicit dropdown isn't built (would need new infra
  and conflicts with the map-context design).

- ✅ **§C nav-push transition — poll detail now opens FULL-SCREEN (root cause fixed).**
  The illusion is THREE coordinated parts, not two: (a) the nav silhouette slides down
  (`navTranslateY` 0→`bottomNavHiddenTranslateY`), (b) a native sheet mask whose flat-rect
  clip boundary follows `navTranslateY`, and — the part the earlier attempt missed — (c)
  the `hardClipAnimatedStyle` in `SearchRouteSheetNativeMaskHost`, which in the persistent
  modes hard-clips the sheet subtree at `navBarTop` (THIS was the "hard edge / map below").
  All three pivot on the SAME signal: `surfaceVisualPolicy.sheetClipMode` →
  `navSilhouetteSheetExclusionModeValue`. Fix: a **shareable** nav-push now drives that mode
  to `animatedSearchTransition` (not just `navTranslateY`). `useNavHideIntent('pollDetail')`
  sets a latch in `use-search-foreground-bottom-nav-visual-runtime.ts`; the mode derivation
  overrides `dockedPersistentPoll → animatedSearchTransition` while the latch holds, which
  simultaneously lifts the hard clip (→ full viewport) and grows the mask in lockstep. The
  latch is **held through the close** (cleared by a `useAnimatedReaction` only once
  `navTranslateY` settles to 0) so the docked-poll hard clip never snaps back mid-animation.
  Scoped to `dockedPersistentPoll` base so search/suggestions are untouched. **Red-teamed
  with an Opus agent** (corrected my model: the concave cutout lives on the nav-PAINT view,
  the sheet mask is a flat rect, and the body-exclusion-height value is dead/unread).
  Maestro-validated: poll detail full-screen (no hard edge, no map below), clean lockstep
  close (nav restored, polls feed re-docked), search-submit transition unaffected. 0 TS.
- ✅ **§D.1/D.2 compose chin — principled position + keyboard-flush.** Replaced the
  empirical `{ bottom: 90 }` hack with `bottom: expanded + insets.bottom` — the sheet
  surface is `height: screenHeight` translated DOWN by the `expanded` snap, so the body
  frame overhangs the visible bottom by exactly `expanded`; this pins the chin just above
  the home indicator at the visible bottom AND (because it lives in the body frame) rides
  down WITH the sheet on a drag-to-dismiss (Instagram chin). `contentBottomPadding` gained
  the same `expanded` term so a long thread's last comment clears the chin. Keyboard lift is
  `-(keyboard.height − insets.bottom)` so it sits flush on the keyboard (height is measured
  from the screen bottom). Maestro-validated: rests at the visible bottom; lifts flush above
  the soft keyboard. 0 TS.
- ✅ **In-app modal = pure fade (no bounce); §3 dedup "swap Alert for modal" DONE.**
  `AppModalHost` dropped the `ZoomIn.springify()` card entrance (and the redundant Reanimated
  `FadeIn` on the backdrop) — the native `Modal animationType="fade"` now fades the whole
  overlay in/out, no spring/zoom. Maestro-validated: the "This poll already exists" dedup
  modal renders correctly (centered card, Cancel/View-poll row) via the fade. 0 TS.
- ✅ **§6 toggle strip is DONE** (supersedes the "REMAINING: feed must SEND the sort" note
  below): the frosted Live/Results + Type + Sort + Time strip mirrors the search sliding-pill
  toggle (`SegmentedToggle`/`FilterChip`/`FrostedFilterStrip`), threads state/sort/type/time
  into `feedQuery`, and disables FlashList `maintainVisibleContentPosition` for re-sorts.

### Build progress (2026-06-22)
- ✅ **White full-bleed sheets** for `pollDetail` + `pollCreation` (§B.2) — replaced
  `FrostedGlassBackground` with a solid white surface; validated on sim (Maestro
  `poll-card-open.yaml` / `poll-create-open.yaml`). 0 TS / 0 lint.
- ✅ **Type-less, subject-first creation form** (§B.1) — removed the 4-template type
  picker + per-type autocomplete; now a free-text **Subject** + non-editable
  **Options** placeholder ("ranking forms from the discussion") + **Description** →
  `createPoll({ question, description, marketKey })` (backend infers axis). Validated
  on sim. 0 TS / 0 lint. (`CreatePollPayload` gained `question`/`closeWindowDays`,
  `topicType` now optional.)
- ✅ **Graduated primary-shade poll bars** (§D.6) — `PollCandidateBars` fill now fades
  from a strong primary tint (rank 1) to paler tints down the list (kept light for
  black-text legibility). Validated on sim. 0 TS / 0 lint.
- ✅ **Reply text → icon button** (§D.3, partial) — the per-comment "Reply" label is
  now a reply-arrow icon. Validated on sim. 0 TS / 0 lint. (Full reply→modal behavior
  is the larger §D build.)
- ✅ **Research spike E.1–2** (threading + keyboard modal) — findings + recommended
  approach recorded in §E (use Reanimated `useAnimatedKeyboard`; pinned-copy reply;
  View connector lines + Set-based collapse). Unblocks the §D thread build.
- 🟡 **Backend `listPolls` already supports `state`** — so the feed Live/Results split
  (§4/§6) is frontend-only; remaining work there is the toggle UI (must mirror the
  search restaurant⇄dish sliding-pill toggle per Round-2.5).
- ✅ **Dedup §3 — COMPLETE end-to-end (backend + FE two-stage).** `POST
  /polls/check-duplicate` (precision-favoring `word_similarity ≥ 0.6` over active
  market polls) curl-validated. Creation submit now runs **stage-1 dedup before
  create**: a near-match shows a "This poll already exists" prompt with **View poll**
  (routes to the existing pollDetail via `pushRoute`) / **Cancel**. Maestro-validated
  on sim (a typo'd near-dup still matched + prompted). 0 TS / 0 lint. POLISH LEFT:
  swap the Alert for the designed bottom-sheet modal; stage-3 entity dedup
  post-resolution inside createPoll. Also set `autoCorrect={false}` on the subject
  field (query-like input). testID `poll-subject-input` added.
- ✅ **Per-user weekly cap (§5)** — `createPoll` now enforces `POLL_USER_WEEKLY_CAP=2`
  active polls / market / rolling 7d (scoped by market; app/seeded polls excluded via
  `createdByUserId`); clear `BadRequest` message. Compiles, API healthy. E2E (3rd poll
  rejected) needs an authed flow (mobile/Maestro) — read-validated logic.
- ✅ **Feed sorts New / Top / Trending (§4)** — `sort` param on `listPolls` +
  `queryPolls` (feed path delegates). **Owner decision (2026-06-22):** trending is
  ENGAGEMENT-based, NOT entity-score-based (the score model is restaurant/connection-
  keyed, undefined for dish-axis/discussion polls). Trending = **decayed distinct-user
  engagement velocity** (votes + comments; each user counted once at their latest
  action → spam-resistant; half-life 3d, the app's heat model). Top = total distinct
  engagers. Curl-validated on BOTH paths (trending/top surface the engaged NYC polls
  above non-engaged coffee polls; new stays chronological). Mobile `PollFeedSort` +
  payload field wired. 0 TS / 0 lint, API healthy. REMAINING: the feed must SEND the
  sort (the toggle strip UI — must mirror the search sliding-pill toggle).
- ✅/🟡 **Reddit-style thread collapse + indent rails (§D.4, partial)** —
  `PollDetailPanel`: indent **connector rails** (vertical lines, one per ancestor
  level, cap 5), tap a comment header to **collapse its subtree** to a "username +N"
  bar. The pure logic was extracted to `pollThreadModel.ts` and is **unit-validated
  (6/6 tests in `pollThreadModel.spec.ts`)** — nesting/depth, subtree-prune + hidden
  count, mid-thread collapse, deleted-parent promotion, oldest-first ordering. The
  **visual** (rails render) is built but NOT yet Maestro-validated (sign-out below).
  0 TS / 0 lint. ✅ **flatten/@mention past the cap DONE (2026-06-23):** `pollThreadModel`
  sets `ThreadItem.mentionUser` (parent author) when `depth > MAX_THREAD_INDENT`; `CommentBody`
  prepends an accent "@parentName" inline so the reply target stays legible once the indent
  flattens. Unit-tested (7/7), tsc/lint 0, no thread regression on sim. Remaining §D.4: the
  collapse/expand ANIMATION (height/opacity in the virtualized FlashList). ✅ **§D.3
  reply-target FLOAT DONE (2026-06-23):** replies moved off the inline-under-comment composer
  onto the CHIN — tapping Reply pins a copy of the target comment above the chin input
  ("Replying to {name}" + body preview + ✕ cancel + accent rule), highlights the target row,
  focuses the input, and `handlePost` posts under `replyTarget`. Verified on sim. See task #22.
- ✅ **Close-window (§5) — backend COMPLETE + substantially validated.** No migration
  (window stored in poll `metadata`). `poll-timing.ts`:
  `resolvePollClosesAt(launchedAt, windowDaysOverride?)` honors a per-poll window
  (falls back to global) + `clampUserPollWindowDays` ([3,14], default 7) +
  `extractCloseWindowDays` + `isActivePollDueToClose` + `resolveMinPossibleCloseWindowDays`.
  **Unit-validated: 13/13 in `poll-timing.spec.ts`.** `CreatePollDto.closeWindowDays`
  accepted. STORE: both create paths (structured + discussion) write the clamped window
  (default 7) into poll `metadata`. READ: `closesAt` honors it (`poll.metadata`),
  curl-verified to still compute the global fallback on existing polls (no regression).
  CRON (`poll-lifecycle.service`): switched the single global threshold to a coarse
  pre-filter + per-poll `isActivePollDueToClose` JS-filter (preserves the
  closed-re-graduation OR-clause) — **backward-compatible** (polls with no stored window
  close at exactly the same time as before). API compiles, healthy, 0 TS/lint.
  REMAINING (sim-blocked): the creation **close-window picker UI** (3–14 slider; backend
  already defaults to 7 without it) + an authed-create e2e check that a chosen window
  persists. The cron's per-poll *integration* (vs the unit-tested decision) is only
  fully provable by a cron run.
- Trending-heat-from-entity-scores was REJECTED in favor of engagement (above).

### ⚠️ Validation blocker (2026-06-22)
The **sim signed itself out** (session expiry mid-session) — a gated "Sign back into
Crave Search" sheet now blocks the app, with no guest path. **Re-authenticating is a
prohibited action**, so I cannot continue Maestro validation of authed poll features
(detail/comments/creation, incl. the just-built thread collapse). Everything this
turn is code-clean (0 TS / 0 lint; backend curl-validated); the thread-collapse +
rails specifically are built but **not yet visually validated**. **Need: sign back in
on the sim** to resume validate-as-you-go.
- ⏳ **§K search-from-anywhere return** — de-risked + breakthrough (scene stays
  mounted → state free; route-restore via `requestOverlaySwitch` proven), but the
  smooth dismiss-coordination is a focused remaining task; reverted to clean baseline
  (see §K notes). NOT shipped.
- ⏳ Remaining: market-picker, close-window picker, §J keyboard choreography, dedup,
  feed/toggles, thread polish (§D), trending, etc.
Supersedes the "create-dish/restaurant flow" placeholder in the community-polls
master plan §13A — we are NOT building a one-off creator-seeding flow; the
creator's **description** is their organic seed instead.

Companion plans: `community-polls-discussion-driven-collection-plan.md` (master),
`polls-frontend-plan.md` (the shipped FE foundation). Memory: [[polls-plan-structure]].

---

## 0. Current-state facts (researched 2026-06-21, code-grounded)

These ground every decision below; verify before building on them.

- **Creation backend is complete.** `createPoll` → free-text `createPollFromQuestion`
  (moderate → `inferPollSubject` LLM → `mapAxisToStructured` → ranked or
  `createDiscussionPoll`) or structured `createStructuredPoll`
  (`polls.service.ts:180-563`). The LLM **already decides poll-type vs discussion**.
- **`description`** exists on `CreatePollDto` (max 500) + stored on `PollTopic`
  (`polls.service.ts:322`), moderated, displayed — but **NOT run through the
  gazetteer** at creation, and **NOT passed to graduation** (graduation sends only
  the `question` as `extract_from_post:false` framing + the comment thread —
  `poll-graduation.service.ts:61,116-152`).
- **`inferPollSubject`** = `gemini-3.1-flash-lite-preview`, MINIMAL thinking,
  ~1–3s network LLM call (`llm.service.ts:1450-1485`).
- **`fetchPollMatches`** = single `word_similarity` + ILIKE SQL over `state='active'`
  market-scoped polls, threshold 0.4, sub-100ms (`autocomplete.service.ts:915-956`).
  **No dedup exists at creation today.**
- **Scheduler / demand feeder is complete + automated.** `PollSchedulerService`
  (`poll-scheduler.service.ts`): `planMarketTopicCandidates` → ranked
  `PollScoredCandidate[]` with `finalScore`/`rank` per market (demand × cooldown ×
  resurgence; demand from `search_log` via `SearchDemandService`). Daily
  `refreshTopics()` stamps `metadata.pollPriority.{score,rank,factors}` on
  `PollTopic`; weekly `publishWeeklyPolls()` (default Mon 9am, cap 3/city) creates
  `origin:seeded` polls. Demand scoring is multi-consumer (`poll_topic`,
  `keyword_collection`, `on_demand`), keyed `(marketKey, entity)`.
- **Score delta / trending infra is built.**
  > ⚠️ SUPERSEDED (2026-06-28) by the rising/heat redesign (`plans/crave-score-rising-heat-redesign.md`).
  > `core_public_entity_score_history` and `score_delta_7d/28d`/`movement_state` are GONE (dropped in the
  > contract migration). Entity trending is now the single **`rising`** column on `core_public_entity_scores`
  > — a continuous recent-vs-baseline display-point surge (the score recomputed at a fast half-life minus
  > the all-time score), no snapshots. Anywhere below that proposes a "trending heat" as a decayed-sum over
  > `core_public_entity_score_history`, use `rising` instead (it already encodes the decay). **Search ships
  > `rising DESC` as the "Rising" sort** end-to-end (`risingActive` → `search-query.builder.ts`). Polls feed
  orders only by `launchedAt DESC` (`polls.service.ts:63-96`) — no sort param.
- **No generic toggle/segmented/chip component exists** in mobile; the search
  restaurant⇄dish toggle is bespoke + entangled with the search runtime
  (`SearchFilters.tsx:514-690`, `use-results-presentation-tab-toggle-runtime.ts`).
- ~~**The card/+ "opens nothing" report is a stale-bundle/env issue, not a code
  bug.**~~ **SUPERSEDED — it WAS a code bug, now FIXED** (commit 05ed7a6f). See
  Round-3 §A: the sheet-host body-snapshot equality dropped `displayedSceneKey`.

---

## 1. Poll creation page (Reddit-style "make a post" scene)

A dedicated `pollCreation` child scene (already registered) rebuilt as an
**editable empty poll canvas**.

- **Entry:** the `+` button swaps to the creation page (own scene like pollDetail).
- **Shared canvas = the live poll UI as an editable shell.** Standardize the poll
  card/detail visual components so the creation canvas *is* an empty poll being
  edited. If the poll UI changes later, the canvas inherits it. Extract the poll
  presentation (header, question, bars area, description block) into shared
  components consumed by card + detail + creation.
- **Layout, top → bottom:**
  1. **Market dropdown** (top, above subject). Pre-selected to the market you were
     on when you tapped `+`. Tapping opens a **market-picker page**: full market
     list + a search bar to search across all markets. (Its own lightweight scene.)
  2. **Subject / title** — the free-text question the LLM will resolve.
  3. **Poll-options area — shown empty + visibly non-editable.** We don't know the
     type until the LLM resolves the subject, so this stays an empty placeholder
     ("Your ranking forms from the discussion") — communicates that options are not
     hand-seeded.
  4. **Description / body** — multi-line, displayed on the detail page (and snapshot
     on the card, §4). This is the creator's seed (§2).
  5. **Photo attach — DEFERRED out of this plan** (Round-4). All poll image work
     (the `PollMedia` table, Cloudinary upload, swipeable card/detail carousel) moves
     to a dedicated **app-wide media session** that handles every image surface
     together (poll media + restaurant/result-card thumbnails + profile galleries) so
     they share one Cloudinary + media-table design. Build the creation page WITHOUT
     any photo affordance for now. See Round-4 §H.
- **Submit flow:** see §3 (dedup-first, then resolve).

OPEN: market-picker as a full scene vs a sheet-over-creation. Lean: lightweight
child scene reusing the search-list pattern.

---

## 2. Description as the creator's organic seed (no manual option-seeding)

The creator never hand-adds poll options or votes. Their **description is treated
like a comment** and the LLM/gazetteer extracts their suggestion from it.

- **Live (while the poll is open):** at creation, run the description through the
  SAME extraction the comment path uses (`scanForKnownEntities` → entitySpans), and
  fold the resulting endorsements into the live leaderboard **attributed to the
  creator's userId**, with the **same per-user-per-entity dedup as comments** (Set
  semantics in `rebuildPollLeaderboard` already dedup by userId — a creator who
  later repeats the same entity in a comment counts once; a *different* entity in a
  comment counts as a second suggestion).
  - Implementation choice (recommended): keep `description` as a poll field for
    display, and seed the creator's endorsements directly into the leaderboard from
    the description's spans (no synthetic comment row → thread stays clean). The
    description's spans participate in `rebuildPollLeaderboard` exactly like a
    comment's, keyed by `createdByUserId`.
  - Alternative: store the description as the creator's pinned first `PollComment`
    (`isDescription` flag) and render it as the description. Cleaner extraction
    reuse, but mixes display + thread. Decide at build time; lean toward the field +
    seed approach.
- **At graduation/closure:** **include the description in the collection context.**
  Today only the `question` is sent (non-extracted framing) and the description is
  dropped. Add the description to the graduated thread as an extractable
  creator-authored unit (so closure counts it like Reddit collection counts a post
  body). This aligns with "we send the description as context during collection."

Correction to a prior belief: we do NOT currently send the description to
collection — only the question, and only as framing. Both the live-seed and the
graduation-context wiring are net-new (small).

---

## 3. Dedup at creation (the volume valve) + the fast/ideal submit flow

**Dedup is the primary defense against firehose** — most big-city pileup is
duplication ("best tacos in Austin" asked 10×). We do NOT cap or reject creation;
we route duplicates to the existing poll.

### UX: duplicate modal (bottom sheet)
When a submit matches an active poll, show a bottom modal: "This looks like an
active poll" + a card/link to that poll, with two actions:
- **View the poll** → discard the draft + open the existing active poll (pollDetail).
- **Discard** → discard the draft + return to the poll sheet they were on.

(Note: per the owner's call, we do NOT silently convert their description into a
comment on the existing poll — we show the modal and let them choose. They can
re-add their take by joining that poll's discussion themselves.)

### Speed: two-stage, dedup-first (the ideal flow)
On **submit (press-up)** show a brief loading state and run:

1. **Stage 1 — fast text dedup (sub-100ms).** `word_similarity(question, active
   poll questions)` in the market (the `fetchPollMatches` SQL, **high** threshold to
   avoid false rejects on "best tacos" vs "best taco truck"). Strong match → show
   the duplicate modal immediately. No LLM yet.
2. **Stage 2 — LLM type resolution (~1–3s).** Only if Stage 1 found no obvious dup:
   run `inferPollSubject` + target resolution.
3. **Stage 3 — exact-entity dedup.** After resolution, check the resolved target
   entity (`targetDishId`/`targetRestaurantId`) against active polls' targets — this
   catches reworded semantic dups the text match missed. Match → duplicate modal.
   Else → create the poll + open it.

Net: obvious dups rejected in <100ms; non-dups pay the normal ~1–3s creation; the
loading screen covers the whole thing. Build a `POST /polls/check-duplicate`
(text-stage) + fold stage-3 into `createPoll`.

OPEN: text-dedup threshold tuning (favor precision — only reject obvious dups, let
stage-3 entity-match do the precise work).

---

## 4. The feed: Live/Results split, ordering, and surfacing

### Primary split — segmented toggle
**Live ⇄ Results** (recommended names; "Results" reads better than "Closed" and
*is* the weekly payoff). Default **Live**. Same two-position segmented pattern as
search's restaurant⇄dish, but Live vs Results are distinct datasets → this toggle
**refetches** (search's cached-both-datasets swap does not apply).

### Default order (the silent nudge) — agreed
No explicit sort label by default (chip reads "Sort"). The default order:
1. **App Crave polls pinned on top** (already algorithmically chosen by the
   scheduler), with the sparkles "Crave" treatment.
2. **User polls ranked by demand alignment** — read the precomputed
   `pollPriority.score` (or a cached per-market entity→demand map) for the poll's
   target entity. Higher demand ("our system wants this question answered") ranks
   higher. This silently nudges the community toward high-value subjects.

Feasible as a join/read (do NOT compute `planMarketTopicCandidates` inline per feed
load — too heavy; read the stamped score or a cached map).

### User-selectable sorts
- **New** — chronological (`launchedAt DESC`, the current behavior).
- **Top** — engagement = distinct endorsers (matches the leaderboard signal).
- **Trending** — `score_delta_7d` of the poll's target entity (reuse the search
  delta infra; net-new join for polls). Build the sort param + poll→topic
  target→`core_public_entity_scores.score_delta_7d` join + move off the simple
  Prisma `orderBy` (raw query or post-fetch sort).
- (Hold **Most discussed** = comment count for later — differs from votes since
  votes are tap-toggle + multi-author, but adds toggle clutter at launch.)

### Card differentiation
User-created polls show a **snapshot of the description** under the poll on the
feed card (app polls usually won't have one) → makes user polls visibly more
human/inviting and distinguishes them from app polls.

---

## 5. Cadence & scheduling (the bet)

**Decoupled model — creation is never time-gated; the weekly rhythm is about
results + app polls, not user creation.**

- **User polls self-schedule within bounds.** Creation page lets the user pick a
  close window: **min ~3 days, max ~14 days, default 7**. Avoids the
  Thursday-poll-gets-1-day problem; spreads close-load (no global pileup); keeps a
  steady stream of fresh Live + freshly-Closed polls (good for early activity).
- **App Crave polls = the weekly editorial spine.** Keep the existing weekly
  publish cron; pin the current app poll(s) at the top of Live ("poll of the week"
  highlight). Cheap, removable, provides structure + showcases the automated
  intelligence. **This is a bet** — validate post-launch; pull the pin if users
  don't value it.
- **Per-poll close = a mini-event** (notification on close + results finalize).
  The weekly "results are in" feeling comes from the app-poll drop + the Results
  tab filling, not a forced global batch.

### Per-user soft cap — agreed
**2 active polls / week / user / market.** Rolling 7-day window check at creation;
soft (clear "you've used your 2 polls this week in {market}" message), not a silent
fail. **No limit on comments / discussion.**

---

## 6. Toggle strip — ideal end shape

Build a reusable strip; extract generic primitives (no generic toggle/chip exists
today). **Extract `SegmentedToggle({options:[a,b], value, onChange})` +
`FilterChip({label, active, onPress})`** (reuse the Reanimated sliding-pill
technique + `FrostedGlassBackground`/`MaskedHoleOverlay` from `SearchFilters.tsx`),
and optionally retrofit search onto them later.

| Control | Type | Default | Options |
|---|---|---|---|
| **Live / Results** | segmented (primary) | **Live** | Live, Results |
| **Type** | filter chip | **All** | All, + each poll-type, + Discussion |
| **Sort** | filter chip | **(silent demand default)** | New, Top, Trending |
| **Time** | filter chip (mainly Results) | **This Week** | This Week, All Time |

- **Type options naming:** the 4 axis types (best_dish, what_to_order,
  best_dish_attribute, best_restaurant_attribute) are jargon. Recommend
  user-facing grouping — e.g. **All / Dish polls / Spot polls / Discussion** —
  rather than exposing raw axis types. OPEN: final labels.
- **Time default:** This Week (reinforces the weekly cadence + keeps Results fresh);
  on Live, time matters less — consider hiding Time on Live or defaulting All.
- **No other toggles at launch.** Future candidates (skip now): Following (social
  graph), Near me (geo within market), My polls (already in profile).

---

## 7. Poll-detail thread adjustments (reconcile with what shipped)

The shipped replies/edit/delete (`PollDetailPanel.tsx`) put the composer in the
**list header (top)** with inline reply boxes and a text "Reply" label. The agreed
shape:
- **Move the main compose box to the BOTTOM** of the poll detail page (chat/Reddit
  style) — simple, elegant, attractive.
- **Reply = an icon button** on each comment / nested comment (entry point to nest),
  not a text label.
- Keep the per-comment **vote button** (shipped as the heart/like).
- **Defer:** share comment, copy text, collapse threads — "worry about it later to
  do it right."

(These share components with the creation canvas + card, so do them together.)

---

## 8. Search results sort (separate, flagged per owner request)

**Look into adding a sort toggle to the SEARCH results list** (next to / left of the
restaurant⇄dish toggle): **Best** (current default) and **Trending/Hot** (score
delta). FINDING: this **already exists** as the **"Rising"** boolean
(`score_delta_7d DESC`, shipped DB→API→mobile chip). So the task is:
1. Verify "Rising" is complete + correct (it appears fully wired).
2. Surface it as a proper **Best ⇄ Trending** sort toggle in the results header
   (left of restaurant/dish), instead of (or alongside) the current "Rising" chip —
   rename to "Trending"/"Hot" for clarity.
3. Confirm it re-runs/re-orders the search correctly on toggle.
Minimal new work — mostly UX surfacing + a possible rename; the delta data + sort
order-token already exist (`search-query.builder.ts` `resolveRestaurant/DishOrderSql`).

---

## 9. The card/+ "opens nothing" bug — FIXED (see Round-3 §A)

> **RESOLVED (commit 05ed7a6f).** It was a real code bug: the sheet-host
> body-snapshot equality excluded `displayedSceneKey`, so the poll-lane→pollDetail
> switch never republished the body. The original stale-bundle theory below was
> wrong. Round-3 §A has the full attribution; the remaining work is the §C
> transition choreography (polish, not a blocker).

**Not a code bug** — stale JS bundle on the running sim (binary built before the
day's poll/nav commits; Debug build serves JS live from Metro). The harness drove
both `pushRoute('pollDetail')` and `pushRoute('pollCreation')` and pollDetail
mounted + fetched. **Action: fully reload** (Cmd+R / kill+relaunch /
`yarn start --reset-cache`). If it persists after a clean reload, capture the Metro
`[...javascript]` log during a real tap: if `/polls/<id>` fetches fire → render
error in `usePollDetailPanelSpec`; if not → touch not reaching the handler (empty
feed = no cards, or a responder swallowing taps).

---

## 10. Suggested sequencing

1. **Verify the nav works after a clean reload** (unblocks everything; likely no
   code).
2. **Thread polish** (§7): compose-at-bottom + reply icons — small, shared
   components.
3. **Shared poll canvas components** (§1) — extract card/detail/creation shared UI.
4. **Creation page** (§1) — market dropdown + picker, subject, empty options
   placeholder, description (no photo — deferred to the media session, Round-4 §H).
5. **Description-as-seed** (§2) — live extraction + graduation context.
6. **Dedup flow** (§3) — `check-duplicate` endpoint + modal + two-stage submit.
7. **Per-user cap** (§5) — rolling-window check.
8. **Self-scheduling** (§5) — close-window picker + bounds.
9. **Feed: Live/Results toggle + default demand order + app-poll pin** (§4, §6).
10. **Sort/Type/Time chips + generic SegmentedToggle/FilterChip** (§6); polls
    Trending sort join (§4).
11. **Search results Best⇄Trending toggle** (§8) — separate track.

Phases 2–8 ship the create→seed→dedup loop (the core new capability); 9–11 are the
feed/curation layer that matters once volume grows (keep simple until then).

---

## Round-2 design updates (2026-06-21 cont.)

- **§9 BUG — REPRODUCED, re-scoped.** Not staleness (a fresh `launchApp` pulls
  current Metro JS and still fails). Reproduced via `maestro/perf/flows/poll-card-open.yaml`
  + screenshots: the docked "Polls in New York · N live · +" lane renders but
  **won't expand to the feed** — tap-header / swipe-up / `open_overlay_scene
  scene=polls` (snap:'expanded') all leave it collapsed; the `+` is unresponsive.
  The `pollDetail`/`pollCreation` SCENES open fine when pushed via the harness
  (`open_overlay_scene` → `pushRoute`), so the break is the **docked-lane →
  expanded-feed handoff**, NOT the scenes. Feed cards render only when
  `visiblePolls` is populated AND `!shouldHoldFreshLiveContent` AND not loading
  (`PollsPanel.tsx:456-459`); in the docked/collapsed state they don't surface.
  Root-cause area: `usePollsPanelFeedRuntime` + the `mode`('docked'|'overlay')/snap
  transition (`PollsPanel.tsx:241,395-448`) + the gesture-handoff sheet. FIX THIS
  FIRST — everything else is untestable until the feed opens.
- **Demand-cooldown coupling (the feedback loop).** A user poll that matches/targets
  an entity is "we're collecting on it again" — it should bump that entity's
  `lastPolledAt`, exactly as the scheduler does when IT creates a poll
  (`poll-scheduler.service.ts` stamps `lastPolledAt`; the cooldown
  `pollCooldownAvailability` reads days-since). So a user poll suppresses a
  redundant app Crave poll on the same subject. Small add (field + cooldown both
  exist). Also feeds the §4 default demand-sort: a freshly-polled entity's demand
  availability drops → its user polls naturally rank a bit lower over time.
- **Poll-of-the-week pin — DEFAULT SORT ONLY.** Pin app Crave polls at the top only
  when the sort is the silent default order, for BOTH Live and Results lists. When
  the user picks New/Top/Trending, no pinning — the chosen sort wins outright.
- **Toggle strip — MATCH the search restaurant/dish toggle EXACTLY.** Owner
  directive: implement the polls toggle strip the same way as the
  restaurant⇄dish toggle (`SearchFilters.tsx` Reanimated sliding pill + gesture +
  layout) — it was a hard-fought implementation; mirror it, don't reinvent.
  (Extracting a shared `SegmentedToggle`/`FilterChip` is fine as long as the
  behavior/feel is identical and search can adopt it too.)
- **Time bundles INTO Sort (not a separate chip).** Time is moot for New. So when
  the user picks **Top** or **Trending**, reveal a time sub-selection;
  New has none. Time options: **Today, Week, Month, Year, All Time.**
  - Recommended default time for Top/Trending: **This Week.** Rationale: keeps the
    feed fresh + ties to the weekly cadence + avoids all-time ossification (the same
    few polls forever). For **Trending** specifically, the delta windows we actually
    compute are 7d + 28d, so Trending's time options map to those (Week=7d,
    Month=28d); Today/Year aren't computed deltas — either hide them for Trending or
    treat as Top-only. (Today may be low-value given polls live 3–14 days.)
- **Transitions / modals (best-in-class, fold in now).**
  - Most scene switches: snap/immediate content switch (no animation).
  - **Reply / comment-compose on poll detail = a keyboard-tracked input modal**
    (Reddit-style): tapping the bottom input or a comment's **reply icon** raises a
    modal whose text box sits directly above the native keyboard and slides up with
    it; the comment being replied to is highlighted and pinned just above the box so
    it stays readable while typing. Smooth, frame-accurate timing.
  - **ALL modals app-wide must be swipe-to-dismiss** (drag down to dismiss; no grab
    handle needed) — currently they only dismiss on tap-outside. They have a set
    high anchor but can be dragged down to close. This is a prerequisite for reusing
    the modal shell for the reply composer. Apply globally to the modal component.
- **Reddit-collection parity for the description (T3 answer).** At **graduation**:
  YES — include the description in the graduated thread so it flows through the
  EXACT same collection pipeline as Reddit (chunking + context + extraction via
  `processPosts({pipeline:'poll-thread'})`). At **live creation**: NO — it's the
  lightweight `scanForKnownEntities` gazetteer scan folded into the live
  leaderboard (not the full LLM chunk pipeline). Two paths, by design.
- **Rising / 7-day delta (T2 answer + the surfacing fix).** "Rising" = `score_delta_7d
  DESC`. Why 7d: "this week's movement" — responsive but smoothed over daily noise,
  and aligned to the weekly cadence; the 28d delta (also persisted) is the smoother
  "this month" view. It got built as a right-side chip; the OWNER's original intent
  was a **left-side sort toggle styled like the old global/local sort toggle**
  (gone from git history). The fix: surface it as a proper **Best ⇄ Trending** sort
  toggle on the LEFT of the results header (per §8), not a far-right chip. Offering
  both 7d ("Hot/Week") and 28d ("Trending/Month") windows is possible since both
  deltas are computed.

## Round-2.5 updates (2026-06-21 cont.)

- **BUG re-scoped (the real one) + first fix shipped.** Owner clarified: the feed
  DOES expand (Maestro just couldn't drive the swipe); the actual bug is **tap a
  card in the EXPANDED feed → it dims (press-in) but onPress never fires, nothing
  opens.** Cause: the poll card used RN `TouchableOpacity` inside the
  `GestureDetector`-wrapped sheet (`BottomSheetWithFlashList`); the sheet's pan
  gesture cancels the touchable's press on release. Working search result cards use
  RN `Pressable` in the same host. FIX SHIPPED (commit 41843309): poll card →
  `Pressable`. **Device-unverified** (Maestro can't reliably reach the expanded
  card) — needs a manual tap. FALLBACK hypothesis if it persists: the `+` button is
  already a `Pressable`+`onPressOut` yet was also reported dead, which would instead
  point to `pushRoute`-from-PollsPanel not taking effect (a route-controller/context
  binding issue) vs. the perf-coordinator `pushRoute` which works — investigate that
  next if Pressable doesn't fix it.
- **GLOBAL "tap a docked sheet → middle snap" behavior (owner-requested).** Make it
  app-wide: tapping the header of any sheet resting at its lowest/docked snap
  releases it to the **middle** snap on press-up, regardless of content/scene.
  Today the docked polls require a swipe-up — this adds the tap affordance
  everywhere. (Not the card-tap bug, but a real UX gap; implement in the shared
  sheet/gesture runtime so all scenes inherit it.)
- **Trending WITHOUT fixed windows (owner's "more mature" concept) — RECOMMENDED
  model.** Replace the hard 7d/28d windows with **time-decayed engagement velocity**
  (a "heat" score): each engagement contributes `e^(−λ·age)`, so recent activity
  dominates but nothing is hard-cut. Equivalent to an EWMA of the activity rate with
  a single smooth knob — the **half-life** (e.g. 2–4 days), not a window.
  - `heat = Σ_events e^(−λ·(now − t_event))`, `λ = ln2 / half_life`. Computable now
    from the existing daily score history: `heat = Σ_days (daily_delta_d ·
    e^(−λ·days_ago_d))` over ~30–60d of history — cheap, window-free, reuses
    `core_public_entity_score_history`.
  - Behavior: more movement in less time → higher decayed sum → trends harder; an
    OLDER entity with a recent surge CAN outrank a NEWER one with less movement
    (decay weights recency, doesn't hard-cut age).
  - Optional refinement (Reddit/HN-style): blend with log-magnitude
    (`log10(score) + heat`) so a tiny entity's blip doesn't beat a large entity's
    steady climb. Pure decayed-velocity matches the "trending" intent most directly.
  - **Consequence for toggles:** window-free Trending makes the **Time filter moot
    for Trending** — so Time applies to **Top only** (engagement over a period); New
    has no time; Trending is inherently windowless. Simplifies §6's Time bundling.
- **Find + revive the old global/local sort toggle (owner-requested).** The original
  intent for the trending sort was a **left-side toggle styled like the old
  global⇄local sort toggle** that existed months ago and was removed. Search git
  history for the best version of that component, study it, and implement the
  Best⇄Trending (and the polls) sort toggle in that same style/placement (left of
  the restaurant/dish toggle for search; in the polls strip for polls).

## Round-3 updates (2026-06-22) — locked decisions, new UI/behavior scope, research-first mandate

This round supersedes the conflicting earlier notes where it overlaps; it is the
current word. Grounded against the live panels (`PollCreationPanel.tsx`,
`PollDetailPanel.tsx`) + the sheet-host/transition runtime.

### A. The card/+ "opens nothing" bug — FIXED (no longer the blocker)
Root cause was NOT staleness or the `Pressable` swap alone. Attributed via
Metro-log instrumentation: the sheet-host body-snapshot equality
(`areAppRouteSheetHostSurfaceBodySnapshotsEqual`) **excluded `displayedSceneKey`**,
which drives per-scene visibility in `BottomSheetSceneStackHost`
(`resolveSceneStackStaticVisibility`). A poll-lane → pollDetail switch changed only
that field (sibling poll scenes share chrome/runtime/motion) → `recomputeBody`
treated it as equal → never republished → the host stayed on the `polls` frame.
**Fix shipped (commit 05ed7a6f):** include `displayedSceneKey` in the equality.
Both card→detail and +→creation verified on sim (Maestro flows
`poll-card-open.yaml`, `poll-create-open.yaml`). The content-swap now works; §C
below is the remaining *choreography* polish, not a blocker. See memory
[[snapshot-equality-load-bearing-fields]].

### B. Locked product decisions
1. **Creation = type-less, subject-first.** REMOVE the 4-template type picker +
   the per-type target autocomplete entirely from `PollCreationPanel` (it is
   type-first today). The page sends free-text `createPoll({ question, description,
   marketKey, closeWindowDays })`; the backend already infers mode+axis via
   `createPollFromQuestion` and **ignores** `topicType`/target when `question` is
   present (`create-poll.dto.ts:34-42`). The options area stays an **empty,
   visibly non-editable placeholder** ("Your ranking forms from the discussion").
   The inferred axis is still stored server-side for leaderboard logic — it is just
   never chosen by the user.
2. **White, full-bleed sheets for `pollCreation` + `pollDetail`.** Replace
   `backgroundComponent: <FrostedGlassBackground/>` with a **solid white surface**,
   and **merge the header into the sheet** — no separate frosted header bar; the
   white surface runs full-bleed top→bottom. Keep the close (X) button + a subtle
   grab affordance. The docked poll **lane + feed keep their frosted treatment** —
   white applies only to these two child scenes.
3. **Feed type filter = `All · Polls · Discussions`** (§6 Type chip; labels locked
   Round-4). The ranked best-of polls (with a leaderboard) are simply **"Polls"**;
   the open-ended ones are **"Discussions"**. Drop the dish/spot grouping —
   output-grouping is ambiguous ("best tacos" reads as a dish but ranks spots). Polls
   (has a leaderboard) vs Discussions (open thread) is the one unambiguous,
   backend-aligned split. Richer subject filters (cuisine / by-entity) are a
   post-launch feature, not a relabel.
4. **Trending = heat blended with magnitude.** `score = log10(max(1, score)) + heat`,
   `heat = Σ_days(daily_delta_d · e^(−λ·days_ago_d))`, **half-life ≈ 3 days**
   (`λ = ln2/3`), summed over ~30–60d of `core_public_entity_score_history`.
   Window-free (no Time sub-filter for Trending). Drives both the polls Trending
   sort and the search **Best⇄Trending** toggle (§8).
5. **App/Crave poll cadence = fixed weekly cron, PUBLISH SUNDAY, 7-day window**
   (closes the following Sunday). Rationale (owner): the poll is far enough along by
   the weekend to inform weekend dining, finalizes Sunday with time to still
   contribute, and the fresh drop lands Sunday when people are off and can
   participate. (Change the existing Mon-9am cron to Sun.) Pinned as
   "poll of the week" under the **default sort only** (§4).
6. **User-poll self-schedule = 3–14 days, default 7.** Per-user soft cap
   **2 active polls / week / market** (rolling window). No cap on comments.

### C. Transition choreography (NEW — make poll-open feel like search-submit)
Today a poll-card/+ tap visibly tears the whole bottom sheet away and rebuilds it
as the new scene. Required instead: the **same choreography as submitting a
search** — the persistent poll sheet *expands in place* into the detail/creation
sheet, with the **nav pushed down at the sheet's bottom edge** (the illusion that
the sheet shoves the bottom nav down), content switching **on top**, and the page
switching **immediately on press-up into a loading state** until the data is ready
(mirrors tapping a restaurant on the results sheet, but the nav-push expansion runs
on the **poll-card tap**, not on search submit).
- Reuse the existing machinery, do not reinvent: the `results_dismissing` phase +
  `bottomBandOwner: 'persistent_polls' → 'results_header'` handoff in
  `search-surface-runtime.ts`, the nav push-down in `NavSilhouetteHost.tsx` +
  `use-search-foreground-bottom-nav-visual-runtime.ts`. Trigger the same sequence
  on `pushRoute('pollDetail'|'pollCreation')` from the poll lane.
- Builds on the §A fix (content swap already correct); this adds the nav/sheet
  choreography + a press-up loading state on the detail/creation body.

### D. Poll-detail thread — full behavioral spec (supersedes §7)
1. **Persistent compose chin.** A bottom bar pinned over the discussion with the
   text box inside it, **always visible** (Reddit/IG/Twitter pattern). It is NOT in
   the list header anymore (move it off the top — `composeRow` currently lives in
   `listHeaderComponent`).
2. **Compose = keyboard-tracked modal.** Tapping the chin's text box raises it into
   a modal whose input sits **directly above the native keyboard and slides with
   it** (frame-accurate). Smooth open/close.
3. **Reply = an icon button** on every comment (replace the text "Reply" label).
   Tapping it raises the **same** compose modal AND **highlights the target comment
   and floats it to sit flush just above the compose bar** (from wherever it was in
   the list), so it stays readable while typing — unless it was already at the top,
   in which case it stays put.
4. **Reddit-grade threading.** Vertical connector lines linking parent↔children;
   **tap a comment to collapse its subtree** (children fade out + comments slide up
   to fill, collapsed node shows only the username/handle bar; tap to re-expand).
   Visual indent **caps at 5 levels** (Round-4); past the cap, **flatten + @mention
   the parent** (IG/YouTube continuation) so the whole conversation stays on one page
   — NOT Reddit's "Continue thread →" separate screen. (Research basis in §F.)
5. **Header with close button retained**, on the white sheet (§B.2).
6. **Bars = graduated primary shades.** Restore the earlier treatment: rank-1 bar
   at full primary color, each lower-ranked option a slightly less vibrant shade of
   primary down the list (`PollCandidateBars`).
7. **All modals swipe-to-dismiss** (drag down to close from a set high anchor; no
   grab handle needed). Apply globally in the modal shell — prerequisite for reusing
   it as the reply composer (today modals only dismiss on tap-outside).

### E. Research-first mandate (do a spike before building each complex piece)
Owner directive: every non-trivial piece gets a "best-in-class implementation"
research spike (short findings doc + a small POC where useful) BEFORE code. Spikes:
1. **Reddit-grade threaded comments** — vertical connector lines, collapse/expand
   animation, flatten-@-cap, virtualization compatible with the FlashList sheet body.
2. **Keyboard-tracked compose modal + reply-target float** — `react-native-keyboard-
   controller` vs Reanimated `useAnimatedKeyboard`; the highlight-and-float-to-top
   animation; the global swipe-to-dismiss modal shell.
3. **Search-style nav-push transition** reused for poll-card→detail (§C).
4. **Shared poll-canvas component extraction** — card / detail / creation consume
   one set of poll-presentation components (header, question, bars, description).
5. **Trending heat SQL** — decayed-sum over `core_public_entity_score_history`,
   `+ log10(score)`; precompute vs query-time; index plan.
6. **Two-stage dedup** — `word_similarity` text stage + post-resolution entity stage;
   latency budget + the duplicate modal UX.

**Spike E.1–2 — FINDINGS + recommended approach (2026-06-22, code-grounded).**
Available libs: **Reanimated 4.1** (`useAnimatedKeyboard`), **FlashList 2.0**
(`@shopify/flash-list`, already the sheet body), **gesture-handler 2.28**,
**react-native-svg 15.12**. The app currently uses RN `KeyboardAvoidingView`
(Onboarding, EmailAuthModal) — NOT frame-accurate; do NOT use it for the compose
modal. `react-native-keyboard-controller` is NOT installed.
- **Keyboard-tracked compose modal (§D.2): use Reanimated `useAnimatedKeyboard`** —
  no new dep, frame-accurate (keyboard height is a shared value), and consistent with
  the Reanimated-heavy sheet/gesture runtime. The compose bar's
  `translateY = -keyboardHeight` animates per-frame, so the input "sits directly above
  the keyboard and slides with it." (Rejected `react-native-keyboard-controller`:
  works, but adds a dep + a root `KeyboardProvider`; unnecessary given Reanimated 4.1.)
- **Reply-target float (§D.3): render a PINNED COPY** of the target comment in a
  header directly above the compose input (not a list-item animation) — simplest,
  avoids measuring/animating a virtualized row; highlight it; if the target was the
  top row, no float needed.
- **Reddit threading (§D.4): vertical connector lines = thin absolutely-positioned
  Views** (one per ancestor depth, at each indent x-offset) — straight lines need no
  SVG; reserve `react-native-svg` only if we want elbow joints. Keep the existing
  `buildThreadItems` flatten-to-render-order; **collapse = a `Set<collapsedId>`** that
  prunes descendants from the flattened list + renders a collapsed bar (username
  only). Animate collapse with Reanimated (height/opacity) — recompute the FlashList
  data on toggle (FlashList 2.0 virtualizes it). Indent cap = 5 (Round-4 G); past it,
  flatten at depth-5 + @mention parent.
- **Compose chin (§D.1): a persistent bottom bar** outside the FlashList (sibling in
  the scene body), with the keyboard-tracked modal raised on focus. Sequencing: build
  the chin + `useAnimatedKeyboard` modal first, then the reply-pinned-copy, then the
  threading visuals/collapse. Each independently validatable via Maestro + a manual
  keyboard tap.

### F. Threading research findings (recorded)
- **Instagram / YouTube:** 2 levels (comment → flat replies); deeper replies just
  @mention and stay in the one group. Collapsible ("View N replies").
- **Twitter/X:** drill-down — each node is its own focused page; not an indented tree.
- **Reddit:** deep indented tree with vertical lines; indent caps (~5-8 on mobile)
  then "Continue this thread →" to a focused subtree; tap-to-collapse any node.
- **Our collection pipeline:** fetches `depth: 50` "to get all nested comments"
  (`llm-processing.processor.ts:133`) — **no 5-layer cap**; the remembered limit was
  inaccurate. Nothing upstream constrains the live thread UI.
- **Decision (D.4):** Reddit *visuals* (lines + collapse) + Instagram *depth
  handling* (cap ~4, flatten/@mention past it) — keeps one bounded thread per poll.

## Round-4 updates (2026-06-22 cont.) — nav foundation, creation-sheet behavior, resolved opens

### G. Locked refinements
- **Thread indent cap = 5 levels** (was ~4), then flatten + @mention (amends D.4/F).
- **The sheet stays named "Polls."** Do NOT rename to "Feed"/generic. "Polls" is the
  recognizable hook; discussions are a **discoverable sub-kind** of poll. Filter
  labels = **`All · Polls · Discussions`** (the ranked best-of polls are "Polls"; the
  open-ended ones are "Discussions"). The sheet-name/filter overlap is intentional —
  it reinforces that a "poll" *is* the ranked best-of format.
- **Discussion-poll cards lead with a body/description preview** (no bars). They must
  NOT look empty — the description snapshot IS the card's content. "Polls" (ranked)
  cards show bars (user polls may also show a description snapshot). Amends §4
  card-diff.

### H. Resolved opens (with rationale)
- **Description storage → poll FIELD + leaderboard-seed (Option A).** `description` is
  a poll column; renders as a body block under the question + a card snapshot. At
  creation, scan it for entity mentions and seed the creator's endorsements straight
  into the leaderboard (no synthetic comment). Keeps the "post body ≠ comments"
  mental model (Reddit-like) and the thread clean; extraction reuse is one scanner
  call. (Rejected B = pinned first comment: blurs body/thread for marginal reuse.)
- **Photo attach → DEFERRED to a dedicated app-wide media session (Round-4 final).**
  Owner's call: hold ALL poll image work out of this plan and do it in one focused
  session that handles every image surface together so they share a single design —
  **Cloudinary** + a shared **media table** across poll media, restaurant cards,
  search-result-card thumbnails (Google/YouTube-style), and restaurant-profile
  galleries. When that session runs, polls get a small `PollMedia` slice
  (`pollId`, `cloudinaryPublicId`, `order`, `type`, `width`/`height`) supporting a
  **swipeable multi-image carousel** on card + detail, designed as a slice of the
  shared shape (not forked). For THIS plan: build creation/detail/card with **no
  photo affordance**; leave a clean seam (the shared poll-canvas components can take
  an optional media prop later). That media effort deserves its own plan.
- **Market picker → MODAL sheet (value-picker), not a scene.** It returns a market
  and dismisses back to creation — that's a value-picker, not a destination.

### I. Scene vs modal — the reusable pattern (we'll do this often)
- **Child scene** (pollDetail, pollCreation, restaurant, profile): a registered route
  in the scene stack — pushed/popped, **preserved in back-history**
  (`overlayRouteStack` + `parentSceneKeys`), gets the sheet-host + transition
  treatment. Heavier to register. **Use for destinations** you navigate *to* and
  *back from*.
- **Modal / sheet-over-scene** (duplicate-poll modal, market picker, sort picker):
  transient UI on top of the current scene, local state, **not** in the route stack;
  dismiss → same scene. **Use for value-pickers + confirmations.**
- **Rule:** returns-a-value / confirms → **modal**; is-a-place-with-content-and-back
  → **scene**.

### J. Creation-sheet open + keyboard choreography (amends §1, §C)
- **Creation uses the same nav-push expansion transition** (§C). Because the keyboard
  covers ~half the sheet (nav can't sit on-screen anyway), on open the creation sheet
  **auto-extends to the HIGHEST snap** with the **subject text box focused + keyboard
  up**, regardless of where the poll sheet was (low/mid/high).
- **Keyboard discipline (precise):**
  - Auto keyboard-up happens **only on first open** of the creation sheet.
  - The grab handle drags the sheet to mid/low like any sheet. The instant the user
    touches anything to drag the sheet (anything *but* the text box), the **keyboard
    dismisses** and stays gone at the lower snaps.
  - The keyboard only returns when the sheet is at the **top** snap **and** the user
    **taps the text box** again. Dragging back to top does NOT auto-raise it — only a
    manual text-box tap does (after the first open).
- Shares the keyboard-tracked modal mechanics with the comment composer (§D.2).

### K. FOUNDATIONAL — "surrender search from anywhere → explore → return"
A core navigation invariant to standardize across the WHOLE app (current + future
screens), not a per-screen feature:
- From ANY screen (poll creation, poll detail, profile, favorites, a not-yet-built
  screen…), the user can **run a search**; the current screen yields to the **results
  sheet** via the standard search transition.
- All downstream flows (restaurant profile, poll detail, profile, …) work normally on
  top.
- The app **preserves the nested back-history** of where the user was, so
  **closing/backing out** of the search + the explored pages walks them, step by step,
  back to **the exact screen they started on**.
- Must "just work" for screens that don't exist yet — make it a navigation foundation.

**SPIKE RESULT (owner-run, 2026-06-22) — the invariant FAILS today; §K is a confirmed
core-nav task that PRECEDES the creation build.** Repro: open the creation sheet → run
a search. Findings:
- **In** is fine: the creation sheet transitions to the search/results sheet cleanly.
- **Out is broken:** closing the search does NOT return to the creation sheet. Instead
  it runs the **standard dismiss flow** (sheet slides to the bottom snap and tears
  down) — it neither **stops at the creation scene** nor **remembers the sheet's snap
  position** from when the search was launched.

Two required fixes:
1. **Restore the origin scene on back-out** — when search (and any pages explored from
   it) is dismissed, the stack must **stop at the scene that was active when search was
   launched** (creation), not fall through to the global dismiss-to-bottom path.
2. **Remember + restore the sheet snap position** — capture the sheet's snap
   (low/mid/high) at search-launch time and **smoothly animate back up to it** on
   restore, instead of snapping to the bottom.

Likely area: the search **dismiss/back-out** path (`results_dismissing` /
`bottomBandOwner` handoff in `search-surface-runtime.ts`) currently assumes the
pre-search state was the bare `search` root, so it returns there; it needs to honor a
**preserved origin route + snap** captured at search-launch. Investigate before
editing (hard-fought sheet/nav runtime). This is **build task #0** — creation can't
ship correctly until back-restore works.

**ROOT CAUSE — VERIFIED via self-instrumentation + Maestro (2026-06-22), correcting
the static-analysis guess.** Repro driven (`maestro/perf/flows/poll-search-return.yaml`):
open creation → slide it to the low snap (search bar reachable) → type+submit a search
→ close. A `[ATTRK]` log on the close handler
(`use-results-presentation-close-actions-runtime.ts`) shows **`activeRouteKey=search`
at close** and the sheet lands on the **polls lane**, not creation. So the origin route
is **destroyed at search-launch, not merely mis-targeted at close** (the earlier
"route is preserved" read was WRONG — static analysis misled again). Mechanism:
launching a search commits a **`setRoot` route action** →
`setRootRouteState('search')` (`app-route-scene-switch-controller.ts:208-223`) which
**resets `overlayRouteStack` to `[search]`**, discarding the `pollCreation` entry that
`pushRoute` had stacked on top. `pushRouteState` (225-246) would have preserved it; the
root-switch path does not. Two more confirmed gaps: the close handler defaults every
non-restaurant route to `'search'` (`use-results-presentation-close-actions-runtime.ts:141-144`),
and the sheet snap is never captured/restored (it resolves the destination scene's
*policy* initial snap, `app-route-sheet-host-authority-controller.ts:1000-1006`).

**Approach (chosen — contained "search-origin memory", NOT restructuring search off
the root model, which is too risky in this runtime):**
1. At the search `setRoot` commit, when it is **displacing a child route** (the
   outgoing stack top is a child scene like `pollCreation`/`pollDetail`), **capture
   `{ originRouteState, originSnap }`** into a memory slot before the reset.
2. On search **close/back-out**, instead of defaulting `outgoingSheetSceneKey` to
   `'search'`, **restore the captured origin route** (re-apply/re-push it) and
   **animate the sheet to the captured `originSnap`** instead of the policy snap.
3. Make it **scene-generic** (any child scene, current or future) — the §K
   foundation. Decide whether to fold the existing `restaurant` special-case
   (`terminalDismissSource:'profile'`) into this generic memory or leave it parallel.
4. **STATE PRESERVATION = REQUIRED (owner, 2026-06-22).** Returning to the origin
   must keep its in-progress state (typed poll draft, selections, scroll) — so the
   origin child scene must stay **mounted-but-inactive** across the search (kept in
   the scene-stack's `mountedSceneKeys`), NOT torn down and re-pushed fresh. App-wide:
   restaurant/profile/favorites also keep state across a search detour. This is the
   deeper, correct foundation. Implementation arc: (a) at the search `setRoot` commit
   displacing a child, stash `{originRouteEntry(params), originSnap}` in a
   search-return memory AND keep that scene in `mountedSceneKeys` while search is
   active; (b) on close, re-activate/re-push the preserved origin route (state intact)
   + animate to `originSnap`. Build incrementally, validate each step via Maestro +
   Metro logs.

**Levers found (2026-06-22, code-grounded) + the two-increment split:**
- The route state **already tracks `previousOverlayRoute`** — `setRootRouteState`
  stamps it with the displaced scene (`app-route-scene-switch-controller.ts:214-217`),
  so after a search from creation it holds the **full `pollCreation` entry incl.
  params**. `getPreviousRouteKey()` exposes the key. So the *navigation* restore does
  NOT need a new memory — reuse `previousOverlayRoute`.
- The return-to-search command is **`restoreDockedPolls()`**
  (`app-overlay-route-command-runtime.ts:115-124`, called from
  `use-search-foreground-back-exit-runtime.ts:67`) which hard-codes
  `setRoot('search')`. This is the redirect point.
- **Increment 1 — navigation restore (lighter, lower-risk):** when
  `previousOverlayRoute` is a child scene (role==='child'), make the search-close
  restore IT (re-push key+params) + animate to its captured snap, instead of
  `setRoot('search')`. Returns you to creation with params intact (React state may be
  fresh). Validate via `poll-search-return.yaml`.
- **Increment 2 — mounted-state preservation (deeper):** keep the origin child in the
  scene-stack `mountedSceneKeys` while search is active so re-activation preserves the
  draft. Touches `resolveMountedSceneKeys` — the same hard-fought scene-stack area as
  the `displayedSceneKey` fix, so do it as a separate, separately-validated step.
- **Risk to watch:** the dismiss transition (`armDismissMotion` / `results_dismissing`
  / `bottomBandOwner`) assumes a search/polls-root return; redirecting to a child may
  fight the dismiss animation — validate the motion, not just the destination.
- **Increments 1 & 2 are COUPLED (revised 2026-06-22), not independently shippable.**
  Restoring the origin on close means displaying its frame — but `setRoot('search')`
  already removed the child from `mountedSceneKeys` and unmounted it, so there is **no
  frame to restore** unless it was kept mounted first. So the nav-restore depends on
  the mount-preservation. §K is therefore a **single coupled core-nav change**:
  (keep origin mounted while search is active) + (restore route on close) + (restore
  snap) + (coordinate the dismiss transition so it animates back to the origin, not
  the search root). It touches BOTH the search dismiss transition AND the scene-stack
  mount logic (`resolveMountedSceneKeys`) — the same hard-fought area as the
  `displayedSceneKey` fix. A real, multi-cycle build; not a patch. Validated repro:
  `maestro/perf/flows/poll-search-return.yaml` (creation → low snap → search → close).

**Build attempt #1 — precise path nailed (2026-06-22, reverted to clean):**
- The "Close results" / search-close path is **`beginCloseSearch`**
  (`use-results-presentation-close-actions-runtime.ts`), which runs the **dismiss
  transition** — NOT `restoreDockedPolls` (that's only the back-gesture/editing-exit
  path; an edit there had no effect on the tested close). Confirmed via `[ATTRK]`.
- At `beginCloseSearch`, the route is already `search`, but **`previousOverlayRoute`
  still reliably holds the full `pollCreation` entry** (`[ATTRK] active=search
  prev=pollCreation outgoing=search`). So the origin IS recoverable here — the bug is
  that `outgoingSheetSceneKey` is hard-collapsed to `'search'` (only `restaurant` is
  special-cased), discarding the available origin.
- BUT `outgoing=pollCreation` alone won't restore it: the scene was unmounted at
  search-launch (no frame), and this path animates through the **dismiss transition**
  back to the lane. So the fix is the coordinated set, hooked at `beginCloseSearch` +
  the dismiss machinery: (1) keep the origin child mounted while search is active,
  (2) target `outgoingSheetSceneKey`/route at the origin child, (3) drive the dismiss
  motion back to the child at its captured snap. ~3 coordinated edits across the
  close-actions + sheet-host dismiss + scene-stack mount + a captured snap, each
  validated via the repro. The `previousOverlayRoute` lever covers the simple case;
  the explore-during-search case needs a stable search-origin memory (held until the
  search session fully closes), since `previousOverlayRoute` would drift as the user
  pushes restaurant/etc. on top.

**Build attempt #2 — BREAKTHROUGH + the remaining blocker pinned (2026-06-22,
reverted to clean baseline; NO regression left behind):**
- **State preservation is FREE.** Instrumented the scene-stack mounted set
  (`[ATTRMNT]`): **`pollCreation` stays in `mountedSceneKeys` the entire time** —
  through the search and after close (`resolveMountedSceneKeys` only adds, never
  prunes). So the origin scene's React state (the draft) is preserved automatically;
  §K needs **NO scene-stack/mount change**. This kills the earlier "coupled
  mount-preservation" worry.
- **The route restore WORKS.** Re-activating the still-mounted child via
  `routeSceneRuntime.routeSceneSwitchRuntime.requestOverlaySwitch({ targetSceneKey:
  originChild, routeAction:'push', routeParams: previousOverlayRoute.params,
  sheetTransitionKind:'openChild', sheetMotion:{kind:'snapTo', snap:'collapsed'} })`
  brought the docked creation sheet back (verified on-screen). NOTE:
  `routeOverlayCommandActions.pushRoute` does NOT exist (crashed) — the push lives on
  `routeSceneSwitchRuntime.requestOverlaySwitch`.
- **The ONE remaining blocker = search-session teardown vs route-restore ordering:**
  - Skip the search dismiss, just restore the child → creation returns BUT the search
    query ("tacos") lingers (session not torn down).
  - Run the dismiss + restore-after-settle (`InteractionManager.runAfterInteractions`)
    → query clears BUT lands on empty results, not creation (dismiss + deferred push
    conflict).
  - Dismiss + restore in the same batch → dismiss settles to polls AFTER the push,
    overriding it (lands on lane).
- **Recommended next step (well-scoped, smooth single-transition):** make the search
  **dismiss itself target the origin child** when `previousOverlayRoute` is a child —
  i.e. find where the dismiss settles the route to polls/search
  (`search-surface-runtime.ts` `completeDismissHandoff` ~800-826 + the route settle)
  and redirect that terminal target to the origin child + its captured snap. That
  yields clean teardown (the dismiss owns it) AND the smooth morph in one path, with
  no race. Snap: capture the sheet snap at search-launch (used `'collapsed'` as a
  stand-in; matched the docked-low origin). This is the focused remaining work; the
  mechanism + the restore call are both proven.

## Open questions to resolve at build time
- Poll-close notification: build push-on-close now vs **defer** (lean: defer push,
  ship in-app "results are in" state now — §5).
- Whether "poll of the week" pin earns its keep (§5 — post-launch validation).

## Resolved
- Type filter → `All · Polls · Discussions`; sheet stays named **Polls** (B.3, G).
- Discussion cards → lead with description/body preview, no bars (G).
- Trending model → heat + log-magnitude, half-life ~3d, window-free (B.4).
- App-poll cadence → Sunday publish, 7-day window, fixed cron (B.5).
- Self-schedule bounds → 3–14d, default 7; per-user cap 2/wk/market (B.6).
- Thread depth → cap **5** + flatten/@mention (D.4, F, G).
- Time filter → applies to **Top only**; New + Trending windowless (B.4, Round-2.5).
- Comment composer → persistent bottom chin → keyboard-tracked modal (D.1–2).
- White/full-bleed creation + detail sheets + merged header (B.2).
- Description storage → poll field + leaderboard-seed (H).
- Photo attach → DEFERRED to a dedicated app-wide media/Cloudinary session; no photo
  in this plan (H).
- Market picker → modal value-picker (H, I).
- Creation-sheet open → auto-top + focus + precise keyboard discipline (J).
- Poll-close notification → defer push, in-app state now (H/lean).

## Toggle strip build status (2026-06-23)
- ✅ Reusable `FrostedFilterStrip` + `SegmentedToggle` + `FilterChip` (in
  `apps/mobile/src/components/`) — faithful frost + masked-hole cutout + horizontal
  scroll, matching the search results strip. Polls feed sheet made frosted (dropped
  the opaque white content surface) so cutouts show through.
- ✅ ALL strip controls wired backend + frontend, validated on the sim:
  Live/Results split + Type (All/Polls/Discussions → `Poll.mode`) + Sort
  (New/Top/Trending) + Time (All time/This week → `launchedAt` cutoff). 10 controls →
  overflows + scrolls horizontally like the results strip. **§6 toggle strip COMPLETE.**
- ✅ Root-cause fix: FlashList `maintainVisibleContentPosition` disabled for the
  re-sortable feed (it anchored the old top row on a re-sort, scrolling the strip off).
- Note: Time currently applies to any sort (not Top-only); gate the chip's visibility
  to Top in the FE later if the windowless-New/Trending rule matters.

## §D nav-push transition — DONE + shareable (2026-06-23)
✅ Ported the search-submit "sheet grows while the bottom tab bar slides down + fades"
transition to the poll-detail open, and made it **shareable**:
- `apps/mobile/src/navigation/runtime/nav-hide-intent-store.ts` (NEW) — a generic
  intent registry. `useNavHideIntent(key, active)` in ANY scene pushes the nav down
  while active (self-cleans on unmount). `useHasNavHideIntent()` reads it.
- Wired: `use-search-foreground-bottom-nav-visual-runtime` ORs `useHasNavHideIntent()`
  into its master `shouldHideBottomNavForMotion` (additive — no change when no intent),
  so registered intents reuse the EXACT 360ms `Easing.out(Easing.cubic)` motion + the
  sheet-grow (nav translateY + opacity + body-exclusion-height clip mask).
- `PollDetailPanel` calls `useNavHideIntent('pollDetail', visible)`. Sim-validated:
  feed has nav → open thread pushes nav down + grows the sheet → close brings it back.
- ⏳ NEXT (the chin composer, §D part 2): now the nav is gone, move the composer to a
  bottom chin (mini-modal). Instagram clamp behavior: pinned to the bottom while the
  sheet is at/above middle (drag the sheet up → discussion grows behind the fixed chin),
  but moves WITH the sheet once dragging below middle toward dismiss. Needs the sheet
  position shared value to drive the chin's translateY clamp + keyboard tracking.
  (Poll-detail snaps are currently expanded-only, so for it the chin is pinned while
  expanded + moves while dismissing.)
  ATTEMPTED + reverted (composer back in the header, working): the chin in the scene
  `overlayComponent` renders into the hierarchy (testID is tappable) but is NOT VISIBLE
  at `bottom: 0` — after the nav-push sheet-grow, the overlay decor layer's bottom is
  clipped/positioned past the visible sheet (a green diagnostic at `bottom: 250` DID
  show in the earlier attempt, so the layer renders; `bottom: 0` does not). Resolve the
  overlay-layer geometry first (where is the page-bundle bottom relative to the grown
  sheet + screen?), likely by instrumenting `BottomSheetSceneStackPageFrame` /
  `sceneStackPageOverlayLayer` bounds — OR render the chin inside the sheet body frame
  rather than the full-screen overlay decor layer. Then add the sheet-position clamp.

## §D composer-to-bottom — first attempt notes (superseded by the nav-push above)
Tried moving the poll-detail composer from the list header to a pinned,
keyboard-tracked bottom bar (`useAnimatedKeyboard`) in the scene's `overlayComponent`.
Mechanics proven (the bar renders + the overlay surface publishes for the inline
poll-detail scene — confirmed by a diagnostic at `bottom: 250`). BLOCKER: the bottom
**nav silhouette / tab bar renders at `OVERLAY_NAV_SILHOUETTE_ZINDEX = 120`, outside
the sheet's stacking context** (the sheet's overlay layer is z50), so a bar pinned at
`bottom ≈ navHeight (88)` is covered by the tab bar and can't z-index over it. The
correct fix is the chat/Reddit pattern: **hide the bottom tab bar while the poll-detail
scene is focused** (a nav-silhouette-authority change — `navTranslateY`/`navOpacity`
in `NavSilhouetteHost` + `app-route-nav-silhouette-authority`), then pin the composer at
the very bottom (above the home indicator). Reverted to the working header composer for
now; pick this up with the nav-hide first.

## In-app modal migration — DONE (2026-06-23)
✅ Shareable styled modal replacing native `Alert.alert`:
- `apps/mobile/src/components/app-modal-store.ts` — imperative `showAppModal({title,
  message, actions})` (mirrors `Alert.alert` shape) + `useAppModalConfig`.
- `AppModalHost.tsx` — beautiful in-app modal (dimmed backdrop, white rounded card +
  soft shadow, centered title/message, `ZoomIn` spring entrance; buttons: primary
  accent pill / cancel ghost / destructive red; 1 button = full-width, 2 = row).
  Mounted once at the app root in `App.tsx`.
- ALL poll-flow `Alert.alert` calls migrated (PollCreationPanel incl. the dedup
  View-poll/Cancel, PollsPanel, PollCandidateBars, PollDetailPanel incl. the
  Delete-comment destructive). Sim-validated the 2-button destructive variant.
