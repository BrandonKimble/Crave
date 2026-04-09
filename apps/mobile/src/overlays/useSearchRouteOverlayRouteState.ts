import { useOverlayStore } from '../store/overlayStore';
import type { SearchRouteOverlayRouteState } from './searchResolvedRouteHostModelContract';

export const useSearchRouteOverlayRouteState = (): SearchRouteOverlayRouteState => {
  const rootOverlayKey = useOverlayStore(
    (state) => state.overlayRouteStack[0]?.key ?? state.activeOverlayRoute.key
  );
  const activeOverlayRoute = useOverlayStore((state) => state.activeOverlayRoute);
  const activeOverlayRouteKey = activeOverlayRoute.key;
  const pollOverlayParams = useOverlayStore(
    (state) =>
      state.overlayRouteStack
        .slice()
        .reverse()
        .find((route) => route.key === 'polls')?.params
  );
  const shouldShowPollCreationPanel = activeOverlayRoute.key === 'pollCreation';

  return {
    rootOverlayKey,
    activeOverlayRouteKey,
    pollOverlayParams,
    pollCreationCoverageKey: shouldShowPollCreationPanel
      ? activeOverlayRoute.params?.coverageKey ?? null
      : null,
    pollCreationCoverageName: shouldShowPollCreationPanel
      ? activeOverlayRoute.params?.coverageName ?? null
      : null,
    shouldShowPollCreationPanel,
  };
};
