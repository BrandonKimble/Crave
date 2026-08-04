import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/**
 * The ONE surviving heroicon.
 *
 * F892 (2026-08-03): `components/icons/HeroIcons.tsx` declared eight heroicons of which
 * exactly one was ever consumed (this one, by `screens/Search/components/SearchHeader.tsx`).
 * The app standardized on `lucide-react-native`; a half-used parallel icon system is a fork
 * waiting to happen, so the other seven are DELETED and this one lives alone. Anything new
 * comes from lucide — if a second heroicon is ever wanted, that is a decision to re-open,
 * not a file to quietly grow.
 */
type XCircleIconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
};

export const XCircleIcon: React.FC<XCircleIconProps> = ({
  size = 20,
  color = '#0f172a',
  strokeWidth = 1.5,
  style,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
    <Path
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
    />
  </Svg>
);
