import type { SharedValue } from 'react-native-reanimated';

const NOOP = (): void => undefined;
const NOOP_TOGGLE_FAVORITE = (_id: string): void => undefined;

export type AppOverlayRestaurantInputs = {
  suggestionProgress: SharedValue<number> | null;
  shouldSuppressRestaurantOverlay: boolean;
  shouldFreezeRestaurantPanelContent: boolean;
  shouldEnableRestaurantOverlayInteraction: boolean;
  onToggleFavorite: (id: string, locationId?: string | null) => void;
  closeRestaurantProfile: () => void;
};

export const EMPTY_APP_OVERLAY_RESTAURANT_INPUTS: AppOverlayRestaurantInputs = {
  suggestionProgress: null,
  shouldSuppressRestaurantOverlay: false,
  shouldFreezeRestaurantPanelContent: false,
  shouldEnableRestaurantOverlayInteraction: false,
  onToggleFavorite: NOOP_TOGGLE_FAVORITE,
  closeRestaurantProfile: NOOP,
};
