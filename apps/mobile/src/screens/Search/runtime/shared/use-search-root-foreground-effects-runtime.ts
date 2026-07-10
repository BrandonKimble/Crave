import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import { useSearchForegroundInteractionEffectsRuntime } from './use-search-foreground-interaction-effects-runtime';
import { useSearchRootForegroundEffectsRuntimeArgs } from './use-search-root-foreground-effects-runtime-args';

type UseSearchRootForegroundEffectsRuntimeArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
};

export const useSearchRootForegroundEffectsRuntime = ({
  stateFoundationLane,
  rootOverlayFoundationRuntime,
}: UseSearchRootForegroundEffectsRuntimeArgs): void => {
  const effectsRuntimeArgs = useSearchRootForegroundEffectsRuntimeArgs({
    stateFoundationLane,
    rootOverlayFoundationRuntime,
  });
  useSearchForegroundInteractionEffectsRuntime({
    effectsRuntimeArgs,
  });
};
