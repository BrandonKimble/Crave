import type { SearchMapRenderEngineInputs } from '../../components/SearchMapWithMarkerEngine';
// Dots/markers use the discrete score-bucket color so they match the bucketed
// pins + rank pills exactly (single source of truth in quality-color).
import { getScoreBucketColor } from '../../utils/quality';
import type { createSearchRootMapPresentationRuntimeValue } from './search-root-map-presentation-controller-runtime';

export const createSearchRootMapEngineInputs = ({
  mapPresentationRuntime,
}: {
  mapPresentationRuntime: ReturnType<typeof createSearchRootMapPresentationRuntimeValue>;
}): SearchMapRenderEngineInputs => ({
  highlightedRestaurantId: mapPresentationRuntime.highlightedRestaurantId,
  viewportBoundsService: mapPresentationRuntime.viewportBoundsService,
  resolveRestaurantMapLocations: mapPresentationRuntime.resolveRestaurantMapLocations,
  resolveRestaurantLocationSelectionAnchor:
    mapPresentationRuntime.resolveRestaurantLocationSelectionAnchor,
  pickPreferredRestaurantMapLocation: mapPresentationRuntime.pickPreferredRestaurantMapLocation,
  // Marker color = discrete score bucket (matches bucketed pins + rank pills).
  getCraveScoreColorFromScore: getScoreBucketColor,
  mapGestureActiveRef: mapPresentationRuntime.mapGestureActiveRef,
  mapMotionPressureController: mapPresentationRuntime.mapMotionPressureController,
  shouldLogSearchComputes: mapPresentationRuntime.shouldLogSearchComputes,
  getPerfNow: mapPresentationRuntime.getPerfNow,
  logSearchCompute: mapPresentationRuntime.logSearchCompute,
  // Single LOD budget: the on-screen top-N promoted pins, all rank-badged (viewport-bounded
  // shortcut migration — every result is in-view). Top 30.
  maxFullPins: 30,
  profileCommandPort: mapPresentationRuntime.profileCommandPort,
});
