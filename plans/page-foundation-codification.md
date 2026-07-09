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
4. **Strip consolidation** — DONE 2026-07-08 (owner: "all toggle improvements must
   land in one primitive"): `SegmentedToggle` generalized from exactly-2 to N
   segments (same pill mechanism; tap resolves the segment from measured geometry);
   bookmarks (2 segments) and profile (3 segments) ported off their hand-rolled
   Pressable rows; dead segment styles deleted. Remaining niceties for each page's
   design pass: whether bookmarks/profile also adopt `FrostedFilterStrip` (the frost
   cutout treatment — a per-page VISUAL call; the toggle mechanics are now shared
   regardless). Needs a finger-check on both pages.
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
