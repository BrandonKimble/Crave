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
 * S-C.4 item 3b (supersedes the earlier item-4 "transaction-owned pair" verdict): the manual
 * session command pair is DELETED. Nav motion has ONE writer — the derivation layout effect in
 * use-search-foreground-bottom-nav-visual-runtime — fed by three derived arms: the SESSION arm
 * (surface visual policy, which the enter/exit transactions flip in the same batched update
 * that used to carry the manual command — press-up timing unchanged), the SUGGESTION arm
 * (panel flag), and this store's CHILD arm (top-of-stack role). The old verdict's premise was
 * that the route commit lags SUBMIT — true, but the surface policy does NOT lag, and it was
 * always the honest signal.
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
