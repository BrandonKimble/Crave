import type { DerivedValue, SharedValue } from 'react-native-reanimated';

export const SEARCH_BOTTOM_NAV_MOTION_DURATION_MS = 360;

export type SearchBottomNavMotionTarget = 'hide' | 'show';

export type SearchBottomNavMotionRuntime = {
  navOpacity: SharedValue<number> | DerivedValue<number>;
  navTranslateY: SharedValue<number> | DerivedValue<number>;
};

type SearchBottomNavMotionCommandSink = (target: SearchBottomNavMotionTarget) => void;

let activeSearchBottomNavMotionCommandSink: SearchBottomNavMotionCommandSink | null = null;

export const registerSearchBottomNavMotionCommandSink = (
  sink: SearchBottomNavMotionCommandSink
): (() => void) => {
  activeSearchBottomNavMotionCommandSink = sink;
  return () => {
    if (activeSearchBottomNavMotionCommandSink === sink) {
      activeSearchBottomNavMotionCommandSink = null;
    }
  };
};

export const requestSearchBottomNavMotionTarget = (
  target: SearchBottomNavMotionTarget
): boolean => {
  if (activeSearchBottomNavMotionCommandSink == null) {
    return false;
  }
  activeSearchBottomNavMotionCommandSink(target);
  return true;
};
