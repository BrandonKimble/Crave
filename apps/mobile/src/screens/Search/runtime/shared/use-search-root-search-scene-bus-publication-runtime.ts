import type {
  SearchRootFilterModalControlLane,
  SearchRootForegroundInteractionControlLane,
} from './use-search-root-control-plane-runtime-contract';
import type { SearchRootSessionCoreLane } from './use-search-root-session-runtime-contract';
import { useSearchRootSearchSceneBusPatchRuntime } from './use-search-root-search-scene-bus-patch-runtime';
import { useSearchRootSearchSceneBusPublishEffectRuntime } from './use-search-root-search-scene-bus-publish-effect-runtime';

type UseSearchRootSearchSceneBusPublicationRuntimeArgs = {
  sessionCoreLane: SearchRootSessionCoreLane;
  filterModalControlLane: SearchRootFilterModalControlLane;
  foregroundInteractionControlLane: SearchRootForegroundInteractionControlLane;
};

export const useSearchRootSearchSceneBusPublicationRuntime = ({
  sessionCoreLane,
  filterModalControlLane,
  foregroundInteractionControlLane,
}: UseSearchRootSearchSceneBusPublicationRuntimeArgs): void => {
  const { searchRuntimeBus } = sessionCoreLane;

  const searchRouteSceneBusPatch = useSearchRootSearchSceneBusPatchRuntime({
    filterModalControlLane,
    foregroundInteractionControlLane,
  });

  useSearchRootSearchSceneBusPublishEffectRuntime({
    searchRuntimeBus,
    searchRouteSceneBusPatch,
  });
};
