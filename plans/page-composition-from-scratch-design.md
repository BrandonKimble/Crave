# THE PAGE — a from-scratch composition system (owner directive 2026-07-16)

Status: DESIGN. Built from scratch against everything we now know; the current code was
audited ONLY to extract fail points and nuances, never as a basis. Two philosophy-seeded
adversaries red-team this before it reaches the owner.

## 0. The audit — every owner-named symptom, root-caused (2026-07-16)

The census (greps in this session's log; verifiable):

1. **"Multiple skeleton implementations — should never be the case": CONFIRMED, ≥4.**
   (a) `SceneLoadingSurface`→`CutoutSkeletonSurface` — the correct cutout-through-frost,
   28 call sites. (b) `SkeletonBox` — SOLID GRAY boxes (`themeColors.border`);
   ProfilePanel composes 5 of them by hand = the "solid gray regular skeleton sheet"
   the owner sees. (c) `CutoutSkeletonTitle` — a third primitive for title bars
   (ListDetail, Restaurant). (d) The scene-stack host's S2 fallback AND
   SceneBodyReadyGate — two DIFFERENT wrappers that each decide skeleton presentation,
   with different backing rules. Plus per-panel hand-rolled `isPending` branches.
2. **"Sometimes cutout-through-frost, sometimes solid gray":** direct consequence of
   (1b) — Profile's identity block is a different material. Not a bug in a component;
   the existence of the second material is the bug.
3. **"Sometimes just white / no skeleton":** `frostBacking` is a hand-passed boolean at
   10+ call sites, with a derived default in ONLY ONE of the two wrappers. A cutout
   plate with frost-through holes over an opaque white body = invisible holes = "just
   white." We patched one wrapper; the class regenerates at every new call site
   because THE DECISION IS DISTRIBUTED.
4. **"Skeleton changes midway through":** up to THREE different skeleton owners can
   show IN SEQUENCE for one loading page — the host's S2 fallback (pre-body), the
   panel's own skeleton (post-mount, pre-data), the ready-gate's (query pending) —
   each composed differently. The mid-load change is the ownership handoff, visible.
5. **"Gap between header and skeleton":** the body's top seam comes from
   `resolveSceneChromeHeight(sceneKey) ?? persistentHeaderHeight` — a MEASURED cache
   with a cross-scene SIGNATURE FALLBACK. Until a scene's own measure lands, it
   inherits another scene's height or the PREVIOUS page's live header height → gap or
   overlap for the first frames.
6. **"The previous page's strip positioning messes with the next page":** same
   machinery + the strip lives in the ONE persistent header host whose layout persists
   across switches. Cross-page leakage is the design, not a defect in it.
7. **"Strip / profile stack appear a beat late":** the persistent header re-renders its
   slots AFTER the switch commit (structurally one beat behind the body swap), and
   under transition-window frame starvation (release-measured: 172–180ms UI frames in
   the reveal burst) that beat is long and visible.

**THE DISEASE (one sentence):** a page's visible composition is assembled at runtime
from N independently-owned, independently-timed, independently-styled layers — a
persistent header host that swaps content, a page frame that positions the body off a
cross-scene measured cache, two skeleton wrappers, three skeleton materials, and
per-panel loading branches — and NOTHING owns "the page" as a single fact. Layers
arriving at different times = beat-late strips and mid-load skeleton swaps; layers
computing geometry independently = gaps and cross-page leaks; layers choosing style
independently = cutout vs gray vs white. Every symptom is this one disease.

## 1. The from-scratch shape: A PAGE IS A VALUE

Built bottom-up; each level must be ratified perfect before the next builds on it.

### L0 — ONE MATERIAL (the skeleton/loading vocabulary)

There is exactly one loading material in the app: **the cutout plate** — an opaque
plate (the sheet surface) with holes whose backing shows through, shimmered while
empty. `SkeletonBox`, `CutoutSkeletonTitle`, and every hand-rolled pending branch are
DELETED as separate things; title bars and identity blocks are cutout SHAPES (row
templates), not different materials.
**Backing is never an argument.** What shows through a hole is DERIVED from the
declared surface stack beneath it (L1): frost if the stack is frost, plate-tint if the
stack is opaque. `frostBacking` as a hand-passed boolean ceases to exist — the
white-on-white class and the gray class become unrepresentable, not guarded against.

### L1 — THE SURFACE STACK (geometry + backing as one declaration)

A page declares its vertical composition as data:
`{ chrome: ChromeSpec, body: BodySpec, decor: DecorSpec }` where ChromeSpec is
`{ title: TitleSlot, strip?: StripSpec, actions: ActionSpec }` and BodySpec names its
surface (`frost | plate`) and its content template (row shapes).
**Geometry is COMPUTED, never measured-and-cached across scenes.** Chrome height is a
pure function of the declared ChromeSpec + device facts (safe area, dynamic type) —
deterministic before first paint. The header band and the body band are ONE layout
tree owned by the page. The measured-height cache, its signature fallback, and the
`reservedHeaderHeight` plumbing are deleted; the gap/leak classes die because no scene
can ever read another scene's geometry.
(Nuance carried: content-driven chrome — an async title — is a SLOT with declared
height that fills; height never changes when content arrives.)

### L2 — THE SHELL (loading is the same nodes as loaded)

The PageSpec compiles to ONE mounted subtree per scene — the shell: chrome band,
strip (if declared), body plate with its cutout template, decor. The shell's body has
exactly two states over the SAME nodes: **content-pending** (cutouts empty, shimmer)
and **content-present** (cutouts filled). There is no skeleton component to swap in or
out — the loading state IS the page with empty content. "Skeleton changes midway,"
"skeleton missing," and ownership handoffs are unrepresentable: there is nothing to
hand off.

### L3 — SHELL RESIDENCY (nothing is built during motion — by construction)

Every scene's shell mounts ONCE and stays resident; a switch retargets which shell is
visible. This is the toggle precedent (both tabs co-mounted — the ONE transition that
measures perfectly smooth in release) made universal.
**Strips are per-shell.** Each page owns its strip node inside its own shell; the
"persistent header host with swapped slots" dissolves. The beat-late strip and the
cross-page strip leak die because nothing is shared between pages to arrive late or to
leak. (The strip ENGINE — the morphing/edit-mode primitive — survives as the component
the shell mounts; its per-page instance is the change.)
What stays genuinely shared: the sheet container, the gesture surface, the map.
Memory nuance: shells without content are cheap (plates + slots); CONTENT residency is
governed by the L-2 eviction laws (stack-pinned, budgeted) — shells keep their nodes,
content evicts.

### L4 — TRANSITIONS REVEAL; DATA LANDS ON THE BEAT

With L3, the transition engine's job collapses to what it already does well: reveal a
pre-existing shell (the txn's phases gate visibility, never construction) and land
content in ONE batch at the joint (the episode's `revealed` edge writes the content
slots; late-arriving pieces — the collaborator-row class — join the NEXT declared
beat, never dribble). The work-scheduler sketch survives only as the small executor
that slices CONTENT preparation off the critical path; there is no shell construction
left to schedule. The release-measured reveal burst shrinks structurally: the mount
cost of a reveal is rows-into-resident-slots, not subtree construction.

## 2. Why this is the from-scratch ideal and not a coordination patch

Each symptom's cure is an *unrepresentability*, not a rule someone must follow:
- Two skeleton materials CANNOT exist (L0 is the only material and panels receive
  content SLOTS, not the ability to mount arbitrary pending branches).
- Wrong backing CANNOT be passed (it is derived; there is no argument).
- Skeletons CANNOT change mid-load (loading and loaded are the same nodes).
- Geometry CANNOT leak across pages (no cross-scene cache exists to leak through).
- Strips CANNOT arrive late relative to their page (they are part of the shell that
  the transition reveals atomically).
- New pages get all of this by declaring a PageSpec — the future-additions nuance the
  owner named is the default path, not a discipline.

## 3. What gets gutted (the sweep)

PersistentSheetHeaderHost's slot-swapping (the strip/title/action machinery),
BottomSheetSceneStackPageFrame's reservedHeaderHeight seam, the measured-chrome cache
+ signature fallback, SceneBodyReadyGate AND the host's S2 skeleton fallback (both
wrappers), SceneLoadingSurface/SkeletonBox/CutoutSkeletonTitle as public API (the
cutout engine survives INSIDE the shell compiler), every per-panel isPending loading
branch, and the scene-stack host's per-leg chrome/body layer hosts to the extent they
re-implement composition the shell owns. The scene-stack HOST itself survives as the
shell residency manager (it already holds legs; legs become shells).

## 4. Open design decisions (for the red-team + owner)

- Shell count & memory ceiling: all ~19 scenes resident, or resident-on-first-visit
  with an LRU floor? (Lean: first-visit residency; shells are cheap but not free.)
- The search results page's dual-tab body (already two co-mounted lists) — one shell
  with two body slots (the precedent formalized) or two shells?
- Edit-mode strip morphs mutate chrome GEOMETRY (heights change) — L1 says geometry is
  computed from the spec: edit mode is a second declared ChromeSpec state (computed,
  not measured), verify the strip engine fits.
- Map-dominant pages (search home) declare `body: none` — confirm the frost/map stack
  needs no plate at all.
- Migration: strangler per scene (compile ONE scene to a shell, matrix + eye, then
  sweep) vs big-bang. Lean strangler with listDetail first (the owner's worst page).
