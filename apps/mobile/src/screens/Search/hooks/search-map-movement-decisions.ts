import type { MapBounds } from '../../../types';
import { MAP_MOVE_MIN_DISTANCE_MILES } from '../constants/map-movement';
import { getBoundsCenter, hasBoundsMovedSignificantly, haversineDistanceMiles } from '../utils/geo';

/**
 * THE TWO MAP-MOVEMENT DECISIONS, AS PURE FUNCTIONS (F3906 / D78, 2026-08-06).
 *
 * Both already were module-level, dependency-free, total functions — they lived
 * inside `use-search-map-movement-state.ts`, which imports `react-native` for a
 * `Dimensions.get`. That import is why the whole components/hooks territory read
 * as untestable: the hermetic node lane cannot load react-native, so a spec for
 * these could not even import them. Nothing about the decisions changed; they
 * moved to a module that loads.
 *
 * They are NOT a hook and must never carry the `use-` prefix (D70).
 */

/**
 * Does this viewport count as MOVED relative to the search that produced the
 * current results? Three baselines, in precedence order — see the spec for the
 * enumeration of each branch.
 */
export const shouldMarkMapMovedForBounds = ({
  fallbackBaselineBounds,
  nextBounds,
  searchBaselineBounds,
  hasMapMovedSinceSearch,
}: {
  fallbackBaselineBounds: MapBounds | null;
  nextBounds: MapBounds;
  searchBaselineBounds: MapBounds | null;
  hasMapMovedSinceSearch: boolean;
}): boolean => {
  // Already moved: the flag is sticky until a search resets it, so no amount of
  // panning BACK toward the baseline un-marks it.
  if (hasMapMovedSinceSearch) {
    return true;
  }
  if (
    searchBaselineBounds != null &&
    hasBoundsMovedSignificantly(searchBaselineBounds, nextBounds)
  ) {
    return true;
  }
  // The fallback baseline is a CENTRE only — it gets the distance test alone,
  // not the viewport-span ratio the real baseline gets.
  if (
    fallbackBaselineBounds != null &&
    haversineDistanceMiles(getBoundsCenter(fallbackBaselineBounds), getBoundsCenter(nextBounds)) >=
      MAP_MOVE_MIN_DISTANCE_MILES
  ) {
    return true;
  }
  return false;
};

/**
 * The gate between a map gesture and the "search this area" reveal: publish now,
 * hold until the surface is idle, or skip because nothing moved. `skip_no_move`
 * wins over every deferral reason — there is nothing to defer.
 */
export const resolveMapMovedEnterAdmission = ({
  hasMapMovedSinceSearch,
  isMapGestureActive,
  isSearchInteracting,
  isAnySheetDragging,
  shouldDeferMapFromPressure,
}: {
  hasMapMovedSinceSearch: boolean;
  isMapGestureActive: boolean;
  isSearchInteracting: boolean;
  isAnySheetDragging: boolean;
  shouldDeferMapFromPressure: boolean;
}): 'publish_now' | 'defer_until_idle' | 'skip_no_move' => {
  if (!hasMapMovedSinceSearch) {
    return 'skip_no_move';
  }
  if (
    shouldDeferMapFromPressure ||
    isMapGestureActive ||
    isSearchInteracting ||
    isAnySheetDragging
  ) {
    return 'defer_until_idle';
  }
  return 'publish_now';
};
