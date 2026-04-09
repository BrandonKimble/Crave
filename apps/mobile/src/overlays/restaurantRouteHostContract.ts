import type { SharedValue } from 'react-native-reanimated';

import type {
  RestaurantRoutePanelContract,
  RestaurantRoutePanelHostConfig,
} from './restaurantRoutePanelContract';
import { createRestaurantRoutePanelContract } from './restaurantRoutePanelContract';
import type { SearchRouteHostVisualState } from './searchRouteHostVisualState';
import type { BottomSheetProgrammaticRuntimeModel } from './useBottomSheetRuntime';
import type { OverlayHeaderActionMode } from './useOverlayHeaderActionController';

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

export type RestaurantRouteHostState = {
  hostConfig: RestaurantRoutePanelHostConfig | null;
  presentationState: RestaurantRouteHostPresentationState;
  snapController: RestaurantRouteHostSnapController;
  navBarTop: number;
  searchBarTop: number;
  headerActionProgress?: SharedValue<number>;
  headerActionMode: OverlayHeaderActionMode;
  navBarHeight: number;
  applyNavBarCutout: boolean;
  navBarCutoutProgress?: SharedValue<number>;
  navBarHiddenTranslateY: number;
  navBarCutoutIsHiding: boolean;
};

export type RestaurantRouteHostModel = {
  panel: RestaurantRoutePanelContract;
  hostState: RestaurantRouteHostState;
};

export type GlobalRestaurantRoutePublication = {
  sessionToken: number;
  panel: RestaurantRoutePanelContract;
};

export const createRestaurantRouteHostState = ({
  hostConfig,
  presentationState,
  snapController,
  navBarTop = 0,
  searchBarTop = 0,
  headerActionProgress,
  headerActionMode = 'fixed-close',
  navBarHeight = 0,
  applyNavBarCutout = false,
  navBarCutoutProgress,
  navBarHiddenTranslateY = 0,
  navBarCutoutIsHiding = false,
}: {
  hostConfig: RestaurantRoutePanelHostConfig | null;
  presentationState: RestaurantRouteHostPresentationState;
  snapController: RestaurantRouteHostSnapController;
  navBarTop?: number;
  searchBarTop?: number;
  headerActionProgress?: SharedValue<number>;
  headerActionMode?: OverlayHeaderActionMode;
  navBarHeight?: number;
  applyNavBarCutout?: boolean;
  navBarCutoutProgress?: SharedValue<number>;
  navBarHiddenTranslateY?: number;
  navBarCutoutIsHiding?: boolean;
}): RestaurantRouteHostState => ({
  hostConfig,
  presentationState,
  snapController,
  navBarTop,
  searchBarTop,
  headerActionProgress,
  headerActionMode,
  navBarHeight,
  applyNavBarCutout,
  navBarCutoutProgress,
  navBarHiddenTranslateY,
  navBarCutoutIsHiding,
});

export const createRestaurantRouteHostModel = ({
  panel,
  hostState,
}: {
  panel: RestaurantRoutePanelContract;
  hostState: RestaurantRouteHostState;
}): RestaurantRouteHostModel => ({
  panel,
  hostState,
});

export const createGlobalRestaurantRoutePublication = ({
  sessionToken,
  panel,
  onRequestClose,
}: {
  sessionToken: number;
  panel: Parameters<typeof createRestaurantRoutePanelContract>[0];
  onRequestClose: () => void;
}): GlobalRestaurantRoutePublication => ({
  sessionToken,
  panel: createRestaurantRoutePanelContract({
    ...panel,
    onRequestClose,
  }),
});
