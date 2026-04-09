import React from 'react';

import type {
  SearchRouteOverlayActiveSheetSpec,
  SearchRouteOverlaySheetVisibilityState,
} from './searchResolvedRouteHostModelContract';
import type { OverlayContentSpec, OverlayKey } from './types';

type FrozenOverlaySheetProps = {
  overlaySheetKey: OverlayKey | null;
  overlaySheetSpec: OverlayContentSpec<unknown> | null;
  overlaySheetVisible: boolean;
  overlaySheetApplyNavBarCutout: boolean;
};

type UseSearchRouteFrozenOverlaySheetPropsArgs = {
  shouldFreezeOverlaySheetForCloseHandoff: boolean;
  activeSheetSpec: SearchRouteOverlayActiveSheetSpec;
  visibilityState: SearchRouteOverlaySheetVisibilityState;
};

export const useSearchRouteFrozenOverlaySheetProps = ({
  shouldFreezeOverlaySheetForCloseHandoff,
  activeSheetSpec,
  visibilityState,
}: UseSearchRouteFrozenOverlaySheetPropsArgs): FrozenOverlaySheetProps => {
  const frozenOverlaySheetPropsRef = React.useRef<FrozenOverlaySheetProps | null>(null);
  const nextOverlaySheetProps = {
    overlaySheetKey: activeSheetSpec.overlaySheetKey,
    overlaySheetSpec: visibilityState.overlaySheetSpec,
    overlaySheetVisible: visibilityState.overlaySheetVisible,
    overlaySheetApplyNavBarCutout: visibilityState.overlaySheetApplyNavBarCutout,
  };

  if (!shouldFreezeOverlaySheetForCloseHandoff || !frozenOverlaySheetPropsRef.current) {
    frozenOverlaySheetPropsRef.current = nextOverlaySheetProps;
  }

  return shouldFreezeOverlaySheetForCloseHandoff && frozenOverlaySheetPropsRef.current
    ? frozenOverlaySheetPropsRef.current
    : nextOverlaySheetProps;
};
