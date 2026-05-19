import type {
  SearchRuntimeBus,
  SearchRuntimeProfileShellState,
} from '../shared/search-runtime-bus';
import { useSearchRuntimeBusSelector } from '../shared/use-search-runtime-bus-selector';

type UseProfileShellStateSelectorArgs = {
  searchRuntimeBus: SearchRuntimeBus;
};

const areProfileCameraPaddingsEqual = (
  left: SearchRuntimeProfileShellState['mapCameraPadding'],
  right: SearchRuntimeProfileShellState['mapCameraPadding']
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.paddingTop === right.paddingTop &&
    left.paddingBottom === right.paddingBottom &&
    left.paddingLeft === right.paddingLeft &&
    left.paddingRight === right.paddingRight);

export const useProfileShellStateSelector = ({
  searchRuntimeBus,
}: UseProfileShellStateSelectorArgs): SearchRuntimeProfileShellState =>
  useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => state.profileShellState,
    (left, right) =>
      left.transitionStatus === right.transitionStatus &&
      left.restaurantPanelSnapshot === right.restaurantPanelSnapshot &&
      areProfileCameraPaddingsEqual(left.mapCameraPadding, right.mapCameraPadding) &&
      left.mapHighlightedRestaurantId === right.mapHighlightedRestaurantId,
    ['profileShellState'] as const
  );
