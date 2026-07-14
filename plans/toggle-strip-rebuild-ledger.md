# Toggle-strip rebuild — build ledger (legs 2+)

> Rolling build ledger for the domain-owner agent; orchestrator reads mid-flight.
> Charter: [toggle-strip-and-edit-charter.md](toggle-strip-and-edit-charter.md).
> Audit (leg 1, the design of record): [toggle-strip-audit-leg1.md](toggle-strip-audit-leg1.md).

## Leg 2 — the ToggleStrip engine + results conversion

Status: IN FLIGHT (started 2026-07-12).
Scope = audit D7.1 exactly: engine per D3.2, results strip converted, foundation
`strip:` law load-bearing, standard doc amended. NO polls/favorites conversion (leg 3),
no header mount beyond the engine seam (leg 3), no useContentToggle (leg 4), no
edit-mode features beyond the slot existing (leg 5).

### Re-sync verdict (leg-1 cites vs HEAD 8ed123f3)

Every leg-1 mechanism cite re-verified against HEAD before building; content identical,
line drift only. Notables:

- `FrostedFilterStrip.tsx` / `SearchFilters.tsx` / list-header + filters-header +
  warmup runtimes / `SearchMountedSceneBody` handoff (:618-635, warning intact) /
  `scene-foundation-spec.ts` / `SceneBodyFoundationSurface.tsx` (FrostCutout :294) /
  coordinator `use-results-presentation-toggle-coordinator.ts` — all as audited.
- The search floor signal (`search-presentation-floor-signal.ts`) is ALREADY the exact
  `{isAtFloor, subscribe}` shape the D3.2 consequence seam wants. The seam formalizes
  it; the coordinator stops touching the engine directly.
- Dead code found during re-sync: `search-results-panel-environment-contract.ts:56-57`
  declares `searchFiltersLayoutCacheRef`/`handleSearchFiltersLayoutCache` that NOTHING
  populates or reads (type-only imports at both "consumer" files). Deleted with the
  cache migration.
- `SearchFilters`' `disableBlur` prop: no caller ever passes it (the search-map
  disableBlur hits are the map's own perf knob). Not carried into the engine; deleted
  with the conversion.

### Flex-spread attribution (leg-1 §6.2.2 "one look" — CONFIRMED, not fixed)

`BookmarksPanel.tsx` `editStripMiddle` (styles :1361-1367) is `flex: 1` on a child of
`FrostedFilterStrip`. Strip children live inside `StripHoleSlot` (an unstyled hugging
View) inside `toggleRowContent` (hug-content row) inside `cutoutStrip`
(`alignSelf:'flex-start'`, hug) inside a horizontal ScrollView content container —
free space is 0 at every level, so `flex:1` collapses to intrinsic width. Geometry says
Cancel · Undo·Redo · Save huddle LEFT at intrinsic widths; the intended
Cancel-left/Save-right spread cannot happen in a hug-content horizontal scroller.
Root layer: the action row should never be scroll content at all — it is static chrome
(the engine's action-row slot). The defect dies in leg 5 when Bookmarks converts to the
slot; no patch here (a patch would style around a structure leg 5 deletes).

### Design decisions (D3.2 → concrete), settled before code

1. **New package, engine-first**: `src/toggles/ToggleStrip.tsx` + pure modules
   (`toggle-strip-layout-cache.ts`, `toggle-strip-morph.ts`,
   `toggle-strip-consequence.ts`, `toggle-strip-scene-law.ts`). `FrostedFilterStrip`
   is FROZEN as a legacy shim for its two remaining consumers (polls, bookmarks) and
   goes on leg 3's delete list — no fixes land there (one dev-assert hook call is the
   sole exception, see §law). Rationale: leg scope forbids converting polls/favorites
   now; a shared implementation would force the engine to accept the geometry
   overrides the contract exists to kill (bookmarks passes `style={flex:1}` today).
2. **Band geometry owned by construction**: ToggleStrip accepts NO `style` prop and no
   geometric knobs at all — band is `width:'100%'`; alignment is scrollable
   `contentInset` only. The remaining un-ownable case (a PADDED parent box) is a RED
   contract: dev bark when measured band width < window width (tolerance 2px) —
   "mounted in a horizontally-bounded box". Charter's own definition of "structurally
   cannot" is the narrowed style surface; the bark covers the parent-padding hole.
3. **Backdrop contract, structural first**: the band content is ALWAYS wrapped in a
   band-height `FrostCutout` — inside a plated body it punches the foundation plate
   (cutouts-over-dead-white unrepresentable, the owner-ratified "white area adapts");
   outside a foundation surface it is inert by FrostCutout's own contract. The
   REQUIRED `backdrop: 'chrome-frost' | 'plated-body'` literal is the RED half: dev
   assert that the declared value matches the actual context presence
   (new `useIsInsideSceneFoundationSurface()` probe). Declaration cannot silently lie
   in either direction.
4. **Warm restore = engine facility, layout AND scrollX**:
   `ToggleStripLayoutCache = {viewportWidth, rowHeight, contentWidth, holeMap,
controlLayouts (per-slot-key), scrollX}` + `ToggleStripCacheSeat {read, write}`.
   Seat lives per surface (search: ONE seat built inside
   `use-search-root-search-primitives-runtime`, exposed on searchState; both hosts —
   presented strip + hidden warmup — consume the same seat). ScrollX is written on
   SETTLED scroll only (drag-end/momentum-end; a mid-flick offset is not a position
   worth restoring) and clamped pure (`clampToggleStripScrollX`) at write AND at seed
   against the cached content width, so a shrunk control row can never restore
   out-of-range. Seed applies via ScrollView `contentOffset` captured once at first
   render — no post-mount jumps.
   SegmentedToggle's segment-layout join moves INTO the engine: StripHoleSlot provides
   its slot key by context; SegmentedToggle self-seeds/self-reports through
   `ToggleStripWarmRestoreContext`. The bespoke SearchFilters join (~60 lines) and the
   `initialSegmentLayouts`/`onSegmentLayoutsChange` public props are DELETED (no
   consumer remains; two lanes for one datum is the disease leg 1 named).
5. **Action-row slot designed in now** (per favorites-edit-mode-ideal decision 1):
   `{actionRow?, actionProgress?: SharedValue<number>}`. Structure: one band frost;
   per-row white plates + per-row hole registries; action row is ABSOLUTE chrome
   (never scroll content), mounted only while actionProgress > 0 (unreachable by
   construction — assert absence, not clipping), `scrollEnabled={!actionActive}`;
   toggle row exits from its LIVE scroll position (translate on the scroll container,
   `exitDistance = viewportWidth + max(0, contentWidth − scrollX)` — the ideal doc's
   formula, pure in `toggle-strip-morph.ts`); action row enters at
   `(progress − 1) × viewportWidth`. No consumer exercises it this leg; the math and
   the mount/unmount contract are jest-covered so leg 5 lands on structure, not a
   bolt-on. When `actionProgress` is absent, none of the morph machinery mounts
   (results pays zero).
6. **Consequence seam**: `createToggleStripConsequenceSeam<TKind>(declaration)` (pure
   factory, spec-able) — declaration = `{consequence:'world', floorSignal}` |
   `{consequence:'content'}` (+ optional sinks/settleMs). World: engine with
   `isAtVisualFloor=floorSignal.isAtFloor`, internal floor-ack subscription, every
   commit `awaitVisualFloor:true` — exactly today's search wiring, generalized.
   Content: a RED stub — LOUD dev bark at creation AND per schedule ("leg-4 stub, no
   exit/enter choreography"); prod behavior = bare quiet-window engine (functional,
   never silent about its incompleteness). The results coordinator converts to the
   seam and stops importing the engine — "pages never touch the engine directly" now
   holds for the one converted surface.
7. **Foundation `strip:` law load-bearing**: vocabulary `'none' | 'frosted-strip'` →
   `'none' | 'in-list' | 'header'` (placement IS the declaration; 'header' = leg-3
   mount). Rows corrected to CURRENT truth: polls `'in-list'`, bookmarks
   `'none'→'in-list'` (it renders two strips — the audited dead-law lie), listDetail
   `'in-list'`. Enforcement: `SceneBodyFoundationSurface` provides the scene key by
   context (new `sceneKey` prop from the body-content runtime);
   `useSceneStripLawAssert(placement)` barks when a strip renders on a scene declared
   `'none'` or under the wrong placement. Called by ToggleStrip AND (one line) by
   FrostedFilterStrip so the law binds polls/bookmarks NOW, not after leg 3. Search has
   no foundation surface → context null → assert skipped (search is excluded from the
   spec table by design). The inverse direction (declared-but-missing strip) needs the
   header host's descriptor pattern and lands with the leg-3 header mount — recorded as
   leg-3 scope, not silently dropped. Hand-rolled bands (ListDetail's SortChips) are
   invisible to the assert — that is WHY hand-rolling is banned; noted, deferred with
   ListDetail.
8. **Results conversion stays inside the existing mount**: the list-header runtime's
   wrapped element (strip + 8px white bottom strip), the chrome-freeze flow, and the
   one-element-handed-between-lists mechanism are all KEPT (the SearchMountedSceneBody
   warning forbids permanent dual-mount; the audit's D3.2 in-list mount IS this
   pattern). No generic in-list mount component is invented for a single consumer —
   leg 3 revisits when the second mount exists. The ONE intended visible change:
   strip scrollX survives the tab flip (engine warm restore closes the audit-1.5 seam).

### Progress log

- [x] Re-sync at HEAD; flex-spread attributed (above).
- [x] Pure modules + specs (cache / morph / consequence seam) — 13 new tests.
- [x] ToggleStrip.tsx + scene-law + foundation-surface provider/probe.
- [x] SegmentedToggle context self-registration (+ prop deletion; zero residuals).
- [x] SearchFilters + search runtime seat migration + coordinator on the seam.
      Bonus deletions: dead `search-hidden-filters-warmup-layout-input-contract.ts`
      (zero consumers), dead env-contract cache fields, `disableBlur` prop (never
      passed).
- [x] scene-foundation-spec vocabulary + FrostedFilterStrip assert.
- [x] ADDING_A_SCENE.md §5 backdrop clause + piece-4 row.
- [x] tsc green (only the 2 documented pre-existing map Camera-patch errors,
      map-1126 memory), lint 0 errors on all touched files, jest 218/218.
- [x] Sim fidelity pass — verified-fresh bundles via reload-dev-client.sh each round.

### Leg 2 — STATUS: BUILT + SIM-VERIFIED (2026-07-12). UNCOMMITTED, awaiting owner finger-test.

Sim evidence (screenshots in the session scratchpad; log excerpts below):

- **Presentation**: results strip renders through the engine at first paint —
  cutout frost windows on every control, Price chip bleeding off the physical right
  edge, no white pillars. Warmup chain intact: hidden warmup writes the seat
  (viewport=402 = full window width — the full-bleed contract measured green),
  presented strip seeds from it (holes + pill warm on frame one).
- **Scroll + settle**: strip drag → settled write `scrollX=189` (drag-end +
  momentum-end), pill sliver visible AT the left edge mid-scroll (bleed).
- **THE INTENDED IMPROVEMENT — scrollX survives the tab flip, round trip**:
  scroll → flip to Dishes → `seed scrollX=189` + honest re-write 189 → flip back →
  `seed scrollX=189` again. Both remounts paint at the preserved position
  (screenshots rt-1/rt-2/rt-3). One REAL bug found and root-caused during
  verification: the remounted instance's scroll ref initialized to 0 while its
  ScrollView sat at the seeded 189, so the first layout-triggered cache write
  clobbered the seat (restore worked exactly once). Fix at the correct layer: the
  refs initialize from the applied seed (the ref is now honest about frame-one
  truth). Re-verified: full round trip holds.
- **World choreography through the seam**: `[TOGGLE] begin → settle:commit →
finalize {awaitedVisualSync: true}` for both flips; no
  `visual_floor_ack_timeout`; map world swaps under cover as before.
- **RED proofs on-device** (deliberate violations, then reverted):
  - bookmarks spec flipped to `'none'` → `[FOUNDATION] scene 'bookmarks' declares
strip: 'none' but renders bookmarks-strip — the strip law is lying.` The dead
    law now bites.
  - SearchFilters backdrop flipped to `'plated-body'` → `[ToggleStrip]
'search-filters-strip' declares backdrop: 'plated-body' but is NOT inside a
SceneBodyFoundationSurface…`. The declaration cannot lie silently.
  - content-consequence stub bark: jest-proven (creation + per-schedule).
- **Final smoke on the marker-free final code**: fresh verified bundle, present +
  round trip — 0 barks since boot, exactly 2 clean finalize cycles. Temp
  verification markers removed.

Flags for the owner (surfaced, not decided):

1. **scrollX restore scope**: the seat is session-lived (same lifetime as the
   layout warm-restore that already shipped), so scrollX also restores when the
   results sheet re-presents after a dismiss/new search — consistent with the
   return-to-origin law (pop to EXACT origin), but technically a second visible
   change beyond the tab flip. If re-present should reset to x=0, it is a one-line
   seat-clear on dismiss; owner call.
2. **Parallel session noted during verification**: 4 uncommitted map files +
   plans/map-world-lens-transport.md (lens-transport S-0 work) are the OTHER
   session's — zero file overlap with leg 2; tsc/jest ran green over the composed
   tree. Do not attribute them to this leg at commit time.

### For leg 3 (accumulating)

- Delete `FrostedFilterStrip` after polls/bookmarks convert; its `style` prop and the
  polls negative-margin folklore (`feedStrip`) die with it.
- Header host asserts the declared-'header' strip slot exists (missing-descriptor
  pattern) — the inverse half of the strip law.
- Fossil `scrollHeaderComponent` lanes: results conversion touched none of their
  files; still dead, still listed (audit 3.2 delete list).
- `styles.stripSegment` (BookmarksPanel :1337-1339) unused; dead `styles.listHeader`
  (PollsPanel :694-696); stale frost comment (PollsPanel :666-668).
- Sweep `OVERLAY_TAB_HEADER_HEIGHT` consumers when the header grows the strip row.

## Leg 3 — header-extension mount + polls/favorites migration

Status: IN FLIGHT (started 2026-07-12). Scope = audit D7.2 + owner decision
(scrollX resets on re-present, persists across tab flips).

### Design decisions (D4.2 → concrete), settled before code

1. **Owner decision first — scrollX re-present reset as an ENGINE facility**:
   new pure helper `clearToggleStripCacheScrollX(seat)` in
   toggle-strip-layout-cache.ts — zeroes scrollX, KEEPS layout (no measure-flash
   on the next present; only the position resets). Each surface calls it at its
   presentation-end chokepoint: search = the close-search cleanup runtime (the
   same chokepoint that resets query/suggestions on dismiss — the canonical
   "presentation ended" seam); header strips = strip unmount (for a
   header-mounted strip, unmount ⇔ the scene stopped being presented — the strip
   never remounts within one presentation, so tab-flip persistence is untouched
   and results-only). Jest: persists-until-cleared + clear-keeps-layout.
   To reach the cleanup runtime without threading 5 arg contracts, the search
   seat's backing ref moves to module scope in
   use-search-root-search-primitives-runtime.ts (house registry pattern; one
   search surface per app) exporting `resetSearchFiltersStripScrollX()`.
2. **Header mount = a `Strip` slot on the persistent-header descriptor**
   (`PersistentHeaderDescriptor.Strip?: React.ComponentType`), rendered by
   PersistentSheetHeaderHost BELOW the chrome row inside ONE measuring container.
   The container's onLayout replaces the chrome's as the source for
   onHeaderLayout AND descriptor.onChromeLayout (identical geometry for every
   strip-less scene, search included — chrome fills the container). Measured
   height already fans out to reservedHeaderHeight (body lane) and the divider
   (headerHeight − 1), so divider-below-strip and body-lane growth are free.
3. **The inverse strip law lands here**: spec `strip: 'header'` + missing
   descriptor.Strip ⇒ dev bark; descriptor.Strip on a scene NOT declared
   'header' ⇒ dev bark (ToggleStrip's own placement assert can't fire in the
   header host — no SceneBodyFoundationSurface there — so the host asserts).
   Scene-law context: the host provides SceneStripLawContext with the presented
   scene key so the ToggleStrip placement assert ALSO binds in the header mount.
4. **First paint by construction**: the host swaps the strip with the title in
   the same committed frame (presented-key change). The polls snap gate
   (isExpandedSurface → ListHeaderComponent null) and the bookmarks
   display:none/sceneReady gating cease to apply to the STRIP (body skeleton
   flow unchanged — that is the page-skeleton standard, not strip gating).
   Consequence: the strip now ALSO exists on the collapsed docked-polls teaser,
   where it sits below the header boundary (collapsed snap = navBarOffset −
   OVERLAY_TAB_HEADER_HEIGHT, so the band lands behind/under the nav bar).
   Flagged for the owner finger-test; snap math deliberately NOT changed
   (shared snaps across scenes are a law — "page switches never move the sheet").
5. **Control state moves OUT of the body tree into per-scene stores** (the strip
   is chrome; chrome and body must both reach the state):
   - polls: `polls-feed-controls-store.ts` (zustand — house pattern):
     {feedState, feedSort, feedType, feedTime}. The feed runtime reads the store
     (same values feed the query); the press consequence stays EXACTLY today's
     engine wiring — the controller subscribes to store changes and calls
     scheduleFeedQueryCommit (replacing the setter-wrapper call sites). Chosen
     over the leg-2 RED content stub: polls already HAS functional, honest
     content-consequence wiring (quiet-window engine + skipSpinner refresh);
     routing it through a stub that barks would be less truthful than keeping
     the working seam until leg 4 replaces it. Recorded as the deliberate choice.
   - bookmarks: `bookmarks-home-controls-store.ts` (zustand): {listType,
     sortMode, editSession, isSavingOrder} + pure session actions (enterEdit/
     exit/applyMove/commitHistory/undo/redo). The data surface swaps its
     useState for store selectors; edit-mode CONTENT behavior (BookmarksEditList
     swap) stays as-is per scope. Save/enter handlers live in the strip
     component reading the lists from the react-query cache (the same
     favoriteListKeys.list(listType) read the panel already does).
6. **Favorites edit morph = the engine's action-row slot**: the bookmarks strip
   is ONE ToggleStrip (placement 'header', backdrop 'chrome-frost') with
   actionRow = Cancel · Undo/Redo · Save and actionProgress driven withTiming
   240ms off store isEditing. Kills: the hand-rolled two-FrostedFilterStrip
   morph viewport, the permanently-mounted edit row, the double frost, and the
   flex-huddle (the action row is static absolute chrome — flex spread works).
7. **Delete list executed with the migration**: both in-list strips, the polls
   snap gate + negative-margin folklore (`feedStrip`) + stale frost comment +
   dead styles.listHeader + stripViewport/stripRow/stripShell/stripSegment,
   FrostedFilterStrip (frozen shim — last consumers gone) + its index export.
   Fossil scrollHeader lanes: assessed — ALL producers are hardcoded null
   (scrollHeaderForRender: null; assembly scrollHeaderComponent: null); the cut
   spans ~12 sheet-plumbing files; scheduled LAST after the core build verifies
   (wide mechanical delete, zero behavior).

### Progress log

- [x] Re-read charter/audit/leg-2 ledger; re-mapped all mechanisms at the tree.
- [x] Engine facility: `clearToggleStripCacheScrollX` + `createToggleStripCacheSeat`
      (pure) + jest spec proving BOTH owner-decision behaviors (persists across a
      tab-flip remount; clear zeroes scrollX and keeps layout; cold/zero no-ops).
- [x] Header mount: `Strip?` slot on PersistentHeaderDescriptor; host renders it
      below the chrome inside the ONE measured wrapper (divider + body lane grow
      free); inverse strip-law barks both directions; SceneStripLawContext provided
      around the header Strip so ToggleStrip's placement assert binds there too.
      8px white bottom spacer mirrors the results reference seam. Engine
      actionRowContent = space-between (the canonical spread; kills flex-huddle).
- [x] polls-feed-controls-store + bookmarks-home-controls-store (zustand); feed
      controller subscribes to control changes -> scheduleFeedQueryCommit (the
      recorded consequence choice); bookmarks session actions pure in the store.
- [x] Polls migrated: PollsFeedStrip on the descriptor; in-list strip + snap gate +
      feedStrip negative margin + stale frost comment + dead styles.listHeader
      DELETED; ListHeaderComponent gone from the list spec.
- [x] Bookmarks migrated: BookmarksHomeStrip = ONE ToggleStrip w/ actionRow morph
      (Cancel · Undo/Redo · Save) driven withTiming(240ms) off store isEditing;
      hand-rolled two-strip morph viewport + permanently-mounted edit row +
      stripViewport/stripRow/stripShell/stripSegment/segmentRow styles DELETED;
      data surface reads the store; edit-lock effect + edit-list content unchanged.
- [x] scrollX re-present reset wired: search close-cleanup runtime calls
      resetSearchFiltersStripScrollX (seat store moved to module scope); header
      strips clear their module seats on unmount.
- [x] FrostedFilterStrip DELETED (component + index export; zero references left).
- [x] scene-foundation-spec: polls + bookmarks -> 'header'.
- [x] tsc green (only the 2 documented map Camera-patch errors), lint 0 errors,
      jest 221/221 (was 218; +3 new cache specs).
- [x] SIM VERIFICATION (verified-fresh bundles via reload-dev-client.sh each round;
      Maestro id-taps + coordinate taps per house gotchas): - Favorites: strip in the HEADER at first paint — Sort chip + Restaurants/
      Dishes pill under the title, cutouts genuinely revealing the map (map tint
      visible through every control), edge-to-edge band, no white pillars. - Edit morph on the slot: sort→Custom → Edit chip fades in; Edit → action row
      (Cancel left · Undo/Redo center · Save right — the SPREAD, flex-huddle dead);
      Cancel → toggle row returns. ONE REAL BUG sim-caught + fixed at the correct
      layer: actionRow passed as a fragment = ONE hole slot (toArray treats a
      fragment as one child) → controls stacked in a column; fix = element ARRAY. - Polls: promote docked sheet → strip present in header (Live/Results + Type/
      Sort/Time), no snap-in gate; Live→Results press-up ran the full
      [TOGGLE] begin→settle:commit→finalize feed_query cycle through the store
      subscription and swapped the feed slice. Collapsed teaser unchanged
      (strip sits below the collapsed header boundary, occluded by the nav bar). - Results regression: strip renders through the engine as before (bleed,
      cutouts, Price off the right edge). - OWNER DECISION verified end-to-end: scroll strip → dismiss (X) →
      [STRIPRESET] fired from clearSearchState → re-present → strip at x=0.
      SECOND REAL FINDING sim-caught: (a) the retained results leg never remounts,
      so a cache-only clear was insufficient — the engine facility now ALSO resets
      LIVE instances (seat-reset listener registry + ScrollView.scrollTo(0));
      (b) the first chokepoint (close-search cleanup runtime) demonstrably did NOT
      run on the X dismiss (marker never fired) — the reset moved to
      clearSearchState, the canonical dismiss teardown (the same breath that
      resets the filter VALUES via the 'dismiss' tuple write). jest 222/222. - Inverse strip-law bark observed RED live during the migration window
      (polls Strip slot vs a stale 'in-list' row barked until the spec row
      hot-reloaded) — the new law bites in both directions.

### Deferred (explicit, not dropped)

- **Fossil scrollHeader lanes**: all producers confirmed hardcoded null
  (scrollHeaderForRender: null; assembly scrollHeaderComponent: null; no panel spec
  sets it), but the lane threads ~12 sheet-plumbing files INCLUDING the scroll-inset
  math (hasScrollHeaderOverlay) and BottomSheetWithFlashList/SearchMountedSceneBody —
  the recently rebuilt scroll-handoff surface. Deleting it inside this already-wide
  leg risks the precious sheet scroll primitive for zero visible benefit; it is a
  focused mechanical pass of its own (audit 3.2 map stands). NOT silently dropped.
- Divider-fade + strip under real content scroll on polls/favorites: eyeballed sane;
  owner finger-test is the oracle for feel (snap math intentionally untouched —
  shared snaps across scenes are a law; the taller chrome rides the measured
  headerHeight into divider + body lane only).

### Leg 3 — STATUS: BUILT + SIM-VERIFIED (2026-07-12). UNCOMMITTED; owner

finger-tests legs 2+3 together. NOTE: the parallel map lens-transport session is
ACTIVELY editing the tree (search-world-presentation-seam.ts et al) — do not
co-attribute at commit.

### For leg 4

- Replace the polls store-subscription→scheduleFeedQueryCommit seam with
  useContentToggle (the store is the stable half; the subscription in
  polls-feed-runtime-controller.ts is the seam to swap). Bookmarks listType/sortMode
  re-slices are synchronous store writes today — wire them through the same seam
  with settleMs 0.
- The RED content stub in toggle-strip-consequence.ts still has zero consumers —
  leg 4 makes it real or deletes it in favor of useContentToggle.
- Strip state stores: polls-feed-controls-store.ts /
  bookmarks-home-controls-store.ts — chrome writes, body reads; any new toggle joins
  the store, never component state.
- Edit-mode content (leg 5): BookmarksEditList swap still lives; the strip morph is
  already on the engine slot, so leg 5 is content-only (in-place drag + slot map +
  delete BookmarksEditList/EDIT_ROW_HEIGHT).

## Leg 4 — content-only choreography (useContentToggle) + defect resolution

Status: IN FLIGHT (started 2026-07-12). Scope = charter Part 3 v0 (the D5 seam) +
three defect resolutions (dead close-cleanup runtime, stale seeded holes, morph
exit-distance) + ledger truth pass. Verification standard from this leg forward:
LOGIC-FIRST — every behavior gets its exact mechanical walkthrough here; sim
supplements, never substitutes.

### Design decisions (D5 → concrete)

1. **The seam gains its real content implementation IN PLACE**
   (`toggle-strip-consequence.ts`) — the leg-2 RED stub's barks are gone;
   `consequence: 'content'` is first-class. One new observable:
   `contentPhase: 'settled' | 'awaiting'` (getContentPhase/subscribeContentPhase on
   the seam). World seams are always 'settled' (their cover is the presentation
   fade). `useContentToggle` (`src/toggles/use-content-toggle.ts`) is the React face
   for hook-owned surfaces: `{seam, phase}`, phase via useSyncExternalStore, seam
   disposed on unmount. Declaring stays trivial: `{surfaceName, settleMs?}`.
2. **Press-up exit is synchronous by construction**: `scheduleCommit` flips
   contentPhase to 'awaiting' in the CALLER'S OWN STACK before `engine.begin` — so
   the exit re-render lands in the same React batch as the control's optimistic flip.
   A tap burst re-arms the quiet window; the phase stays 'awaiting'; the runner fires
   once; the engine's finalize/fail/cancel lifecycle edge settles the phase back —
   the surface can never park on bare white (dispose ALSO settles: a disposed seam
   must never leave a surface stuck rendering the gap).
3. **Instrumented from day one**: every content burst logs `[CONTENTTOGGLE] gap`
   (dev logger) with `exitToReadyMs` (first exit of the burst → ready),
   `lastPressToReadyMs`, commit count, and the outcome edge — RED shows as large
   gaps or non-finalized outcomes.
4. **Polls wiring** (`polls-feed-runtime-controller.ts`): the leg-3 bare-engine
   instance + store-subscription→scheduleFeedQueryCommit seam REPLACED by
   `useContentToggle<'feed_query'>({surfaceName:'polls-feed'})`. The store stays the
   stable half: zustand notifies synchronously inside the press handler's stack, so
   subscribeToPollsFeedControlChanges → scheduleFeedQueryCommit → phase flip all
   happen in the press-up batch. The runner re-checks the visibility gate at commit
   time and calls `refreshPollFeed({skipSpinner:true})`; failure UX stays with the
   controller's retry ladder + deferred freshness error (never the modal).
   Controller exposes `isFeedSliceAwaiting`; PollsPanel empties `listData` AND
   returns `ListEmptyComponent = null` while awaiting — bare white under the header
   strip, never a skeleton, never a mid-toggle "create the first poll" message.
5. **Bookmarks wiring** (`bookmarks-home-content-toggle.ts`, module scope — the
   press edge lives in header chrome, no surface runtime to own a hook): ONE seam,
   `settleMs: 0`, kinds `list_type | sort_mode`; BookmarksHomeStrip calls
   `commitBookmarksHomeSliceToggle(kind)` AFTER the store write (the write IS the
   re-slice). No body gating is needed — see walkthrough W2.

### Mechanical walkthroughs (logic-first standard)

- **W1 — polls Live↔Results press-up → snap-in**: finger-up on the segment →
  SegmentedToggle onChange → `setFeedState` (zustand set; pill flips optimistically)
  → store notifies synchronously → `subscribeToPollsFeedControlChanges` listener →
  `scheduleFeedQueryCommit` → `seam.scheduleCommit` → contentPhase='awaiting'
  published in the SAME stack → controller re-renders in the same React batch:
  `isFeedSliceAwaiting=true` → PollsPanel `listData=EMPTY_POLL_LIST`,
  `ListEmptyComponent=null` → OLD CARDS EXIT NOW (strip is header chrome, stays) →
  engine quiet window (default settleMs) elapses → runner: visibility gate check →
  `refreshPollFeed({skipSpinner:true})` (internal latest-wins seq guard drops stale
  landings) → promise resolves → `settleOutcome` → finalize lifecycle →
  `settleContent('finalized')` → gap logged → contentPhase='settled' → visiblePolls
  (already updated by the refresh) render — NEW CARDS SNAP IN on the resolution edge.
- **W2 — bookmarks Recent/Custom, Restaurants/Dishes (settleMs 0 degenerate)**:
  press handler writes the store (the synchronous re-slice; data surface re-renders
  from store selectors in the same batch) → `commitBookmarksHomeSliceToggle` →
  scheduleCommit: phase='awaiting' → `engine.begin` → `settleMs <= 0` branch calls
  `handleQuietWindowElapsed` SYNCHRONOUSLY → `commitActiveInteraction` → runner
  `() => undefined` returns a non-promise → `settleOutcome` → `finalizeInteraction`
  → `settleContent('finalized')` → phase='settled' — ALL in the one call stack, so
  'awaiting' is set and cleared before React ever renders; exit and enter collapse
  into the same frame by construction; nothing subscribes to the phase and nothing
  could ever observe it. Measured gap 1ms (Date.now boundary), on the record.
- **W3 — defect 1, dead close-cleanup runtime (ROOT CAUSE = dead code, fix =
  DELETE)**: `use-results-presentation-close-search-cleanup-runtime.ts`'s
  `scheduleCloseSearchCleanup` lost its last CALLER in 9fa642d7 (the S-C.5 close
  rebuild) — the hook was still composed and its functions threaded through
  ~5 arg contracts, but no dismissal path invoked it (leg-3 marker proof: never
  fires on X-dismiss). Every dismissal shape now reaches `clearSearchState` — a
  strict SUPERSET of the old cleanup body (cancel search/autocomplete/mutations/
  toggle + reset focus/suggestions/query/error + keyboard) — either directly
  (motionless pop exits) or via `finalizeCloseSearch` (terminal home dismissals).
  Deleted the file + the dead threading (close-transition runtime slimmed by 13 arg
  fields; owner-close runtime + controller value + close-actions' cancel call all
  shed the lane); a LEG-4 NOTE at the composition site records the archaeology.
  A cleanup hook that can never fire is a latent-bug factory, not a safety net.
- **W4 — defect 2, stale seeded holes (phantom unrepresentable at the SEED)**:
  ToggleStrip seeds holeMap from the cache; a cached hole whose control is
  conditionally ABSENT this presentation would never re-register (no mount → no
  onLayout) and never unregister — a phantom see-through window until some other
  layout event happened to rebuild the map. Fix at the seed, not a post-layout
  prune timer: `pruneToggleStripHoleMapToRenderedSlots(rawSeed.holeMap,
resolveChildSlotKeys(children))` filters the seed to the hole keys THIS mount's
  children will actually produce (same `strip-slot-<key>` keying as
  wrapChildrenInHoleSlots) — the phantom is unrepresentable from frame one, no
  "first live layout pass" race to wait out. Jest: keeps present keys, drops absent
  keys, empty-children → empty map (toggle-strip-layout-cache.spec.ts).
- **W5 — defect 3, morph exit-distance over-scaling (geometry traced)**: the exit
  translation applies to the CLIPPED VIEWPORT CONTAINER (the full-band-width wrapper
  around the horizontal ScrollView; band clips overflow:hidden) — translating that
  container one viewport width moves the entire visible window past the band's
  right edge: fully exited by construction, for ANY content width or scrollX. The
  ideal-doc formula `viewportWidth + (contentWidth − scrollX)` described translating
  the CONTENT inside a fixed window; applied to the container it only scaled exit
  SPEED with content width (a 2000px strip exited ~6× faster than the action row
  entered). Fix: `resolveToggleRowExitDistance = viewportWidth` (worklet-pure);
  spec proves invariance + exit/enter speed symmetry. "Exit from the LIVE scroll
  position" is a property of WHAT translates (the container carries its inner
  scroll offset — the row departs showing exactly the controls the user saw), not
  of the distance. FEEL CHANGE FOR THE OWNER: the toggle row now exits at the same
  speed the action row enters (previously it zipped out faster the longer the
  strip); both rows traverse exactly one viewport width over the same 240ms.

### Progress log

- [x] Tree inventory on resume (process killed mid-verification by model quota):
      Parts A + B1 + B2 + B3 all found BUILT in the tree and verified against the
      code line-by-line; what remained was finishing sim verification, removing the
      temp `[CT-MARK]` markers + the 12s auto-press harness in PollsFeedStrip, the
      gates, and this truth pass.
- [x] Seam content implementation + useContentToggle + polls/bookmarks wiring (A).
- [x] Close-cleanup runtime DELETED w/ dead threading (B1); seeded-hole prune at
      seed + spec (B2); morph distance corrected + spec (B3).
- [x] tsc green (only the 2 documented map Camera-patch errors), lint 0 errors,
      jest 242/242 (was 222; +20 across seam/prune/morph/snap-session specs).
- [x] SIM (verified-fresh bundles via reload-dev-client.sh): polls press-edge cycle
      (store write → [TOGGLE] begin→settle:commit→finalize → [CONTENTTOGGLE] gap,
      outcome finalized) observed on-device 4×; bookmarks list_type cycle observed
      (1ms); final marker-free bundle boots clean (no ReferenceError, no barks).
- [x] **Measured gap distribution (the data the transition decision rides on)**:
      polls feed_query exitToReadyMs = 337 / 339 / 428 / 655 ms (n=4, dev sim,
      skipSpinner in-place refresh); bookmarks list_type = 1 ms (synchronous
      degenerate). Reading: polls sits in the "instant-ish but visible" band —
      if the owner wants Spotify's snap-out → quick-fade-new-in, the fade lands on
      the existing resolution edge (settleContent); no structural change needed.

### Ledger truth pass (Part C — reconciled against the tree)

- Legs 2–3 claims re-verified against the tree on resume: all standing. One
  correction: leg 3 recorded the scrollX reset wired at "search close-cleanup
  runtime calls resetSearchFiltersStripScrollX" — superseded IN leg 3 itself (the
  sim finding moved it to `clearSearchState`) and now doubly so: the close-cleanup
  runtime no longer exists (W3). The live wiring is `use-search-clear-owner.ts`
  (clearSearchState, beside the 'dismiss' tuple write) + live-instance seat-reset
  listeners.
- **Reset-on-tab-away semantics, recorded explicitly (the documented intended
  reading of the owner's "scrollX resets on re-present")**: a HEADER-mounted strip
  (polls, bookmarks) unmounts exactly when its scene stops being presented — the
  strip component's unmount cleanup calls `clearToggleStripCacheScrollX(seat)` —
  so tabbing AWAY clears scrollX and the next present paints at x=0 (layout half
  stays warm; no measure-flash). It never remounts within one presentation, so
  nothing resets mid-presentation. The IN-LIST results strip persists scrollX
  across restaurant/dish tab flips WITHIN a presentation (the seat survives the
  remount) and resets only at dismiss via clearSearchState. Same law — "position
  resets when the presentation ends" — two chokepoints because the two mounts have
  different presentation-end signals.
- The engine's RED content stub is GONE (replaced by the real implementation, as
  leg-2's ledger promised); `subscribeToPollsFeedControlChanges` doc updated off
  its "(pre-leg-4)" wording.

### Leg 4 — STATUS: BUILT + SIM-VERIFIED (2026-07-12). UNCOMMITTED; owner

finger-tests legs 2+3+4 together. Parallel sessions in the tree: snap-law work
(navigation runtime descriptor table / session-state controller / NavSilhouetteHost
/ posture field) and map lens-transport — neither is this leg's; do not
co-attribute at commit.

### For leg 5 (edit-mode content)

- The strip morph is ALREADY on the engine action-row slot (leg 3) with the
  corrected leg-4 distance math — leg 5 is content-only: in-place editable content
  (ellipsis→handle crossfade, tiles stay tiles), slot-map drag generalization
  (2-col grid for Bookmarks), then DELETE BookmarksEditList + edit-row rendering +
  EDIT_ROW_HEIGHT.
- `bookmarks-home-controls-store.ts` already holds the edit session (enterEdit/
  exit/applyMove/commitHistory/undo/redo, pure) — the drag surface reads/writes the
  store, never component state.
- If an edit action ever becomes async (save ordering), it declares through the
  same content seam (`bookmarks-home-content-toggle.ts` is the precedent) so the
  gap is measured, not assumed.
- Owner inputs still open (charter Part 8): Bookmarks visibility filter? All-list
  scope chip? Neither blocks the build.

## Leg 5 — edit mode = the SAME content, made editable (Bookmarks only)

Status: IN FLIGHT (started 2026-07-12). Scope = charter Part 4 / favorites-edit-mode-ideal
decisions 2-5 for BOOKMARKS (ListDetail deferred) + the leg-4 red-team failure path +
charter Part 8 verifications. Verification standard: logic-first walkthroughs here; sim
supplements.

### Design decisions (settled before code)

1. **The slot map (grid drag) — design first, per charter.** `computeDragFrame`
   (reorder-drag-math.ts) generalizes from the 1-D fixed-height stack to an
   N-column slot map, parameterized `{columns, columnStride, rowStride(=rowHeight arg),
translationX}`. Slot resolution IS nearest-slot-center hit-testing:
   `row = liftRow + round((translationY + scrollDelta) / rowStride)`,
   `col = clamp(liftCol + round(translationX / columnStride), 0, columns-1)`,
   `rawSlot = row×columns + col`, clamped to `[pinnedLeadingCount, itemCount-1]`
   (row also clamped to `[0, ceil(itemCount/columns)-1]`). `columns: 1` reduces
   EXACTLY to the shipped 1-D math (col term = 0, rawSlot = liftSlot +
   round(translate/rowHeight)) — ReorderableRows behavior is invariant by
   construction, spec-proven. Auto-scroll edge bands unchanged (vertical only).
2. **ReorderableRows SURVIVES** — ListDetailPanel is a real remaining consumer
   (its edit swap is deferred WITH ListDetail). Bookmarks stops consuming it;
   `BookmarksEditList` + `EDIT_ROW_HEIGHT` + the bare-row edit rendering die.
3. **`ReorderableGrid` (components/reorder)** — the 2-D sibling of ReorderableRows
   on the SAME `useReorderDrag` runtime (which gains `dragTranslateX` + the
   geometry params). Absolutely-positioned tile shells at slot rects
   (`x = col×columnStride`, `y = row×rowStride`), settled shells animate to their
   slot via the existing 180ms withTiming shuffle; the lifted shell renders at
   `liftRect + (dragTranslateX, dragTranslateY + scrollDelta)`, scale 1.02, zIndex
   up — the exact ReorderableRows pattern, one more axis. Handle gesture for the
   grid activates on ANY 4px movement (no failOffsetX — horizontal drag is legal
   in a grid); rows keep their axis-locked gesture verbatim. Body long-press lift
   (300ms) and the WCAG a11y buttons carry over (linear slot order).
4. **Edit mode renders the READ grid's geometry by measurement**: the read-mode
   grid reports `cellWidth` (gridCell onLayout) and `rowHeight` (gridRow onLayout,
   which includes the tileWrapper's marginBottom) up to the data surface;
   ReorderableGrid's strides are `cellWidth + GRID_GAP` and `rowHeight + GRID_GAP`.
   Tiles are height-uniform by design (minHeight 140 dominates the capped 5-item
   preview) — a dev assert barks if measured tile rows diverge (RED contract, no
   silent misalignment). The All tile stays OUTSIDE the slot map (full-width row
   above the grid, never a slot); system lists are pinned leading SLOTS
   (rendered, handle-less, drag range clamps past them) — pinnedLeadingCount
   semantics exactly.
5. **Ellipsis → grab handle, in place**: BookmarksListTile gains an `editMode`
   context; the tileFooter's trailing button crossfades (180ms opacity swap,
   same position/hit target) between the ellipsis Pressable (read) and the drag
   handle under a GestureDetector (edit, draggable only). Pinned tiles fade the
   ellipsis out and show nothing. Tile navigation onPress is disabled while
   editing (edit is a mode, not a browse surface); full read visuals (previews,
   score dots, footer) stay rendered, including while dragging.
6. **Undo/Redo/Save/Cancel — the store's session model VERIFIED, no reshape
   needed**: `bookmarks-home-controls-store` already holds
   `{order, history[], historyIndex}` with pure `applyReorder` (live, no history),
   `commitHistoryEntry` (once per completed gesture, no-op on no net change,
   truncates redo branch), `undo`/`redo` (index walk). The grid wires the SAME
   handlers the edit list used: onReorder → applyReorder, drag-end
   (onDragStateChange false) → commitHistoryEntry, a11y press → apply+commit.
   Cancel = exitEdit (session discarded; read order re-derives from server data —
   byte-identical restore by construction). Save = existing per-list PATCH fan-out.
7. **Leg-4 red-team failure path — control/content coherence on 'failed'**:
   - TRACE (polls): `refreshPollFeed` CATCHES its own fetch error (retry ladder)
     and resolves void — the engine NEVER sees 'failed'; the seam settles
     'finalized', the stale old slice re-renders, and the store keeps the
     optimistically-flipped control: "Results" pill over Live cards. Two layers
     wrong: a runner that cannot fail is dishonest, and nothing owns the revert.
   - TRACE (bookmarks): the store write IS the re-slice (synchronous, client-side)
     — failure is unrepresentable; no baseline declared.
   - FIX at the seam (every content surface inherits):
     `consequence:'content'` declarations gain
     `captureControlBaseline?: () => () => void` — captured ONCE per burst (first
     scheduleCommit), the returned restore thunk runs on the 'failed' edge only,
     discarded on 'finalized'. 'cancelled' does NOT restore: the only content
     cancel is dispose (surface teardown — not a user-observed failure; the next
     present refetches with live control values).
   - Runner honesty (polls): `refreshPollFeed` returns its outcome
     (`'applied' | 'superseded' | 'unavailable' | 'failed'`); the seam runner
     THROWS on 'failed'/'unavailable' (slice didn't land) → engine 'failed' →
     seam restores the control snapshot. 'superseded' does not throw (a newer
     refresh reads the live refs and carries the slice). The retry ladder keeps
     running after a revert — its rungs read the (restored) live refs, so it
     refreshes the OLD slice: coherent either way.
   - Restore must not re-enter the press edge: `restorePollsFeedControls`
     (store) writes under a module suppression flag that
     `subscribeToPollsFeedControlChanges` checks — no revert→commit→revert loop,
     no engine reentrancy (the 'failed'→'finalized' echo is inert: the baseline
     is cleared on first settle).
8. **Charter Part 8 verifications** (results in §findings below): visibility
   canon recorded in product/favorites.md; contradictions FLAGGED not built;
   All-list per-side shape verified.

### Slot-map walkthrough (cross-column drag, the RED-able core)

Geometry: 6 tiles, 2 columns, cellWidth 180, GRID_GAP 12 → columnStride 192;
rowHeight 180 → rowStride 192. Pinned = 2 (system lists, slots 0-1).
Drag tile at slot 5 (row 2, col 1) to slot 2 (row 1, col 0):

1. Handle pan starts → `beginDrag(key, 5, absY)`: liftSlot 5, translate (0,0).
2. Finger moves up-left: translationY −192, translationX −192, scrollDelta 0 →
   `row = 2 + round(−192/192) = 1`, `col = clamp(1 + round(−192/192)) = 0` →
   rawSlot = 1×2+0 = 2 ≥ pinned 2 → slot 2. `emitReorder(5, 2)` fires once on the
   slot-crossing; store `applyReorder(5,2)` splices order; the other shells'
   indexes shift and each animates 180ms to its new rect; the lifted shell stays
   finger-pinned at liftRect + translate.
3. Mid-point (translationY −100, translationX −100): row = 2+round(−0.52) = 1…
   round crosses at half a stride — nearest-slot-center hit-testing, so the swap
   happens when the dragged tile's center crosses the midpoint between slots.
4. Pinned edge: dragging to translationY −384 (row 0, col 0 → rawSlot 0) clamps
   to slot 2 — the pinned prefix is unreachable; system tiles never move.
5. Odd-count edge: with 7 items, rawSlot 7 (empty cell of the last row) clamps to
   6 — the trailing hole is not a slot.
6. Release → `endDrag` → onDragStateChange(false) → `commitHistoryEntry()` pushes
   the settled order once; Undo walks back to the pre-gesture order.

### Progress log

- [x] Ledger design written before code (this section).

### Mechanical walkthroughs (logic-first)

- **W6 — enter edit → handles**: Edit chip press → `handleEnterEdit` → baseline =
  custom-sorted cached listIds → `enterEdit` (store: session {order, history:[order],
  historyIndex:0}) + sheet promote to expanded. Data surface re-renders from store:
  `editGridProps != null` → listContent = All tile (disabled) + `ReorderableGrid`
  over the SAME `BookmarksListTile`s with `editContext` — ellipsis slot renders the
  handle (FadeIn 180ms) for draggable tiles, nothing for pinned; tile navigation
  onPress disabled. Strip morph (leg 3, engine slot) runs in parallel.
- **W7 — drag → undo/redo → save/cancel (store session verified, NO reshape)**:
  handle pan → `beginDrag` → per-frame `computeDragFrame` (2-col) → slot crossing →
  `emitReorder(from,to)` → store `applyReorder` (splice; NO history) → shells
  re-index → 180ms withTiming shuffle. Drag end → `onDragStateChange(false)` →
  `commitHistoryEntry` (no-op if no net change; truncates the redo branch) — one
  entry per completed gesture; a11y presses commit per press. Undo/Redo = pure
  historyIndex walks (order := history[i]). Cancel = `exitEdit` — session discarded;
  read order re-derives from server data ⇒ byte-identical restore by construction.
  Save = per-changed-USER-list PATCH fan-out → invalidate → setSortMode('custom') →
  exitEdit; system lists' server positions untouched.
- **W8 — failure path end-to-end (polls)**: press → store write (optimistic pill) →
  press-edge subscription → scheduleCommit → phase 'awaiting' (old cards out) →
  quiet window → runner → `refreshPollFeed` returns `'failed'`/`'unavailable'` →
  runner THROWS → engine 'failed' lifecycle → seam `settleContent('failed')` →
  restore thunk (captured at creation / re-captured after every settle = last
  SETTLED controls) → `restorePollsFeedControls` (suppressed press edge — no
  revert→commit loop) → pill snaps back → baseline re-captured → phase 'settled' →
  the 'finalized' echo from `failInteraction`→`finalizeInteraction` is inert
  (thunk cleared before the call). The §9.4 retry ladder keeps running and reads
  the RESTORED live refs — it refreshes the old slice; coherent either way.
  'superseded' does not throw (the newer refresh reads live refs and carries the
  slice); dispose ('cancelled') never reverts (teardown ≠ failure).

### Progress log (continued)

- [x] Slot-map math generalized (`computeDragFrame`: columns/columnStride/
      translationX; columns=1 reduces verbatim to the 1-D math — spec-proven
      X-invariance) + `useReorderDrag` 2-D (dragTranslateX, grid handle gesture =
      minDistance(4) any-axis; rows keep the axis-locked gesture verbatim).
- [x] `ReorderableGrid` (components/reorder) — absolute slot shells, lifted shell
      finger-pinned 2-D, 180ms shuffle, WCAG a11y move buttons, handle gesture
      handed to the tile via render context.
- [x] Bookmarks in-place edit: tiles stay tiles (editContext affordance swap in the
      ellipsis slot), read-grid geometry measured (cellWidth/rowHeight onLayout) and
      replicated in the slot map; row-uniformity dev bark (RED contract); All tile
      pinned above the map, disabled during edit. DELETED: BookmarksEditList, the
      bare-row edit rendering, EDIT_ROW_HEIGHT, editRow\* styles; ReorderableRows
      import dropped from BookmarksPanel (the component SURVIVES — ListDetailPanel
      is a real consumer; its edit swap is deferred with ListDetail).
- [x] Failure path (leg-4 red-team item): seam `captureControlBaseline` +
      polls runner honesty (`PollFeedRefreshOutcome`) + store restore suppression.
      Jest: 4 new seam specs (revert on failed; baseline rolls forward; burst
      reverts past every press; success/dispose never revert) + 2 store specs
      (press edge fires on normal write, silent on restore) + 7 grid-math specs.
- [x] tsc green (only the 2 documented map Camera-patch errors), lint 0 errors,
      jest 263/263 (was 242).
- [x] SIM (verified-fresh bundle via reload-dev-client.sh, hash f8c9ee51f1bf, boot
      clean; Maestro id-taps + swipe): enter edit on Custom → action row spread +
      handles in the ellipsis slots, pinned Been/Want-to-go + All handle-less, full
      tile visuals (preview rows + score dots) preserved; CROSS-COLUMN drag slot 3 →
      slot 2 via handle swipe → order swapped live, Undo enabled; Undo → original
      order (Redo enabled); Cancel → read mode, ellipses back, byte-identical
      original order; re-enter + drag + SAVE → persisted order renders in read mode,
      edit exited, ellipses back.

### Flags / deferred (explicit)

1. **Sim contention mid-verification**: a concurrent session terminated + relaunched
   the app (`Termination requested by simulator host`, 19:21) during the courtesy
   restore-order flow, and drove the app afterwards (Profile page). Consequences:
   (a) the rig data's custom order is left REORDERED (Rig favorites before
   Rig empty) — harmless dev data; (b) the polls-side on-device FAILURE repro
   (kill API → toggle → watch the pill revert) was not run: the polls dock was
   unreachable behind a stuck 'overlay-switch' nav phase (sibling's snap-store
   files are mid-edit in the tree) and killing the shared API under a concurrent
   session was judged reckless. The failure path is logic-walked (W8) and
   jest-proven at the seam + store layers; the polls wiring compiles through the
   same scheduleCommit path leg 4 verified on-device. Re-run the API-down repro
   when the tree is quiet if wanted.
2. **Handle "crossfade" nuance for owner eyes**: entering/leaving edit remounts the
   grid (flex read layout → absolute slot shells at identical measured positions),
   so the affordance swap renders as ellipsis-out/handle-FadeIn (180ms), not a
   literal two-icon crossfade. Positions are pixel-replicated so tiles do not move.
   If the owner wants a true simultaneous crossfade it needs a unified
   always-slot-positioned grid — a deliberate follow-up, not done speculatively.
3. **Pre-existing Reanimated strict-mode warning** ("writing to value during
   render") — `useReorderDrag`'s `itemCountSV.value = itemCount` render-write,
   predates this leg (rows had it); now also exercised by the grid. Cosmetic dev
   warning; fix belongs to a reorder-runtime touch-up, not this cutover.
4. **Charter Part 8 verifications (results)**:
   - **All list per-side: VERIFIED CORRECT everywhere.** Virtual ids are typed per
     side (`VIRTUAL_ALL_IDS` → FavoriteListType, favorite-lists.service.ts:63;
     ListDetailPanel.tsx:81; BookmarksPanel per-side tiles; ProfileSectionsBody
     adds separate All-restaurants/All-dishes entries). No cross-type aggregation
     found; nothing to flag to the ListDetail session beyond "shape already
     matches".
   - **Visibility canon: profile half MATCHES** (`listPublicForUser` filters
     public; toggling private removes from profile). **Two shipped-code
     CONTRADICTIONS with "private stays shareable/collaborative" FLAGGED, not
     built** (recorded in product/favorites.md with the canon): RT-18 private-flip
     deletes collaborators + kills share (favorite-lists.service.ts ~:535), and
     `enableShare` silently flips a private list public (~:935). Both belong to a
     future owner-decided pass — they are server behavior changes with product
     consequences (dead-link semantics shipped deliberately in the registry run).

### Leg 5 — STATUS: BUILT + JEST/SIM-VERIFIED (2026-07-12). UNCOMMITTED; owner

finger-tests legs 2+3+4+5 together. Parallel sessions in the tree (snap-law nav
runtime + map lens-transport) — do not co-attribute at commit.

## Leg 6 — visibility canon (API)

Status: BUILT + RED-proven (2026-07-12). Scope = the owner's ratified visibility model
(charter Part 8: **visibility controls DISCOVERY, never ACCESS**) applied root-level to the
favorites API + the mobile copy conformance sweep. No schema change, no migration.

### The transition matrix (before → after, per cell)

| Transition                                                                       | Before (RT-18-era)                                                                              | After (canon)                                                                                                   |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| public → private (`updateList`)                                                  | deleted ALL collaborators + `shareEnabled=false` in one tx (slug row kept dead)                 | writes `visibility` ONLY; collaborators + live link survive; list drops off the profile                         |
| private → public (`updateList`)                                                  | visibility write only                                                                           | unchanged — visibility write only; list auto-appears on profile                                                 |
| `enableShare` on PRIVATE                                                         | minted/kept slug, `shareEnabled=true`, **force-flipped visibility→public**                      | mints/returns slug + `shareEnabled=true`; visibility untouched (private stays shareable)                        |
| `enableShare` on PUBLIC                                                          | slug + `shareEnabled=true`, visibility kept                                                     | unchanged                                                                                                       |
| `disableShare` (either visibility)                                               | `shareEnabled=false` only (slug kept dead → 410 {state:'private'})                              | unchanged — this IS the link revocation; collaborators untouched                                                |
| collaborator add (join via slug), either visibility                              | slug+`shareEnabled` gated; visibility never consulted                                           | unchanged; new spec pins join-on-private explicitly                                                             |
| collaborator remove (leave/kick), either visibility                              | individual deleteMany                                                                           | unchanged — the ONLY collaborator revocation path now                                                           |
| slug read (`getListForUser`/`getListResults`/`getSharedList`), either visibility | slug capability; visibility never consulted (but a private flip had killed the link upstream)   | unchanged mechanics; link now survives private flips — spec pins slug-read-on-private                           |
| profile appearance                                                               | `listPublicForUser` filters `visibility: public`                                                | unchanged — public ⇒ auto-appears, private ⇒ disappears (verified intact)                                       |
| share-link view vs collaborate mode                                              | orthogonal (view = slug read; collaborate = explicit `POST …/collaborators/join` with the slug) | unchanged                                                                                                       |
| 410 {state:'private'} wire shape                                                 | dead slug (share off) / blocked pair                                                            | unchanged wire shape; now means "sharing revoked", never "list went private" — comments + client copy corrected |

### Deleted

- The `flippingPrivate` cascade in `favorite-lists.service.ts updateList` (tx +
  `favoriteListCollaborator.deleteMany` + `shareEnabled:false`).
- The visibility force-flip in `enableShare`.
- The cascade spec `describe('private flip (spec B.1.1)')` in
  `favorite-lists.mutations.spec.ts` (replaced, see below).
- Answered open questions in product/favorites.md (Spotify two-knob, share-a-private-list,
  post-to-profile analog — all resolved by the canon).

### Spec coverage (all in favorite-lists.mutations.spec.ts, new describe

"visibility canon … visibility = discovery, never access")

1. private flip touches ONLY visibility (no collaborator delete, no shareEnabled write) — **RED-proven**: fails against HEAD's service (verified by checking out HEAD's file: 2 failed / 28 passed).
2. enableShare on a private list never writes visibility — **RED-proven** (same run).
3. link holder keeps reading a PRIVATE list (slug grant across the flip).
4. collaborator keeps seat + mutation grant on a PRIVATE list.
5. PRIVATE list stays joinable as collaborator via its live slug.
6. disableShare = the lock: kills the link only, collaborators untouched.
   Favorites module: 5 suites / 52 specs green; full API jest/tsc/lint green (see below).

### Record corrections (RT-18 written down)

- `favorite-list-access.policy.ts` header: RT-18 slug-as-capability STANDS; visibility-never-
  consulted stated as law; "gone private" phrasing → "sharing revoked".
- `favorite-lists.service.ts` comments (getSharedList / updateList / enableShare).
- `plans/w1-listdetail-structural-spec.md` B.1.1 private-flip sentence struck + superseded note.
- `product/favorites.md`: canon bullet rewritten to the ratified one-liner (contradiction
  flags removed — fixed); collaborative-lists bullet corrected; list-config Spotify-knob
  paragraph resolved to the one-toggle model.
- `plans/red-team-2026-07-10.md` RT-18 entry = slug-capability only (no cascade text) — left as-is.

### Mobile conformance sweep (copy/logic only — fence respected: no toggles/, no nav/search runtime)

- `components/ShareModalHost.tsx`: confirm-dialog copy no longer claims the list "becomes
  visible/public" — now states the link grants view access and Public/Private is untouched;
  rationale comment corrected. (The confirm itself KEPT: minting a live link is still an
  access grant worth an explicit yes.)
- `components/share-modal-store.ts`: `listOwnedByViewer` doc comment corrected.
- `overlays/panels/ListDetailPanel.tsx`: dead-slug body copy "This list is private." →
  "This list is no longer shared." (testID `list-detail-private` kept — wire shape
  {state:'private'} unchanged); comment corrected.
- `use-search-foreground-launch-intent-runtime.ts`: comment-only body-name correction.
- `BookmarksPanel.tsx` Make Private/Make Public action: no cascade-assuming copy existed;
  its long-press Share (enableShare w/o confirm) is now harmless under the canon (link
  mint only) — left as-is. SaveListPanel visibility toggle: plain Private/Public segmented
  value, no access claims — reads correctly against the model.
- Mobile: eslint clean on touched files; `tsc --noEmit` shows only the 2 KNOWN pre-existing
  map-session Camera-patch errors (search-map.tsx nativeHostKey / animationCompletionId) —
  not mine.

### Product questions surfaced (not improvised)

- None blocking. One naming note: the 410 body keyword stays `state:'private'` on the wire
  while its meaning is now "sharing revoked" — kept for zero client/API churn; rename only
  if the owner wants the wire vocabulary to match the canon.

UNCOMMITTED per instruction; parallel strip/map sessions share the tree — do not co-attribute.

## Leg 7 — wave-2: §1 engine/edit defects + §2 home restructure + §3 polls strip

Status: IN FLIGHT (started 2026-07-13). Charter: plans/wave2-lists-transitions-charter.md
§1/§2/§3 (+§8 decisions, §9/§10 fences). Sequencing law: §1 defects are fixed at the
ENGINE/CORE layer and sim-verified ON the home edit surface FIRST; only then is the home
edit surface deleted (§2) — the fixes live below the surface being deleted, so ListDetail
inherits them.

### §1 root causes (attributed before fixing)

1. **Edit chip snap-in (D1)** — the consumer animated only the NEWCOMER (Animated.View
   entering=FadeIn + layout=LinearTransition on itself); sibling slots had no layout
   animation, so they SNAPPED to their pushed positions. Engine fix: StripHoleSlot is now
   a Reanimated view; the engine keeps a per-strip mount ledger (seen/late slot keys) and
   any slot mounting AFTER the strip's first commit animates its REAL width 0→intrinsic
   (240ms, symmetric 180ms exit) — siblings are pushed by genuine per-frame layout and
   their onLayout stream keeps the frost holes riding the controls. Consumer wrapper
   deleted (BookmarksHomeStrip Edit chip is a plain child now).
2. **Reverse morph broken (D2)** — consumers pass `actionRow` conditionally on the SAME
   state that drives actionProgress→0, so on Cancel the action LAYER (whose full-band
   white plate tiles the band complementarily with the toggle row) unmounted on frame one
   of the reverse: strip snapped out, frost showed, toggle row returned plate-less.
   Engine fix: action-row RETENTION — the engine holds the last non-null actionRow while
   actionProgress > 0; exit = entry reversed by construction; exiting layer is
   pointerEvents 'none'.
3. **Drag auto-scroll missing (D3)** — BookmarksPanel resolved the scene scroll handle in
   `useMemo(..., [])` at the data surface's FIRST (pre-warmed) render; the handle
   registers in the scroll runtime's EFFECT, which commits later → adapter null forever →
   the math's edge pump computed steps into a void. Fix: resolve at EDIT ENTRY (inside
   the editGridProps memo) + dev bark if null (RED contract).
4. **Drag clamp (D4)** — new engine input `minTranslationY` in computeDragFrame (floors
   the finger translation BEFORE scroll compensation → screen-space clamp invariant under
   auto-scroll; slot hit-test uses the clamped value so the tile holds and rejoins).
   ReorderableGrid gains `resolveDragClampTopY` (lift-time resolver — the header rides
   the sheet); bookmarks wires it to the strip's measured band bottom + the host's 8px
   spacer (chrome measures, body reads). 3 new math specs.
5. **Fast-grab (D5)** — the handle pan required 4px of movement before ATTEMPTING
   activation; a fast grab let the outer native sheet scroll recognize first and CANCEL
   the pan mid-lift (tile snaps back, list scrolls under the finger). Grab-then-pause
   "worked" because the BODY long-press (300ms) was doing the lifting — the hold-timer
   interplay the owner suspected. Fix: the handle is a dedicated drag affordance —
   `manualActivation(true)` + activate on onTouchesDown (iOS reorder-control standard);
   activation precedes any movement, no recognizer race exists. Rows + grids.
6. **Save spinner (D6, in-scope instance)** — Save button ActivityIndicator → the
   sanctioned SquircleSpinner to the RIGHT of the label; the header loading
   ActivityIndicator row deleted (skeleton already owns readiness). App-wide spinner hunt
   = §5 (UI leg).

### Coordination notes (fence §10)

- Parallel nav/perf session ACTIVELY editing navigation/runtime mid-leg (file mtimes
  seconds old during verification): AppShellMainNavigator imports a deleted
  use-app-route-nav-out-derivation-writer-runtime (tsc error beyond the 2 known Camera
  errors — theirs, preserved) and a live HMR redbox from
  app-route-sheet-frame-host-native-targets.ts mid-edit. New untracked files
  (header-nav-action-registry.ts, app-route-root-nav-items.ts) suggest §4 plus/X work in
  flight. Sim verification is being batched into quiet windows.

### §3 registry findings (reported, then implemented)

- **"Default" sort was a vocabulary lie**: the client mapped Default → omit `sort`;
  the API resolves `query.sort ?? PollListSort.new` (polls.service.ts) — plain
  chronological newest-first. No demand-ranked default order ever existed server-side
  (the old mobile comment claiming "silent demand-ranked order" was wrong). Killing
  "Default" and stating **New as the default** changes ZERO feed behavior — it makes
  the vocabulary honest. Jarvis rec (New) implemented; consistent with docs.
- Master sort per §3: Sort chip displays its VALUE (New/Trending/Top); the TIME chip
  is DELETED as a standalone axis and exists only under Top as a CONDITIONAL strip
  citizen (rides the new engine width-grow entry/exit) with **Today / This week /
  This month / All time** (API `PollListTime` gained today=24h, this_month=30d
  rolling; time is sent only when sort=top). Type chip shows its value ('All' at
  rest). Live → **"Live · N"** (body writes `liveCount` into
  polls-feed-controls-store when an ACTIVE slice lands — bootstrap included; chrome
  reads; count retained while browsing Closed; liveCount writes never fire the press
  edge — spec'd). Results → **"Closed"** (Jarvis rec, owner may veto).

### §2 executed

- **Home edit mode DELETED end-to-end**: Edit chip, action-row wiring
  (actionRow/actionProgress on the home strip), edit session + undo/redo/save
  machinery, ReorderableGrid mount, read-grid geometry capture, edit lock usage,
  BookmarksTileEditContext, editStrip\*/editChip/tileActiveDrag styles, and the
  store's edit-session model (bookmarks-home-controls-store = {listType, sortMode}
  only). KEPT: the engine action-row slot, slot-map math, ReorderableGrid/
  useReorderDrag + handles (ListDetail relocation), overlaySheetEditLockRuntime
  (ListDetailPanel is a live consumer).
- **Been/Want-to-go (+ dish pair) are REGULAR lists (both sides)**: API deleteList
  systemKind guard deleted; orderHomeLists pinned-prefix deleted (uniform
  custom-vs-recently-updated across ALL lists — moved system lists participate in
  the divergence test); mobile sortListsForDisplay de-pinned; edit pinning gone;
  ProfileSectionsBody Delete row unconditional. systemKind survives ONLY as
  provisioning provenance (once-ever unique). Specs rewritten (defaults spec:
  deletable system default + no-pin ordering + moved-system-list custom order).
- **Rename Favorites → Lists**: header title, nav label
  (app-route-root-nav-items.ts — ONE-LINE overlap with the parallel session's new
  file, label only), close a11y label. **Code-vocabulary rename (bookmarks/favorites
  identifiers, scene keys, module names) DEFERRED**: the perf session is actively
  editing navigation/panels on this shared tree; a wholesale identifier rename
  mid-flight would guarantee corruption. Needs a quiet-tree mechanical pass.
- **Ellipsis modal restyle**: AppModal gained a first-class `variant: 'menu'`
  (left-aligned title; lucide icon + text rows; no color blocks/separators/Cancel)
  - per-action `icon`. Items per charter: Share · Delete (destructive) ·
    Add to/Remove from profile (visibility) · Use your photos/Use Crave photos ·
    Pin on/Unpin from profile. Pin uses the EXISTING `pinned` field; "Use your
    photos" got a real persisted seat: `use_own_photos` column (manual additive
    migration 20260713100000 + migrate resolve — prisma wanted a destructive reset,
    refused), DTO/mapper/mobile service plumbed; round-trip sim+DB verified.
    Old modal rows deleted: Edit (form edit-mode pruned to create-only),
    Make Private/Public (subsumed), Cancel.
- **Home toggles**: Custom → "Custom rank"; both chips display VALUES (Recent /
  Custom rank). Registry verification: page-registry §8.11 + wave-1 charter Part 4/8
  (no visibility filter; §8.15 home strip stays) ⇒ with edit relocated, the complete
  home inventory = Sort(Recent/Custom rank) · Restaurants/Dishes — built matches.
- **All tile**: thin row — icon + subtext deleted; "All restaurants"/"All dishes" +
  chevron; takes the TOP slot. The New-list card became a compact row BELOW the grid
  (create-only form kept) — interim seat pending §4's header plus. FLAGS for owner:
  (a) list RENAME currently has no UI seat (modal Edit row deleted per charter;
  rename relocates with ListDetail edit); (b) "Use Crave photos" toggle-back wording
  is mine, not specced.
- Icons: BookmarksPanel + ReorderableGrid swept @expo/vector-icons Feather → lucide.

### Sim verification (verified-fresh bundles via reload-dev-client.sh each round)

- D1: 30fps frame sequence shows the Edit chip's REAL width growing over ~7 frames,
  siblings pushed by live layout, cutouts riding (e05→e10). Same engine animation
  observed on the polls Top-period chip (p110→p120).
- D2: reverse morph frames (c078→c090) show the action row sliding out LEFT with its
  plate while the toggle row rides in from the right on ITS plate — complementary
  tiling, zero bare frost; exact mirror of entry.
- D3: 3.5s handle drag into the bottom band auto-scrolled the sheet (pump log w/
  live adapter + visibly scrolled content + live reorder).
- D4: clamp armed at lift (measured header bottom 179.3pt) — video frames show the
  lifted tile PINNED with its top at the header's bottom edge while the finger
  continued to 5% screen height; slot hit-test clamps with it; 3 new math specs.
- D5: 250ms fast-grab activates ON TOUCH-DOWN, clean drop, zero recognizer
  cancellations. Instrumentation exposed + fixed a SECOND defect: the body
  long-press pan could double-begin an active handle drag at 300ms (translation
  baseline reset mid-drag) — gesture OWNERSHIP arbitration added to useReorderDrag
  (first recognizer claims the drag; the other's worklets are inert).
- §2/§3 composites: Lists header + nav label; Custom rank chip w/o Edit chip
  post-deletion; slim All tile; menu modal exact-to-spec; "Live · 3" dynamic count;
  Closed rename; Top→period-chip entry/exit; feed_query finalized cycles for
  Top/this_month/New (restarted API accepts the new enum values).
- Temp [DRAGDBG] markers removed; final marker-free bundle boots clean.

### Gates + coordination

- mobile: tsc = ONLY the 2 documented Camera-patch errors; eslint 0 on touched;
  jest 280/280. api: tsc 0; jest 263/263 (favorites 53 incl. Media agent's
  tile-gallery spec; polls 23). Shared API rebuilt + restarted per the migration
  recipe (health 200) — includes Media agent's tile-gallery work from the same tree.
- Parallel-session overlaps PRESERVED (never reverted): nav runtime snap/nav-out
  work (incl. their transient mid-edit breakage — AppShellMainNavigator import +
  a native-targets redbox + a UserProfilePanel transform error, all theirs, all
  self-healed), Media agent's favorites tileImages/tile-gallery service. My only
  edit inside their files: the nav label string in app-route-root-nav-items.ts.
- Rig data: 8 temporary "Leg7 test" lists seeded then deleted; Been's
  use_own_photos toggled on/off (restored).

### Leg 7 — STATUS: BUILT + SIM-VERIFIED (2026-07-13). UNCOMMITTED per instruction.

## Leg 9 — BUILD the ListDetail design (plans/listdetail-ideal.md §3 sequence)

Status: IN FLIGHT (started 2026-07-13). Charter: wave2 §6; design of record: listdetail-ideal.md.
Fences honored: PollsPanel/BookmarksPanel untouched; search-runtime files diff-first (perf session
edits preserved: submit-owner seam dispose, panel spinner sweep from UI leg 6). Sim owned by UI
leg 7 checklist first — polling root-snap-law.md between build items.

### Recon notes (diff-first, 2026-07-13)

- Dirty-but-foreign files I will edit additively: use-search-submit-owner.ts (perf seam-dispose),
  ListDetailPanel.tsx (UI leg 6 spinner sweep + Action-slot deletion — preserved as base).
- Results cards ALREADY carry the gallery row (CardPhotoStrip/PhotoStrip — the media seam);
  step-4 gallery work = plus-sliver geometry (1/6–1/8 image width) + slot on the extracted card,
  not a new strip.
- getListResults already accepts {openNow, userLocation, shareSlug, sort, targetUserId} — sort
  can ride the world fetch; NO price param exists on the list-results API (Price chip finding, see below).

### Built (2026-07-13) — steps 3 + 5 + 7 (+ child-page edit semantics + the RENAME seat)

**Step 3 — header/meta (DONE).**

- The LIST NAME is the header text: entity-ref policy's list arm now carries `title: ref.label`
  (entity-ref-action-policy.ts) → listDetail entry params gained `title` (app-overlay-route-types)
  → ListDetailPersistentHeaderTitle paints it at frame 1; slug opens resolve at meta time through
  a new entryId-keyed HEADER SEAT store in ListDetailPanel.tsx (body publishes {name, openMenu};
  Title/Extras read the TOPMOST listDetail entry via a header-scoped topmost selector — topmost-
  per-key is CORRECT for singleton header chrome, unlike leg bodies). Cold slug open with no seed
  = CutoutSkeletonTitle (the restaurant pattern). Body title row DELETED; content moves up.
- Meta block: avatar stack chip flush under the header (marginTop deleted, first body element),
  `username · N dishes/N restaurants` (typed per side) right of the stack.
- BookmarksPanel/ProfileSectionsBody untouched (fence) — the label already rode the EntityRef.

**Step 5 — strip declaration (DONE, content-consequence for now).**

- Hand-rolled SortChips + two-row translate morph DELETED; ListDetail declares the ToggleStrip
  engine: placement 'in-list' (foundation row was already declared — stale comment fixed in
  scene-foundation-spec.ts), backdrop 'plated-body', module cacheSeat, contentInset 20.
- Inventory: Edit chip (owner/collab ∧ sort=custom ∧ rows>0; engine citizen entry/exit) ·
  Sort SelectorChip (VALUE-displayed; My ranking/Their ranking iff custom exists or can-edit ·
  Best · Recently added; OptionSelectorSheet via toggleOptionSelector) · Open now FilterChip
  (now actually passed to getListResults — it never was before) · Market (virtual All only,
  honest-disabled: no data path, see defects). Price OMITTED (see defects).
- Consequence: `useContentToggle` seam (surface 'list-detail') — press-up hides rows, runner
  refetches via queryClient.fetchQuery on the settled slice (burst-coalesced, run-time slice
  read), captureControlBaseline restores sort/openNow on failure; resultsQuery keeps previous
  data as placeholder so slice flips never re-trip the full-page gate. Flips to consequence
  'world' with the step-1 trigger rewire (recorded below).
- Full-bleed law: listDetail got its own body transport WITHOUT paddingHorizontal
  (app-route-static-scene-descriptor-controller.ts LIST_DETAIL_BODY_TRANSPORT); the panel pads
  per-block (pageBlock = 20), strip full-bleed.
- Edit action row now rides the ENGINE actionRow/actionProgress slot (first real consumer of
  the leg-2 slot): Cancel · Undo/Redo · Save (SquircleSpinner), retention/reverse morph free.
- Icon sweep: all Feather → lucide on the touched panel (§8 decision).

**Step 7 — header ellipsis Extras (DONE).**

- ListDetailPersistentHeaderExtras on the leg-6 seam: opacity rides the SAME transitionProgress
  SV as the plus→X rotation (starts on press-up by construction; the house pattern restaurant
  heart+share use). Renders nothing for virtual All / unresolved meta (seat openMenu null).
- Opens the §2 restyled 'menu' AppModal: Share · Rename · Delete · Add/Remove from profile ·
  Use your/Crave photos · Pin/Unpin — Share for every role, curation rows owner-only; all
  service-backed (update/remove + favoriteListKeys.all invalidation; Delete pops the route).

**RENAME seat (decision, owner-reviewable).** Rename lives in the header-ellipsis menu, not
inside edit mode: it is metadata curation beside Share/Delete/Pin, available on every owned
list (incl. Been/Want-to-go per §2) independent of edit-mode preconditions (sort=custom,
rows>0) — edit mode stays the CONTENT (ordering) session. Input surface = AppModal `prompt`
(the Alert.prompt-parity seat); PATCH name → meta + home-lists invalidation (header updates
via the seat). This closes leg 7's "rename has NO UI" flag.

**Child-page edit semantics (charter §6, the mode-session half of step 6).**

- Header X = CANCEL while editing via registerHeaderCloseAction('listDetail', …) (the
  sanctioned close-override lane search/restaurant use), with a discard-confirm AppModal when
  the history has uncommitted moves; unregisters on session end. Sheet promote + edit lock
  unchanged.

**Gates:** mobile tsc = only the 2 documented Camera errors; eslint 0 on touched files;
jest 25/280 green. API untouched. SIM = PENDING (UI leg 7 owns the simulator; root-snap-law
has no Leg-7 completion section yet). Sim checklist for whoever runs it: tile tap → name
paints frame-1 + ellipsis fades with the rotation; slug open → title skeleton → name; strip
frost cutouts + full-bleed (zero [ToggleStrip] barks); sort sheet + Open now re-slice with
press-up row exit; Edit chip width-grow entry when sort flips to custom; edit morph
enter/exit via engine; X mid-edit → discard-confirm; menu rows round-trip (rename persists,
delete pops, pin/photos/visibility flip); two stacked list entries show the right header.

### Primitive defects found by the proving ground (the test's point)

1. **computeDragFrame has NO variable-height slot support** (uniform `rowHeight` stride,
   columns 1|2 only — reorder-drag-math.ts). ListDetail's declared edit geometry (1-column
   variable-height rich rows) is unimplementable until the core grows slot maps; the
   EDIT_ROW_HEIGHT content swap therefore SURVIVES this leg (step 6 = core math first, then
   the swap dies).
2. **No surface-agnostic edit-mode primitive**: order/history/historyIndex session, undo/redo,
   dirty-check, X=Cancel registration are all hand-rolled per panel (ListDetail today; Bookmarks
   before deletion). Charter §6's owner clarification demands ONE declarable mode-session
   primitive — extract with step 6 (this leg built the pieces AT the sanctioned seams so the
   extraction is a lift, not a redesign).
3. **'world' consequence is results-hardwired**: the only floorSignal producer is the results
   presentation coordinator; a child page cannot declare consequence 'world' until the step-1
   world backing exists. ListDetail ships content-consequence (honest for a self-fetching body).
4. **Price chip has NO data path**: /favorites/lists/:id/results takes no priceLevels param
   (openNow only), and the world fetch list arm passes none either — the §2b inventory's Price
   (world) chip needs an API leg. OMITTED rather than shipped dead. Market likewise (rows carry
   no marketKey) — shipped honest-disabled on virtual All per the existing precedent.
5. **PhotoStrip plus tile ≠ the decreed plus SLIVER** (0.75×height wide vs 1/6–1/8 of an image
   block). Fix belongs at the PhotoStrip primitive with the step-4 gallery-slot work so results
   - listDetail inherit together; note: at today's 56–72px strip heights a literal /6–/8 sliver
     (~10–16px) cannot hold the plus — geometry needs an owner feel-check with bigger gallery
     tiles.
6. **World-present is coupled to the results scene**: enterForegroundEffects →
   onPresentationIntentStart → requestSearchPresentationIntent drives the SEARCH-RESULTS
   session/scene. A world-backed CHILD push (list) must present map+world WITHOUT entering the
   results scene — step 1 needs a presentation-intent lane for child-world enters.
7. **World residency is designed but unwired**: search-world-cache pin/unpin has ZERO
   production callers; no "nearest world-backed entry" binding to the scene stack exists; the
   ONLY 'dismiss' tuple writer is clearSearchState (full idle teardown). Step 1's dismiss leg
   must build the stack↔cache binding (or v1: idle-write on last-world-entry pop) — the leg-8
   doc's "machinery exists (restaurant child does this today)" is TOO GENEROUS: the restaurant
   child never changes presentedWorldId, so nothing re-presents anything today.

### Step 1/2 wiring notes for the continuation (attributed this leg)

- Composite verb: policy list arm → executor pushes route THEN dispatches the world half;
  desire write = writeSearchDesiredTuple with identity {kind:'list', listId, listType,
  displayTitle} cause 'favorites_launch' (the arm + resolver fetch getFavoritesListResults +
  reconciler case are ALL alive; sort must join the tuple — recommend filterVariant-class so a
  sort flip classifies variant_rerun, with shareSlug as non-equality access material).
- listType is known at the tap sites (BookmarksPanel listType / handleOpenAll side) but is NOT
  on EntityRef — extend EntityRef (or the list arm) when wiring.
- Sheet motion: descriptor row today = `to:'listDetail' → snapTo 'expanded'`; the owner decree
  ("drops to middle if at top") needs `snapTo 'middle'` (promoteAtLeast never demotes — the
  leg-8 §1d.3 wording is wrong on this point).
- fitAll (step 2): NO fitBounds exists — camera is center+zoom via CameraIntentArbiter.commit
  (use-search-runtime-camera-intent-runtime.ts); resolveFocusCamera is the fit math home and
  its FocusCameraSafeRegion the type; the only safe-region computer today is the profile
  multi-location runtime (ad hoc from window dims — the search-bar→mid-snap helper must be
  built); reveal rampStart lives in use-results-presentation-marker-enter-runtime (no camera
  track — world-camera L2's impure half still to build). RED: unexecuted-intent bark.

### Leg 9 — STATUS: steps 3/5/7 BUILT, gates green, SIM PENDING (leg-7 fence). Steps 1

(trigger rewire), 2 (fitAll), 4 (ResultCard extraction + gallery slot), 6 (slot-map drag core

- edit-primitive extraction) → continuation; defects 6/7 above are the step-1 design inputs.

## Leg 10 — step 6-core PRIMITIVE + step 2 fitAll + price path; step 1 GATED-STOP (2026-07-13)

Charter: leg-9 continuation (steps 1/2/4/6 + defect #4). Gates: mobile tsc = only the 2
documented Camera errors; eslint 0 on touched files; jest mobile 26/294 + API 24/263 green.
NOT COMMITTED. SIM = PENDING (root-snap-law has no Leg-7 completion section — UI leg 7 still
owns the simulator; gates + walkthroughs only this leg).

### Step 6-core — BUILT (primitive defects #1 and #2 CLOSED)

**Variable-height slot math (defect #1).** `computeDragFrame` gained `slotBoundaries` —
LIFT-TIME prefix boundaries (length itemCount+1); vertical hit-test becomes "the interval
containing the lifted item's center (lift-slot center + translate)". Boundaries are FROZEN
AT LIFT (captured in useReorderDrag's beginDrag) so the reference geometry never shifts
under live shuffles — no swap oscillation by construction. UNIFORM REDUCTION PROVEN in spec
(reorder-drag-math.spec.ts): with stride h, boundaries[k]=k·h ⇒ containing index =
lift + round(t/h) VERBATIM, including the round-half-up tie (test sweeps ±ties). Grid
(columns>1) path untouched; malformed boundaries fall back to uniform. `useReorderDrag`
exposes `liftTop` (render base, both modes); `ReorderableRows` gained `variableHeights`
mode: rows self-measure (onLayout; spacing must live INSIDE the row), prefix sums mirrored
to the UI thread for settled-row animation, drag hook freezes its own copy. 21 math tests
green.

**Edit-mode session primitive (defect #2).** NEW `src/overlays/edit-mode-session.ts`
(`useEditModeSession`): the ONE declarable mode session — order/history/historyIndex +
undo/redo + settled-order dedupe; per-entry sheet edit lock; header X = CANCEL
(discard-confirm when dirty) on the sanctioned close-override lane; actionProgress SV
(0=toggle row, 1=action row) fed straight to ToggleStrip. Geometry + persistence stay with
the surface — ListDetail declares columns:1 variable rows; Bookmarks' 2-col tile grid is
the same declaration with grid geometry (a declaration away, per the owner clarification).

**ListDetail now DECLARES it.** The hand-rolled session (~150 lines), the bare
`ReorderableRows` content swap and `EDIT_ROW_HEIGHT` are DELETED. ONE rich-row model
(`ListDetailRichRow`) renders read AND edit mode: rows stay rich while dragging (photo
strip, score, note visible), lifted row gets a white-card treatment
(`styles.richRowActive`), handle = the reorder shell affordance (the per-card
ellipsis→handle crossfade belongs to the step-4 card footer slot — noted below).

### Step 2 — BUILT world-generic (producer wiring rides step 1)

NEW `runtime/camera/resolve-fit-all-camera.ts` (+8-test spec):

- `resolveWorldFitSafeRegion` — the decreed safe region (search-bar bottom → mid-snap sheet
  top; inputs are the two boundary lines calculateSnapPoints already yields), returns
  FocusCameraSafeRegion + topPx/mapWidthPx for camera padding.
- `resolveFitAllCamera` — the PURE exact fit: bounds of ALL members (no outlier cut, owner
  decree), mercator-correct mid-latitude, per-axis zoom solve, fitPaddingFactor 1.2,
  zMax 15 ceiling (single-member lists must not dive to street level — tunable). Empty fit
  RED-throws. Spec proves exact inclusion by re-projection (San Antonio outlier INCLUDED).
- `commitFitAllCamera` — executor: fit → CameraIntentArbiter.commit with safe-region
  PADDING + easeTo; returns the arbiter verdict — the step-1 caller MUST bark on false
  (unexecuted-intent RED), never swallow.
- Motion correction: descriptor row `to:'listDetail'` flipped snapTo 'expanded' →
  snapTo 'middle' (absolute — an expanded sheet DROPS, per the owner decree that
  promoteAtLeast could never honor). Motion-table spec green.

### Price data path (defect #4) — CLOSED, additive, no migration

API: `FavoriteListResultsDto` gained `priceLevels` (search-DTO vocabulary, 0–4, validated);
assembler passes it into the executor request — the executor's price filter +
priceFilterApplied metadata were ALREADY live, so this was pure plumbing. Mobile:
`getListResults` takes `priceLevels`; ListDetail strip gained the Price chip
(SelectorChip, VALUE-displayed per the §2 chip law: $/$$/$$$/$$$$, 'Any price' clears)
through the option-selector seat, sliced through the same content-toggle seam
(kind 'price'; baseline capture restores it on failure). v1 vocabulary = exactly-one-level;
range parity with the results Price sheet is a follow-up when the card/strip parity pass
happens. API favorites suites 6/58 green.

### Step 4 — plus SLIVER built at the PhotoStrip primitive; ResultCard extraction NOT built

**Plus sliver (⚠ OWNER FEEL-CHECK).** The decree (1/6–1/8 of an image block, image height)
cannot hold the plus at current strip heights: block = height·4/3 → 75px at h=56 (list
rows), 96px at h=72 (results) → /6–/8 = 9–16px. Built the closest tasteful geometry AT THE
PRIMITIVE (PhotoStrip.AddTile, so results + listDetail inherit together):
`width = max(round(block/6), 24px)` → **24px wide at both current heights** (~1/3 of a
block at h=56, 1/4 at h=72), icon 14px, ~5px side padding, replacing the old 0.75×height
tile (42/54px). The literal decree lands only with bigger gallery tiles — owner call.

**ResultCard extraction deferred — honest boundary, not scope-shed.** The results cards are
search-entangled at every layer (RestaurantResultCardDescriptor prepared-descriptor cache,
useTopFoodMeasurement + interactionRef, shared `screens/Search/styles`, SearchInteraction
context): a byte-parity extraction is a full leg, and its ONE acceptance criterion —
"results must not change visually" — is UNVERIFIABLE while UI leg 7 owns the sim. Doing it
blind half-lands the step. Plan for the extraction leg: `components/cards/ResultCard`,
results variant = literal move (styles travel with it), listDetail variant adds note line +
footer slot (ellipsis↔handle crossfade — closes the step-6 handle note) + add-photo,
read-only variant strips edit affordances; gallery row = PhotoStrip as a declared slot
(sliver geometry above already shared).

### Step 1 — GATED STOP (per the hard gate; conflict + recommendation)

Read plans/map-world-lens-transport.md end-to-end. **No STRUCTURAL conflict with the lens
design**: the lens strangler reshapes the JS→native data plane BELOW the desire→resolver→
reconciler→presentation pipeline; a list world is just another desired tuple, and the
minimal child-world presentation lane (present map+world without entering the results
scene) sits above the lens seam — forward-compatible. **But the gate's second clause
fires:** the lane's landing zone is exactly the perf/map session's live uncommitted edits —
`search-world-presentation-seam.ts` (their world-commit-hold + dispose fix),
`use-search-submit-owner.ts`, `search-world-resolver.ts`, the ENTIRE
`use-results-presentation-*` family (their dismiss-lockstep + presentation-epoch work),
`use-search-map-native-render-owner.ts` (their S-1b fan-out). Editing enter/close
presentation runtimes mid-flight in another session's design of record is the exact thing
the fence forbids. STOPPED.

**Recommendation for the orchestrator:** run step 1 as its own leg immediately after the
perf/map session commits (their §8/§11 ledger says device-verified, uncommitted). Design is
ready to execute as specified (listdetail-ideal §1d + leg-9 wiring notes): composite verb on
the policy list arm (pushScene + world identity {kind:'list', listId, listType,
displayTitle}, sort riding filterVariant-class, shareSlug as access material);
the presentation-intent lane should be a PARAMETERIZATION of the existing
requestSearchPresentationIntent (scene-agnostic "present world" verb keyed by the pushing
entry) — not a parallel path the lens strangler would delete; dismiss v1 = idle-write on
last-world-entry pop, stack↔cache residency binding as the ideal (defect #7). Step-2's
commitFitAllCamera + the 'middle' motion row are already waiting on the reveal-ramp hook
(use-results-presentation-marker-enter-runtime rampStart), with the arbiter-false bark as
the RED. ListDetail's strip then flips consequence 'content' → 'world'.

### Remaining in this domain (wave 2)

1. Step 1 world-backed push (gated above) → then strip consequence 'world' + camera-on-reveal.
2. ResultCard extraction leg (plan above; needs sim for byte-parity verification).
3. Owner feel-checks: plus-sliver 24px geometry; Price chip single-level vocabulary;
   listDetail open now snapping to MIDDLE (was expanded).
4. Market chip data path (rows carry no marketKey — still honest-disabled on virtual All).
5. Sim checklist (whoever gets the sim): leg-9 list + rich-row edit drag (variable heights:
   lift/settle/auto-scroll/undo-redo/X-cancel), price chip slice round-trip, listDetail
   open drops an expanded sheet to middle.

## Leg 11 — wave-2 close-out: ResultCard extraction + Market path + isDirty + FULL sim (2026-07-13)

Gates: mobile tsc = only the 2 documented Camera errors; eslint 0 on touched files; jest
mobile 27/300 + API 24/266 green. NOT COMMITTED. Dev API rebuilt+restarted per recipe (×3).
Sim = OWNED this leg (UI leg 7 done); every verdict from rig-verified bundles
(reload-dev-client.sh, quiescent hashes logged).

### 1. ResultCard PRIMITIVE extraction — BUILT, results BYTE-COPY PROVEN

- `components/cards/ResultCard/` = RestaurantResultCard + DishResultCard (git mv from
  screens/Search/components — literal move; search-side helper modules stay put and are
  imported, they are the results surface's prepared-render machinery). Variants = declared
  SLOT props, never forks: `note` (§8.1, under the gallery) · `footerSlot` (edit
  ellipsis↔handle seat — ships empty) · `onAddPhoto` (gallery grows the plus lead tile) ·
  `galleryHeight` (default 72). results = no slots passed ⇒ byte-parity by construction.
- **BYTE-COPY PROOF**: same "Best restaurants" results view screenshotted before/after on
  the same rig-verified boot path; pixel diff below the status bar = EMPTY (bbox None,
  0 px > threshold of 2.97M). scratchpad leg11/results-{baseline,after}.png.
- Gallery rows on results cards were ALREADY the card's last element (CardPhotoStrip 72px)
  — live photos confirmed for the photo-seeded restaurants, placeholder-empty elsewhere.
- ListDetail rows ARE the primitive now: ListDetailRow + ScoreDot DELETED; the rich-row
  model carries the source RestaurantResult/FoodResult; ONE renderRichRowCard feeds read
  mode AND the edit slot map (rank badge renumbers live from the session order). Wiring:
  heart = the SAME command-controller save handlers results use (house save sheet); card
  press = entity-ref executor (restaurantWorld lane); ⓘ = the ONE score sheet.

### 2. Market data path — CLOSED (leg-9 defect), + the honest vocabulary

- API: FavoriteListResultsDto gained `marketKey`; assembler passes it as the executor's
  `activeMarketKey` DIRECTIVE (core_markets geometry-Covers filter) — an explicit user
  slice on the same seam as openNow, NOT a revival of the implicit market AND-filter the
  viewport-only verdict wants removed. Spec: directive present/absent proven.
- Vocabulary finding: search rows carry NO per-row market provenance — the executor's row
  `marketKey` is a literal ECHO of the directive (`${activeMarketKey} AS market_key`), so
  chip options can never derive from rows. Source of truth = the markets table:
  NEW GET /markets/active (MarketRegistryService.listActiveMarkets) + mobile
  listActiveMarkets(); the chip (SelectorChip, VALUE-displayed, All lists only) reads it.
- SIM: All restaurants → Market sheet lists active markets; Austin slice → honest
  0-rows (NYC fixtures outside geometry); All markets restores. ⚠ OWNER FEEL-CHECK: the
  vocabulary = EVERY active market incl. poll-created localities (Aline, Carlstadt, …) —
  long list; probably wants isCollectable-or-major gating, owner call.

### 3. isDirty fix (orchestrator red-team) — FIXED + spec + sim-proven

- Dirty ⇔ current order ≠ baseline (history[0]) — `isSessionDirty` in NEW
  `overlays/edit-mode-session-core.ts` (pure, reanimated-free so jest can load it);
  close handler + returned flag both use it. Spec: 6 tests incl. the RED case
  (undo-back-to-baseline must NOT confirm) + mid-drag divergence.
- SIM: drag → undo → X exits with NO modal; drag → X shows the discard-confirm.

### 4. Sim-caught defects, root-fixed at the correct layer (all re-verified on-sim)

1. **Action row stacked/clipped (leg-9/10 build, first time on a screen)**: the engine
   wraps each DIRECT child of `actionRow` in a hole slot via React.Children.toArray —
   which cannot see through a component element/fragment; `<ListDetailEditActionRow/>`
   collapsed all three controls into ONE hug slot (vertical stack). Contract honored at
   the consumer: `buildListDetailEditActionRow(...)` returns an ARRAY of keyed siblings.
   Post-fix: Cancel · undo/redo · Save spread correct, morph + cutouts right.
2. **Price chip filtered NOTHING (leg-10 "pure plumbing" was a lie)**: the executor reads
   priceLevels from a PLAN-clause payload (extractPriceLevels over plan.restaurantFilters),
   never from request.priceLevels — the favorites assembler's hand-built plan carried none.
   Fixed: price payload rides the axis clause (both list kinds); spec added; SIM: $$ slice
   → only the $25–$50 row, count updates, Any restores.
3. **Score-info sheet landed OFFSCREEN**: a panel-local OverlayModalSheet absolute-fills
   the scrollable BODY's content box (sheet at content-bottom). House pattern applied: NEW
   root ScoreInfoHost + score-info-store (the OptionSelectorHost pattern) mounted in
   App.tsx; renders the ONE SearchRankAndScoreSheets with the sort half inert; ListDetail's
   ⓘ calls showScoreInfo(). SIM: sheet opens viewport-anchored, correct content.
   ⚠ SAME-CLASS SUSPECT: CollaboratorModal is also a panel-local OverlayModalSheet —
   likely mis-anchors on lists long enough to scroll (not re-verified this leg; the modal
   itself pre-dates leg 9). Follow-up chip candidate.

### 5. Full sim checklist (legs 9+10), item by item

- Tile tap → header IS the list name at frame 1, avatar stack flush + "username · N
  restaurants" typed count — PASS.
- Ellipsis present with the header on push (fade timing = eyeball item, structural PASS;
  exact sync with the rotation left to the owner feel-check).
- Strip full-bleed under the meta block; frost cutouts; ZERO [ToggleStrip]/[FOUNDATION]/
  [snap-law]/[JOINEDREVEAL] warns across the whole session (only DEBUG dispose lines) — PASS.
- Sort sheet (My ranking · Best · Recently added), VALUE-displayed chip, re-slice — PASS.
- Open now ON → honest 0-rows at 5 AM (all closed) + Edit chip citizen-EXITS at rows=0;
  OFF restores — PASS.
- Price slice round-trip ($$ → 1 row → Any restores) — PASS (after fix #2).
- Market (All lists only; concrete lists show no chip) slice + restore — PASS (after §2).
- Edit chip appears when sort flips to the saver's ranking (owner) — PASS (width-grow
  entry visible).
- Enter Edit → sheet locks expanded, X=Cancel, action row correct (after fix #1); rich
  rows STAY RICH while dragging (variable heights incl. photo-strip rows); drag reorders
  with live rank renumbering; undo/redo enable/disable correctly — PASS.
- Dirty-confirm ONLY when differing from baseline (both directions) — PASS.
- Save → PATCH persists (order survives a cold relaunch), sort stays My ranking — PASS.
- Header menu: Share · Rename · Delete · Add to profile · Use your photos · Pin on
  profile, owner rows gated; Rename round-trips (header + home tile) — PASS (Delete/pin/
  visibility/photos rows present; only Rename exercised end-to-end this leg).
- Card tap → restaurantWorld push → profile; X → return-to-origin lands the EXACT list
  (page+state) — PASS.
- Heart → house "Save to Restaurants" sheet — PASS. ⓘ → score sheet — PASS (after fix #3).
- Dish side: All dishes renders DishResultCard rows (6 dishes, strip w/ Market) — PASS.
- Results byte-copy — PASS (pixel-proven, §1).
- NOT RUN (recorded honestly): slug/cold open title-skeleton lane (no slug captured on
  the rig); two STACKED listDetail entries header check; drag edge-band auto-scroll +
  header clamp at scale (6-row list too short to force the band); Price/Open-now FAILURE
  baseline-restore (no fault injection on the rig).

### Plus-sliver (owner feel-check payload)

Measured on-sim from the live pixels: **24pt wide × 72pt tall** (71×215 px @3x incl.
dashed border) — exactly the leg-10 geometry (max(block/6, 24px) floor engaged; a literal
/6–/8 sliver needs bigger gallery tiles). Screenshots: leg11/x-after-undo.png (rows with
empty-gallery sliver), leg11/sliver-zoom.png (close-up), edit-mode-fixed2.png.

### Environment notes (not code)

- Restaurant-world launch from a list once showed "No restaurants found" with the pin
  already on the map before the profile presented ([PRESENTATION-WATCHDOG] "surface
  redraw readiness ignored", entity transaction) — the perf/map session's dismiss/epoch
  territory (their known JS-hydration-stall residual); cleared on its own.
- One corrupted nav state (Lists root sheet gone, re-tap inert) after an UNNATURAL path:
  lists-origin world → search-bar edit → back-cancel; NOT reproducible on the clean
  card→profile→X path (which return-to-origins correctly). Logged for the step-1 leg —
  dismiss/residency is exactly its design surface (defect #7).
- Fences honored: no perf/map session files touched (their live edits preserved);
  BookmarksPanel read with LC_ALL=C grep -a only.

### Remaining in this domain (wave 2) — the complete list

1. **Step-1 trigger rewire leg** (world-backed list push; GATED on the perf/map session
   committing) → flips strip consequence 'content'→'world', wires commitFitAllCamera +
   the 'middle' motion row (jest-level only until then), dismiss v1 idle-write.
2. **Owner gates / feel-checks**: plus-sliver 24×72pt; Market vocabulary breadth (all
   active markets vs collectable-only); Price single-level vocabulary; ellipsis-fade
   sync; listDetail open-now-at-top drops to MIDDLE (snapTo change — eyeballed as sheet
   opens middle, formal check with owner); "New list" row redundancy (leg-7 flag).
3. Small follow-up candidates ledgered above: CollaboratorModal anchoring re-check;
   NOT-RUN items if the owner wants them driven (slug lane, stacked entries, fault
   injection).

## Leg 12 — CollaboratorModal root host (ABSORBED into Leg 13; retry died mid-flight)

Inventoried 2026-07-13 by the Leg-13 retry: the dead process's work was COMPLETE in the
tree — `components/collaborator-modal-store.ts` + `components/CollaboratorModalHost.tsx`
(the ScoreInfoHost pattern), mounted in App.tsx; ListDetailPanel keeps visible/inviteState
authority and syncs the store (idempotent show()); the panel-local OverlayModalSheet mount
is gone (only the explanatory comments remain). Nothing to finish; recorded here so the
ledger carries the leg. NOT sim-verified this leg (sim not owned).

## Leg 13 — wave-3 corrections: home edit restore + card redesign + listEdit (2026-07-13)

Retry of a died leg (its only surviving work was Leg 12 above + the already-landed
ReorderableGrid engine from Leg 7). Scope = wave3-corrections-charter §1, §1b, §2.1, §2.4,
§2.8, §3, §4. Gates: mobile tsc = only the 2 documented Camera errors; eslint 0 on touched
files; jest mobile 27/304 + API 24/266 green. NOT COMMITTED. **NOT SIM-VERIFIED** — the UI
sibling's root-snap-law Leg 8 never appeared, so sim ownership was never confirmed; every
item below needs the sim pass before owner finger-test.

### §1.1 Home edit mode RESTORED ("My ranking" everywhere)

- Vocabulary: `Custom rank` → **My ranking** in BookmarksPanel sort options/labels
  (ListDetail already said My ranking via resolveCustomSortLabel).
- The ONE `useEditModeSession` primitive re-declared on the home surface
  (BookmarksDataSurface declares; sceneKey 'bookmarks'); a new **edit seat** on
  bookmarks-home-controls-store carries the live session to the header strip (body
  writes, chrome reads — the leg-3 law). Edit chip = keyed conditional STRIP CITIZEN
  (engine width-grow entry §2.1) shown when sort = My ranking and rows > 0.
- Edit body = **ReorderableGrid 2-col tiles** (the Leg-7 grid engine's first consumer):
  cell geometry derived from the measured read grid (uniform tile height by the §1.2
  tile anatomy), All tile pinned/disabled, ellipsis seat becomes the grab handle,
  edge auto-scroll through the scene scroll handle. Save = per-list PATCH
  /position diffs (system lists move too — wave-2 regular-lists canon), invalidate,
  sort flips to My ranking. Action row = the SHARED buildEditModeActionRow.

### §1.2 Tile 2x2 galleries — BUILT

- BookmarksListTile renders `tileImages` (typed on the mobile FavoriteListSummary now)
  as a 2x2 gallery, slots TL(0)→TR(1)→BL(2)→BR(3), frost-gray placeholders for sparse
  slots; footer = name + ellipsis/handle. Preview-text rows are gone.

### §1.3 ListDetail card galleries — ATTRIBUTED + POPULATED

- Attribution (DB probe, RED facts): restaurant-side owner lists all carry 8 photos per
  restaurant (galleries render); EVERY dish connection had 0 — dish cards read photos by
  connectionId and the Google imports are restaurant-level. Data, not UI.
- Populated: linked 3 imported photos to each owner dish connection (9 connections;
  idempotent script, run once, deleted after). No-source rest: Bouldin Creek (0 imports)
  - non-seeded fixture restaurants.

### §1b Edit-enter posture (both surfaces)

- Both edit declarations promote via `promoteActiveSheet({ snap: 'expanded' })` —
  promoteAtLeast on the sanctioned routeCommand lane (a seat-writing writer), so the
  posture seat legitimately reads expanded and exit performs NO restore by construction
  (the primitive only releases the edit lock). Header X = Cancel override rides the
  session primitive on both. Full nav-out choreography not sim-verified.

### §2.1 Edit chip

- Home: root cause of "snaps in" = the chip was not a citizen at all (deleted with home
  edit). Restored as a keyed conditional child → the engine's late-mount width-grow
  entry/exit applies by construction. Restyle: clean CUTOUT (no border/white pill) on
  BOTH surfaces. ListDetail slide-in still needs sim attribution if it misbehaves on a
  fresh bundle (it is already a keyed citizen).

### §2.4 Edge-to-edge image rows

- Card galleries: PhotoStrip gained `contentInset`/`tileAspect`; both ResultCards bleed
  the gallery out of the card gutter (margin −20) and align tile 1 via scrollable inset
  — the toggle-strip law. The §3.1 pill row bleeds the same way.
- Home tile grid: bleeds out of the transport inset (gridBleed −OVERLAY_HORIZONTAL_PADDING).

### §2.8 ListDetail edit layout + action-row spec

- Squeeze ROOT FIX: (a) rows no longer wrapped in pageBlock — the card's own 20px
  padding is THE single gutter (read = edit = results parity); (b) ReorderableRows'
  handle is an absolute overlay center-right, so edit mode cannot narrow content.
- Visual spec: ONE shared EditModeActionRow (toggles/EditModeActionRow.tsx) — Cancel
  BLACK text, Save PRIMARY-RED text, undo/redo in a rounded CUTOUT PILL via the new
  engine per-slot `stripHoleBorderRadius` convention (ToggleStrip reads it off the
  element). ListDetail's local builder + styles deleted.
- NOT built: the "Edit lists"→undo/redo white-to-clear cutout FADE (needs an animated
  per-hole plate in the engine's action mask — deferred with reason, see charter audit).
- See-through hairline under the action row: not reproducible statically; needs the sim
  (candidates noted: action-layer height vs the band's punched hole).

### §3 Card redesign (shared ResultCard primitive — results surface changes too)

- §3.1 Pill action row (CardActionPillRow): Save(heart, "Save" vocabulary) · Share ·
  Call (only when a phone exists — displayLocation/locations) · Dishes (restaurant cards
  only, opens the profile); primary @10% bodies, primaryDark ink; scrollable full-bleed
  strip. The card-body heart/share column is DELETED from both cards.
- §3.2 Rank bubble inline: metadata stack loses RESULT_DETAILS_INDENT (metaFlush) — the
  bubble leads the title row flush left, metadata aligns under it; center-right freed
  for the edit handle overlay.
- §3.3 Gallery: default height 72 → 96, tile aspect 4:3 → 1.1 (bigger, less wide),
  edge-to-edge (§2.4). NOTE: results byte-parity is intentionally BROKEN by §3 (owner
  ordered the redesign).

### §4 One listEdit panel

- NEW list-edit-store + ListEditHost (root-host pattern, OverlayModalSheet) — ONE
  create-vs-edit form (name/description/visibility). Home popup create-form DELETED;
  header plus + "New list" row → listEdit(create, current side); home tile ellipsis
  gained "Edit"; ListDetail ellipsis "Rename" RENAMED "Edit" → listEdit(edit,
  prefilled) (the AppModal rename prompt is deleted).

### Fences

- No perf/map session files touched; BookmarksPanel HEAD copy read with LC_ALL=C grep -a;
  dev DB change was the additive dish-photo linking only (no migration, no API restart
  needed — data-only).

## Leg 14 — leg-13 SIM VERIFICATION + §2.8 cutout-fade build + hairline root fix (2026-07-13)

Sim owned this leg (rig iPhone 17 Pro, Austin pinned; verified-fresh bundles via
scripts/rig/reload-dev-client.sh each round, [BUILDCHECK-LEG14-vN] markers, removed after).
Gates at close: tsc = only the 2 documented Camera errors, eslint 0 on touched files,
jest 28 suites / 309 green (was 27/304 — new cutout-fade spec). NOT COMMITTED.

### Built this leg

1. **§2.8 "Edit lists" → undo/redo cutout FADE (was deferred — now BUILT + sim-verified).**
   Engine mechanism, per-hole and generic (any cutout can fade in):
   - `toggles/toggle-strip-cutout-fade.ts` (pure, jest'd): `resolveCutoutFadeCovers` —
     which holes get covers + cover geometry congruent with the mask window (same
     radius default + HOLE_RADIUS_BOOST). `CUTOUT_FADE_IN_MS = 240` (strip tempo).
   - ToggleStrip: two new per-slot element conventions — `stripHoleFadeIn` (the window
     punches immediately; a congruent WHITE COVER RECT mounts over it and animates
     white → clear once, keyed by hole key) and `stripHoleDisabled` (no window — plain
     chrome ON the plate). Covers render in BOTH mask layers' frames.
   - Sim-caught flash root-fixed IN the engine: a fadeIn slot's content stays opacity-0
     until its hole registers (hole + cover + reveal land in one commit) — without it
     the pill painted one frame on the bare plate before layout.
   - EditModeActionRow: middle slot = `EditListsLabel` (stripHoleDisabled, plain text
     on the plate) until `hasEverEdited`, then the pill (stripHoleFadeIn). New
     `hasEverEdited` on the edit-mode-session primitive (history.length > 1 — survives
     undo-to-baseline) + threaded through the bookmarks edit seat; both panels pass it.
   - Sim frames (30fps): label → one solid-white frame (cover opaque) → ~7-frame fade
     revealing the pill cutout. Identical engine path on home and ListDetail.
2. **Hairline under the action row — ROOT-CAUSED + FIXED at the engine.** Attribution
   (pixel scan on ListDetail edit): a 1pt full-width frost line at the band's bottom
   edge, EDIT MODE ONLY. Cause = coverage asymmetry between the two mask layers: the
   toggle mask deliberately extends `rowHeight + STRIP_GAP` past the row (clipped by
   the band) and always overshoots the foundation plate's punched hole; the action
   mask absolute-filled its container and stopped at the fractional bottom, leaving
   the hole's last ~1px see-through. Fix: the action mask now paints the SAME height
   as the toggle mask (maskHeight inline). Post-fix pixel scan: no gray rows.
3. **Ellipsis fade sync — was a hard swap (RED on sim frames), now a 240ms crossfade**
   synced to the strip-morph tempo: home tile ellipsis ↔ grip handle (keyed
   FadeIn/FadeOut siblings in BookmarksListTile) and the ReorderableRows overlay
   handle (fade on the absolute wrapper — overlay stays absolute, no squeeze
   regression; verified post-fix). Sim frames show the dot-morph crossfade.

### Leg-13 conformance — per-item sim status

- §1.1 home edit under "My ranking": **PASS** — vocabulary (sort sheet Recent /
  My ranking), edit chip only when sort=My ranking, 2-col tile drag (drag commit,
  live reorder), All row pinned (no handle), undo/redo functional (undo reverted
  tiles, redo enabled), Save persists (PATCH; order held across exit + re-present).
  Sort-mode CHOICE resets to Recent on cold relaunch (store default — never a claim;
  positions persist server-side). Auto-scroll/header-clamp NOT exercisable: 4 tiles,
  grid fits on screen (no overflow on the rig account).
- §2.1 chip WIDTH-GROW: **PASS on fresh bundle** — frames show partial-width growth
  (~240ms), not a snap, on home; ListDetail chip is a keyed citizen (same engine path).
- §1b posture: **PASS** — ListDetail edit-enter from PARTIAL snap auto-extended to
  full; Cancel AND Save exits leave the sheet extended (no restore) on both surfaces.
  Home strip only exists at expanded (two-posture law) so enter-extend is degenerate
  there. Header X present as Cancel on ListDetail; home is a root tab (no X by design).
- §2.8 ListDetail edit layout: **PASS** — no squeeze (read = edit width), handle =
  center-right overlay, shared action row (Cancel black · pill cutout · Save red),
  hairline GONE (this leg's fix), label→pill fade live.
- §1.2 tile 2x2 galleries: **PASS** — real photos TL→BR + frost placeholders, grid
  bleeds the transport inset.
- §1.3 card galleries: **PASS where data exists** — Oyatte/Manu's render real photo
  strips; Tomoni/Caffè Panna/dish lists show add-sliver only because those fixture
  restaurants have 0 photos in dev DB (DB-probed; data, not UI — same CardPhotoStrip
  path). Bonus: Best-restaurants RESULTS surface shows the full §3 redesign with real
  Austin photos.
- §3 card redesign: **PASS** — pill row Save·Share·Call(only with phone — absent on
  Oyatte)·Dishes(restaurant cards only — absent on dish cards), primary-tint bodies,
  full-bleed scrollable strip; rank bubble inline flush-left with metadata under it;
  gallery 96pt / 1.1 aspect (measured), edge-to-edge bleed under both edges.
- §4 listEdit: **PASS, all four mouths** — header plus → Create list; New-list row →
  Create list; home tile ellipsis "Edit"; ListDetail ellipsis "Edit" (Rename gone) →
  prefilled edit; create round trip (Leg14 test created + deleted), edit round trip
  (rename 2→2X→2 live on the open panel; visibility verified private in DB after).
  Create button disabled until named.
- Return-to-origin spot-check (incidental): search dismiss from the Lists tab returned
  to the exact origin ListDetail at its prior snap.

### Unverified / notes for the owner pass

- Grid edge auto-scroll + header clamp + fast-grab feel: needs a lists count that
  overflows the screen (rig has 4/side) — leg-7 sim evidence stands; re-check at scale.
- Dish-card galleries WITH photos: rig account's dish lists sit on no-photo fixture
  restaurants; the §1.3 owner-side dish-photo linking is in but not visible on this
  account. UI path is shared and proven on restaurant cards.
- Nav-out choreography details on home edit (tab bar stays visible — root-tab scene;
  flag if the owner wanted tab suppression there).

## Leg 15 — final at-scale verification sweep (2026-07-13)

Sim owned (rig iPhone 17 Pro, Austin pinned; reload-dev-client.sh verified boot; Pro Max
untouched). ZERO code changes this leg — the only tree edits are the two ledger/audit
docs; the seed script ran against the rig account via a temporary email Edit that was
reverted by Edit (never git checkout). Shared :3000 API was killed for the fault-injection
item and RESTARTED per recipe (health 200 after; :3001 perf rig untouched). DB changes:
additive only — `seed-owner-scale-fixtures.ts` re-run for rigtester (+10 restaurant +10
dish lists, My shots ATX w/ use_own_photos, 8 rig-owned photo side-copies, connection
links). Rig account now 15 restaurant / 13 dish lists — both grids scroll past one screen.

### Sweep results (evidence in scratchpad leg15/ screenshots + 30fps videos)

1. **Home edit grid AT SCALE — PASS.** Bottom-edge auto-scroll (All-row scrolled away
   mid-drag while finger held at edge), header clamp (lifted tile pins under the action
   row while the grid scrolls up — dragC frames), fast-grab ×3 rapid drags all committed
   (touch-down activation, no lift glitch), cross-column drag deep in the grid (slot 1→4
   exact), Save → PATCH persisted (DB positions probed; order survives exit/re-present).
   One transient settle-frame hole after a clamp-drop; settled grid clean (observation
   only, FlashList recycle-frame class, not reproducible in final states).
2. **Dish cards + galleries — PASS.** DishResultCard rows with REAL per-connection photo
   strips on the rig account (Micklethwait/J Carver's/Cuantos/Ramen Del Barrio…), 24pt
   dashed plus tile leads the strip, horizontal gallery scrolls with real physics and
   edge-to-edge bleed; Call pill only where a phone exists; rank bubbles renumber.
3. **Use your photos — PASS both directions.** My shots ATX 2x2 flips global(4) ↔
   own-photos(3 + sparse MID-GRID placeholder); menu wording flips "Use your photos" ↔
   "Use Crave photos".
4. **CollaboratorModal root host — PASS (leg-11 anchoring suspicion RETIRED).** On a
   12-dish list: sheet viewport-anchored, Add collaborator → "Invite link copied" (+slug
   in DB), roster row, outside-tap dismiss, list state preserved.
5. **Leg-11 NOT-RUN items:**
   - Slug lane: `crave://l/<slug>` on a fresh JS boot lands the correct ListDetail (~1s,
     middle snap). Title-skeleton frame unobservable on localhost (fetch too fast); a
     TRUE cold openurl is eaten by the dev-client server picker (environment, not app).
   - Stacked listDetail entries: NOT REACHABLE — restaurant profile exposes no list
     mouth (matches trigger-audit dead-lane; restoration-plan item).
   - Price failure baseline-restore: API killed mid-slice → $$ never lies: body swaps to
     "We couldn't load this list." + Retry (strip leaves WITH the cards — pill and cards
     exit together); API restarted → Retry restores the full baseline (12 rows, pill back
     at axis "Price"). Open-now rides the same axis-clause seam (leg-11 fix). ⚠ owner
     wording check: failure = honest error+Retry, not silent revert to cached rows.
6. **Home-edit nav-out (fresh, post root-snap-law Leg 9) — PASS.** Edit enter: tab bar
   transitions out, plus→X; dirty X → "Discard changes?" (Keep editing/Discard); Discard
   reverts order + restores plus/tab bar; sheet stays extended. Save path same restore.
7. **2x2 galleries at ~28 lists — PASS.** Both grids: mixed real/placeholder TL→BR,
   system lists all-placeholder, no holes or recycle blanks during full-length scrolls;
   feel final-call = owner eyeball.

### Defect found (NOT fixed — EG fence)

- **Entity world push from a list runs with a STALE viewport bbox.** Card tap → camera
  flies to the restaurant, pin lands, but [WORLD-COMMIT] carried the PRE-move bbox
  (top 30.332 < Ramen Del Barrio lat 30.388) → honest 0 rows, "No restaurants found";
  did NOT self-heal this session (leg-11 saw the transient flavor). Attributed via
  WORLD-COMMIT log + entity lat probe. Same reject class as the perf/map session's
  world-push/dismiss leg (W2-30 / §2.5) — recorded, not touched. Recovery path is
  coherent: search-bar X reveals the profile, profile X return-to-origins to the EXACT
  list.
- Incidental: X on a slug-opened list lands on the polls dock (no Lists-home origin for
  deep-link entries) — flag for the dismiss/residency step-1 leg, likely by-design.
- DU #7 re-confirmed: sort CHOICE resets to Recent on cold relaunch (positions persist).

### Audit table updates (status column only)

W2-3, W2-4, W2-8, W2-13, W3-3, W3-5, W3-22 → VD with Leg-15/Leg-9 evidence. Header
counts line now stale by these flips (register prose left untouched per the read-only
mandate). Still DU after this leg: W1-9 one-line placement flip ONLY — deliberately not
exercised (would mean mutating a live surface declaration on the uncommitted tree for a
structural claim; recommend proving it as part of the commit-adjacent cleanup).
