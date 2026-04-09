import React from 'react';
import { unstable_batchedUpdates } from 'react-native';

import { requestSearchRouteDockedRestore } from './searchRouteOverlayCommandStore';
import type {
  SearchRouteOverlayCommandActions,
  SearchRouteOverlayCommandState,
} from './searchRouteOverlayCommandRuntimeContract';
import { appOverlayRouteController } from './useAppOverlayRouteController';
import type { SearchRouteTabPanelRuntimeModel } from './useSearchRouteTabPanelRuntime';
import { useBookmarksPanelSpec } from './panels/BookmarksPanel';
import type { OverlayContentSpec } from './types';
import type { OverlayKey, OverlaySheetSnap, OverlaySheetSnapRequest } from './types';

type UseSearchRouteBookmarksPanelSpecArgs = {
  rootOverlayKey: OverlayKey;
  tabPanelRuntime: SearchRouteTabPanelRuntimeModel;
  commandState: SearchRouteOverlayCommandState;
  commandActions: SearchRouteOverlayCommandActions;
};

const buildShellSnapRequest = (
  snap: OverlaySheetSnap | null | undefined
): OverlaySheetSnapRequest | null => (snap ? { snap, token: null } : null);

export const useSearchRouteBookmarksPanelSpec = ({
  rootOverlayKey,
  tabPanelRuntime,
  commandState,
  commandActions,
}: UseSearchRouteBookmarksPanelSpecArgs): OverlayContentSpec<unknown> | null => {
  const handleBookmarksSnapStart = React.useCallback(
    (snap: OverlaySheetSnap) => {
      commandActions.setBookmarksSheetSnap(snap);
    },
    [commandActions]
  );

  const handleBookmarksSnapChange = React.useCallback(
    (snap: OverlaySheetSnap) => {
      commandActions.setBookmarksSheetSnap(snap);
      if (commandState.tabOverlaySnapRequest && commandState.tabOverlaySnapRequest === snap) {
        commandActions.setTabOverlaySnapRequest(null);
      }
      if (
        snap === 'hidden' &&
        rootOverlayKey === 'bookmarks' &&
        !commandState.overlaySwitchInFlight
      ) {
        commandActions.setTabOverlaySnapRequest(null);
        unstable_batchedUpdates(() => {
          requestSearchRouteDockedRestore({ snap: 'collapsed' });
          appOverlayRouteController.setRootRoute('search');
        });
      }
    },
    [
      commandActions,
      commandState.overlaySwitchInFlight,
      commandState.tabOverlaySnapRequest,
      rootOverlayKey,
    ]
  );

  const bookmarksPanelSpec = useBookmarksPanelSpec({
    visible: tabPanelRuntime.showBookmarksOverlay,
    navBarTop: tabPanelRuntime.navBarTop,
    searchBarTop: tabPanelRuntime.searchBarTop,
    snapPoints: tabPanelRuntime.snapPoints,
    sheetY: tabPanelRuntime.sheetY,
    headerActionProgress: tabPanelRuntime.headerActionProgress,
    onSnapStart: handleBookmarksSnapStart,
    onSnapChange: handleBookmarksSnapChange,
    shellSnapRequest: buildShellSnapRequest(commandState.tabOverlaySnapRequest),
  });

  return bookmarksPanelSpec;
};
