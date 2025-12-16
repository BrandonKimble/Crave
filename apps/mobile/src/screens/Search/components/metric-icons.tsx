import React from 'react';
import Svg, { Path } from 'react-native-svg';

import { SECONDARY_METRIC_ICON_SIZE, VOTE_ICON_SIZE } from '../constants/search';

export const PollIcon = ({
  color,
  size = SECONDARY_METRIC_ICON_SIZE,
  strokeWidth = 2,
}: {
  color: string;
  size?: number;
  strokeWidth?: number;
}) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ transform: [{ rotate: '90deg' }] }}
  >
    <Path d="M5 21v-6" />
    <Path d="M12 21V3" />
    <Path d="M19 21V9" />
  </Svg>
);

export const InfoCircleIcon = ({
  color,
  size = SECONDARY_METRIC_ICON_SIZE,
  strokeWidth = 2,
}: {
  color: string;
  size?: number;
  strokeWidth?: number;
}) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Path d="M12 16v-4" />
    <Path d="M12 8h.01" />
    <Path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z" />
  </Svg>
);

export const VoteIcon = ({ color, size = VOTE_ICON_SIZE }: { color: string; size?: number }) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Path d="M21 10.656V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.344" />
    <Path d="m9 11 3 3L22 4" />
  </Svg>
);

