import type { AnimatedStyle as ReanimatedAnimatedStyle } from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';

import type { RestaurantProfileShellData } from '../navigation/runtime/app-route-profile-transition-state-contract';

export type RestaurantOverlayData = RestaurantProfileShellData;

type AnimatedStyle = ReanimatedAnimatedStyle<ViewStyle>;

export type RestaurantRoutePanelContract = {
  data: RestaurantOverlayData | null;
  onRequestClose: () => void;
  onToggleFavorite: (id: string) => void;
};

export type RestaurantRoutePanelDraft = {
  data: RestaurantOverlayData | null;
  onToggleFavorite: (id: string) => void;
};

export type GlobalRestaurantRouteDraft = {
  sessionToken: number;
  panelDraft: RestaurantRoutePanelDraft;
};

export type RestaurantRoutePanelHostConfig = {
  shouldFreezeContent?: boolean;
  interactionEnabled?: boolean;
  containerStyle?: AnimatedStyle;
};

export const createRestaurantRoutePanelDraft = ({
  data,
  onToggleFavorite,
}: {
  data: RestaurantOverlayData | null;
  onToggleFavorite: (id: string) => void;
}): RestaurantRoutePanelDraft => ({
  data,
  onToggleFavorite,
});

export const createRestaurantRoutePanelContract = ({
  data,
  onRequestClose,
  onToggleFavorite,
}: RestaurantRoutePanelDraft & {
  onRequestClose: () => void;
}): RestaurantRoutePanelContract => ({
  data,
  onRequestClose,
  onToggleFavorite,
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
