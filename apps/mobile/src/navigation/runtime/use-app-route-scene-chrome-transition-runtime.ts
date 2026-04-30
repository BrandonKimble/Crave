import React from 'react';
import {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { SEARCH_CHROME_FADE_ZONE_PX } from '../../screens/Search/constants/search';

type UseAppRouteSceneChromeTransitionRuntimeArgs = {
  expandedSnap: number | SharedValue<number>;
  middleSnap: number | SharedValue<number>;
  sheetTranslateY: SharedValue<number>;
  transitionProgressOverride?: SharedValue<number>;
};

const useChromeSnapSharedValue = (snap: number | SharedValue<number>): SharedValue<number> => {
  const snapValue = useSharedValue(typeof snap === 'number' ? snap : 0);

  React.useEffect(() => {
    if (typeof snap === 'number') {
      snapValue.value = snap;
    }
  }, [snap, snapValue]);

  return typeof snap === 'number' ? snapValue : snap;
};

const useAppRouteSceneChromeSheetProgressRuntime = ({
  expandedSnap,
  middleSnap,
  sheetTranslateY,
  transitionProgressOverride,
}: UseAppRouteSceneChromeTransitionRuntimeArgs) => {
  const chromeTransitionExpandedSnap = useChromeSnapSharedValue(expandedSnap);
  const chromeTransitionMiddleSnap = useChromeSnapSharedValue(middleSnap);

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

export const useAppRouteSceneChromeTransitionRuntime = ({
  expandedSnap,
  middleSnap,
  sheetTranslateY,
}: Omit<UseAppRouteSceneChromeTransitionRuntimeArgs, 'transitionProgressOverride'>) => {
  const overlayHeaderActionProgress = useSharedValue(0);
  const overlayChromeTransitionProgress = useSharedValue(1);
  const overlayBackdropDimProgress = useSharedValue(0);
  const routeChromeMotionProgress = useSharedValue(0);
  const { searchChromeTransitionProgress: baseSearchChromeTransitionProgress } =
    useAppRouteSceneChromeSheetProgressRuntime({
      expandedSnap,
      middleSnap,
      sheetTranslateY,
    });

  useAnimatedReaction(
    () => baseSearchChromeTransitionProgress.value,
    (next) => {
      if (routeChromeMotionProgress.value > 0) {
        return;
      }
      overlayChromeTransitionProgress.value = next;
    },
    [baseSearchChromeTransitionProgress, overlayChromeTransitionProgress, routeChromeMotionProgress]
  );

  useAnimatedReaction(
    () => baseSearchChromeTransitionProgress.value,
    (next) => {
      if (routeChromeMotionProgress.value > 0) {
        return;
      }
      overlayBackdropDimProgress.value = 1 - next;
    },
    [overlayBackdropDimProgress, baseSearchChromeTransitionProgress, routeChromeMotionProgress]
  );

  const { searchChromeOpacity, searchChromeScale, searchBarInputAnimatedStyle } =
    useAppRouteSceneChromeSheetProgressRuntime({
      expandedSnap,
      middleSnap,
      sheetTranslateY,
      transitionProgressOverride: overlayChromeTransitionProgress,
    });

  return React.useMemo(
    () => ({
      overlayHeaderActionProgress,
      overlayChromeTransitionProgress,
      overlayBackdropDimProgress,
      routeChromeMotionProgress,
      searchChromeOpacity,
      searchChromeScale,
      searchBarInputAnimatedStyle,
    }),
    [
      overlayBackdropDimProgress,
      overlayChromeTransitionProgress,
      overlayHeaderActionProgress,
      routeChromeMotionProgress,
      searchBarInputAnimatedStyle,
      searchChromeOpacity,
      searchChromeScale,
    ]
  );
};
