import type {
  SearchRouteOverlayCommandActions,
  SearchRouteOverlayCommandState,
} from './searchRouteOverlayCommandRuntimeContract';
import type { SearchRoutePollsPanelInputs } from './searchOverlayRouteHostContract';
import type { UsePollsPanelSpecOptions } from './panels/runtime/polls-panel-runtime-contract';
import type { SearchRouteHostVisualState } from './searchRouteHostVisualState';
import { usePollsPanelSpec } from './panels/PollsPanel';
import type { SearchRouteOverlaySheetKeys } from './searchResolvedRouteHostModelContract';
import { useSearchRoutePollsPanelActions } from './useSearchRoutePollsPanelActions';
import { useSearchRoutePollsPanelRuntimeModel } from './useSearchRoutePollsPanelRuntimeModel';
import type { OverlayContentSpec } from './types';
import type { OverlayKey } from './types';

type UseSearchRoutePollsPanelSpecArgs = {
  publishedVisualState: SearchRouteHostVisualState | null;
  rootOverlayKey: OverlayKey;
  pollOverlayParams: UsePollsPanelSpecOptions['params'];
  commandState: SearchRouteOverlayCommandState;
  commandActions: SearchRouteOverlayCommandActions;
  overlaySheetKeys: SearchRouteOverlaySheetKeys;
  searchRouteDockedPollsPanelInputs: SearchRoutePollsPanelInputs | null;
};

export const useSearchRoutePollsPanelSpec = ({
  publishedVisualState,
  rootOverlayKey,
  pollOverlayParams,
  commandState,
  commandActions,
  overlaySheetKeys,
  searchRouteDockedPollsPanelInputs,
}: UseSearchRoutePollsPanelSpecArgs): OverlayContentSpec<unknown> | null => {
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
  });

  const pollsPanelSpec = usePollsPanelSpec({
    visible: pollsPanelRuntimeModel.visible,
    bounds: pollsPanelRuntimeModel.bounds,
    bootstrapSnapshot: pollsPanelRuntimeModel.bootstrapSnapshot,
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
    sheetY: pollsPanelRuntimeModel.sheetY,
    headerActionAnimationToken: pollsPanelRuntimeModel.headerActionAnimationToken,
    headerActionProgress: pollsPanelRuntimeModel.headerActionProgress,
    interactionRef: pollsPanelRuntimeModel.interactionRef,
  });
  return pollsPanelSpec;
};
