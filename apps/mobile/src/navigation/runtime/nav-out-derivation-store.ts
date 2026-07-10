import React from 'react';

/**
 * Nav-out is DERIVED, never opted into (trigger-nav ideal §4.1/§5.5): the bottom nav leaves
 * whenever the top-of-stack entry is a CHILD scene (metadata role 'child'), for all 13 child
 * scenes identically — poll detail, restaurant, saveList, and every stub page inherit it by
 * construction. This store replaces the per-scene nav-hide-intent registry (2 opt-ins).
 *
 * One writer: useAppRouteNavOutDerivationWriterRuntime (mounted once in the app shell) projects
 * the route navigation snapshot into this boolean.
 *
 * Ledger item 4 VERDICT — this split IS the final form, not an interim (the §5.1 "interim
 * clause" framing was wrong): search sessions ARE pushes now, but the desired-state
 * architecture presents AFTER resolve — the route commits at REVEAL, while the nav must leave
 * at SUBMIT (press-up feel). Session nav motion is therefore TRANSACTION-owned by design: the
 * enter transaction commands 'hide', the exit transaction / the pop-dismiss branch command
 * 'show' — a symmetric pair, not stray manual writers. This store owns the CHILD half of the
 * law, where route commits coincide with user intent (child pushes commit immediately).
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
