import type { SearchMapRenderEngineInputs } from '../../components/SearchMapWithMarkerEngine';
import { getCraveScoreColorFromScore } from '../../utils/quality';
import type { createSearchRootMapPresentationRuntimeValue } from './search-root-map-presentation-controller-runtime';
import type { SearchRootMapSurfaceState } from './search-root-map-surface-state-controller-runtime';

export const getSearchMapEngineInputChanges = (
  left: SearchMapRenderEngineInputs,
  right: SearchMapRenderEngineInputs
): Record<string, boolean> => ({
  restaurantOnlyId: left.restaurantOnlyId !== right.restaurantOnlyId,
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
  lodVisibleCandidateBuffer: left.lodVisibleCandidateBuffer !== right.lodVisibleCandidateBuffer,
  lodPinPromoteStableMsMoving:
    left.lodPinPromoteStableMsMoving !== right.lodPinPromoteStableMsMoving,
  lodPinDemoteStableMsMoving: left.lodPinDemoteStableMsMoving !== right.lodPinDemoteStableMsMoving,
  lodPinToggleStableMsIdle: left.lodPinToggleStableMsIdle !== right.lodPinToggleStableMsIdle,
  lodPinOffscreenToggleStableMsMoving:
    left.lodPinOffscreenToggleStableMsMoving !== right.lodPinOffscreenToggleStableMsMoving,
  mapQueryBudget: left.mapQueryBudget !== right.mapQueryBudget,
  profileCommandPort: left.profileCommandPort !== right.profileCommandPort,
});

export const createSearchRootMapEngineInputs = ({
  mapSurfaceState,
  mapPresentationRuntime,
}: {
  mapSurfaceState: SearchRootMapSurfaceState;
  mapPresentationRuntime: ReturnType<typeof createSearchRootMapPresentationRuntimeValue>;
}): SearchMapRenderEngineInputs => ({
  restaurantOnlyId: mapSurfaceState.restaurantOnlyId,
  highlightedRestaurantId: mapPresentationRuntime.highlightedRestaurantId,
  viewportBoundsService: mapPresentationRuntime.viewportBoundsService,
  resolveRestaurantMapLocations: mapPresentationRuntime.resolveRestaurantMapLocations,
  resolveRestaurantLocationSelectionAnchor:
    mapPresentationRuntime.resolveRestaurantLocationSelectionAnchor,
  pickPreferredRestaurantMapLocation: mapPresentationRuntime.pickPreferredRestaurantMapLocation,
  getCraveScoreColorFromScore,
  mapGestureActiveRef: mapPresentationRuntime.mapGestureActiveRef,
  mapMotionPressureController: mapPresentationRuntime.mapMotionPressureController,
  shouldLogSearchComputes: mapPresentationRuntime.shouldLogSearchComputes,
  getPerfNow: mapPresentationRuntime.getPerfNow,
  logSearchCompute: mapPresentationRuntime.logSearchCompute,
  maxFullPins: 30,
  lodVisibleCandidateBuffer: 16,
  lodPinPromoteStableMsMoving: 48,
  lodPinDemoteStableMsMoving: 190,
  lodPinToggleStableMsIdle: 0,
  lodPinOffscreenToggleStableMsMoving: 120,
  mapQueryBudget: mapPresentationRuntime.mapQueryBudget,
  profileCommandPort: mapPresentationRuntime.profileCommandPort,
});
