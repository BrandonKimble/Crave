import type { OverlayKey } from '../../overlays/types';

// ─── HeaderNavAction press registry (leg 6 — §4 plus/X action map) ───────────────────────────
//
// The host-owned HeaderNavAction (PersistentSheetHeaderHost) renders the ONE plus↔X control;
// what a press DOES is scene-routed here (the house module-scope registry pattern):
//
//   • CREATE (parents, plus): page-specific create shortcuts. Route-level creates
//     (polls → pushRoute('pollCreation')) live in the host's fallback map; creates that open
//     PANEL-INTERNAL flows (lists' new-list form is ListsPanel state) register here.
//     Pressing an unwired plus is a LOUD dev bark, never a silent no-op.
//   • CLOSE (children/search, X): the host's default is the canonical pop-to-origin dismiss
//     (closeActiveRoute). Scenes whose close is a SESSION verb register an override —
//     'search' (the published results-session close) and 'restaurant' (the session-token-
//     guarded closeRestaurantRoute via its header live state).

// F1483 — a STACK per sceneKey, not last-writer-wins. Two stacked entries of one scene
// (an explicitly supported shape — listDetail passes `entryId`) can each register an
// override; the host runs the TOP (most-recent) one, and an identity-guarded release
// pops that entry and RESTORES the one beneath it. Last-writer-wins silently reverted
// the still-live lower entry to the host default on the upper entry's release (its
// header X lost the discard-confirm, dropping an uncommitted reorder without a prompt).
const createActions = new Map<OverlayKey, Array<() => void>>();
const closeActions = new Map<OverlayKey, Array<() => void>>();

const register = (
  map: Map<OverlayKey, Array<() => void>>,
  sceneKey: OverlayKey,
  action: () => void
): (() => void) => {
  const stack = map.get(sceneKey) ?? [];
  stack.push(action);
  map.set(sceneKey, stack);
  return () => {
    const current = map.get(sceneKey);
    if (current == null) {
      return;
    }
    // Identity-guarded, top-most-first: pop THIS registration wherever it sits, so an
    // out-of-order release still restores the correct remaining override.
    const index = current.lastIndexOf(action);
    if (index !== -1) {
      current.splice(index, 1);
    }
    if (current.length === 0) {
      map.delete(sceneKey);
    }
  };
};

const runTopAction = (map: Map<OverlayKey, Array<() => void>>, sceneKey: OverlayKey): boolean => {
  const stack = map.get(sceneKey);
  const action = stack != null && stack.length > 0 ? stack[stack.length - 1] : undefined;
  if (action == null) {
    return false;
  }
  action();
  return true;
};

export const registerHeaderCreateAction = (
  sceneKey: OverlayKey,
  action: () => void
): (() => void) => register(createActions, sceneKey, action);

export const registerHeaderCloseAction = (sceneKey: OverlayKey, action: () => void): (() => void) =>
  register(closeActions, sceneKey, action);

/** Returns true when a registered create action ran (the top-most for the scene). */
export const runHeaderCreateAction = (sceneKey: OverlayKey): boolean =>
  runTopAction(createActions, sceneKey);

/** Returns true when a registered close OVERRIDE ran (the host then skips its default). */
export const runHeaderCloseAction = (sceneKey: OverlayKey): boolean =>
  runTopAction(closeActions, sceneKey);
