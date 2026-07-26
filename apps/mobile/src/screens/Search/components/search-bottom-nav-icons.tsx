import React from 'react';
import { Heart } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';

export type SearchBottomNavItemKey = 'search' | 'polls' | 'lists' | 'profile';

export const SEARCH_BOTTOM_NAV_ICON_RENDERERS: Record<
  SearchBottomNavItemKey,
  (color: string, active: boolean) => React.ReactNode
> = {
  // The root tab is the app's HOME page (map + search + docked home surface):
  // a heroicons house — solid when active (matching the profile tab's pattern).
  search: (color: string, active: boolean) => {
    if (active) {
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24" fill={color} stroke="none">
          <Path d="M11.47 3.841a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 1 0 1.06-1.061l-8.689-8.69a2.25 2.25 0 0 0-3.182 0l-8.69 8.69a.75.75 0 1 0 1.061 1.06l8.69-8.689Z" />
          <Path d="m12 5.432 8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 0-.75-.75h-3a.75.75 0 0 0-.75.75V21a.75.75 0 0 1-.75.75H5.625a1.875 1.875 0 0 1-1.875-1.875v-6.198a2.29 2.29 0 0 0 .091-.086L12 5.432Z" />
        </Svg>
      );
    }
    return (
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
        <Path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-6.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
        />
      </Svg>
    );
  },
  // Polls: the app's historical poll mark — bar-chart bars rotated 90° into
  // horizontal result bars (same design as the in-card PollIcon in
  // screens/Search/components/metric-icons.tsx, re-drawn here so nav chrome
  // never imports screen-component internals). Bolder stroke when active.
  polls: (color: string, active: boolean) => (
    <Svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={active ? 2.8 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: [{ rotate: '90deg' }] }}
    >
      <Path d="M5 21v-6" />
      <Path d="M12 21V3" />
      <Path d="M19 21V9" />
    </Svg>
  ),
  lists: (color: string, active: boolean) => (
    <Heart size={24} color={color} strokeWidth={active ? 0 : 2} fill={active ? color : 'none'} />
  ),
  profile: (color: string, active: boolean) => {
    if (active) {
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24" fill={color} stroke="none">
          <Path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M18.685 19.097A9.723 9.723 0 0 0 21.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 0 0 3.065 7.097A9.716 9.716 0 0 0 12 21.75a9.716 9.716 0 0 0 6.685-2.653Zm-12.54-1.285A7.486 7.486 0 0 1 12 15a7.486 7.486 0 0 1 5.855 2.812A8.224 8.224 0 0 1 12 20.25a8.224 8.224 0 0 1-5.855-2.438ZM15.75 9a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
          />
        </Svg>
      );
    }
    return (
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
        <Path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
        />
      </Svg>
    );
  },
};
