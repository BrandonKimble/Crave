import React from 'react';
import { Animated } from 'react-native';

import {
  Extrapolation,
  Easing,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { SnapPoints } from '../../../overlays/BottomSheetWithFlashList';
import { SHEET_SPRING_CONFIG, type SheetPosition } from '../../../overlays/sheetUtils';
import { SCREEN_HEIGHT } from '../constants/search';

type UseSearchSheetOptions = {
  isSearchOverlay: boolean;
  isSearchFocused: boolean;
  searchLayoutTop: number;
};

type UseSearchSheetResult = {
  panelVisible: boolean;
  setPanelVisible: React.Dispatch<React.SetStateAction<boolean>>;
  sheetState: SheetPosition;
  setSheetState: React.Dispatch<React.SetStateAction<SheetPosition>>;
  snapPoints: SnapPoints;
  shouldRenderSheet: boolean;
  sheetTranslateY: SharedValue<number>;
  sheetStateShared: SharedValue<SheetPosition>;
  resetSheetToHidden: () => void;
  animateSheetTo: (position: SheetPosition, velocity?: number) => void;
  showPanel: () => void;
  hideSheet: () => void;
  handleSheetSnapChange: (nextSnap: SheetPosition | 'hidden') => void;
  searchBarInputAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  searchBarSheetAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  resultsContainerAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  resultsScrollOffset: SharedValue<number>;
  resultsMomentum: SharedValue<boolean>;
  onResultsScroll: (offsetY: number) => void;
  onResultsScrollBeginDrag: () => void;
  onResultsScrollEndDrag: () => void;
  resultsScrollY: Animated.Value;
  headerDividerAnimatedStyle: { opacity: Animated.AnimatedInterpolation<number> };
};

const useSearchSheet = ({
  isSearchOverlay,
  isSearchFocused,
  searchLayoutTop,
}: UseSearchSheetOptions): UseSearchSheetResult => {
  const [panelVisible, setPanelVisible] = React.useState(false);
  const [sheetState, setSheetState] = React.useState<SheetPosition>('hidden');
  const snapPointExpanded = useSharedValue(0);
  const snapPointMiddle = useSharedValue(SCREEN_HEIGHT * 0.4);
  const sheetTranslateY = useSharedValue(SCREEN_HEIGHT);
  const sheetStateShared = useSharedValue<SheetPosition>('hidden');
  const resultsScrollY = React.useRef(new Animated.Value(0)).current;
  const resultsScrollOffset = useSharedValue(0);
  const resultsMomentum = useSharedValue(false);
  const draggingFromTop = useSharedValue(false);
  const lastScrollYRef = React.useRef(0);

  const snapPoints = React.useMemo<SnapPoints>(() => {
    const expanded = Math.max(searchLayoutTop, 0);
    const rawMiddle = SCREEN_HEIGHT * 0.4;
    const middle = Math.max(expanded + 96, rawMiddle);
    const collapsed = SCREEN_HEIGHT - 130;
    const hidden = SCREEN_HEIGHT + 80;
    return {
      expanded,
      middle: Math.min(middle, hidden - 120),
      collapsed,
      hidden,
    };
  }, [searchLayoutTop]);

  const shouldRenderSheet =
    isSearchOverlay && !isSearchFocused && (panelVisible || sheetState !== 'hidden');

  React.useEffect(() => {
    if (!isSearchOverlay) {
      setPanelVisible(false);
      setSheetState('hidden');
      sheetStateShared.value = 'hidden';
      sheetTranslateY.value = snapPoints.hidden;
    }
  }, [isSearchOverlay, sheetStateShared, sheetTranslateY, snapPoints.hidden]);

  React.useEffect(() => {
    snapPointExpanded.value = snapPoints.expanded;
    snapPointMiddle.value = snapPoints.middle;
  }, [snapPointExpanded, snapPointMiddle, snapPoints.expanded, snapPoints.middle]);

  React.useEffect(() => {
    sheetStateShared.value = sheetState;
  }, [sheetState, sheetStateShared]);

  React.useEffect(() => {
    if (!panelVisible) {
      sheetTranslateY.value = snapPoints.hidden;
    }
  }, [panelVisible, sheetTranslateY, snapPoints.hidden]);

  const animateSheetTo = React.useCallback(
    (position: SheetPosition, velocity = 0) => {
      const target = snapPoints[position];
      setSheetState(position);
      sheetStateShared.value = position;
      if (position !== 'hidden') {
        setPanelVisible(true);
      }
      sheetTranslateY.value = withSpring(
        target,
        {
          ...SHEET_SPRING_CONFIG,
          velocity,
        },
        (finished) => {
          if (finished && position === 'hidden') {
            runOnJS(setPanelVisible)(false);
          }
        }
      );
    },
    [sheetStateShared, sheetTranslateY, snapPoints]
  );

  const resetSheetToHidden = React.useCallback(() => {
    setPanelVisible(false);
    setSheetState('hidden');
    sheetStateShared.value = 'hidden';
    sheetTranslateY.value = snapPoints.hidden;
  }, [sheetStateShared, sheetTranslateY, snapPoints.hidden]);

  const handleSheetSnapChange = React.useCallback(
    (nextSnap: SheetPosition | 'hidden') => {
      const nextState: SheetPosition = nextSnap === 'hidden' ? 'hidden' : nextSnap;
      setSheetState(nextState);
      sheetStateShared.value = nextState;
      setPanelVisible(nextSnap !== 'hidden');
    },
    [sheetStateShared]
  );

  const showPanel = React.useCallback(() => {
    if (!panelVisible) {
      setPanelVisible(true);
    }
    requestAnimationFrame(() => {
      animateSheetTo('middle');
    });
  }, [animateSheetTo, panelVisible]);

  const hideSheet = React.useCallback(() => {
    if (!panelVisible) {
      return;
    }
    animateSheetTo('hidden');
  }, [animateSheetTo, panelVisible]);

  const searchBarInputAnimatedStyle = useAnimatedStyle(() => {
    const visibility = interpolate(
      sheetTranslateY.value,
      [snapPointExpanded.value, snapPointMiddle.value],
      [0, 1],
      Extrapolation.CLAMP
    );
    return { opacity: visibility };
  });

  const searchBarSheetAnimatedStyle = useAnimatedStyle(() => {
    const progress = interpolate(
      sheetTranslateY.value,
      [snapPointExpanded.value, snapPointMiddle.value],
      [0, 1],
      Extrapolation.CLAMP
    );
    const opacity = interpolate(
      progress,
      [0, 0.3, 0.5, 0.7, 1],
      [0, 0, 0.15, 0.9, 1],
      Extrapolation.CLAMP
    );
    const borderAlpha = interpolate(
      progress,
      [0, 0.3, 0.6, 0.85, 1],
      [0.1, 0.25, 0.5, 0.75, 0.95],
      Extrapolation.CLAMP
    );
    const scale = interpolate(progress, [0, 1], [0.96, 1], Extrapolation.CLAMP);

    return {
      opacity,
      backgroundColor: '#ffffff',
      borderColor: `rgba(229, 231, 235, ${borderAlpha})`,
      transform: [{ scale }],
      display: opacity < 0.02 ? 'none' : 'flex',
    };
  });

  const resultsContainerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  const onResultsScroll = React.useCallback(
    (offsetY: number) => {
      resultsScrollOffset.value = offsetY;
      if (draggingFromTop.value && offsetY > 0.5) {
        draggingFromTop.value = false;
      }
      resultsScrollY.setValue(offsetY);
      lastScrollYRef.current = offsetY;
    },
    [draggingFromTop, resultsScrollOffset, resultsScrollY]
  );

  const onResultsScrollBeginDrag = React.useCallback(() => {
    draggingFromTop.value = resultsScrollOffset.value <= 0.5;
  }, [draggingFromTop, resultsScrollOffset]);

  const onResultsScrollEndDrag = React.useCallback(() => {
    draggingFromTop.value = false;
  }, [draggingFromTop]);

  const headerDividerAnimatedStyle = React.useMemo(
    () => ({
      opacity: resultsScrollY.interpolate({
        inputRange: [0, 12],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
    }),
    [resultsScrollY]
  );

  return {
    panelVisible,
    setPanelVisible,
    sheetState,
    setSheetState,
    snapPoints,
    shouldRenderSheet,
    sheetTranslateY,
    sheetStateShared,
    resetSheetToHidden,
    animateSheetTo,
    showPanel,
    hideSheet,
    handleSheetSnapChange,
    searchBarInputAnimatedStyle,
    searchBarSheetAnimatedStyle,
    resultsContainerAnimatedStyle,
    resultsScrollOffset,
    resultsMomentum,
    onResultsScroll,
    onResultsScrollBeginDrag,
    onResultsScrollEndDrag,
    resultsScrollY,
    headerDividerAnimatedStyle,
  };
};

export default useSearchSheet;

