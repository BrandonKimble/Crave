import { create } from 'zustand';

import type {
  GlobalRestaurantRoutePublication,
  RestaurantRouteHostModel,
} from './restaurantRouteHostContract';

type RestaurantRouteRuntimeState = {
  globalRestaurantRoutePublication: GlobalRestaurantRoutePublication | null;
  publishedRestaurantRouteHostModel: RestaurantRouteHostModel | null;
  publishGlobalRestaurantRoutePublication: (
    publication: GlobalRestaurantRoutePublication | null
  ) => void;
  clearGlobalRestaurantRoutePublication: (sessionToken?: number | null) => void;
  publishRestaurantRouteHostModel: (model: RestaurantRouteHostModel | null) => void;
};

const isRestaurantRouteHostModelEqual = (
  left: RestaurantRouteHostModel | null,
  right: RestaurantRouteHostModel | null
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.panel === right.panel &&
    left.hostState.hostConfig?.shouldFreezeContent ===
      right.hostState.hostConfig?.shouldFreezeContent &&
    left.hostState.hostConfig?.interactionEnabled ===
      right.hostState.hostConfig?.interactionEnabled &&
    left.hostState.hostConfig?.containerStyle === right.hostState.hostConfig?.containerStyle &&
    left.hostState.presentationState.sheetY === right.hostState.presentationState.sheetY &&
    left.hostState.presentationState.scrollOffset ===
      right.hostState.presentationState.scrollOffset &&
    left.hostState.presentationState.momentumFlag ===
      right.hostState.presentationState.momentumFlag &&
    left.hostState.snapController === right.hostState.snapController &&
    left.hostState.navBarTop === right.hostState.navBarTop &&
    left.hostState.searchBarTop === right.hostState.searchBarTop &&
    left.hostState.headerActionProgress === right.hostState.headerActionProgress &&
    left.hostState.headerActionMode === right.hostState.headerActionMode &&
    left.hostState.navBarHeight === right.hostState.navBarHeight &&
    left.hostState.applyNavBarCutout === right.hostState.applyNavBarCutout &&
    left.hostState.navBarCutoutProgress === right.hostState.navBarCutoutProgress &&
    left.hostState.navBarHiddenTranslateY === right.hostState.navBarHiddenTranslateY &&
    left.hostState.navBarCutoutIsHiding === right.hostState.navBarCutoutIsHiding);

export const useRestaurantRouteRuntimeStore = create<RestaurantRouteRuntimeState>((set) => ({
  globalRestaurantRoutePublication: null,
  publishedRestaurantRouteHostModel: null,
  publishGlobalRestaurantRoutePublication: (publication) =>
    set({ globalRestaurantRoutePublication: publication }),
  clearGlobalRestaurantRoutePublication: (sessionToken) =>
    set((state) => {
      if (
        (sessionToken != null &&
          state.globalRestaurantRoutePublication != null &&
          state.globalRestaurantRoutePublication.sessionToken !== sessionToken) ||
        state.globalRestaurantRoutePublication == null
      ) {
        return state;
      }
      return {
        globalRestaurantRoutePublication: null,
      };
    }),
  publishRestaurantRouteHostModel: (model) =>
    set((state) =>
      isRestaurantRouteHostModelEqual(state.publishedRestaurantRouteHostModel, model)
        ? state
        : {
            ...state,
            publishedRestaurantRouteHostModel: model,
          }
    ),
}));
