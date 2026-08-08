# OA10 — List view-mode (rows | tiles) as a user preference: the rederivation

Owner ruling (plans/transition-endstate-contract.md, OA10, 2026-08-08): the honest
vocabulary is ROWS and TILES ('history' was wrong); the Lists page gains a
Spotify-style tile-view <-> row-view switch; the SaveList sheet renders whatever
mode the user chose on the Lists page (no switcher on the save sheet, probably
ever); both surfaces' SKELETONS follow the chosen mode. Interim ruling for the
SaveList skeleton: rows (matches today's content) — implemented, see §4.

## 1. What a user experiences (the target)

Alice opens Lists and taps the view toggle on the strip: her list grid becomes a
compact row list, Spotify-style. Later she saves a dish from a result card — the
save sheet shows her lists as ROWS, because that is how she chose to see her
lists everywhere. If she flips back to tiles, the save sheet shows tiles too.
While either surface loads, the skeleton is already the right shape — rows
shimmer as rows, tiles as tiles — so the swap never jumps. One choice, made in
one place, honored everywhere her lists appear.

## 2. The from-scratch ideal — four primitives

### 2.1 ONE persisted preference: the list view-mode store

The scene schema (scene-foundation-spec.ts) is per-SCENE static declaration;
this is per-USER dynamic preference — it does not belong in the schema as a
value, only as a REFERENCE (see 2.2). The repo's persisted-preference precedent
is `apps/mobile/src/store/searchStore.ts` / `onboardingStore.ts`: zustand
`persist` + `createJSONStorage(() => AsyncStorage)`, a version number, and an
explicit `partialize` so exactly the durable fields survive. Follow it:

- `apps/mobile/src/store/listViewModeStore.ts`
  - `listViewMode: 'tiles' | 'rows'` (default `'tiles'` — today's Lists page,
    and the Spotify default for a visual library).
  - `setListViewMode(mode)`; persisted, versioned, partialized to the one field.
  - Per-device today (AsyncStorage, like every persisted preference here);
    server-side sync is a later, orthogonal decision.
- NOT `lists-home-controls-store.ts`: that store is deliberately EPHEMERAL
  chrome state (listType/sortMode/editSeat reset on cold start). Mixing a
  durable preference into it would either persist the ephemerals or force a
  partialize split inside a store whose whole contract is "session chrome."
  The strip WRITES the preference store; the surfaces READ it. Same one-way
  law the controls store already documents.

### 2.2 The spec seam: rowType becomes a declaration that can REFERENCE the preference

The R8 scanner (scripts/check-tracksheet-invariants.mjs, invariant 3) bans
`rowType` literals outside the spec + resolver — the extension must go THROUGH
that path. Two candidate shapes were argued:

- REJECTED — a new union member `'follows-list-view-mode'` inside
  `SceneLoadingRowType`. Dishonest: it is not a material, it is an indirection,
  and it would leak into `ROW_BUILDERS`, `presetRowStride`, and every consumer
  that believes a rowType is drawable.
- CHOSEN — the foundation column's TYPE widens, keeping materials and
  references distinct:

  `skeleton: { rowType: SceneLoadingRowType } | { rowType: { fromPreference: 'listViewMode' } }`

  and the ONE resolver takes the preference as an input:

  `resolveSceneLoadingMaterial(sceneKey, prefs: { listViewMode: 'tiles' | 'rows' })`

  mapping `fromPreference` -> `'tile' | 'rows'` in the resolver (the only place
  those literals may live — the scanner's allowlist already covers it). Scenes
  with static material are untouched; `lists` and `saveList` declare the
  reference. tsc makes a half-migrated consumer a build error (the resolver's
  new parameter), which is exactly the exhaustiveness discipline the schema's
  header promises.

  Consequence at call sites: the module-scope pattern
  `const X_MATERIAL = resolveSceneLoadingMaterial('profile')!` stays legal for
  static scenes; the two preference scenes read the material at render via a
  `useSceneLoadingMaterial(sceneKey)` hook (subscribes to the store, calls the
  resolver). The track cold-leg resolver (src/tracksheet/track-entry-skeleton.ts)
  passes the store's current value the same way.

### 2.3 The shared cell pair: ListCellRow / ListCellTile

Both surfaces consume ONE pair of cells so "rows" and "tiles" mean the same
thing everywhere:

- `ListCellTile` — extracted from ListsPanel's `ListsListTile` (2x2 gallery +
  footer, uniform height for the reorder grid's slot math).
- `ListCellRow` — extracted from SaveListPanel's `SaveListRow` geometry
  (thumbnail + name + meta), minus the save-sheet-only affordances.
- Per-surface affordances stay per-surface via slots/props: the Lists page adds
  the edit handle / ellipsis; the save sheet adds selection + the note field.
  The CELL is shared; the CONDUCT is not.

### 2.4 The switch lives on the Lists strip; SaveList has none

`ListsHomeStrip` (persistent-header extension mount) gains the rows/tiles
toggle writing `setListViewMode`. SaveListPanel renders from the store with no
control of its own — OA10's "no switcher on the save sheet" is structural, not
just omitted UI: the panel never imports the setter.

## 3. What changes from today — ranked, sized migration list

| # | Change | Size | Notes |
|---|--------|------|-------|
| M1 | `listViewModeStore.ts` (persisted, searchStore precedent) + `useListViewMode` | S (~60 lines + spec) | No UI yet; pure primitive. |
| M2 | Spec seam: widen the `skeleton` column type for `lists`/`saveList` to `{ fromPreference: 'listViewMode' }`; `resolveSceneLoadingMaterial(sceneKey, prefs)`; `useSceneLoadingMaterial` hook; thread prefs through track-entry-skeleton | M | tsc forces every resolver caller to state its prefs; scanner untouched (literals stay in spec+resolver). Parity spec fixture updates alongside. |
| M3 | Extract the shared cell pair from `ListsListTile` + `SaveListRow` | M | Pure refactor; pixel-identical before M4/M5 land. |
| M4 | Lists page row view: strip toggle + grid<->rows layout switch in ListsPanel | M–L | The edit-mode grid already LINEARIZES to 1 column (product/favorites.md "Custom ranking"), so the 1-col row layout machinery half-exists; reorder must work in both views. |
| M5 | SaveList renders tiles when preference = tiles | S | Consume `ListCellTile`; skeleton follows automatically via M2. |
| M6 | DONE (Part 2, this change): 'rows' preset name; saveList spec row = 'rows'; SaveListPanel derives material from the spec; scanner allowlist entry removed | S | See §4. |
| M7 | Co-design a true rows-cell hole geometry (today 'rows' aliases the history icon+line holes; the real SaveListRow is a taller bordered card) | S | Geometry tune in cutout-skeleton-presets.ts only. |

Order: M1 -> M2 -> M3 -> M4 -> M5 (M7 anytime after M6). M4 is the only
user-visible feature step; everything before it is seam work that ships dark.

## 4. The vocabulary fix and the 'history' preset

A TRUE history surface exists: `src/screens/Search/RecentHistoryView.tsx:428`
renders `rowType="history"` for recent searches — the honest use, so the
preset STAYS. Per the ruling's contingency, `'rows'` was ADDED as the honest
name for generic row material, aliasing the history hole geometry today
(`ROW_BUILDERS.rows` reuses `buildHistoryHoles` + stride); M7 gives it its own
geometry later. Non-history row surfaces must declare `'rows'`, never
`'history'`.

## 5. Part 2 — the interim fix (implemented in this change)

The standing contradiction: SaveListPanel hardcoded `rowType="history"` (with a
TODO(owner) + a scanner allowlist exemption) while the foundation spec declared
`'tile'`. OA10's interim ruling = ROWS. Changes:

- `cutout-skeleton-presets.ts`: `'rows'` added to `CutoutSkeletonRowType` +
  `ROW_BUILDERS` (aliases history geometry, comment states why 'history' stays).
- `scene-foundation-spec.ts`: `saveList.foundation.skeleton.rowType: 'tile' -> 'rows'`
  with the OA10 comment (interim now, preference-resolved at end state).
- `SaveListPanel.tsx`: the literal + TODO deleted; material now derives from
  `resolveSceneLoadingMaterial('saveList')` — spec and code agree by
  construction.
- `scripts/check-tracksheet-invariants.mjs`: the SaveListPanel allowlist entry
  REMOVED — the panel is back under the R8 ban.
- `scene-declaration-schema-parity.spec.ts`: legacy fixture updated to 'rows'
  (it went RED on the spec change first — the pin works).
- `CutoutSkeletonDevPreview.tsx`: 'rows' registered (tsc exhaustiveness forced it).

Proofs:
- `yarn tsc --noEmit` — clean.
- `yarn test:raw src/navigation/runtime src/overlays src/tracksheet` — 72
  suites / 859 tests green (parity spec witnessed RED before the fixture
  update: the spec value is pinned, not decorative).
- `node scripts/check-tracksheet-invariants.mjs` — green; MUTATION-PROVEN: re-
  hardcoding `rowType="history"` in SaveListPanel makes the scanner exit 1
  ("hardcoded skeleton rowType"), restored and green again.
