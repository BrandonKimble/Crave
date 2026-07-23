# THE PAGE — a from-scratch composition system (v2, post-red-team)

2026-07-16. v1 was attacked by two philosophy-seeded adversaries (A: abstraction purist;
B: platform realist). 33 findings — 8+7 design-breaks — ALL resolved or converted into
explicit gates below. v1's audit (§0) stands unchanged; v1's shape survives at L0–L2
with amendments, L3 is now GATED on a measured prototype, and L4 was redesigned (the
red-team's deepest cut: v1's L4 solved the transition edge and missed the case the
release lane actually measured). Owner ratifies per level.

## 0. The audit — every owner-named symptom, root-caused (unchanged from v1)

1. **≥4 skeleton implementations**: CutoutSkeletonSurface (correct), SkeletonBox
   (solid-gray — ProfilePanel ×5 = the owner's "gray sheets"), CutoutSkeletonTitle,
   two competing wrappers (host S2 fallback + SceneBodyReadyGate), per-panel pending
   branches.
2. **Cutout vs gray** = the second material existing.
3. **"Just white"** = frostBacking hand-passed at 10+ sites; wrong backing over an
   opaque body = invisible holes. Distributed decision ⇒ the class regenerates.
4. **"Changes midway"** = up to THREE sequential skeleton owners per load; the visible
   change IS the ownership handoff.
5. **Header/skeleton gap** = body seam from a cross-scene measured cache (signature
   fallback) — a scene inherits another scene's geometry until its own measure lands.
6. **Previous page's strip leaks into the next** = same cache + the one persistent
   header host whose layout persists across switches.
7. **Strip/profile-stack a beat late** = persistent-host slots re-render after the
   switch commit; frame starvation stretches the beat.

**THE DISEASE: nothing owns the page as a single fact.**

## L0 — ONE MATERIAL (app-global)

Exactly one loading material exists anywhere in the app (sheet pages, modals, map
overlays — the law is global even where residency is not; red-team A#18): **the cutout
plate** — plate + holes + shimmer. SkeletonBox, CutoutSkeletonTitle, and hand-rolled
pending branches are deleted; titles and identity blocks are hole SHAPES.
**Backing is derived, never an argument** — with the honest scoping (B#10): the
derivation input is the RESOLVED UNDERSTACK, computed by the residency manager and
injected at reveal (a pushed child's backing depends on what it sits over — a runtime
fact). Panel authors still cannot pass it; the one computer is the residency manager.
Understack changes while resident (page beneath a modal switches) re-derive on the
next reveal beat.
*Honesty note (A#16): L0's derivation is defined in terms of L1's stack — L0 alone is
the one-material decision; the derivation is ratified with L1.*

## L1 — THE SURFACE STACK (geometry computed, with the laws that make it true)

A page declares `{ chrome: ChromeSpec, body: BodySpec, decor: DecorSpec }`.

- **BodySpec is an ordered set of BODY BANDS with one active** (A#14, B#15 — decided,
  not open): the search results page's dual-tab body is two bands in one shell; a tab
  toggle is intra-shell band visibility, never a scene transition. One band is the
  trivial case.
- **THE TRUNCATION LAW (owner ratifies — product constraint, A#2/B#4):** all chrome
  text is fixed-line-count at declared heights. TitleSlot's type is a branded
  `SingleLineText` (produced only by an ellipsizing constructor) — multi-line chrome
  text is unrepresentable at the type level. Heights then need only
  lineHeight-per-token tables DERIVED from the design-token system (never hand-listed
  — the type-list disease guard). Known truncation surfaces to ratify: listDetail's
  user-authored titles, restaurant names in child headers.
- **Geometry inputs are named**: ChromeSpec + device facts (safe area, dynamic type,
  bold-text, orientation, RTL — A#13). **Staged invalidation** (B#13): a device-fact
  change recomputes the visible shell synchronously and dirty-marks the rest (lazy
  recompile on next reveal) — never a 20-shell burst.
- **THE MORPH LAW (B#9):** chrome morphs (edit mode) interpolate between two COMPUTED
  ChromeSpec heights on one named clock; the snap engine subscribes to that clock (one
  writer); the body's top inset rides transform during the morph and commits layout
  ONCE at the end. Animated layout is unrepresentable.
- The measured-chrome cache, its signature fallback, and reservedHeaderHeight die.

**L1 STATUS 2026-07-16: THE GEOMETRY CORE IS EXECUTED.** computeSceneChromeHeight
(scene-chrome-geometry.ts, RN-free) = chrome-row constant + (strip:'header' ? declared
band + spacer : 0); the strip band DECLARES its height (toggle-strip-metrics, derived
from CONTROL_HEIGHT — citizens conform physically); the measured cache + signature
fallback + reservedHeaderHeight (→ chromeHeight, computed) + search's retained
header-height authority + the descriptor onChromeLayout feed are ALL DELETED. The
[CHROME-GEOMETRY] dev bark is the RED instrument — computed↔measured on every present
(proven RED via a 3px conformance drift: named scene, exact delta; zero barks clean).
Gates: 366/366 suites, invariants 22/22 (+4 L1), matrix 21/21. Sim truths recorded:
strip-less chrome 68.33̄ (raw sum 68.25 grid-rounded), strip chrome 108.33̄.
Deliberately NOT built (no consumer exists): the morph-clock machinery (the strip's
edit morph is absolute-fill inside the constant band — no chrome-height morph in the
app); BodySpec bands + SingleLineText brand land with L2's PageSpec (the truncation
law's box side is already physical: fixedHeight chrome row + fixed band, ratified).

## L2 — THE SHELL (loading is the list with placeholder cells)

The PageSpec is **the only render path** (A#5): PageSpec values are immutable
module-scope constants containing their slot components inline — no registry, no
separate descriptor to disagree with; "declared but not registered" is unconstructable.
The shell is a runtime interpreter component keyed by PageSpec identity (A#17).

- **The virtualization truth (A#3 — v1's biggest lie, fixed):** for list bodies, the
  shell's body IS the list, always mounted; **pending = placeholder items whose cells
  render as cutouts** — the cutout is a CELL RENDERING MODE, not a separate surface.
  Corollary laws: row templates declare fixed heights content must conform to (image
  slots are fixed-aspect boxes — typed, so reflow-on-fill is unrepresentable); the
  placeholder count is part of the template. Non-list bodies (forms, profiles) use
  static hole templates where same-nodes holds literally.
- **Slots carry DATA, not components-with-queries (A#4 — the load-bearing contract):**
  slot components receive already-resolved values from the beat-writer; queries live
  in the page controller, structurally unreachable from render code. A panel cannot
  express a pending branch because the pending case never renders its slots.
- **The body state enum is CLOSED AND TOTAL (A#10, B#3):**
  `pending | present(content) | empty(declared empty-view) | error(class, declared
  error material + retry, integrated with the wave-4 failure law) | appending(tail
  placeholder rows)`. Empty and error are L0-material variants declared in the
  PageSpec. A panel-level loading/error branch has no state left to express.

**L2 STATUS 2026-07-17: THE INTERPRETER + FIRST MIGRATIONS EXECUTED.** page-body-
contract.ts (PageBodySpec with inline slots; the closed enum + the one query-edge
derivation) + PageBodyShell (one interpreter; one failure-law chokepoint; pending/error
= the L0 material at the scene's declared row; slots receive data only) +
resolveSceneLoadingMaterial (the ONE frost/rowType derivation home — the gate now
shares it). Migrated: notifications (list — LoadState machine/ready-gate/hand-rolled
branches DELETED) + settings (static — page skeleton unrepresentable). Gates: 6 new
hermetic contracts, invariants 24/24 (+2), matrix 21/21, on-sim eye proof both scenes.
**PROFILE SLICE EXECUTED 2026-07-17:** profile (own tab) = ONE always-visible tree —
the dual-tree (full-body transition skeleton OVER a display:none prewarmed body,
skeleton owner #1 of the three-owner handoff) is DELETED; identity blocks are L0
same-node shapes, the sections band keeps the one in-place material (from the one
derivation home), activation is a STATE input. userProfile = the vocabulary's third
body kind: PageContentBodySpec + PageContentBodyState (pending|present(data)|error —
a settled-null entity is an ERROR by law) with the controller/content split (query in
the controller; Content receives resolved data; blocked-unavailable renders from
resolved data). Gates: 9 contracts, invariants 24/24 (migrated-panel check covers
notifications+profile+userProfile + dead prewarm/transition-shell tokens), matrix
21/21, sim eye proof (profile tab warm re-entry zero-flicker; userProfile full
foreign tree via push_child_scene+routeParamsJson). **PAIR SLICE EXECUTED 2026-07-17:** bookmarks = the vocabulary's COLLECTION kind
(full closed enum over one resolved collection; Content owns the grid/edit
composition) — dual-tree transition shell + prewarm DELETED (profile pattern);
controller keeps the retained-data law (stale lists over skeleton on refetch/error);
placeholder template gains insetX (template GEOMETRY — kills the double-inset jump
class). listDetail: load CLASSIFICATION is canonical (resolvePageContentBodyState —
the hand-rolled isLoadFailed derivation is gone; settled-null law covers its
listType/response arm); its FULL spec migration deliberately rides the search-family
slice — its world-backed transport IS that slice's content-transport seam (migrating
it twice would be waste, not caution). NOTE: neither bookmarks nor listDetail is a
FlashList body (both are mounted scroll bodies) — placeholder ITEMS as a cell
rendering mode lands with the true FlashList bodies (results/polls) in the search
family. Remaining L2 surface: the search family (bands + SingleLineText + FlashList
cell mode + listDetail's full spec).

## THE SKELETON SHEET — owner spec 2026-07-18 (the search family's design core)

Owner-worded laws for EVERY skeleton sheet app-wide; the search family lands them for
results first, then they roll back over the migrated scenes:

1. **A skeleton sheet IS a real sheet body**: a ONE-ITEM LIST — a single full-bleed
   pending block — mounted in the SAME list/scroll/snap mechanics as the resolved body.
   Moving the sheet while pending behaves normally; scrolling behaves normally. Never a
   separate overlay surface with its own physics.
2. **TRUE CUTOUTS through to the frost**: the block is the L0 plate with holes that see
   through to the HOISTED FROSTY LAYER — no self-frost fake, no white sheet behind the
   plate. (The 2026-07-17 self-frost flip is an INTERIM patch: the owner confirms the
   blocks now read as "grayer blocks on the sheet," not cutouts. The original splotch
   disease was the frost reading as raw map — the fix belongs at the FROST layer's look
   (blur/tint that reads unmistakably frosty), never per-skeleton backing choices.
   Owner-eye iteration required on the frost look.)
3. **NO header skeleton**: chrome changes IMMEDIATELY (the chrome-leads law) — header
   title, nav action, AND the strip render real from the first frame. The strip-pill
   hole block (`withFilterStripHoles`) dies WITH the restructure that lets the real
   strip exist outside the hidden list (the band geometry work). Do not delete the
   pills before the real strip can render — a blank band is worse.
4. **THE LENGTH LAW**: the pending block's height = THE SHEET BASELINE — exactly enough
   to fill the viewport at the HIGHEST snap; scrollable but bounded (no infinite
   repeat, no long dead scroll). The baseline floor itself is REDUCED app-wide (the
   current floor scrolls too long — owner). One floor mechanism (the profile-page floor
   pattern) shared by every sheet.
5. **The divider is honest by construction**: it derives from the real scroll offset;
   a skeleton mounted on the real scroll enters at offset 0, so the hairline the owner
   sees today (stale-offset artifact over the pill row) is structurally impossible.

## THE SCROLL HANDOFF + RUBBER-BAND ARC (owner spec 2026-07-18 — separate deep dive)

The one-gesture snap↔scroll handoff currently suppresses ALL edge bounce. Wanted:
- **Top of list**: momentum flick (finger UP) hitting the top → rubber-band rebound.
  Finger DOWN reaching the top → the existing handoff to sheet-grab (no bounce).
- **Bottom of list**: sheet AT top snap + finger down hitting the end → overscroll +
  rebound. Sheet NOT at top snap → finger-down scroll-up keeps moving the sheet
  (grabber), as today.
- Method: from-scratch deep dive of the gesture/scroll handoff with zero preconceptions
  from the current implementation; the handoff behavior as-is is the constraint to
  preserve, bounce is the capability to add.
- **THE TWO NAMED FAILURE MODES any design must solve** (why the earlier direction-gated
  bounce was REVERTED — sheetBodyScrollDefaults.ts): (1) top over-scroll translated the
  list PAST the pinned header during the down-handoff; (2) the FrostCutout plate
  translates by -scrollOffset and cannot follow a NEGATIVE over-scroll offset (plate
  desync). A from-scratch design must make both impossible (e.g. the plate and header
  clip riding the same clamped/derived offset the bounce lane composes over).

## THE RESULTS PENDING BLOCK — design (2026-07-18, from the attributed mechanism)

Today's results loading face is a PINNED OVERLAY COVER (resultsLoadingCoverSurface:
absolute below the header, opacity-driven, pointerEvents none) over the REAL list
whose rows premount HIDDEN beneath it (setResultsRowsHiddenForLoading — the TR5-N
choreography: rows mount+measure under the cover so the reveal joint only lifts
opacity). Consequences, all owner-felt: scroll during load moves the hidden list
under a static skeleton (not sheet-like), the divider reads the list's stale offset
(the hairline), and the cover needs its own animated top math (header + strip
offsets — a second geometry).

THE DESIGN: the pending face becomes LIST CONTENT — the list's data while pending is
ONE full-viewport cutout block (the one-item-list law). The cover overlay, its
animated top math, and the rows-visibility level DIE. Scroll/drag during pending is
the real sheet behaving; the divider is honest; geometry is the list's own.

THE TRADEOFF, named honestly: [block]-as-data kills the under-cover row PREMOUNT —
rows would mount AT the reveal joint, which is the release-measured REVEAL BURST
(172-180ms UI frames). The premount-under-cover trick exists ONLY because there is
no content-landing clock. So the pending-block cut and L4's sliced landing
(above-fold first, idle-slice remainder) are ONE arc: land the block + the landing
clock TOGETHER, and the burst is governed instead of hidden. (Interim option if
sequencing demands: block-as-data with rows premounting in the L3 shell once
residency lands — same clock, different home.)

**OWNER DIRECTIVE 2026-07-18 (the global surface abstraction — AFTER the family):**
the owner's one-item-list model is a SKETCH, not the law — the target is one global
abstraction for how EVERY sheet surface behaves at any content length: small content
(≤ one page) rubber-bands per the overscroll spec with NO hardcoded length
buffers/padding (SHORT_PAGE_SCROLL_ROOM_PX and the floor mechanism are named CRUDE —
they die in this redesign; the length law's floor lean is INTERIM); more content =
identical behavior with scroll. From scratch, first principles, throw away the
current implementation if needed. Sequencing: only after the family/foundational
work completes.

## THE CONTENT-TRANSPORT SEAM — verdict (2026-07-18, the reserved design moment)

The question the migration bridge reserved: for WORLD-BACKED pages (listDetail today;
results itself), does content reach the shell through the MOUNTED STORE (pull — the
panel's useSyncExternalStore world-read, today's shape) or through the BEAT-WRITER
(push — L3/L4's "reveal = one batched write to the target shell")?

**Verdict: they are the same seam at different levels, not competitors.**
- The mounted store IS the presented world's residency — the one content truth. The
  page CONTROLLER subscribes to it (pull), identity-matches, and derives the closed
  PageBodyState — exactly the L2 law (stores/queries live in controllers; slots get
  resolved data).
- The BEAT quality ("at most one content commit per reveal") is owned by the FENCE
  (the P-12 pattern, proven by the pending-block arc: coalesce while an episode is
  live; one render lands the swap at the reveal commit). A controller over a fenced
  store IS beat-committed — no separate push machinery exists at L2.
- The beat-writer becomes REAL machinery only at L3 residency, where N shells exist
  and "stamp chrome+content to the TARGET shell pre-reveal" needs an addressee. Its
  ideal form THEN: the residency manager triggers the target shell's CONTROLLER to
  re-derive inside the reveal batch — the beat-writer is a SCHEDULING discipline over
  controllers, never a second data path (a push store beside the pull store would be
  the two-ways-to-know-one-fact disease).

**listDetail execution plan (from this verdict — the userProfile pattern, bigger).**
THE EDIT MAP (cataloged 2026-07-18 — the exact partition, so the split is mechanical):
- CONTROLLER (stays in ListDetailPanelBody; produces the composite data + commands):
  params parsing (listId/shareSlug/targetUserId/joinIntent/worldBacked/warmTitle),
  virtual-All derivation, metaQuery, slug world-launch effect, SLICE STATE
  (sortOverride/openNow/priceLevel/marketKey + applySlice + sliceRef + the
  contentSeam/useContentToggle pair — query inputs AND world re-slice writers),
  world reads (worldResults + worldRevealAdmitted + the JOINT bark), resultsQuery,
  response resolution (world vs query), activeMarketsQuery (market options feed the
  slice vocabulary), collaboratorsQuery + meQuery + roster, resolvedName. Data
  payload = {listId/resolvedListId, listType, viewerRole, defaultSort, isVirtualAll,
  response, roster, meta, resolvedName, canEdit/canAddPhoto, slice: {effectiveSort,
  openNow, priceLevel, marketKey, marketOptions, marketChipLabel, applySlice},
  collaborator commands (join/kick/leave/invite/openProfile), list commands
  (runListUpdate/handleDeleteList/invalidateListReads)}.
- CONTENT (new ListDetailContent({data})): row derivations (restaurantRows/dishRows/
  richRows/richRowsByKey/restaurantsByIdForDishRows), render callbacks
  (renderRichRowCard/renderEditRowContent), save handlers, entity-ref executor,
  openRestaurantProfileFromList, openScoreInfo, EDIT SESSION (useEditModeSession +
  enter/exit + handleSaveOrder + scrollAdapter + orderedEditRows/editIndexByKey +
  isSavingOrder), collaborator MODAL locals (visible/inviteState/isJoining +
  payload memo + effects), header menu (openHeaderMenu + ref + registration?
  — the header-menu REGISTRATION effect must stay mounted while content is pending:
  if it registers the ⋯ menu for the chrome, it belongs CONTROLLER-side; verify at
  execution), openListEdit, strip/sort UI derivations (sortOptions/sortChipLabel/
  countLabel/ownerHandle).
- WATCH-OUTS: (1) the header ⋯/title SEAT registrations (useTopMostListDetailHeaderSeat
  writer side) must survive pending — controller-side; (2) the contentSeam/phase
  (useContentToggle) choreographs slice flips — controller-side (drives query+world);
  (3) entryId-keyed effects (line ~1262 region) — verify which side; (4) the gate's
  testIDs (list-detail-loading/failed) move to the shell's pending testID vocabulary.

**LISTDETAIL SPLIT EXECUTED 2026-07-19 (per the edit map — the last non-search L2
migration):** ListDetailPanelBody = the CONTROLLER (params, meta/results/collaborator/
market queries, slug world-launch, slice state + applySlice + content-toggle seam,
world reads + admission, list/collaborator commands, header seat) producing ONE
composite data payload; ListDetailContent = a hook-free dispatcher (private-gone is a
RESOLVED answer: {kind:'privateGone'} union arm renders the honest 410 body — no
conditional hooks, the ready half is its own component) over ListDetailReadyContent
(rows, ResultCard wiring, edit session, strip chips, render). The gate render DIED —
listDetail joins the shell (pending/error = the one material; failure law through the
one chokepoint). onOrderSaved + openCollaboratorRoster cross the seam as controller
commands (invalidations + sort-override stay with slice state). Gates: tsc+lint
clean, 138 suites, invariants 29/29 (migrated-panels check covers listDetail), matrix
21/21 (flows 2-5 ARE the listDetail lifecycle), sim eye full page.

**TRUNCATION LAW TEXT SIDE EXECUTED 2026-07-18 (L1 completion):** ChromeTitleText =
THE one chrome title (single-line + title tokens + the ink token) and — the load-
bearing half — the WIDTH BOUND moved to the host's title SLOT (OverlaySheetHeaderChrome
headerTitleSlot: flex:1/minWidth:0/marginRight:12). The old per-panel forks
(sheetTitle ×4 / headerTitle ×7 / restaurantName / submittedQueryLabel — some with
hand-rolled flex bounds, some silently UNBOUNDED so a long title pushed the nav
action) are DELETED across 12 registration sites; single-line ellipsis is physical
for every present and future title by construction. NOTE for the owner eye pass: ink
unified on themeColors.text (#1A1A1A) — a few titles were #0f172a (slate-900), a
subtle darkening on those. Gates: tsc clean, 138 suites, matrix 21/21, eye
(listDetail user-authored title renders + testID preserved).

**STRIP-BAND RESTRUCTURE EXECUTED 2026-07-18 (owner law §3 — chrome changes
immediately):** `shouldHideScrollHeaderForSurface` DIED AS A CLASS — the strip's
initial-loading hide existed only to avoid double-rendering with the dead cover's
strip-pill holes. The results strip (the list header) now renders REAL for the
scene's whole life, including initial loading: the chips read the live desired
tuple so their state is correct before the world lands, and the strip is byte-
identical between the pending block and the revealed rows (zero chrome shift at
the reveal — sim-proven: pending shot shows the live strip over the block; settled
shot shows the same strip untouched over cards). No header skeleton exists
anywhere on the results page now.

**PENDING BLOCK EXECUTED 2026-07-18 (the arc's structural core):** the ATTRIBUTION
overturned the charter's premise — the P-12 fence ALREADY coalesces row landing to ONE
render at the reveal commit (the "premount under cover" claim was stale; the cover
existed only to hide the PREVIOUS world's fenced rows). So the cut was clean: while a
redraw episode is live, the motion fence presents [ONE full-viewport cutout item] as
the list's data (ResultsPendingBlockRow + ResultsPendingBlockCell, height = one
window, count-clipped — the length law); the reveal is the same one-render data swap.
DELETED: the pinned loading cover + its animated header/strip top math + the
rows-visibility level + the strip-pill header skeleton + the initial/interaction
loading contents. Proven on sim: the block renders flush under the header with NO
divider hairline (real offset 0 — died structurally as predicted), full card anatomy,
reveal swap lands pins+strip+cards; the open-now flip settles through the lens
projection fast path. Gates: tsc clean, 138 suites, invariants 28/28 (+3), matrix
21/21. LANDING-CLOCK STATUS: the fence IS the coalescer (one commit); FlashList's
virtualization + initialDrawBatchSize are the slicing levers already in place — a
release-lane burst re-measure decides whether more slicing is needed (L4 follow-up,
not speculative machinery now). Sheet-drag/scroll-during-pending: structural by
construction (the block is list content); owner finger-test to confirm feel.

**FAMILY EXECUTION STATUS 2026-07-18:**
- LENGTH LAW LANDED for shell pending faces (PageBodyShell): the pending face fills the
  floored scroll box (BottomSheetScrollContainer short-page floor = viewport +
  SHORT_PAGE_SCROLL_ROOM_PX) with the material ABSOLUTE + CLIPPED inside — a skeleton's
  row count can never lengthen the scroll; a pending page scrolls exactly like any
  short page. (The results skeleton inherits this when it migrates onto the shell.)
- THE BASELINE FINDING: the app's short-page floor is SHORT_PAGE_SCROLL_ROOM_PX = 96
  (viewport + 96). The owner's "baseline too long" almost certainly meant the
  SKELETONS' arbitrary row-count lengths (now law-bound), not the 96px floor — reducing
  the 96 much further makes short pages unscrollable. Flag at the owner eye pass.
- DIVIDER-LINE ATTRIBUTION: the hairline over the skeleton = HeaderScrollDivider
  reading a STALE scroll-offset SharedValue while the skeleton is up. Dies structurally
  under §1 (skeleton on the real scroll enters at offset 0); no patch now.
- STRIP-PILL header skeleton: dies WITH the strip-outside-the-list restructure (per §3
  — deleting it before the real strip can render leaves a blank band).

**SEARCH-FAMILY OPENING ATTRIBUTION (2026-07-17):** the owner's "splotchy results
skeleton" REPRODUCED + root-caused: the results skeleton was frost-through to the
live map (deliberate 2026-07-07 directive) — over light map areas the holes washed
out/tinted, which also read as "sparse" (most holes invisible) and "not flush"
(the visible subset looked scattered). FIXED NOW (owner revision supersedes): all
three results-skeleton sites self-frost — uniform bars, full card anatomy, flush
under the header. The family slice still owes: results onto the ONE declared
material + template geometry (kill the bespoke three-site composition), bands,
SingleLineText, FlashList cell mode, listDetail full spec, transport seam.

**RESULTS PageSpec/BAND LEG EXECUTED 2026-07-21 (bands + SingleLineText + template
declaration):**
- **BANDS ARE THE GENERAL FORM (A#14/B#15 landed in the contract):** PageListBodySpec
  = `{ kind:'list', scene, bands: [PageListBandSpec, ...] }` — an ordered band set
  with ONE active; one band is the trivial case (notifications migrated to it; the
  old single-row-template form is gone). Each band carries its OWN closed
  PageBodyState (`bandStates` keyed by band key + `activeBandKey` on the shell) —
  restaurants can be present while dishes is pending. `PageBandTemplate` is the
  vocabulary BOTH interpreters share: shell bands (defineListBand — row Component +
  Empty required inline) and transport-hosted FlashList bands (defineBandTemplate —
  template facts only; the row render stays the family's sanctioned controller
  slot; the constructor preserves declared-field narrowness).
- **THE RESULTS BAND DECLARATION** (search-results-page-bands.ts): restaurants
  (primary lane) + dishes (secondary lane) — the ONE home of the formerly scattered
  facts: estimatedRowHeight 270/240 (was per-site literals), materialRowType per
  band (kills a LIVE BUG: both empty-face twins hardcoded 'restaurant' for the
  dishes tab), placeholder.count (the pending block's rows), keyOf (module-scope,
  was a per-render useCallback). Consumers now read the declaration: the list-item
  content runtime, both RESULTS_LOADING_EMPTY_COMPONENT twins, the pending-block
  rows + cell. The empty surface stays controller-side DELIBERATELY (it composes
  runtime data — metadata copy, notices, failure variants).
- **SingleLineText brand (truncation law, type side — L1 complete):** ChromeTitleText
  children is the branded type; `toSingleLineText` (newline-collapsing) is the only
  producer; all 13 title sites wrapped — multi-line chrome text is now
  unrepresentable at the type level.
- **RECORDED FOLLOW-UP (the family's remaining row-slot inversion):** the results
  renderItem is still runtime-built (closures over resolved descriptors + commands).
  The end state per A#4 — rows carrying resolved data + module-scope command verbs,
  the band declaring its row Component inline — is its own leg (the card-render
  chain inversion), after which defineBandTemplate collapses into defineListBand.
- Gates: tsc clean (2 known Camera), jest 383/383, invariants 29/29, matrix 21/21,
  sim eye (pending face w/ live strip + flush block; reveal correct under declared
  facts). Remaining L2 family surface: polls (PARKED — parallel session owns the
  polls feed), then L3 residency prototype + L4 completion.

## L3 — SHELL RESIDENCY (GATED on a measured prototype)

Every scene's shell mounts once and stays resident; switches retarget visibility.
The red-team is right that "shells are cheap" is an unmeasured claim (A#7, B#6) —
**L3 is not ratifiable until the prototype measures**: all shells mounted empty on the
target sim/device — boot delta, resident memory, steady-state UI fps.

**THE PROTOTYPE MEASURED (2026-07-21 — perf/ResidentShellPrototype.tsx, a runtime
harness driven by `action=mount_shell_prototype&markerCount=<shells>&routeParam=
<rowsPerShell>`; hidden per the visibility law: display:'none', zero animation).
Dev lane, iPhone 17 Pro sim, PageBodyShell shells with a synthetic band:**
- **EMPTY SHELLS ARE FREE — the claim HOLDS:** 20 empty shells mount in ~11-13ms
  (one commit; the boot-delta proxy), RSS delta ≈ 0 (within noise), steady-state
  60fps untouched (worst JS p95 25.7 one window, UI worst 18.5 — idle-normal).
- **CONTENT is the real budget:** 20 shells × 12 representative rows (240 rows,
  Views/Text only — NO images) mount in ~186-192ms (one commit — must be sliced,
  which warm-before-navigate already mandates) and cost ~+40MB RSS at mount
  (~170KB/row of tree+shadow-node structure). RSS is STICKY on unmount (Hermes/OS
  page retention) — eviction budgeting must count commitment, not expect reclaim.
- **Verdict: the measure RATIFIES L3's shape** — resident shell STRUCTURE is free;
  the eviction law (content evicts under a budget, shells never do) is confirmed as
  the load-bearing companion, not a nice-to-have. NAMED UNKNOWN for the budget
  pass: image-bearing rows (real results cards carry photos; decoded surfaces live
  mostly in the shared image cache, but the per-shell figure here excludes them) —
  measure when the content budget is set. Harness stays in the tree (null when
  idle; release-capable via the os_log sink).**

Laws that are part of L3 regardless:
- **The visibility fact has ONE writer** (A#13): the residency manager owns one
  per-shell visibility bit that DERIVES pointerEvents, accessibility hiding
  (`no-hide-descendants`), subscription liveness, AND animation liveness — a hidden
  shell runs ZERO worklets (shimmer clocks paused, `display:'none'`/detached so layout
  skips; B#6i). Half-right states are unrepresentable.
- **Invisible shells subscribe to nothing** (A#9): freshness comes from the beat-writer
  stamping chrome+content in the same pre-reveal batch that lands rows — "reveal = one
  batched write to the target shell" covers first paint and re-entry identically. No
  stale-then-correct flash; no 19-shell background render tax.
- **THE EVICTION LAW lives HERE, now (A#11, B#7 — no dangling reference):** shells
  never evict; CONTENT evicts under a budget with (a) stack-pinned scenes and the
  last-N-visited exempt (back-navigation never crosses an evicted shell), (b) eviction
  stores an anchor (item key + intra-item offset) + the data snapshot when small,
  (c) re-entry to an evicted shell refetches BEFORE reveal (origin-restore seeks the
  anchor; anchored item gone ⇒ top, by law). Return-to-origin stays exact.
- **Warm-before-navigate (A#6, B#6iii):** first-visit shells compile at app-idle
  (post-boot prewarm of the reachable set) or on press-down prediction — NEVER inside
  the transition window. This is the one scheduling discipline the design carries,
  named honestly; the residency manager owns it, and a shell compiled mid-transition
  is a LOUD contract violation, not a fallback.
- **Trans-page chrome is a real, tiny, enumerated layer (A#8, B#8):** the nav action
  (plus↔X) and strip-morph continuity are owned by the TRANSITION, not by any shell —
  a closed set. Strip STATE (selection, in-flight morph clock) lifts to a store keyed
  by STRIP IDENTITY (not page); both shells render from it, so cross-page strip
  continuity is shared-state-driven, deliberately — "nothing shared between pages"
  amended to "nothing shared except the enumerated trans-page set."
- The scene census is taken against the REAL key list (B#14): 20 OverlayKeys; `sheetHost`
  (never dispatched) and `search` (bespoke dual-band body — becomes the two-band shell)
  are named explicitly; every key gets a body kind (list/content/none) in the spec table.

**L3 BUILD SLICE 1 EXECUTED 2026-07-22 (the liveness law, notifications+settings).**
THE MACHINERY FINDING that reshaped the build: the STRUCTURAL half of L3 already
exists — every persistent scene is a co-mounted absolute-fill sibling that never
unmounts (BottomSheetSceneStackHost .map over PERSISTENT_ROUTE_SCENE_STACK_KEYS),
hidden via leg opacity/zIndex worklets + entry-level display:'none' + attach gates,
with ONE persistent header host. What did NOT exist: the LAW — those are SEVERAL
writers of display facts with NO liveness derivation; a retained hidden body keeps
its subscriptions, and (the exposed bug) notifications fetched once on first mount
and showed STALE DATA FOREVER on re-entry.

LANDED: shell-residency-manager (the visible bit driven by the presentation frame
via the header host's existing subscription — presented truth IS the visible shell;
visit-order + commitment ledger = the eviction seam; warm-before-navigate contract
LOUD + RED-proven on sim, then quieted by the app-root prewarm) +
ShellLivenessBoundary (liveness context ONLY — deliberately NOT a second display
writer beside the leg machinery; that would create the two-writers disease) + the
L0 material's three shimmer clocks freeze on the same bit + notifications
re-derives on every become-visible edge (fetch + mark-read per VISIT restored).
Sim-proven: re-derive fires per re-entry; contract quiet after prewarm; page
correct. Gates: jest 383/383, invariants 29/29, matrix 21/21.

RECORDED FOR THE NEXT SLICES: (1) THE ONE-WRITER CONSOLIDATION — display/pointer/
a11y derived from the manager's bit, the leg opacity/attach patchwork gutted; this
is surgery on the host's worklet machinery and must compose with transition
crossfades (both participants live mid-transition). (2) settle-gate the visibility
driver (the live bit flickers once mid-transition — benign under seq guards, but
the settled frame is the honest edge). (3) the eviction budget activates when
content-heavy scenes join. (4) grow the managed set per the bridge order (profile
→ listDetail/bookmarks pair → search family last).

**L3 SLICE 2 EXECUTED 2026-07-22 (the one-writer display consolidation, managed set).**
- **THE SCENE-KEYED RESIDENT UNIT:** a residency-managed LEAF has ONE unit with a
  STABLE key (`resident:<scene>`) — React never remounts the shell tree: a re-push
  updates the entry prop in place; a pop keeps the last entry (dismissal changes
  visibility, never the mount; attach rides hasRetainedEntryUnits — no second attach
  writer). SIM-CAUGHT on the way: entry-keyed units gave a re-push a SECOND unit of
  the same scene and the scene-level boundary displayed BOTH (the double-empty-state
  shot) — the scene-keyed unit is the fix, spec-tested (managed unit survives pop as
  the same object; unmanaged units still drop).
- **FACT FACTORING (the law refined):** one writer PER FACT. Unit-ACTIVITY (the
  entry boundary's per-unit hider) and scene-VISIBILITY (the manager's bit, derived
  by ShellVisibilityBoundary: display/pointerEvents/a11y/liveness) are different
  facts and both apply; the transition engine's opacity worklets own PAINT.
- **TRANSITION COMPOSITION:** displayed = visible ∪ transition-outgoing. The driver
  reads the FRAME's outgoingSceneKey (held leg during preserveOutgoingUntilSettle;
  null republishes at settle — the collapse edge always renders). THE TRAP, named:
  the txn store is NOT a legal driver source — the txn object mutates phase in
  place, so a settled txn never re-renders subscribers (sim-caught: stuck-displayed
  hidden shell, no re-derive edge on re-entry).
- **The registry split:** shell-residency-registry.ts (pure — consulted by the
  hermetic entry-unit resolver) apart from the manager (imports react-native).
- Sim-proven: visible-bit flips clean (notifications→settings→notifications, txnLive
  collapses at settle), re-derive fires per re-entry, ONE empty state, attach:true
  across dismiss (tree retained). Gates: jest 391/391 (37 suites — entry-mounts spec
  now collected + the residency case), invariants 29/29, matrix 21/21.
- REMAINING L3: entry-aware residency for multi-entry scenes (listDetail), eviction
  budget activation, managed-set growth (profile next), beat-writer scheduling at
  reveal (L4's seam).

**L3 SLICE 3 EXECUTED 2026-07-22 (profile joins the managed set).** profile = the
root own-tab, already retained-never-unmounted by the tab machinery; residency adds
the display/a11y/clock consolidation (a hidden profile detaches from layout and its
L0 identity-shape shimmer dies on the manager's bit; root scenes take the singleton
path — no entry units). ITS DATA LANE DELIBERATELY STAYS with the central activity
flags (shouldSubscribeDataLane et al. — activation as a state input, the L2 shape):
those flags are a SYSTEM-WIDE liveness mechanism, so folding them into the manager's
bit is the RUNTIME-GOVERNANCE slice (one merge for every scene at once, the A#9
subscribe-nothing law's real home), not a per-scene fork here. The slice-1 alias
ShellLivenessBoundary died (one name: ShellVisibilityBoundary). Sim-proven: clean
flips profile→notifications→profile, return render fully intact (identity, stats,
sections, polls), zero contract errors. Gates: jest 391/391, invariants 29/29,
matrix 21/21. Watch item for the owner finger-test: profile scroll/segment restore
across the display:none hide (the P3 restore machinery re-applies on activation —
structurally covered, feel unverified).

**L3 SLICE 4 EXECUTED 2026-07-22 (the listDetail/bookmarks pair — identity-keyed
residency).** bookmarks = the root-tab shape (boundary wrap, singleton path).
listDetail = the FIRST MULTI-ENTRY managed scene, which generalized the resident
unit: units are keyed by CONTENT IDENTITY (residentUnitIdentityOf — `listId` +
targetUserId scope; shareSlug is ACCESS MATERIAL, never identity per RT-18, so
slug-only entries fall back to entryId with no cross-entry reuse), with the stable
unitKey `resident:<scene>:<identity>` as React's key — a re-push of the SAME list
reuses the resident tree with the entry updated in place; different lists are
different units; popped identities retain up to RESIDENT_UNIT_RETENTION_LIMIT (3)
beyond the live stack, oldest dropped first — **the eviction law's first live
budget** (last-N exemption; stack always exempt). Per-unit activity (entry
boundary) + the scene bit (visibility boundary) compose the display exactly as the
slice-2 fact factoring prescribed. Spec-tested (same-list unitKey stability,
distinct lists, retention cap ordering, slug fallback); jest 393/393, invariants
29/29, matrix 21/21 (flows 2-5 ARE the listDetail lifecycle, now over resident
units); sim: pair crossing clean (bookmarks↔profile↔bookmarks bit flips, return
grid intact, zero contract errors). L3 REMAINING: the runtime-governance merge
(activity flags → the manager's bit, A#9's real home), commitment-based eviction
budget beyond last-N, search family residency (with L4).

**L3 SLICE 5 EXECUTED 2026-07-23 (the runtime-governance merge — A#9 lands).**
For residency-managed scenes, the two STANDING hidden data lanes died in the
activity derivation (the one computation home, scoped by the strangler boolean):
(1) the hidden-idle prewarm lane (canPrewarmRetainedMountedBody held CONTINUOUSLY
while a retained tab sat hidden at idle — the background render tax: every cache
invalidation re-rendered display:none resident trees) and (2) keep-subscribed-
after-activation retention. The resident TREE is the warmth — a tab switch shows
last data instantly; the lane re-admits at press-up via the existing P4
presented-activation (immediate admission), and stale queries re-derive at reveal.
Unmanaged scenes (polls) keep today's timing. Sim-proven (managed-bit probe, then
removed): hidden bookmarks runData:false subData:false while profile active —
visible scenes keep live lanes; page intact. Gates: jest 393/393, invariants
29/29, matrix 21/21. First-visit cold open is now press-up-admitted (slightly
colder ONLY on the very first visit); press-down prediction is the recorded
warm-before-navigate refinement. Pre-L4 note: re-derive at reveal can show
last-data→fresh update — the beat-writer (L4) owns removing that flash.

RIG TRAP (2026-07-23, cost a debugging loop): the repo folder was RENAMED
(~/CraveApp → ~/Crave, old name now a symlink) while Metro ran — Metro's watcher
stayed rooted at the pre-rename path and SERVED STALE TRANSFORMS for every
post-rename edit, while reload-dev-client's "bundle quiescent" check passed
(deterministic STALE output hashes equal). Any repo move/rename ⇒ restart Metro
from the canonical path with --clear.

## L4 — REVEAL + THE CONTENT-LANDING CLOCK (redesigned; v1's weakest level)

The red-team's deepest finding (B#1/#2): v1's "one beat at the joint" attacked the
wrong term — the release-measured burst is ROW MOUNTING when the response lands
seconds after the transition, outside any transition edge. L4 is now two laws:

- **Law 1 — transitions only reveal.** With L3 real, a switch is: retarget visibility
  + run the animation + stamp the target shell (chrome + whatever content exists) in
  one pre-reveal batch. **L4 is re-derived from L0–L3, not inherited (A#1):** the
  transition object needed is `{from, to, animation, contentBeat}`. The existing
  engine's cold-path vocabulary — paintAck production, warm gates, painted-evidence
  records, synthetic acks, freeze bundles — exists to choreograph CONSTRUCTION during
  motion; with no construction reachable, it reduces to constants and DIES (B#12 —
  §gut-list, and its survival is the falsifier: if any ack is still needed, L3 was not
  achieved). What survives of the engine: identity, supersession, the trace, and
  progress semantics (below). Gesture transitions are functions of progress ∈ [0,1]
  with content beats pinned to threshold crossings, idempotent under reversal (a
  landed beat stays landed; reversal only retargets visibility — A#12).
- **Law 2 — every shell owns a CONTENT-LANDING CLOCK** (B#2 — beats exist in steady
  state, not just transitions): all slot writes — responses, pagination, live updates,
  image loads, the collaborator-row class — coalesce through the shell's landing gate:
  at most one content commit per beat window, above-the-fold first. **Row mounting is
  sliced** (B#1): beat one lands the above-fold rows; the remainder mounts in
  idle-frame slices (this — the mount-reduction arm — is the load-bearing fix for the
  measured 172–180ms frames, promoted from v1's footnote to a named law).
- **The slow-network law (B#11 — owner ratifies, product):** one-beat is a cap on
  dribble, not a dam against partial content. Data arriving within one window lands
  atomically; a late response lands above-fold progressively through the clock; shimmer
  past a declared timeout resolves to the error material with retry. No 10-second
  silent shimmer.

**L4 SLICE 1 EXECUTED 2026-07-23 (attribution + the stamp seam + the honest miss).**
THE TRACE FINDINGS (managed→managed transitions, [TXN-TRACE]): the PAINT join is
ALREADY a same-tick constant for warm legs — the host's T5 evidence-offer fires it
~0.1ms after arm (B#12's reduction exists de facto; the declaration dies with full
migration, not per-scene). The REAL reveal wait is the CHROME join: 28-96ms — and
it is NOT ack plumbing, it is THE SIZE OF THE PRESS-UP COMMIT (frame flip + header
swap + the entire content re-activation cascade render in one React commit; the
chrome ack fires at its end; the reveal correctly waits for it).
LANDED: **[L4STAMP]** (permanent dev instrument — per-txn `joinWaitMs` =
committed→revealed at the revealed edge; the number Law 1 exists to shrink) + **the
stamp seam** in ShellVisibilityBoundary: DISPLAY is urgent (style-only, lands with
the header in the reveal commit); LIVENESS is `useDeferredValue`-deferred one pass —
content re-derivation is structurally the first BEAT after the reveal, never inside
it. THE HONEST MISS, measured: joinWait ~unchanged (30-87 vs 28-96 baseline) — the
commit's dominant weight is the ACTIVITY-FLAG CASCADE (data-lane re-admission
renders at press-up flow through the runtime's urgent publish), not the boundary's
liveness consumers. NEXT LEVER, named: defer the managed scenes' content-lane
activity flip one pass behind the frame/header publish (runtime publish-path
surgery; must preserve P4's press-up admission by at most one pass). Gates: jest
393/393, invariants 29/29, matrix 21/21 ×2 consecutive (an earlier 20→19 degrade
re-attributed to accumulated in-app rig state across back-to-back scenario+matrix
loops — cold relaunch clean; the pollution class is recorded rig lore).

**L4 SLICE 2 EXECUTED 2026-07-23 (the activity-flip deferral).** The one publish
chokepoint (notifySceneBodySurfaceListeners) now defers MANAGED scenes' body-
surface notifies one task behind the frame/header publish (coalesced flush;
snapshot state still computes synchronously — P4's press-up admission is truth
immediately, only the render moves a pass; unmanaged scenes keep the sync notify;
teardown clears the pending flush). [L4STAMP] verdict, honest: root→root improved
(profile 43→24ms) and the architecture is right (content re-activation renders
are structurally out of the reveal commit) — but the RETURN-FROM-CHILD shape
(setRoot bookmarks from a pushed notifications) holds at ~90ms in every run vs
~36 from home: a different commit anatomy (stack unwind + child teardown + root
re-activation together), NOT flowing through this chokepoint. Next attribution
target, tools named: WorkSpan spans + the React Profiler onRender hooks under
perf attribution, on the return-from-child commit. Gates: jest 390/390 (the
393→390 delta predates this slice — concurrent wave-6 session commits),
invariants 29/29, matrix 21/21 cold.

**L4 SLICE 3 EXECUTED 2026-07-23 (beats flush at the reveal — and the second honest
miss).** The slice-2 task-deferral could still RACE into the pre-reveal window (a
setTimeout(0) flush lands before a chrome commit that is itself a later task — the
in-window notify spans proved it). REFINED: while a txn is pre-reveal (staged/
committed/joining) the managed flush HOLDS and releases on the txn's REVEALED edge
+1 task — Law 1's beat discipline is now guaranteed, not raced (deadlock-free: the
reveal joins paint [instant-warm] + chrome [frame-driven header], neither consumes
body-surface notifies; the engine's forced-reveal contract bounds the hold).
MEASURED, the second miss: return-from-child STILL ~93-105ms (root→root stays
~30-37) — the weight is NOT the managed notify cascade at all; it is the
unmanaged return-path machinery (stack unwind + child leg teardown + sheet-lane
re-derivation) outside this chokepoint. NEXT TOOL NAMED: the Hermes sampling
profiler (EXPO_PUBLIC_PERF_SCENARIO_HERMES_PROFILE=1 at Metro start — the
scenario system already carries start/stop/dump) on the return-from-child window;
selector-diff WorkSpans are all 0ms noise and Profiler render events don't arm on
this scenario. Gates: jest 390/390, invariants 29/29, matrix 21/21 cold.

**L4 SLICE 4 — THE RETURN-FROM-CHILD ATTRIBUTION (2026-07-23; instrument landed,
trigger cornered, one bisection left).** The Hermes sampling profiler is DEAD on
this RN build (HermesInternal exposes zero keys — api_missing; the env-gated
scenario plumbing is intact for a future build). Landed instead: **[COMMITDBG]**
per-leg React.Profiler wrappers in the host's co-mount map (dev-only; logs leg
subtree renders >8ms). WHAT IT PROVED, with an inner split + a controller-input
probe (both stripped after reading):
- The reveal-gated beat machinery WORKS: the bookmarks activation renders (grid,
  ~58-75ms total) land POST-reveal on normal opens — the deferred beat as designed.
- The return-from-child pre-reveal weight = the bookmarks BODY subtree re-rendering
  ~75ms of a ~77ms leg render (leg machinery ≈ 2ms) — INSIDE the chrome-ack commit.
- THE CORNERED MYSTERY: the bookmarks controller re-renders ~4× per transition
  with its activity flags UNCHANGED (subLane=false throughout) — including
  transitions that never involve bookmarks (a notifications push). The activity
  context is identity-stable (field-memoized ✓), the body-surface authority IS the
  deferred chokepoint ✓, the component is memo'd with no props ✓ — the trigger is
  hook-level inside the controller (RQ/zustand/context set) and needs ONE more
  bisection (per-hook identity logging, or why-did-you-render). This is the
  background-render-tax class in a new costume: an uninvolved resident tab's
  full grid re-rendering on every transition.
Gates: jest 390/390, invariants 29/29, matrix 21/21 (fresh app; the 20/21
warm-app pollution pattern reconfirmed the rig lore).

**L4 SLICE 5 EXECUTED 2026-07-23 (the return-from-child diet LANDS — two cuts).**
The bisection probe named both diseases and both are dead:
- **THE CONTEXT-VOLATILITY SPLIT:** the render-activity context bundled `isActive`
  (flips on EVERY transition for both participants) with the stable data-lane
  flags — every consumer re-rendered its full body per transition, including
  transitions that never involved the scene (the ~75ms bookmarks grid tax).
  isActive now lives in its OWN primitive-valued context
  (useBottomSheetSceneStackBodyIsActive — profile's segment/scroll-restore edge
  keeps it); the render-activity object is TRANSITION-STABLE.
- **DEFERRED PUBLICATION (the deferral's honest completion):** deferring only the
  notify was BYPASSED by prop-driven re-renders re-reading fresh snapshots
  synchronously (useSyncExternalStore's contract) — the activation render still
  landed inside the chrome-ack commit on return-from-child. For managed scenes an
  ACTIVITY-ONLY change now holds the PUBLICATION itself (getSnapshot serves the
  pre-flip snapshot until the reveal-gated flush commits it); STRUCTURAL changes
  (contentEntry/transport/units — cold mounts) publish synchronously so the
  premount law (C4) holds. Internal admission truth (the activity map) stays
  synchronous — only the UI-facing projection waits.
**[L4STAMP] VERDICT: return-from-child ~90-112ms → ~34ms.** Every managed
transition now reveals in 20-35ms — the residual IS the header commit. The
activation renders land in the post-reveal beat by construction. Gates: jest
390/390, invariants 29/29, matrix 21/21 cold, bookmarks return grid eye-verified.
L4 Law 1 is now REAL for the managed set: reveal batch = chrome + visibility;
content = beats after.

**L3/L4 SLICE 6 EXECUTED 2026-07-23 (the census sweep — every registry child joins
the managed set).** userProfile (`user:<userId>` — drill chains get per-user
resident units), followList (`follow:<userId>:<mode>`), dmSession
(`dm:<conversationId>` — a conversation's thread tree survives re-entry),
messagesInbox + editProfile (leaves), and the creation flows saveList/postPhotos
with the identity function's NEW NULL ARM: per-invocation EPHEMERAL — null
identity means legacy entry-keyed units with NO post-pop retention (a new
invocation always starts fresh), while still receiving the boundary + deferred
publication. The legacy entry-keyed spec contract re-fixtured onto the
still-unmanaged children (pollDetail/restaurant — with pollCreation the full
unmanaged remainder; search/polls stay bespoke until their own slices). Gates:
jest 390/390, invariants 29/29, matrix 21/21 cold; sim: profile→userProfile→
messagesInbox all reveal in the 25-35ms [L4STAMP] band, zero contract errors,
inbox eye-verified. THE STRANGLER'S REMAINDER: search family, polls,
pollDetail/pollCreation, restaurant — then the cold-path vocabulary dies.

## The migration bridge (B#5 — designed, not hand-waved)

The strangler needs an explicit, budgeted-for-deletion bridge:
- The persistent header host gains a **shell-owned-scene mode**: renders nothing and
  occupies nothing for migrated scenes; the shell's chrome is part of the leg's atomic
  reveal. Two-headers-fighting is unrepresentable because the host checks the shell
  registry (one boolean per scene, deleted with the host).
- The old measured-chrome cache is **frozen at migration start** (a snapshot donor
  pool) so unmigrated scenes' first-frame geometry cannot degrade as migrated scenes
  stop feeding it.
- **First scene: NOT listDetail** (B#5 — it crosses the old/new seam on every
  entry/exit). First = a self-contained leaf with both directions inside the new
  system's control (candidate: `settings` or `notifications` — no strip, static body,
  low blast radius), then `profile` (kills the SkeletonBox material), then the
  listDetail/bookmarks PAIR in one slice (both sides of the owner's worst transition
  cross together), then the search family last (the dual-band shell).
- Gates per scene: matrix + eye + the L0/L2 grep invariants (zero SkeletonBox, zero
  frostBacking arguments, zero panel pending branches in migrated scenes).

## Ratification structure (per the bottom-up law)

- **L0 + L1**: ratifiable now, WITH the truncation law as an explicit owner call.
- **L2**: ratifiable with the closed state enum + data-slots contract as written.
- **L3**: PROTOTYPE MEASURED (2026-07-16, ShellResidencyProbe — dev harness verb
  `shell_probe`, 20 shell facsimiles = chrome band + the real cutout material, 4 rows):
  · **LAW pole** (1 visible + 19 `display:none`): mount 134ms TOTAL (~6.7ms/shell —
    trivially schedulable at idle, won't even need slicing), RSS delta lost in GC noise,
    steady **60fps with 17–19ms max frames — indistinguishable from baseline**.
  · **ANTI-LAW pole** (20 live stacked, shimmer running): mount 707ms, **+96MB RSS**,
    UI thread COLLAPSES to 15–40fps with 60–425ms frames, sustained until turned off
    (instant recovery after). The visibility law is not hygiene — it is THE load-bearing
    law, now RED-proven: violating it reproduces the exact measured disease.
  · Caveats: facsimile fidelity (no strips/decor — the anti-law pole bounds the worst
    case), Rosetta sim, `display:none` as the pause approximation (the real L0 adds a
    true shimmer-off + detach). **L3 is ratifiable on these numbers.**
- **L4**: ratifiable with Law 1/Law 2 as written, WITH the slow-network law as an
  explicit owner call.

## Owner calls requested

1. **The truncation law** (all chrome text fixed-line at declared heights — listDetail
   titles ellipsize; this is what makes computed geometry true rather than aspirational).
2. **The slow-network landing law** (progressive above-fold + timeout-to-error, one-beat
   as the dribble cap — vs strict one-beat with long shimmer).
3. **The residency-prototype gate** (L3 waits for its numbers — accept the sequencing).
4. **The migration order** (settings/notifications → profile → listDetail+bookmarks
   pair → search family).
