import React from 'react';

import type { OverlayKey } from './types';
import type { OverlayHeaderActionMode } from './useOverlayHeaderActionController';

type UseSearchRouteOverlayHeaderActionModeArgs = {
  searchHeaderActionResetToken: number;
  shouldFreezeOverlaySheetForCloseHandoff: boolean;
  shouldFreezeOverlayHeaderActionForRunOne: boolean;
  overlaySheetKey: OverlayKey | null;
};

export const useSearchRouteOverlayHeaderActionMode = ({
  searchHeaderActionResetToken,
  shouldFreezeOverlaySheetForCloseHandoff,
  shouldFreezeOverlayHeaderActionForRunOne,
  overlaySheetKey,
}: UseSearchRouteOverlayHeaderActionModeArgs): OverlayHeaderActionMode => {
  const frozenOverlayHeaderActionModeRef = React.useRef<OverlayHeaderActionMode | null>(null);
  const [searchHeaderActionModeOverride, setSearchHeaderActionModeOverride] =
    React.useState<OverlayHeaderActionMode | null>(null);

  React.useEffect(() => {
    if (searchHeaderActionResetToken === 0) {
      return;
    }
    setSearchHeaderActionModeOverride('follow-collapse');
  }, [searchHeaderActionResetToken]);

  React.useEffect(() => {
    if (overlaySheetKey === 'search') {
      return;
    }
    if (searchHeaderActionModeOverride !== null) {
      setSearchHeaderActionModeOverride(null);
    }
  }, [overlaySheetKey, searchHeaderActionModeOverride]);

  const overlayHeaderActionMode: OverlayHeaderActionMode =
    overlaySheetKey === 'polls'
      ? 'follow-collapse'
      : overlaySheetKey === 'search'
      ? searchHeaderActionModeOverride ?? 'fixed-close'
      : 'fixed-close';

  const shouldFreezeOverlayHeaderAction =
    shouldFreezeOverlayHeaderActionForRunOne || shouldFreezeOverlaySheetForCloseHandoff;

  if (!shouldFreezeOverlayHeaderAction || frozenOverlayHeaderActionModeRef.current == null) {
    frozenOverlayHeaderActionModeRef.current = overlayHeaderActionMode;
  }

  return shouldFreezeOverlayHeaderAction
    ? frozenOverlayHeaderActionModeRef.current ?? overlayHeaderActionMode
    : overlayHeaderActionMode;
};
