import React from 'react';
import { unstable_batchedUpdates } from 'react-native';

import { requestSearchRouteDockedRestore } from './searchRouteOverlayCommandStore';
import { appOverlayRouteController } from './useAppOverlayRouteController';
import type { SearchRouteOverlayTransitionController } from './useSearchRouteOverlayTransitionController';
import type { SearchRouteHostVisualState } from './searchRouteHostVisualState';
import { useBookmarksSceneDefinition } from './panels/BookmarksPanel';
import type { OverlayKey, OverlaySheetSnap, OverlaySheetSnapRequest } from './types';
import type { SearchRouteSceneDefinition } from './searchOverlayRouteHostContract';

type UseSearchRouteBookmarksPanelSpecArgs = {
  mounted?: boolean;
  visible: boolean;
  rootOverlayKey: OverlayKey;
  navBarTop: SearchRouteHostVisualState['navBarTopForSnaps'];
  searchBarTop: SearchRouteHostVisualState['searchBarTop'];
  snapPoints: SearchRouteHostVisualState['snapPoints'];
  tabOverlaySnapRequest: Exclude<OverlaySheetSnap, 'hidden'> | null;
  setBookmarksSheetSnap: (next: React.SetStateAction<OverlaySheetSnap>) => void;
  setTabOverlaySnapRequest: (
    next: React.SetStateAction<Exclude<OverlaySheetSnap, 'hidden'> | null>
  ) => void;
  transitionController: SearchRouteOverlayTransitionController;
};

const buildShellSnapRequest = (
  snap: OverlaySheetSnap | null | undefined
): OverlaySheetSnapRequest | null => (snap ? { snap, token: null } : null);

export const useSearchRouteBookmarksSceneDefinition = ({
  mounted,
  visible,
  rootOverlayKey,
  navBarTop,
  searchBarTop,
  snapPoints,
  tabOverlaySnapRequest,
  setBookmarksSheetSnap,
  setTabOverlaySnapRequest,
  transitionController,
}: UseSearchRouteBookmarksPanelSpecArgs): SearchRouteSceneDefinition => {
  const tabOverlaySnapRequestRef = React.useRef(tabOverlaySnapRequest);
  React.useEffect(() => {
    tabOverlaySnapRequestRef.current = tabOverlaySnapRequest;
  }, [tabOverlaySnapRequest]);

  const handleBookmarksSnapChange = React.useCallback(
    (snap: OverlaySheetSnap) => {
      setBookmarksSheetSnap(snap);
      if (tabOverlaySnapRequestRef.current && tabOverlaySnapRequestRef.current === snap) {
        setTabOverlaySnapRequest(null);
      }
      if (
        snap === 'hidden' &&
        rootOverlayKey === 'bookmarks' &&
        !transitionController.isOverlaySwitchInFlight()
      ) {
        setTabOverlaySnapRequest(null);
        unstable_batchedUpdates(() => {
          requestSearchRouteDockedRestore({ snap: 'collapsed' });
          appOverlayRouteController.setRootRoute('search');
        });
      }
    },
    [rootOverlayKey, setBookmarksSheetSnap, setTabOverlaySnapRequest, transitionController]
  );

  const activeShellSnapRequest = React.useMemo(
    () => (visible ? buildShellSnapRequest(tabOverlaySnapRequest) : null),
    [tabOverlaySnapRequest, visible]
  );

  return useBookmarksSceneDefinition({
    mounted,
    visible,
    navBarTop,
    searchBarTop,
    snapPoints,
    onSnapChange: handleBookmarksSnapChange,
    shellSnapRequest: activeShellSnapRequest,
  });
};
