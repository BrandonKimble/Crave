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

## L3 — SHELL RESIDENCY (GATED on a measured prototype)

Every scene's shell mounts once and stays resident; switches retarget visibility.
The red-team is right that "shells are cheap" is an unmeasured claim (A#7, B#6) —
**L3 is not ratifiable until the prototype measures**: all shells mounted empty on the
target sim/device — boot delta, resident memory, steady-state UI fps.

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
