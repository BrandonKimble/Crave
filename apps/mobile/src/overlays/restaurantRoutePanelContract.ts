import type { AnimatedStyle as ReanimatedAnimatedStyle } from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';

import type { RestaurantProfileShellData } from '../navigation/runtime/app-route-profile-transition-state-contract';

export type RestaurantOverlayData = RestaurantProfileShellData;

type AnimatedStyle = ReanimatedAnimatedStyle<ViewStyle>;

// F4507: both of these carried an `onToggleFavorite` slot, threaded end to end and
// originated by nothing. The heart used to route through this lane and now calls
// useFavoriteHeart directly (RestaurantPanel records the re-route in its own comment);
// the slot outlived its caller and was kept alive only by a spec asserting that a dead
// function's identity survived a swap.
export type RestaurantRoutePanelContract = {
  data: RestaurantOverlayData | null;
  onRequestClose: () => void;
};

export type RestaurantRoutePanelDraft = {
  data: RestaurantOverlayData | null;
};

export type RestaurantRoutePanelHostConfig = {
  shouldFreezeContent?: boolean;
  interactionEnabled?: boolean;
  containerStyle?: AnimatedStyle;
};

export const createRestaurantRoutePanelDraft = ({
  data,
}: {
  data: RestaurantOverlayData | null;
}): RestaurantRoutePanelDraft => ({
  data,
});

export const createRestaurantRoutePanelContract = ({
  data,
  onRequestClose,
}: RestaurantRoutePanelDraft & {
  onRequestClose: () => void;
}): RestaurantRoutePanelContract => ({
  data,
  onRequestClose,
});

export const createRestaurantRoutePanelHostConfig = ({
  shouldFreezeContent,
  interactionEnabled,
  containerStyle,
}: RestaurantRoutePanelHostConfig): RestaurantRoutePanelHostConfig => ({
  shouldFreezeContent,
  interactionEnabled,
  containerStyle,
});
