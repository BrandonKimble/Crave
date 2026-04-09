import type {
  SearchRuntimeBus,
  SearchRuntimeProfileShellState,
} from '../shared/search-runtime-bus';
import { useSearchRuntimeBusSelector } from '../shared/use-search-runtime-bus-selector';

type UseProfileShellStateSelectorArgs = {
  searchRuntimeBus: SearchRuntimeBus;
};

export const useProfileShellStateSelector = ({
  searchRuntimeBus,
}: UseProfileShellStateSelectorArgs): SearchRuntimeProfileShellState =>
  useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => state.profileShellState,
    (left, right) =>
      left.transitionStatus === right.transitionStatus &&
      left.restaurantPanelSnapshot === right.restaurantPanelSnapshot &&
      left.mapCameraPadding === right.mapCameraPadding,
    ['profileShellState'] as const
  );
