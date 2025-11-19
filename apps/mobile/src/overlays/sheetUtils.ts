import type { WithSpringConfig } from 'react-native-reanimated';

export type SheetPosition = 'hidden' | 'collapsed' | 'middle' | 'expanded';

export type SheetGestureContext = {
  startY: number;
  startStateIndex: number;
};

export const SHEET_STATES: SheetPosition[] = ['expanded', 'middle', 'collapsed', 'hidden'];

export const clampValue = (value: number, lowerBound: number, upperBound: number): number => {
  'worklet';
  return Math.min(Math.max(value, lowerBound), upperBound);
};

export const SHEET_SPRING_CONFIG: WithSpringConfig = {
  damping: 22,
  stiffness: 185,
  overshootClamping: true,
  restDisplacementThreshold: 0.4,
  restSpeedThreshold: 0.4,
};

export const SMALL_MOVEMENT_THRESHOLD = 30;

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
