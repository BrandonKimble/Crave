import type {
  SearchRootFilterModalControlLane,
  SearchRootForegroundInteractionControlLane,
} from './use-search-root-control-plane-runtime-contract';
import { useSearchRootSearchSceneUiBusPatchRuntime } from './use-search-root-search-scene-ui-bus-patch-runtime';

// R1c: openNow / votesFilterActive / risingActive are no longer part of this patch — they are
// bus-authoritative and single-written by the toggle runner / filter-state runtime.
export type SearchRootSearchSceneBusPatch = {
  priceButtonLabelText: string;
  priceButtonIsActive: boolean;
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
