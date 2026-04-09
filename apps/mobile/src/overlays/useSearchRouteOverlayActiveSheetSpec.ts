import React from 'react';

import type {
  SearchRouteOverlayActiveSheetSpec,
  SearchRouteOverlaySheetKeys,
} from './searchResolvedRouteHostModelContract';
import type { SearchRoutePanelInteractionRef } from './searchOverlayRouteHostContract';
import type { OverlayContentSpec } from './types';

type UseSearchRouteOverlayActiveSheetSpecArgs = {
  overlaySheetKeys: SearchRouteOverlaySheetKeys;
  searchPanelSpec: OverlayContentSpec<unknown> | null;
  searchPanelInteractionRef: SearchRoutePanelInteractionRef | null;
  pollsPanelSpec: OverlayContentSpec<unknown> | null;
  pollCreationPanelSpec: OverlayContentSpec<unknown> | null;
  bookmarksPanelSpec: OverlayContentSpec<unknown> | null;
  profilePanelSpec: OverlayContentSpec<unknown> | null;
  saveListPanelSpec: OverlayContentSpec<unknown> | null;
};

export const useSearchRouteOverlayActiveSheetSpec = ({
  overlaySheetKeys,
  searchPanelSpec,
  searchPanelInteractionRef,
  pollsPanelSpec,
  pollCreationPanelSpec,
  bookmarksPanelSpec,
  profilePanelSpec,
  saveListPanelSpec,
}: UseSearchRouteOverlayActiveSheetSpecArgs): SearchRouteOverlayActiveSheetSpec =>
  React.useMemo(() => {
    const { overlaySheetKey } = overlaySheetKeys;

    const overlaySheetSpec =
      overlaySheetKey === 'search' && searchPanelSpec
        ? searchPanelSpec
        : overlaySheetKey === 'polls'
        ? pollsPanelSpec
        : overlaySheetKey === 'bookmarks'
        ? bookmarksPanelSpec
        : overlaySheetKey === 'profile'
        ? profilePanelSpec
        : overlaySheetKey === 'saveList'
        ? saveListPanelSpec
        : overlaySheetKey === 'pollCreation'
        ? pollCreationPanelSpec
        : null;

    return {
      overlaySheetKey,
      overlaySheetSpec,
      searchInteractionRef: overlaySheetKey === 'search' ? searchPanelInteractionRef : null,
    };
  }, [
    bookmarksPanelSpec,
    overlaySheetKeys,
    pollCreationPanelSpec,
    pollsPanelSpec,
    profilePanelSpec,
    saveListPanelSpec,
    searchPanelInteractionRef,
    searchPanelSpec,
  ]);
