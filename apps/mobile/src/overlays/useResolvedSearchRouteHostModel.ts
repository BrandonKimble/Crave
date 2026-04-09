import type { ResolvedSearchRouteHostModel } from './searchResolvedRouteHostModelContract';
import { useSearchRouteOverlayActiveSheetSpec } from './useSearchRouteOverlayActiveSheetSpec';
import { useSearchRouteBookmarksPanelSpec } from './useSearchRouteBookmarksPanelSpec';
import { useSearchRouteOverlayCommandActions } from './useSearchRouteOverlayCommandActions';
import { useSearchRouteOverlayCommandState } from './useSearchRouteOverlayCommandState';
import { useSearchRouteFrozenOverlayRenderModel } from './useSearchRouteFrozenOverlayRenderModel';
import { useSearchRoutePollCreationPanelSpec } from './useSearchRoutePollCreationPanelSpec';
import { useSearchRoutePollsPanelSpec } from './useSearchRoutePollsPanelSpec';
import { useSearchRouteProfilePanelSpec } from './useSearchRouteProfilePanelSpec';
import { useSearchRouteOverlayPublishedState } from './useSearchRouteOverlayPublishedState';
import { useSearchRouteOverlayRouteState } from './useSearchRouteOverlayRouteState';
import { useSearchRouteOverlaySheetKeys } from './useSearchRouteOverlaySheetKeys';
import { useSearchRouteOverlaySheetVisibilityState } from './useSearchRouteOverlaySheetVisibilityState';
import { useSearchRouteSaveListPanelSpec } from './useSearchRouteSaveListPanelSpec';
import { useSearchRouteTabPanelRuntime } from './useSearchRouteTabPanelRuntime';

export const useResolvedSearchRouteHostModel = (): ResolvedSearchRouteHostModel | null => {
  const {
    publishedVisualState,
    searchPanelSpec,
    searchPanelInteractionRef,
    dockedPollsPanelInputs,
    renderPolicy,
  } = useSearchRouteOverlayPublishedState();
  const commandState = useSearchRouteOverlayCommandState();
  const commandActions = useSearchRouteOverlayCommandActions();
  const routeState = useSearchRouteOverlayRouteState();
  const overlaySheetKeys = useSearchRouteOverlaySheetKeys({
    shouldShowSearchPanel: renderPolicy.shouldShowSearchPanel,
    shouldShowDockedPollsPanel: renderPolicy.shouldShowDockedPollsPanel,
    isDockedPollsDismissed: commandState.isDockedPollsDismissed,
    activeOverlayRouteKey: routeState.activeOverlayRouteKey,
    rootOverlayKey: routeState.rootOverlayKey,
    showSaveListOverlay: commandState.saveSheetState.visible,
  });
  const pollsPanelSpec = useSearchRoutePollsPanelSpec({
    publishedVisualState,
    dockedPollsPanelInputs,
    rootOverlayKey: routeState.rootOverlayKey,
    pollOverlayParams: routeState.pollOverlayParams,
    commandState,
    commandActions,
    overlaySheetKeys,
  });
  const pollCreationPanelSpec = useSearchRoutePollCreationPanelSpec({
    publishedVisualState,
    pollCreationCoverageKey: routeState.pollCreationCoverageKey,
    pollCreationCoverageName: routeState.pollCreationCoverageName,
    shouldShowPollCreationPanel: routeState.shouldShowPollCreationPanel,
    commandState,
    commandActions,
  });
  const tabPanelRuntime = useSearchRouteTabPanelRuntime({
    publishedVisualState,
    overlaySheetKeys,
  });
  const bookmarksPanelSpec = useSearchRouteBookmarksPanelSpec({
    rootOverlayKey: routeState.rootOverlayKey,
    tabPanelRuntime,
    commandState,
    commandActions,
  });
  const profilePanelSpec = useSearchRouteProfilePanelSpec({
    rootOverlayKey: routeState.rootOverlayKey,
    tabPanelRuntime,
    commandState,
    commandActions,
  });
  const saveListPanelSpec = useSearchRouteSaveListPanelSpec({
    publishedVisualState,
    commandState,
    commandActions,
  });
  const activeSheetSpec = useSearchRouteOverlayActiveSheetSpec({
    overlaySheetKeys,
    searchPanelSpec,
    searchPanelInteractionRef,
    pollsPanelSpec,
    pollCreationPanelSpec,
    bookmarksPanelSpec,
    profilePanelSpec,
    saveListPanelSpec,
  });
  const visibilityState = useSearchRouteOverlaySheetVisibilityState({
    renderPolicy,
    overlaySheetKeys,
    activeSheetSpec,
  });

  return useSearchRouteFrozenOverlayRenderModel({
    publishedVisualState,
    searchHeaderActionResetToken: commandState.searchHeaderActionResetToken,
    shouldFreezeOverlaySheetForCloseHandoff: renderPolicy.shouldFreezeOverlaySheetForCloseHandoff,
    shouldFreezeOverlayHeaderActionForRunOne: renderPolicy.shouldFreezeOverlayHeaderActionForRunOne,
    activeSheetSpec,
    visibilityState,
  });
};
