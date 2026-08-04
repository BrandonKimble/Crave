import { useSyncExternalStore } from 'react';

import type { SearchRootSearchStateRuntime } from './search-root-primitives-runtime-contract';

/**
 * F1323 — THE NOTIFYING READ of "are search shortcuts disabled".
 *
 * The fact is owned by a ref, because its primary consumer is the NATIVE chrome-scalar
 * primitive source and pushing straight at it (no React render) is the whole point of that
 * design. But three JS consumers were reading `shouldDisableSearchShortcutsRef.current` during
 * render and passing the result downstream as if it were reactive state. The ref's writer
 * notifies only the native target, so those readers had no edge at all: each got a value that
 * was correct at whatever render happened to run and stale afterwards.
 *
 * This is the read those consumers use instead. Same fact, same writer — the writer now also
 * pokes a listener set — but subscribed, so a flip re-renders the readers that depend on it.
 *
 * RED RECIPE: call `setShouldDisableSearchShortcuts(true)` with no other state change in
 * flight and assert the consuming surface updates in that commit. Against a render-time ref
 * read it does not; against this it does.
 */
export const useShouldDisableSearchShortcuts = (
  searchState: Pick<SearchRootSearchStateRuntime, 'shouldDisableSearchShortcutsAuthority'>
): boolean =>
  useSyncExternalStore(
    searchState.shouldDisableSearchShortcutsAuthority.subscribe,
    searchState.shouldDisableSearchShortcutsAuthority.getSnapshot,
    searchState.shouldDisableSearchShortcutsAuthority.getSnapshot
  );
