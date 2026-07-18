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
foreign tree via push_child_scene+routeParamsJson). Remaining L2 surface: FlashList
bodies (bookmarks/listDetail — placeholder ITEMS as a cell rendering mode),
BodySpec bands + SingleLineText at the search family.

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
