import React from 'react';

import type { SearchRouteOverlayRenderPolicy } from './searchOverlayRouteHostContract';
import type {
  SearchRouteOverlayActiveSheetSpec,
  SearchRouteOverlaySheetKeys,
  SearchRouteOverlaySheetVisibilityState,
} from './searchResolvedRouteHostModelContract';

type UseSearchRouteOverlaySheetVisibilityStateArgs = {
  renderPolicy: SearchRouteOverlayRenderPolicy;
  overlaySheetKeys: SearchRouteOverlaySheetKeys;
  activeSheetSpec: SearchRouteOverlayActiveSheetSpec;
};

export const useSearchRouteOverlaySheetVisibilityState = ({
  renderPolicy,
  overlaySheetKeys,
  activeSheetSpec,
}: UseSearchRouteOverlaySheetVisibilityStateArgs): SearchRouteOverlaySheetVisibilityState =>
  React.useMemo(() => {
    const { overlaySheetKey, resolvedOverlaySheetVisible, overlaySheetApplyNavBarCutout } =
      overlaySheetKeys;
    const {
      shouldSuppressSearchAndTabSheetsForForegroundEditing,
      shouldSuppressTabSheetsForSuggestions,
    } = renderPolicy;

    const shouldSuppressOverlaySheetForForegroundEditing =
      shouldSuppressSearchAndTabSheetsForForegroundEditing &&
      (overlaySheetKey === 'search' ||
        overlaySheetKey === 'polls' ||
        overlaySheetKey === 'bookmarks' ||
        overlaySheetKey === 'profile');
    const shouldSuppressTabOverlaySheetForSuggestions =
      shouldSuppressTabSheetsForSuggestions &&
      (overlaySheetKey === 'polls' ||
        overlaySheetKey === 'bookmarks' ||
        overlaySheetKey === 'profile');
    const shouldSuppressOverlaySheet =
      shouldSuppressOverlaySheetForForegroundEditing || shouldSuppressTabOverlaySheetForSuggestions;

    return {
      overlaySheetVisible: !shouldSuppressOverlaySheet && resolvedOverlaySheetVisible,
      overlaySheetApplyNavBarCutout,
      overlaySheetSpec: shouldSuppressOverlaySheet ? null : activeSheetSpec.overlaySheetSpec,
    };
  }, [activeSheetSpec.overlaySheetSpec, overlaySheetKeys, renderPolicy]);
