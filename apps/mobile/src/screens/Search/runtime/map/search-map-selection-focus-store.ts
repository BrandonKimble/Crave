import type { Coordinate } from '../../../../types';

/**
 * Location-centric selection (master plan §7 / D2): tapping a pin selects THAT
 * location — exactly one marker highlights, never the whole sibling set. The
 * press flow records the tapped restaurant + coordinate here; the map's
 * highlight computation picks the single nearest presented marker for that
 * restaurant. Module-scope on purpose: the press happens in the source
 * controller and the highlight is computed in search-map — threading a prop
 * through the presentation tree would couple surfaces the runtime keeps apart.
 *
 * Subscribable (red-team b1f773cf): a SECOND tap on a sibling pin of the
 * already-selected restaurant changes the focus WITHOUT changing
 * selectedRestaurantId, so the highlight memo must observe the store (via
 * useSyncExternalStore) — a bare module-scope read would keep highlighting the
 * previously tapped location.
 */
export type SearchMapSelectionFocus = {
  restaurantId: string;
  coordinate: Coordinate | null;
};

type Listener = () => void;

let currentFocus: SearchMapSelectionFocus | null = null;
const listeners = new Set<Listener>();

export const setSearchMapSelectionFocus = (focus: SearchMapSelectionFocus | null): void => {
  // OPEN QUESTION, DELIBERATELY NOT CHANGED (D45/F1071c, D44 Phase-3 2026-08-03).
  //
  // This is an IDENTITY compare against a value the caller freshly allocates:
  // use-direct-search-map-source-controller.ts builds `{restaurantId, coordinate}`
  // new on every press, so this guard only ever short-circuits the null case.
  // Re-tapping the SAME pin at the SAME coordinate therefore re-notifies every
  // subscriber of the useSyncExternalStore in search-map.tsx. It is the third
  // instance of the identity-compare-against-a-fresh-allocator class in this
  // territory (with F1052f and F1061), and the other two are being fixed with
  // field-wise comparators.
  //
  // This one is NOT, yet, because it sits on the map and CLAUDE.md's map law
  // forbids tightening map behaviour on a static read: the extra notifications
  // may be PAPERING OVER a missing re-selection path (a re-tap that has to
  // restore a highlight something else cleared). Tightening to a field-wise
  // compare would silently delete that repair.
  //
  // THE CHECK THAT SETTLES IT (run before touching this):
  //   1. `./scripts/rig/sim-target.sh prod`, then
  //      `scripts/rig/reload-dev-client.sh` (a cold launch serves the last FULL
  //      bundle — HMR patches do not count).
  //   2. Add a `[FOCUSDBG]` log here printing
  //      `{incoming, currentFocus, wouldFieldWiseSuppress}` and one in the
  //      search-map.tsx highlight memo printing the resolved highlighted
  //      markerKey. Read them from /tmp/crave-metro.log (RN console.log does not
  //      reach `simctl log stream`), with a `=== RUN <ts> ===` marker per repro.
  //   3. Repro A: tap pin X, tap a SIBLING pin of the same restaurant — the
  //      highlight must move (this is the red-team b1f773cf case the header
  //      documents; a field-wise compare must still pass it).
  //   4. Repro B — the one that decides it: tap pin X, then do the things that
  //      clear the highlight without clearing this store (pan away and back,
  //      collapse/expand the results sheet, switch tab and return), then tap
  //      pin X AGAIN at the same coordinate. If the highlight comes back ONLY
  //      because of the redundant notification, `wouldFieldWiseSuppress` will be
  //      true on that press — and the fix is the missing re-selection path, not
  //      the comparator.
  // Owner call once that runs. Until then the redundant notify stays.
  if (focus === currentFocus) {
    return;
  }
  currentFocus = focus;
  listeners.forEach((listener) => listener());
};

export const getSearchMapSelectionFocus = (): SearchMapSelectionFocus | null => currentFocus;

export const subscribeSearchMapSelectionFocus = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
