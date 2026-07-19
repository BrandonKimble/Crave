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
