import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollViewProps,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { FlashList, type FlashListProps } from '@shopify/flash-list';
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { SHEET_SPRING_CONFIG, clampValue } from './sheetUtils';

const TOP_EPSILON = 2;
const EXPANDED_EPSILON = 4;

type SheetSnapPoint = 'expanded' | 'middle' | 'collapsed';

type SnapPoints = Record<SheetSnapPoint, number> & {
  hidden?: number;
};

type BottomSheetWithFlashListProps<T> = {
  visible: boolean;
  listScrollEnabled?: boolean;
  snapPoints: SnapPoints;
  initialSnapPoint?: SheetSnapPoint;
  data: ReadonlyArray<T>;
  renderItem: FlashListProps<T>['renderItem'];
  keyExtractor?: FlashListProps<T>['keyExtractor'];
  estimatedItemSize: number;
  listRef?: React.RefObject<FlashList<T>>;
  headerComponent?: React.ReactNode;
  backgroundComponent?: React.ReactNode;
  ListHeaderComponent?: FlashListProps<T>['ListHeaderComponent'];
  ListFooterComponent?: FlashListProps<T>['ListFooterComponent'];
  ListEmptyComponent?: FlashListProps<T>['ListEmptyComponent'];
  ItemSeparatorComponent?: FlashListProps<T>['ItemSeparatorComponent'];
  contentContainerStyle?: FlashListProps<T>['contentContainerStyle'];
  keyboardShouldPersistTaps?: FlashListProps<T>['keyboardShouldPersistTaps'];
  scrollIndicatorInsets?: FlashListProps<T>['scrollIndicatorInsets'];
  onHidden?: () => void;
  onSnapChange?: (snap: SheetSnapPoint | 'hidden') => void;
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
  scrollOffsetValue?: SharedValue<number>;
  momentumFlag?: SharedValue<boolean>;
  style?: StyleProp<ViewStyle>;
};

const snapPoint = (value: number, velocity: number, points: number[]): number => {
  'worklet';
  const projected = value + velocity * 0.2;
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

const BottomSheetWithFlashList = <T,>({
  visible,
  listScrollEnabled = true,
  snapPoints,
  initialSnapPoint = 'middle',
  data,
  renderItem,
  keyExtractor,
  listRef: listRefProp,
  estimatedItemSize,
  headerComponent,
  backgroundComponent,
  ListHeaderComponent,
  ListFooterComponent,
  ListEmptyComponent,
  ItemSeparatorComponent,
  contentContainerStyle,
  keyboardShouldPersistTaps = 'handled',
  scrollIndicatorInsets,
  onHidden,
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
  flashListProps,
  sheetYValue,
  scrollOffsetValue,
  momentumFlag,
  style,
}: BottomSheetWithFlashListProps<T>): React.ReactElement | null => {
  const shouldEnableScroll = visible && listScrollEnabled;
  const internalSheetY = useSharedValue(snapPoints[initialSnapPoint]);
  const sheetY = sheetYValue ?? internalSheetY;
  const expandedSnap = snapPoints.expanded;
  const middleSnap = snapPoints.middle;
  const collapsedSnap = snapPoints.collapsed;
  const hiddenSnap = snapPoints.hidden;
  const initialSnapValue = snapPoints[initialSnapPoint];
  const hiddenOrCollapsed = hiddenSnap ?? collapsedSnap;
  const currentSnapKeyRef = React.useRef<SheetSnapPoint | 'hidden'>(
    visible ? initialSnapPoint : hiddenSnap !== undefined ? 'hidden' : 'collapsed'
  );
  const headerHeight = useSharedValue(0);
  const expandTouchInHeader = useSharedValue(false);
  const collapseTouchInHeader = useSharedValue(false);
  const expandPanActive = useSharedValue(false);
  const expandDidHandoffToScroll = useSharedValue(false);
  const expandStartSheetY = useSharedValue(0);
  const expandStartTouchY = useSharedValue(0);
  const expandLastTouchY = useSharedValue(0);
  const collapsePanActive = useSharedValue(false);
  const collapseStartSheetY = useSharedValue(0);
  const collapseStartTouchY = useSharedValue(0);
  const collapseLastTouchY = useSharedValue(0);
  const internalScrollOffset = useSharedValue(0);
  const scrollOffset = scrollOffsetValue ?? internalScrollOffset;
  const internalMomentum = useSharedValue(false);
  const isInMomentum = momentumFlag ?? internalMomentum;
  const wasVisible = React.useRef(visible);
  const hasNotifiedHidden = useSharedValue(false);
  const internalListRef = React.useRef<FlashList<T> | null>(null);
  const flashListRef = listRefProp ?? internalListRef;

  const onHiddenRef = React.useRef(onHidden);
  const onSnapChangeRef = React.useRef(onSnapChange);
  onHiddenRef.current = onHidden;
  onSnapChangeRef.current = onSnapChange;

  const notifyHidden = React.useCallback(() => {
    onHiddenRef.current?.();
  }, []);

  const snapCandidates = React.useMemo(() => {
    const points = [snapPoints.expanded, snapPoints.middle, snapPoints.collapsed];
    if (typeof snapPoints.hidden === 'number') {
      points.push(snapPoints.hidden);
    }
    return points;
  }, [snapPoints.collapsed, snapPoints.expanded, snapPoints.hidden, snapPoints.middle]);

  const animateTo = React.useCallback(
    (target: number, velocity = 0, shouldNotifyHidden = false) => {
      const hiddenTarget = hiddenSnap;
      if (hiddenTarget !== undefined && target !== hiddenTarget) {
        hasNotifiedHidden.value = false;
      }
      const snapKey = resolveSnapKeyFromValues(
        target,
        expandedSnap,
        middleSnap,
        collapsedSnap,
        hiddenSnap
      );
      if (snapKey) {
        currentSnapKeyRef.current = snapKey;
        onSnapChangeRef.current?.(snapKey);
      }
      sheetY.value = withSpring(
        target,
        {
          ...SHEET_SPRING_CONFIG,
          velocity,
        },
        (finished) => {
          'worklet';
          if (finished && shouldNotifyHidden && !hasNotifiedHidden.value) {
            hasNotifiedHidden.value = true;
            runOnJS(notifyHidden)();
          }
        }
      );
    },
    [
      collapsedSnap,
      expandedSnap,
      hasNotifiedHidden,
      hiddenSnap,
      middleSnap,
      notifyHidden,
      onSnapChangeRef,
      sheetY,
    ]
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

  React.useEffect(() => {
    if (sheetYValue) {
      return;
    }
    const target = visible ? initialSnapValue : hiddenOrCollapsed;
    const shouldNotifyHidden = wasVisible.current && !visible;
    wasVisible.current = visible;
    animateTo(target, 0, shouldNotifyHidden);
  }, [animateTo, hiddenOrCollapsed, initialSnapValue, sheetYValue, visible]);

  React.useEffect(() => {
    if (sheetYValue) {
      return;
    }
    const target = resolveSnapValue(currentSnapKeyRef.current);
    if (target === undefined) {
      return;
    }
    if (Math.abs(sheetY.value - target) < 0.5) {
      return;
    }
    sheetY.value = withSpring(target, {
      ...SHEET_SPRING_CONFIG,
      velocity: 0,
    });
  }, [resolveSnapValue, sheetY, sheetYValue]);

  const onScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      scrollOffset.value = offsetY;
      onScrollOffsetChange?.(offsetY);
    },
    [onScrollOffsetChange, scrollOffset]
  );

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
    const expandPanGesture = Gesture.Pan()
      .enabled(visible)
      .manualActivation(true)
      .cancelsTouchesInView(false)
      .onTouchesDown((event) => {
        'worklet';
        expandPanActive.value = false;
        expandDidHandoffToScroll.value = false;
        const touchY = event.allTouches[0]?.absoluteY ?? 0;
        expandLastTouchY.value = touchY;
        expandStartTouchY.value = touchY;
        expandStartSheetY.value = sheetY.value;
        expandTouchInHeader.value = touchY - sheetY.value <= headerHeight.value;
      })
      .onTouchesMove((event, stateManager) => {
        'worklet';
        if (!stateManager) {
          return;
        }

        const touchY = event.allTouches[0]?.absoluteY ?? expandLastTouchY.value;
        const dy = touchY - expandLastTouchY.value;
        expandLastTouchY.value = touchY;

        const goingUp = dy < 0;
        const goingDown = dy > 0;
        if (!goingUp && !goingDown) {
          return;
        }

        const atExpanded = sheetY.value <= snapPoints.expanded + EXPANDED_EPSILON;
        const atTop = scrollOffset.value <= TOP_EPSILON;
        const touchInHeader = expandTouchInHeader.value;

        if (expandPanActive.value) {
          if (atExpanded && goingUp && !touchInHeader) {
            sheetY.value = snapPoints.expanded;
            expandPanActive.value = false;
            expandDidHandoffToScroll.value = true;
            stateManager.fail();
          }
          return;
        }

        if (!atExpanded) {
          stateManager.activate();
          expandPanActive.value = true;
          expandStartSheetY.value = sheetY.value;
          expandStartTouchY.value = touchY;
          return;
        }

        if (goingUp) {
          if (touchInHeader) {
            return;
          }
          expandDidHandoffToScroll.value = true;
          stateManager.fail();
          return;
        }

        if (touchInHeader) {
          stateManager.activate();
          expandPanActive.value = true;
          expandStartSheetY.value = sheetY.value;
          expandStartTouchY.value = touchY;
          return;
        }

        if (atTop && !isInMomentum.value) {
          return;
        }

        expandDidHandoffToScroll.value = true;
        stateManager.fail();
      })
      .onChange((event) => {
        'worklet';
        if (!expandPanActive.value) {
          return;
        }
        const next = clampValue(
          expandStartSheetY.value + (event.absoluteY - expandStartTouchY.value),
          snapPoints.expanded,
          snapPoints.hidden ?? snapPoints.collapsed
        );
        sheetY.value = next;
      })
      .onEnd((event, success) => {
        'worklet';
        expandPanActive.value = false;
        if (!success || expandDidHandoffToScroll.value) {
          return;
        }
        const destination = snapPoint(sheetY.value, event.velocityY, snapCandidates);
        runOnJS(animateTo)(destination, event.velocityY, destination === snapPoints.hidden);
      })
      .onFinalize(() => {
        'worklet';
        expandPanActive.value = false;
        expandDidHandoffToScroll.value = false;
      });

    const collapsePanGesture = Gesture.Pan()
      .enabled(visible)
      .manualActivation(true)
      .cancelsTouchesInView(false)
      .onTouchesDown((event) => {
        'worklet';
        collapsePanActive.value = false;
        const touchY = event.allTouches[0]?.absoluteY ?? 0;
        collapseLastTouchY.value = touchY;
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

        const touchY = event.allTouches[0]?.absoluteY ?? collapseLastTouchY.value;
        const dy = touchY - collapseLastTouchY.value;
        collapseLastTouchY.value = touchY;

        const goingDown = dy > 0;
        if (!goingDown) {
          return;
        }

        const atExpanded = sheetY.value <= snapPoints.expanded + EXPANDED_EPSILON;
        const atTop = scrollOffset.value <= TOP_EPSILON;

        if (atExpanded && atTop && !isInMomentum.value) {
          stateManager.activate();
          collapsePanActive.value = true;
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
          snapPoints.expanded,
          snapPoints.hidden ?? snapPoints.collapsed
        );
        sheetY.value = next;
      })
      .onEnd((event, success) => {
        'worklet';
        collapsePanActive.value = false;
        if (!success) {
          return;
        }
        const destination = snapPoint(sheetY.value, event.velocityY, snapCandidates);
        runOnJS(animateTo)(destination, event.velocityY, destination === snapPoints.hidden);
      })
      .onFinalize(() => {
        'worklet';
        collapsePanActive.value = false;
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
    animateTo,
    collapseLastTouchY,
    collapsePanActive,
    collapseStartSheetY,
    collapseStartTouchY,
    expandLastTouchY,
    expandPanActive,
    expandStartSheetY,
    expandStartTouchY,
    isInMomentum,
    scrollOffset,
    sheetY,
    snapCandidates,
    snapPoints.collapsed,
    snapPoints.expanded,
    snapPoints.hidden,
    snapPoints.middle,
    shouldEnableScroll,
    visible,
  ]);

  const ScrollComponent = React.useMemo(() => {
    const Component = React.forwardRef<ScrollView, ScrollViewProps>((props, ref) => (
      <GestureDetector gesture={gestures.scroll}>
        <ScrollView {...props} ref={ref} />
      </GestureDetector>
    ));
    Component.displayName = 'BottomSheetFlashListScrollView';
    return Component;
  }, [gestures.scroll]);

  const animatedSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));

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

  return (
    <GestureDetector gesture={gestures.sheet}>
      <Animated.View pointerEvents={visible ? 'auto' : 'none'} style={[style, animatedSheetStyle]}>
        {backgroundComponent}
        {headerComponent ? <View onLayout={onHeaderLayout}>{headerComponent}</View> : null}
        <View style={{ flex: 1 }}>
          <FlashList
            ref={flashListRef}
            {...flashListProps}
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
            onScroll={onScroll}
            scrollEventThrottle={16}
            onMomentumScrollBegin={(_event) => {
              isInMomentum.value = true;
              onMomentumBeginJS?.();
            }}
            onMomentumScrollEnd={(_event) => {
              isInMomentum.value = false;
              onMomentumEndJS?.();
            }}
            onScrollBeginDrag={(event) => {
              onScrollBeginDrag?.();
              flashListProps?.onScrollBeginDrag?.(event);
            }}
            onScrollEndDrag={(event) => {
              onScrollEndDrag?.();
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
      </Animated.View>
    </GestureDetector>
  );
};

export type { BottomSheetWithFlashListProps, SnapPoints };
export default BottomSheetWithFlashList;
