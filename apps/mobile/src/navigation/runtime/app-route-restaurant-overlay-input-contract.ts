import type { SharedValue } from 'react-native-reanimated';

const NOOP = (): void => undefined;

export type AppOverlayRestaurantInputs = {
  suggestionProgress: SharedValue<number> | null;
  shouldSuppressRestaurantOverlay: boolean;
  shouldFreezeRestaurantPanelContent: boolean;
  shouldEnableRestaurantOverlayInteraction: boolean;
  closeRestaurantProfile: () => void;
};

export const EMPTY_APP_OVERLAY_RESTAURANT_INPUTS: AppOverlayRestaurantInputs = {
  suggestionProgress: null,
  shouldSuppressRestaurantOverlay: false,
  shouldFreezeRestaurantPanelContent: false,
  shouldEnableRestaurantOverlayInteraction: false,
  closeRestaurantProfile: NOOP,
};
