import React from 'react';
import type { ScrollViewProps } from 'react-native';
import { Platform, StyleSheet, View } from 'react-native';

import type { FlashListProps, FlashListRef } from '@shopify/flash-list';
import { FlashList } from '@shopify/flash-list';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import type { BottomSheetWithFlashListProps as BaseBottomSheetWithFlashListProps } from './bottomSheetWithFlashListContract';
import { isBottomSheetListSurface } from './bottomSheetWithFlashListContract';
import type { BottomSheetMotionCommand } from './bottomSheetMotionTypes';
import { overlaySheetStyles } from './overlaySheetStyles';
import { resolveListContentContainerStyle } from './bottomSheetSurfaceStyleUtils';
import { useBottomSheetSharedRuntime } from './useBottomSheetSharedRuntime';

export type BottomSheetWithFlashListProps<T> = BaseBottomSheetWithFlashListProps<T> & {
  scrollHeaderComponent?: React.ReactNode;
  motionCommandValue?: SharedValue<BottomSheetMotionCommand | null>;
  sheetYValue?: SharedValue<number>;
  sheetYObserver?: SharedValue<number>;
  scrollOffsetValue?: SharedValue<number>;
  momentumFlag?: SharedValue<boolean>;
};

type StaticContentSurfaceProps = {
  content: React.ReactNode;
  containerStyle?: ScrollViewProps['contentContainerStyle'];
  surfaceStyle?: ScrollViewProps['style'];
};

const DEFAULT_DRAW_DISTANCE = 140;
const DEFAULT_INITIAL_DRAW_BATCH_SIZE = 8;
const EMPTY_DATA: readonly never[] = [];

const StaticContentSurface = React.memo(
  ({ content, containerStyle, surfaceStyle }: StaticContentSurfaceProps) => (
    <View style={surfaceStyle}>
      <View style={containerStyle}>{content}</View>
    </View>
  )
);

StaticContentSurface.displayName = 'StaticContentSurface';

const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList as React.ComponentType<object>
) as typeof FlashList;

const BottomSheetWithFlashList = <T,>({
  visible,
  listScrollEnabled = true,
  snapPoints,
  initialSnapPoint = 'middle',
  preservePositionOnSnapPointsChange = false,
  headerComponent,
  scrollHeaderComponent,
  backgroundComponent,
  overlayComponent,
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
  showsVerticalScrollIndicator,
  keyboardDismissMode,
  bounces,
  alwaysBounceVertical,
  overScrollMode,
  testID,
  activeList = 'primary',
  onDragStateChange,
  onSettleStateChange,
  onSnapSettleComplete,
  motionCommandValue,
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
  ...surfaceProps
}: BottomSheetWithFlashListProps<T>): React.ReactElement => {
  const isContentSurface = surfaceProps.surfaceKind === 'content';
  const listSurfaceProps = isBottomSheetListSurface(surfaceProps) ? surfaceProps : null;
  const data = listSurfaceProps?.data ?? (EMPTY_DATA as ReadonlyArray<T>);
  const renderItem = listSurfaceProps?.renderItem;
  const keyExtractor = listSurfaceProps?.keyExtractor;
  const listRefProp = listSurfaceProps?.listRef;
  const listKey = listSurfaceProps?.listKey;
  const estimatedItemSize = listSurfaceProps?.estimatedItemSize ?? DEFAULT_INITIAL_DRAW_BATCH_SIZE;
  const contentComponent = isContentSurface
    ? (surfaceProps as { contentComponent: React.ReactNode }).contentComponent
    : null;
  const contentScrollMode = isContentSurface
    ? ((surfaceProps as { contentScrollMode?: 'scroll' | 'static' }).contentScrollMode ?? 'scroll')
    : 'scroll';
  const ListHeaderComponent = listSurfaceProps?.ListHeaderComponent;
  const ListFooterComponent = listSurfaceProps?.ListFooterComponent;
  const ListEmptyComponent = listSurfaceProps?.ListEmptyComponent;
  const ItemSeparatorComponent = listSurfaceProps?.ItemSeparatorComponent;
  const onEndReached = listSurfaceProps?.onEndReached;
  const onEndReachedThreshold = listSurfaceProps?.onEndReachedThreshold;
  const extraData = listSurfaceProps?.extraData;
  const secondaryList = listSurfaceProps?.secondaryList;
  const secondaryRenderItem = secondaryList?.renderItem ?? renderItem;
  const secondaryKeyExtractor = secondaryList?.keyExtractor ?? keyExtractor;
  const secondaryEstimatedItemSize = secondaryList?.estimatedItemSize ?? estimatedItemSize;
  const secondaryListHeaderComponent = secondaryList?.ListHeaderComponent ?? ListHeaderComponent;
  const secondaryListFooterComponent = secondaryList?.ListFooterComponent ?? ListFooterComponent;
  const secondaryListEmptyComponent = secondaryList?.ListEmptyComponent ?? ListEmptyComponent;
  const secondaryItemSeparatorComponent =
    secondaryList?.ItemSeparatorComponent ?? ItemSeparatorComponent;
  const shouldRenderDualLists = !isContentSurface && secondaryList != null;
  const resolvedActiveList = shouldRenderDualLists ? activeList : 'primary';
  const activeFlashListProps = flashListProps;
  const resolvedContentContainerStyle = contentContainerStyle;
  const resolvedKeyboardShouldPersistTaps = keyboardShouldPersistTaps;
  const resolvedScrollIndicatorInsets = scrollIndicatorInsets;
  const resolvedShowsVerticalScrollIndicator = showsVerticalScrollIndicator;
  const resolvedKeyboardDismissMode = keyboardDismissMode;
  const resolvedBounces = bounces;
  const resolvedAlwaysBounceVertical = alwaysBounceVertical;
  const resolvedOverScrollMode = overScrollMode;
  const resolvedTestID = testID;

  const { gestureRuntime, scrollRuntime, surfaceRuntime } = useBottomSheetSharedRuntime({
    visible,
    listScrollEnabled,
    snapPoints,
    initialSnapPoint,
    preservePositionOnSnapPointsChange,
    scrollHeaderComponent,
    onHidden,
    onSnapStart,
    onSnapChange,
    onScrollOffsetChange,
    onMomentumBeginJS,
    onMomentumEndJS,
    showsVerticalScrollIndicator: resolvedShowsVerticalScrollIndicator,
    testID: resolvedTestID,
    activeList: resolvedActiveList,
    onDragStateChange,
    onSettleStateChange,
    onSnapSettleComplete,
    motionCommandValue,
    dismissThreshold,
    preventSwipeDismiss,
    interactionEnabled,
    animateOnMount,
    sheetYValue,
    sheetYObserver,
    scrollOffsetValue,
    momentumFlag,
    listKey,
    dataCount: data.length,
    secondaryDataCount: secondaryList?.data.length ?? 0,
  });

  const internalListRef = React.useRef<FlashListRef<T> | null>(null);
  const flashListRef = listRefProp ?? internalListRef;
  const internalSecondaryListRef = React.useRef<FlashListRef<T> | null>(null);
  const secondaryFlashListRef = secondaryList?.listRef ?? internalSecondaryListRef;

  // contentContainerStyle is a typed SceneBodyContentInsets object (compile-enforced
  // padding/backgroundColor contract) — applied directly, no runtime sanitizing.
  const sanitizedContentContainerStyle = resolvedContentContainerStyle;
  const sanitizedSecondaryContentContainerStyle =
    secondaryList?.contentContainerStyle ?? resolvedContentContainerStyle;
  const listContentContainerStyle = React.useMemo(
    () =>
      resolveListContentContainerStyle({
        baseStyle: sanitizedContentContainerStyle,
        hasScrollHeaderOverlay: scrollHeaderComponent != null,
        scrollHeaderHeight: scrollRuntime.scrollHeaderHeight,
      }),
    [sanitizedContentContainerStyle, scrollHeaderComponent, scrollRuntime.scrollHeaderHeight]
  );
  const secondaryListContentContainerStyle = React.useMemo(
    () =>
      resolveListContentContainerStyle({
        baseStyle: sanitizedSecondaryContentContainerStyle,
        hasScrollHeaderOverlay: scrollHeaderComponent != null,
        scrollHeaderHeight: scrollRuntime.scrollHeaderHeight,
      }),
    [
      sanitizedSecondaryContentContainerStyle,
      scrollHeaderComponent,
      scrollRuntime.scrollHeaderHeight,
    ]
  );
  const flashListSurfaceStyle = React.useMemo(
    () =>
      StyleSheet.flatten([
        activeFlashListProps?.style,
        scrollHeaderComponent ? styles.transparentFlashListSurface : null,
      ]) ?? undefined,
    [activeFlashListProps?.style, scrollHeaderComponent]
  );
  const secondaryFlashListSurfaceStyle = React.useMemo(
    () =>
      StyleSheet.flatten([
        secondaryList?.flashListProps?.style ?? activeFlashListProps?.style,
        scrollHeaderComponent ? styles.transparentFlashListSurface : null,
      ]) ?? undefined,
    [activeFlashListProps?.style, scrollHeaderComponent, secondaryList?.flashListProps?.style]
  );
  const resolvedFlashListProps = React.useMemo(() => {
    const overrideProps = {
      initialDrawBatchSize: DEFAULT_INITIAL_DRAW_BATCH_SIZE,
      ...(activeFlashListProps?.overrideProps ?? {}),
    };
    return {
      drawDistance: DEFAULT_DRAW_DISTANCE,
      removeClippedSubviews: false,
      estimatedItemSize,
      ...activeFlashListProps,
      overrideProps,
    };
  }, [activeFlashListProps, estimatedItemSize]);
  const resolvedSecondaryFlashListProps = React.useMemo(() => {
    const overrideProps = {
      initialDrawBatchSize: DEFAULT_INITIAL_DRAW_BATCH_SIZE,
      ...(secondaryList?.flashListProps?.overrideProps ??
        activeFlashListProps?.overrideProps ??
        {}),
    };
    return {
      drawDistance: DEFAULT_DRAW_DISTANCE,
      removeClippedSubviews: false,
      estimatedItemSize: secondaryEstimatedItemSize,
      ...activeFlashListProps,
      ...(secondaryList?.flashListProps ?? {}),
      overrideProps,
    };
  }, [activeFlashListProps, secondaryEstimatedItemSize, secondaryList?.flashListProps]);
  const resolvedSurfaceStyle = surfaceStyle ?? overlaySheetStyles.surface;
  const resolvedShadowStyle = shadowStyle ?? overlaySheetStyles.shadowShell;
  const shadowShellStyle = [
    resolvedShadowStyle,
    Platform.OS === 'android' ? overlaySheetStyles.shadowShellAndroid : null,
  ];

  return (
    <GestureDetector gesture={gestureRuntime.gestures.sheet}>
      <Animated.View
        pointerEvents={visible && !gestureRuntime.touchBlockingEnabled ? 'auto' : 'none'}
        style={[style, surfaceRuntime.sheetHeightStyle, surfaceRuntime.animatedSheetStyle]}
      >
        <View style={shadowShellStyle}>
          <View style={resolvedSurfaceStyle}>
            {backgroundComponent ? (
              <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
                {backgroundComponent}
              </View>
            ) : null}
            {headerComponent ? (
              <View onLayout={scrollRuntime.onHeaderLayout} style={styles.fixedHeader}>
                {headerComponent}
              </View>
            ) : null}
            <View style={[styles.contentHost, contentSurfaceStyle]}>
              {scrollHeaderComponent ? (
                <Animated.View
                  onLayout={scrollRuntime.onScrollHeaderLayout}
                  style={[styles.scrollHeaderOverlay, surfaceRuntime.scrollHeaderSyncStyle]}
                >
                  {scrollHeaderComponent}
                </Animated.View>
              ) : null}
              {isContentSurface ? (
                <View pointerEvents="auto" style={styles.singleListLayer}>
                  {contentScrollMode === 'static' ? (
                    <StaticContentSurface
                      content={contentComponent}
                      containerStyle={listContentContainerStyle}
                      surfaceStyle={flashListSurfaceStyle}
                    />
                  ) : (
                    <scrollRuntime.ScrollComponent
                      style={flashListSurfaceStyle}
                      contentContainerStyle={listContentContainerStyle}
                      keyboardShouldPersistTaps={resolvedKeyboardShouldPersistTaps}
                      onScroll={scrollRuntime.primaryScrollViewOnScroll}
                      scrollEventThrottle={16}
                      onScrollBeginDrag={() => {
                        onScrollBeginDrag?.();
                      }}
                      onScrollEndDrag={() => {
                        onScrollEndDrag?.();
                        onScrollOffsetChange?.(scrollRuntime.scrollOffset.value);
                      }}
                      onMomentumScrollBegin={() => {
                        onMomentumBeginJS?.();
                      }}
                      onMomentumScrollEnd={() => {
                        onMomentumEndJS?.();
                        onScrollOffsetChange?.(scrollRuntime.scrollOffset.value);
                      }}
                      showsVerticalScrollIndicator={
                        scrollRuntime.effectiveShowsVerticalScrollIndicator
                      }
                      keyboardDismissMode={resolvedKeyboardDismissMode}
                      bounces={resolvedBounces}
                      alwaysBounceVertical={resolvedAlwaysBounceVertical}
                      overScrollMode={resolvedOverScrollMode}
                      testID={resolvedTestID}
                      scrollIndicatorInsets={resolvedScrollIndicatorInsets}
                    >
                      {contentComponent}
                    </scrollRuntime.ScrollComponent>
                  )}
                </View>
              ) : (
                <>
                  <View
                    pointerEvents={
                      !shouldRenderDualLists || resolvedActiveList === 'primary' ? 'auto' : 'none'
                    }
                    style={[
                      shouldRenderDualLists ? styles.dualListLayer : styles.singleListLayer,
                      !shouldRenderDualLists || resolvedActiveList === 'primary'
                        ? styles.visibleLayer
                        : styles.hiddenLayer,
                    ]}
                  >
                    <AnimatedFlashList
                      key={listKey}
                      ref={flashListRef}
                      {...({
                        ...resolvedFlashListProps,
                        style: flashListSurfaceStyle,
                        data,
                        renderItem: renderItem!,
                        keyExtractor,
                        contentContainerStyle: listContentContainerStyle,
                      } as FlashListProps<T>)}
                      ListHeaderComponent={
                        !shouldRenderDualLists || resolvedActiveList === 'primary'
                          ? ListHeaderComponent
                          : null
                      }
                      ListFooterComponent={
                        !shouldRenderDualLists || resolvedActiveList === 'primary'
                          ? ListFooterComponent
                          : null
                      }
                      ListEmptyComponent={
                        !shouldRenderDualLists || resolvedActiveList === 'primary'
                          ? ListEmptyComponent
                          : null
                      }
                      ItemSeparatorComponent={ItemSeparatorComponent}
                      keyboardShouldPersistTaps={resolvedKeyboardShouldPersistTaps}
                      scrollEnabled={!shouldRenderDualLists || resolvedActiveList === 'primary'}
                      renderScrollComponent={
                        !shouldRenderDualLists || resolvedActiveList === 'primary'
                          ? scrollRuntime.ScrollComponent
                          : undefined
                      }
                      onScroll={scrollRuntime.primaryListOnScroll}
                      scrollEventThrottle={16}
                      onScrollBeginDrag={(event) => {
                        onScrollBeginDrag?.();
                        activeFlashListProps?.onScrollBeginDrag?.(event);
                      }}
                      onScrollEndDrag={(event) => {
                        onScrollEndDrag?.();
                        onScrollOffsetChange?.(scrollRuntime.scrollOffset.value);
                        activeFlashListProps?.onScrollEndDrag?.(event);
                      }}
                      onEndReached={onEndReached}
                      onEndReachedThreshold={onEndReachedThreshold}
                      showsVerticalScrollIndicator={
                        scrollRuntime.effectiveShowsVerticalScrollIndicator &&
                        (!shouldRenderDualLists || resolvedActiveList === 'primary')
                      }
                      keyboardDismissMode={resolvedKeyboardDismissMode}
                      bounces={resolvedBounces}
                      alwaysBounceVertical={resolvedAlwaysBounceVertical}
                      overScrollMode={resolvedOverScrollMode}
                      testID={resolvedTestID}
                      extraData={extraData}
                      scrollIndicatorInsets={resolvedScrollIndicatorInsets}
                    />
                  </View>
                  {shouldRenderDualLists && secondaryList ? (
                    <View
                      pointerEvents={resolvedActiveList === 'secondary' ? 'auto' : 'none'}
                      style={[
                        styles.dualListLayer,
                        resolvedActiveList === 'secondary'
                          ? styles.visibleLayer
                          : styles.hiddenLayer,
                      ]}
                    >
                      <AnimatedFlashList
                        key={secondaryList.listKey ?? 'secondary-list'}
                        ref={secondaryFlashListRef}
                        {...({
                          ...resolvedSecondaryFlashListProps,
                          style: secondaryFlashListSurfaceStyle,
                          data: secondaryList.data,
                          renderItem: secondaryRenderItem!,
                          keyExtractor: secondaryKeyExtractor,
                          contentContainerStyle: secondaryListContentContainerStyle,
                        } as FlashListProps<T>)}
                        ListHeaderComponent={
                          resolvedActiveList === 'secondary' ? secondaryListHeaderComponent : null
                        }
                        ListFooterComponent={
                          resolvedActiveList === 'secondary' ? secondaryListFooterComponent : null
                        }
                        ListEmptyComponent={
                          resolvedActiveList === 'secondary' ? secondaryListEmptyComponent : null
                        }
                        ItemSeparatorComponent={secondaryItemSeparatorComponent}
                        keyboardShouldPersistTaps={resolvedKeyboardShouldPersistTaps}
                        scrollEnabled={resolvedActiveList === 'secondary'}
                        renderScrollComponent={
                          resolvedActiveList === 'secondary'
                            ? scrollRuntime.ScrollComponent
                            : undefined
                        }
                        onScroll={scrollRuntime.secondaryListOnScroll}
                        scrollEventThrottle={16}
                        onScrollBeginDrag={(event) => {
                          onScrollBeginDrag?.();
                          (
                            secondaryList.flashListProps ?? activeFlashListProps
                          )?.onScrollBeginDrag?.(event);
                        }}
                        onScrollEndDrag={(event) => {
                          onScrollEndDrag?.();
                          onScrollOffsetChange?.(scrollRuntime.scrollOffset.value);
                          (secondaryList.flashListProps ?? activeFlashListProps)?.onScrollEndDrag?.(
                            event
                          );
                        }}
                        onEndReached={secondaryList.onEndReached ?? onEndReached}
                        onEndReachedThreshold={onEndReachedThreshold}
                        showsVerticalScrollIndicator={
                          scrollRuntime.effectiveShowsVerticalScrollIndicator &&
                          resolvedActiveList === 'secondary'
                        }
                        keyboardDismissMode={resolvedKeyboardDismissMode}
                        bounces={resolvedBounces}
                        alwaysBounceVertical={resolvedAlwaysBounceVertical}
                        overScrollMode={resolvedOverScrollMode}
                        testID={secondaryList.testID ?? resolvedTestID}
                        extraData={secondaryList.extraData ?? extraData}
                        scrollIndicatorInsets={
                          secondaryList.scrollIndicatorInsets ?? resolvedScrollIndicatorInsets
                        }
                      />
                    </View>
                  ) : null}
                </>
              )}
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

const styles = StyleSheet.create({
  contentHost: {
    flex: 1,
    position: 'relative',
  },
  fixedHeader: {
    zIndex: 3,
  },
  scrollHeaderOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  singleListLayer: {
    flex: 1,
  },
  dualListLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  visibleLayer: {
    opacity: 1,
  },
  hiddenLayer: {
    opacity: 0,
  },
  transparentFlashListSurface: {
    backgroundColor: 'transparent',
  },
});

export default BottomSheetWithFlashList;
