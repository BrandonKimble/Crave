import type { OverlayKey } from '../../overlays/types';

// ─── HeaderNavAction press registry (leg 6 — §4 plus/X action map) ───────────────────────────
//
// The host-owned HeaderNavAction (PersistentSheetHeaderHost) renders the ONE plus↔X control;
// what a press DOES is scene-routed here (the house module-scope registry pattern):
//
//   • CREATE (parents, plus): page-specific create shortcuts. Route-level creates
//     (polls → pushRoute('pollCreation')) live in the host's fallback map; creates that open
//     PANEL-INTERNAL flows (bookmarks' new-list form is BookmarksPanel state) register here.
//     Pressing an unwired plus is a LOUD dev bark, never a silent no-op.
//   • CLOSE (children/search, X): the host's default is the canonical pop-to-origin dismiss
//     (closeActiveRoute). Scenes whose close is a SESSION verb register an override —
//     'search' (the published results-session close) and 'restaurant' (the session-token-
//     guarded closeRestaurantRoute via its header live state).

const createActions = new Map<OverlayKey, () => void>();
const closeActions = new Map<OverlayKey, () => void>();

const register = (
  map: Map<OverlayKey, () => void>,
  sceneKey: OverlayKey,
  action: () => void
): (() => void) => {
  map.set(sceneKey, action);
  return () => {
    if (map.get(sceneKey) === action) {
      map.delete(sceneKey);
    }
  };
};

export const registerHeaderCreateAction = (
  sceneKey: OverlayKey,
  action: () => void
): (() => void) => register(createActions, sceneKey, action);

export const registerHeaderCloseAction = (sceneKey: OverlayKey, action: () => void): (() => void) =>
  register(closeActions, sceneKey, action);

/** Returns true when a registered create action ran. */
export const runHeaderCreateAction = (sceneKey: OverlayKey): boolean => {
  const action = createActions.get(sceneKey);
  if (action == null) {
    return false;
  }
  action();
  return true;
};

/** Returns true when a registered close OVERRIDE ran (the host then skips its default). */
export const runHeaderCloseAction = (sceneKey: OverlayKey): boolean => {
  const action = closeActions.get(sceneKey);
  if (action == null) {
    return false;
  }
  action();
  return true;
};
