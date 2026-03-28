import React from 'react';

import { type SharedValue, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import type {
  BottomSheetMotionCommand,
  SnapPoints,
} from '../../../overlays/BottomSheetWithFlashList';
import { calculateSnapPoints, type SheetPosition } from '../../../overlays/sheetUtils';
import { SCREEN_HEIGHT } from '../constants/search';
import useScrollDividerStyle from './use-scroll-divider-style';

type UseSearchSheetOptions = {
  isSearchOverlay: boolean;
  suspendHiddenSync?: boolean;
  searchBarTop: number;
  insetTop: number;
  navBarTop: number;
  headerHeight?: number;
  initialPosition?: SheetPosition;
};

type UseSearchSheetResult = {
  panelVisible: boolean;
  sheetState: SheetPosition;
  snapPoints: SnapPoints;
  shouldRenderSheet: boolean;
  sheetTranslateY: SharedValue<number>;
  motionCommand: SharedValue<BottomSheetMotionCommand | null>;
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
  suspendHiddenSync = false,
  searchBarTop,
  insetTop,
  navBarTop,
  headerHeight,
  initialPosition,
}: UseSearchSheetOptions): UseSearchSheetResult => {
  const snapPoints = React.useMemo<SnapPoints>(() => {
    return calculateSnapPoints(SCREEN_HEIGHT, searchBarTop, insetTop, navBarTop, headerHeight ?? 0);
  }, [headerHeight, insetTop, navBarTop, searchBarTop]);
  const initialSheetPosition = initialPosition ?? 'hidden';
  const initialPanelVisible = initialSheetPosition !== 'hidden';

  const [panelVisible, setPanelVisible] = React.useState(initialPanelVisible);
  const [sheetState, setSheetState] = React.useState<SheetPosition>(initialSheetPosition);
  const panelVisibleRef = React.useRef(initialPanelVisible);
  const sheetStateRef = React.useRef<SheetPosition>(initialSheetPosition);
  const sheetTranslateY = useSharedValue(
    initialPanelVisible ? snapPoints[initialSheetPosition] ?? SCREEN_HEIGHT : SCREEN_HEIGHT
  );
  const resultsScrollOffset = useSharedValue(0);
  const resultsMomentum = useSharedValue(false);
  const motionCommand = useSharedValue<BottomSheetMotionCommand | null>(null);
  const motionCommandTokenRef = React.useRef(0);

  const shouldRenderSheet = isSearchOverlay && (panelVisible || sheetState !== 'hidden');

  React.useEffect(() => {
    panelVisibleRef.current = panelVisible;
  }, [panelVisible]);

  React.useEffect(() => {
    sheetStateRef.current = sheetState;
  }, [sheetState]);

  React.useEffect(() => {
    if (!isSearchOverlay) {
      return;
    }
    if (suspendHiddenSync) {
      return;
    }
    if (!panelVisible) {
      sheetTranslateY.value = snapPoints.hidden ?? SCREEN_HEIGHT;
    }
  }, [isSearchOverlay, panelVisible, sheetTranslateY, snapPoints.hidden, suspendHiddenSync]);

  const handleSheetSnapChange = React.useCallback(
    (nextSnap: SheetPosition | 'hidden') => {
      const nextState: SheetPosition = nextSnap === 'hidden' ? 'hidden' : nextSnap;
      sheetStateRef.current = nextState;
      panelVisibleRef.current = nextSnap !== 'hidden';
      setSheetState(nextState);
      setPanelVisible(nextSnap !== 'hidden');
    },
    [setPanelVisible]
  );

  const animateSheetTo = React.useCallback(
    (position: SheetPosition, velocity = 0) => {
      if (position !== 'hidden') {
        panelVisibleRef.current = true;
        setPanelVisible(true);
      }
      motionCommandTokenRef.current += 1;
      motionCommand.value = {
        snapTo: position,
        token: motionCommandTokenRef.current,
        velocity,
      };
    },
    [motionCommand, setPanelVisible]
  );

  const resetSheetToHidden = React.useCallback(() => {
    panelVisibleRef.current = false;
    sheetStateRef.current = 'hidden';
    setPanelVisible(false);
    setSheetState('hidden');
    motionCommand.value = null;
    if (isSearchOverlay) {
      sheetTranslateY.value = snapPoints.hidden ?? SCREEN_HEIGHT;
    }
  }, [isSearchOverlay, motionCommand, sheetTranslateY, snapPoints.hidden]);

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
      motionCommand.value = null;
      if (isSearchOverlay) {
        sheetTranslateY.value = snapPoints[position] ?? SCREEN_HEIGHT;
      }
    },
    [isSearchOverlay, motionCommand, setPanelVisible, setSheetState, sheetTranslateY, snapPoints]
  );

  const resultsContainerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  const headerDividerAnimatedStyle = useScrollDividerStyle(resultsScrollOffset);

  return {
    panelVisible,
    sheetState,
    snapPoints,
    shouldRenderSheet,
    sheetTranslateY,
    motionCommand,
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
