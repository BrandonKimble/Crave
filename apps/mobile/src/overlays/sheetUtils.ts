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
  damping: 30,
  stiffness: 120,
  mass: 1.2,
  overshootClamping: false,
  restDisplacementThreshold: 0.5,
  restSpeedThreshold: 0.5,
};
export const OVERLAY_TIMING_CONFIG = {
  enterDurationMs: 380,
  exitDurationMs: 340,
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

export type SnapPoints = {
  expanded: number;
  middle: number;
  collapsed: number;
  hidden: number;
};

/**
 * Shared snap point calculation used by all overlay sheets.
 * This ensures consistent positioning across results sheet, restaurant overlay,
 * bookmarks overlay, polls overlay, and profile overlay.
 */
export const calculateSnapPoints = (
  screenHeight: number,
  searchBarTop: number,
  insetTop: number,
  navBarOffset: number,
  headerHeight: number
): SnapPoints => {
  const expanded = resolveExpandedTop(searchBarTop, insetTop);
  const rawMiddle = screenHeight * 0.4;
  const middle = Math.max(expanded + 96, rawMiddle);
  const hidden = screenHeight + 80;
  const clampedMiddle = Math.min(middle, hidden - 120);
  const resolvedNavBarOffset = navBarOffset > 0 ? navBarOffset : screenHeight;
  const resolvedHeaderHeight = headerHeight > 0 ? headerHeight : 96;
  const navAlignedCollapsed = resolvedNavBarOffset - resolvedHeaderHeight;
  const finalCollapsed = Math.max(navAlignedCollapsed, clampedMiddle + 24);

  return {
    expanded,
    middle: clampedMiddle,
    collapsed: finalCollapsed,
    hidden,
  };
};
