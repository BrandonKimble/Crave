# Page-foundation codification — execution plan

Owner directive (2026-07-08): every page — current and future — gets the eight
foundation pieces by construction; codify so a new page can't skip them. Full audit
matrix in the 2026-07-08 session; the standard itself lives in
`apps/mobile/src/navigation/runtime/ADDING_A_SCENE.md` §5 (the single home — this file
is only the work queue). Pre-launch QA gate: `product/README.md`.

**Audit verdict:** the registry seam already exists (`APP_OVERLAY_ROUTE_METADATA_BY_KEY`

- `Record<OverlayKey>` completeness assertions). Header/frost/scroll are fully
  consolidated (zero hand-rolls). The gaps: five honor-system pieces, one canon-rule
  violation, two strip hand-rolls, one under-adopted standard.

## Work items (priority order)

1. **Nav-out derived from `laneKind === 'child'`** (S) — the canon rule
   (page-registry §3) is NOT implemented: nav-out is per-scene `useNavHideIntent`
   opt-in, wired on only pollDetail + pollCreation; restaurant, saveList, and all 7
   stub children never hide the nav. Fix: ONE derivation in
   `use-search-foreground-bottom-nav-visual-runtime.ts` (`laneKind==='child' ⇒ hide`),
   delete the per-scene intents (and the store if nothing else needs it).
   OWNER ANSWERED (2026-07-08): restaurant IS a child and participates in nav-out —
   no exception. (It LOOKS correct today only incidentally: restaurant opens inside a
   search session, where the search motion signals already hide the nav. The laneKind
   derivation makes it structural instead of incidental.) Implement + sim-verify
   nav-out on every child scene. Sequencing note (owner): the nav-transition work
   rides the page-registry implementation effort when we start pulling from that file.
2. **Harden the soft registries to RED-provable** (S/M):
   - `SCENE_STACK_BODY_SKELETON_SPECS`: `Partial<Record>` → full
     `Record<sheet-scene keys>` so a missing skeleton row is a build error naming the
     key.
   - Persistent-header registry (runtime Map is architecturally needed): `__DEV__`
     boot assertion — every non-modal sheet scene must have a descriptor by first
     present (today it silently renders null).
3. **`SceneFoundationSpec` in the metadata table** (M): fold the remaining per-scene
   foundation decisions (`skeletonRowType`, `frostBacking`, `stripKind`,
   `failurePolicy`) into `APP_OVERLAY_ROUTE_METADATA_BY_KEY` (or a sibling
   `Record<OverlayKey>` table in the same file) so adding an `OverlayKey` fails
   compilation until every foundation decision is stated. Snap descriptor table stays
   as-is (it's the exemplar); curated degrade-gracefully policies stay curated.
4. **Strip consolidation** — panel half DONE 2026-07-08 (owner: "all toggle
   improvements must land in one primitive"): `SegmentedToggle` generalized from
   exactly-2 to N segments; bookmarks (2-seg) and profile (3-seg) ported off their
   hand-rolled Pressable rows. Whether bookmarks/profile also adopt
   `FrostedFilterStrip` = per-page visual call for their design passes. Needs a
   finger-check on both pages. **The SEARCH half is item 4b below.**

4b. **THE TOGGLE CONTRACT — full audit executed 2026-07-08 (owner decree: every
toggle, current and future, rides ONE implementation and gets ALL the benefits;
"Search this area" IS a toggle).** Audit verdict: the decree is half-true — the
visual primitives (SegmentedToggle + FilterChip + FrostedFilterStrip) are genuinely
portable (PollsPanel = the zero-plumbing proof), but the SEARCH strip — the
feel-checked reference — still hand-rolls BOTH the pill (SearchFilters.tsx ~425-494,
byte-identical constants to SegmentedToggle, which was extracted FROM it and never
ported back) and its five chips (inline Pressables, not FilterChip); the
coordination layer exists but has ONE consumer; search-this-area bypasses it.
**The five benefits every toggle must get (the contract):** (1) pill/chip visual
mechanics, (2) optimistic press-up flip, (3) restarting quiet-window debounce
(300ms, seq-guarded), (4) cancelable consequence, (5) visual-sync finalize
(awaitVisualSync + lifecycle events driving the interaction cover). Availability
conditions (search-this-area's 8-flag predicate) are a PREDICATE over the same
contract, never a different flow.
Work queue (risk-ordered; a+b+c = one focused pass with a finger-check on the
canonical strip; dead `*Disabled`/`rankButton*` styles already deleted):

- (a) LOW: port SearchFilters' five inline chips onto `FilterChip` (needs children
  support for the price chevron + "N similar" custom content — extend FilterChip,
  don't fork).
- (b) MEDIUM: ONE pill — add an optional layout-cache in/out to `SegmentedToggle`
  (mirroring FrostedFilterStrip's initialHoleLayout/onMeasuredLayoutChange) and
  replace the SearchFilters inline pill with it; the runtime-bus live read stays in
  SearchFilters feeding value/onChange. Mechanics already identical → auditable
  diff; feel-check gates it.
- (c) MEDIUM: search-this-area onto the coordinator — today its press goes
  use-search-foreground-search-area-submit-runtime.ts → rerunActiveSearch → tuple
  cause 'initial_submit' → reconciler 'area_rerun' → DIRECT env.resolve (bypasses
  scheduleToggleCommit; no debounce/cancel/visual-sync; resetMapMoveFlag is a
  hand-wired promise chain). Fix: ride `scheduleToggleCommit` (kind
  'search_this_area'), move resetMapMoveFlag into the `finalized` lifecycle, keep
  the visibility predicate as the declared availability conditions.
- (d) THE EXTENSIBILITY KEYSTONE: extract the generic core of
  `use-results-presentation-toggle-coordinator.ts` (self-labeled "TR5
  portable-toggle-primitive seed") — seq + restarting debounce + cancelable runner
  - visual-sync wait + lifecycle events — parameterizing its two bus writes
    (publish(toggleInteraction) + startPatch), so ANY page (deep-linked shared
    search/list included) composes strip + toggle + `declareToggle(kind, runner,
optimisticPatch)` and gets all five benefits by construction. Today a new page
    gets the LOOK for free but must replicate the bus+reconciler+coordinator stack
    for the BEHAVIOR — that's the gap.
- Non-goals: the map dots/labels LOD crossfade is engine-internal, zoom-driven, not
  a UI toggle (and the shipped map is not to be touched); disabled-while-resolving
  exists NOWHERE today (optimistic flip + coalescing is the model) — adding it
  would be a new product decision, not a consolidation.

5. **Failure-standard adoption in the poll cluster** (S/M): migrate the ~12 bespoke
   `showAppModal` failure calls (PollDetailPanel, PollCreationPanel, PollsPanel feed
   freshness) to `announceFailureIfOnline`; bespoke copy dies. Then an eslint
   `no-restricted-syntax` rule banning `Alert.alert` and direct failure-copy
   `showAppModal` outside the store — the one place lint beats types.
6. **Doc discrepancies — RESOLVED (owner, 2026-07-08)**: no bug. The motion table's
   `topLevelSwitch → search: collapsed` row governs the NAV-TAB switch to the search
   top-level scene (map-first, docked). The dish-shortcut / search SUBMIT raising the
   sheet to the MIDDLE snap is the search reveal's own presentation choreography — a
   different transition that never consults that row, and it behaves correctly today.
   Clarify the wording in page-registry §4 when we implement from that file. Still to
   state in the docs when the 7 new modal keys land: modals (`OverlayModalSheet`
   system) sit outside the sheet foundation by design.

Explicitly rejected (audit): a scaffold/template generator and any new descriptor
framework — the compile-time `Record` already names every file to touch.

## Open owner questions

(None — restaurant nav-out and the search snap wording were answered 2026-07-08.)
