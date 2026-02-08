import React from 'react';
import {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { SEARCH_CHROME_FADE_ZONE_PX } from '../constants/search';

type SearchChromeTransitionOptions = {
  sheetY: SharedValue<number>;
  expanded: number;
  middle: number;
};

const useSearchChromeTransition = ({ sheetY, expanded, middle }: SearchChromeTransitionOptions) => {
  const expandedSnap = useSharedValue(expanded);
  const middleSnap = useSharedValue(middle);

  React.useEffect(() => {
    expandedSnap.value = expanded;
    middleSnap.value = middle;
  }, [expanded, expandedSnap, middle, middleSnap]);

  const progress = useDerivedValue(() => {
    const expandedY = expandedSnap.value;
    const middleY = middleSnap.value;
    const fadeEndY = Math.min(middleY, expandedY + SEARCH_CHROME_FADE_ZONE_PX);
    if (fadeEndY <= expandedY) {
      return middleY <= expandedY ? 1 : 0;
    }
    return interpolate(sheetY.value, [expandedY, fadeEndY], [0, 1], Extrapolation.CLAMP);
  });

  const chromeOpacity = useDerivedValue(() =>
    interpolate(progress.value, [0, 0.45, 0.62, 0.8, 1], [0, 0, 0.15, 0.9, 1], Extrapolation.CLAMP)
  );

  const chromeScale = useDerivedValue(() =>
    interpolate(progress.value, [0, 1], [0.96, 1], Extrapolation.CLAMP)
  );

  const borderAlpha = useDerivedValue(() =>
    interpolate(
      progress.value,
      [0, 0.3, 0.6, 0.85, 1],
      [0.1, 0.25, 0.5, 0.75, 0.95],
      Extrapolation.CLAMP
    )
  );

  const inputVisibility = useDerivedValue(() => progress.value);

  const inputAnimatedStyle = useAnimatedStyle(() => {
    return { opacity: inputVisibility.value };
  });

  const containerAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: chromeOpacity.value,
      backgroundColor: '#ffffff',
      borderColor: `rgba(229, 231, 235, ${borderAlpha.value})`,
      transform: [{ scale: chromeScale.value }],
      display: chromeOpacity.value < 0.02 ? 'none' : 'flex',
    };
  });

  const chromeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: chromeOpacity.value,
    transform: [{ scale: chromeScale.value }],
    display: chromeOpacity.value < 0.02 ? 'none' : 'flex',
  }));

  return {
    inputAnimatedStyle,
    containerAnimatedStyle,
    chromeAnimatedStyle,
    chromeOpacity,
    chromeScale,
  };
};

export default useSearchChromeTransition;
