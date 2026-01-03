# Search Suggestion Transition Plan

## Goals

- Make the search bar + shortcut chips fade to transparent at the **same time** the blur + suggestion overlay fade in.
- Reverse the animation on exit (search suggestions -> home) with matching timing.
- Keep the animation fast (~100-180ms), UI-thread driven, and free of JS re-renders.
- Preserve current behavior for when there are no results (small white banner only).
- Avoid performance regressions; follow the isolation + UI-thread patterns from `plans/overlay-sheet-system-redesign-v2.md` and `plans/overlay-sheet-system-redesign-v3.md`.
- Reuse the same fade logic when a search is submitted or a suggestion is chosen.
- Ensure restaurant-profile-only flows clear search state cleanly (no result sheet reappearing).

## Current Behavior & Root Causes (Observed in Code)

1. **Search bar + shortcut chips “snap” to transparent/white via JS state.**
   - `SearchHeader` uses `surfaceVariant={isSuggestionScreenActive ? 'transparent' : 'solid'}` which applies `promptCardTransparent` immediately.
   - Shortcut chips use `styles.searchShortcutChipTransparent` when `isSuggestionScreenActive` is true.
   - These are instant style toggles that bypass any animation.
   - Files: `apps/mobile/src/screens/Search/index.tsx`, `apps/mobile/src/screens/Search/components/SearchHeader.tsx`, `apps/mobile/src/screens/Search/styles.ts`.

2. **Overlay blur visibility is controlled by a separate, non-animated shared value.**
   - `searchSurfaceAnim` is set to `1` or `0` directly (no `withTiming`) when `isSuggestionScreenVisible` changes.
   - `isSuggestionScreenVisible` lags `isSuggestionScreenActive` due to `SUGGESTION_PANEL_HIDE_DELAY_MS`.
   - Result: blur/overlay can **snap off** after a delay, out of sync with the search bar transition.
   - Files: `apps/mobile/src/screens/Search/index.tsx`.

3. **Multiple animation triggers compete.**
   - `handleSearchPressIn` manually sets `searchSurfaceAnim` and `suggestionTransition`, while `useEffect` also animates `suggestionTransition` when `isSuggestionScreenActive` changes.
   - This double-trigger can lead to inconsistent timing and state.
   - File: `apps/mobile/src/screens/Search/index.tsx`.

4. **Suggestion overlay opacity and layout are driven by different signals.**
   - `suggestionTransition` animates the panel and input transparency.
   - `searchSurfaceAnim` controls blur/mask opacity.
   - `shouldShowSuggestionBackground` toggles white background based on results presence (not animated).
   - Result: white overlay and blur fade at different times than search bar/shortcuts.
   - File: `apps/mobile/src/screens/Search/index.tsx`.

5. **Keyboard motion is not synchronized with the suggestion transition.**
   - Keyboard animation starts on focus but the UI transition finishes before the keyboard settles.
   - This makes the overlay appear to “snap on” while the keyboard is still moving.
   - File: `apps/mobile/src/screens/Search/index.tsx`.

## Gap Analysis: Why Submit → Results/Profile Still Feels Different

- **Suggestion content is cleared immediately on submit.**
  - On submit/autocomplete selection we call `setSuggestions([])`, `setShowSuggestions(false)`, and `setIsAutocompleteSuppressed(true)`.
  - That makes `shouldRenderSuggestionPanel` false, so the white suggestion surface/top fill collapse during the fade.
- **Shortcut chips unmount via their own timing, not the shared progress.**
  - `searchShortcutsVisibility` runs its own `withTiming` and `shouldShowSearchShortcuts` flips false on submit.
  - That causes the chips to disappear all at once instead of fading with the overlay.
- **Header height shrinks mid‑fade.**
  - When `shouldShowSearchShortcuts` becomes false, the mask header height recalculates to only the search bar area.
  - The white overlay visibly “shrinks” from the chips+bar area down to a small strip.
- **Overlay visibility is gated by “render panel” flags.**
  - `shouldShowSuggestionSurface`/`shouldShowSuggestionBackground` depend on content presence.
  - When content is cleared, the overlay stops rendering before the fade completes.

These are the direct reasons the submit transition doesn’t reuse the smooth home→suggestions fade.

## Target Experience

- Entering suggestions:
  - Search bar + shortcut chips fade to transparent **while** blur + white overlay fade in.
  - Suggestion list content appears in the same timing window.
  - Keyboard motion feels aligned (not necessarily identical duration, but no visible “snap”).
- Exiting suggestions:
  - Search bar + shortcut chips fade back to white **while** blur + overlay fade out.
  - No intermediate “clear blur only” state; everything transitions in parallel.
- Submitting a search or tapping a suggestion:
  - Use the exact same fade timing as home↔suggestions.
  - Chips fade to **transparent** (not white), then unmount after the fade.
  - Overlay stays full‑height during the fade (no shrinking header).
  - Results sheet/profile is already visible in loading during the fade (no slide‑in).

## Implementation Plan

### Phase 1: Single Transition Driver (UI Thread)

- Replace `searchSurfaceAnim` + `suggestionTransition` with one shared value, e.g. `suggestionProgress`.
- `suggestionProgress` should be the **only** visual progress for:
  - Search bar background/shadow.
  - Shortcut chip background/shadow.
  - Blur overlay opacity.
  - Suggestion panel opacity/translate.
  - Cutout mask opacity.
- Only update `suggestionProgress` via a single `withTiming` call on focus/blur state changes.
- Remove `handleSearchPressIn` animation triggers to avoid double fire.
- Keep `isSuggestionPanelVisible` purely for mounting/unmounting, but only flip it after animation completion (`withTiming` callback + `runOnJS`) to prevent mid-animation unmounts.

### Phase 2: Search Bar + Shortcut Chips Animation

- Keep `surfaceVariant` fixed to `'solid'` so the base style doesn’t snap.
- Drive the search bar’s background + shadow purely through animated styles:
  - `backgroundColor: rgba(255,255,255, 1 - suggestionProgress)`
  - Shadow radius/opacity/elevation follow the same alpha.
- Replace `searchShortcutChipTransparent` toggles with an animated style:
  - Interpolate chip background + shadow based on `suggestionProgress`.
- Remove `searchShortcutsRowSuggestion` (layout snap) or animate any spacing changes with `suggestionProgress` to avoid jump.

### Phase 3: Overlay + Suggestions Layer

- Use `suggestionProgress` to control:
  - `searchSurface` opacity (blur).
  - `MaskedHoleOverlay` opacity.
  - Suggestion panel opacity/translate.
- Convert `searchSurfaceAnim` usage to `suggestionProgress` and delete the extra shared value.
- Change the suggestion background to animate alpha rather than snap:
  - `backgroundColor: rgba(255,255,255, suggestionProgress * targetAlpha)`
  - Keep `shouldShowSuggestionBackground` as a gate for **targetAlpha**, but not for the animation itself.

### Phase 4: Keyboard Synchronization

- Listen to `keyboardWillShow/keyboardWillHide` on iOS and use the event `duration` to set the `withTiming` duration.
- Fallback to a fixed duration (e.g., 120–160ms) for Android or when no duration is provided.
- If needed, delay the start of `suggestionProgress` by a small fraction (e.g., 20–30ms) to align with keyboard rise on slower devices.

### Phase 5: Performance Guardrails

- Avoid JS `setState` during the animation except for mount/unmount when the animation ends.
- Keep `SearchSuggestions` mounted while `suggestionProgress > 0`, not tied to `isSuggestionScreenActive` directly.
- Ensure Reanimated styles drive visuals; do not flip opaque/transparent styles via JS booleans.
- Validate that `MaskedHoleOverlay` + `FrostedGlassBackground` remain mounted and only their opacity changes.

### Phase 6: Submission + Results/Profile Transition (Unify with Shared Driver)

- On search submit or suggestion tap, keep the same parallel fade:
  - Search bar transitions to white.
  - Shortcuts and suggestion content fade to transparent.
  - Blur + white overlay fade out at the same rate.
- Show the results sheet **immediately** in its loading state (no slide-in).
- Add a `showPanelInstant` helper to set the sheet snap without a spring.
- Keep results sheet hidden for restaurant-only flows (profile overlay handles loading UI).
- Keep the suggestion overlay **mounted** during this fade:
  - Do not clear suggestions until the fade finishes (use driver completion callback).
  - Freeze the header height / cutout size to the last “suggestions-active” measurement.
  - Keep shortcut chips mounted but fade their background to transparent via the same progress.
- Create a small “submission mode” that:
  - Uses the shared transition driver.
  - Overrides chip alpha behavior (fade to transparent).
  - Defers unmounting until `progress === 0`.

### Phase 7: Edit / Cancel Restore

- When results or a restaurant profile are showing and the user taps the search bar to edit:
  - Hide the results sheet / profile instantly (no slide).
  - Keep the previous query in a ref for restore.
- If the user cancels (left chevron) without submitting:
  - Restore the previous query text.
  - Restore the prior results sheet or restaurant profile with the same fade transition.

### Phase 8: Restaurant Profile Clear Behavior

- If a restaurant-only search opens a profile:
  - Closing the profile (sheet X or search bar X) clears the search state.
  - Do not restore the results sheet afterward.
- If a profile is opened from results:
  - Closing restores the saved sheet snap + scroll offset.
- Ensure the profile close animation remains smooth while state clears happen after dismissal.

### Phase 9: Shared Transition API (Reusable Across Screens)

- Extract a reusable controller that exposes:
  - `progress` (SharedValue)
  - `isVisible` (mount gate)
  - `run(mode)` with consistent duration/easing
  - optional `onComplete` for deferring JS cleanup (clearing suggestions)
- Search screen wraps this controller in `useSearchTransition`, mapping:
  - bar/chip/overlay alphas
  - submission-specific chip fade logic
  - overlay mount rules
- Future screens can provide their own style mapping while sharing the same driver.

## Validation Checklist

- Enter suggestions: no snap in blur or chips; everything fades together.
- Exit suggestions: no intermediate “blur-only” frame; search bar and chips fade to white alongside background fade.
- Shortcuts and search bar remain visually centered and stable during transition.
- Keyboard motion feels aligned with the overlay fade (no visible lag).
- Submit (restaurant or query): no shrinking header; chips fade out; overlay fades out smoothly; sheet/profile already visible in loading.
- JS/UI FPS stable during repeated focus/blur cycles.

## Files Expected to Change

- `apps/mobile/src/screens/Search/index.tsx`
- `apps/mobile/src/screens/Search/components/SearchHeader.tsx`
- `apps/mobile/src/screens/Search/styles.ts`
- `apps/mobile/src/screens/Search/hooks/use-search-transition.ts`
- `apps/mobile/src/hooks/use-transition-driver.ts`
