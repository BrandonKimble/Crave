# Old Bottom-Sheet System — Exhaustive Migration Inventory (2026-07-26)

Audit of everything the old sheet reads/writes/renders/coordinates — THE
acceptance checklist for TrackSheet rungs 4-5. Paths relative to apps/mobile/src.

## 1. Header chrome exact composition
- Metrics (overlays/overlay-chrome-metrics.ts): OVERLAY_HORIZONTAL_PADDING 20;
  OVERLAY_CORNER_RADIUS 22; close button 32 (CONTROL_HEIGHT); grab handle
  40x3.25 r2, paddingTop 8; header paddingBottom 10; row marginTop 7; row
  spaced marginBottom 8; OVERLAY_TAB_HEADER_HEIGHT = 8+3.25+7+32+8+10 =
  68.25 (deliberately un-rounded).
- Strip band: TOGGLE_STRIP_BAND_HEIGHT = 32; STRIP_BAND_BOTTOM_SPACER_HEIGHT=8.
- computeSceneChromeHeight = 68.25 + (strip==='header' ? 40 : 0) → 108.25 for
  polls/lists. Never measured (measurement only falsifies, [CHROME-GEOMETRY]
  bark >0.5px). grabHandle:'hidden' does NOT change the box.
- Layout tree (OverlaySheetHeaderChrome.tsx:219-248): header bg #fff, padH 20,
  paddingBottom 10, overflow hidden; grab wrapper center paddingTop 8; handle
  40x3.25 r2 #cbd5e1 (transparent when cutout); Pressable onPressOut =
  promoteActiveSheet hitSlop 10; headerRow (space-between, marginTop 7,
  spaced marginBottom 8); titleSlot flex1 minWidth 0 marginRight 12; action
  group [Extras?][HeaderNavAction].
- HeaderNavAction: LucideX 20/2.5, two layers in 20x20 stack — red #e11d48
  opacity 1-p, black #000 opacity p; rotate 45*(1+p) deg (45°=plus, 90°=X);
  wrapper 32x32 r16; hitSlop 8; press on onPressOut. transitionProgress:
  navActionProgress SV, withTiming(target,{220ms, Easing.out(cubic)}), source
  frame.headerNavAction (chrome clock, committed on press-up). Press: close →
  runHeaderCloseAction → desire? closeSearchResultsSession : closeActiveRoute;
  create → runHeaderCreateAction → polls fallback pushRoute pollCreation.
- HEADER CUTOUT PLATE (OverlaySheetHeaderChrome.tsx:120-183): one SVG path
  evenodd fill #fff, width=windowWidth, maskPadding 2. Holes: close-circle
  r16 at x=windowWidth-20-16, y=headerRowY(18.25)+16+maskPadding; grab-handle
  rounded rect (40x3.25 r2) at x=(w-40)/2, y=8+maskPadding — punch through to
  the CONSTANT FROST below. grabHandleHidden keeps the layout slot (empty
  spacer) so close-hole Y math is unchanged; host passes no promote press.
- Strip row: below chrome inside measured wrapper, SceneStripLawContext
  provider, then 8px white spacer. Wrapper z60. Strip scene TRAILS title
  during holdOutgoingUntilSettle (swaps with body, not title). Title scene =
  frozenChromeSceneKey ?? presentedSceneKey ?? activeSceneKey.
- DIVIDER: 1px #f1f5f9 (themeColors.border), top = headerHeight-1, z61
  (one above header 60). Fade opacity = interpolate(scrollOffset,[0,3,14],
  [0,0.35,1],CLAMP). Driver: publishedScrollOffset (sceneScrollStateRegistry
  useSceneHeaderScrollOffset) ?? bodyScrollRuntime.scrollOffset; null = no
  divider. NOTE for track: scrollOffset ≡ max(0, τ−H).

## 2. Snap-point exactness
- calculateSnapPoints (sheetUtils.ts:65-88): expanded = searchBarTop>0 ?
  searchBarTop : insetTop (≥0); middle = min(max(exp+96, 0.4h), hidden−120);
  hidden = h+80; collapsed = max(navOff−hdr, middle+24), navOff = navBarOffset
  >0 ? : h, hdr = headerHeight>0 ? : 96.
- THE shared sheet inputs (use-app-route-shared-sheet-values-runtime.ts):
  screenHeight, searchBarTop, insetsTop, navBarTopForSnaps,
  OVERLAY_TAB_HEADER_HEIGHT (THE CONSTANT 68.25 — NEVER the strip-inflated
  computed height, else collapsed shifts 40px).
- searchBarTop = roundPx(searchContainerFrame.y + searchHeaderFrame.y) (seed
  runtime:100) → flows through route-host-overlay-geometry-state-controller.
- navBarTopForSnaps = resolveAppRouteNavSilhouetteSnapTop (seed:83).
- syncSnapPoints MUTATES THE SNAP OBJECT IN PLACE (:77-80) — subscribers hold
  the reference; reproduce or they go stale.
- SHEET_SPRING_CONFIG {damping:28, stiffness:320, mass:1, overshootClamping
  false}; executor may clamp overshoot per move. OVERLAY_TIMING {260/220}.
  SMALL_MOVEMENT_THRESHOLD 30. States [expanded,middle,collapsed,hidden].
- pollDetail standalone fallback: degenerate all-expanded snaps (host passes
  real snapPoints normally).

## 3. Search bar + shortcuts behind the scrim
- Z: chrome 10 < scrim 80 < sheet 90 < nav 120. Chrome bumps to 110/200 while
  suggestions visible; hidden = {opacity 0, zIndex -1}.
- Transition (use-app-route-scene-chrome-transition-runtime.ts):
  responseEndY = min(middleSnap, expandedSnap+220); progress = interpolate(
  sheetTranslateY,[expandedSnap,responseEndY],[0,1],CLAMP); scale =
  interpolate(progress,[0,1],[0.985,1]); translateY 0; opacity =
  overlayChromeVisibilityProgress. backdropDimProgress = 1−progress;
  backdropSheetTopY = sheetTranslateY.
- Shortcuts (use-search-foreground-shortcuts-visual-runtime.ts):
  transformOrigin 'center bottom'; transform locked to identity while
  suggestion panel active; chip bg rgba(255,255,255,α) with shadowOpacity
  scaled by α (SEARCH_SHORTCUT_SHADOW), elevation gated; visibility timing
  180ms.
- Scrim (SearchOverlayShellHost.tsx:112-170): max opacity 0.12; TWO pieces so
  dim never covers the sheet (protects cutouts): top strip height =
  max(0,sheetTopY) + two SVG inverse-corner wedges (r22, one scaleX -1)
  translateY = max(0,sheetTopY). Sheet shadow OVERLAY_SHEET_SHADOW_SHELL
  {#000, offset {0,3}, opacity 0.1, radius 7, elev 2}.

## 4. Frost/cutout layer stack (bottom→top)
map → sheet container (z90, transparent) → SearchRouteSheetFrameHost native
nav-exclusion mask + hard clip → shadowShell → sceneStackSurface (r22 top,
overflow hidden) → [0] ONE FrostedGlassBackground (constant opacity 1, never
animated) → [1] scene white plate → [2] body lane (top inset =
computeSceneChromeHeight) with SceneBodyFoundationSurface (white plate +
FrostCutout holes) + SceneBodyReadyGate skeletons → [50] overlay lane →
[60] PersistentSheetHeaderHost (cutout plate) → [61] divider host.
- FoundationSurface: gate bodySurface==='white'; holes content-coordinates
  via measureLayout vs lane root, rounded ints; rAF-collapsed remeasure sweep
  (lane onLayout, cutout commits/onLayout, container onContentSizeChange).
  0 holes → plain white fill (zero per-frame work); ≥1 → content-tall
  MaskedHoleOverlay, translateY = −clamp(scroll,0,plateH−frameH) −
  contentOverscroll (the rubber-band glue term).
- FrostCutout users: ProfilePanel stats (r16), HomePanel row band.
- Skeletons: SceneBodyReadyGate → SceneLoadingSurface(rowType, withStripHoles)
  minHeight 320; pollDetail passes insetX 0.

## 5. Coordination inventory
- NAV EXCLUSION (SearchRouteSheetFrameHost): native mask props —
  maskEnabled rules (persistent modes always; else navBarHeight−max(0,navTY)
  >0.25); navBodyBoundaryVisibleY = navBarTop; hiddenY = navBarTop +
  max(0,bottomNavHiddenTranslateY); HARD CLIP: sheet subtree height clamped
  to max(0,navBarTop) in persistent modes.
- Keyboard: transports declare persistTaps/dismissMode; no-overscroll is
  structural (moot on the track — the track OWNS overscroll).
- Map camera: per-transition only (motion/camera target registries); no
  per-frame sheetY coupling. listDetail opens middle so fitAll fits above.
- Origin scroll: useOriginSceneScrollPublication (lanes keyed by scene) /
  useMountedSceneScrollRestore (consume-once, apply + rAF re-apply).
- Acks: chromeAck in LAYOUT EFFECT even without descriptor; body paint ack +
  SYNTHETIC WARM ACK for previously-painted legs (else warm returns render
  empty). Residency setVisibleResidentScene from header host.
- Locks: edit lock (module makeMutable, token set) + snap lock (scene spec) →
  ONE gate: upperBound = locked ? expandedSnap : …; elastic bounds rubber-band
  downward drags (never hard-clamp).
- Dismiss: terminalDismiss → hide; docked dismissal → home seat 'hidden' →
  resurrect at 'collapsed'; freeze-mode keeps outgoing chrome until reveal.
- Publications: sheetTranslateY/sheetScrollOffset/sheetMomentum — subscriber
  table in audit (chrome transition, dismiss plane, results shell, visual
  stage, host authority, origin capture, results interaction).
- Motion table: specificity (to4+kind2+from1), ties illegal, mandate tier;
  openChild → mostly snapTo expanded (pollCreation instant; restaurant
  promoteAtLeast middle; listDetail snapTo middle); closeChild pollDetail →
  rememberedDetent fb middle, listDetail/settings → fb expanded;
  topLevelSwitch → postureSeat; catch-all preserveLiveY.
- Seats: HOME seed collapsed, CONTENT seed expanded, resurrect collapsed;
  carrier = docked scene (polls); GESTURE-WRITTEN ONLY.
- Haptics/sounds: none.

## 6. pollDetail specifics
- Publication: usePollDetailPanelSpec returns parts consumed via bundle
  authority → SearchMountedSceneBody (root results lane), AND the scene input
  lane writer publishes for the scene-stack host. Body: surfaceKind 'list',
  data=threadTree, estimatedItemSize 96, ListChromeComponent=composeChin.
- Header: registerPersistentHeaderDescriptor('pollDetail',{Title:'Poll',
  Extras: share button riding transitionProgress opacity}).
- MVCP EXPLICITLY DISABLED ({maintainVisibleContentPosition:{disabled:true}})
  — fought the anchor restore. Anchor restore: commentAnchorId → top-level
  node index, gated contentReady, one-shot burn on real resolve, scrollToIndex
  viewPosition 0.3, highlight 1.6s.
- Chin: ListChromeComponent, bottom = expandedSnapTop + insets.bottom, lift =
  −max(0, keyboard.height − insets.bottom) via useAnimatedKeyboard; reply-pin
  + keyboardDidHide unpin; contentBottomPadding = expandedSnapTop +
  insets.bottom + 64.
- Transports: listRef, MVCP disabled, contentContainer padH 20 + bottom pad,
  persistTaps 'handled', dismissMode 'on-drag'.
- Socket io /polls websocket; poll:update must not disturb anchor restore.

## Highest-risk exactness items (verbatim from audit)
1. 68.25 stays un-rounded; snap headerHeight arg = THE CONSTANT.
2. syncSnapPoints mutates in place — subscribers hold the reference.
3. Divider [0,3,14]→[0,0.35,1], #f1f5f9, 1px, top=headerHeight−1, z61.
4. Nav-action rotate 45*(1+p), 220ms out-cubic, driven by frame.headerNavAction.
5. Chrome response zone 220px from expanded (clamped by middle), scale
   0.985→1, origin center-bottom.
6. Scrim 0.12 max; strip+corners track sheetTopY; never under the sheet.
7. ONE frost, constant opacity, never animated.
8. FrostCutout holes content-coords with −contentOverscroll term.
9. chromeAck layout-effect always; synthetic warm paint ack preserved.
10. Seat memory gesture-written only; home seat carried by docked scene.

## THE NAV-FOLLOW CONTRACT (recovered 2026-07-28 — owner: "the mask doesn't
## follow the nav like it used to")

The old frame host did NOT clip the sheet at a fixed nav top. Its exclusion
boundary TRACKS the nav's live motion (SearchRouteSheetFrameHost.tsx:62-85):

  maskEnabled   = isPersistentNavBodyExclusionMode(mode)
                  || max(0, navBarHeight − max(0, navTranslateY)) > 0.25
  boundaryTY    = isPersistentNavBodyExclusionMode(mode) ? 0
                                                         : max(0, navTranslateY)
  visibleY      = navBarTop
  hiddenY       = navBarTop + max(0, bottomNavHiddenTranslateY)

MEANING: as the nav slides OUT (navTranslateY grows toward
bottomNavHiddenTranslateY), the sheet's bottom boundary slides down WITH it,
so the sheet GROWS into the space the nav vacates — the sheet and the nav are
one composition, never two independently-moving pieces. In persistent modes
(dockedScene/staticPersistent) the boundary is PINNED at 0 (the nav is always
there, so the sheet never claims that band).

MY BUG: TrackSheetRouteHost's hard clip is a STATIC height
(seed.navBarTopForSnaps). It cannot follow navTranslateY, so when the nav
slides out for a child page / results reveal, the vacated band belongs to
nobody and the map shows through. That is exactly the owner's report.

THE FIX (ideal shape, not a patch): the clip height must be a DERIVATION of
the same nav motion value the nav itself rides —
    clipHeight = navBarTop + (persistent ? 0 : max(0, navTranslateY))
driven on the UI thread from the shared navTranslateY (published via
routeHostVisualRuntime → route-sheet-chrome-motion-state-controller), so the
sheet's bottom edge and the nav are ONE motion, by construction. This is the
same law as the header: never a second, independently-timed writer for a
boundary that must stay glued to something else.
NEXT: also port the native silhouette-curve mask (the nav cutout shape) once
the boundary follows — the curve is the remaining visual half.

## DIVIDER FADE (stuck visible) — hypothesis to attribute next
Curve is correct ([0,3,14]→[0,0.35,1] on max(0, τ−H)). Stuck-visible means
τ−H ≥ 14 at rest, i.e. the resting offset sits INSIDE the list region. With
the chrome now living in content, verify the rest offset for an expanded seat
is exactly τ=H (spacer height) and that the seat maps to H — a chrome-height
double-count in the spacer would park the sheet H+chromeHeight and pin the
divider on. Probe: log τ at rest per scene before changing anything.

## NAV BOUNDARY + CURVE — EXACT RECIPE (recovered 2026-07-28)

Do NOT hand-roll either. Production already implements BOTH in one native view;
the track host must reproduce the same wiring:

SearchRouteSheetFrameHost.tsx → SearchRouteSheetNativeMaskHost (memo) takes a
`sheetMaskRuntime` of SharedValues + statics:
  { exclusionModeValue, navTranslateY, navBarHeight, navBarTop,
    bottomNavHiddenTranslateY }
and derives, ON THE UI THREAD:
  nativeMaskAnimatedProps = useAnimatedProps(() => {
    const modeValue = exclusionModeValue.value;
    const boundaryTranslateY = resolveNativeSheetMaskBoundaryTranslateY({
      modeValue, navTranslateY: navTranslateY.value });      // persistent→0
    const maskEnabled = shouldEnableSheetMaskForNavSilhouette({
      modeValue, navBarHeight, navTranslateY: boundaryTranslateY });
    return { maskEnabled, navBodyBoundaryTranslateY: boundaryTranslateY };
  })
  hardClipAnimatedStyle = useAnimatedStyle(...)   // the FOLLOWING clip height
plus static props: navBodyBoundaryVisibleY = navBarTop,
navBodyBoundaryHiddenY = navBarTop + max(0, bottomNavHiddenTranslateY),
maskOriginY = 0, style = {width: viewportWidth, height: viewportHeight}.

⇒ THE CURVE AND THE FOLLOW ARE THE SAME MECHANISM. My earlier attempt "blanked
the surface" because I passed STATIC maskEnabled/boundary props with no
animatedProps — the native view needs the animated pair to resolve its
silhouette. Reusing it correctly fixes the see-through band AND restores the
nav cutout curve in one move; the static hard clip then gets deleted.

THE ONE UNKNOWN LEFT: where the track host reads those SharedValues.
navTranslateY + navSilhouetteSheetExclusionModeValue live on
RouteSheetChromeMotionSnapshot (route-sheet-chrome-motion-state-controller.ts),
sourced from routeHostVisualRuntime. Find its authority accessor on
AppRouteSceneRuntime (candidate: routeSheetVisualAuthority /
syncRouteHostVisualRuntime) and subscribe with useSyncExternalStore, exactly as
the old surface host does. DO NOT substitute a JS-thread copy — the values must
be the SAME SharedValues the nav itself rides, or the boundary will lag the nav
by a frame (the wiggle class of bug).
