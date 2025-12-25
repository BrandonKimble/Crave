import React from 'react';
import { Animated } from 'react-native';

import {
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import type { SnapPoints } from '../../../overlays/BottomSheetWithFlashList';
import { SHEET_SPRING_CONFIG, type SheetPosition } from '../../../overlays/sheetUtils';
import { SCREEN_HEIGHT } from '../constants/search';

type UseSearchSheetOptions = {
  isSearchOverlay: boolean;
  isSearchFocused: boolean;
  searchBarTop: number;
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
  searchBarTop,
}: UseSearchSheetOptions): UseSearchSheetResult => {
  const [panelVisible, setPanelVisible] = React.useState(false);
  const [sheetState, setSheetState] = React.useState<SheetPosition>('hidden');
  const sheetTranslateY = useSharedValue(SCREEN_HEIGHT);
  const sheetStateShared = useSharedValue<SheetPosition>('hidden');
  const resultsScrollY = React.useRef(new Animated.Value(0)).current;
  const resultsScrollOffset = useSharedValue(0);
  const resultsMomentum = useSharedValue(false);
  const draggingFromTop = useSharedValue(false);
  const lastScrollYRef = React.useRef(0);

  const snapPoints = React.useMemo<SnapPoints>(() => {
    const expanded = Math.max(searchBarTop, 0);
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
  }, [searchBarTop]);

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
