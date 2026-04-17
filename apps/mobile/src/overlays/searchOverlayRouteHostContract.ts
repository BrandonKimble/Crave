import type React from 'react';
import type { BottomSheetSceneSurfaceProps } from './bottomSheetWithFlashListContract';
import type {
  OverlayContentSpec,
  OverlaySceneRegistrySpec,
  OverlaySheetSnapRequest,
} from './types';
import type { SearchInteractionSnapshot } from '../screens/Search/context/SearchInteractionContext';
import type { UsePollsPanelSpecOptions } from './panels/runtime/polls-panel-runtime-contract';
import type { Coordinate } from '../types';

export type { SearchRouteHostVisualState } from './searchRouteHostVisualState';

export type SearchRoutePanelInteractionRef = React.MutableRefObject<SearchInteractionSnapshot>;
export type SearchRouteSceneShellSpec = Omit<
  OverlaySceneRegistrySpec,
  'surfaceKind' | 'activeSceneKey' | 'sceneKeys' | 'shellSnapRequest'
>;
export type SearchRouteSceneDefinition = {
  shellSpec: SearchRouteSceneShellSpec;
  sceneSurface?: BottomSheetSceneSurfaceProps<unknown> | null;
  shellSnapRequest?: OverlaySheetSnapRequest | null;
};
export type SearchRoutePollsPanelInputs = {
  pollBounds: UsePollsPanelSpecOptions['bounds'];
  startupPollsSnapshot: UsePollsPanelSpecOptions['bootstrapSnapshot'];
  userLocation: Coordinate | null;
  interactionRef?: SearchRoutePanelInteractionRef | null;
};

const splitSearchRouteSceneSpec = <T>(spec: OverlayContentSpec<T>): SearchRouteSceneDefinition => {
  const {
    overlayKey,
    semanticOverlayKey,
    shellIdentityKey,
    sceneIdentityKey,
    snapPoints,
    snapPersistenceKey,
    renderWrapper,
    nativeHostKey,
    listScrollEnabled,
    initialSnapPoint,
    preservePositionOnSnapPointsChange,
    onHidden,
    onSnapStart,
    onSnapChange,
    onDragStateChange,
    onSettleStateChange,
    runtimeModel,
    dismissThreshold,
    preventSwipeDismiss,
    interactionEnabled,
    animateOnMount,
    style,
    surfaceStyle,
    shadowStyle,
    underlayComponent,
    ...sceneSurfaceRest
  } = spec as OverlayContentSpec<unknown>;

  return {
    shellSpec: {
      overlayKey,
      semanticOverlayKey,
      shellIdentityKey,
      sceneIdentityKey,
      snapPoints,
      snapPersistenceKey,
      renderWrapper,
      nativeHostKey,
      listScrollEnabled,
      initialSnapPoint,
      preservePositionOnSnapPointsChange,
      onHidden,
      onSnapStart,
      onSnapChange,
      onDragStateChange,
      onSettleStateChange,
      runtimeModel,
      dismissThreshold,
      preventSwipeDismiss,
      interactionEnabled,
      animateOnMount,
      style,
      surfaceStyle,
      shadowStyle,
    },
    sceneSurface: {
      ...sceneSurfaceRest,
      underlayComponent,
    } as BottomSheetSceneSurfaceProps<unknown>,
    shellSnapRequest: spec.shellSnapRequest ?? null,
  };
};

export const coerceSearchRouteSceneDefinition = <T>(
  spec: OverlayContentSpec<T> | null
): SearchRouteSceneDefinition | null => (spec ? splitSearchRouteSceneSpec(spec) : null);

export const EMPTY_SEARCH_ROUTE_SCENE_DEFINITION: SearchRouteSceneDefinition | null = null;
export const EMPTY_SEARCH_ROUTE_PANEL_INTERACTION_REF: SearchRoutePanelInteractionRef | null = null;

export const EMPTY_SEARCH_ROUTE_DOCKED_POLLS_PANEL_INPUTS: SearchRoutePollsPanelInputs | null =
  null;

export type SearchRouteOverlayRenderPolicy = {
  shouldShowSearchPanel: boolean;
  shouldShowDockedPollsPanel: boolean;
  shouldFreezeOverlaySheetForCloseHandoff: boolean;
  shouldFreezeOverlayHeaderActionForRunOne: boolean;
  shouldSuppressSearchAndTabSheetsForForegroundEditing: boolean;
  shouldSuppressTabSheetsForSuggestions: boolean;
};

export const EMPTY_SEARCH_ROUTE_OVERLAY_RENDER_POLICY: SearchRouteOverlayRenderPolicy = {
  shouldShowSearchPanel: false,
  shouldShowDockedPollsPanel: false,
  shouldFreezeOverlaySheetForCloseHandoff: false,
  shouldFreezeOverlayHeaderActionForRunOne: false,
  shouldSuppressSearchAndTabSheetsForForegroundEditing: false,
  shouldSuppressTabSheetsForSuggestions: false,
};
