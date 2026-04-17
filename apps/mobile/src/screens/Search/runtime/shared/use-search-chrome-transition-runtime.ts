import React from 'react';
import {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { SEARCH_CHROME_FADE_ZONE_PX } from '../../constants/search';

type UseSearchChromeTransitionRuntimeArgs = {
  expandedSnap: number;
  middleSnap: number;
  sheetTranslateY: SharedValue<number>;
  transitionProgressOverride?: SharedValue<number>;
};

export const useSearchChromeTransitionRuntime = ({
  expandedSnap,
  middleSnap,
  sheetTranslateY,
  transitionProgressOverride,
}: UseSearchChromeTransitionRuntimeArgs) => {
  const chromeTransitionExpandedSnap = useSharedValue(expandedSnap);
  const chromeTransitionMiddleSnap = useSharedValue(middleSnap);

  React.useEffect(() => {
    chromeTransitionExpandedSnap.value = expandedSnap;
    chromeTransitionMiddleSnap.value = middleSnap;
  }, [chromeTransitionExpandedSnap, chromeTransitionMiddleSnap, expandedSnap, middleSnap]);

  const derivedSearchChromeTransitionProgress = useDerivedValue(() => {
    const expandedY = chromeTransitionExpandedSnap.value;
    const middleY = chromeTransitionMiddleSnap.value;
    const fadeEndY = Math.min(middleY, expandedY + SEARCH_CHROME_FADE_ZONE_PX);
    if (fadeEndY <= expandedY) {
      return middleY <= expandedY ? 1 : 0;
    }
    return interpolate(sheetTranslateY.value, [expandedY, fadeEndY], [0, 1], Extrapolation.CLAMP);
  }, [chromeTransitionExpandedSnap, chromeTransitionMiddleSnap, sheetTranslateY]);

  const searchChromeTransitionProgress =
    transitionProgressOverride ?? derivedSearchChromeTransitionProgress;

  const searchChromeOpacity = useDerivedValue(() =>
    interpolate(
      searchChromeTransitionProgress.value,
      [0, 0.45, 0.62, 0.8, 1],
      [0, 0, 0.15, 0.9, 1],
      Extrapolation.CLAMP
    )
  );

  const searchChromeScale = useDerivedValue(() =>
    interpolate(searchChromeTransitionProgress.value, [0, 1], [0.985, 1], Extrapolation.CLAMP)
  );

  const searchBarInputAnimatedStyle = useAnimatedStyle(() => ({
    opacity: searchChromeTransitionProgress.value,
  }));

  return React.useMemo(
    () => ({
      searchChromeOpacity,
      searchChromeScale,
      searchChromeTransitionProgress,
      searchBarInputAnimatedStyle,
    }),
    [
      searchBarInputAnimatedStyle,
      searchChromeOpacity,
      searchChromeScale,
      searchChromeTransitionProgress,
    ]
  );
};
