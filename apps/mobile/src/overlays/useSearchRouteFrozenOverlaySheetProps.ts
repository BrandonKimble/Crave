import React from 'react';

import type { SearchRouteResolvedHostInput } from './searchResolvedRouteHostModelContract';

type UseSearchRouteFrozenOverlaySheetPropsArgs = {
  shouldFreezeOverlaySheetForRender: boolean;
  nextOverlaySheetProps: SearchRouteResolvedHostInput;
};

export const useSearchRouteFrozenOverlaySheetProps = ({
  shouldFreezeOverlaySheetForRender,
  nextOverlaySheetProps,
}: UseSearchRouteFrozenOverlaySheetPropsArgs): SearchRouteResolvedHostInput => {
  const frozenOverlaySheetPropsRef = React.useRef<SearchRouteResolvedHostInput | null>(null);

  if (
    !shouldFreezeOverlaySheetForRender ||
    !frozenOverlaySheetPropsRef.current ||
    frozenOverlaySheetPropsRef.current.activeSceneKey !== nextOverlaySheetProps.activeSceneKey
  ) {
    frozenOverlaySheetPropsRef.current = nextOverlaySheetProps;
  }

  return shouldFreezeOverlaySheetForRender && frozenOverlaySheetPropsRef.current
    ? frozenOverlaySheetPropsRef.current
    : nextOverlaySheetProps;
};
