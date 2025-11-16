import type { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Search: undefined;
  Polls: { city?: string | null; pollId?: string | null } | undefined;
  Bookmarks: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Onboarding: undefined;
  Tabs: NavigatorScreenParams<MainTabParamList>;
};
