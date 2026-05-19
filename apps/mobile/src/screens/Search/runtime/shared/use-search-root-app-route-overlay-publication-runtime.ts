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
    publicationLane.publishOverlayChromeHostSnapshot(
      overlayHostRuntimeSlice.overlayChromeHostSnapshot
    );
  }, [overlayHostRuntimeSlice.overlayChromeHostSnapshot, publicationLane]);

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
