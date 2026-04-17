import { useOverlayStore, type OverlayRouteEntry } from '../store/overlayStore';
import { useSearchRouteOverlayCommandStore } from './searchRouteOverlayCommandStore';
import type { SearchRouteOverlayRouteState } from './searchResolvedRouteHostModelContract';

const isPollCreationRouteEntry = (
  route: OverlayRouteEntry
): route is OverlayRouteEntry<'pollCreation'> => route.key === 'pollCreation';

export const useSearchRouteOverlayRouteState = (): SearchRouteOverlayRouteState => {
  const rootOverlayKey = useOverlayStore(
    (state) => state.overlayRouteStack[0]?.key ?? state.activeOverlayRoute.key
  );
  const activeOverlayRoute = useOverlayStore((state) => state.activeOverlayRoute);
  const activeOverlayRouteKey = activeOverlayRoute.key;
  const pollOverlayParams = useSearchRouteOverlayCommandStore((state) => state.pollsPanelParams);
  const activePollCreationRoute = isPollCreationRouteEntry(activeOverlayRoute)
    ? activeOverlayRoute
    : null;
  const shouldShowPollCreationPanel = activePollCreationRoute != null;

  return {
    rootOverlayKey,
    activeOverlayRouteKey,
    pollOverlayParams,
    pollCreationMarketKey: shouldShowPollCreationPanel
      ? (activePollCreationRoute.params?.marketKey ?? null)
      : null,
    pollCreationMarketName: shouldShowPollCreationPanel
      ? (activePollCreationRoute.params?.marketName ?? null)
      : null,
    pollCreationBounds: shouldShowPollCreationPanel
      ? (activePollCreationRoute.params?.bounds ?? null)
      : null,
    shouldShowPollCreationPanel,
  };
};
