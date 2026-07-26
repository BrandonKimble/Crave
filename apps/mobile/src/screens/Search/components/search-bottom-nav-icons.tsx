import React from 'react';
import { Heart, House } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';

export type SearchBottomNavItemKey = 'search' | 'polls' | 'lists' | 'profile';

export const SEARCH_BOTTOM_NAV_ICON_RENDERERS: Record<
  SearchBottomNavItemKey,
  (color: string, active: boolean) => React.ReactNode
> = {
  // The root tab is the app's HOME page (map + search + docked home surface):
  // the lucide house (rounded-stroke body with the door notch). A filled variant
  // would swallow the door notch (the door is an open stroke path), so the active
  // treatment is the polls tab's pattern — bolder stroke, never fill.
  search: (color: string, active: boolean) => (
    <House size={24} color={color} strokeWidth={active ? 2.8 : 2} />
  ),
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
