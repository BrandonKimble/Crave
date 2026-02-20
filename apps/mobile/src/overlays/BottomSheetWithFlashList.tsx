import React from 'react';
import {
  PixelRatio,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import type { LayoutChangeEvent, ScrollViewProps, StyleProp, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { FlashList, type FlashListProps, type FlashListRef } from '@shopify/flash-list';
import Animated, {
  runOnJS,
  runOnUI,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { SHEET_SPRING_CONFIG, clampValue } from './sheetUtils';
import { overlaySheetStyles } from './overlaySheetStyles';

const TOP_EPSILON = 2;
const DRAG_EPSILON = 2;
const DEFAULT_DRAW_DISTANCE = 140;
const DEFAULT_INITIAL_DRAW_BATCH_SIZE = 8;
const DEFAULT_DISMISS_SLOP = 80;
const RUBBER_BAND_RANGE_PX = 96;
const RUBBER_BAND_COEFFICIENT = 0.44;
const STEP_SNAP_SMALL_DRAG_PX = 20;
const STEP_SNAP_DRAG_PX = 48;
const STEP_SNAP_SKIP_DRAG_PX = 212;
const STEP_SNAP_VELOCITY_PX_PER_S = 820;
const STEP_SNAP_SKIP_VELOCITY_PX_PER_S = 3200;
const STEP_SNAP_SKIP_MIN_PROGRESS = 0.5;
const STEP_SNAP_DIRECTION_EPSILON_PX = 4;
const STEP_SNAP_DIRECTION_VELOCITY_EPS_PX_PER_S = 120;
const STEP_SNAP_DIRECTION_VELOCITY_OVERRIDE_PX_PER_S = 420;
const STEP_SNAP_REVERSAL_CANCEL_VELOCITY_PX_PER_S = 220;
const STEP_SNAP_REVERSAL_CANCEL_DRAG_PX = 140;
const STEP_SNAP_PROGRESS_FOR_STEP = 0.18;
const STEP_SNAP_PROGRESS_FOR_SKIP = 1.03;

const AXIS_LOCK_SLOP_PX = 4;
const AXIS_LOCK_RATIO = 1.15;
const AXIS_LOCK_NONE = 0;
const AXIS_LOCK_HORIZONTAL = 1;
const AXIS_LOCK_VERTICAL = 2;
const GESTURE_OWNER_SHEET = 0;
const GESTURE_OWNER_SCROLL = 1;

type SheetSnapPoint = 'expanded' | 'middle' | 'collapsed';

type SnapPoints = Record<SheetSnapPoint, number> & {
  hidden?: number;
};

type SnapChangeSource = 'gesture' | 'programmatic';
type SnapChangeMeta = { source: SnapChangeSource };

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList) as typeof FlashList;
const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

const getScrollTopOffset = (contentInsetTop?: number): number => {
  'worklet';
  if (typeof contentInsetTop !== 'number' || !Number.isFinite(contentInsetTop)) {
    return 0;
  }
  return -contentInsetTop;
};

const isAtScrollTop = (offsetY: number, scrollTopOffset: number): boolean => {
  'worklet';
  return offsetY <= scrollTopOffset + TOP_EPSILON;
};

const rubberBandDistance = (distanceFromBound: number): number => {
  'worklet';
  if (distanceFromBound <= 0) {
    return 0;
  }
  return (
    (distanceFromBound * RUBBER_BAND_RANGE_PX * RUBBER_BAND_COEFFICIENT) /
    (RUBBER_BAND_RANGE_PX + RUBBER_BAND_COEFFICIENT * distanceFromBound)
  );
};

const applyElasticBounds = (value: number, lowerBound: number, upperBound: number): number => {
  'worklet';
  if (value < lowerBound) {
    return lowerBound - rubberBandDistance(lowerBound - value);
  }
  if (value > upperBound) {
    return upperBound + rubberBandDistance(value - upperBound);
  }
  return value;
};

const findNearestPointIndex = (value: number, points: number[]): number => {
  'worklet';
  let closestIndex = 0;
  let minDist = Math.abs(value - (points[0] ?? value));
  for (let i = 1; i < points.length; i += 1) {
    const dist = Math.abs(value - points[i]);
    if (dist < minDist) {
      minDist = dist;
      closestIndex = i;
    }
  }
  return closestIndex;
};

const resolveSteppedSnapPoint = (
  value: number,
  velocity: number,
  gestureStartValue: number,
  points: number[]
): number => {
  'worklet';
  if (points.length === 0) {
    return value;
  }

  const lastIndex = points.length - 1;
  const startIndex = findNearestPointIndex(gestureStartValue, points);
  const dragDelta = value - gestureStartValue;
  const absDragDelta = Math.abs(dragDelta);
  const absVelocity = Math.abs(velocity);

  // Treat tiny movement as a tap/no-op regardless of noisy release velocity.
  if (absDragDelta <= STEP_SNAP_SMALL_DRAG_PX) {
    return points[startIndex];
  }

  const dragDirection =
    absDragDelta >= STEP_SNAP_DIRECTION_EPSILON_PX ? (dragDelta > 0 ? 1 : -1) : 0;
  const velocityDirection =
    absVelocity >= STEP_SNAP_DIRECTION_VELOCITY_EPS_PX_PER_S ? (velocity > 0 ? 1 : -1) : 0;

  if (dragDirection !== 0 && velocityDirection !== 0 && dragDirection !== velocityDirection) {
    if (
      absVelocity >= STEP_SNAP_REVERSAL_CANCEL_VELOCITY_PX_PER_S &&
      absDragDelta <= STEP_SNAP_REVERSAL_CANCEL_DRAG_PX
    ) {
      return points[startIndex];
    }
  }

  let direction = dragDirection;
  if (
    velocityDirection !== 0 &&
    (direction === 0 || absVelocity >= STEP_SNAP_DIRECTION_VELOCITY_OVERRIDE_PX_PER_S)
  ) {
    direction = velocityDirection;
  }

  if (direction === 0) {
    return points[startIndex];
  }

  const nextIndex = Math.min(Math.max(startIndex + direction, 0), lastIndex);
  if (nextIndex === startIndex) {
    return points[startIndex];
  }

  const distanceToNext = Math.max(1, Math.abs(points[nextIndex] - points[startIndex]));
  const rawProgress =
    direction > 0
      ? (value - points[startIndex]) / distanceToNext
      : (points[startIndex] - value) / distanceToNext;
  const progressTowardDirection = Math.max(0, rawProgress);
  const hasStepIntent =
    progressTowardDirection >= STEP_SNAP_PROGRESS_FOR_STEP ||
    absDragDelta >= STEP_SNAP_DRAG_PX ||
    absVelocity >= STEP_SNAP_VELOCITY_PX_PER_S;
  if (!hasStepIntent) {
    return points[startIndex];
  }

  const hasSkipIntent =
    absDragDelta >= STEP_SNAP_SKIP_DRAG_PX ||
    (progressTowardDirection >= STEP_SNAP_PROGRESS_FOR_SKIP &&
      absDragDelta >= STEP_SNAP_SKIP_DRAG_PX * 0.66) ||
    (absVelocity >= STEP_SNAP_SKIP_VELOCITY_PX_PER_S &&
      progressTowardDirection >= STEP_SNAP_SKIP_MIN_PROGRESS &&
      absDragDelta >= STEP_SNAP_SKIP_DRAG_PX * 0.55);
  const targetIndex = Math.min(
    Math.max(startIndex + direction * (hasSkipIntent ? 2 : 1), 0),
    lastIndex
  );

  return points[targetIndex];
};

const resolveSnapKeyFromValues = (
  value: number,
  expanded: number,
  middle: number,
  collapsed: number,
  hidden?: number
): SheetSnapPoint | 'hidden' | null => {
  'worklet';
  const entries: Array<[SheetSnapPoint | 'hidden', number]> = [
    ['expanded', expanded],
    ['middle', middle],
    ['collapsed', collapsed],
  ];
  if (typeof hidden === 'number') {
    entries.push(['hidden', hidden]);
  }
  let best: SheetSnapPoint | 'hidden' | null = null;
  let minDist = Number.MAX_VALUE;
  for (let i = 0; i < entries.length; i += 1) {
    const [key, val] = entries[i];
    const dist = Math.abs(value - val);
    if (dist < minDist) {
      minDist = dist;
      best = key;
    }
  }
  return best;
};

type BottomSheetWithFlashListProps<T> = {
  visible: boolean;
  listScrollEnabled?: boolean;
  snapPoints: SnapPoints;
  initialSnapPoint?: SheetSnapPoint;
  preservePositionOnSnapPointsChange?: boolean;
  data: ReadonlyArray<T>;
  renderItem: FlashListProps<T>['renderItem'];
  keyExtractor?: FlashListProps<T>['keyExtractor'];
  estimatedItemSize: number;
  listRef?: React.RefObject<FlashListRef<T> | null>;
  headerComponent?: React.ReactNode;
  backgroundComponent?: React.ReactNode;
  overlayComponent?: React.ReactNode;
  ListHeaderComponent?: FlashListProps<T>['ListHeaderComponent'];
  ListFooterComponent?: FlashListProps<T>['ListFooterComponent'];
  ListEmptyComponent?: FlashListProps<T>['ListEmptyComponent'];
  ItemSeparatorComponent?: FlashListProps<T>['ItemSeparatorComponent'];
  contentContainerStyle?: FlashListProps<T>['contentContainerStyle'];
  keyboardShouldPersistTaps?: FlashListProps<T>['keyboardShouldPersistTaps'];
  scrollIndicatorInsets?: FlashListProps<T>['scrollIndicatorInsets'];
  onHidden?: () => void;
  onSnapStart?: (snap: SheetSnapPoint | 'hidden', meta?: SnapChangeMeta) => void;
  onSnapChange?: (snap: SheetSnapPoint | 'hidden', meta?: SnapChangeMeta) => void;
  onScrollOffsetChange?: (offsetY: number) => void;
  onScrollBeginDrag?: () => void;
  onScrollEndDrag?: () => void;
  onMomentumBeginJS?: () => void;
  onMomentumEndJS?: () => void;
  onEndReached?: FlashListProps<T>['onEndReached'];
  onEndReachedThreshold?: FlashListProps<T>['onEndReachedThreshold'];
  showsVerticalScrollIndicator?: boolean;
  keyboardDismissMode?: FlashListProps<T>['keyboardDismissMode'];
  bounces?: boolean;
  alwaysBounceVertical?: boolean;
  overScrollMode?: FlashListProps<T>['overScrollMode'];
  testID?: string;
  extraData?: FlashListProps<T>['extraData'];
  onDragStateChange?: (isDragging: boolean) => void;
  onSettleStateChange?: (isSettling: boolean) => void;
  snapTo?: SheetSnapPoint | 'hidden' | null;
  snapToToken?: number;
  dismissThreshold?: number;
  listKey?: string;
  preventSwipeDismiss?: boolean;
  interactionEnabled?: boolean;
  animateOnMount?: boolean;
  flashListProps?: Partial<
    Omit<
      FlashListProps<T>,
      | 'data'
      | 'renderItem'
      | 'estimatedItemSize'
      | 'onScroll'
      | 'onMomentumScrollBegin'
      | 'onMomentumScrollEnd'
      | 'scrollEnabled'
      | 'ListHeaderComponent'
      | 'ListFooterComponent'
      | 'ListEmptyComponent'
      | 'ItemSeparatorComponent'
      | 'contentContainerStyle'
      | 'keyboardShouldPersistTaps'
      | 'keyExtractor'
    >
  >;
  sheetYValue?: SharedValue<number>;
  sheetYObserver?: SharedValue<number>;
  scrollOffsetValue?: SharedValue<number>;
  momentumFlag?: SharedValue<boolean>;
  style?: StyleProp<ViewStyle>;
  surfaceStyle?: StyleProp<ViewStyle>;
  shadowStyle?: StyleProp<ViewStyle>;
  contentSurfaceStyle?: StyleProp<ViewStyle>;
};

const PROGRAMMATIC_SNAP_MIN_VELOCITY = 900;
const PROGRAMMATIC_SNAP_MAX_VELOCITY = 2200;
const PROGRAMMATIC_SNAP_VELOCITY_PER_PX = 3.2;

const BottomSheetWithFlashList = <T,>({
  visible,
  listScrollEnabled = true,
  snapPoints,
  initialSnapPoint = 'middle',
  preservePositionOnSnapPointsChange = false,
  data,
  renderItem,
  keyExtractor,
  listRef: listRefProp,
  listKey,
  estimatedItemSize,
  headerComponent,
  backgroundComponent,
  overlayComponent,
  ListHeaderComponent,
  ListFooterComponent,
  ListEmptyComponent,
  ItemSeparatorComponent,
  contentContainerStyle,
  keyboardShouldPersistTaps = 'handled',
  scrollIndicatorInsets,
  onHidden,
  onSnapStart,
  onSnapChange,
  onScrollOffsetChange,
  onScrollBeginDrag,
  onScrollEndDrag,
  onMomentumBeginJS,
  onMomentumEndJS,
  onEndReached,
  onEndReachedThreshold,
  showsVerticalScrollIndicator,
  keyboardDismissMode,
  bounces,
  alwaysBounceVertical,
  overScrollMode,
  testID,
  extraData,
  onDragStateChange,
  onSettleStateChange,
  snapTo,
  snapToToken,
  dismissThreshold,
  preventSwipeDismiss = false,
  interactionEnabled = true,
  animateOnMount = false,
  flashListProps,
  sheetYValue,
  sheetYObserver,
  scrollOffsetValue,
  momentumFlag,
  style,
  surfaceStyle,
  shadowStyle,
  contentSurfaceStyle,
}: BottomSheetWithFlashListProps<T>): React.ReactElement | null => {
  const { height: screenHeight } = useWindowDimensions();
  const pixelRatio = PixelRatio.get();
  const shouldEnableScroll = visible && listScrollEnabled && interactionEnabled;
  const expandedSnap = snapPoints.expanded;
  const middleSnap = snapPoints.middle;
  const collapsedSnap = snapPoints.collapsed;
  const hiddenSnap = snapPoints.hidden;
  const initialSnapValue = snapPoints[initialSnapPoint];
  const hiddenOrCollapsed = hiddenSnap ?? collapsedSnap;
  const shouldAnimateOnMount = animateOnMount && visible && !sheetYValue;
  const initialSheetY = shouldAnimateOnMount
    ? hiddenOrCollapsed
    : visible
    ? initialSnapValue
    : hiddenOrCollapsed;
  const internalSheetY = useSharedValue(initialSheetY);
  const sheetY = sheetYValue ?? internalSheetY;
  const currentSnapKeyRef = React.useRef<SheetSnapPoint | 'hidden'>(
    visible ? initialSnapPoint : hiddenSnap !== undefined ? 'hidden' : 'collapsed'
  );
  const gestureEnabled = visible && interactionEnabled;
  const headerHeight = useSharedValue(0);
  const expandTouchInHeader = useSharedValue(false);
  const expandGestureOwner = useSharedValue(GESTURE_OWNER_SHEET);
  const expandHandoffLocked = useSharedValue(false);
  const expandStartedBelowExpanded = useSharedValue(false);
  const expandAllowTopElastic = useSharedValue(false);
  const collapseTouchInHeader = useSharedValue(false);
  const expandPanActive = useSharedValue(false);
  const expandDidHandoffToScroll = useSharedValue(false);
  const expandStartSheetY = useSharedValue(0);
  const expandStartTouchX = useSharedValue(0);
  const expandStartTouchY = useSharedValue(0);
  const expandLastTouchX = useSharedValue(0);
  const expandLastTouchY = useSharedValue(0);
  const expandAxisLock = useSharedValue(AXIS_LOCK_NONE);
  const collapsePanActive = useSharedValue(false);
  const collapseStartSheetY = useSharedValue(0);
  const collapseStartTouchX = useSharedValue(0);
  const collapseStartTouchY = useSharedValue(0);
  const collapseLastTouchX = useSharedValue(0);
  const collapseLastTouchY = useSharedValue(0);
  const collapseAxisLock = useSharedValue(AXIS_LOCK_NONE);
  const internalScrollOffset = useSharedValue(0);
  const scrollOffset = scrollOffsetValue ?? internalScrollOffset;
  const scrollTopOffset = useSharedValue(0);
  const internalMomentum = useSharedValue(false);
  const isInMomentum = momentumFlag ?? internalMomentum;
  const wasVisible = React.useRef(visible);
  const hasNotifiedHidden = useSharedValue(false);
  const internalListRef = React.useRef<FlashListRef<T> | null>(null);
  const flashListRef = listRefProp ?? internalListRef;
  const isDragging = useSharedValue(false);
  const isSettling = useSharedValue(false);
  const settlingToHidden = useSharedValue(false);
  const hasUserDrivenSheet = useSharedValue(false);
  const dragStartY = useSharedValue(initialSheetY);
  const springTargetY = useSharedValue(initialSheetY);
  const baseShowsVerticalScrollIndicatorSV = useSharedValue(Boolean(showsVerticalScrollIndicator));
  const springId = useSharedValue(0);
  const [touchBlockingEnabled, setTouchBlockingEnabled] = React.useState(false);
  const [effectiveShowsVerticalScrollIndicator, setEffectiveShowsVerticalScrollIndicator] =
    React.useState(Boolean(showsVerticalScrollIndicator));
  const setIndicatorVisible = React.useCallback((value: boolean) => {
    setEffectiveShowsVerticalScrollIndicator((prev) => (prev === value ? prev : value));
  }, []);

  React.useEffect(() => {
    const next = Boolean(showsVerticalScrollIndicator);
    baseShowsVerticalScrollIndicatorSV.value = next;
    if (!next) {
      setIndicatorVisible(false);
    }
  }, [baseShowsVerticalScrollIndicatorSV, setIndicatorVisible, showsVerticalScrollIndicator]);

  useAnimatedReaction(
    () => {
      const offscreenThreshold = screenHeight - 0.5;
      const isOffscreen = sheetY.value >= offscreenThreshold;
      return settlingToHidden.value || isOffscreen;
    },
    (next, prev) => {
      if (prev === undefined || next === prev) {
        return;
      }
      runOnJS(setTouchBlockingEnabled)(next);
    },
    [screenHeight, sheetY, settlingToHidden]
  );

  useAnimatedReaction(
    () => sheetY.value,
    (value) => {
      if (sheetYObserver) {
        sheetYObserver.value = value;
      }
    },
    [sheetYObserver]
  );

  const onHiddenRef = React.useRef(onHidden);
  const onSnapStartRef = React.useRef(onSnapStart);
  const onSnapChangeRef = React.useRef(onSnapChange);
  const onDragStateChangeRef = React.useRef(onDragStateChange);
  const onSettleStateChangeRef = React.useRef(onSettleStateChange);
  onHiddenRef.current = onHidden;
  onSnapStartRef.current = onSnapStart;
  onSnapChangeRef.current = onSnapChange;
  onDragStateChangeRef.current = onDragStateChange;
  onSettleStateChangeRef.current = onSettleStateChange;
  const lastSnapToRef = React.useRef<SheetSnapPoint | 'hidden' | null>(null);
  const lastSnapToTargetRef = React.useRef<number | null>(null);
  const lastSnapToTokenRef = React.useRef<number | null>(null);

  const notifyHidden = React.useCallback(() => {
    onHiddenRef.current?.();
  }, []);

  const notifySnapChange = React.useCallback(
    (
      snapKey: SheetSnapPoint | 'hidden',
      source: SnapChangeSource,
      options?: { force?: boolean }
    ) => {
      if (!options?.force && currentSnapKeyRef.current === snapKey) {
        return;
      }
      currentSnapKeyRef.current = snapKey;
      onSnapChangeRef.current?.(snapKey, { source });
    },
    []
  );

  const notifySnapStart = React.useCallback(
    (snapKey: SheetSnapPoint | 'hidden', source: SnapChangeSource) => {
      onSnapStartRef.current?.(snapKey, { source });
    },
    []
  );

  const notifyDragStateChange = React.useCallback((value: boolean) => {
    onDragStateChangeRef.current?.(value);
  }, []);

  const notifySettleStateChange = React.useCallback((value: boolean) => {
    onSettleStateChangeRef.current?.(value);
  }, []);

  useAnimatedReaction(
    () => isDragging.value,
    (value, prev) => {
      if (prev === undefined || prev === null || value === prev) {
        return;
      }
      runOnJS(notifyDragStateChange)(value);
    },
    [notifyDragStateChange]
  );

  useAnimatedReaction(
    () => isSettling.value,
    (value, prev) => {
      if (prev === undefined || prev === null || value === prev) {
        return;
      }
      runOnJS(notifySettleStateChange)(value);
    },
    [notifySettleStateChange]
  );

  useAnimatedReaction(
    () => {
      const atTop = isAtScrollTop(scrollOffset.value, scrollTopOffset.value);
      return baseShowsVerticalScrollIndicatorSV.value && !atTop;
    },
    (shouldShow, prevShouldShow) => {
      if (shouldShow === prevShouldShow) {
        return;
      }
      runOnJS(setIndicatorVisible)(shouldShow);
    },
    [baseShowsVerticalScrollIndicatorSV, scrollOffset, scrollTopOffset, setIndicatorVisible]
  );

  const animatedScrollHandler = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        const nextTopOffset = getScrollTopOffset(event.contentInset?.top);
        if (Math.abs(nextTopOffset - scrollTopOffset.value) > 0.5) {
          scrollTopOffset.value = nextTopOffset;
        }
        scrollOffset.value = event.contentOffset.y;
      },
      onBeginDrag: () => {
        isInMomentum.value = false;
      },
      onMomentumBegin: () => {
        isInMomentum.value = true;
        if (onMomentumBeginJS) {
          runOnJS(onMomentumBeginJS)();
        }
      },
      onMomentumEnd: () => {
        isInMomentum.value = false;
        if (onMomentumEndJS) {
          runOnJS(onMomentumEndJS)();
        }
        if (onScrollOffsetChange) {
          runOnJS(onScrollOffsetChange)(scrollOffset.value);
        }
      },
    },
    [
      isInMomentum,
      onMomentumBeginJS,
      onMomentumEndJS,
      onScrollOffsetChange,
      scrollOffset,
      scrollTopOffset,
    ]
  );

  const snapCandidates = React.useMemo(() => {
    const points = [snapPoints.expanded, snapPoints.middle, snapPoints.collapsed];
    if (typeof snapPoints.hidden === 'number' && !preventSwipeDismiss) {
      points.push(snapPoints.hidden);
    }
    points.sort((a, b) => a - b);
    const deduped: number[] = [];
    for (let i = 0; i < points.length; i += 1) {
      const candidate = points[i];
      const prev = deduped[deduped.length - 1];
      if (prev === undefined || Math.abs(candidate - prev) >= 0.5) {
        deduped.push(candidate);
      }
    }
    return deduped;
  }, [
    preventSwipeDismiss,
    snapPoints.collapsed,
    snapPoints.expanded,
    snapPoints.hidden,
    snapPoints.middle,
  ]);

  const dismissThresholdValue =
    typeof dismissThreshold === 'number'
      ? dismissThreshold
      : hiddenSnap !== undefined
      ? hiddenSnap - DEFAULT_DISMISS_SLOP
      : undefined;

  const resolveDestination = React.useCallback(
    (value: number, velocity: number, gestureStartValue: number): number => {
      'worklet';
      const upperBound = preventSwipeDismiss ? collapsedSnap : hiddenSnap ?? collapsedSnap;
      const clampedValue = clampValue(value, expandedSnap, upperBound);
      if (!preventSwipeDismiss && hiddenSnap !== undefined && dismissThresholdValue !== undefined) {
        if (dismissThresholdValue > collapsedSnap && clampedValue >= dismissThresholdValue) {
          return hiddenSnap;
        }
      }
      return resolveSteppedSnapPoint(clampedValue, velocity, gestureStartValue, snapCandidates);
    },
    [
      collapsedSnap,
      dismissThresholdValue,
      expandedSnap,
      hiddenSnap,
      preventSwipeDismiss,
      snapCandidates,
    ]
  );

  const startSpring = React.useCallback(
    (
      target: number,
      velocity = 0,
      shouldNotifyHidden = false,
      source: SnapChangeSource = 'programmatic'
    ) => {
      'worklet';
      springId.value += 1;
      const localSpringId = springId.value;
      const localSource = source;
      const shouldClampOvershoot = localSource !== 'gesture' && !hasUserDrivenSheet.value;
      const snapKeyAtStart = resolveSnapKeyFromValues(
        target,
        expandedSnap,
        middleSnap,
        collapsedSnap,
        hiddenSnap
      );
      if (snapKeyAtStart && snapKeyAtStart !== 'hidden') {
        runOnJS(notifySnapStart)(snapKeyAtStart, localSource);
      }
      springTargetY.value = target;
      settlingToHidden.value = hiddenSnap !== undefined && target === hiddenSnap;
      if (hiddenSnap !== undefined && target !== hiddenSnap) {
        hasNotifiedHidden.value = false;
      }
      isSettling.value = true;
      isDragging.value = false;
      sheetY.value = withSpring(
        target,
        {
          ...SHEET_SPRING_CONFIG,
          overshootClamping: shouldClampOvershoot ? true : SHEET_SPRING_CONFIG.overshootClamping,
          velocity,
        },
        (finished) => {
          'worklet';
          if (!finished || springId.value !== localSpringId) {
            return;
          }
          isSettling.value = false;
          settlingToHidden.value = false;
          springTargetY.value = target;
          const snapKey = resolveSnapKeyFromValues(
            target,
            expandedSnap,
            middleSnap,
            collapsedSnap,
            hiddenSnap
          );
          if (snapKey) {
            runOnJS(notifySnapChange)(snapKey, localSource);
            if (snapKey === 'hidden' && shouldNotifyHidden && !hasNotifiedHidden.value) {
              hasNotifiedHidden.value = true;
              runOnJS(notifyHidden)();
            }
          }
        }
      );
    },
    [
      collapsedSnap,
      expandedSnap,
      hiddenSnap,
      middleSnap,
      hasNotifiedHidden,
      hasUserDrivenSheet,
      notifyHidden,
      notifySnapStart,
      notifySnapChange,
      sheetY,
      settlingToHidden,
      springTargetY,
      springId,
    ]
  );

  const startSpringOnJS = React.useCallback(
    (
      target: number,
      velocity = 0,
      shouldNotifyHidden = false,
      source: SnapChangeSource = 'programmatic'
    ) => {
      runOnUI(startSpring)(target, velocity, shouldNotifyHidden, source);
    },
    [startSpring]
  );

  const resolveSnapValue = React.useCallback(
    (snapKey: SheetSnapPoint | 'hidden') => {
      switch (snapKey) {
        case 'expanded':
          return expandedSnap;
        case 'middle':
          return middleSnap;
        case 'collapsed':
          return collapsedSnap;
        case 'hidden':
          return hiddenSnap ?? collapsedSnap;
        default:
          return undefined;
      }
    },
    [collapsedSnap, expandedSnap, hiddenSnap, middleSnap]
  );

  const resolveProgrammaticSnapVelocity = React.useCallback(
    (fromValue: number, toValue: number) => {
      const delta = toValue - fromValue;
      if (Math.abs(delta) < 0.5) {
        return 0;
      }
      const direction = delta > 0 ? 1 : -1;
      const magnitude = Math.min(
        PROGRAMMATIC_SNAP_MAX_VELOCITY,
        Math.max(
          PROGRAMMATIC_SNAP_MIN_VELOCITY,
          Math.abs(delta) * PROGRAMMATIC_SNAP_VELOCITY_PER_PX
        )
      );
      return direction * magnitude;
    },
    []
  );

  React.useEffect(() => {
    if (sheetYValue) {
      return;
    }
    if (wasVisible.current === visible) {
      return;
    }
    const target = visible ? initialSnapValue : hiddenOrCollapsed;
    const shouldNotifyHidden = wasVisible.current && !visible;
    if (hiddenSnap !== undefined && target !== hiddenSnap) {
      hasNotifiedHidden.value = false;
    }
    wasVisible.current = visible;
    startSpringOnJS(target, 0, shouldNotifyHidden);
  }, [
    hasNotifiedHidden,
    hiddenOrCollapsed,
    hiddenSnap,
    initialSnapValue,
    sheetYValue,
    startSpringOnJS,
    visible,
  ]);

  React.useEffect(() => {
    if (sheetYValue) {
      return;
    }
    if (preservePositionOnSnapPointsChange) {
      return;
    }
    if (currentSnapKeyRef.current === 'hidden') {
      return;
    }
    const target = resolveSnapValue(currentSnapKeyRef.current);
    if (target === undefined) {
      return;
    }
    if (Math.abs(sheetY.value - target) < 0.5) {
      return;
    }
    startSpringOnJS(target, 0, false);
  }, [preservePositionOnSnapPointsChange, resolveSnapValue, sheetY, sheetYValue, startSpringOnJS]);

  React.useEffect(() => {
    if (!snapTo) {
      lastSnapToRef.current = null;
      lastSnapToTargetRef.current = null;
      lastSnapToTokenRef.current = null;
      return;
    }
    const target = resolveSnapValue(snapTo);
    if (target === undefined) {
      return;
    }
    if (
      snapTo === lastSnapToRef.current &&
      (snapToToken ?? null) === lastSnapToTokenRef.current &&
      lastSnapToTargetRef.current !== null &&
      Math.abs(lastSnapToTargetRef.current - target) < 0.5 &&
      Math.abs(sheetY.value - target) < 0.5
    ) {
      return;
    }
    lastSnapToRef.current = snapTo;
    lastSnapToTargetRef.current = target;
    lastSnapToTokenRef.current = snapToToken ?? null;
    if (Math.abs(sheetY.value - target) < 0.5) {
      notifySnapChange(snapTo, 'programmatic', { force: true });
      if (snapTo === 'hidden' && !hasNotifiedHidden.value) {
        hasNotifiedHidden.value = true;
        notifyHidden();
      }
      return;
    }
    if (hiddenSnap !== undefined && target !== hiddenSnap) {
      hasNotifiedHidden.value = false;
    }
    const velocity = resolveProgrammaticSnapVelocity(sheetY.value, target);
    startSpringOnJS(target, velocity, snapTo === 'hidden');
  }, [
    hasNotifiedHidden,
    hiddenSnap,
    lastSnapToTargetRef,
    notifyHidden,
    notifySnapChange,
    resolveProgrammaticSnapVelocity,
    resolveSnapValue,
    sheetY,
    snapTo,
    snapToToken,
    startSpringOnJS,
  ]);

  const onHeaderLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      const nextHeight = event.nativeEvent.layout.height;
      if (Math.abs(headerHeight.value - nextHeight) < 0.5) {
        return;
      }
      headerHeight.value = nextHeight;
    },
    [headerHeight]
  );

  const gestures = React.useMemo(() => {
    const upperBound = preventSwipeDismiss ? collapsedSnap : hiddenSnap ?? collapsedSnap;

    const beginDrag = (startY: number) => {
      'worklet';
      if (!isDragging.value) {
        isDragging.value = true;
      }
      springId.value += 1;
      isSettling.value = false;
      springTargetY.value = Number.NaN;
      hasUserDrivenSheet.value = true;
      dragStartY.value = startY;
    };

    const syncDragging = () => {
      'worklet';
      isDragging.value = expandPanActive.value || collapsePanActive.value;
    };

    const handoffExpandGestureToScroll = (
      stateManager?: { fail?: () => void },
      options?: { clampToExpanded?: boolean }
    ) => {
      'worklet';
      const shouldClampToExpanded =
        options?.clampToExpanded ?? sheetY.value > expandedSnap + DRAG_EPSILON;
      if (shouldClampToExpanded) {
        sheetY.value = expandedSnap;
      }
      expandPanActive.value = false;
      expandDidHandoffToScroll.value = true;
      expandGestureOwner.value = GESTURE_OWNER_SCROLL;
      expandHandoffLocked.value = true;
      syncDragging();
      stateManager?.fail?.();
    };

    const failExpandGesturePassThrough = (stateManager?: { fail?: () => void }) => {
      'worklet';
      expandPanActive.value = false;
      expandDidHandoffToScroll.value = true;
      syncDragging();
      stateManager?.fail?.();
    };

    const expandPanGesture = Gesture.Pan()
      .enabled(gestureEnabled)
      .manualActivation(true)
      .cancelsTouchesInView(false)
      .onTouchesDown((event) => {
        'worklet';
        expandPanActive.value = false;
        expandDidHandoffToScroll.value = false;
        expandAxisLock.value = AXIS_LOCK_NONE;
        const touchX = event.allTouches[0]?.absoluteX ?? 0;
        const touchY = event.allTouches[0]?.absoluteY ?? 0;
        expandLastTouchX.value = touchX;
        expandLastTouchY.value = touchY;
        expandStartTouchX.value = touchX;
        expandStartTouchY.value = touchY;
        expandStartSheetY.value = sheetY.value;
        expandTouchInHeader.value = touchY - sheetY.value <= headerHeight.value;
        const startedBelowExpanded = sheetY.value > expandedSnap + DRAG_EPSILON;
        expandStartedBelowExpanded.value = startedBelowExpanded;
        expandAllowTopElastic.value = !startedBelowExpanded && expandTouchInHeader.value;
        expandGestureOwner.value = GESTURE_OWNER_SHEET;
        expandHandoffLocked.value = false;
      })
      .onTouchesMove((event, stateManager) => {
        'worklet';
        if (!stateManager) {
          return;
        }

        const isAtExpandedNow = sheetY.value <= expandedSnap + DRAG_EPSILON;
        if (
          (expandGestureOwner.value === GESTURE_OWNER_SCROLL || expandHandoffLocked.value) &&
          isAtExpandedNow
        ) {
          handoffExpandGestureToScroll(stateManager);
          return;
        }

        const touchX = event.allTouches[0]?.absoluteX ?? expandLastTouchX.value;
        const touchY = event.allTouches[0]?.absoluteY ?? expandLastTouchY.value;
        const dx = touchX - expandLastTouchX.value;
        const dy = touchY - expandLastTouchY.value;
        expandLastTouchX.value = touchX;
        expandLastTouchY.value = touchY;

        if (!expandPanActive.value && expandAxisLock.value !== AXIS_LOCK_VERTICAL) {
          const totalDx = touchX - expandStartTouchX.value;
          const totalDy = touchY - expandStartTouchY.value;
          const absDx = Math.abs(totalDx);
          const absDy = Math.abs(totalDy);
          if (absDx + absDy >= AXIS_LOCK_SLOP_PX) {
            if (absDx > absDy * AXIS_LOCK_RATIO) {
              expandAxisLock.value = AXIS_LOCK_HORIZONTAL;
              failExpandGesturePassThrough(stateManager);
              return;
            }
            if (absDy > absDx * AXIS_LOCK_RATIO) {
              expandAxisLock.value = AXIS_LOCK_VERTICAL;
            } else {
              return;
            }
          } else if (dx !== 0 || dy !== 0) {
            return;
          }
        }

        const goingUp = dy < 0;
        const goingDown = dy > 0;
        if (!goingUp && !goingDown) {
          return;
        }

        const atExpanded = sheetY.value <= expandedSnap + DRAG_EPSILON;
        const atTop = isAtScrollTop(scrollOffset.value, scrollTopOffset.value);
        const touchInHeader = expandTouchInHeader.value;

        if (expandPanActive.value) {
          const shouldHandoffAtTop =
            expandStartedBelowExpanded.value || !expandAllowTopElastic.value;
          if (atExpanded && goingUp && shouldHandoffAtTop) {
            handoffExpandGestureToScroll(stateManager);
          }
          return;
        }

        if (!atExpanded) {
          const settlingTowardExpanded =
            isSettling.value && Math.abs(springTargetY.value - expandedSnap) <= DRAG_EPSILON;
          if (settlingTowardExpanded && !touchInHeader && isAtExpandedNow) {
            // Preserve in-flight overshoot settle while handing gesture ownership to the list.
            handoffExpandGestureToScroll(stateManager, { clampToExpanded: false });
            return;
          }
          stateManager.activate();
          expandPanActive.value = true;
          beginDrag(sheetY.value);
          expandStartSheetY.value = sheetY.value;
          expandStartTouchY.value = touchY;
          return;
        }

        if (goingUp) {
          if (expandAllowTopElastic.value) {
            stateManager.activate();
            expandPanActive.value = true;
            beginDrag(sheetY.value);
            expandStartSheetY.value = sheetY.value;
            expandStartTouchY.value = touchY;
            return;
          }
          handoffExpandGestureToScroll(stateManager);
          return;
        }

        if (touchInHeader) {
          stateManager.activate();
          expandPanActive.value = true;
          beginDrag(sheetY.value);
          expandStartSheetY.value = sheetY.value;
          expandStartTouchY.value = touchY;
          return;
        }

        if (atTop && !isInMomentum.value) {
          return;
        }

        handoffExpandGestureToScroll(stateManager);
      })
      .onChange((event) => {
        'worklet';
        if (!expandPanActive.value) {
          return;
        }
        const rawNext = expandStartSheetY.value + (event.absoluteY - expandStartTouchY.value);
        const allowTopElastic = expandAllowTopElastic.value && !expandHandoffLocked.value;
        const next = allowTopElastic
          ? applyElasticBounds(rawNext, expandedSnap, upperBound)
          : clampValue(rawNext, expandedSnap, upperBound);
        sheetY.value = next;
      })
      .onEnd((event, success) => {
        'worklet';
        expandPanActive.value = false;
        syncDragging();
        if (!success || expandDidHandoffToScroll.value) {
          return;
        }
        const destination = resolveDestination(sheetY.value, event.velocityY, dragStartY.value);
        startSpring(destination, event.velocityY, destination === hiddenSnap, 'gesture');
      })
      .onFinalize(() => {
        'worklet';
        expandPanActive.value = false;
        expandDidHandoffToScroll.value = false;
        expandAxisLock.value = AXIS_LOCK_NONE;
        syncDragging();
      });

    const collapsePanGesture = Gesture.Pan()
      .enabled(gestureEnabled)
      .manualActivation(true)
      .cancelsTouchesInView(false)
      .onTouchesDown((event) => {
        'worklet';
        collapsePanActive.value = false;
        collapseAxisLock.value = AXIS_LOCK_NONE;
        const touchX = event.allTouches[0]?.absoluteX ?? 0;
        const touchY = event.allTouches[0]?.absoluteY ?? 0;
        collapseLastTouchX.value = touchX;
        collapseLastTouchY.value = touchY;
        collapseStartTouchX.value = touchX;
        collapseStartTouchY.value = touchY;
        collapseStartSheetY.value = sheetY.value;
        collapseTouchInHeader.value = touchY - sheetY.value <= headerHeight.value;
      })
      .onTouchesMove((event, stateManager) => {
        'worklet';
        if (!stateManager || collapsePanActive.value) {
          return;
        }
        if (collapseTouchInHeader.value) {
          return;
        }

        const touchX = event.allTouches[0]?.absoluteX ?? collapseLastTouchX.value;
        const touchY = event.allTouches[0]?.absoluteY ?? collapseLastTouchY.value;
        const dx = touchX - collapseLastTouchX.value;
        const dy = touchY - collapseLastTouchY.value;
        collapseLastTouchX.value = touchX;
        collapseLastTouchY.value = touchY;

        if (collapseAxisLock.value !== AXIS_LOCK_VERTICAL) {
          const totalDx = touchX - collapseStartTouchX.value;
          const totalDy = touchY - collapseStartTouchY.value;
          const absDx = Math.abs(totalDx);
          const absDy = Math.abs(totalDy);
          if (absDx + absDy >= AXIS_LOCK_SLOP_PX) {
            if (absDx > absDy * AXIS_LOCK_RATIO) {
              collapseAxisLock.value = AXIS_LOCK_HORIZONTAL;
              syncDragging();
              stateManager.fail();
              return;
            }
            if (absDy > absDx * AXIS_LOCK_RATIO) {
              collapseAxisLock.value = AXIS_LOCK_VERTICAL;
            } else {
              return;
            }
          } else if (dx !== 0 || dy !== 0) {
            return;
          }
        }

        const goingDown = dy > 0;
        if (!goingDown) {
          return;
        }

        const atExpanded = sheetY.value <= expandedSnap + DRAG_EPSILON;
        const atTop = isAtScrollTop(scrollOffset.value, scrollTopOffset.value);

        if (atExpanded && atTop && !isInMomentum.value) {
          stateManager.activate();
          collapsePanActive.value = true;
          beginDrag(sheetY.value);
          collapseStartSheetY.value = sheetY.value;
          collapseStartTouchY.value = touchY;
        }
      })
      .onChange((event) => {
        'worklet';
        if (!collapsePanActive.value) {
          return;
        }
        const rawNext = collapseStartSheetY.value + (event.absoluteY - collapseStartTouchY.value);
        const next =
          expandHandoffLocked.value && rawNext <= expandedSnap
            ? expandedSnap
            : applyElasticBounds(rawNext, expandedSnap, upperBound);
        sheetY.value = next;
      })
      .onEnd((event, success) => {
        'worklet';
        collapsePanActive.value = false;
        syncDragging();
        if (!success) {
          return;
        }
        const destination = resolveDestination(sheetY.value, event.velocityY, dragStartY.value);
        startSpring(destination, event.velocityY, destination === hiddenSnap, 'gesture');
      })
      .onFinalize(() => {
        'worklet';
        collapsePanActive.value = false;
        collapseAxisLock.value = AXIS_LOCK_NONE;
        syncDragging();
      });

    const nativeScrollGesture = Gesture.Native()
      .enabled(shouldEnableScroll)
      .requireExternalGestureToFail(expandPanGesture)
      .simultaneousWithExternalGesture(collapsePanGesture);

    expandPanGesture.simultaneousWithExternalGesture(nativeScrollGesture);
    nativeScrollGesture.simultaneousWithExternalGesture(expandPanGesture);

    collapsePanGesture.simultaneousWithExternalGesture(nativeScrollGesture);

    return {
      sheet: Gesture.Simultaneous(expandPanGesture, collapsePanGesture),
      scroll: nativeScrollGesture,
    };
  }, [
    collapsedSnap,
    collapseLastTouchY,
    collapseLastTouchX,
    collapseAxisLock,
    collapsePanActive,
    collapseStartSheetY,
    collapseStartTouchX,
    collapseStartTouchY,
    collapseTouchInHeader,
    expandedSnap,
    expandDidHandoffToScroll,
    expandLastTouchY,
    expandLastTouchX,
    expandAxisLock,
    expandPanActive,
    expandStartSheetY,
    expandStartTouchX,
    expandStartTouchY,
    expandTouchInHeader,
    expandGestureOwner,
    expandHandoffLocked,
    expandStartedBelowExpanded,
    expandAllowTopElastic,
    gestureEnabled,
    headerHeight,
    hiddenSnap,
    hasUserDrivenSheet,
    isDragging,
    isInMomentum,
    isSettling,
    preventSwipeDismiss,
    resolveDestination,
    scrollOffset,
    scrollTopOffset,
    sheetY,
    shouldEnableScroll,
    dragStartY,
    springId,
    springTargetY,
    startSpring,
  ]);

  const ScrollComponent = React.useMemo(() => {
    const Component = React.forwardRef<ScrollView, ScrollViewProps>((props, ref) => (
      <GestureDetector gesture={gestures.scroll}>
        <AnimatedScrollView {...props} ref={ref} />
      </GestureDetector>
    ));
    Component.displayName = 'OverlaySheetScrollView';
    return Component;
  }, [gestures.scroll]);

  // Keep height fixed to avoid relayout of large lists during sheet drag.
  const sheetHeightStyle = React.useMemo(() => ({ height: screenHeight }), [screenHeight]);
  const animatedSheetStyle = useAnimatedStyle(
    () => ({
      transform: [{ translateY: Math.round(sheetY.value * pixelRatio) / pixelRatio }],
    }),
    [pixelRatio]
  );

  const sanitizedContentContainerStyle = React.useMemo(() => {
    if (!contentContainerStyle) {
      return undefined;
    }
    const flat = StyleSheet.flatten(contentContainerStyle) || {};
    const {
      padding,
      paddingTop,
      paddingRight,
      paddingBottom,
      paddingLeft,
      paddingHorizontal,
      paddingVertical,
      backgroundColor,
    } = flat;
    const sanitized: ViewStyle = {};
    if (padding !== undefined) {
      sanitized.padding = padding;
    }
    if (paddingTop !== undefined) {
      sanitized.paddingTop = paddingTop;
    }
    if (paddingRight !== undefined) {
      sanitized.paddingRight = paddingRight;
    }
    if (paddingBottom !== undefined) {
      sanitized.paddingBottom = paddingBottom;
    }
    if (paddingLeft !== undefined) {
      sanitized.paddingLeft = paddingLeft;
    }
    if (paddingHorizontal !== undefined) {
      sanitized.paddingHorizontal = paddingHorizontal;
    }
    if (paddingVertical !== undefined) {
      sanitized.paddingVertical = paddingVertical;
    }
    if (backgroundColor !== undefined) {
      sanitized.backgroundColor = backgroundColor;
    }
    return sanitized;
  }, [contentContainerStyle]);

  const resolvedFlashListProps = React.useMemo(() => {
    const overrideProps = {
      initialDrawBatchSize: DEFAULT_INITIAL_DRAW_BATCH_SIZE,
      ...(flashListProps?.overrideProps ?? {}),
    };
    return {
      drawDistance: DEFAULT_DRAW_DISTANCE,
      removeClippedSubviews: false,
      ...flashListProps,
      overrideProps,
    };
  }, [flashListProps]);

  const resolvedSurfaceStyle = surfaceStyle ?? overlaySheetStyles.surface;
  const resolvedShadowStyle = shadowStyle ?? overlaySheetStyles.shadowShell;
  const shadowShellStyle = [
    resolvedShadowStyle,
    Platform.OS === 'android' ? overlaySheetStyles.shadowShellAndroid : null,
  ];

  return (
    <GestureDetector gesture={gestures.sheet}>
      <Animated.View
        // Keep the sheet as a touch barrier whenever it's visible so taps don't "fall through"
        // to the map during brief interaction lockouts (e.g. overlay transitions).
        pointerEvents={visible && !touchBlockingEnabled ? 'auto' : 'none'}
        style={[style, sheetHeightStyle, animatedSheetStyle]}
      >
        <View style={shadowShellStyle}>
          <View style={resolvedSurfaceStyle}>
            {backgroundComponent ? (
              <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
                {backgroundComponent}
              </View>
            ) : null}
            {headerComponent ? <View onLayout={onHeaderLayout}>{headerComponent}</View> : null}
            <View style={[{ flex: 1 }, contentSurfaceStyle]}>
              <AnimatedFlashList
                key={listKey}
                ref={flashListRef as React.RefObject<FlashListRef<T>>}
                {...resolvedFlashListProps}
                data={data}
                renderItem={renderItem}
                keyExtractor={keyExtractor}
                estimatedItemSize={estimatedItemSize}
                contentContainerStyle={sanitizedContentContainerStyle}
                ListHeaderComponent={ListHeaderComponent}
                ListFooterComponent={ListFooterComponent}
                ListEmptyComponent={ListEmptyComponent}
                ItemSeparatorComponent={ItemSeparatorComponent}
                keyboardShouldPersistTaps={keyboardShouldPersistTaps}
                scrollEnabled={shouldEnableScroll}
                renderScrollComponent={ScrollComponent}
                onScroll={animatedScrollHandler}
                scrollEventThrottle={16}
                onScrollBeginDrag={(event) => {
                  onScrollBeginDrag?.();
                  flashListProps?.onScrollBeginDrag?.(event);
                }}
                onScrollEndDrag={(event) => {
                  onScrollEndDrag?.();
                  if (onScrollOffsetChange) {
                    onScrollOffsetChange(scrollOffset.value);
                  }
                  flashListProps?.onScrollEndDrag?.(event);
                }}
                onEndReached={onEndReached}
                onEndReachedThreshold={onEndReachedThreshold}
                showsVerticalScrollIndicator={effectiveShowsVerticalScrollIndicator}
                keyboardDismissMode={keyboardDismissMode}
                bounces={bounces}
                alwaysBounceVertical={alwaysBounceVertical}
                overScrollMode={overScrollMode}
                testID={testID}
                extraData={extraData}
                scrollIndicatorInsets={scrollIndicatorInsets}
              />
            </View>
            {overlayComponent ? (
              <View pointerEvents="box-none" style={StyleSheet.absoluteFillObject}>
                {overlayComponent}
              </View>
            ) : null}
          </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
};

export type { BottomSheetWithFlashListProps, SnapChangeMeta, SnapChangeSource, SnapPoints };
export default BottomSheetWithFlashList;
