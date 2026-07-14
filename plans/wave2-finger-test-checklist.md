# Finger-test checklist — wave 2 (2026-07-13)

Everything BUILT + sim-verified + red-teamed, UNCOMMITTED (on top of wave 1, also
uncommitted). Screenshots from the verification runs are in the session scratchpad
(leg11/). After your pass: the commit (Jarvis coordinates timing vs the perf/map
session), then the step-1 world-push leg once that session's tree quiets.

## Lists home (was Favorites)

- [ ] Nav + headers say **Lists**; Been/Want-to-go behave as regular lists (rename,
      delete, move) on BOTH sides; All tile thin (no icon/subtext, chevron).
- [ ] No edit mode here anymore. Ellipsis menu = lucide rows, left-aligned: Share ·
      Delete · Add/Remove from profile · Use your photos · Pin on profile.
- [ ] Sort chip shows its VALUE ("Recent" / "Custom rank").
- [ ] Plus button (red) opens the create-list form. ⚠ Decide: the "New list" row
      below the grid is now redundant — keep or delete?

## Plus/X rotation + child transitions

- [ ] Every parent page: red plus. Push any child → plus twists clockwise into a
      black X DURING the transition; dismiss → counterclockwise back to red plus;
      child→child stays X.
- [ ] Child pushes (messages, settings, poll detail, list detail): title + rotation + nav-out react in ONE beat on press-up → declared skeleton (no spinners, no
      bare frost, anywhere) → one synchronized reveal. Dismiss symmetric.
- [ ] Tab switches: content + header + strip change in the same beat.
- [ ] Home at bottom → tap the home nav again → sheet extends fully; third tap does
      nothing.
- [ ] Profile plus currently dev-barks (catch-all create = deferred with profile page).

## Polls strip

- [ ] Chips show values: "All", "New". Sort sheet = New / Trending / Top; picking
      Top slides the period chip in (Today / This week / This month / All time).
- [ ] Segment reads **Live · N** (real count) / **Closed** — veto the word "Closed"
      if it reads wrong to you.
- [ ] Live↔Closed press-up: old cards exit immediately, new snap in, no skeleton.
- [ ] Plus creates a poll with the market gate ("Add a poll in Austin").

## ListDetail (the proving ground)

- [ ] Open a list: the list NAME is the header (no separate title row), avatar stack
      flush under the header, "username · N dishes/N restaurants".
- [ ] Header ellipsis fades in as a cutout synced with the rotation; menu: Share ·
      Rename (works, persists to home tile) · Delete · profile visibility · photos
      source · pin.
- [ ] Strip: full-bleed under the meta block, scrolls with the list; Sort (My
      ranking/Best/Recently added) · Open now · Price · Market (All lists only) all
      slice content. ⚠ Feel-checks: Price is single-level ($–$$$$ pick-one);
      Market sheet lists EVERY active market (long — cull vocabulary?).
- [ ] Cards = the results look + note + add-photo; heart saves; ⓘ opens the score
      sheet centered; card tap → restaurant and X returns exactly.
- [ ] **Edit mode**: Edit chip (custom sort) → child semantics (nav out, X=Cancel),
      rich rows stay rich while dragging (variable heights), auto-scroll at edges,
      clamp at header, undo/redo, Save persists across relaunch, Cancel restores;
      undo-back-to-baseline + X exits with NO confirm; real change → discard-confirm.
- [ ] Galleries: photos render on the 16 seeded restaurants; ⚠ feel-check the plus
      tile (24×72pt — the decreed 1/6 sliver physically can't hold the plus).
- [ ] Results lists unchanged except the new gallery row (byte-copy proven by pixel
      diff — but your eyes rule).

## Known NOT built (by design)

- List OPEN does not yet run the map search flow (world push + fitAll camera) — the
  machinery is built and waiting; the wiring leg is gated on the perf/map session
  committing its files. The sheet does drop to middle on open (descriptor landed).
- Profile page development, list searchability, polls quick-fade: parked per charter.

## Owner gates outstanding

1. This checklist.
2. Image-equation ratification (Media ledger §1 — decayed-rate score).
3. Feel-checks flagged above (sliver, Market vocabulary, Price, Closed, New-list row).
4. Custom-rank reorder question (charter §2) — still unanswered.
5. The commit — wave 1 + wave 2 together, timed around the perf/map session.
