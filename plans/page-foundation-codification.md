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
   ⚠️ OWNER CALL FIRST: restaurant is a half-sheet child that today keeps the nav —
   exception or bug? Decide, then implement + sim-verify nav-out on every child scene.
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
4. **Strip consolidation** (S): port the hand-rolled segment rows
   (`BookmarksPanel.tsx` ~258-276, `ProfilePanel.tsx` ~213-238) onto
   `FrostedFilterStrip` + `SegmentedToggle`. Prerequisite for the planned
   toggle-primitive extraction.
5. **Failure-standard adoption in the poll cluster** (S/M): migrate the ~12 bespoke
   `showAppModal` failure calls (PollDetailPanel, PollCreationPanel, PollsPanel feed
   freshness) to `announceFailureIfOnline`; bespoke copy dies. Then an eslint
   `no-restricted-syntax` rule banning `Alert.alert` and direct failure-copy
   `showAppModal` outside the store — the one place lint beats types.
6. **Doc discrepancies to resolve**: page-registry §4 "food search → mid snap" vs the
   motion table docking search at `collapsed` on topLevelSwitch (which is intended?);
   modals (`OverlayModalSheet` system) sit entirely outside the sheet foundation —
   fine, but state it when the 7 new modal keys land.

Explicitly rejected (audit): a scaffold/template generator and any new descriptor
framework — the compile-time `Record` already names every file to touch.

## Open owner questions

- Restaurant child page: nav stays (exception) or nav-out (rule)?
- Search topLevelSwitch snap: `collapsed` (table today) or mid (registry §4 wording)?
