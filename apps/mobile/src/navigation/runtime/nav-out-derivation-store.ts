import React from 'react';

/**
 * Nav-out is DERIVED, never opted into (trigger-nav ideal §4.1/§5.5): the bottom nav leaves
 * whenever the top-of-stack entry is a CHILD scene (metadata role 'child'), for all 13 child
 * scenes identically — poll detail, restaurant, saveList, and every stub page inherit it by
 * construction. This store replaces the per-scene nav-hide-intent registry (2 opt-ins).
 *
 * One writer: useAppRouteNavOutDerivationWriterRuntime (mounted once in the app shell) projects
 * the route navigation snapshot into this boolean. Interim clause (§5.1): search results are
 * NOT a push yet (setRoot until S-C), so results/suggestion nav-out stays with the existing
 * search-motion mechanisms; this store covers the child-scene half of the law.
 */

type Listener = () => void;

let isChildSceneRevealed = false;
const listeners = new Set<Listener>();

export const setNavOutChildSceneRevealed = (next: boolean): void => {
  if (isChildSceneRevealed === next) {
    return;
  }
  isChildSceneRevealed = next;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = (): boolean => isChildSceneRevealed;

export const useIsNavOutChildSceneRevealed = (): boolean =>
  React.useSyncExternalStore(subscribe, getSnapshot);
