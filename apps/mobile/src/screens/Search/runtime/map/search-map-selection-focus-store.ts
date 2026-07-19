import type { Coordinate } from '../../../../types';

/**
 * Location-centric selection (master plan §7 / D2): tapping a pin selects THAT
 * location — exactly one marker highlights, never the whole sibling set. The
 * press flow records the tapped restaurant + coordinate here; the map's
 * highlight computation picks the single nearest presented marker for that
 * restaurant. Module-scope on purpose: the press happens in the source
 * controller and the highlight is computed in search-map — threading a prop
 * through the presentation tree would couple surfaces the runtime keeps apart.
 */
export type SearchMapSelectionFocus = {
  restaurantId: string;
  coordinate: Coordinate | null;
};

let currentFocus: SearchMapSelectionFocus | null = null;

export const setSearchMapSelectionFocus = (focus: SearchMapSelectionFocus | null): void => {
  currentFocus = focus;
};

export const getSearchMapSelectionFocus = (): SearchMapSelectionFocus | null => currentFocus;
