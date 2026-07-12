# Favorites edit mode + strip — the ideal shape (design pass, 2026-07-12)

Companion to [toggle-strip-primitive.md](toggle-strip-primitive.md). That plan defers
Bookmarks + ListDetail to a "focused pass with owner eyes"; **this doc IS that pass's
spec.** No code changes yet — this is the decided target shape.

## Ground truth (attributed, 2026-07-12)

Correcting the shared mental model first:

- There is **no separate edit page/scene.** Edit is already inline local state in both
  panels. It _feels_ like a separate page because entering edit **swaps the real
  content** (Bookmarks 2-col tile grid / ListDetail rich rows with photo strips) for a
  bare `ReorderableRows` row stack (`BookmarksEditList`, ListDetailPanel L1222). That
  content swap is the defect — not navigation.
- The strip morph (normal row slides out right / edit row [Cancel | Undo·Redo | Save]
  slides in from left, 240ms, two layers in one clipped viewport) **already exists and
  is the right mechanism** — it's just hand-rolled twice (BookmarksPanel L247,
  ListDetailPanel L418), outside FrostedFilterStrip, with no frost/cutouts, and
  ListDetail uses hand-rolled `SortChip`s instead of the primitives.
- The Edit chip does NOT ellipsize siblings via text truncation — it compresses them
  via `flex:1` + `LinearTransition`, so the toggles shrink to fit. Same symptom class:
  the strip is a fixed-width flex row, not a scrollable strip.

## The five decisions

### 1. The strip becomes a `ToggleStrip` with a first-class **action-row slot**

This answers the "edit actions are part of the strip but aren't a toggle" tension
directly: the primitive owns TWO rows inside one frost viewport.

- **Toggle row** — the real scrollable strip content: rubber-bands, scrolls, warm-
  restores, holes derive from its children. Holds Edit chip + all toggles.
- **Action row** — declarative alternate chrome (`actionRow: {cancel, undo, redo,
save}` or arbitrary children). **Not part of the scroll content and mounted only
  while `actionProgress > 0`** — unreachable by scrolling _by construction_, not by
  clamping. It does not scroll or rubber-band; it's static chrome.

Morph (owned by the primitive, one implementation, both consumers deleted):

- `actionProgress` shared value, driven by the panel's edit state.
- Toggle row rendered X = `-scrollX + actionProgress × exitDistance` where
  `exitDistance = viewportWidth + (contentWidth − scrollX)` — i.e. it slides out to
  the right **from wherever it currently is**, continuous with live scroll physics.
  "The toggle scrolls all the way off to the right" is literally the strip's own
  translation, so mid-scroll or mid-rubber-band entry composes instead of snapping.
- Action row X = `(actionProgress − 1) × viewportWidth` (slides in from the left,
  same timing — the existing 240ms feel is kept as the baseline, tune with eyes on).
- Scroll gesture is disabled while `actionProgress > 0`; re-enabled at exactly 0.
- **Cutout holes are per-row**: the frost holes crossfade/translate with the morph
  (holes derive from whichever row's children are being shown, moving with their
  translation). A strip can never show chrome without its holes (T4 of the primitive).

### 2. The Edit chip is a strip citizen — push, never squeeze

Leftmost child of the toggle row, shown only when sort = Custom (Bookmarks) /
`canEdit && sort = custom` (ListDetail). When it enters, it takes its **intrinsic
width** and the toggles are **pushed right**: content width grows, and if that
overflows the viewport the strip scrolls — that's what a strip is for. Delete the
`flex:1` segment wrappers and the compression `LinearTransition`. Every control keeps
intrinsic width forever; no label ever shrinks or truncates to make room.

Entry animation: the chip animates width 0→intrinsic (or translates in from the left
edge under the frost) while siblings ride the layout — same slide-in feel as today,
minus the squeeze.

### 3. Edit mode = the SAME content, made editable

Delete the content swap. Entering edit changes only three things on the page:

1. The strip morphs to the action row (decision 1).
2. Every **ellipsis button crossfades to a grab handle** (`more-horizontal` →
   drag handle, same position, same touch target). Rows/tiles without an ellipsis
   (ListDetail rows today) grow the handle in the same header position.
3. The real tiles/rows become draggable **in their real layout** — tile stays a tile,
   rich row stays a rich row (photo strip, score dot, note all visible while
   dragging). Non-reorderable items (system lists, the All tile) stay rendered but
   handle-less and pinned, exactly like `pinnedLeadingCount` today.

Mechanics: keep `useReorderDrag` / `reorder-drag-math` as the shared drag core —
that math is the good part of the old edit list. Generalize it from a 1-D fixed-height
row stack to a **slot map** (each item = a measured slot rect):

- ListDetail: 1-D slots with per-row measured heights (rich rows aren't uniform 64px).
- Bookmarks: 2-column grid slots — slot index = `row × 2 + col`, hit-testing against
  slot centers, same shuffle animation (180ms) between slots.

Then delete: `BookmarksEditList`, the ListDetail edit-rows swap, `EDIT_ROW_HEIGHT`,
and the row-format edit rendering entirely. `ReorderableRows` survives only if some
future consumer genuinely wants a bare row stack; otherwise it collapses into the
slot-map core.

### 4. Consumers become declarations

- **BookmarksPanel**: `ToggleStrip({ chips: [Edit?], segments: [Recent/Custom,
Restaurants/Dishes], actionRow: editActions })`. Both SegmentedToggles already the
  primitive; the hand-rolled morph wrapper is deleted.
- **ListDetailPanel**: hand-rolled `SortChip`s → the shared chip primitive inside the
  same `ToggleStrip`: `[Edit? | My ranking/Their ranking | Best | Recently added |
Market·soon?]`. Its duplicate morph is deleted.
- Both inherit for free: frost + cutouts, press-up unbounded gesture, whole-control
  tap, warm-restore. Neither consequence swaps a presented map world, so no
  `awaitVisualFloor` — commit on the quiet window alone (T3's non-map branch).

### 5. Toggle inventory (owner review)

Current, believed complete:

| Surface    | Toggle row (left→right)                                                                          | Action row                  |
| ---------- | ------------------------------------------------------------------------------------------------ | --------------------------- |
| Bookmarks  | Edit (custom only) · Recent/Custom · Restaurants/Dishes                                          | Cancel · Undo · Redo · Save |
| ListDetail | Edit (owner+custom) · My ranking/Their ranking · Best · Recently added · Market·soon (All lists) | same                        |

Open inventory questions for the owner (not designed here): a visibility filter on
Bookmarks (public/private lists)? A dish/restaurant scope chip on the virtual All
lists? Nothing else surfaced from the sweep.

## Sequencing

Depends on the `ToggleStrip` package (step 4 of toggle-strip-primitive.md, in flight
in the other session). The action-row slot is **new scope for that package** — it
should be built INTO `ToggleStrip`, not bolted on here, so the two sessions must
agree: FrostedFilterStrip's composition root gains `{actionRow, actionProgress}` and
the per-row hole derivation. If the other session lands first without it, this pass
adds the slot to the primitive before converting the two panels.

Order: (1) action-row slot in the primitive → (2) convert Bookmarks strip →
(3) convert ListDetail strip → (4) slot-map drag generalization + in-place edit on
ListDetail (rows, simpler) → (5) Bookmarks grid drag → (6) delete BookmarksEditList /
edit-row rendering / both hand-rolled morphs → (7) device pass with owner eyes
(morph feel, handle crossfade, grid shuffle).

## Verification (each must be able to show RED)

- Scroll the toggle row mid-way, press Edit → the row exits from its scrolled
  position (no snap-to-zero first); Cancel returns it to the same scroll offset.
- With edit NOT active, hard-swipe the strip to its right edge → the action row is
  never revealed (it isn't mounted — assert absence, not clipping).
- Edit chip entry: sibling toggle labels' measured widths are byte-identical before
  and after the chip appears (push, not squeeze).
- Edit mode content: the dragged row/tile renders its full read-mode visuals
  (photo strip present on a ListDetail row screenshot during drag).
- Bookmarks grid: drag tile from slot 5 to slot 0 across columns → order persists
  after Save; system lists + All tile never move.
