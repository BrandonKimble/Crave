# The toggle-strip primitive (ground-up ideal, 2026-07-12)

> **BUILD STATUS (2026-07-12, same day):** core COMPLETE + device-verified. Gesture core
> (T1/T2) shipped in SegmentedToggle; level-triggered commit (T3) shipped
> (engine floor gate + floor signal + native validator fix — see the RC-C addendum
> below: the true root cause was the native wire validator rejecting every
> 'interaction' frame); choreography verified on-sim (begin → FADE-OUT-ACK → commit;
> 30fps frames show dots+pins+labels fading jointly both directions). T4 was already
> built (FrostedFilterStrip auto-derives cutouts from children). Rollout (T5): SaveList
> side + visibility toggles converted to SegmentedToggle; remaining surfaces below are
> DESIGN-DECISION conversions (visual form changes or bespoke morph animations) left
> for a focused pass with owner eyes — see the per-surface notes.
>
> **SESSION 2 (2026-07-12, same day):** the DROPDOWN TOGGLE joined the primitive family
> and the big strips converted, all sim-verified:
>
> - `SelectorChip` (value/noun label + chevron + accent) + `OptionSelectorSheet` (the
>   resurrected Local/Global rank-sheet card UI from git 2839c07a; option tap = press-up
>   commit per registry §sortSheet) + `OptionSelectorHost`/`showOptionSelector` (root
>   imperative host — a strip anywhere opens its selector with zero mounting concerns).
> - Results strip: **Sort ⌄ (Best/Rising) LEFT of the segment pill**, Rising chip
>   deleted; selection rides `toggleRising`'s chip-rerun choreography (verified on-wire:
>   filter_rising begin → interaction fade-out floor ack → commit).
> - Polls strip: Type/Sort/Time chip groups → three dropdown toggles ('Default' = the
>   silent demand order).
> - Favorites strip: BOTH morph rows are FrostedFilterStrips (frost+cutouts+scroll ride
>   the slide), Sort = Recent/Custom dropdown, Edit chip slides in LEFT of Sort on
>   Custom, edit row = Cancel/Undo/Redo/Save in strip language. Verified: dropdown,
>   edit-chip appearance, edit-mode morph.
> - STA button: already primitive-compliant (Pressable release + floor-gated rerun).
> - BONUS root-caused during verification: the "Source delta missing feature" native
>   rejection (surfaced by the loud tripwire) — TWO transport fixes: journal-replay
>   chain proof + upsert completeness (fall back to full replace when the chain can't
>   prove itself), and BASELINE RESYNC on any native delta rejection (ack dropped →
>   next frame ships replace; one loud log, no cascade, content never stays off-map).
>   Repro (submit→close→resubmit) now zero rejections.

One primitive, everywhere: a sheet page declares its strip (segments + chips +
consequence) and gets — by construction, impossible to omit — the frost + cutout holes,
the press-up gesture semantics, the pill motion, warm-restore, and the unified fade
choreography (on surfaces with a map world: ALL substrates fade out on press-up, swap
under cover, fade in). Target: adding a strip to any page takes minutes and cannot be
built partially.

## Root causes of the current defects (attributed 2026-07-12)

- **RC-A — hold-and-release does nothing.** `SegmentedToggle.tsx` uses `Gesture.Tap()`
  with the default `maxDuration` (~500ms): a hold fails the recognizer, `onEnd` gets
  `success=false` and returns. Press-up must fire on finger-up regardless of hold time.
- **RC-B — whole-surface tap not implemented.** The tap handler early-returns when the
  tap lands on the ACTIVE segment (`next === targetProgress.value → return`), and for
  N>2 an off-segment tap returns. The owner-defined affordance: the whole control is one
  target — on a 2-segment toggle ANY press-up flips it.
- **RC-C — the toggle choreography is a different mechanism than designed.** The design
  (unified-fade, map-LOD-v6) is: press-up asserts the interaction level → native ramps
  the ONE presentation scalar to the floor (dots + pins + labels all fade, by
  construction — the same ramp verified on dismiss) → swap under cover → canonical
  fade-in. The implementation instead: the engine commits on an OPEN-LOOP 300ms debounce
  timer (`DEFAULT_TOGGLE_SETTLE_MS`), and the tab-switch commit (`presentTabSwitch` in
  use-search-root-filter-modal-runtime.ts) does `clearStagedSearchSurfaceResultsTransaction()`
  - stages a fresh enter-from-cache — a structural teardown + re-enter racing whatever
    the fade did. Nothing gates the swap on "fade-out reached the floor", so the old
    world is cleared/snapped while visible; the VA substrate happens to fade via its own
    writers while the dot layer (resident GL, faded only by the scalar) holds and then
    bare-swaps. This is the same disease the dismiss side already cured with
    `presentation_fade_out_acked`: time-triggered choreography instead of level/ack-
    triggered.
- **RC-C addendum (found during the build — the ACTUAL bottom):** the interaction level
  never reached native at all. Two stacked type-list-disease holes swallowed it:
  (1) JS frame admission's `isNativeVisiblePresentationPhase` didn't include
  `'interaction'`, so the press-up presentation-only frame was suppressed
  (`suppress_transaction_presentation_only_frame`); (2) once admitted, native's
  `parseVisualFrameTransaction` phase allowlist ALSO lacked `"interaction"` — every
  interaction frame was REJECTED at the door and silently retried by the transport
  forever. The unified-fade toggle choreography had therefore never run since the level
  moved onto the wire. Both lists fixed; the silent-rejection swallow is now a LOUD
  permanent tripwire (`[MAPFRAME] set_render_frame_rejected`).

## Requirements (implementation-independent)

- T1 — **Press-up, unbounded.** Every toggle/chip fires on finger-up (touch-up inside,
  slop-cancelable), never on a duration-limited tap. Hold as long as you like.
- T2 — **Whole-control target.** A 2-segment toggle flips on ANY press-up on the
  control. An N-segment toggle selects the pressed segment; a press on the active
  segment or padding is a no-op only when there is no unambiguous target.
- T3 — **One choreography, level-triggered.** A toggle consequence that changes a
  presented world commits ONLY when both hold: (a) the interaction quiet window has
  elapsed (rapid taps coalesce, latest wins) AND (b) the presentation fade-out has acked
  at the floor (`presentation_fade_out_acked`). The scalar owns the fade — every
  substrate participates by construction; a swap over a visible world is
  unrepresentable, not discouraged. Surfaces without a map world substitute their own
  visual-floor ack (cover/skeleton committed) or commit on the quiet window alone.
- T4 — **The strip is one package.** Frost + masked cutout holes + gesture + pill +
  warm-restore + choreography port ship as ONE composed primitive. A page cannot render
  a strip without its cutouts; holes derive from the controls' own layouts inside the
  strip (no per-page hole bookkeeping).
- T5 — **Declarative adoption.** A page declares `{segments?, chips?, onConsequence}`;
  everything else is the primitive's. Registered as a standard piece of the page
  foundation (ADDING_A_SCENE strip piece).

## Shape

1. **Gesture core (SegmentedToggle + FilterChip, one site).** Replace `Gesture.Tap()`
   with a manual press-up gesture: touch-down highlights, touch-up-inside commits,
   movement beyond slop cancels; no duration ceiling. Segment resolution per T2
   (2-segment: any press flips; N-segment: pressed segment wins, measured-geometry
   lookup as today). The a11y wrap-advance stays.
2. **Level-triggered commit (toggle-interaction-engine).** The engine gains a second
   gate: `commitWhen = quietWindowElapsed ∧ visualFloorAcked`. The search adapter feeds
   the existing native `presentation_fade_out_acked` (already emitted for EVERY ramp
   reaching the floor, not just dismissals) as the floor signal; the interaction level
   asserted at `started` is what starts that ramp — press-up → fade-out begins
   immediately, commit lands exactly at the floor. Bounded fallback (fade never acks —
   backgrounded app, dead link) commits anyway and emits a LOUD contract event, same
   pattern as the reveal fences. Non-map surfaces pass their own floor signal or none.
3. **Tab-switch commit rides the canonical world transition.** `presentTabSwitch` stops
   clearing + re-staging around the fade; with the commit now arriving under cover
   (floor acked), the staged enter's preroll starts from the floor by construction —
   the preroll-snap-from-visible path becomes unreachable. The under-cover re-decide +
   canonical fade-in are already correct (choreography-derivation work, 2026-07-12).
4. **The strip package (`ToggleStrip`).** FrostedFilterStrip becomes the composition
   root: it renders the frost, measures its children (segments + chips) and derives the
   masked holes itself — the hole map + warm-restore cache (segment layouts + holes +
   row height) become internal, exposed only as an opaque `layoutCache` blob for
   chrome-swap seeding. SearchFilters reduces to declarations; every other strip adopts
   the same package.
5. **Rollout + red team.** Convert every strip surface (inventory below) to the
   package; delete hand-rolled segment rows/chips; loop-verify per surface: hold-release
   flips, any-tap flips, choreography (where mapped) shows all-substrate fade-out on
   press-up.

## Strip inventory (sweep 2026-07-12 — adoption checklist)

Frost + masked holes exist ONLY on Search and Polls feed. The interaction engine is used
ONLY by Search and Polls feed. Warm-restore caching exists ONLY on Search. Six surfaces
hand-roll their own segmented control instead of `SegmentedToggle`.

| Surface                                                      | Today                                                                | Frost+cutouts                | Engine           | Action                                                                                                                                      |
| ------------------------------------------------------------ | -------------------------------------------------------------------- | ---------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Search results strip (SearchFilters.tsx)                     | SegmentedToggle + FilterChip in FrostedFilterStrip, warm-restore     | YES (reference)              | YES              | **DONE** (RC-A/B/C fixed 2026-07-12)                                                                                                        |
| Polls feed (PollsPanel.tsx:476)                              | SegmentedToggle + FilterChip in FrostedFilterStrip                   | YES                          | YES (feed_query) | RC-A/B fixed via shared primitive; warm-restore seeds still to add                                                                          |
| Save-list side switch (SaveListPanel.tsx)                    | SegmentedToggle                                                      | form context (no strip band) | n/a (local form) | **DONE** (converted 2026-07-12)                                                                                                             |
| Save-list visibility toggle (SaveListPanel.tsx)              | SegmentedToggle                                                      | form context                 | n/a              | **DONE** (converted 2026-07-12; inventory misattributed it to Bookmarks)                                                                    |
| Bookmarks strip (BookmarksPanel.tsx:226)                     | 2× SegmentedToggle + hand-rolled Edit strip, custom translateX morph | NO                           | NO (useState)    | FOCUSED PASS: toggles already the primitive (gesture fixes inherited); the morph + edit strip need FrostedFilterStrip adoption with eyes on |
| List detail sort (ListDetailPanel.tsx:363)                   | hand-rolled SortChip pressables (copy of Bookmarks morph)            | NO                           | NO               | FOCUSED PASS (same morph)                                                                                                                   |
| Profile section tabs (ProfileSectionsBody.tsx:526)           | hand-rolled 4-way Pressable pills                                    | NO                           | NO               | DESIGN DECISION: converting to the sliding-pill toggle changes visual form — owner call, then mechanical                                    |
| Restaurant view switcher (RestaurantProfileViews.tsx:39)     | hand-rolled 4-way switcherChips                                      | NO                           | NO               | DESIGN DECISION (same)                                                                                                                      |
| Restaurant discussions sort (RestaurantProfileViews.tsx:246) | hand-rolled text sortChips + tag chips                               | NO                           | NO               | DESIGN DECISION: inline text affordance, not a pill strip                                                                                   |
| Poll detail sort (PollDetailPanel.tsx:1107)                  | hand-rolled Top·New text toggle                                      | NO                           | NO               | DESIGN DECISION (same)                                                                                                                      |
| Notifications / Follow list                                  | no strip (confirmed absent)                                          | —                            | —                | none                                                                                                                                        |

Adoption law going forward: any 2-position pill control MUST be `SegmentedToggle`; any
strip band MUST be `FrostedFilterStrip` children (cutouts are automatic); any toggle
whose consequence swaps a presented world MUST route `scheduleToggleCommit` with
`awaitVisualFloor`. The gesture semantics (press-up unbounded, whole-control tap) come
free from the primitive — never hand-roll a Pressable pill pair again.

Delete-list (duplicate segmented implementations superseded by the primitive): the
Bookmarks/ListDetail translateX morph pair, ProfileSectionsBody sectionTab pills,
RestaurantProfileViews switcherChip + sortChip, PollDetailPanel text toggle,
SaveListPanel sideOption, BookmarksPanel visibilityToggle.

## Verification

- Gesture: hold >1s then release on each segment/chip → flips; tap anywhere on the
  2-segment control → flips; rapid-tap burst → exactly one consequence.
- Choreography (search): screen recording at 30fps — press-up starts a joint fade of
  dots+pins+labels; nothing swaps above the floor; fade-in is the canonical reveal.
  Wire assert: `[TOGGLE] begin` → `presentation_fade_out_acked` → runner commit order.
- Cutouts: every strip renders holes to the frost on every surface (visual pass).
