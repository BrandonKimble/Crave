import type { SearchRouteHostVisualState } from './searchRouteHostVisualState';
import type {
  ResolvedSearchRouteHostModel,
  SearchRouteResolvedHostInput,
} from './searchResolvedRouteHostModelContract';
import { EMPTY_SEARCH_ROUTE_VISUAL_STATE } from './searchResolvedRouteHostModelContract';
import { useSearchRouteFrozenOverlaySheetProps } from './useSearchRouteFrozenOverlaySheetProps';
import { useSearchRouteOverlayHeaderActionMode } from './useSearchRouteOverlayHeaderActionMode';
import type { OverlaySceneRegistrySpec } from './types';

type UseSearchRouteFrozenOverlayRenderModelArgs = {
  publishedVisualState: SearchRouteHostVisualState | null;
  searchHeaderActionResetToken: number;
  shouldFreezeOverlaySheetForRender: boolean;
  shouldFreezeOverlaySheetForCloseHandoff: boolean;
  shouldFreezeOverlayHeaderActionForRunOne: boolean;
  hostRenderInput: SearchRouteResolvedHostInput;
};

export const useSearchRouteFrozenOverlayRenderModel = ({
  publishedVisualState,
  searchHeaderActionResetToken,
  shouldFreezeOverlaySheetForRender,
  shouldFreezeOverlaySheetForCloseHandoff,
  shouldFreezeOverlayHeaderActionForRunOne,
  hostRenderInput,
}: UseSearchRouteFrozenOverlayRenderModelArgs): ResolvedSearchRouteHostModel | null => {
  const visualState = publishedVisualState ?? EMPTY_SEARCH_ROUTE_VISUAL_STATE;
  const overlaySheetPropsForRender = useSearchRouteFrozenOverlaySheetProps({
    shouldFreezeOverlaySheetForRender,
    nextOverlaySheetProps: hostRenderInput,
  });
  const activeSceneKey = overlaySheetPropsForRender.activeSceneKey;
  const activeShellSpec = overlaySheetPropsForRender.activeShellSpec;
  const overlayHeaderActionModeForRender = useSearchRouteOverlayHeaderActionMode({
    searchHeaderActionResetToken,
    shouldFreezeOverlaySheetForCloseHandoff,
    shouldFreezeOverlayHeaderActionForRunOne,
    overlaySheetKey: activeSceneKey,
  });

  if (!publishedVisualState || !activeShellSpec || !activeSceneKey) {
    return null;
  }

  const activeSceneSpec: OverlaySceneRegistrySpec = {
    ...activeShellSpec,
    surfaceKind: 'scene-registry',
    activeSceneKey,
    sceneKeys: overlaySheetPropsForRender.sceneKeys,
  };

  return {
    activeSceneKey,
    activeSceneSpec,
    overlaySheetVisible: overlaySheetPropsForRender.overlaySheetVisible,
    overlaySheetApplyNavBarCutout: overlaySheetPropsForRender.overlaySheetApplyNavBarCutout,
    overlayHeaderActionMode: overlayHeaderActionModeForRender,
    searchInteractionRef: overlaySheetPropsForRender.searchInteractionRef,
    visualState,
  };
};
