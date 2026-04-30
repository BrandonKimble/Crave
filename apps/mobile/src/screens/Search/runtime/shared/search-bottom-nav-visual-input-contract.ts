import type { SearchBottomNavProps } from '../../components/SearchBottomNav';

export type SearchBottomNavVisualInputs = Pick<
  SearchBottomNavProps,
  | 'bottomNavAnimatedStyle'
  | 'shouldHideBottomNav'
  | 'bottomInset'
  | 'handleBottomNavLayout'
  | 'bottomNavItemVisibilityAnimatedStyle'
> | null;

export const EMPTY_SEARCH_BOTTOM_NAV_VISUAL_INPUTS: SearchBottomNavVisualInputs = null;
