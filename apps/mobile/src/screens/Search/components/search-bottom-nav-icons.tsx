import React from 'react';
import { Heart } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';

export type SearchBottomNavItemKey = 'search' | 'bookmarks' | 'profile';

export const SEARCH_BOTTOM_NAV_ICON_RENDERERS: Record<
  SearchBottomNavItemKey,
  (color: string, active: boolean) => React.ReactNode
> = {
  search: (color: string, active: boolean) => {
    const holeRadius = active ? 4.2 : 3.2;
    const pinPath =
      'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0';
    const holePath = `M12 10m-${holeRadius},0a${holeRadius},${holeRadius} 0 1,0 ${
      holeRadius * 2
    },0a${holeRadius},${holeRadius} 0 1,0 -${holeRadius * 2},0`;
    return (
      <Svg width={24} height={24} viewBox="0 0 24 24">
        <Path
          d={`${pinPath} ${holePath}`}
          fill={active ? color : 'none'}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fillRule="evenodd"
          clipRule="evenodd"
        />
      </Svg>
    );
  },
  bookmarks: (color: string, active: boolean) => (
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
