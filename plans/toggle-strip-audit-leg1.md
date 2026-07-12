# Toggle-strip + edit-mode — LEG 1 audit ledger (2026-07-12)

> Working ledger for the domain-owner agent. Orchestrator may read mid-flight.
> Charter: [toggle-strip-and-edit-charter.md](toggle-strip-and-edit-charter.md).
> Status: COMPLETE (read-only audit + design verdict; no code changed).

## Executive verdict

Applying the law: **the tree is NOT the implementation we would build from scratch.**
The controls and the pure interaction engine ARE (keep both, verbatim). But the
charter-ratified "one placement-agnostic strip engine + two mounts" does not exist:
what ships is a half-engine shell (cutouts yes; bleed/backdrop/timing/warm-restore/
action-row no) plus ONE hand-built search-private mount that meets the bar and N
per-page improvisations that don't. The single biggest mechanism finding: the
2026-07-11 foundation WHITE PLATE standard (owner's own) silently destroyed strip
fidelity on every non-search page — the strips' "frost" now blurs an opaque white
plate, which is why polls/favorites read as white slabs while results still reads
frosted (search is exempt from the plate). The favorites bars additionally come from a
padding-clipped strip viewport. The polls snap-in comes from gating the strip's
existence on a post-arrival physical snap signal. None of these want patches; the
header-extension mount + a strip engine that OWNS bleed/backdrop dissolve the class.
Recommended: rebuild as D3.2/D4.2 across ~4 legs (D7). No edit-mode work until gaps
D6.3 items 1-5 exist.

## Deliverable 1 — The reference (results-sheet strip), mechanism by mechanism

### 1.1 The component stack (uncommitted tree)

- `apps/mobile/src/components/FrostedFilterStrip.tsx` — the shared shell: frost + white
  masked plate + horizontal ScrollView + auto-derived cutouts.
- `apps/mobile/src/components/MaskedHoleOverlay.tsx` — SVG rect + black-rect mask holes.
- `apps/mobile/src/components/FrostedGlassBackground.tsx` — AppBlurView + tint layer,
  absolute-fills the band.
- `apps/mobile/src/components/SegmentedToggle.tsx` — sliding-pill N-segment toggle.
- `apps/mobile/src/components/FilterChip.tsx` / `SelectorChip.tsx` — plain-Pressable chips.
- `apps/mobile/src/screens/Search/components/SearchFilters.tsx` — the reference consumer:
  pure declaration of controls + warm-restore cache join.

### 1.2 Frost cutouts: derive from child layouts, move with the strip

- Every child passed to `FrostedFilterStrip` is auto-wrapped in a `StripHoleSlot`
  (FrostedFilterStrip.tsx:180-192) which measures itself via `onLayout` and registers a
  hole keyed by the child's own React key (`strip-slot-<key>`), never array position
  (comment at :174-179 — conditional children like the "N similar" chip would otherwise
  shift later siblings' hole identity).
- Hole registration is a context (`FrostedFilterStripContext`, :46) into a `holeMap`
  state with 0.5px-epsilon dedupe (`holesEqual`, :48-53). Cutouts are IMPOSSIBLE to omit:
  rendering a child through the strip is what creates the hole (charter T4 satisfied here).
- The holes are punched in a white `MaskedHoleOverlay` that renders INSIDE the
  ScrollView's content (FrostedFilterStrip.tsx:227-242), absolutely positioned under the
  controls row — so the mask scrolls WITH the controls and the windows stay pinned to
  them. This is the load-bearing trick for "cutouts move with the strip."

### 1.3 Edge-to-edge bleed: why results has NO white bars

- The band (`styles.wrapper` → `paddedWrapper` → ScrollView) is `width: '100%'` of its
  parent, and the parent (`styles.resultsListHeader`, screens/Search/styles.ts:656-662)
  has `paddingHorizontal: 0` — the strip's scroll viewport IS the full sheet width.
- Inside the scroll content the white mask plate is sized
  `maskWidth = max(viewportWidth, maxHoleExtent + overscrollMargin*2)` with
  `overscrollMargin = max(contentInset, viewportWidth)` and positioned
  `left: -overscrollMargin` (FrostedFilterStrip.tsx:144-163, 227-241). The ONLY white in
  the band is this plate; it extends a full viewport width past both ends of the content.
- Leading alignment comes from `contentInset` (contentContainer `paddingHorizontal`, :215),
  which is SCROLLABLE padding — not a fixed gutter. So controls slide right up to and off
  the physical screen edge; there is no fixed white pillar for them to slide under.
- Net: "no white bars" = (full-width viewport) + (white lives only on the scrolling mask
  plate) + (alignment via scrollable inset, not container padding).

### 1.4 Visually infinite overscroll + physics

- ScrollView with `horizontal`, `alwaysBounceHorizontal`, `directionalLockEnabled`
  (FrostedFilterStrip.tsx:209-217) — native iOS rubber-band. `alwaysBounce` gives the
  rubber-band even when content fits the viewport.
- The mask plate's ±viewport-width overhang guarantees rubber-banding never reveals a
  frost edge — the white runs off both ends farther than the bounce can travel.
- Press-up gesture: `SegmentedToggle` uses `Gesture.Tap().maxDuration(1e9)
.shouldCancelWhenOutside(false)` (SegmentedToggle.tsx:278-283) — commit on finger-up,
  unbounded hold, slop-cancelable. 2-segment control flips on ANY press-up (:291-295);
  N-segment resolves pressed segment, nearest-center for gap presses (:296-314). Chips
  are plain `Pressable onPress` (FilterChip.tsx:53) — release-fired, no duration ceiling.
- Pill motion: absolutely-positioned highlight, translateX+width interpolated over
  measured segment geometry, distance-aware linear timing 34-150ms
  (SegmentedToggle.tsx:29-45, 231-243).

### 1.5 Warm restore — layout, NOT scroll position (discovered nuance)

- `SearchFiltersLayoutCache` = `{viewportWidth, rowHeight, holeMap, segmentLayouts}`
  (SearchFilters.tsx:32-40). Strip emits measured layout via `onMeasuredLayoutChange`;
  SegmentedToggle emits `onSegmentLayoutsChange`; SearchFilters joins them
  (:202-219) and hands the cache to `searchState.handleSearchFiltersLayoutCache`
  (use-search-root-search-scene-filters-header-runtime.ts:70-73), seeded back through
  `initialHoleLayout` / `initialSegmentLayouts` so a REMOUNTED strip paints holes + pill
  correctly on its first frame (SegmentedToggle.tsx:152-163 seeds shared values pre-layout).
- **NUANCE THE CHARTER OVERSTATES**: nothing caches the horizontal SCROLL OFFSET. The
  warm restore is layout-warm (no measure-flash), not scroll-warm. On the tab flip the
  strip instance remounts (see 1.6) and its ScrollView starts at x=0. On results this is
  invisible in practice only because the strip usually sits at x=0. If "warm restore of
  scroll position" is a hard requirement (it is, per charter Part 1.4), the engine must
  add a scrollX seed — this is a REAL gap in the reference itself.

### 1.6 Cross-list continuity (restaurant⇄dish): the exact mechanism

- The strip element is built ONCE per props-change in
  `use-search-root-search-scene-list-header-runtime.tsx:20-28` (SearchFilters wrapped in
  `styles.resultsListHeader` + an 8px white `resultsListHeaderBottomStrip`).
- It flows through the chrome-freeze snapshot store into
  `use-search-route-search-scene-model-owner.ts:224-226` as the list body spec's
  `ListHeaderComponent`, alongside a `secondaryList` (listKey 'results-dishes'; primary
  'results-restaurants').
- `SearchMountedSceneBody.tsx` co-mounts BOTH FlashLists permanently (comment :265-268);
  the tab toggle is a visibility flip (opacity/pointerEvents), never a list remount. The
  SAME header element is given to whichever list currently owns scroll and null'd on the
  other: `ListHeaderComponent={primaryOwnsScroll ? primaryListHeaderComponent : null}`
  (:649) / `secondaryOwnsScroll ? ... : null` (:692); both sides read the same element
  (:618-625).
- So the strip is **ONE element description but TWO sequential React instances**: on tab
  flip it unmounts from the outgoing list and mounts fresh in the incoming one. The
  remount is invisible because (a) the warm-restore cache paints holes+pill correctly on
  the first frame, and (b) the flip commits under the unified fade choreography.
  Explicit warning at SearchMountedSceneBody.tsx:631-635: do NOT permanent-mount the
  header on both lists — the chrome-freeze store can hand a permanently-mounted instance
  a STALE element (measured: pill stuck on old tab).
- Continuity is therefore an emergent property of warm-restore + fade cover, not a truly
  persistent instance. It works, but "one continuous thing" is simulated per-flip; scroll
  offset (1.5) is the observable seam.

### 1.7 Mounted from first paint / never unmounted

- "The strip is CHROME, not content" — it renders for the scene's whole life; the only
  hide is the initial-load skeleton page
  (use-search-root-search-scene-surface-render-header-source-runtime.tsx:25-38, comment
  dated 2026-07-06 re: empty commits unmounting the strip and trapping the user).
- Live chip state bypasses the chrome freeze: the strip reads display state directly from
  the runtime bus (`useSearchRuntimeBusSelector`, SearchFilters.tsx:127-169) so chips flip
  color at press time even while the rendered element is a frozen snapshot.

## Deliverable 2 — Defect attribution (white bars, late mount, placement coupling)

### 2.1 THE STRUCTURAL SPLIT THAT EXPLAINS EVERYTHING: the foundation white plate

On 2026-07-11 (one day before the charter) the page-foundation standard added THE
FOUNDATION WHITE LAYER: every non-search sheet scene's body renders on an opaque white
plate over the shared frost (`scene-foundation-spec.ts:47-55`, `bodySurface: 'white'`
required literal for every scene; rendered by `SceneBodyFoundationSurface` in
`useBottomSheetSceneStackBodyContentRuntime.tsx:356-374`). **Search is explicitly
excluded** ("owns its canonical composition", scene-foundation-spec.ts:12,
SceneBodyFoundationSurface.tsx:30-31).

Consequences for the strips:

- The polls + bookmarks strips render their own `FrostedGlassBackground`, which blurs
  whatever is behind them — now the OPAQUE WHITE PLATE, not the map. The masked cutout
  windows reveal blurred-white ≈ flat white. The frost signature (see-through to the
  map) is dead on both surfaces; the whole band reads as a white slab with controls
  sliding over/under undifferentiated white. The results strip still reads frosted
  ONLY because search bypasses the foundation layer.
- Nothing punches the strip band out of the plate: `FrostCutout` (the sanctioned hole
  mechanism, SceneBodyFoundationSurface.tsx:294-325) has exactly ONE consumer in the
  tree — ProfilePanel's stats row (ProfilePanel.tsx:115). Neither strip registers one.
- PollsPanel's transport comment (PollsPanel.tsx:666-668) still claims "the
  mounted-scene FrostedGlassBackground shows through … the strip's masked-hole cutouts
  reveal the blur" — STALE, falsified by the foundation plate that landed after it.
- The foundation spec's `strip: 'none' | 'frosted-strip'` field has **ZERO consumers**
  (grep: no reads outside scene-foundation-spec.ts). It is a dead declaration — a law
  that cannot show RED. Bookmarks is even declared `strip: 'none'`
  (scene-foundation-spec.ts:70) while the panel renders two strips.

### 2.2 Favorites (bookmarks) white edge bars — full mechanism

- The bookmarks body transport insets ALL content:
  `BOOKMARKS_BODY_TRANSPORT.contentContainerStyle = { paddingHorizontal: OVERLAY_HORIZONTAL_PADDING(=20), … }`
  (app-route-static-scene-descriptor-controller.ts:42-54).
- `BookmarksToggleStrip` renders inside that padded box with NO bleed: the morph
  wrapper `stripViewport` is `{flex:1, overflow:'hidden'}` (BookmarksPanel.tsx:1323-1326)
  and each morph row's FrostedFilterStrip gets `stripShell: {flex:1}` (:1331-1333) —
  the strip viewport is capped at screen−40. No negative margin anywhere.
- Left/right of the clipped band: the foundation white plate (2.1) shows as fixed
  white gutters. Scrolling the strip slides controls under the clip edge → "white
  edge bars the controls slide under". This is the charter Part 1.2 defect verbatim:
  a horizontal content bound + padding capping the strip.
- Compounding: the band's own frost blurs the white plate (2.1), so even inside the
  band the cutouts are invisible.

### 2.3 Polls white bars / fidelity — mechanism

- The polls strip DOES attempt the bleed: `feedStrip: { marginHorizontal: -OVERLAY_HORIZONTAL_PADDING }`
  (PollsPanel.tsx:683-685, present since 2026-06-27) cancels the list's
  `paddingHorizontal: 20` (PollsPanel.tsx:656). FlashList 2.0.2 passes
  `contentContainerStyle` straight to the RN ScrollView and hosts the header in an
  unstyled stretch View (`useSecondaryProps.tsx:61-70`), so Yoga stretches the strip
  to full screen width. Geometrically the band is edge-to-edge.
- The white read is 2.1: opaque plate below + white mask above = a solid white band
  with invisible windows; controls visibly slide against flat white. (If the owner's
  "bars" on polls are literal inset pillars rather than the white-wash, the only
  candidate layer is the foundation plate — the strip band itself has no inset bound.
  Either way the fix is identical: mount the strip OVER honest frost with the plate
  cut away underneath — which the header mount gives structurally, see D4.)

### 2.4 Polls strip snaps in after present — mechanism

- The strip exists only while `isExpandedSurface` (`resolvedSnap === 'middle' || 'expanded'`):
  `ListHeaderComponent` returns null otherwise (PollsPanel.tsx:500-503).
- `resolvedSnap = currentSnap ?? initialSnap` (polls-panel-feed-runtime.ts:150) and
  `currentSnap` = the PHYSICAL sheet snap from command state
  (useSearchRoutePollsSceneStateRuntime.ts:67-70) — a post-arrival signal. The strip
  is therefore derived from "the sheet got there", not "the scene is presented". On
  presentation the list paints first (strip null), then the snap state lands and the
  header inserts — the observed snap-in.
- No warm-restore seeds exist for the polls strip (toggle-strip-primitive.md:141
  admits this), so its first mount also measure-flashes: holes/mask render only after
  child onLayout rounds (FrostedFilterStrip.tsx:227 requires `maskedHoles.length > 0`).
- The polls skeleton cannot cover this: `SCENE_FOUNDATION_SPECS.polls.skeleton` paints
  restaurant rows; the `strip: 'frosted-strip'` declaration that SHOULD reserve the
  band is consumed by nothing (2.1). Bookmarks has the same class of problem at
  activation: the whole `BookmarksDataSurface` (strip included) is `display:none`
  until `hasActivatedExpandedContent` (BookmarksPanel.tsx:1239-1247), a data-lane
  admission signal (app-route-scene-stack-runtime.ts:2095-2103) that can lag by the
  admission delay; the `BookmarksTransitionShell` skeleton it shows instead has no
  strip band either (tile skeleton, `strip: 'none'`).

### 2.5 What structurally couples the strips to their current placement

- Both strips are `ListHeaderComponent`s of their scene's FlashList — their existence,
  paint timing, and geometry are properties of the LIST (scroll ownership, snap
  gating, content insets), not of the page. That is the placement coupling: the strip
  can only exist when/where the list body exists.
- The results strip escapes the timing half only because search built a private
  warmup+freeze apparatus around it (ledger 1.6-1.7): offscreen pre-measure
  (SearchOverlayChromeHost.tsx:186-213), layout-cache warm restore, chrome-freeze
  store, dual co-mounted lists. None of that is reusable by other scenes today — it
  lives in search-root runtime files, keyed to the search bus.

### 1.8 Choreography wiring (completes the reference picture)

- World class (search): `use-results-presentation-toggle-coordinator.ts` — engine with
  `isAtVisualFloor: isSearchPresentationAtFloor` (:69), floor-ack subscription feeding
  `engine.notifyVisualFloor()` (:100-103), every commit `awaitVisualFloor: true` (:117).
- Content class (polls): `polls-feed-runtime-controller.ts:368-387` — bare engine
  (`createToggleInteractionEngine<'feed_query'>({})`), no sinks, no floor; commit = quiet
  `skipSpinner` in-place refresh. Charter Q6 answer: NOTHING content-only rides the map
  machinery — polls is clean. But there is also NO choreography at all: old rows sit
  until the response lands and swap in place; bookmarks/listDetail toggles are raw
  useState with no engine, no debounce, no seam.

## Deliverable 3 — Ideal-shape verdict on the primitive stack

### 3.1 Verdict by layer

- **Controls (SegmentedToggle / FilterChip / SelectorChip / OptionSelectorSheet /
  OptionSelectorHost / option-selector-store)** — IDEAL SHAPE, keep as-is. Placement-
  agnostic, press-up-correct, warm-restorable pill geometry, root-hosted dropdown with
  zero mount concerns. (Owner already blessed this; audit concurs.)
- **Interaction engine (toggle-interaction-engine.ts)** — IDEAL SHAPE, keep. Pure,
  seq-guarded, both consequence classes native (`awaitVisualFloor` optional :55,
  quiet-window-only default), sinks optional, RED-provable fallback (LOUD
  `visual_floor_ack_timeout` :266). What is NOT ideal is its ADOPTION: search reaches it
  through a ~10-file adapter chain; polls hand-wires its own instance; bookmarks/
  listDetail don't use it at all. No `{consequence}` declaration exists anywhere.
- **FrostedFilterStrip** — the cutout/scroll CORE is right (auto-derived holes,
  scrolling mask plate, overscroll margin), but judged by the law it is NOT the strip
  engine the charter demands. It is a shell that renders inside whatever box the
  consumer gives it, with every fidelity-bar property EXCEPT cutouts left to the
  consumer:
  1. **Bleed is consumer folklore.** Full-bleed happens only if the mount knows the
     negative-margin trick (polls) or the host has no padding (search). Bookmarks
     didn't know → bars. An engine whose fidelity property #2 is opt-in per page is
     the wrong shape.
  2. **Backdrop truth is unowned.** The strip blurs whatever is behind it; nothing
     guarantees that is frost. The foundation white plate (D2.1) silently turned every
     non-search strip's cutouts into white-on-white. Two masking systems
     (FrostedFilterStrip's plate, SceneBodyFoundationSurface's plate) share no
     contract. "Cutouts reveal the frosted map, impossible to omit" is today
     omitted-by-default on every plated scene.
  3. **No scroll-offset warm restore** (layout only — 1.5), so remounts reset scrollX.
  4. **No action-row slot** — the edit morph is hand-rolled around it, twice.
  5. **Mount timing is not its concern** — "present from first paint" is unenforceable;
     each consumer gates the strip on its own list/data/snap signals (D2.4).
  6. Warm-restore caching is a bespoke SearchFilters+searchStore join, not a strip
     facility other pages can use.
- **The reference apparatus is search-private.** The things that make the results strip
  meet the bar — offscreen warmup pre-measure (SearchOverlayChromeHost.tsx:186-213),
  chrome-freeze element store, layout-cache seat in searchStore, strip-follows-scroll-
  owner across dual lists — all live in search-root runtime files keyed to the search
  bus. No other page can inherit them. The bar is met once, by hand.

**Net: the engine/mount split the charter ratified DOES NOT EXIST in the tree.** What
exists is (good controls) + (good interaction core) + (a half-engine shell) + (one
hand-built reference mount). Placement is entangled with each page's list plumbing.

### 3.2 Target mental model (design from scratch, then compare)

ONE `ToggleStrip` engine, owning by construction:

- **Band geometry**: the engine renders its own full-width band; horizontal alignment
  is SCROLLABLE contentInset only; a mount cannot cap it with padding (the band styles
  are not overridable into a clipped box — `style` prop narrows to non-geometric knobs).
- **Backdrop contract**: a mount declares its backdrop — `'chrome-frost'` (header
  region, above the body plate) or `'plated-body'` (in-list on a foundation-plated
  scene). In `'plated-body'` the engine auto-registers a band-height `FrostCutout` so
  its blur always sees real frost. Cutouts-to-white becomes unrepresentable.
- **Physics + warm restore**: scroll, rubber-band, press-up (already in controls), PLUS
  a per-surface layout+scrollX cache slot the engine owns (seed on mount, emit on
  change) — SearchFilters' bespoke join generalizes and moves in.
- **Action-row slot**: `{actionRow, actionProgress}` per favorites-edit-mode-ideal.md
  decision 1 — action row mounted only while `actionProgress > 0`, NOT scrollable,
  toggle row exits from its live scroll position, per-row holes.
- **Consequence declaration**: a page declares
  `{controls, consequence: 'world' | 'content', floorSignal?}`; the strip package wires
  the engine (world → floor-gated commit; content → the D5 seam). Pages never touch
  the engine directly.
- **Mount adapters (thin)**: `in-list` (results keeps it — hosts the band as
  ListHeaderComponent + the layout-cache seat) and `header-extension` (D4). Flipping a
  surface's placement = editing its declaration, nothing else.

Cutover deletions (the non-ideal that must die, not be guarded):

- BookmarksToggleStrip's hand-rolled morph viewport + permanently-mounted edit strip
  (BookmarksPanel.tsx:254-421) and ListDetailToggleStrip + SortChip wholesale
  (ListDetailPanel.tsx:364-579).
- The polls negative-margin folklore (`feedStrip`, PollsPanel.tsx:683-685) and the
  stale frost comment (:666-668); dead `styles.listHeader` (:694-696).
- The dead foundation `strip:` field — replaced by a load-bearing strip declaration the
  header host actually consumes (or asserts on), so it can show RED.
- The fossil `scrollHeaderComponent` lanes (bodyDefaults/hasScrollHeaderOverlay paths in
  BottomSheetSceneStackListBodySurface.tsx:171-173,302-341, SearchMountedSceneBody
  equivalents, `scrollHeaderForRender: null` at
  use-search-root-route-search-scene-render-runtime.ts:40) — dead since 2026-04-09
  (see D4 archaeology) unless the header mount consciously reuses them (it should not —
  it mounts in the persistent header, not the per-leg body).

## Deliverable 4 — Header-mount design (+ git archaeology)

### 4.1 Archaeology: the strip-attached-to-header era, dated and explained

- **Dec 2025** (b211db8f): strip = plain in-list `ListHeaderComponent` of the results
  FlashList.
- **2026-02-25** (2839c07a "new toggle behavior"): the strip moved OUT of the list into
  a sheet-chrome lane: `scrollHeaderComponent`, rendered directly under the sheet's
  fixed header and translated by `-relativeScrollY` via `useAnimatedStyle`
  (BottomSheetWithFlashList.tsx@2839c07a:1497-1531), with the list content padded down
  by its height. It was chrome SIMULATING content — it existed so the strip would
  survive list teardown/dual-list swaps without flashing (the warm-restore layout cache
  was born in the same commit). The old panel spec fed it at
  use-search-results-panel-spec.tsx@2839c07a:939,1118 (`ListHeaderComponent: null`,
  `scrollHeaderComponent: scrollHeaderForRender`).
- **2026-04-09** (e11f6202 "UI thread and JS split"): the era ended — the runtime
  rearchitecture put the strip back in-list, and `scrollHeaderForRender: null` has been
  hardcoded since (use-search-root-route-search-scene-render-runtime.ts:40). Why it
  died: the overlay strip's scroll ride was a JS-frame-synced mirror of the real scroll
  (shear under load — exactly the visual class the UI/JS split existed to kill), while
  in-list is geometry-guaranteed. The lane's plumbing survives as fossils (3.2).
- **Lesson for the new design**: the era failed because it made chrome pretend to be
  scrolling content. The charter's header-extension mount is the OPPOSITE: genuinely
  sticky chrome that never rides scroll — the era's failure mode does not apply. The
  only scroll-coupled element is the divider fade, already solved on the UI thread
  (`useHeaderScrollDividerOpacityStyle`, BottomSheetSceneStackPageFrame.tsx:58-64).

### 4.2 The header-extension mount on today's primitives

Today's header stack is ready to receive this:

- ONE hoisted persistent header (`PersistentSheetHeaderHost` → `OverlaySheetHeaderChrome`,
  white SVG cutout plate + grab handle + close cutout) that never unmounts; per-scene
  content slots (`Title`, `Action`) swap from a module-scope registry in the same
  committed frame as press-up (PersistentSheetHeaderHost.tsx:11-28).
- The measured chrome height fans out through `handleChromeLayout` (:52-58); the ONE
  divider renders at `headerHeight − 1` with the canonical scroll fade
  (BottomSheetSceneStackPageFrame.tsx:46-85); the page frame reserves the body lane at
  `top = headerHeight` (:112-119). The header region sits over the sheet's hoisted
  frost plate — real frost, above the body white plate (zIndex 60).

Design:

1. **Strip slot in the persistent chrome.** The persistent-header descriptor (or a
   parallel strip registry keyed the same way) gains a `Strip` slot; the host renders
   the scene's ToggleStrip band as a second row inside the persistent overlay, below
   the title row. Scene-foundation-spec's `strip` field becomes load-bearing:
   `'header'` ⇒ the host asserts a Strip slot exists (dev bark, same pattern as the
   missing-descriptor contract at PersistentSheetHeaderHost.tsx:59-84). A declared-but-
   missing strip is RED, not silent.
2. **First paint by construction.** The header host swaps content on presented-key
   change in the same frame; a strip in that chrome exists whenever the page exists.
   No snap gating, no data-lane gating, no warmup host needed. Late-resolving chip
   VALUES hydrate under the already-painted chrome (title-seed pattern) — satisfying
   "resolves under the skeleton, never after reveal".
3. **Divider below the strip, free.** The strip row is inside the measured chrome box →
   `headerHeight` includes it → the existing divider (top = headerHeight − 1) and the
   reserved body lane both land BELOW the strip. The "single boundary" law
   (BottomSheetSceneStackPageFrame.tsx:46-51) is preserved, just lower.
4. **Frost honesty, free.** The band renders over the header region's real frost
   (above the body plate by z-order and above the body lane by geometry). Its own
   masked white plate joins the header plate at a flush seam — the strip's cutouts
   reveal the map again. `backdrop: 'chrome-frost'` — no FrostCutout needed.
5. **Content scrolls under the band**; the divider fade signals it; the strip never
   translates with scroll — nothing to sync.
6. **Migration**: polls feed + favorites home declare `strip: 'header'` with their
   controls; results declares in-list. Deleting: polls' ListHeaderComponent strip +
   snap gate, bookmarks' segmentRow strip block. The sheet snap math must absorb the
   taller chrome (headerHeight is already a measured, parameterized value everywhere it
   is consumed — the risk is per-scene constants that assumed title-only height; sweep
   `OVERLAY_TAB_HEADER_HEIGHT` consumers in leg 3).

## Deliverable 5 — Content-only choreography foundation

Current truth: polls already rides the pure engine (no map machinery — 1.8) but has no
choreography (rows swap whenever the fetch lands); bookmarks/listDetail re-slice
synchronously via useState with no seam at all.

v0 design (deliberately simple, per charter Part 3):

- `useContentToggle(surface, declaration)` in `src/toggles/` — a thin seam over the
  SAME pure engine, never touching presentation floors/staged transactions/covers:
  - press-up → `begin(kind)` → the strip's optimistic state flips (already true) AND
    the surface's old cards EXIT NOW (v0 = snap-out: rows cleared/hidden; the strip is
    chrome and stays).
  - quiet window elapses → runner executes (fetch or synchronous re-slice).
  - runner resolution = the content-ready edge → new cards snap in (v0); the same edge
    is where a quick fade-in lands later if the measured gap warrants it (Spotify
    snap-out → quick-fade-in is the owner's reference feel).
  - NO skeleton between slices — the law. The gap is bare white under the strip.
- Client-side instant slices (bookmarks Restaurants/Dishes, Recent/Custom) use the same
  seam with `settleMs: 0` — exit/enter collapse into one frame; uniform API.
- Instrumentation from day one (methodology: composite, RED-provable): the engine's
  'started' lifecycle → runner-resolution timestamps give the press-up→ready
  distribution; log it in dev so the "what transition does the data justify" decision
  (charter: observe, then choose) is measured, not vibes. The pre-fetch-permutations
  optimization has an obvious seat: a `prefetch(kind)` hook on the same declaration.
- The declarative seam: the ToggleStrip package reads `consequence` from the strip
  declaration and wires 'world' → the surface's floor-gated commit (search adapter
  pattern), 'content' → this seam. A page declares; it never wires.

## Deliverable 6 — Edit-mode readiness

### 6.1 Reconciling favorites-edit-mode-ideal.md's ground truth against the tree

- STALE: "morph is hand-rolled twice, outside FrostedFilterStrip, no frost/cutouts" —
  Bookmarks is now HALF-converted (session 2): each morph row IS a FrostedFilterStrip
  (BookmarksPanel.tsx:304, :360) but they sit inside the SAME hand-rolled translateX
  morph viewport (:270-295). ListDetail remains fully hand-rolled (ListDetailPanel.tsx:
  364-579, SortChip + duplicate morph).
- STALE: "Edit chip compresses siblings via flex:1 + LinearTransition" — the flex
  wrappers are gone in Bookmarks; the chip pushes (strip scrolls). ListDetail still has
  per-chip LinearTransition rows but no flex squeeze either.
- STILL TRUE: the content-swap defect lives — `BookmarksEditList`/ReorderableRows
  (BookmarksPanel.tsx:432-497, wired :1005-1026), ListDetail edit rows (L1223),
  `EDIT_ROW_HEIGHT` (:95).

### 6.2 Verdict on the tree's favorites morph vs the action-row-slot design

It is a TRANSITIONAL HYBRID that must FOLD INTO the primitive, not evolve in place:

1. The edit row is permanently mounted, pointerEvents-gated (:356-359) — the ideal is
   unmounted-until-edit, unreachable by construction.
2. The edit row lives inside a FrostedFilterStrip, i.e. it is SCROLLABLE and
   rubber-bands — the ideal action row is static chrome. Worse, its spread layout
   (`editStripMiddle {flex:1}`, :1361-1367) sits inside a hug-content horizontal
   ScrollView, where flex:1 collapses — geometry says Cancel/Undo/Redo/Save huddle
   left instead of spreading Cancel-left/Save-right (suspected visual regression from
   the session-2 conversion; needs one look in leg 2 — flagged, not sim-verified).
3. Both rows render their own FrostedGlassBackground permanently — two stacked blurs
   in one band during the morph.
4. The Edit chip is a hand-rolled bordered white Pressable (:314-326), not a strip
   citizen (FilterChip language is borderless-over-cutout).
5. The slide does move the whole strip (so content departs from its current scroll
   position), but scroll is not disabled during the morph and the ideal's exit-distance
   composition isn't implemented.
   So: the action-row-slot design in favorites-edit-mode-ideal.md remains RIGHT and
   remains UNBUILT. The two hand-rolled morphs are its delete-list.

### 6.3 Ordered gap list before edit-mode build starts

1. ToggleStrip engine at the fidelity bar (D3) — the band the morph lives in.
2. Action-row slot IN the engine (mount-gated, per-row holes, scroll-disable while
   `actionProgress > 0`, exit-from-live-scroll, single frost).
3. Header mount + favorites/polls migration (D4) — build the morph ON the final mount,
   or the morph gets built twice.
4. Content-toggle seam (D5) for the favorites toggles' consequences.
5. Slot-map drag generalization (2-col grid for Bookmarks; keep reorder-drag-math as
   the core; ListDetail's 1-D measured rows deferred with ListDetail).
6. Then the Part-4 build: ellipsis→handle crossfade, tiles-stay-tiles in-place edit,
   delete BookmarksEditList + edit-row rendering + EDIT_ROW_HEIGHT + both morphs.
   Owner inputs (Part 8 — surface, don't decide): Bookmarks visibility filter? All-list
   scope chip? Neither blocks items 1-5.

## Deliverable 7 — Recommended build sequence (leg 2+), honestly sized

1. **Leg 2 — the strip engine to the fidelity bar.** ToggleStrip package: band owns
   bleed + backdrop contract (auto-FrostCutout / chrome-frost) + physics + layout AND
   scrollX warm restore + declarative controls + consequence seam. Convert the results
   strip to it (SearchFilters is already a declaration — mostly mechanical; target is
   byte-identical visuals). Size: 2-3 focused sessions incl. an on-device fidelity
   pass. Risk: touching the reference — protect with the warm-restore cache contract +
   owner eyes before anything else migrates.
2. **Leg 3 — header-extension mount + migrations.** Strip slot in the persistent
   header, load-bearing foundation declaration, divider-below-strip via measured
   chrome height, reserved-lane growth; migrate polls feed + favorites home; delete
   the in-list strips, snap gate, negative-margin folklore. Size: 1-2 sessions +
   owner feel pass. Risk: header-height ripple into snap math/skeleton alignment —
   sweep OVERLAY_TAB_HEADER_HEIGHT consumers.
3. **Leg 4 — content-only choreography v0.** useContentToggle + polls/favorites wiring
   - press-up exit / ready snap-in + gap instrumentation. Size: 1 session.
4. **Leg 5 — edit mode per charter Part 4.** Action-row slot → panel conversions →
   slot-map drag → in-place editable content → deletions. Size: 2-3 sessions with
   owner eyes on morph feel + grid drag.
5. **Future session — ListDetail** as the proving ground (full registry inventory,
   role-gated viewer strip per page-registry §8.14).

## Open conflicts / flags for the owner (surfaced, not resolved)

1. **Charter Part 1.4 vs the reference**: "warm restore of scroll position" — the
   shipped reference restores LAYOUT only; strip scrollX resets on every tab-flip
   remount (1.5/1.6). The bar as stated exceeds the reference; the engine should add
   scrollX to the cache (cheap) rather than the bar being lowered.
2. **Foundation-white standard (owner's own, 2026-07-11) vs strip fidelity**: the
   plate is what white-washed the polls/bookmarks strips one day before the charter.
   The header mount resolves it structurally for header strips, but the standard needs
   an explicit clause: a strip band is a sanctioned frost window (like ProfilePanel's
   stats FrostCutout), so the two masking systems can never fight again.
3. **Results cross-list continuity is simulated per flip** (remount + warm restore +
   fade cover), not a persistent instance. It passes the eye today; scrollX seeding
   closes the one observable seam. If the owner ever wants literal one-instance
   continuity on results, that is a separate design (charter says results stays as-is).
4. **Coordination (charter Part 9)**: no evidence of mid-audit tree changes was found
   (an apparent grep discrepancy on BookmarksPanel.tsx turned out to be an encoding
   artifact — the file trips `file(1)`'s binary detection, so plain grep needs
   `LC_ALL=C`/`-a` on it; a stray non-UTF8 byte may be worth a cleanup sweep). Still:
   the tree is uncommitted and shared — leg 2 must re-sync before building.
5. **Micro-cruft for the leg-2 delete list**: unused `styles.stripSegment`
   (BookmarksPanel.tsx:1337-1339), dead `styles.listHeader` (PollsPanel.tsx:694-696),
   the fossil scrollHeader lanes (3.2).

## Deliverable 4 — Header-mount design (+ git archaeology)

(in progress)

## Deliverable 5 — Content-only choreography foundation

(in progress)

## Deliverable 6 — Edit-mode readiness

(in progress)

## Deliverable 7 — Recommended build sequence

(in progress)
