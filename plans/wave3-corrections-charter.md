# Wave 3 — owner finger-test round 2: corrections, regressions, card redesign (2026-07-13)

Owner tested waves 1+2. THE LAW applies (wave-1 charter). This charter is the record.

## §1 — CORRECTIONS of misread intent (Jarvis owns the misread)

1. **Home edit mode COMES BACK.** The owner never wanted it deleted — he wanted list
   CONTENTS not editable from home (no Edit row in the home ellipsis). Reordering the
   LISTS THEMSELVES on the home page via edit mode is wanted: Edit chip appears when
   sort = **"My ranking"** (vocabulary: My ranking replaces Custom rank EVERYWHERE,
   home + listDetail), slides in properly, action row, 2-col tile drag — the primitive
   re-declared on home (it's a declaration away by design). This also ANSWERS the §2
   custom-rank open question from wave 2.
2. **Tile 2x2 galleries were never dispatched to a mobile leg** (API shape live,
   UI missing) — Jarvis dispatch gap. Build the home-tile 2x2 gallery UI consuming
   `tileImages` (placeholders for sparse slots, TL→BR).
3. **ListDetail card galleries show no photos** — attribute (seed wiring vs list
   results not carrying photos vs UI) and fix; populate at least the seeded lists.

## §1b — Edit-mode sheet posture (owner refinement 2026-07-13, BOTH surfaces)

Entering edit mode (home lists AND ListDetail): the sheet AUTO-EXTENDS to full +
child-page nav-out — and on exit (Cancel OR Save) the sheet **STAYS extended**,
never restores the prior posture. Snap-law semantics: the edit-enter extend is a
NAMED product intent (sanctioned seat writer), so the surface's posture seat is
legitimately written to expanded — future tab-returns see expanded until the user
drags, keeping "stays extended" consistent with the two-posture law rather than
fighting it. The edit-session primitive's onEnter promote + per-entry sheet lock
already give most of this; verify the promote targets FULL extension on both
surfaces and that exit performs no restore.

## §2 — Defects from the owner's pass

1. **Edit chip snaps in on home** (again/still — attribute against the leg-7 width
   animation; possibly the home chip isn't a strip citizen anymore). Also restyle:
   the chip inside a cutout reads janky — make it a clean cutout-shaped button or a
   cutout itself.
2. **Screen switching is CHOPPIER than before** — performance audit of page/tab
   transitions (possibly the joined reveal, possibly environment; measure, attribute).
3. **X icon regression**: the new X glyph is too small/wrong. Revert to the OLD close
   icon and ROTATE THAT into the plus — one glyph, rotated, never two swapped icons.
4. **Image rows must bleed edge-to-edge** exactly like the toggle strip (no horizontal
   content padding, nothing they slide under, both sides): home tile galleries AND
   card galleries. Card gallery photos: BIGGER, slightly less wide.
5. **Search-dismiss sheet-content timing law** (owner decree): content switches back
   to the origin sheet exactly when the sheet REACHES (or just before) the bottom
   snap — never after. If dismissing while ALREADY at bottom snap: switch on press-up.
   While gliding down from higher snaps: freeze the results content during the glide,
   swap at/near arrival. Design the ideal + efficient mechanism, lock it in.
6. **ListDetail return doesn't restore the sheet snap** — exiting listDetail returns
   to Lists home but the sheet stays down; return must restore the origin posture
   (return-to-origin / suspend-resume law).
7. **The strip-gap on ListDetail push is STILL live**: pushing listDetail, the home
   strip unmounts from the persistent header leaving a see-through band while the
   incoming sheet is visible. Owner: ROOT-CAUSE the unmount/gap — the incoming scene's
   content should own that space the moment it's visible (or the chrome box shrinks
   in the same frame). No skeleton band-aid.
8. **Edit mode on ListDetail wrecks layout**: entering edit squeezes content inward
   (horizontal padding grows) and NEVER restores on exit; a see-through hairline runs
   under the action-row buttons; the Edit chip doesn't slide in from the left. Also
   the owner's original edit-mode VISUAL spec (wave-2 §1/§2, action-row styling:
   Cancel black text, Save primary-red text, rounded undo/redo cutout pill,
   "Edit lists"→undo/redo cutout fade) — audit what leg 5/9/10 actually shipped vs
   that spec and close the gaps.

## §3 — Card redesign (Google reference screenshot, owner 2026-07-13)

1. **Pill action row under each card** (scrollable strip physics like everything
   else): rounded pills, PRIMARY color at low opacity for bodies, darker primary for
   text/icons (Google's teal row, recolored). Buttons: **Save (heart icon — "Save"
   vocabulary, favorites term is dead) · Share · Call · Dishes (restaurant cards
   ONLY)**. The heart/share buttons currently on the card body MOVE here.
2. **Rank bubble moves inline**: left edge flush with the text column's left edge,
   title to its right, metadata aligned under — no more indented-bubble left margin.
   Frees center-right for the edit grab handle.
3. Gallery row: photos bigger/less wide, edge-to-edge bleed (§2.4).

## §4 — Create / Add / Edit list (registry synthesis — owner to confirm)

Registry already designed this: `saveList` (BUILT) = the ADD-to-list sheet (two-sided
rows, inline note+tags toolkit §7.5, create-list as inline expansion); `listEdit`
(NEW, unbuilt) = ONE create/edit panel (name/description/visibility) reused by the
save sheet's "New list" tile AND the per-list ellipsis; `listConfig` = the ellipsis
surface itself. Jarvis recommendation: NOT three pages — the add flow stays the
saveList sheet; **one `listEdit` panel parameterized create-vs-edit** (plus button →
listEdit(create); ellipsis "Rename" row RENAMED "Edit" → listEdit(edit, prefilled));
home popup create-form dies. Owner confirms before build.

## §5 — Trigger-regression audit (BEFORE the world-push leg — owner stop-order)

Wave-2 found list-open's search trigger was unplugged+erased. Audit EVERY designed
source-agnostic search trigger for the same fate: comment/entity spans (profile page,
pollDetail), profile page list taps, Lists home → every list incl. per-side All,
shortcut buttons, search bar from any page, deep links. For each: designed-where
(plans/registry), wired-today?, unplugged-when (commit), distance-back. Then the
world-push leg wires list-open (design ready, gated on perf/map session committing)
and the audit's findings extend that leg to restore EVERY trigger — end state better
than it ever was.

## §5b — Owner mandates (2026-07-13, second pass)

- **Nothing left on the table**: after the fix legs land, a dedicated CONFORMANCE
  AUDIT leg red-teams the delivered state against EVERYTHING the owner has said
  across waves 1-3 (both charters capture the full transcript) — every item
  either verified-done, in-flight, or explicitly owner-parked; ambiguities
  resolved by best judgment toward the uncompromising ideal, never dropped.
- **Sim location = Austin** (30.2672,-97.7431) on our rig (iPhone 17 Pro); set
  2026-07-13; re-set after sim resets. The Pro Max is the perf session's rig —
  never touch it.

## §6 — Standing

- Leg 12 (CollaboratorModal root-host) died with the host process — RESPAWNED; must
  inventory partial work first.
- Image equation: explained to owner, ratification pending.
- Images: populate galleries for the seeded lists as part of §1.3.
