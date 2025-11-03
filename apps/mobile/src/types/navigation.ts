import type { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Discover: undefined;
  Explore: { initialQuery?: string; initialPage?: number } | undefined;
  Saved: undefined;
  Account: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<MainTabParamList>;
  Details: {
    restaurantId: string;
    restaurantName: string;
    page?: number;
    highlightFoodId?: string;
  };
};
