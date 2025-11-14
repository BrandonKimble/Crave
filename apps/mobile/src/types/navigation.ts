import type { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Search: undefined;
  Polls: undefined;
  Bookmarks: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Onboarding: undefined;
  Tabs: NavigatorScreenParams<MainTabParamList>;
};
