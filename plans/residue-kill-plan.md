# RESIDUE KILL PLAN — track-sheet cleanliness items 12–15 (2026-08-08)

Line-by-line read of the post-R8 residue. Scope = open-items-ledger §C items 12–15
plus the two sweeps (scanner coverage, redteam banner). READ-ONLY pass; nothing
here is implemented yet. Every path absolute-from-repo-root (`apps/mobile/src` = SRC).

---

## 1. THE PUBLICATION BRIDGE (item 12) — the big one

### 1.1 What the bridge IS today

Write side (the ONE writer, post-flip):

- `SRC/tracksheet/TrackSheetPage.tsx:583–605` — two `useAnimatedReaction`s mirror
  the track's facts into two app-owned SharedValues every UI frame:
  - `sheetTopY.value` → `publicationBindings.sheetTranslateY`
  - `max(0, τ − trackH)` → `publicationBindings.sheetScrollOffset`
- `SRC/tracksheet/TrackSheetRouteHost.tsx:455–467` — binds those to
  `useAppRouteSharedSheetRuntimeOwner()`'s `sheetTranslateY`/`sheetScrollOffset`
  (the SVs allocated in `use-app-route-shared-sheet-values-runtime.ts:51–56`).

Alias layers (the same two SVs re-published under other names — this is why the
rider census looks bigger than it is):

- `SRC/navigation/runtime/use-app-route-shared-sheet-runtime.ts:123–124` — the SVs
  become `presentationState.sheetY` / `.scrollOffset` of `BottomSheetRuntimeModel`.
- `SRC/navigation/runtime/app-route-sheet-host-authority-controller.ts:1032` —
  `sheetYValue: resolvedRuntimeModel.presentationState.sheetY` (so `sheetYValue`
  IS the bridge SV, one hop later).
- `SRC/navigation/runtime/route-shared-sheet-visual-state-controller.ts:7,28–29`
  and `route-sheet-presentation-state-controller.ts:18–29` — snapshot plumbing
  that carries the same SV references by identity.
- `SRC/navigation/runtime/use-app-route-shared-sheet-runtime.ts:300–301`
  (`getAppRouteSharedSheetVisualBinding`) → `SRC/overlays/searchRouteHostVisualState.ts:8–9`.

### 1.2 THE RIDER CENSUS — every consumer, what it actually needs

**A. Live per-frame Y (5 riders — the real work):**

1. `SRC/navigation/runtime/use-app-route-scene-chrome-transition-runtime.ts:52,129`
   — interpolates `sheetTranslateY` over [expandedSnap, expanded+RESPONSE_ZONE] into
   `searchChromeTransitionProgress` (search chrome scale 0.985→1) and mirrors raw Y
   into `overlayBackdropSheetTopY`; `overlayBackdropDimProgress = 1 − progress` is
   **the scrim/backdrop dim**. Needs: a live UI-thread Y, per frame.
2. `SRC/navigation/runtime/AppRouteSceneChromeMotionRuntimeProvider.tsx:266–268` —
   feeds #1 with `activeRouteSheetMotionStateEntry?.sheetYValue ?? routeOwnedBootstrapSheetTranslateY`
   (same SV via the authority-controller alias). Needs: the same live Y.
   Downstream renderers: `use-search-root-runtime-host-visual-runtime.ts:25`,
   `use-search-root-overlay-shell-host-runtime.ts:46` (backdrop), `overlays/sheetUtils.ts`,
   `AppShellMainNavigator.tsx`.
3. `SRC/screens/Search/runtime/shared/use-search-dismiss-motion-plane-runtime.ts`
   (~20 read sites: 334, 377–383, 446, 529, 682–694, 727, 764–781, 804–836, 868) —
   dismiss/open motion gates read `.value` inside derived values and callbacks
   ("has the sheet moved > 8pt", "reached target", "past visible start"). Needs:
   live Y for derived values + point-in-time reads at gesture edges.
4. `SRC/screens/Search/runtime/shared/use-search-root-runtime-visual-stage-runtime.ts:105`
   — `routeSheetMotionState?.sheetYValue ?? owner.sheetTranslateY` → feeds #3 and the
   visual stage. Live Y.
5. `SRC/screens/Search/runtime/shared/use-results-presentation-shell-runtime.ts:33,112`
   — `sheetY: resultsSheetRuntime.sheetTranslateY` into the results presentation shell. Live Y.

**B. Settle-time / snapshot reads (4 riders — cheap to migrate):**

6. `SRC/screens/Search/runtime/shared/use-search-root-profile-camera-transition-runtime.ts:27–28,56–58`
   — reads `.value` of both at the profile transition moment. Needs: a fact at a
   named instant, not a stream.
7. `SRC/screens/Search/runtime/profile/profile-presentation-model-runtime.ts:29–30,105`
   — snapshot `.value` into the profile presentation model.
8. `SRC/screens/Search/runtime/profile/profile-transition-snapshot-runtime.ts:8–13`
   — `savedResultsScrollOffset: sheetScrollOffset` (a number already snapshotted).
9. `SRC/overlays/useOriginSceneScrollPublication.ts:43,57` — origin scroll capture:
   `getScrollLanes: () => [{ laneKey: sceneKey, offset: sheetScrollOffset.value }]`,
   used by NotificationsPanel, ListsPanel, FollowListPanel,
   `panels/runtime/profile-panel-body-model-runtime.ts`. Needs: THE PRESENTED
   ENTRY'S list scroll at capture time. NOTE: the bridge value `max(0, τ−H)` is only
   honest for the presented entry — the track's per-entry scroll memory is the real
   authority here.

**C. A ROGUE SECOND WRITER (1 — a law violation, not just a rider):**

10. `SRC/screens/Search/runtime/shared/use-search-root-results-scroll-authority-runtime.ts:42`
    — `appRouteSharedSheetRuntimeOwner.sheetScrollOffset.value = 0` inside
    `scrollResultsToTop`. The host's own comment (`TrackSheetRouteHost.tsx:455`)
    says the track is the ONLY writer. This write races the track's next mirror
    frame and is at best a one-frame lie, at worst a desync. Must become a track
    command (`commandsRef` scroll-to-top) or be deleted (the `listRef.scrollToOffset`
    beside it already does the real work and the mirror will follow τ).

**D. Plumbing/alias layers (not riders — they die when the SVs move):**

- `use-app-route-shared-sheet-runtime.ts:123–129` (incl.
  `sharedSheetContainerAnimatedStyle` — a translateY transform for a sheet
  container the old system rendered; VERIFY-THEN-DELETE: no track surface should
  consume it post-R8), `app-route-sheet-host-authority-controller.ts:1032,1222–1223`,
  both `route-*-state-controller.ts` files, `AppRouteSharedSheetRuntimeProvider.tsx:55–56`,
  `searchRouteHostVisualState.ts`, `searchRouteOverlayRuntimeContract.ts:27–46`,
  `searchRouteSceneStackSheetContract.ts:46–47`,
  `search-route-sheet-resolved-visual-selection-snapshot-contract.ts:8–9`,
  `tracksheet/__render__/harness.ts:286–287` (fixture).

**Census total: 10 real riders (5 per-frame, 4 snapshot, 1 rogue writer) + ~10
plumbing/alias/contract sites. The 3 hardest:** the dismiss-motion-plane runtime
(#3, ~20 read sites woven through a gesture state machine), the chrome-motion
chain (#1+#2, two alias layers deep, feeds scrim + search chrome + shell host),
and the scroll-offset family (#8/#9, where the global mirror is structurally
dishonest vs the track's per-entry scroll memory).

### 1.3 The ideal end state

The bridge is DELETED — no per-frame `useAnimatedReaction` mirrors — and the two
facts become first-class, track-owned publications:

- **`trackSheetTopY`**: the track's own `sheetTopY` SharedValue, exported once
  through the motion authority (the same object the page animates with; zero
  copies). The shared-sheet-values-runtime stops allocating a rival SV; riders
  that need per-frame Y receive THIS SV via the existing motion-state entry
  (`sheetYValue` already flows through that pipe — the fix is that it carries the
  track's SV instead of a mirror target).
- **Scroll offset**: not a global at all. Snapshot riders (#6–#9) ask the track
  (via the motion authority / entry scroll memory) for "the presented entry's
  list scroll NOW" — a getter, not a stream. Nothing reads it per-frame today
  (verified: every scrollOffset consumer is a `.value` snapshot).
- **Derived facts stay derived**: chrome progress and backdrop dim remain
  interpolations of `trackSheetTopY` where they are; no new stores.

### 1.4 Ordered migration — riders first, bridge last, falsifier per rider

Each step is independently landable; the falsifier is what goes RED if that
rider's motion stops tracking the sheet.

1. **Kill the rogue writer (#10).** Replace the `sheetScrollOffset.value = 0`
   write with nothing (the τ mirror already follows the real scroll) or a track
   command if scroll-to-top must be sheet-aware. Falsifier: search
   "scroll results to top" flow — offset-derived origin capture still reads 0
   after the action (log the capture in the [PERF] lane).
2. **Snapshot riders (#6–#9) → point-in-time getter** on the motion authority
   (`getPresentedSheetTopY()` / `getPresentedListScroll()`), sourced from the
   track. Falsifiers: profile camera transition starts from the sheet's actual
   resting Y (probe: compare getter vs native τ at transition begin — mismatch
   > 1pt barks); origin scroll restore returns to the exact row after a
   push/pop round trip (existing origin-capture flow, assert offset equality).
3. **Per-frame riders (#1–#5) → the track's own SV.** Mechanically: the
   motion-state entry's `sheetYValue` starts carrying `sheetTopY` itself;
   `AppRouteSceneChromeMotionRuntimeProvider:266`'s fallback and
   `use-search-root-runtime-visual-stage-runtime.ts:105`'s fallback are deleted
   (a fallback to a dead mirror is a silent freeze). Falsifiers: (a) scrim dim
   tracks a slow drag frame-for-frame — instrument `overlayBackdropDimProgress`
   vs τ in the render lane, divergence > 1 frame is RED; (b) search chrome scale
   animates during expanded→middle (existing chrome probe); (c) dismiss plane's
   `motionObserved` flips during a real dismiss drag (its own debug lane already
   logs `sheetY`).
4. **Delete the alias/plumbing layers** that exist only to carry the mirror pair
   (D list): the `presentationState` override in
   `use-app-route-shared-sheet-runtime.ts`, `sharedSheetContainerAnimatedStyle`
   (verify zero renderers first), the visual-state controllers' pass-through
   fields, the contract seeds in `searchRouteOverlayRuntimeContract.ts`.
5. **Delete the bridge**: `publicationBindings` prop + both reactions in
   `TrackSheetPage.tsx:583–605`, the binding memo in
   `TrackSheetRouteHost.tsx:461–467`, the SVs in
   `use-app-route-shared-sheet-values-runtime.ts:51–56`.
6. **Scanner rung**: add `publicationBindings|sheetTranslateY|sheetScrollOffset`
   (outside the track's own files) to `scripts/check-tracksheet-invariants.mjs`
   as check 5 so the mirror cannot grow back. RED-prove by temporary
   reintroduction, per suite discipline.

---

## 2. BATCH-3 VESTIGE + DEAD TRANSPORT (item 12b)

### 2.1 Proof of darkness, field by field

`SRC/screens/Search/runtime/read-models/use-search-results-flash-list-policy-runtime.ts`
returns `{ drawDistance: 160, overrideProps: { initialDrawBatchSize: 3 } }`. Trace:

- → `read-model-selectors-runtime.tsx:261,283` as `flashListRuntimeProps`
- → `use-search-root-route-search-scene-surface-transport-runtime.ts:47–49`
- → `use-search-root-search-scene-panel-list-transport-runtime.tsx:23–47`
  spreads it into `resolvedFlashListProps` (+ `getItemType`, `overrideItemLayout`,
  `removeClippedSubviews:false`)
- → `use-search-route-search-scene-model-owner.ts:~275` puts it on
  `routeSearchSceneListBodyTransportSnapshot.flashListProps`
- → **DROPPED** at `use-search-route-search-scene-body-input-owner.ts:239–247`:
  `stableFlashListProps` republishes ONLY four wrapped handlers
  (`onScrollBeginDrag`, `onScrollEndDrag`, `onViewableItemsChanged`,
  `onUserListScrollActivity`) — and those wrappers dereference
  `flashListProps.onScrollBeginDrag` etc., fields `resolvedFlashListProps`
  **never contains**. Every wrapper is a permanent no-op.
- The track never reads any of it: the published-list mapping at
  `use-track-leg-resolver.tsx:620–631` copies only
  Header/data/renderItem/keyExtractor/Empty/Separator/extraData/onEndReached(+Threshold);
  `TrackSheetPage` owns its own `drawDistance` (`track-list-window.ts`) and takes
  `getItemType` from `presentedLeg?.list.getItemType` (`TrackSheetPage.tsx:1370`),
  which the search lane never sets.

**The ONE living output** of the panel-list transport is
`itemSeparatorComponent` (`model-owner.ts:~201` → content snapshot
`ItemSeparatorComponent` → published spec → leg → page). Also alive as dead-end
cargo: `getResultItemType`/`overrideItemLayout` from
`use-search-root-search-scene-list-item-transport-runtime` (their only sink was
`resolvedFlashListProps`).

### 2.2 Delete list (7 edits, 2 file deletions)

1. DELETE `use-search-results-flash-list-policy-runtime.ts` (whole file — only
   importer is read-model-selectors-runtime).
2. `read-model-selectors-runtime.tsx`: drop the import, the
   `flashListRuntimeProps` field (line 90) and its assignment (283) — also
   discharges the F4801 residue note at 280.
3. DELETE `use-search-root-search-scene-panel-list-transport-runtime.tsx`; keep
   the separator by moving the one `useCallback` (`<View style={styles.resultItemSeparator}/>`)
   into the model owner (or a 5-line `search-results-separator.tsx`).
4. `use-search-root-route-search-scene-surface-transport-runtime.ts`: remove the
   hook call + `flashListRuntimeProps` plumb (45–57).
5. `route-search-scene-runtime-contract.ts:148–149`: drop the
   `routeSearchScenePanelListTransportRuntime` member.
6. `use-search-route-search-scene-model-owner.ts`: replace the four
   `routeSearchScenePanelListTransportRuntime` reads; set the transport
   snapshot's `flashListProps: undefined`.
7. `use-search-route-search-scene-body-input-owner.ts`: delete
   `stableFlashListProps` + the three no-op wrappers (169–247 region) and the
   `flashListProps` field of the published transport spec (then, if the spec type's
   field has no other writer — PollDetail publishes its own? verify — narrow the
   type). Falsifier for the whole block: search results still scroll/paginate
   (onEndReached fires at bottom, existing ledger-#6b behavior) and the row
   separator still renders — plus `tsc` proves nothing else consumed the fields.

---

## 3. THE SECOND MOUNTED-BODY MAP (item 13) — VERDICT: DEAD component, live types

`SRC/overlays/BottomSheetSceneStackMountedBodyRegistry.tsx`:

- `BottomSheetSceneStackMountedBody` (the component, incl. `MOUNTED_BODY_BY_KEY`
  and its `isResidencyManagedScene`/`ShellVisibilityBoundary` wrapping) has
  **ZERO renderers** — the only reference to the component name in the repo is
  its own file. Its renderer was the R8-deleted old-host body layer.
- What still imports the FILE: 9 panel files + none else — and every one imports
  ONLY `type MountedSceneBodyProps` (verified: all 9 are `import type`).
  `scene-foundation-spec.ts:37` mentions it in a comment only.
- The LIVING map is `MOUNTED_BODY_COMPONENTS` in
  `SRC/tracksheet/use-track-leg-resolver.tsx:98–113`, guarded by
  `assertMountedBodyAgreement()` (:128, dev-only console.error, invoked at
  `TrackSheetRouteHost.tsx:80`) against the schema's `body.kind: 'mounted'`.

**Kill plan:**

1. Move `MountedSceneBodyProps` (5 lines) to its honest home —
   `use-track-leg-resolver.tsx` exports it, or better a tiny
   `tracksheet/track-mounted-body-contract.ts` (panels shouldn't import the leg
   resolver); update the 9 `import type` sites.
2. DELETE `BottomSheetSceneStackMountedBodyRegistry.tsx` outright.
3. One-map-forever: the track map stays the single component map (component
   registration genuinely cannot live in the pure schema — the dependency
   inversion note at :96–97 is correct). Upgrade the dev bark to a scanner rung:
   the schema parity spec (`scene-declaration-schema-parity.spec.ts:440`) already
   walks the keys — extend it (or check 5 of the invariants scanner) to FAIL when
   `MOUNTED_BODY_COMPONENTS` keys ≠ schema's mounted set, replacing a
   run-time-only console.error with a CI RED. Then the `Partial<>` on the track
   map (the exact F981 disease the overlays file cured and documents) gets cured
   in the surviving map: exhaustive `Record` over
   `Exclude<SearchRouteMountedSceneBodyKey, NON_MOUNTED…>` — port that shape over
   before deleting the file that carries its rationale.

---

## 4. THE RESIDENCY NAME COLLISION (item 14) — VERDICT: ALIVE, rename it

`SRC/overlays/shell-residency-registry.ts` survived R8 and is load-bearing:

- Readers: `shell-residency-manager.ts` (prewarm scheduler),
  `ShellVisibilityBoundary.tsx`, `navigation/runtime/app-route-scene-entry-mounts.ts`
  (`residentUnitIdentityOf`), `navigation/runtime/app-route-scene-stack-runtime.ts`,
  and (dead) the overlays mounted-body registry (§3).
- Its migration is essentially DONE: every sheet scene except polls/restaurant
  is in `RESIDENCY_MANAGED_SCENES` (the file's own "deleted-with-the-strangler
  when every scene is managed" clause has not triggered — polls/restaurant stay
  bespoke).

The collision: the TRACK's residency is a different fact — "this entry's real
rows are mounted in the page's FlashList" (`use-track-leg-resolver.tsx:684–688`,
`residencyLedgerRef.markResident`; plus the schema's resident/track-scene
columns). Two unrelated meanings of "resident" in one navigation stack is
exactly the class the effort has been deleting.

**Plan (rename, not delete — it is live):**

1. Rename the overlays fact to what it is: **retention/unit management** —
   `shell-residency-registry.ts` → `scene-retention-registry.ts`;
   `RESIDENCY_MANAGED_SCENES` → `RETAINED_SHELL_SCENES`;
   `isResidencyManagedScene` → `isRetainedShellScene`;
   `residentUnitIdentityOf` → `retainedUnitIdentityOf`;
   `RESIDENT_SHELL_PREWARM_SCENES` / `RESIDENT_UNIT_RETENTION_LIMIT` follow.
   Mechanical (6 importer files); `track…residency` keeps the word.
2. Schema derivation (the ideal): membership becomes a boolean column of
   `SCENE_DECLARATIONS` (`retainedShell: true`) and the registry file keeps only
   the identity resolvers + limits, deriving its array from the schema — one
   authority for "what is a scene", same F908/F939 shape the file already
   preaches internally. The parity spec extends to cover the new column.
3. Do 1 now (pure rename, zero risk); 2 rides the next deliberate touch of
   scene-foundation-spec (it is a data motion, not urgent).

---

## 5. SWEEP A — scanner OLD_HOST list vs what R8 actually deleted

`scripts/check-tracksheet-invariants.mjs` `DELETED_OLD_HOST_MODULES` (12 names)
vs the R8 checkpoint census: the scanner does NOT cover the gorhom-era family —
`useBottomSheetSharedRuntime` (+ satellites), `BottomSheetScrollContainer`,
`bottomSheetMomentumReboundMath`, `sceneFlashListPropsMerge`, `bodyLayerContract`,
`bodyLayerSkip`, `BottomSheetSceneStackListBodySurface`,
`useBottomSheetSceneStackBodyContentRuntime`.

Live-import audit of those names today: **ZERO live imports** (the only real
import hit is `SceneBodySceneKeyContext` from `overlays/SceneBodyReadyGate.tsx`,
which SURVIVED R8 — only its old provider site died; correct, not a violation).
All other mentions are comments — stale prose citing deleted modules as if
alive, e.g. `use-search-root-search-scene-panel-list-transport-runtime.tsx:40`
("supplied by the transport-owned default in sceneFlashListPropsMerge.ts" — that
file is gone; §2 deletes this file anyway),
`use-search-route-search-scene-model-owner.ts` ("enforced structurally by
BottomSheetScrollContainer"), `bottomSheetSharedRuntimeContract.ts`,
`use-search-route-search-scene-body-input-owner.ts`
(BottomSheetSceneStackListBodySurface), `overlay-chrome-metrics.ts`,
`bottomSheetSurfaceStyleUtils.ts`, `SceneBodyFoundationSurface.tsx`,
`app-route-static-scene-descriptor-controller.ts`, `ADDING_A_SCENE.md`.

**Plan:** add the 8 names to `DELETED_OLD_HOST_MODULES` (RED-prove one by
temporary reintroduction), and scrub the ~10 stale comments in the same commit
so prose stops citing ghosts. Also check `bottomSheetSharedRuntimeContract.ts`
itself for deletability once §1 step 4 removes the `BottomSheetRuntimeModel`
presentation override — it may be the last live use.

## 6. SWEEP B — redteam-abstractions.md banner coverage (item 15)

The 2026-08-08 status banner predates R8's landing. Sections still reading as
live/open that R8 made false:

1. `:50` §1 verdict — "one paint resolver … DISPLACED … re-evaluate after R8" →
   LANDED in R8 (`resolveTrackPaint`, contract "ONE PAINT RESOLVER"). Update.
2. `:106` §2 verdict — "four presented-refs → one host-owned latch is still
   OPEN (queued as an R8 opener)" → LANDED (`TrackPresentedEntryLatch`). Update.
3. Banner closing paragraph (`:33–35`) — "item 3 did **not** land as written" →
   now stale for the same reason; point it at the R8 checkpoint.
4. `:346–347` NOT ACCRETIONS — "freezeUntilSnap … dies with R8's plan-kind
   delete. Scheduled, not forgotten" → R8 explicitly RULED THE OPPOSITE
   (checkpoint: "the freezeUntilSnap plan kind is NOT deleted — it is the hidden
   family's live routing"). This is the one claim now flatly false. Correct it.
5. `:124,:127,:131–135` §2 table + fix — "publication bridge … must die with
   R8's old-system delete or it becomes permanent" and "delete the register +
   geometry mirrors as an R8 line item" → R8 landed WITHOUT these; they are the
   live residue this plan owns (bridge → §1 here; native posture-register /
   geometry-mirror deletion was never scheduled — flag it back to coordinator
   triage rather than silently absorbing it). Annotate with a pointer to this
   file so the doc stops implying R8 already covered them.

## 7. RECOMMENDED EXECUTION ORDER

1. **§6 doc banner edits + §5 scanner additions/comment scrub** — zero-risk,
   stops the record lying while the rest lands.
2. **§2 dead-transport delete** — pure darkness removal, tsc + two behavioral
   falsifiers; shrinks the search lane before the bridge work touches it.
3. **§3 mounted-body registry delete** (type move + file delete + parity-spec
   upgrade + exhaustive-Record port to the track map).
4. **§4 step 1 rename** (retention vocabulary).
5. **§1 bridge migration** in its own sequence (riders 1→2→3, plumbing 4,
   bridge 5, scanner rung 6) — the only behavioral-risk item; each step has its
   own falsifier and lands separately. §4 step 2 (schema column) tags along on
   whichever step next touches scene-foundation-spec.
