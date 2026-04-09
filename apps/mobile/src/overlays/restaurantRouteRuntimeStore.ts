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
    set({
      publishedRestaurantRouteHostModel: model,
    }),
}));
