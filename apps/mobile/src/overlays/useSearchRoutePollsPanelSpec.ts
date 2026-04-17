import type {
  SearchRouteOverlayCommandActions,
  SearchRouteOverlayCommandState,
} from './searchRouteOverlayCommandRuntimeContract';
import type { SearchRoutePollsPanelInputs } from './searchOverlayRouteHostContract';
import type { UsePollsPanelSpecOptions } from './panels/runtime/polls-panel-runtime-contract';
import type { SearchRouteHostVisualState } from './searchRouteHostVisualState';
import { usePollsSceneDefinition } from './panels/PollsPanel';
import type { SearchRouteOverlaySheetKeys } from './searchResolvedRouteHostModelContract';
import { useSearchRoutePollsPanelActions } from './useSearchRoutePollsPanelActions';
import { useSearchRoutePollsPanelRuntimeModel } from './useSearchRoutePollsPanelRuntimeModel';
import type { SearchRouteOverlayTransitionController } from './useSearchRouteOverlayTransitionController';
import type { OverlayKey } from './types';
import type { SearchRouteSceneDefinition } from './searchOverlayRouteHostContract';

type UseSearchRoutePollsPanelSpecArgs = {
  publishedVisualState: SearchRouteHostVisualState | null;
  rootOverlayKey: OverlayKey;
  pollOverlayParams: UsePollsPanelSpecOptions['params'];
  commandState: SearchRouteOverlayCommandState;
  commandActions: SearchRouteOverlayCommandActions;
  transitionController: SearchRouteOverlayTransitionController;
  overlaySheetKeys: SearchRouteOverlaySheetKeys;
  searchRouteDockedPollsPanelInputs: SearchRoutePollsPanelInputs | null;
};

export const useSearchRoutePollsSceneDefinition = ({
  publishedVisualState,
  rootOverlayKey,
  pollOverlayParams,
  commandState,
  commandActions,
  transitionController,
  overlaySheetKeys,
  searchRouteDockedPollsPanelInputs,
}: UseSearchRoutePollsPanelSpecArgs): SearchRouteSceneDefinition => {
  const pollsPanelRuntimeModel = useSearchRoutePollsPanelRuntimeModel({
    publishedVisualState,
    pollOverlayParams,
    commandState,
    overlaySheetKeys,
    searchRouteDockedPollsPanelInputs,
  });
  const {
    handlePollsSnapStart,
    handlePollsSnapChange,
    requestPollCreationExpand,
    requestReturnToSearchFromPolls,
  } = useSearchRoutePollsPanelActions({
    rootOverlayKey,
    commandState,
    commandActions,
    transitionController,
  });

  return usePollsSceneDefinition({
    visible: pollsPanelRuntimeModel.visible,
    bounds: pollsPanelRuntimeModel.bounds,
    bootstrapSnapshot: pollsPanelRuntimeModel.bootstrapSnapshot,
    userLocation: pollsPanelRuntimeModel.userLocation,
    params: pollsPanelRuntimeModel.params,
    initialSnapPoint: pollsPanelRuntimeModel.initialSnapPoint,
    mode: pollsPanelRuntimeModel.mode,
    currentSnap: pollsPanelRuntimeModel.currentSnap,
    navBarTop: pollsPanelRuntimeModel.navBarTop,
    navBarHeight: pollsPanelRuntimeModel.navBarHeight,
    searchBarTop: pollsPanelRuntimeModel.searchBarTop,
    snapPoints: pollsPanelRuntimeModel.snapPoints,
    onSnapStart: handlePollsSnapStart,
    onSnapChange: handlePollsSnapChange,
    shellSnapRequest: pollsPanelRuntimeModel.shellSnapRequest,
    onRequestReturnToSearch: requestReturnToSearchFromPolls,
    onRequestPollCreationExpand: requestPollCreationExpand,
    interactionRef: pollsPanelRuntimeModel.interactionRef,
  });
};
