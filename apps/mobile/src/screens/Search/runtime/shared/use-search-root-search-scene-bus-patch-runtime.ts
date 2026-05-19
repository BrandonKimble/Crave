import type {
  SearchRootFilterModalControlLane,
  SearchRootForegroundInteractionControlLane,
} from './use-search-root-control-plane-runtime-contract';
import { useSearchRootSearchSceneUiBusPatchRuntime } from './use-search-root-search-scene-ui-bus-patch-runtime';

export type SearchRootSearchSceneBusPatch = {
  priceButtonLabelText: string;
  priceButtonIsActive: boolean;
  openNow: boolean;
  votesFilterActive: boolean;
  isPriceSelectorVisible: boolean;
  shouldRetrySearchOnReconnect: boolean;
};

export const useSearchRootSearchSceneBusPatchRuntime = ({
  filterModalControlLane,
  foregroundInteractionControlLane,
}: {
  filterModalControlLane: SearchRootFilterModalControlLane;
  foregroundInteractionControlLane: SearchRootForegroundInteractionControlLane;
}): SearchRootSearchSceneBusPatch => ({
  ...useSearchRootSearchSceneUiBusPatchRuntime({
    filterModalControlLane,
    foregroundInteractionControlLane,
  }),
});
