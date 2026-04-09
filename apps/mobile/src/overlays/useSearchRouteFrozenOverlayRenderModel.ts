import type { SearchRouteHostVisualState } from './searchRouteHostVisualState';
import type {
  SearchRouteOverlayActiveSheetSpec,
  ResolvedSearchRouteHostModel,
  SearchRouteOverlaySheetVisibilityState,
} from './searchResolvedRouteHostModelContract';
import { EMPTY_SEARCH_ROUTE_VISUAL_STATE } from './searchResolvedRouteHostModelContract';
import { useSearchRouteFrozenOverlaySheetProps } from './useSearchRouteFrozenOverlaySheetProps';
import { useSearchRouteOverlayHeaderActionMode } from './useSearchRouteOverlayHeaderActionMode';

type UseSearchRouteFrozenOverlayRenderModelArgs = {
  publishedVisualState: SearchRouteHostVisualState | null;
  searchHeaderActionResetToken: number;
  shouldFreezeOverlaySheetForCloseHandoff: boolean;
  shouldFreezeOverlayHeaderActionForRunOne: boolean;
  activeSheetSpec: SearchRouteOverlayActiveSheetSpec;
  visibilityState: SearchRouteOverlaySheetVisibilityState;
};

export const useSearchRouteFrozenOverlayRenderModel = ({
  publishedVisualState,
  searchHeaderActionResetToken,
  shouldFreezeOverlaySheetForCloseHandoff,
  shouldFreezeOverlayHeaderActionForRunOne,
  activeSheetSpec,
  visibilityState,
}: UseSearchRouteFrozenOverlayRenderModelArgs): ResolvedSearchRouteHostModel | null => {
  const visualState = publishedVisualState ?? EMPTY_SEARCH_ROUTE_VISUAL_STATE;
  const overlaySheetPropsForRender = useSearchRouteFrozenOverlaySheetProps({
    shouldFreezeOverlaySheetForCloseHandoff,
    activeSheetSpec,
    visibilityState,
  });
  const overlayHeaderActionModeForRender = useSearchRouteOverlayHeaderActionMode({
    searchHeaderActionResetToken,
    shouldFreezeOverlaySheetForCloseHandoff,
    shouldFreezeOverlayHeaderActionForRunOne,
    overlaySheetKey: activeSheetSpec.overlaySheetKey,
  });

  if (
    !publishedVisualState ||
    !overlaySheetPropsForRender.overlaySheetSpec ||
    !overlaySheetPropsForRender.overlaySheetKey
  ) {
    return null;
  }

  return {
    overlaySheetKey: overlaySheetPropsForRender.overlaySheetKey,
    overlaySheetSpec: overlaySheetPropsForRender.overlaySheetSpec,
    overlaySheetVisible: overlaySheetPropsForRender.overlaySheetVisible,
    overlaySheetApplyNavBarCutout: overlaySheetPropsForRender.overlaySheetApplyNavBarCutout,
    overlayHeaderActionMode: overlayHeaderActionModeForRender,
    searchInteractionRef:
      overlaySheetPropsForRender.overlaySheetKey === 'search'
        ? activeSheetSpec.searchInteractionRef
        : null,
    visualState,
  };
};
