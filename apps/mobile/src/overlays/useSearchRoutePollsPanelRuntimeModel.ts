import type { SearchRouteHostVisualState } from './searchRouteHostVisualState';
import type { SearchRouteOverlayCommandState } from './searchRouteOverlayCommandRuntimeContract';
import type { SearchRoutePollsPanelInputs } from './searchOverlayRouteHostContract';
import type {
  PollsPanelInitialSnapPoint,
  PollsPanelMode,
  UsePollsPanelSpecOptions,
} from './panels/runtime/polls-panel-runtime-contract';
import {
  EMPTY_SEARCH_ROUTE_VISUAL_STATE,
  type SearchRouteOverlaySheetKeys,
} from './searchResolvedRouteHostModelContract';
import type { OverlaySheetSnap, OverlaySheetSnapRequest } from './types';

type UseSearchRoutePollsPanelRuntimeModelArgs = {
  publishedVisualState: SearchRouteHostVisualState | null;
  pollOverlayParams: UsePollsPanelSpecOptions['params'];
  commandState: SearchRouteOverlayCommandState;
  overlaySheetKeys: SearchRouteOverlaySheetKeys;
  searchRouteDockedPollsPanelInputs: SearchRoutePollsPanelInputs | null;
};

type SearchRoutePollsPanelRuntimeModel = {
  visible: boolean;
  bounds: SearchRoutePollsPanelInputs['pollBounds'];
  bootstrapSnapshot: SearchRoutePollsPanelInputs['startupPollsSnapshot'];
  interactionRef: UsePollsPanelSpecOptions['interactionRef'];
  params: UseSearchRoutePollsPanelRuntimeModelArgs['pollOverlayParams'];
  mode: PollsPanelMode;
  initialSnapPoint: PollsPanelInitialSnapPoint;
  currentSnap: OverlaySheetSnap;
  navBarTop: number;
  navBarHeight: number;
  searchBarTop: number;
  snapPoints: SearchRouteHostVisualState['snapPoints'];
  sheetY: SearchRouteHostVisualState['sheetTranslateY'];
  headerActionAnimationToken: number;
  headerActionProgress: SearchRouteHostVisualState['overlayHeaderActionProgress'];
  shellSnapRequest: OverlaySheetSnapRequest | null;
};

const buildShellSnapRequest = (
  snap: OverlaySheetSnap | null | undefined,
  token?: number | null
): OverlaySheetSnapRequest | null => (snap ? { snap, token: token ?? null } : null);

export const useSearchRoutePollsPanelRuntimeModel = ({
  publishedVisualState,
  pollOverlayParams,
  commandState,
  overlaySheetKeys,
  searchRouteDockedPollsPanelInputs,
}: UseSearchRoutePollsPanelRuntimeModelArgs): SearchRoutePollsPanelRuntimeModel => {
  const visualState = publishedVisualState ?? EMPTY_SEARCH_ROUTE_VISUAL_STATE;
  const pollsOverlayMode: PollsPanelMode = overlaySheetKeys.showPollsOverlay ? 'overlay' : 'docked';
  const pollsOverlaySnapPoint: PollsPanelInitialSnapPoint = overlaySheetKeys.showPollsOverlay
    ? 'middle'
    : 'collapsed';

  return {
    visible:
      overlaySheetKeys.showPollsOverlay ||
      (overlaySheetKeys.isSearchOverlay &&
        overlaySheetKeys.isPersistentPollLane &&
        !commandState.isDockedPollsDismissed),
    bounds: searchRouteDockedPollsPanelInputs?.pollBounds,
    bootstrapSnapshot: searchRouteDockedPollsPanelInputs?.startupPollsSnapshot,
    interactionRef: searchRouteDockedPollsPanelInputs?.interactionRef ?? undefined,
    params: pollOverlayParams,
    mode: pollsOverlayMode,
    initialSnapPoint: pollsOverlaySnapPoint,
    currentSnap:
      overlaySheetKeys.isSearchOverlay &&
      overlaySheetKeys.isPersistentPollLane &&
      !commandState.isDockedPollsDismissed
        ? 'collapsed'
        : commandState.pollsSheetSnap,
    navBarTop: visualState.navBarTopForSnaps,
    navBarHeight: visualState.navBarHeight,
    searchBarTop: visualState.searchBarTop,
    snapPoints: visualState.snapPoints,
    sheetY: visualState.sheetTranslateY,
    headerActionAnimationToken: commandState.pollsHeaderActionAnimationToken,
    headerActionProgress: visualState.overlayHeaderActionProgress,
    shellSnapRequest: buildShellSnapRequest(
      pollsOverlayMode === 'overlay'
        ? commandState.tabOverlaySnapRequest
        : commandState.pollsDockedSnapRequest?.snap ?? null,
      pollsOverlayMode === 'overlay' ? undefined : commandState.pollsDockedSnapRequest?.token
    ),
  };
};
