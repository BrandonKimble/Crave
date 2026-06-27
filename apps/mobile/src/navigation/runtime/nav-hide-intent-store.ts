import React from 'react';

/**
 * Shareable "push the bottom nav down" intent registry.
 *
 * The search-submit transition (sheet grows while the bottom tab bar slides down +
 * fades, 360ms `Easing.out(Easing.cubic)`) is driven by a single master boolean —
 * `shouldHideBottomNavForMotion` in `use-search-foreground-bottom-nav-visual-runtime`.
 * Rather than hardcode each scene into that search-specific condition, this store lets
 * ANY scene declare "while I'm active, the nav should be pushed down." The search nav
 * runtime ORs `useHasNavHideIntent()` into its master signal, so every registered intent
 * reuses the exact same coordinated transition (nav translateY + opacity + the sheet
 * body exclusion grow). Drop `useNavHideIntent(key, active)` into any scene to get it.
 */

const activeIntents = new Set<string>();
const listeners = new Set<() => void>();

const emit = (): void => {
  listeners.forEach((listener) => listener());
};

const setNavHideIntent = (key: string, active: boolean): void => {
  const had = activeIntents.has(key);
  if (active && !had) {
    activeIntents.add(key);
    emit();
  } else if (!active && had) {
    activeIntents.delete(key);
    emit();
  }
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = (): boolean => activeIntents.size > 0;

/** True while ANY scene has requested the bottom nav be pushed down. */
export const useHasNavHideIntent = (): boolean =>
  React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

/**
 * Declare that the bottom nav should be pushed down (the search-submit transition)
 * while `active` is true. Self-cleans on unmount / when `active` goes false.
 */
export const useNavHideIntent = (key: string, active: boolean): void => {
  React.useEffect(() => {
    setNavHideIntent(key, active);
    return () => setNavHideIntent(key, false);
  }, [key, active]);
};
