# Toggle strip + edit mode — the charter (owner intent, distilled 2026-07-12)

This is the owner's complete intent for the toggle-strip system and favorites edit
mode, captured verbatim-in-spirit so nothing gets lost between sessions. It is the
brief for the agent that owns this domain. Companion docs:
[toggle-strip-primitive.md](toggle-strip-primitive.md) (the in-flight primitive build,
UNCOMMITTED in the working tree) and
[favorites-edit-mode-ideal.md](favorites-edit-mode-ideal.md) (the edit-mode design
pass — owner-endorsed direction, but its "ground truth" section was attributed BEFORE
the primitive session's second-day work landed in the tree; reconcile before trusting).

## The law (applies to every decision below)

Ask continuously: **if we were designing this from scratch today — knowing every
requirement and constraint we now know — is this the implementation we would have
built?** If not, stop. Design the ideal mental model ground-up first, then compare the
code to the model — never the model to the code — and cut over completely. The current
implementation is not the baseline; the mental model is. No patches, no guards, no
compensations; root-cause fixes at the correct layer, deletions of the non-ideal, and
contracts that can prove themselves RED. (See memory: uncompromising-ideal-ethos.)

## Part 1 — The fidelity bar: the results-sheet strip is the reference

The owner is unsatisfied because the favorites/polls strips do not match the
results-sheet strip. Before anything else, the results strip must be understood
**uncompromisingly — zero room for missed nuance**. Its properties, all mandatory
everywhere:

1. **Frost cutouts per control** — see-through holes to the frosted map, derived from
   child layouts (impossible to omit), moving with the strip as it scrolls/morphs.
2. **Edge-to-edge bleed** — the strip flows off the physical screen edge. NO white
   bars/pillars at left/right that controls slide under (the current favorites+polls
   strips have these — that is the defect), no horizontal content bound or padding
   capping the strip.
3. **Visually infinite overscroll** — the white cutout strip never shows an end: you
   can rubber-band left or right as far as you want and the strip surface continues.
4. **Real scroll physics** — rubber-band overscroll, press-up gesture semantics
   (unbounded hold), warm restore of scroll position.
5. **Continuity across content swaps** — on results, the strip appears as ONE
   continuous thing across the restaurant list and the dish list: switch sides and it
   never remounts, never flashes. (Today this may be two synced instances — understand
   exactly how before judging it.)
6. **Mounted from first paint** — the polls strip currently snaps in after the page
   comes up. Wrong. The strip must be present when the page presents; if resolution
   genuinely must be async, it resolves UNDER the skeleton, never after reveal.

## Part 2 — The placement axis: one engine, two mounts

Two legitimate placements exist, and the ideal shape treats placement as a declared
leaf concern on a placement-agnostic strip engine (scroll/cutouts/overscroll/frost/
morph all live in the engine; mounts are thin adapters):

- **In-list card mount** (results sheet today): the strip is part of the list content,
  scrolls away with it, one continuous appearance across both list sides.
- **Header-extension mount** (polls feed, favorites home, most future surfaces): the
  strip sits directly under the persistent header as an extension of it, and the
  header divider moves BELOW the strip. Git history contains prior art of a
  strip-attached-to-header era — excavate it, but rebuild on today's primitives.

Decisions:

- Results stays in-list (shipped, blessed, world-consequence toggles). Polls feed +
  favorites home migrate to the header mount. Most future strips default to header.
- The engine/mount split must make flipping a surface's placement a one-line change,
  so if we ever decide results should be sticky too, it's a mount swap, not a rebuild.
- **DECIDED — owner ratified 2026-07-12: the placement-agnostic engine + two mounts
  IS the end state.** Uniformity of ENGINE is the goal, not uniformity of placement.
  The razor that settles per-surface placement: toggles that re-slice content you're
  actively consuming (high chance of switching mid-list — Live/Results,
  Restaurants/Dishes, sorts) earn sticky; setup-once/settings-like toggles
  (Spotify's) can ride the list. (Google Maps note: owner observes their strip
  riding in-list as the first row; Jarvis recalls pinned filter chips in the screen
  chrome under the search pill in category-search mode. If both are right, Google
  itself runs both placements — either way the two-mount decision stands.)

- **ListDetail is DEFERRED to a future session.** Its chrome (list name, plus button,
  collaborator avatar stack) competes for the same space and needs its own design
  pass. When it comes, it is the proving ground: if the primitives are truly ideal,
  implementing its strip — with the FULL registry toggle inventory (open now, etc.,
  all currently missing there) — should be trivially easy. That ease is the test.

## Part 3 — The choreography axis: world vs content-only

Two consequence classes, declared per toggle:

- **World choreography** (results strip): the toggle changes map + sheet together.
  The existing machinery (begin → fade-out floor-ack → commit) is correct; keep it.
- **Content-only choreography** (polls feed, favorites home): the toggle just
  re-slices/reorders/switches the sheet content. **Hard constraint: do NOT reuse the
  map/list coordination machinery for these.** Build a new, deliberately simple
  mechanism.

Content-only v0 (foundation now, polish later):

- Old cards leave **on press-up**. New cards come in the moment they're ready —
  start with snap-out/snap-in, the simplest possible thing.
- Then observe the real gap between press-up and content-ready, and let that data
  drive what transition we adopt. Industry reference points the owner likes:
  Spotify's snap-old-out → quick-fade-new-in is the preferred feel; Reddit/Spotify
  never show a skeleton between toggle slices. Ideal end state: the switch feels
  instant; a crossfade only if latency forces it.
- NO skeleton sheet between toggle-driven slices.
- Later investigation (not now): how industry gets slices instant — possibly
  pre-fetching all first-page toggle permutations while the page skeleton shows.
  Build the foundation so this optimization has an obvious seat.
- Declaring a new toggle must be trivial: a page declares
  `{segments/chips, consequence: 'world' | 'content'}` and everything else —
  choreography wiring, frost, cutouts, physics — is inherited.

## Part 4 — Edit mode (favorites): endorsed design, with the strip dependency

[favorites-edit-mode-ideal.md](favorites-edit-mode-ideal.md) is the spec of record;
the owner has endorsed its shape. The essentials, restated as requirements:

- **There is no edit page.** Edit mode makes the CURRENT sheet content editable in
  place — whichever side (restaurants/dishes) you're looking at. The inline content
  swap to a bare row list is the defect; delete it (BookmarksEditList, edit-row
  rendering). Ellipsis buttons crossfade to grab handles in place; tiles stay tiles,
  rich rows stay rich rows, draggable in their real layout (slot-map generalization
  of the drag math: variable-height rows for ListDetail, 2-col grid for Bookmarks).
- **The Edit chip is a strip citizen**: leftmost in the toggle row, appears when
  sort = Custom, takes intrinsic width and PUSHES siblings right (overflow scrolls —
  that's what a strip is for). Never squeeze, never truncate, never ellipsize
  siblings. It moves with the strip like any other citizen.
- **Entering edit**: the toggle row slides out to the right FROM ITS CURRENT scroll
  position (composes with live physics), and the action row (Cancel · Undo · Redo ·
  Save) slides in from the left. The action row is NOT scrollable, NOT a toggle, and
  NOT reachable by scrolling when edit is inactive — unreachable **by construction**
  (unmounted until edit), not by clamping. The strip primitive owns this morph as a
  first-class **action-row slot**; the existing 240ms two-layer feel is the baseline.
  Cutout holes are per-row and ride the morph.
- The whole thing must feel as good as the current animation (owner likes it) — the
  foundations under it are what's wrong, not the feel.
- Toggle inventory must be complete per surface (check plans/page-registry.md):
  Bookmarks = Edit(custom) · Recent/Custom · Restaurants/Dishes; open product
  questions for the owner: visibility (public/private) filter? scope chip on All?

## Part 5 — The audit mandate (first leg, read-only)

The primitive session's work is UNCOMMITTED in the working tree. **Owner reviewed
that exact tree (2026-07-12) and confirmed: the dropdown work + reorganization is
good, but NONE of this charter's complaints are addressed — the complaint list is
gold source, current against the tree as it stands.** So where an item below asks
"does X still happen": it does. The audit's job is mechanism attribution — root-cause
each defect at the correct layer in code — not re-litigating whether defects exist
(the owner's eyes already settled that; no sim confirmation needed this leg):

1. Fidelity: do the favorites/polls strips STILL have white edge bars? Do cutouts,
   edge bleed, infinite overscroll, warm restore match the results strip exactly?
2. Placement: are the polls/favorites strips still in-list? (Charter says: header
   mount.) Does anything in the new work fight the engine/mount split?
3. Mount timing: does the polls strip still snap in after present?
4. Edit morph: the tree has "both morph rows = FrostedFilterStrips" — does that match
   the action-row-slot design (unmounted-until-edit, per-row holes, slide-from-
   current-scroll), or is it a parallel hand-rolled morph that needs to converge?
5. Reconcile favorites-edit-mode-ideal.md's ground-truth section against the CURRENT
   tree (it may predate the session-2 favorites conversion).
6. Choreography: is anything content-only accidentally riding the map machinery?
7. What's missing before edit-mode work can start? Produce the gap list.

Also audit the primitive itself against "the law": is FrostedFilterStrip +
SegmentedToggle + SelectorChip + the engine the shape we'd build from scratch for
BOTH mounts and BOTH consequence classes? If not, say so and design the cutover.

## Part 6 — Sequencing

1. Primitive to the fidelity bar everywhere + placement axis (header mount built
   properly) + content-only choreography foundation.
2. Migrate polls feed + favorites home strips to the header mount (divider under
   strip). Results stays as-is.
3. Edit mode per Part 4 (action-row slot in the primitive → panel conversions →
   in-place editable content → delete the edit list).
4. ListDetail strip + its edit + its full registry inventory — FUTURE session, as
   the proving ground.

## Part 7 — Excavation map (context the agent must actually read)

- Plans: toggle-strip-primitive.md, favorites-edit-mode-ideal.md, page-registry.md
  (canonical toggle inventory), page-foundation-codification.md + ADDING_A_SCENE.md §5
  (page = 8 pieces; the strip is piece 4), sheet-frost architecture (memory).
- Code (uncommitted tree): apps/mobile/src/toggles/toggle-interaction-engine.ts,
  components/SegmentedToggle.tsx, SelectorChip.tsx, OptionSelectorSheet.tsx,
  OptionSelectorHost.tsx, option-selector-store.ts, overlays/panels/BookmarksPanel.tsx,
  PollsPanel.tsx, SaveListPanel.tsx, ListDetailPanel, the results strip + its frost
  cutout implementation (find the real one — it's the reference), SearchFilters.tsx +
  use-search-root-search-scene-filters-header-runtime.ts (header seam).
- Git history: the strip-attached-to-header era (header divider under strip) — find
  the commits, understand why it moved, rebuild the idea on today's primitives.
- Memory files: toggle-strip-primitive, page-foundation-standard,
  uncompromising-ideal-ethos, sheet-frost-architecture, testing-methodology.

## Part 8 — Owner decisions (updated 2026-07-12 evening)

- **DECIDED — no Bookmarks visibility filter.** Visibility is a per-list SETTING,
  not a consumption slice. **REFINED CANON (owner, 2026-07-12 late): visibility
  controls DISCOVERY, never ACCESS.** PUBLIC = on your profile, discoverable.
  PRIVATE = off your profile, unlisted — link holders and collaborators KEEP access
  across flips until revoked individually in the modal; enableShare never changes
  visibility; link view-vs-collaborate mode stays its own orthogonal toggle.
  Supersedes RT-18. API conformance = leg 6.
  The strip stays declarative, so a filter can be added later if list counts grow.
- **DECIDED + MAJOR SHAPE CORRECTION — the All list NEVER mixes dishes and
  restaurants.** There are TWO All lists, one per side of the list home page
  (restaurants side has its All, dishes side has its All), mirroring the two-sided
  page itself. Therefore NO scope chip is needed on All's detail page. VERIFY the
  current data/UI shape matches this (per-side All); any deviation is flagged with
  attribution and lands in the ListDetail design session — this correction is
  binding on that session's inventory.
- ~~Ratify scrollX warm-restore~~ — RATIFIED + BUILT (leg 2; reset-on-re-present
  refinement built leg 3).
- ~~Ratify foundation backdrop contract~~ — RATIFIED + BUILT (legs 2-3).
- 4-way switchers (Profile, Restaurant views) + inline text sorts — explicitly
  parked as owner design decisions in the primitive plan.
- Content-readiness strategy (pre-fetch permutations) — later, after the gap is
  observed.

## Status ledger

- 2026-07-12 — LEG 5 COMPLETE (built + jest/sim-verified, UNCOMMITTED; owner
  finger-tests legs 2-5 together): edit mode = the SAME content made editable
  (Bookmarks). Content swap DELETED (BookmarksEditList / bare-row rendering /
  EDIT_ROW_HEIGHT dead; ReorderableRows survives for ListDetail); slot-map drag
  (computeDragFrame generalized to N columns — columns:1 reduces verbatim to the
  shipped 1-D math — + ReorderableGrid on measured read-grid geometry w/
  row-uniformity RED bark); ellipsis→handle in place (same footer slot/touch
  target; pinned system + All tiles rendered handle-less); undo/redo/save/cancel
  verified on the existing store session (pure history — no reshape needed).
  Leg-4 red-team failure path BUILT at the seam: `captureControlBaseline`
  (capture-at-settle, restore on 'failed' only) + polls runner honesty
  (refreshPollFeed returns its outcome; runner throws on failed/unavailable) +
  press-edge-suppressed store restore — control can never lie over stale content;
  4+2 new jest specs. Part 8 verified: All list per-side CORRECT everywhere;
  visibility canon recorded in product/favorites.md with TWO flagged shipped-code
  contradictions (private-flip kills collaborators/share; enableShare force-flips
  public). jest 263/263, tsc/lint green, sim evidence + walkthroughs in
  [toggle-strip-rebuild-ledger.md](toggle-strip-rebuild-ledger.md) §Leg 5.
- 2026-07-12 — LEG 4 COMPLETE (built + sim-verified, UNCOMMITTED, awaiting owner
  finger-test of legs 2+3+4 together): content-only choreography per audit D5 —
  the consequence seam's `'content'` class is real (contentPhase 'awaiting' flips
  on press-up in the caller's stack → old cards exit NOW; resolution edge snaps new
  cards in; NO skeleton), `useContentToggle` wired into polls
  (feed controller + panel bare-white gap) and bookmarks (settleMs 0 degenerate,
  provably same-frame); `[CONTENTTOGGLE] gap` instrumentation from day one —
  measured: polls 337–655 ms (n=4), bookmarks 1 ms. Three defects resolved: dead
  close-search-cleanup runtime root-caused (last caller lost in 9fa642d7;
  clearSearchState is a strict superset) and DELETED with its arg-threading; stale
  seeded strip holes made unrepresentable (seed pruned to rendered slot keys +
  spec); morph exit-distance over-scaling fixed (exit = one viewport width — the
  translation applies to the clipped viewport container; feel change: exit speed
  now matches action-row entry). tsc/lint green, jest 242/242, verified-fresh-
  bundle sim evidence + walkthroughs in
  [toggle-strip-rebuild-ledger.md](toggle-strip-rebuild-ledger.md) §Leg 4.
- 2026-07-12 — LEG 3 COMPLETE (built + sim-verified, UNCOMMITTED, awaiting owner
  finger-test of legs 2+3 together): header-extension mount = `Strip` slot on the
  persistent-header descriptor (measured chrome grows; divider + body lane follow);
  polls + favorites migrated (snap gate + display:none strip gating dead; control
  state in per-scene stores — chrome writes, body reads); favorites edit morph on
  the engine action-row slot (flex-huddle dead); scrollX re-present reset built as
  an engine facility (cache + LIVE retained instances) and wired at
  clearSearchState + header-strip unmount; FrostedFilterStrip + polls negative-
  margin folklore DELETED; inverse strip law barks both directions. jest 222/222,
  tsc/lint green, all flows sim-verified. Fossil scrollHeader lanes explicitly
  deferred to a focused pass (touches the scroll-handoff surface). Evidence:
  [toggle-strip-rebuild-ledger.md](toggle-strip-rebuild-ledger.md) §Leg 3.
- 2026-07-12 — LEG 3 LAUNCHED (resumed same agent, transcript intact): header
  mount + polls/favorites migration + favorites edit morph onto the action-row
  slot + delete list. Owner decisions folded in: scrollX RESETS on re-present
  (persists across tab flips only). No commits until owner finger-tests 2+3.
- 2026-07-12 — LEG 2 COMPLETE (built + sim-verified, UNCOMMITTED, awaiting owner
  finger-test): ToggleStrip engine per D3.2 (band geometry by construction, backdrop
  contract w/ auto-FrostCutout, layout+scrollX warm restore, action-row slot,
  consequence seam w/ RED content stub), foundation strip law load-bearing
  ('none'|'in-list'|'header'), results converted zero-regression + scrollX survives
  tab flip. jest 218/218, barks proven RED on-device. Evidence:
  [toggle-strip-rebuild-ledger.md](toggle-strip-rebuild-ledger.md). Open owner
  calls: scrollX-on-re-present keep/reset; FrostedFilterStrip frozen shim = leg-3
  delete. NOTE: unrelated map lens-transport work (4 files) now also uncommitted in
  tree — do not co-attribute at commit.
- 2026-07-12 — LEG 2 (engine + results conversion) LAUNCHED after owner go: both
  ratifications YES (scrollX warm-restore joins the bar; foundation backdrop
  contract structural), checkpoint 8ed123f3 committed as the fallback line. Build
  ledger: [toggle-strip-rebuild-ledger.md](toggle-strip-rebuild-ledger.md). No
  commits until owner finger-test.
- 2026-07-12 — LEG 1 (read-only audit) COMPLETE: report + full mechanism/defect
  detail in [toggle-strip-audit-leg1.md](toggle-strip-audit-leg1.md). Verdict: keep
  controls + engine verbatim; strip layer = half-engine, needs the real rebuild
  (engine + two mounts). Keystone defect = foundation white plate under non-search
  scenes. Leg 2 (engine + results conversion) awaiting owner go.

## Part 9 — Coordination

The other (human-driven) session may still be active on this same uncommitted tree.
First leg is therefore READ-ONLY audit + design. Before any build leg: check whether
that session's work has landed/stopped; build on top of it, don't fork it. If it
stalls, this agent absorbs its remaining scope rather than waiting.
