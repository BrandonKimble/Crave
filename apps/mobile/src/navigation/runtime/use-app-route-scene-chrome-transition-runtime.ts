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

import { SEARCH_CHROME_SHEET_RESPONSE_ZONE_PX } from '../../screens/Search/constants/search';

type UseAppRouteSceneChromeTransitionRuntimeArgs = {
  expandedSnap: number | SharedValue<number>;
  middleSnap: number | SharedValue<number>;
  sheetTranslateY: SharedValue<number>;
  transitionProgressOverride?: SharedValue<number>;
  visibilityProgressOverride?: SharedValue<number>;
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
  visibilityProgressOverride,
}: UseAppRouteSceneChromeTransitionRuntimeArgs) => {
  const chromeTransitionExpandedSnap = useChromeSnapSharedValue(expandedSnap);
  const chromeTransitionMiddleSnap = useChromeSnapSharedValue(middleSnap);

  const derivedSearchChromeTransitionProgress = useDerivedValue(() => {
    const expandedY = chromeTransitionExpandedSnap.value;
    const middleY = chromeTransitionMiddleSnap.value;
    const responseEndY = Math.min(middleY, expandedY + SEARCH_CHROME_SHEET_RESPONSE_ZONE_PX);
    if (responseEndY <= expandedY) {
      return middleY <= expandedY ? 1 : 0;
    }
    return interpolate(
      sheetTranslateY.value,
      [expandedY, responseEndY],
      [0, 1],
      Extrapolation.CLAMP
    );
  }, [chromeTransitionExpandedSnap, chromeTransitionMiddleSnap, sheetTranslateY]);

  const searchChromeTransitionProgress =
    transitionProgressOverride ?? derivedSearchChromeTransitionProgress;
  const searchChromeVisibilityProgress = visibilityProgressOverride;

  const searchChromeOpacity = useDerivedValue(() =>
    searchChromeVisibilityProgress ? searchChromeVisibilityProgress.value : 1
  );

  // Transform magnitudes copied from the original pre-split link (use-search-chrome-transition-
  // runtime.ts, deleted in f26102bc): a subtle 0.985 scale and no translate.
  const searchChromeScale = useDerivedValue(() =>
    interpolate(searchChromeTransitionProgress.value, [0, 1], [0.985, 1], Extrapolation.CLAMP)
  );

  const searchChromeTranslateY = useDerivedValue(() => 0);

  const searchBarInputAnimatedStyle = useAnimatedStyle(() => ({
    opacity: searchChromeVisibilityProgress ? searchChromeVisibilityProgress.value : 1,
  }));

  return React.useMemo(
    () => ({
      searchChromeOpacity,
      searchChromeScale,
      searchChromeTranslateY,
      searchChromeTransitionProgress,
      searchChromeVisibilityProgress,
      searchBarInputAnimatedStyle,
    }),
    [
      searchBarInputAnimatedStyle,
      searchChromeOpacity,
      searchChromeScale,
      searchChromeTranslateY,
      searchChromeTransitionProgress,
      searchChromeVisibilityProgress,
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
  const overlayChromeVisibilityProgress = useSharedValue(1);
  const overlayBackdropDimProgress = useSharedValue(0);
  const overlayBackdropSheetTopY = useSharedValue(0);
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
      overlayChromeTransitionProgress.value = next;
    },
    [baseSearchChromeTransitionProgress, overlayChromeTransitionProgress]
  );

  useAnimatedReaction(
    () => baseSearchChromeTransitionProgress.value,
    (next) => {
      overlayBackdropDimProgress.value = 1 - next;
    },
    [overlayBackdropDimProgress, baseSearchChromeTransitionProgress]
  );

  useAnimatedReaction(
    () => sheetTranslateY.value,
    (next) => {
      overlayBackdropSheetTopY.value = next;
    },
    [overlayBackdropSheetTopY, sheetTranslateY]
  );

  const {
    searchChromeOpacity,
    searchChromeScale,
    searchChromeTranslateY,
    searchBarInputAnimatedStyle,
  } = useAppRouteSceneChromeSheetProgressRuntime({
    expandedSnap,
    middleSnap,
    sheetTranslateY,
    transitionProgressOverride: overlayChromeTransitionProgress,
    visibilityProgressOverride: overlayChromeVisibilityProgress,
  });

  return React.useMemo(
    () => ({
      overlayHeaderActionProgress,
      overlayChromeTransitionProgress,
      overlayChromeVisibilityProgress,
      overlayBackdropDimProgress,
      routeChromeMotionProgress,
      overlayBackdropSheetTopY,
      searchChromeOpacity,
      searchChromeScale,
      searchChromeTranslateY,
      searchBarInputAnimatedStyle,
    }),
    [
      overlayBackdropDimProgress,
      overlayChromeTransitionProgress,
      overlayChromeVisibilityProgress,
      overlayHeaderActionProgress,
      routeChromeMotionProgress,
      overlayBackdropSheetTopY,
      searchBarInputAnimatedStyle,
      searchChromeOpacity,
      searchChromeScale,
      searchChromeTranslateY,
    ]
  );
};
