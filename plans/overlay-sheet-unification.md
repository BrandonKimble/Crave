# Single Overlay Sheet Unification Plan

## Goals

- One base sheet for all overlays (search, polls, bookmarks, profile, restaurant, save list).
- Sheet stays open across tab switches; switching tabs swaps content in-place.
- Each tab preserves scroll position when switching away and back.
- Preserve existing perf wins (no extra React churn during drag/settle).
- Keep nav bar blur cutout behavior consistent across all overlays.
- Preserve UI/behavior during transition: no visual, interaction, or transition changes to search bar, suggestions/autocomplete, nav switching, or overlay gestures.

## Current Implementation Snapshot (Facts)

### Sheets / Overlays

- `apps/mobile/src/screens/Search/index.tsx`
  - Owns search results sheet via `useSearchSheet` + `SearchResultsSheet`.
  - `SearchResultsSheet` wraps `BottomSheetWithFlashList` and passes shared values (`sheetTranslateY`, `resultsScrollOffset`, `resultsMomentum`).
  - Tracks drag/settle/scroll in `searchInteractionRef` (refs to avoid re-render).
  - Uses `useSearchChromeTransition` to drive top chrome from the active sheet’s `sheetY`.
- `apps/mobile/src/overlays/BottomSheetWithFlashList.tsx`
  - Common sheet driver; owns `sheetY`, list scroll, and drag logic.
  - Uses `runOnJS` to notify drag/settle and snap changes.
  - Exposes `sheetYObserver`, `scrollOffsetValue`, `momentumFlag` shared values.
- Overlays with their own sheet instances:
  - `PollsOverlay`, `BookmarksOverlay`, `ProfileOverlay`, `RestaurantOverlay`, `SaveListOverlay` all wrap `BottomSheetWithFlashList`.
  - Each overlay computes `snapPoints` via `calculateSnapPoints` using `searchBarTop`, `insets.top`, `navBarTop`/`navBarHeight`, and `headerHeight` from `useHeaderCloseCutout`.
  - `PollsOverlay` has `mode: docked | overlay` and nav bar cutoff logic to prevent the sheet from showing under the nav bar blur.
- Separate sheet implementation:
  - `SecondaryBottomSheet.tsx` used by `PollCreationSheet` and in Search for price/score sheets. This is not aligned with the shared sheet core.

### Overlay Navigation

- `overlayStore` tracks `activeOverlay` and params; search screen renders all overlays and uses `activeOverlay` booleans to show/hide.
- Each overlay mounts/unmounts separately. Switching tabs usually switches overlay components rather than swapping content in-place.

## Target Architecture

### 1) OverlaySheetShell (single base)

Create a single shell component that owns the _only_ `BottomSheetWithFlashList` instance. It accepts a config for the active overlay and renders its content.

**Proposed location:** `apps/mobile/src/overlays/OverlaySheetShell.tsx`

**Responsibilities**

- Own `sheetY`, `scrollOffset`, and `momentum` shared values.
- Own drag/settle state to maintain `searchInteractionRef` (reuse existing pattern).
- Apply shared styles, shadows, blur behavior, and nav bar cutout mask.
- Render only the active overlay’s content, but preserve scroll offsets per overlay.
- Maintain existing transitions and animations (do not alter timing/curves or show/hide logic).

### 2) Overlay Registry (content-only modules)

Refactor each overlay into a content module that returns:

```
export type OverlayContentSpec = {
  key: OverlayKey;
  listMode: 'flashlist' | 'scrollview' | 'none';
  renderHeader?: () => ReactNode;
  renderContent?: () => ReactNode; // non-list content
  listProps?: { data, renderItem, keyExtractor, ... };
  snapProfile: SnapProfile; // expanded/middle/collapsed/hidden
  initialSnap?: SheetPosition;
  preventSwipeDismiss?: boolean;
  contentInsets?: { top, bottom };
};
```

**Overlay modules to extract**

- `PollsOverlay` -> `PollsPanel`
- `BookmarksOverlay` -> `BookmarksPanel`
- `ProfileOverlay` -> `ProfilePanel`
- `RestaurantOverlay` -> `RestaurantPanel`
- `SaveListOverlay` -> `SaveListPanel`
- Search results becomes `SearchPanel` (or reuse `SearchResultsSheet` internals).

Each module should keep its data/state hooks but _not_ instantiate a sheet.

### 3) Snap Profiles

Define a single snap calculation interface:

```
export type SnapProfile = {
  expanded: number;
  middle: number;
  collapsed: number;
  hidden: number;
  dismissThreshold?: number;
};
```

Use `calculateSnapPoints(...)` for all overlays. For Polls “persistent header”:

- Use `navBarTop/navBarHeight` and `headerHeight` to compute a collapsed snap exactly at the nav bar edge.
- Keep `hidden` disabled for polls if we always want the sheet to persist as a header.

### 4) Scroll Position Preservation

Store scroll offsets per overlay key and restore on tab switch.

**Implementation option A (preferred):**

- On scroll end/momentum end, store offset into `overlayStore`:
  - `overlayScrollOffsets[overlayKey] = offset`
- On overlay switch, call `scrollToOffset` on the list ref once content is mounted.
  - Use `requestAnimationFrame` or `InteractionManager.runAfterInteractions` to avoid fighting drag.
  - For FlashList: `listRef.current?.scrollToOffset({ offset, animated: false })`.

**Option B (more memory):**

- Keep each overlay content mounted and swap visibility (`pointerEvents='none'`, `opacity=0`).
- This preserves list state automatically but costs memory and still keeps hidden lists alive.

Given perf goals, **Option A** is recommended.

### 5) Sheet State Across Overlays

Keep one `sheetState` for the shell; don’t collapse on tab switch.

**Algorithm on overlay switch:**

- Compute new snap profile.
- If `sheetY` is outside the new range, clamp to nearest snap and animate.
- Otherwise, keep current `sheetY` and compute the closest snap key for state.

### 6) Nav Bar Cutout

Move the nav-bar cutoff logic into the shell, not Polls.

- Use `navBarTop/navBarHeight` from Search screen (already known).
- Apply a top mask or padding so the sheet never renders under the nav blur.
- Keep `useHeaderCloseCutout` for header holes, but apply at shell level.

### 7) Eliminate SecondaryBottomSheet

- Convert `PollCreationSheet`, price/score sheets, etc. into overlay content states handled by the single shell.
- For modal-like flows, use a `snapProfile` with only `expanded/middle` and `preventSwipeDismiss` if needed.

## Performance Playbook Alignment

This plan should explicitly enforce the patterns from `plans/performance-playbook.md` (see: `plans/performance-playbook.md`) so unification does
not regress JS/UI performance.
It must also preserve the existing UI and interaction behavior exactly as‑is (search bar, suggestions, autocomplete, and tab transitions).

**What carries over automatically once the shell is in place**

- Single `BottomSheetWithFlashList` instance prevents multiple sheets from competing for JS/UI time.
- Shared `sheetY`, `scrollOffset`, `momentumFlag` means less prop churn and fewer commits during drag.
- Centralized drag/settle handling keeps `searchInteractionRef` accurate and avoids per-overlay `setState`.
- Single nav-bar cutout logic reduces overdraw and avoids duplicate blur layers.

**What must be enforced per overlay module**

- Do not run layout measurement or expensive computations while `interactionRef.current.isInteracting`.
- Keep `renderItem`, `keyExtractor`, header/footer components stable and memoized.
- Use list hydration for heavy lists (first N items, then fill).
- Avoid `runOnJS` during drag; only notify JS after settle or when scroll momentum ends.
- Gate real-time updates (sockets, polling, autocomplete) while dragging/settling.

**Implementation guardrails**

- Add a shell-level perf checklist (based on `Performance Playbook`) that each panel must satisfy.
- Preserve SearchPerf logs in the shell (profiler + JS stall logs), and scope them to the active panel.
- Keep blur layers enabled; only de-duplicate overlapping blur surfaces for the same region.

## Repository Organization & Maintainability Guardrails

As we implement this plan, keep the repo organized and maintainable. Any structure refactor must preserve
UI/behavior and remain strictly behavior‑neutral.

**Guiding principles**

- Organize by responsibility: shared sheet logic in one place, panel content in another.
- Minimize cross‑screen coupling; panels should depend on shared primitives, not on each other.
- Co-locate panel-specific hooks/utilities with the panel unless they are truly shared.
- Prefer incremental, low‑risk file moves with clear naming over broad refactors.

**Suggested structure (adapt as needed)**

- `apps/mobile/src/overlays/OverlaySheetShell.tsx` (single base shell)
- `apps/mobile/src/overlays/registry.ts` (overlay registry + lookups)
- `apps/mobile/src/overlays/types.ts` (shared types like `OverlayContentSpec`, `SnapProfile`)
- `apps/mobile/src/overlays/panels/*` (content-only panels: Search, Polls, Bookmarks, Profile, Restaurant, SaveList)
- `apps/mobile/src/overlays/hooks/*` (shared hooks only; panel-only hooks stay with the panel)
- `apps/mobile/src/overlays/utils/*` (shared helpers like snap calculations)

**Maintainability checks during migration**

- Remove obsolete sheet wrappers as soon as their panel is fully migrated.
- Keep imports shallow and explicit; avoid circular dependencies.
- Use consistent naming (`*Panel`, `*Shell`, `Overlay*`) to make the architecture discoverable.
- If a refactor is purely organizational, document it in the plan checklist and keep it separate from behavior changes.

**Search screen decomposition guidance**

- `apps/mobile/src/screens/Search/index.tsx` is already a monolith; unification work is an opportunity to split it.
- Favor extraction that reduces cognitive load without changing behavior:
  - Panel registry/wiring -> `apps/mobile/src/overlays/registry.ts`
  - Overlay shell integration -> `apps/mobile/src/overlays/OverlaySheetShell.tsx`
  - Marker pipeline (catalog + reveal loop) -> `apps/mobile/src/screens/Search/hooks/use-marker-reveal.ts`
  - Perf logging helpers -> `apps/mobile/src/screens/Search/utils/search-perf-logging.ts`
  - Search overlay chrome layout math -> `apps/mobile/src/screens/Search/hooks/use-search-chrome-layout.ts`
- Only extract a block if it is stable and reusable; avoid churn that obscures diff review.
- Keep exported APIs small and explicit; do not introduce new cross-screen dependencies.

## Overlay-Specific Analysis (Current Issues + Expected Fixes)

### Search (current base)

**Current issues**

- Already mostly fixed; remaining perf depends on marker reveal + list hydration.
  **Unification impact**
- Should remain the baseline; no new fixes expected beyond keeping its memoization and reveal logic.
  **Custom fixes still needed**
- Maintain marker reveal cadence and list hydration in the Search panel module.

### Polls

**Current issues**

- Separate sheet instance + `runOnJS` drag/settle notifications.
- Real-time updates (socket + polling) can trigger re-renders during drag/settle.
- Nav-bar cutout logic is embedded here (docked mode).
  **Unification impact**
- Base sheet removes duplicate sheet instances and centralizes drag/settle.
- Nav-bar cutout becomes shell behavior.
  **Custom fixes still needed**
- Gate socket updates and autocomplete suggestions while interacting.
- Memoize list rows and header controls; avoid inline callbacks in rows.

### Bookmarks

**Current issues**

- Separate sheet instance; list/grid updates can be heavy on tab switch.
  **Unification impact**
- Base sheet keeps scroll position and avoids remount churn.
  **Custom fixes still needed**
- Memoize tile grid and callbacks; avoid re-rendering the full grid on small state changes.
- Consider list hydration if the grid is large.

### Profile

**Current issues**

- Separate sheet instance; likely heavy layout when switching tabs.
  **Unification impact**
- Base sheet keeps the container stable and preserves scroll state.
  **Custom fixes still needed**
- Keep header/body memoized; avoid layout measurement during drag.
- If it has a large list section, use FlashList with stable renderItem/keyExtractor.

### Restaurant

**Current issues**

- Separate sheet instance; expensive details + dishes list.
  **Unification impact**
- Base sheet keeps drag/settle stable and lets us reuse list hydration.
  **Custom fixes still needed**
- Freeze heavy sections while interacting.
- Keep per-location expansion state isolated and avoid re-rendering the full list on toggle.

### Save List

**Current issues**

- Separate sheet instance; list + forms may re-render on tab switch.
  **Unification impact**
- Base sheet keeps scroll and interaction state stable.
  **Custom fixes still needed**
- Memoize form sections and list rows; gate layout measurement while interacting.

### Secondary sheets (Price/Score/Poll creation)

**Current issues**

- `SecondaryBottomSheet` uses RN Animated, not the shared sheet core.
  **Unification impact**
- Converting to panel states removes extra sheet instances and reduces modal overhead.
  **Custom fixes still needed**
- Ensure these panels use `preventSwipeDismiss` or limited snap profiles where needed.

## Migration Plan (Step‑by‑Step)

### Phase 0 — Inventory & Mapping (1 day)

- List all overlays and their current sheet behaviors:
  - Snap points, header height, nav bar offsets, dismiss behavior, and list type.
- Document per-overlay scroll state requirements.
- Identify all `SecondaryBottomSheet` usages and whether they can become “panel states” in the shell.

### Phase 1 — Build OverlaySheetShell (2–3 days)

- Create `OverlaySheetShell.tsx` that wraps `BottomSheetWithFlashList`.
- Accept `OverlayContentSpec` for active overlay.
- Own shared values for `sheetY`, `scrollOffset`, and `momentum`.
- Pass `onDragStateChange` / `onSettleStateChange` to existing `searchInteractionRef` handlers.
- Add nav bar cutoff mask (extract from Polls overlay behavior).

### Phase 2 — Extract Content Modules (3–5 days)

- For each overlay, extract a _content-only_ module:
  - `PollsPanel` (reuse PollsOverlay logic, but remove sheet wrapper)
  - `BookmarksPanel`, `ProfilePanel`, `RestaurantPanel`, `SaveListPanel`
  - `SearchPanel` (use current SearchResultsSheet internals or refactor)
- Keep data fetch logic inside the panel module.
- Return `OverlayContentSpec` + render functions.

### Phase 3 — Wire Overlay Registry (1–2 days)

- Create an overlay registry map:
  - `{ search: getSearchSpec(), polls: getPollsSpec(), ... }`
- The Search screen requests the spec for `activeOverlay` and passes it to `OverlaySheetShell`.
- Ensure sheet stays open across overlay switches.

### Phase 4 — Preserve Scroll State (1–2 days)

- Extend `overlayStore` to include:
  - `overlayScrollOffsets: Record<OverlayKey, number>`
  - `setOverlayScrollOffset(overlayKey, offset)`
- On switch, restore offset using list refs.
- Validate each overlay’s list state restores correctly.

### Phase 5 — Decommission Old Sheets (1–2 days)

- Remove per-overlay `BottomSheetWithFlashList` instances.
- Replace `SecondaryBottomSheet` usages with panel states in the shell.
- Delete overlay sheet wrappers or keep them as content-only views.

### Phase 6 — Polishing & Perf Validation (1–2 days)

- Verify the sheet stays open while switching nav tabs.
- Confirm scroll offsets persist across tabs.
- Re-run perf logs to ensure no new commits during drag.
- Validate nav bar blur/cutout behavior across all overlays.

## Implementation Notes & Best Practices

- **Keep `BottomSheetWithFlashList` as the single sheet engine.** It already supports shared values, drag/settle hooks, and snap points.
- **Avoid re-rendering the whole Search screen on overlay switches.** The shell should be a sub-tree with stable props.
- **Keep layout measurement gated by interaction refs** (`searchInteractionRef` and existing measurement hooks).
- **Polls persistent header behavior** becomes just a collapsed snap profile + nav bar cutoff mask, not a separate overlay.
- **Search chrome** should read from the shell’s `sheetY` so it stays consistent as overlays swap.
- **UI/behavior parity is a requirement:** preserve existing transitions, delays, and visibility logic for search bar, suggestions/autocomplete, and overlays.

## Files to Touch (Expected)

- New:
  - `apps/mobile/src/overlays/OverlaySheetShell.tsx`
  - `apps/mobile/src/overlays/OverlayRegistry.ts` (maps overlay -> spec)
- Refactor:
  - `apps/mobile/src/overlays/PollsOverlay.tsx` -> `PollsPanel.tsx`
  - `apps/mobile/src/overlays/BookmarksOverlay.tsx` -> `BookmarksPanel.tsx`
  - `apps/mobile/src/overlays/ProfileOverlay.tsx` -> `ProfilePanel.tsx`
  - `apps/mobile/src/overlays/RestaurantOverlay.tsx` -> `RestaurantPanel.tsx`
  - `apps/mobile/src/overlays/SaveListOverlay.tsx` -> `SaveListPanel.tsx`
  - `apps/mobile/src/screens/Search/index.tsx` (wire shell + registry)
- Store:
  - `apps/mobile/src/store/overlayStore.ts` (scroll offsets + panel state)

## Open Questions to Confirm

- Should we keep any overlay content mounted in memory for instant switching, or restore scroll from stored offsets?
- Do we want a micro crossfade (100ms) when swapping content to mask layout changes?
- Should any overlays disallow `hidden` snap entirely (ex: Polls persistent header)?

## Implementation Checklist (Per Panel)

Check items off as we implement to keep scope and regressions visible.

### Shell + Registry (Base)

- [x] Add `apps/mobile/src/overlays/OverlaySheetShell.tsx` wrapping `BottomSheetWithFlashList`.
- [x] Add `apps/mobile/src/overlays/OverlayRegistry.ts` and map `OverlayKey` -> panel spec.
- [x] Move nav‑bar cutout mask logic into shell (derived from Polls).
- [x] Centralize drag/settle notifications; remove per‑panel `runOnJS` during drag.
- [x] Preserve `searchInteractionRef` updates from the shell.
- [x] Store/restore scroll offsets per overlay key in `overlayStore`.
- [x] Clamp or animate to valid snap points when overlay switches.
- [x] Preserve snap-key alignment when snap profiles change (prevents expanded/middle drift when `searchBarTop` updates).
- [x] Preserve existing transition timings/curves and visibility rules (no UI behavior changes).

### Search Panel

- [x] Extract search list content into a `SearchPanel` content spec (no sheet wrapper).
- [x] Keep marker reveal, list hydration, and profiler logs intact.
- [x] Ensure `searchInteractionRef` is still used by list rows/measurement hooks.
- [x] Confirm results sheet remains animated via shell `sheetY`.
- [x] Preserve search bar + suggestions/autocomplete behavior exactly (no transition changes).

### Polls Panel

- [x] Extract `PollsOverlay` content into `PollsPanel` spec (remove sheet wrapper).
- [x] Port docked/overlay behavior to snap profile + shell nav‑bar cutout.
- [x] Gate socket updates + autocomplete while interacting.
- [x] Ensure poll creation flow becomes a panel state (no `SecondaryBottomSheet`).
- [x] Preserve any existing poll header transitions and state-driven UI changes.

### Bookmarks Panel

- [x] Extract `BookmarksOverlay` content into `BookmarksPanel` spec.
- [x] Memoize tile grid and callbacks; avoid inline closures.
- [x] Restore scroll offset on tab switch.
- [x] Preserve existing header/segment transitions and layout.

### Profile Panel

- [x] Extract `ProfileOverlay` content into `ProfilePanel` spec.
- [x] Memoize header/body; gate layout measurement while interacting.
- [x] Restore scroll offset on tab switch.
- [x] Preserve existing profile transitions and overlay dismissal behavior.

### Restaurant Panel

- [x] Extract `RestaurantOverlay` content into `RestaurantPanel` spec.
- [x] Freeze heavy sections while interacting (details, hours, lists).
- [x] Preserve per‑location expand/collapse state.
- [x] Restore scroll offset on tab switch.
- [x] Preserve existing open/close transitions and map camera behavior.

### Save List Panel

- [x] Extract `SaveListOverlay` content into `SaveListPanel` spec.
- [x] Memoize form sections + list rows.
- [x] Restore scroll offset on tab switch.
- [x] Preserve existing form/validation flow and transitions.

### Secondary Sheets (Price / Score / Poll Creation)

- [x] Remove `SecondaryBottomSheet` (poll creation moved into the unified shell; price/score remain modal overlays).
- [x] Keep Price / Score as modal overlays (per decision) while preserving their current open/close behavior.

### Validation

- [ ] Verify sheet stays open across tab switches.
- [ ] Verify scroll offsets are restored for each panel.
- [ ] Confirm nav bar blur/cutout consistency across panels.
- [ ] Re-run SearchPerf logs to ensure no commits during drag.
- [ ] Spot-check that search bar, suggestions/autocomplete, and tab transitions match current behavior exactly.
