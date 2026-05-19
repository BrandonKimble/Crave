import type { SearchBottomNavProps } from '../../components/SearchBottomNav';

export type SearchBottomNavVisualInputs = Pick<
  SearchBottomNavProps,
  | 'bottomNavMotionRuntime'
  | 'shouldHideBottomNav'
  | 'bottomInset'
  | 'handleBottomNavLayout'
> | null;

export const EMPTY_SEARCH_BOTTOM_NAV_VISUAL_INPUTS: SearchBottomNavVisualInputs = null;
