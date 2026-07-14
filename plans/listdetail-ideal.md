# ListDetail — the ideal shape (leg 8 design pass + search-trigger attribution)

Read-only design leg per wave2-lists-transitions-charter.md §6 (+ §2 relocations, §7 gallery
seam, §10 boundaries). No code changed. Sources: page-registry.md §1/§1b/§8.14/§8.16/§9,
w1-listdetail-structural-spec.md, favorites-edit-mode-ideal.md, toggle-strip-and-edit-charter.md,
toggle-strip-rebuild-ledger.md, world-camera-multilocation-foundation.md, and the tree at
2026-07-13 (uncommitted leg-7 + transition-perf edits present — noted, untouched).

---

## 1. THE SEARCH-TRIGGER ATTRIBUTION (the owner's "huge miss")

**Verdict: wired, then deliberately unplugged, then erased as "dead code." Three commits tell
the whole story; the world-side machinery is STILL alive and orphaned, so the distance back is
short.**

### The design of record (it was always supposed to work this way)

- page-registry.md §1 (listDetail row): _"Body = the Search Results renderer; **OPEN fires the
  shared search flow** (entityIds → map pins + reveal, favorites-as-search)."_ §4: _"listDetail
  and entity taps fire the shared flow (map reacts: pins/coverage load, synchronized reveal)."_
- world-camera-multilocation-foundation.md §2/§3.2: a list is a WORLD —
  `body = ListBody(list)`, `camera = fitAll(members, safeRegion)`, `policy = search`;
  `safeRegion` = "the map area between the search bar and the mid-snap sheet top";
  `fitAll` is "exact by owner decree ('no exceptions')". The reveal joint's third track:
  camera motion starts at ramp start, "sheet content, pin fade-in, and camera arrival land as
  one moment, for every world kind identically."
- w1-listdetail-structural-spec.md §A.3: listDetail is a **world-backed orphan** — "its entry
  payload is a Desire with the `list(listId)` identity arm; **pushing it runs the search flow
  (map pins + synchronized reveal) via the SAME lane favorites-as-search already uses** …
  the world machinery is reused, the stack entry becomes real."

### What actually happened (git-proven)

1. **a48e96ef (2026-07-09, S-D.2)** — favorites-as-search WORKED. `resolveEntityRefAction`'s
   list arm returned `kind:'listWorld'`; world key `list:<listId>:<type>`; resolver fetched via
   `getListResults`; sim-verified: "Favorites → list tap → … results revealed, X-pop restored
   Favorites." The S-E `/l/<slug>` lane rode the same world.
2. **43ee4d01 (2026-07-11, W1 slices 3-4)** — the arm was FLIPPED to
   `{kind:'pushScene', scene:'listDetail'}` (entity-ref-action-policy.ts:58-61 today: "the ONE
   place the favorites-as-search arm was designed to flip. The panel owns data/failure").
   The spec said the push should RUN the search flow via the same lane; the build delivered
   only the push half. ListDetailPanel v1 became a **self-fetching panel**
   (ListDetailPanel.tsx:761 `favoriteListsService.getListResults` directly) — no desire write,
   no world, no map. The `listWorld` action was left "ONLY for the /list/<id> desire-link lane
   until that lane migrates."
3. **9bec4810 (red-team wave-2 cleanup)** — with no callers left, the residual trigger lattice
   was DELETED as dead: "listWorld lane deleted (entity-ref arm, /list/ codec arms,
   launch-intent consumer, launchFavoritesListResults lattice)." The
   `sharedList` deep link also became a plain push
   (use-search-foreground-launch-intent-runtime.ts:70-77). The miss was thereby cemented: a
   lane that was supposed to be REWIRED onto the child push was instead orphaned and swept.

So: **not unscoped, not unfinished-by-accident — the W1 slice-4 build substituted "plain child
push + panel fetch" for the spec's "world-backed child push," and the cleanup pass then erased
the trigger.** Nobody re-read page-registry §1's "OPEN fires the shared search flow" sentence
at either moment.

### How far off the end state is (short — the engine survived)

STILL ALIVE, orphaned (zero producers write a list identity today):

- `SearchQueryIdentity` `kind:'list'` arm — search-desired-state-contract.ts:35-41 (+ equality
  :152, world key `list:<listId>:<listType>` :215).
- The resolver fetch arm — search-world-fetch.ts:170 (`getFavoritesListResults`, openNow filter
  plumbed, `resolveFavoritesAdoptedTab`, single-restaurant collapse suppressed for lists) and
  the next-page fetcher; both injected in use-search-submit-owner.ts:343/355.
- Reconciler list case (search-world-reconciler.ts:66), tuple selectors (:36/:57).
- The reveal machinery (skeleton, sheet-to-middle, synchronized pin/label/dot/card reveal,
  world-consequence toggles) — all world-generic, proven daily by shortcuts/natural search.
- Camera: `resolve-focus-camera.ts` header records the decree — "Lists deliberately do NOT use
  this — fitAll is exact"; the `FocusCameraSafeRegion` type IS the "region above the mid-snap
  sheet" geometry. What does NOT exist: the `CameraIntent = hold|fitAll|focus` value on the
  world, the fitAll executor, and the reveal-joint camera track (world-camera L2's impure half,
  parked to "ride L1/L3").

MISSING (the wiring to design, §1d below): a trigger that BOTH pushes the listDetail child AND
writes the list desire tuple; ListDetail's body reading the presented world instead of
self-fetching; fitAll camera execution; dismiss = pop world + return-to-origin (the
return-to-origin foundation already handles the origin half — origin is captured on the entry).

### 1d. The wiring design

**One composite verb: a world-backed child push.** Restore the policy's list arm to a value
that carries both facts — e.g.
`{kind:'pushScene', scene:'listDetail', params: DesireShaped, world: {identity: {kind:'list', listId, listType, displayTitle}}}`
— and teach `useEntityRefActionExecutor` (use-entity-ref-action-executor.ts) that a pushScene
with a `world` arm does, in order:

1. `pushRoute('listDetail', params)` — header swaps immediately (press-up), nav-out derives
   from depth, skeleton per the pre-mount law (already built: 43ee4d01's [PREMOUNT] probe).
2. Write the desired tuple with the list identity (the same seat submitViewportShortcut
   writes) — the reconciler resolves, the map pulls the list's pins, coverage loads.
3. Sheet snap: `promoteAtLeast(middle)` if at top — the existing openChild motion-plan lane
   (resolveDefaultSheetMotionPlan), same as the restaurantWorld branch.
4. Camera: `fitAll(members, safeRegion)` executes at reveal-ramp start — new, small: bounds of
   ALL list pins fitted into the region between search bar and mid-snap sheet top (safe-region
   geometry already derivable from snap points; `FocusCameraSafeRegion` is the type). Exact,
   no outlier cut, `fitPaddingFactor` applied. Cross-market continent-zoom stays the named
   open owner call (world-camera §6).
5. Reveal: the standard synchronized joint — pins/labels/dots + the sheet's cards land
   together. Nothing new to build.
6. Toggles: ListDetail's strip declares `consequence:'world'` for sort/open-now/price/market
   (they re-slice map + cards through begin→floor-ack→commit, like results) — NOT the
   content-only lane. This is what "toggles slice as world-consequence" means and it is free
   once the body is world-backed.
7. Dismiss: pop the entry → world residency rule (trigger-nav verdict §5, "exactly one live
   world — nearest world-backed entry at or below top") re-presents the origin world from its
   pinned snapshot; return-to-origin restores page+scroll+snap. Machinery exists (restaurant
   child does this today).

`/l/<slug>` (sharedList intent) routes through the SAME composite verb once the panel resolves
slug→listId (it already does; the desire write can ride the resolution edge). Virtual All ids
(`all:restaurants` etc.) flow through unchanged — identity is the listId string.

**Body = the presented world.** ListDetailPanel stops calling `getListResults` itself; its
rows read the world's committed results (the ListBody peer kind, world-camera §2 — composes
the card↔pin coordination primitive, never MODELED as results). The meta query (name, roster,
viewerRole) stays a panel-owned react-query fetch — it is list metadata, not world data.

**RED contracts:** (a) a pushed listDetail whose world tuple never resolves must show the
failure body, not a stuck skeleton (exists); (b) "a camera intent nobody executes — must bark"
(world-camera's own verification line); (c) open a list at top snap → assert sheet demotes to
middle and camera-settle + reveal-ramp land in the same joint window (mach-clock, composite).

---

## 2. The page design (charter §6)

### 2a. Header + meta block

- **List name IS the header text.** Today the persistent-header Title is the literal string
  "List" (ListDetailPanel.tsx ~L1310) and the name renders in a body `titleRow` — delete the
  title row, content moves up. The name arrives synchronously when pushed from a tile (label
  rides the entry params, the house warm-seed pattern openRestaurantProfilePreview uses);
  slug opens seed it at meta-resolution under the skeleton.
- **Avatar stack flush under the header** (profile-page pattern): the collaborator stack chip
  (slot 1 = plus circle, slot 2 = owner, then collaborators — registry §8.1) with its top edge
  at the header's bottom edge. Tap → the existing CollaboratorModal.
- **Username · typed count**: owner username right of the stack; metadata dot; "N dishes" /
  "N restaurants" typed per the list's side. All from the meta query.
- **Header ellipsis**: fades in LEFT of the close button as a CUTOUT (white→clear reveal),
  synced to the §4 plus→X clockwise rotation, starting on press-up. **Dependency: the UI
  agent's plans/child-transition-primitive.md does not exist yet** — this seam is theirs; the
  requirement from our side: the persistent-header descriptor needs an optional leading-action
  SLOT whose reveal progress is driven by the same transition clock as the rotation (a
  candidate primitive — future child pages will want slot-fade-in chrome). Ellipsis opens the
  restyled list modal (§2 charter: Share · Delete · Add/Remove from profile · Use your photos ·
  Pin/Unpin — lucide rows, left-aligned, no blocks/separators).

### 2b. Toggle strip — the primitive's in-list mount, full inventory

Today: hand-rolled `SortChip`s + a hand-rolled morph (ListDetailPanel.tsx L364/L439) — exactly
the pattern legs 2-5 deleted from Bookmarks. Replace with a `ToggleStrip` declaration,
placement `'in-list'` (scrolls under the header with the list — part of content, NOT header
chrome), placed under the avatar/meta block. Everything (frost cutouts, edge bleed, infinite
overscroll, physics, warm restore, action-row slot) is inherited; the proving-ground claim is
that this conversion is a declaration, nothing more.

**Complete inventory** (registry §8.14 + §8.16 + favorites-edit-mode-ideal §5 + results-strip
parity; left→right):

| Chip                         | Kind                                                                                | Shown when                                        | Consequence                                        |
| ---------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------- |
| Edit                         | chip (action-row trigger)                                                           | (owner∨collaborator) ∧ sort = My ranking (custom) | enters edit child page (§2c)                       |
| Sort                         | dropdown SelectorChip (value-displayed, never "Sort" when overridden — §2 chip law) | always                                            | world                                              |
| — My ranking / Their ranking | option; default iff a custom order exists (their-opinion-is-the-artifact, §8.14)    |                                                   |                                                    |
| — Best (Crave Score)         | option                                                                              |                                                   |                                                    |
| — Recently added             | option                                                                              |                                                   |                                                    |
| Open now                     | FilterChip                                                                          | always                                            | world (already plumbed through the list fetch arm) |
| Price                        | dropdown FilterChip + chevron                                                       | always                                            | world                                              |
| Market                       | dropdown                                                                            | All lists only (§8.16 — "sliced by city")         | world                                              |
| _(action row)_               | Cancel · Undo · Redo · Save                                                         | edit active                                       | —                                                  |

Deliberately ABSENT vs the results strip: Restaurants/Dishes segment (lists are typed per
side; per-side All makes it unnecessary — Part 8 canon), Include similar + similar-count
remote (membership is fixed; nothing to include). No visibility filter (Part 8: visibility is
a setting, not a slice). Role gating: viewers get Sort + Open now + Price (+ Market on All);
Edit and add affordances are owner/collaborator only. One component, two roles.

### 2c. Edit mode — relocated here as a CHILD PAGE

Per charter §2: home edit is deleted; ListDetail is where editing lives, Spotify-style, with
child-page semantics — nav bar OUT is already true (depth ≥ 1), the **header X becomes Cancel**
while edit is active (plus→X rotation stays; its meaning while editing = discard-confirm),
sheet locks to full height (registry §8.1), drag handle sole activator.

- Rides the engine's **action-row slot** (built leg 2, exercised leg 5 on Bookmarks) — delete
  ListDetail's hand-rolled morph.
- **Delete the content swap**: ListDetail still swaps to bare `ReorderableRows` at
  `EDIT_ROW_HEIGHT = 64` (ListDetailPanel.tsx L23/L101/L904+) — the exact defect leg 5 deleted
  on Bookmarks. Rich rows stay rich (photo strip, score, note visible while dragging);
  ellipsis→handle crossfade in place; slot-map drag with per-row measured heights
  (`computeDragFrame` columns:1 with variable slots — the leg-5 generalization's stated
  ListDetail case).
- **Inherits the §1 leg-7 fixes** (fix at engine/core so this page gets them free): Edit-chip
  animated entry + sibling push; exact-reverse exit morph; drag edge-band auto-scroll actually
  driving the list; drag clamp at header bottom; fast-grab fix; Save spinner → squircle.
- Save = the batch order PATCH (`/items/order`) on the existing pure-history session (order/
  history/historyIndex already in the panel). Undo/redo/cancel unchanged.
- ⚠️ In-flight: reorder/ + ListDetailPanel.tsx carry uncommitted leg-7/perf edits in the tree
  right now — the build leg must diff-first and preserve (charter §10).

### 2d. Result-card PRIMITIVE extraction

Today three near-copies exist: `restaurant-result-card.tsx` / `dish-result-card.tsx`
(screens/Search/components) and `ListDetailRow` (ListDetailPanel.tsx) — the list row is a
poorer sibling (no full results look). Extract ONE card primitive
(`components/cards/ResultCard`, restaurant + dish shapes) with per-surface variation as
declared slots, not forks:

- **results** variant: exactly today's look (v1 = straight copy, charter's words).
- **listDetail** variant: + note line under the meta lines (§8.1: note below the photo strip
  row), + ellipsis/handle footer slot (edit), + add-photo affordance.
- **other-people's-lists** variant: read-only — no edit footer, no add-photo; quick actions
  (order/maps/share) kept.
- **§7 gallery seam (Media agent dependency)**: the card gains a horizontal image-gallery ROW
  under the metadata lines — toggle-strip-like physics (a strip engine consumer or a sibling
  primitive sharing the scroll/overscroll core), FIRST item = the **plus sliver** (1/6–1/8 of
  an image block's width, image height, plus icon with tasteful padding) for
  owner/collaborator surfaces; absent on viewer surfaces. The same row lands in the RESULTS
  cards (restaurant + dish) — so the gallery row is a slot on the PRIMITIVE, populated by the
  Media agent's ranked-images feed (their equation), not per-surface code.
- Card↔pin coordination stays BELOW the body kinds (world-camera corollary): rows and catalog
  derive from one ordered world source so a re-sort moves both — the primitive renders, it
  never coordinates.

---

## 3. Build sequence (honest sizing; for the build leg(s) after owner review)

Dependencies named inline. S = small (≤½ day), M = medium (~1 day), L = large (2+).

1. **Search-trigger rewire (L)** — the headline. Composite world-backed push (§1d 1-3, 5-7):
   policy arm value + executor + desire write + body reads the world + dismiss/world
   residency. Deps: none new (all machinery live); coordinate with the transition-perf
   session (shared launch-intent/runtime files, §10).
2. **fitAll camera (M)** — CameraIntent value on the world + fitAll executor + reveal-joint
   camera track (world-camera L2's impure half, scoped to fitAll only; focus execution stays
   parked with L3). Dep: step 1. RED: unexecuted-intent bark.
3. **Header + meta block (M)** — name-as-header (warm-seed), avatar stack flush, username +
   typed count + dot, title row deleted. Dep: none.
4. **Ellipsis cutout fade-in (S-M)** — header leading-slot primitive synced to the rotation.
   Dep: **UI agent's §4 rotation + child-transition primitive (plans/child-transition-primitive.md
   — not yet written)**; build the slot after their clock exists.
5. **Strip conversion (S)** — ToggleStrip declaration w/ full inventory (§2b), delete
   SortChips + hand-rolled morph. Deps: leg-7 engine fixes landed (entry animation, reverse
   morph); step 1 for world-consequence wiring; Market chip needs the All/market slice
   (w1 spec §B, partially built) — ship the chip gated to All lists.
6. **Edit relocation (M-L)** — in-place rich-row edit via slot-map (variable heights), delete
   ReorderableRows swap + EDIT_ROW_HEIGHT, child-page semantics (X=Cancel, full-height lock),
   squircle save. Deps: leg-7 fixes (auto-scroll, clamp, fast-grab) at core; step 5.
7. **Card primitive extraction (M)** — ResultCard + three variants; results converted
   zero-regression first, listDetail second. Dep: none (gallery slot lands empty).
8. **Gallery row + plus sliver (S on our side)** — populate the card's gallery slot. Dep:
   **Media agent** (image ranking + photo pull); slot ships in step 7 regardless.

Order rationale: 1-2 are the miss and unblock "toggles as world-consequence" (step 5's
consequence class); 3/7 are parallelizable; 4 and 8 are externally gated. The proving-ground
test: steps 3, 5, 7 should be almost pure declaration — any hand-rolling they force is a
primitive finding to report, not to absorb.

## Ledger

- 2026-07-13 — Leg 8 design pass complete (this doc). Read-only; no code touched. In-flight
  tree edits observed and left alone: reorder/ math+hook, ListDetailPanel (+7/-?), navigation
  runtime + SegmentedToggle/ShareModalHost (leg 7 + transition-perf). Awaiting owner review
  before any build leg.
