import type { WithSpringConfig } from 'react-native-reanimated';

export type SheetPosition = 'hidden' | 'collapsed' | 'middle' | 'expanded';

export type SheetGestureContext = {
  startY: number;
  startStateIndex: number;
  isHeaderDrag?: boolean;
  canDriveSheet?: boolean;
  isExpandedAtStart?: boolean;
};

export const SHEET_STATES: SheetPosition[] = ['expanded', 'middle', 'collapsed', 'hidden'];

export const clampValue = (value: number, lowerBound: number, upperBound: number): number => {
  'worklet';
  return Math.min(Math.max(value, lowerBound), upperBound);
};

export const SHEET_SPRING_CONFIG: WithSpringConfig = {
  damping: 20,
  stiffness: 195,
  mass: 0.9,
  overshootClamping: false,
  restDisplacementThreshold: 0.5,
  restSpeedThreshold: 0.5,
};

export const SMALL_MOVEMENT_THRESHOLD = 30;

export const resolveExpandedTop = (searchBarTop: number, fallbackTop = 0): number => {
  const preferred = searchBarTop > 0 ? searchBarTop : fallbackTop;
  return Math.max(preferred, 0);
};

export const snapPointForState = (
  state: SheetPosition,
  expanded: number,
  middle: number,
  collapsed: number,
  hidden: number
): number => {
  'worklet';
  switch (state) {
    case 'expanded':
      return expanded;
    case 'middle':
      return middle;
    case 'collapsed':
      return collapsed;
    case 'hidden':
    default:
      return hidden;
  }
};
