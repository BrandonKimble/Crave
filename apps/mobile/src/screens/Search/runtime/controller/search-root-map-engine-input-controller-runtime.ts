import type { SearchMapRenderEngineInputs } from '../../components/SearchMapWithMarkerEngine';
// Dots/markers use the discrete score-bucket color so they match the bucketed
// pins + rank pills exactly (single source of truth in quality-color).
import { getScoreBucketColor } from '../../utils/quality';
import type { createSearchRootMapPresentationRuntimeValue } from './search-root-map-presentation-controller-runtime';

export const getSearchMapEngineInputChanges = (
  left: SearchMapRenderEngineInputs,
  right: SearchMapRenderEngineInputs
): Record<string, boolean> => ({
  highlightedRestaurantId: left.highlightedRestaurantId !== right.highlightedRestaurantId,
  viewportBoundsService: left.viewportBoundsService !== right.viewportBoundsService,
  resolveRestaurantMapLocations:
    left.resolveRestaurantMapLocations !== right.resolveRestaurantMapLocations,
  resolveRestaurantLocationSelectionAnchor:
    left.resolveRestaurantLocationSelectionAnchor !==
    right.resolveRestaurantLocationSelectionAnchor,
  pickPreferredRestaurantMapLocation:
    left.pickPreferredRestaurantMapLocation !== right.pickPreferredRestaurantMapLocation,
  getCraveScoreColorFromScore:
    left.getCraveScoreColorFromScore !== right.getCraveScoreColorFromScore,
  mapGestureActiveRef: left.mapGestureActiveRef !== right.mapGestureActiveRef,
  mapMotionPressureController:
    left.mapMotionPressureController !== right.mapMotionPressureController,
  shouldLogSearchComputes: left.shouldLogSearchComputes !== right.shouldLogSearchComputes,
  getPerfNow: left.getPerfNow !== right.getPerfNow,
  logSearchCompute: left.logSearchCompute !== right.logSearchCompute,
  maxFullPins: left.maxFullPins !== right.maxFullPins,
  mapQueryBudget: left.mapQueryBudget !== right.mapQueryBudget,
  profileCommandPort: left.profileCommandPort !== right.profileCommandPort,
});

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
  mapQueryBudget: mapPresentationRuntime.mapQueryBudget,
  profileCommandPort: mapPresentationRuntime.profileCommandPort,
});
