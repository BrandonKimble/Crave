import type {
  SearchRootFilterModalControlLane,
  SearchRootForegroundInteractionControlLane,
} from './use-search-root-control-plane-runtime-contract';
import type { SearchRootSearchSceneBusPatch } from './use-search-root-search-scene-bus-patch-runtime';
import { useSearchRootSearchSceneFilterBusPatchRuntime } from './use-search-root-search-scene-filter-bus-patch-runtime';
import { useSearchRootSearchSceneReconnectBusPatchRuntime } from './use-search-root-search-scene-reconnect-bus-patch-runtime';

export const useSearchRootSearchSceneUiBusPatchRuntime = ({
  filterModalControlLane,
  foregroundInteractionControlLane,
}: {
  filterModalControlLane: SearchRootFilterModalControlLane;
  foregroundInteractionControlLane: SearchRootForegroundInteractionControlLane;
}): Pick<
  SearchRootSearchSceneBusPatch,
  | 'priceButtonLabelText'
  | 'priceButtonIsActive'
  | 'isPriceSelectorVisible'
  | 'isSortSelectorVisible'
  | 'shouldRetrySearchOnReconnect'
> => ({
  ...useSearchRootSearchSceneFilterBusPatchRuntime({
    filterModalControlLane,
  }),
  ...useSearchRootSearchSceneReconnectBusPatchRuntime({
    foregroundInteractionControlLane,
  }),
});
