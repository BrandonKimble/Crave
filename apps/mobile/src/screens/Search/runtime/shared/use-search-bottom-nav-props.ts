import React from 'react';

import type { SearchBottomNavProps } from '../../components/SearchBottomNav';

const SEARCH_BOTTOM_NAV_ITEMS: SearchBottomNavProps['navItems'] = [
  { key: 'search', label: 'Search' },
  { key: 'polls', label: 'Polls' },
  { key: 'bookmarks', label: 'Favorites' },
  { key: 'profile', label: 'Profile' },
];

type UseSearchBottomNavPropsArgs = Omit<SearchBottomNavProps, 'navItems'>;

export const useSearchBottomNavProps = ({
  bottomNavAnimatedStyle,
  shouldHideBottomNav,
  bottomInset,
  handleBottomNavLayout,
  shouldDisableSearchBlur,
  rootOverlay,
  navIconRenderers,
  handleProfilePress,
  handleOverlaySelect,
  bottomNavItemVisibilityAnimatedStyle,
}: UseSearchBottomNavPropsArgs): SearchBottomNavProps =>
  React.useMemo(
    () => ({
      bottomNavAnimatedStyle,
      shouldHideBottomNav,
      bottomInset,
      handleBottomNavLayout,
      shouldDisableSearchBlur,
      navItems: SEARCH_BOTTOM_NAV_ITEMS,
      rootOverlay,
      navIconRenderers,
      handleProfilePress,
      handleOverlaySelect,
      bottomNavItemVisibilityAnimatedStyle,
    }),
    [
      bottomInset,
      bottomNavAnimatedStyle,
      bottomNavItemVisibilityAnimatedStyle,
      handleBottomNavLayout,
      handleOverlaySelect,
      handleProfilePress,
      navIconRenderers,
      rootOverlay,
      shouldDisableSearchBlur,
      shouldHideBottomNav,
    ]
  );
