import type { Coordinate } from './search';
import type { RecentSearch, RecentlyViewedRestaurant } from '../services/search';

export type MainSearchIntent =
  | { type: 'recentSearch'; entry: RecentSearch }
  | { type: 'recentlyViewed'; restaurant: RecentlyViewedRestaurant };

export type RootStackParamList = {
  Onboarding: undefined;
  SignIn: undefined;
  Main: { searchIntent?: MainSearchIntent } | undefined;
  Profile: undefined;
  RecentSearches: { userLocation?: Coordinate | null } | undefined;
  RecentlyViewed: { userLocation?: Coordinate | null } | undefined;
  FavoritesListDetail: { listId: string };
};
