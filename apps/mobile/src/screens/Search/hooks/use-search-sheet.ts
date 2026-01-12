import React from 'react';

import { PixelRatio } from 'react-native';
import {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import type { SnapPoints } from '../../../overlays/BottomSheetWithFlashList';
import { calculateSnapPoints, type SheetPosition } from '../../../overlays/sheetUtils';
import { LINE_HEIGHTS } from '../../../constants/typography';
import { NAV_BOTTOM_PADDING, NAV_TOP_PADDING, SCREEN_HEIGHT } from '../constants/search';

type UseSearchSheetOptions = {
  isSearchOverlay: boolean;
  searchBarTop: number;
  insetTop: number;
  insetBottom: number;
  headerHeight?: number;
};

type UseSearchSheetResult = {
  panelVisible: boolean;
  sheetState: SheetPosition;
  snapPoints: SnapPoints;
  shouldRenderSheet: boolean;
  sheetTranslateY: SharedValue<number>;
  snapTo: SheetPosition | null;
  resetSheetToHidden: () => void;
  animateSheetTo: (position: SheetPosition, velocity?: number) => void;
  showPanel: () => void;
  showPanelInstant: (position?: SheetPosition) => void;
  handleSheetSnapChange: (nextSnap: SheetPosition | 'hidden') => void;
  resultsContainerAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  resultsScrollOffset: SharedValue<number>;
  resultsMomentum: SharedValue<boolean>;
  headerDividerAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
};

const useSearchSheet = ({
  isSearchOverlay,
  searchBarTop,
  insetTop,
  insetBottom,
  headerHeight,
}: UseSearchSheetOptions): UseSearchSheetResult => {
  const [panelVisible, setPanelVisible] = React.useState(false);
  const [sheetState, setSheetState] = React.useState<SheetPosition>('hidden');
  const panelVisibleRef = React.useRef(false);
  const sheetStateRef = React.useRef<SheetPosition>('hidden');
  const sheetTranslateY = useSharedValue(SCREEN_HEIGHT);
  const resultsScrollOffset = useSharedValue(0);
  const resultsMomentum = useSharedValue(false);
  const [snapTo, setSnapTo] = React.useState<SheetPosition | null>(null);
  const snapToRef = React.useRef<SheetPosition | null>(null);

  // The search results sheet intentionally uses the same snap-point math as other overlays,
  // even when the bottom nav is hidden (we still align collapsed as if it were present).
  const estimatedNavBarTop = React.useMemo(() => {
    const clampedInsetBottom = Math.max(insetBottom, 12);
    const estimatedNavBarHeight = PixelRatio.roundToNearestPixel(
      NAV_TOP_PADDING + 24 + 2 + LINE_HEIGHTS.body + clampedInsetBottom + NAV_BOTTOM_PADDING
    );
    return SCREEN_HEIGHT - estimatedNavBarHeight;
  }, [insetBottom]);

  const snapPoints = React.useMemo<SnapPoints>(() => {
    const resolvedHeaderHeight = Math.max(headerHeight ?? 0, 96);
    return calculateSnapPoints(
      SCREEN_HEIGHT,
      searchBarTop,
      insetTop,
      estimatedNavBarTop,
      resolvedHeaderHeight
    );
  }, [estimatedNavBarTop, headerHeight, insetTop, searchBarTop]);

  const shouldRenderSheet = isSearchOverlay && (panelVisible || sheetState !== 'hidden');

  React.useEffect(() => {
    panelVisibleRef.current = panelVisible;
  }, [panelVisible]);

  React.useEffect(() => {
    sheetStateRef.current = sheetState;
  }, [sheetState]);

  React.useEffect(() => {
    if (!panelVisible) {
      sheetTranslateY.value = snapPoints.hidden;
    }
  }, [panelVisible, sheetTranslateY, snapPoints.hidden]);

  const handleSheetSnapChange = React.useCallback(
    (nextSnap: SheetPosition | 'hidden') => {
      const nextState: SheetPosition = nextSnap === 'hidden' ? 'hidden' : nextSnap;
      sheetStateRef.current = nextState;
      panelVisibleRef.current = nextSnap !== 'hidden';
      setSheetState(nextState);
      setPanelVisible(nextSnap !== 'hidden');
      if (snapToRef.current) {
        snapToRef.current = null;
        setSnapTo(null);
      }
    },
    [setPanelVisible, setSnapTo]
  );

  const animateSheetTo = React.useCallback(
    (position: SheetPosition, _velocity = 0) => {
      if (position !== 'hidden') {
        panelVisibleRef.current = true;
        setPanelVisible(true);
      }
      snapToRef.current = position;
      setSnapTo(position);
    },
    [setPanelVisible, setSnapTo]
  );

  const resetSheetToHidden = React.useCallback(() => {
    panelVisibleRef.current = false;
    sheetStateRef.current = 'hidden';
    setPanelVisible(false);
    setSheetState('hidden');
    setSnapTo(null);
    snapToRef.current = null;
    sheetTranslateY.value = snapPoints.hidden;
  }, [sheetTranslateY, snapPoints.hidden]);

  const showPanel = React.useCallback(() => {
    if (!panelVisibleRef.current) {
      panelVisibleRef.current = true;
      setPanelVisible(true);
    }
    if (sheetStateRef.current === 'middle') {
      return;
    }
    requestAnimationFrame(() => {
      animateSheetTo('middle');
    });
  }, [animateSheetTo]);

  const showPanelInstant = React.useCallback(
    (position: SheetPosition = 'middle') => {
      panelVisibleRef.current = true;
      sheetStateRef.current = position;
      setPanelVisible(true);
      setSheetState(position);
      setSnapTo(null);
      snapToRef.current = null;
      sheetTranslateY.value = snapPoints[position];
    },
    [setPanelVisible, setSheetState, setSnapTo, sheetTranslateY, snapPoints]
  );

  const resultsContainerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  const headerDividerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(resultsScrollOffset.value, [0, 12], [0, 1], Extrapolation.CLAMP),
  }));

  return {
    panelVisible,
    sheetState,
    snapPoints,
    shouldRenderSheet,
    sheetTranslateY,
    snapTo,
    resetSheetToHidden,
    animateSheetTo,
    showPanel,
    showPanelInstant,
    handleSheetSnapChange,
    resultsContainerAnimatedStyle,
    resultsScrollOffset,
    resultsMomentum,
    headerDividerAnimatedStyle,
  };
};

export default useSearchSheet;
