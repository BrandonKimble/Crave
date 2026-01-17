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

const AXIS_LOCK_SLOP_PX = 4;
const AXIS_LOCK_RATIO = 1.15;
const AXIS_LOCK_NONE = 0;
const AXIS_LOCK_HORIZONTAL = 1;
const AXIS_LOCK_VERTICAL = 2;

type SheetSnapPoint = 'expanded' | 'middle' | 'collapsed';

type SnapPoints = Record<SheetSnapPoint, number> & {
  hidden?: number;
};

type SnapChangeSource = 'gesture' | 'programmatic';
type SnapChangeMeta = { source: SnapChangeSource };

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList) as typeof FlashList;
const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

const snapPoint = (value: number, velocity: number, points: number[]): number => {
  'worklet';
  const projected = value + velocity * 0.35;
  let closest = points[0] ?? value;
  let minDist = Math.abs(projected - closest);
  for (let i = 1; i < points.length; i += 1) {
    const dist = Math.abs(projected - points[i]);
    if (dist < minDist) {
      minDist = dist;
      closest = points[i];
    }
  }
  return closest;
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
  listRef?: React.RefObject<FlashListRef<T>>;
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
  const internalMomentum = useSharedValue(false);
  const isInMomentum = momentumFlag ?? internalMomentum;
  const wasVisible = React.useRef(visible);
  const hasNotifiedHidden = useSharedValue(false);
  const internalListRef = React.useRef<FlashListRef<T> | null>(null);
  const flashListRef = listRefProp ?? internalListRef;
  const isDragging = useSharedValue(false);
  const isSettling = useSharedValue(false);
  const settlingToHidden = useSharedValue(false);
  const springId = useSharedValue(0);
  const [touchBlockingEnabled, setTouchBlockingEnabled] = React.useState(false);

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

  const animatedScrollHandler = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
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
    [onMomentumBeginJS, onMomentumEndJS, onScrollOffsetChange]
  );

  const snapCandidates = React.useMemo(() => {
    const points = [snapPoints.expanded, snapPoints.middle, snapPoints.collapsed];
    if (typeof snapPoints.hidden === 'number' && !preventSwipeDismiss) {
      points.push(snapPoints.hidden);
    }
    return points;
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
    (value: number, velocity: number): number => {
      'worklet';
      if (!preventSwipeDismiss && hiddenSnap !== undefined && dismissThresholdValue !== undefined) {
        if (dismissThresholdValue > collapsedSnap && value >= dismissThresholdValue) {
          return hiddenSnap;
        }
      }
      return snapPoint(value, velocity, snapCandidates);
    },
    [collapsedSnap, dismissThresholdValue, hiddenSnap, preventSwipeDismiss, snapCandidates]
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
          velocity,
        },
        (finished) => {
          'worklet';
          if (!finished || springId.value !== localSpringId) {
            return;
          }
          isSettling.value = false;
          settlingToHidden.value = false;
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
      notifyHidden,
      notifySnapStart,
      notifySnapChange,
      sheetY,
      settlingToHidden,
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

    const beginDrag = () => {
      'worklet';
      if (!isDragging.value) {
        isDragging.value = true;
      }
      springId.value += 1;
      isSettling.value = false;
    };

    const syncDragging = () => {
      'worklet';
      isDragging.value = expandPanActive.value || collapsePanActive.value;
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
      })
      .onTouchesMove((event, stateManager) => {
        'worklet';
        if (!stateManager) {
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
              expandDidHandoffToScroll.value = true;
              syncDragging();
              stateManager.fail();
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
        const atTop = scrollOffset.value <= TOP_EPSILON;
        const touchInHeader = expandTouchInHeader.value;

        if (expandPanActive.value) {
          if (atExpanded && goingUp && !touchInHeader) {
            sheetY.value = expandedSnap;
            expandPanActive.value = false;
            expandDidHandoffToScroll.value = true;
            syncDragging();
            stateManager.fail();
          }
          return;
        }

        if (!atExpanded) {
          stateManager.activate();
          expandPanActive.value = true;
          beginDrag();
          expandStartSheetY.value = sheetY.value;
          expandStartTouchY.value = touchY;
          return;
        }

        if (goingUp) {
          if (touchInHeader) {
            return;
          }
          expandDidHandoffToScroll.value = true;
          syncDragging();
          stateManager.fail();
          return;
        }

        if (touchInHeader) {
          stateManager.activate();
          expandPanActive.value = true;
          beginDrag();
          expandStartSheetY.value = sheetY.value;
          expandStartTouchY.value = touchY;
          return;
        }

        if (atTop && !isInMomentum.value) {
          return;
        }

        expandDidHandoffToScroll.value = true;
        syncDragging();
        stateManager.fail();
      })
      .onChange((event) => {
        'worklet';
        if (!expandPanActive.value) {
          return;
        }
        const next = clampValue(
          expandStartSheetY.value + (event.absoluteY - expandStartTouchY.value),
          expandedSnap,
          upperBound
        );
        sheetY.value = next;
      })
      .onEnd((event, success) => {
        'worklet';
        expandPanActive.value = false;
        syncDragging();
        if (!success || expandDidHandoffToScroll.value) {
          return;
        }
        const destination = resolveDestination(sheetY.value, event.velocityY);
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
        const atTop = scrollOffset.value <= TOP_EPSILON;

        if (atExpanded && atTop && !isInMomentum.value) {
          stateManager.activate();
          collapsePanActive.value = true;
          beginDrag();
          collapseStartSheetY.value = sheetY.value;
          collapseStartTouchY.value = touchY;
        }
      })
      .onChange((event) => {
        'worklet';
        if (!collapsePanActive.value) {
          return;
        }
        const next = clampValue(
          collapseStartSheetY.value + (event.absoluteY - collapseStartTouchY.value),
          expandedSnap,
          upperBound
        );
        sheetY.value = next;
      })
      .onEnd((event, success) => {
        'worklet';
        collapsePanActive.value = false;
        syncDragging();
        if (!success) {
          return;
        }
        const destination = resolveDestination(sheetY.value, event.velocityY);
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
    gestureEnabled,
    headerHeight,
    hiddenSnap,
    isDragging,
    isInMomentum,
    isSettling,
    preventSwipeDismiss,
    resolveDestination,
    scrollOffset,
    sheetY,
    shouldEnableScroll,
    springId,
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
        pointerEvents={visible && interactionEnabled && !touchBlockingEnabled ? 'auto' : 'none'}
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
                ref={flashListRef as React.RefObject<FlashList<T>>}
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
                showsVerticalScrollIndicator={showsVerticalScrollIndicator}
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
