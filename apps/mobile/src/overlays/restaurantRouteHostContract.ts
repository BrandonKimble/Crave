import type { SharedValue } from 'react-native-reanimated';

import type { OverlayContentSpec, OverlayKey } from './types';
import type { SearchRouteHostVisualState } from './searchRouteHostVisualState';
import type { BottomSheetProgrammaticRuntimeModel } from './useBottomSheetRuntime';
import type { OverlayHeaderActionMode } from './useOverlayHeaderActionController';

export type RestaurantRouteSource = 'search' | 'global';

export type RestaurantRouteHostVisualState = Pick<
  SearchRouteHostVisualState,
  | 'sheetTranslateY'
  | 'resultsScrollOffset'
  | 'resultsMomentum'
  | 'overlayHeaderActionProgress'
  | 'navBarTopForSnaps'
  | 'searchBarTop'
  | 'navBarCutoutHeight'
  | 'bottomNavHiddenTranslateY'
>;

export type RestaurantRouteHostPresentationState =
  BottomSheetProgrammaticRuntimeModel['presentationState'];

export type RestaurantRouteHostSnapController =
  BottomSheetProgrammaticRuntimeModel['snapController'];

export type {
  RestaurantRoutePanelContract,
  RestaurantRoutePanelHostConfig,
} from './restaurantRoutePanelContract';

export type RestaurantRouteLayerPresentationModel = {
  restaurantRouteSource: RestaurantRouteSource;
  visible: boolean;
  spec: OverlayContentSpec<unknown> | null;
  activeOverlayRouteKey: OverlayKey;
  rootOverlayKey: OverlayKey;
  overlayRouteStackLength: number;
  presentationState: RestaurantRouteHostPresentationState;
  snapController: RestaurantRouteHostSnapController;
  headerActionProgress?: SharedValue<number>;
  headerActionMode: OverlayHeaderActionMode;
  navBarHeight: number;
  applyNavBarCutout: boolean;
  navBarCutoutProgress?: SharedValue<number>;
  navBarHiddenTranslateY: number;
  navBarCutoutIsHiding: boolean;
};

export type { RestaurantRoutePanelDraft } from './restaurantRoutePanelContract';
