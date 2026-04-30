import React from 'react';

import { useAppRouteOverlayHostPublicationLane } from '../../../../navigation/runtime/AppRouteOverlayHostRuntimeProvider';
import type { SearchRoutePanelInteractionRef } from '../../../../overlays/searchOverlayRouteHostContract';
import type { SearchRootOverlayHostRuntimeParams } from './search-root-overlay-host-runtime-contract';
import { useSearchRootOverlayHostRuntime } from './use-search-root-overlay-host-runtime';

export type SearchRootAppRouteOverlayPublicationRuntimeParams =
  SearchRootOverlayHostRuntimeParams & {
    searchInteractionRef: SearchRoutePanelInteractionRef;
  };

export const useSearchRootAppRouteOverlayPublicationRuntime = ({
  searchInteractionRef,
  ...overlayHostRuntimeParams
}: SearchRootAppRouteOverlayPublicationRuntimeParams): void => {
  const publicationLane = useAppRouteOverlayHostPublicationLane();
  const overlayHostRuntimeSlice = useSearchRootOverlayHostRuntime(overlayHostRuntimeParams);

  React.useLayoutEffect(() => {
    publicationLane.publishOverlayChromeFrameSnapshot(
      overlayHostRuntimeSlice.overlayChromeFrameSnapshot
    );
  }, [overlayHostRuntimeSlice.overlayChromeFrameSnapshot, publicationLane]);

  React.useLayoutEffect(() => {
    publicationLane.publishOverlayChromeContainerSnapshot(
      overlayHostRuntimeSlice.overlayChromeContainerSnapshot
    );
  }, [overlayHostRuntimeSlice.overlayChromeContainerSnapshot, publicationLane]);

  React.useLayoutEffect(() => {
    publicationLane.publishOverlayChromeHeaderProps(
      overlayHostRuntimeSlice.overlayChromeHeaderProps
    );
  }, [overlayHostRuntimeSlice.overlayChromeHeaderProps, publicationLane]);

  React.useLayoutEffect(() => {
    publicationLane.publishOverlayChromeSuggestionSurfaceProps(
      overlayHostRuntimeSlice.overlayChromeSuggestionSurfaceProps
    );
  }, [overlayHostRuntimeSlice.overlayChromeSuggestionSurfaceProps, publicationLane]);

  React.useLayoutEffect(() => {
    publicationLane.publishOverlayGateSnapshot(overlayHostRuntimeSlice.overlayGateSnapshot);
  }, [overlayHostRuntimeSlice.overlayGateSnapshot, publicationLane]);

  React.useLayoutEffect(() => {
    publicationLane.publishOverlayShellSnapshot(overlayHostRuntimeSlice.overlayShellSnapshot);
  }, [overlayHostRuntimeSlice.overlayShellSnapshot, publicationLane]);

  React.useLayoutEffect(() => {
    publicationLane.publishOverlayRestaurantHostAuthorities({
      overlayLocalRestaurantSheetHostAuthority:
        overlayHostRuntimeSlice.overlayLocalRestaurantSheetHostAuthority,
    });
  }, [overlayHostRuntimeSlice.overlayLocalRestaurantSheetHostAuthority, publicationLane]);

  React.useLayoutEffect(() => {
    publicationLane.publishSearchInteractionRef(searchInteractionRef);

    return () => {
      publicationLane.clearSearchOverlayHostPublication();
    };
  }, [publicationLane, searchInteractionRef]);
};
