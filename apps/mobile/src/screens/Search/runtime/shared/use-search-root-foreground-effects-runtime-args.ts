import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import { useSearchRootForegroundEffectsUiArgs } from './use-search-root-foreground-effects-ui-args';
import type { SearchForegroundInteractionRouteEffectsRuntimeArgs } from './use-search-foreground-interaction-effects-runtime';

type UseSearchRootForegroundEffectsRuntimeArgsArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
};

export const useSearchRootForegroundEffectsRuntimeArgs = ({
  stateFoundationLane,
  rootOverlayFoundationRuntime,
}: UseSearchRootForegroundEffectsRuntimeArgsArgs): SearchForegroundInteractionRouteEffectsRuntimeArgs => {
  return useSearchRootForegroundEffectsUiArgs({
    stateFoundationLane,
    rootOverlayFoundationRuntime,
  });
};
