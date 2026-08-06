import type {
  SearchRootFilterModalControlLane,
  SearchRootForegroundInteractionControlLane,
} from './search-root-control-plane-runtime-contract';
import type { SearchRootSessionCoreLane } from './search-root-session-runtime-contract';
import {
  useSearchRootSearchSceneBusPublishEffectRuntime,
  type SearchRootSearchSceneBusPatch,
} from './use-search-root-search-scene-bus-publish-effect-runtime';

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

  // F1012 *-patch-runtime collapse: six patch hooks assembled these five fields across three
  // spread levels; composed here as ONE literal with explicit fields. The composed patch was
  // ALWAYS a fresh identity per render (every level of the old chain spread its children into
  // a new object), so the publish effect still fires on every render and relies, exactly as
  // before, on searchRuntimeBus.publish's Object.is dedupe to no-op unchanged fields.
  const searchRouteSceneBusPatch: SearchRootSearchSceneBusPatch = {
    priceButtonLabelText: filterModalControlLane.filterModalRuntime.priceButtonLabelText,
    priceButtonIsActive: filterModalControlLane.filterModalRuntime.priceButtonIsActive,
    isPriceSelectorVisible: filterModalControlLane.filterModalRuntime.isPriceSelectorVisible,
    isSortSelectorVisible: filterModalControlLane.filterModalRuntime.isSortSelectorVisible,
    shouldRetrySearchOnReconnect:
      foregroundInteractionControlLane.foregroundInteractionRuntime.shouldRetrySearchOnReconnect,
  };

  useSearchRootSearchSceneBusPublishEffectRuntime({
    searchRuntimeBus,
    searchRouteSceneBusPatch,
  });
};
