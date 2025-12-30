import type { Coordinate } from './search';

export type RootStackParamList = {
  Onboarding: undefined;
  SignIn: undefined;
  Main: undefined;
  Profile: undefined;
  RecentSearches: { userLocation?: Coordinate | null } | undefined;
  RecentlyViewed: { userLocation?: Coordinate | null } | undefined;
  FavoritesListDetail: { listId: string };
};
