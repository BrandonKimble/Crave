import React from 'react';
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollViewProps,
} from 'react-native';
import {
  PixelRatio,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { FlashListProps, FlashListRef } from '@shopify/flash-list';
import { FlashList } from '@shopify/flash-list';
import { Freeze } from 'react-freeze';
import Animated, {
  runOnJS,
  runOnUI,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { SHEET_SPRING_CONFIG, clampValue } from './sheetUtils';
import { overlaySheetStyles } from './overlaySheetStyles';
import BottomSheetScrollContainer from './BottomSheetScrollContainer';
import type { BottomSheetWithFlashListProps as BaseBottomSheetWithFlashListProps } from './bottomSheetWithFlashListContract';
import { isBottomSheetListSurface } from './bottomSheetWithFlashListContract';
import {
  resolveListContentContainerStyle,
  sanitizeContentContainerStyle,
} from './bottomSheetSurfaceStyleUtils';
import type {
  BottomSheetMotionCommand,
  BottomSheetSnap,
  BottomSheetSnapChangeSource,
} from './bottomSheetMotionTypes';
import {
  getActiveSearchNavSwitchPerfProbe,
  getActiveSearchNavSwitchProbeAgeMs,
} from '../screens/Search/runtime/shared/search-nav-switch-perf-probe';
import { useSearchRouteMountedSceneSurface } from './searchRouteMountedSceneRegistryStore';
import { logger } from '../utils';
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
export type BottomSheetWithFlashListProps<T> = BaseBottomSheetWithFlashListProps<T> & {
  scrollHeaderComponent?: React.ReactNode;
  snapTo?: BottomSheetSnap | null;
  snapToToken?: number;
  motionCommand?: SharedValue<BottomSheetMotionCommand | null>;
  sheetYValue?: SharedValue<number>;
  sheetYObserver?: SharedValue<number>;
  scrollOffsetValue?: SharedValue<number>;
  momentumFlag?: SharedValue<boolean>;
};

type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;
type SnapChangeOptions = {
  force?: boolean;
};
type HandoffOptions = {
  clampToExpanded?: boolean;
};
type GestureStateManagerLike = {
  activate: () => void;
  fail: () => void;
};
type SheetDiagSnapshot = {
  visible: boolean;
  listScrollEnabled: boolean;
  interactionEnabled: boolean;
  shouldEnableScroll: boolean;
  gestureEnabled: boolean;
  activeList: 'primary' | 'secondary';
  snapTo: BottomSheetSnap | null | undefined;
  snapToToken: number | null;
  currentSnapKey: BottomSheetSnap;
  dataCount: number;
  secondaryDataCount: number;
  touchBlockingEnabled: boolean;
  scrollHeaderHeight: number;
};

type SceneRegistryBodyRenderContext = {
  shouldEnableScroll: boolean;
  scrollHeaderComponent: React.ReactNode;
  scrollHeaderHeight: number;
  ScrollComponent: React.ComponentType<ScrollViewProps & React.RefAttributes<ScrollView>>;
  primaryScrollViewOnScroll: ScrollViewProps['onScroll'];
  primaryListOnScroll: FlashListProps<unknown>['onScroll'];
  secondaryListOnScroll: FlashListProps<unknown>['onScroll'];
  effectiveShowsVerticalScrollIndicator: boolean;
  resolvedKeyboardShouldPersistTaps: ScrollViewProps['keyboardShouldPersistTaps'];
  resolvedKeyboardDismissMode: ScrollViewProps['keyboardDismissMode'];
  resolvedBounces: ScrollViewProps['bounces'];
  resolvedAlwaysBounceVertical: ScrollViewProps['alwaysBounceVertical'];
  resolvedOverScrollMode: ScrollViewProps['overScrollMode'];
  resolvedScrollIndicatorInsets: ScrollViewProps['scrollIndicatorInsets'];
  resolvedTestID?: string;
  resolvedContentContainerStyle?: ScrollViewProps['contentContainerStyle'];
  activeFlashListProps?: BaseBottomSheetWithFlashListProps<unknown>['flashListProps'];
  scrollOffset: SharedValue<number>;
};

type SceneRegistryBodyLayerProps = {
  sceneKey: string;
  isActive: boolean;
  context: SceneRegistryBodyRenderContext;
};

type StaticContentSurfaceProps = {
  content: React.ReactNode;
  containerStyle?: ScrollViewProps['contentContainerStyle'];
  surfaceStyle?: ScrollViewProps['style'];
};

type SceneRegistryDecorLayerKind = 'underlay' | 'background' | 'overlay';

type SceneRegistryDecorLayerProps = {
  sceneKey: string;
  isActive: boolean;
  kind: SceneRegistryDecorLayerKind;
};

type SceneRegistryHeaderLayerProps = {
  sceneKey: string;
  isActive: boolean;
};

const reportSceneRegistryLayerRender = (
  layer: 'underlay' | 'background' | 'header' | 'overlay' | 'body',
  sceneKey: string,
  isActive: boolean,
  phase: 'mount' | 'update' | 'nested-update',
  actualDuration: number,
  baseDuration: number
) => {
  const activeProbe = getActiveSearchNavSwitchPerfProbe();
  if (!activeProbe) {
    return;
  }
  logger.debug('[NAV-SWITCH-SCENE-LAYER-PERF]', {
    seq: activeProbe.seq,
    from: activeProbe.from,
    to: activeProbe.to,
    ageMs: getActiveSearchNavSwitchProbeAgeMs(),
    layer,
    scene: sceneKey,
    active: isActive,
    phase,
    actualDurationMs: Number(actualDuration.toFixed(1)),
    baseDurationMs: Number(baseDuration.toFixed(1)),
  });
};

const SceneRegistryDecorLayer = React.memo(
  ({ sceneKey, isActive, kind }: SceneRegistryDecorLayerProps) => {
    const sceneSurface = useSearchRouteMountedSceneSurface(sceneKey as never, isActive);
    if (!sceneSurface) {
      return null;
    }
    const component =
      kind === 'underlay'
        ? sceneSurface.underlayComponent
        : kind === 'background'
          ? sceneSurface.backgroundComponent
          : sceneSurface.overlayComponent;
    if (!component) {
      return null;
    }

    const pointerEvents = kind === 'overlay' ? (isActive ? 'box-none' : 'none') : 'none';

    return (
      <React.Profiler
        id={`SceneRegistry:${kind}:${sceneKey}`}
        onRender={(_id, phase, actualDuration, baseDuration) => {
          reportSceneRegistryLayerRender(
            kind,
            sceneKey,
            isActive,
            phase as 'mount' | 'update' | 'nested-update',
            actualDuration,
            baseDuration
          );
        }}
      >
        <View
          key={`${kind}-${sceneKey}`}
          pointerEvents={pointerEvents}
          style={[
            StyleSheet.absoluteFillObject,
            isActive ? styles.visibleLayer : styles.hiddenLayer,
          ]}
        >
          {component}
        </View>
      </React.Profiler>
    );
  },
  (previousProps, nextProps) =>
    previousProps.isActive === nextProps.isActive &&
    previousProps.sceneKey === nextProps.sceneKey &&
    previousProps.kind === nextProps.kind
);

const SceneRegistryHeaderLayer = React.memo(
  ({ sceneKey, isActive }: SceneRegistryHeaderLayerProps) => {
    const sceneSurface = useSearchRouteMountedSceneSurface(sceneKey as never, isActive);
    if (!sceneSurface) {
      return null;
    }
    if (!sceneSurface.headerComponent) {
      return null;
    }

    return (
      <React.Profiler
        id={`SceneRegistry:header:${sceneKey}`}
        onRender={(_id, phase, actualDuration, baseDuration) => {
          reportSceneRegistryLayerRender(
            'header',
            sceneKey,
            isActive,
            phase as 'mount' | 'update' | 'nested-update',
            actualDuration,
            baseDuration
          );
        }}
      >
        <View
          key={`header-${sceneKey}`}
          pointerEvents={isActive ? 'auto' : 'none'}
          style={isActive ? styles.sceneHeaderActive : styles.sceneHeaderHidden}
        >
          {sceneSurface.headerComponent}
        </View>
      </React.Profiler>
    );
  },
  (previousProps, nextProps) =>
    previousProps.isActive === nextProps.isActive && previousProps.sceneKey === nextProps.sceneKey
);

const shouldSkipSceneRegistryBodyLayerUpdate = (
  previousProps: SceneRegistryBodyLayerProps,
  nextProps: SceneRegistryBodyLayerProps
): boolean => {
  if (
    previousProps.isActive !== nextProps.isActive ||
    previousProps.sceneKey !== nextProps.sceneKey
  ) {
    return false;
  }

  if (!previousProps.isActive && !nextProps.isActive) {
    return true;
  }

  return previousProps.context === nextProps.context;
};

const StaticContentSurface = React.memo(
  ({ content, containerStyle, surfaceStyle }: StaticContentSurfaceProps) => (
    <View style={surfaceStyle}>
      <View style={containerStyle}>{content}</View>
    </View>
  )
);

StaticContentSurface.displayName = 'StaticContentSurface';

const SceneRegistryBodyLayer = React.memo(
  ({ sceneKey, isActive, context }: SceneRegistryBodyLayerProps) => {
    const sceneSurface = useSearchRouteMountedSceneSurface(sceneKey as never, isActive);
    if (!sceneSurface) {
      return null;
    }
    const sceneKeyboardShouldPersistTaps =
      sceneSurface.keyboardShouldPersistTaps ?? context.resolvedKeyboardShouldPersistTaps;
    const sceneKeyboardDismissMode =
      sceneSurface.keyboardDismissMode ?? context.resolvedKeyboardDismissMode;
    const sceneBounces = sceneSurface.bounces ?? context.resolvedBounces;
    const sceneAlwaysBounceVertical =
      sceneSurface.alwaysBounceVertical ?? context.resolvedAlwaysBounceVertical;
    const sceneOverScrollMode = sceneSurface.overScrollMode ?? context.resolvedOverScrollMode;
    const sceneScrollIndicatorInsets =
      sceneSurface.scrollIndicatorInsets ?? context.resolvedScrollIndicatorInsets;
    const sceneFlashListProps = sceneSurface.flashListProps ?? context.activeFlashListProps;
    const sceneContentScrollMode =
      sceneSurface.surfaceKind === 'content'
        ? (sceneSurface.contentScrollMode ?? 'scroll')
        : 'scroll';
    const sceneContentComponent =
      sceneSurface.surfaceKind === 'content' ? sceneSurface.contentComponent : null;
    const sceneContentContainerStyle = React.useMemo(
      () =>
        sanitizeContentContainerStyle(
          sceneSurface.contentContainerStyle ?? context.resolvedContentContainerStyle
        ),
      [context.resolvedContentContainerStyle, sceneSurface.contentContainerStyle]
    );
    const sceneListContentContainerStyle = React.useMemo(
      () =>
        resolveListContentContainerStyle({
          baseStyle: sceneContentContainerStyle,
          hasScrollHeaderOverlay: context.scrollHeaderComponent != null,
          scrollHeaderHeight: context.scrollHeaderHeight,
        }),
      [context.scrollHeaderComponent, context.scrollHeaderHeight, sceneContentContainerStyle]
    );
    const sceneSurfaceStyle = React.useMemo(
      () =>
        StyleSheet.flatten([
          styles.sceneRegistryBodyLayer,
          sceneSurface.contentSurfaceStyle,
          isActive ? styles.visibleLayer : styles.hiddenLayer,
        ]) ?? undefined,
      [isActive, sceneSurface.contentSurfaceStyle]
    );
    const sceneTransparentSurfaceStyle = React.useMemo(
      () => (context.scrollHeaderComponent ? styles.transparentFlashListSurface : undefined),
      [context.scrollHeaderComponent]
    );
    const sceneStaticContentBody = React.useMemo(() => {
      if (
        sceneSurface.surfaceKind !== 'content' ||
        sceneContentScrollMode !== 'static' ||
        sceneContentComponent == null
      ) {
        return null;
      }
      return (
        <StaticContentSurface
          content={sceneContentComponent}
          containerStyle={sceneListContentContainerStyle}
          surfaceStyle={sceneTransparentSurfaceStyle}
        />
      );
    }, [
      sceneContentComponent,
      sceneContentScrollMode,
      sceneListContentContainerStyle,
      sceneSurface.surfaceKind,
      sceneTransparentSurfaceStyle,
    ]);

    const renderedBody = (() => {
      if (sceneSurface.surfaceKind === 'content') {
        return (
          <View
            key={`scene-${sceneKey}`}
            pointerEvents={isActive ? 'auto' : 'none'}
            style={sceneSurfaceStyle}
          >
            {sceneContentScrollMode === 'static' ? (
              sceneStaticContentBody
            ) : (
              <context.ScrollComponent
                style={sceneTransparentSurfaceStyle}
                contentContainerStyle={sceneListContentContainerStyle}
                keyboardShouldPersistTaps={sceneKeyboardShouldPersistTaps}
                scrollEnabled={context.shouldEnableScroll && isActive}
                onScroll={context.primaryScrollViewOnScroll}
                scrollEventThrottle={16}
                onScrollBeginDrag={(_event: ScrollEvent) => {
                  sceneSurface.onScrollBeginDrag?.();
                }}
                onScrollEndDrag={(_event: ScrollEvent) => {
                  sceneSurface.onScrollEndDrag?.();
                  sceneSurface.onScrollOffsetChange?.(context.scrollOffset.value);
                }}
                onMomentumScrollBegin={() => {
                  sceneSurface.onMomentumBeginJS?.();
                }}
                onMomentumScrollEnd={() => {
                  sceneSurface.onMomentumEndJS?.();
                  sceneSurface.onScrollOffsetChange?.(context.scrollOffset.value);
                }}
                showsVerticalScrollIndicator={
                  context.effectiveShowsVerticalScrollIndicator && isActive
                }
                keyboardDismissMode={sceneKeyboardDismissMode}
                bounces={sceneBounces}
                alwaysBounceVertical={sceneAlwaysBounceVertical}
                overScrollMode={sceneOverScrollMode}
                testID={sceneSurface.testID ?? context.resolvedTestID}
                scrollIndicatorInsets={sceneScrollIndicatorInsets}
              >
                {sceneSurface.contentComponent}
              </context.ScrollComponent>
            )}
          </View>
        );
      }

      const sceneSecondaryList = sceneSurface.secondaryList;
      const sceneShouldRenderDualLists = sceneSecondaryList != null;
      const sceneResolvedActiveList = sceneShouldRenderDualLists
        ? (sceneSurface.activeList ?? 'primary')
        : 'primary';
      const sceneResolvedFlashListProps = {
        drawDistance: DEFAULT_DRAW_DISTANCE,
        removeClippedSubviews: false,
        estimatedItemSize: sceneSurface.estimatedItemSize,
        ...sceneFlashListProps,
        overrideProps: {
          initialDrawBatchSize: DEFAULT_INITIAL_DRAW_BATCH_SIZE,
          ...(sceneFlashListProps?.overrideProps ?? {}),
        },
      };
      const sceneSecondaryFlashListProps = {
        drawDistance: DEFAULT_DRAW_DISTANCE,
        removeClippedSubviews: false,
        estimatedItemSize: sceneSecondaryList?.estimatedItemSize ?? sceneSurface.estimatedItemSize,
        ...sceneFlashListProps,
        ...(sceneSecondaryList?.flashListProps ?? {}),
        overrideProps: {
          initialDrawBatchSize: DEFAULT_INITIAL_DRAW_BATCH_SIZE,
          ...(sceneSecondaryList?.flashListProps?.overrideProps ??
            sceneFlashListProps?.overrideProps ??
            {}),
        },
      };
      const sceneFlashListSurfaceStyle =
        StyleSheet.flatten([
          sceneFlashListProps?.style,
          context.scrollHeaderComponent ? styles.transparentFlashListSurface : null,
        ]) ?? undefined;
      const sceneSecondaryFlashListSurfaceStyle =
        StyleSheet.flatten([
          sceneSecondaryList?.flashListProps?.style ?? sceneFlashListProps?.style,
          context.scrollHeaderComponent ? styles.transparentFlashListSurface : null,
        ]) ?? undefined;
      const sceneSecondaryContentContainerStyle = resolveListContentContainerStyle({
        baseStyle: sanitizeContentContainerStyle(
          sceneSecondaryList?.contentContainerStyle ??
            sceneSurface.contentContainerStyle ??
            context.resolvedContentContainerStyle
        ),
        hasScrollHeaderOverlay: context.scrollHeaderComponent != null,
        scrollHeaderHeight: context.scrollHeaderHeight,
      });

      return (
        <View
          key={`scene-${sceneKey}`}
          pointerEvents={isActive ? 'auto' : 'none'}
          style={sceneSurfaceStyle}
        >
          <View
            pointerEvents={
              !sceneShouldRenderDualLists || sceneResolvedActiveList === 'primary' ? 'auto' : 'none'
            }
            style={[
              sceneShouldRenderDualLists ? styles.dualListLayer : styles.singleListLayer,
              !sceneShouldRenderDualLists || sceneResolvedActiveList === 'primary'
                ? styles.visibleLayer
                : styles.hiddenLayer,
            ]}
          >
            <AnimatedFlashList
              key={`${sceneKey}:${sceneSurface.listKey ?? 'primary-list'}`}
              ref={sceneSurface.listRef}
              {...({
                ...sceneResolvedFlashListProps,
                style: sceneFlashListSurfaceStyle,
                data: sceneSurface.data,
                renderItem: sceneSurface.renderItem,
                keyExtractor: sceneSurface.keyExtractor,
                contentContainerStyle: sceneListContentContainerStyle,
              } as FlashListProps<unknown>)}
              ListHeaderComponent={
                !sceneShouldRenderDualLists || sceneResolvedActiveList === 'primary'
                  ? sceneSurface.ListHeaderComponent
                  : null
              }
              ListFooterComponent={
                !sceneShouldRenderDualLists || sceneResolvedActiveList === 'primary'
                  ? sceneSurface.ListFooterComponent
                  : null
              }
              ListEmptyComponent={
                !sceneShouldRenderDualLists || sceneResolvedActiveList === 'primary'
                  ? sceneSurface.ListEmptyComponent
                  : null
              }
              ItemSeparatorComponent={sceneSurface.ItemSeparatorComponent}
              keyboardShouldPersistTaps={sceneKeyboardShouldPersistTaps}
              scrollEnabled={
                context.shouldEnableScroll &&
                isActive &&
                (!sceneShouldRenderDualLists || sceneResolvedActiveList === 'primary')
              }
              renderScrollComponent={
                isActive && (!sceneShouldRenderDualLists || sceneResolvedActiveList === 'primary')
                  ? context.ScrollComponent
                  : undefined
              }
              onScroll={context.primaryListOnScroll}
              scrollEventThrottle={16}
              onScrollBeginDrag={(event: ScrollEvent) => {
                sceneSurface.onScrollBeginDrag?.();
                sceneFlashListProps?.onScrollBeginDrag?.(event);
              }}
              onScrollEndDrag={(event: ScrollEvent) => {
                sceneSurface.onScrollEndDrag?.();
                sceneSurface.onScrollOffsetChange?.(context.scrollOffset.value);
                sceneFlashListProps?.onScrollEndDrag?.(event);
              }}
              onEndReached={sceneSurface.onEndReached}
              onEndReachedThreshold={sceneSurface.onEndReachedThreshold}
              showsVerticalScrollIndicator={
                context.effectiveShowsVerticalScrollIndicator &&
                isActive &&
                (!sceneShouldRenderDualLists || sceneResolvedActiveList === 'primary')
              }
              keyboardDismissMode={sceneKeyboardDismissMode}
              bounces={sceneBounces}
              alwaysBounceVertical={sceneAlwaysBounceVertical}
              overScrollMode={sceneOverScrollMode}
              testID={sceneSurface.testID ?? context.resolvedTestID}
              extraData={sceneSurface.extraData}
              scrollIndicatorInsets={sceneScrollIndicatorInsets}
            />
          </View>
          {sceneShouldRenderDualLists && sceneSecondaryList ? (
            <View
              pointerEvents={isActive && sceneResolvedActiveList === 'secondary' ? 'auto' : 'none'}
              style={[
                styles.dualListLayer,
                sceneResolvedActiveList === 'secondary' ? styles.visibleLayer : styles.hiddenLayer,
              ]}
            >
              <AnimatedFlashList
                key={`${sceneKey}:${sceneSecondaryList.listKey ?? 'secondary-list'}`}
                ref={sceneSecondaryList.listRef}
                {...({
                  ...sceneSecondaryFlashListProps,
                  style: sceneSecondaryFlashListSurfaceStyle,
                  data: sceneSecondaryList.data,
                  renderItem: sceneSecondaryList.renderItem ?? sceneSurface.renderItem,
                  keyExtractor: sceneSecondaryList.keyExtractor ?? sceneSurface.keyExtractor,
                  contentContainerStyle: sceneSecondaryContentContainerStyle,
                } as FlashListProps<unknown>)}
                ListHeaderComponent={
                  sceneResolvedActiveList === 'secondary'
                    ? (sceneSecondaryList.ListHeaderComponent ?? sceneSurface.ListHeaderComponent)
                    : null
                }
                ListFooterComponent={
                  sceneResolvedActiveList === 'secondary'
                    ? (sceneSecondaryList.ListFooterComponent ?? sceneSurface.ListFooterComponent)
                    : null
                }
                ListEmptyComponent={
                  sceneResolvedActiveList === 'secondary'
                    ? (sceneSecondaryList.ListEmptyComponent ?? sceneSurface.ListEmptyComponent)
                    : null
                }
                ItemSeparatorComponent={
                  sceneSecondaryList.ItemSeparatorComponent ?? sceneSurface.ItemSeparatorComponent
                }
                keyboardShouldPersistTaps={sceneKeyboardShouldPersistTaps}
                scrollEnabled={
                  context.shouldEnableScroll && isActive && sceneResolvedActiveList === 'secondary'
                }
                renderScrollComponent={
                  isActive && sceneResolvedActiveList === 'secondary'
                    ? context.ScrollComponent
                    : undefined
                }
                onScroll={context.secondaryListOnScroll}
                scrollEventThrottle={16}
                onScrollBeginDrag={(event: ScrollEvent) => {
                  sceneSurface.onScrollBeginDrag?.();
                  (sceneSecondaryList.flashListProps ?? sceneFlashListProps)?.onScrollBeginDrag?.(
                    event
                  );
                }}
                onScrollEndDrag={(event: ScrollEvent) => {
                  sceneSurface.onScrollEndDrag?.();
                  sceneSurface.onScrollOffsetChange?.(context.scrollOffset.value);
                  (sceneSecondaryList.flashListProps ?? sceneFlashListProps)?.onScrollEndDrag?.(
                    event
                  );
                }}
                onEndReached={sceneSecondaryList.onEndReached ?? sceneSurface.onEndReached}
                onEndReachedThreshold={sceneSurface.onEndReachedThreshold}
                showsVerticalScrollIndicator={
                  context.effectiveShowsVerticalScrollIndicator &&
                  isActive &&
                  sceneResolvedActiveList === 'secondary'
                }
                keyboardDismissMode={sceneKeyboardDismissMode}
                bounces={sceneBounces}
                alwaysBounceVertical={sceneAlwaysBounceVertical}
                overScrollMode={sceneOverScrollMode}
                testID={sceneSecondaryList.testID ?? sceneSurface.testID ?? context.resolvedTestID}
                extraData={sceneSecondaryList.extraData ?? sceneSurface.extraData}
                scrollIndicatorInsets={
                  sceneSecondaryList.scrollIndicatorInsets ?? sceneScrollIndicatorInsets
                }
              />
            </View>
          ) : null}
        </View>
      );
    })();

    const shouldFreezeWhenHidden = sceneSurface.inactiveRenderMode !== 'live';

    return (
      <React.Profiler
        id={`SceneRegistry:body:${sceneKey}`}
        onRender={(_id, phase, actualDuration, baseDuration) => {
          reportSceneRegistryLayerRender(
            'body',
            sceneKey,
            isActive,
            phase as 'mount' | 'update' | 'nested-update',
            actualDuration,
            baseDuration
          );
        }}
      >
        <Freeze freeze={!isActive && shouldFreezeWhenHidden}>{renderedBody}</Freeze>
      </React.Profiler>
    );
  },
  shouldSkipSceneRegistryBodyLayerUpdate
);

const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList as React.ComponentType<object>
) as typeof FlashList;
const EMPTY_DATA: readonly never[] = [];

const getScrollTopOffset = (contentInsetTop?: number | null): number => {
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
const findNearestPointIndex = (value: number, points: readonly number[]): number => {
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
  points: readonly number[]
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
): BottomSheetSnap | null => {
  'worklet';
  const entries: Array<[BottomSheetSnap, number]> = [
    ['expanded', expanded],
    ['middle', middle],
    ['collapsed', collapsed],
  ];
  if (typeof hidden === 'number') {
    entries.push(['hidden', hidden]);
  }
  let best: BottomSheetSnap | null = null;
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
const PROGRAMMATIC_SNAP_MIN_VELOCITY = 900;
const PROGRAMMATIC_SNAP_MAX_VELOCITY = 2200;
const PROGRAMMATIC_SNAP_VELOCITY_PER_PX = 3.2;
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
  ...surfaceProps
}: BottomSheetWithFlashListProps<T>): React.ReactElement => {
  const sceneRegistryCandidate = surfaceProps as BaseBottomSheetWithFlashListProps<unknown> & {
    surfaceKind?: 'scene-registry';
    activeSceneKey?: string;
    sceneKeys?: string[];
  };
  const isSceneRegistrySurface = sceneRegistryCandidate.surfaceKind === 'scene-registry';
  const sceneRegistrySurfaceProps = isSceneRegistrySurface ? sceneRegistryCandidate : null;
  const sceneKeys = sceneRegistrySurfaceProps?.sceneKeys ?? null;
  const activeSceneKey = sceneRegistrySurfaceProps?.activeSceneKey ?? null;
  const isContentSurface = !isSceneRegistrySurface && surfaceProps.surfaceKind === 'content';
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
  const { height: screenHeight } = useWindowDimensions();
  const pixelRatio = PixelRatio.get();
  const resolvedListScrollEnabled = listScrollEnabled;
  const resolvedInteractionEnabled = interactionEnabled;
  const resolvedHeaderComponent = isSceneRegistrySurface ? null : headerComponent;
  const resolvedBackgroundComponent = isSceneRegistrySurface ? null : backgroundComponent;
  const resolvedOverlayComponent = isSceneRegistrySurface ? null : overlayComponent;
  const resolvedContentContainerStyle = contentContainerStyle;
  const resolvedKeyboardShouldPersistTaps = keyboardShouldPersistTaps;
  const resolvedScrollIndicatorInsets = scrollIndicatorInsets;
  const resolvedShowsVerticalScrollIndicator = showsVerticalScrollIndicator;
  const resolvedKeyboardDismissMode = keyboardDismissMode;
  const resolvedBounces = bounces;
  const resolvedAlwaysBounceVertical = alwaysBounceVertical;
  const resolvedOverScrollMode = overScrollMode;
  const resolvedTestID = testID;
  const resolvedActiveListProp = activeList;
  const resolvedOnScrollOffsetChange = onScrollOffsetChange;
  const resolvedOnScrollBeginDrag = onScrollBeginDrag;
  const resolvedOnScrollEndDrag = onScrollEndDrag;
  const resolvedOnMomentumBeginJS = onMomentumBeginJS;
  const resolvedOnMomentumEndJS = onMomentumEndJS;
  const activeFlashListProps = flashListProps;
  const shouldEnableScroll = visible && resolvedListScrollEnabled && resolvedInteractionEnabled;
  const isSearchResultsSheet = resolvedTestID === 'search-results-flatlist';
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
  const currentSnapKeyRef = React.useRef<BottomSheetSnap>(
    visible ? initialSnapPoint : hiddenSnap !== undefined ? 'hidden' : 'collapsed'
  );
  const gestureEnabled = visible && resolvedInteractionEnabled;
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
  const primaryScrollOffset = useSharedValue(0);
  const secondaryScrollOffset = useSharedValue(0);
  const primaryScrollTopOffset = useSharedValue(0);
  const secondaryScrollTopOffset = useSharedValue(0);
  const activePrimaryList = useSharedValue(true);
  const internalMomentum = useSharedValue(false);
  const isInMomentum = momentumFlag ?? internalMomentum;
  const wasVisible = React.useRef(visible);
  const hasNotifiedHidden = useSharedValue(false);
  const internalListRef = React.useRef<FlashListRef<T> | null>(null);
  const flashListRef = listRefProp ?? internalListRef;
  const internalSecondaryListRef = React.useRef<FlashListRef<T> | null>(null);
  const secondaryFlashListRef = secondaryList?.listRef ?? internalSecondaryListRef;
  const shouldRenderDualLists = !isContentSurface && secondaryList != null;
  const resolvedActiveList = shouldRenderDualLists ? resolvedActiveListProp : 'primary';
  const isDragging = useSharedValue(false);
  const isSettling = useSharedValue(false);
  const settlingToHidden = useSharedValue(false);
  const hasUserDrivenSheet = useSharedValue(false);
  const dragStartY = useSharedValue(initialSheetY);
  const springTargetY = useSharedValue(initialSheetY);
  const baseShowsVerticalScrollIndicatorSV = useSharedValue(
    Boolean(resolvedShowsVerticalScrollIndicator)
  );
  const springId = useSharedValue(0);
  const [touchBlockingEnabled, setTouchBlockingEnabled] = React.useState(false);
  const [scrollHeaderHeight, setScrollHeaderHeight] = React.useState(0);
  const [effectiveShowsVerticalScrollIndicator, setEffectiveShowsVerticalScrollIndicator] =
    React.useState(Boolean(resolvedShowsVerticalScrollIndicator));
  const setIndicatorVisible = React.useCallback((value: boolean) => {
    setEffectiveShowsVerticalScrollIndicator((prev) => (prev === value ? prev : value));
  }, []);
  React.useEffect(() => {
    const next = Boolean(resolvedShowsVerticalScrollIndicator);
    baseShowsVerticalScrollIndicatorSV.value = next;
    if (!next) {
      setIndicatorVisible(false);
    }
  }, [
    baseShowsVerticalScrollIndicatorSV,
    resolvedShowsVerticalScrollIndicator,
    setIndicatorVisible,
  ]);
  React.useEffect(() => {
    const shouldUsePrimary = resolvedActiveList === 'primary';
    runOnUI((usePrimary: boolean) => {
      'worklet';
      activePrimaryList.value = usePrimary;
      scrollOffset.value = usePrimary ? primaryScrollOffset.value : secondaryScrollOffset.value;
      scrollTopOffset.value = usePrimary
        ? primaryScrollTopOffset.value
        : secondaryScrollTopOffset.value;
    })(shouldUsePrimary);
  }, [
    activePrimaryList,
    primaryScrollOffset,
    primaryScrollTopOffset,
    resolvedActiveList,
    scrollOffset,
    scrollTopOffset,
    secondaryScrollOffset,
    secondaryScrollTopOffset,
  ]);
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
  const lastSnapToRef = React.useRef<BottomSheetSnap | null>(null);
  const lastSnapToTargetRef = React.useRef<number | null>(null);
  const lastSnapToTokenRef = React.useRef<number | null>(null);
  const notifyHidden = React.useCallback(() => {
    if (isSearchResultsSheet) {
      logger.info('[BOTTOM-SHEET-DIAG] hidden', {
        testID: resolvedTestID,
        listKey,
      });
    }
    onHiddenRef.current?.();
  }, [isSearchResultsSheet, listKey, resolvedTestID]);
  const notifySnapChange = React.useCallback(
    (
      snapKey: BottomSheetSnap,
      source: BottomSheetSnapChangeSource,
      options?: SnapChangeOptions
    ) => {
      if (!options?.force && currentSnapKeyRef.current === snapKey) {
        return;
      }
      if (isSearchResultsSheet) {
        logger.info('[BOTTOM-SHEET-DIAG] snapChange', {
          testID: resolvedTestID,
          listKey,
          snapKey,
          source,
          force: Boolean(options?.force),
        });
      }
      currentSnapKeyRef.current = snapKey;
      onSnapChangeRef.current?.(snapKey, { source });
    },
    [isSearchResultsSheet, listKey, resolvedTestID]
  );
  const dispatchSnapChange = React.useCallback(
    (
      snapKey: BottomSheetSnap,
      source: BottomSheetSnapChangeSource,
      options?: SnapChangeOptions
    ) => {
      if (source === 'gesture' && snapKey !== 'hidden') {
        return;
      }
      notifySnapChange(snapKey, source, options);
    },
    [notifySnapChange]
  );
  const notifySnapStart = React.useCallback(
    (snapKey: Exclude<BottomSheetSnap, 'hidden'>, source: BottomSheetSnapChangeSource) => {
      if (isSearchResultsSheet) {
        logger.info('[BOTTOM-SHEET-DIAG] snapStart', {
          testID: resolvedTestID,
          listKey,
          snapKey,
          source,
        });
      }
      onSnapStartRef.current?.(snapKey, { source });
    },
    [isSearchResultsSheet, listKey, resolvedTestID]
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
  const primaryAnimatedScrollHandler = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        const nextTopOffset = getScrollTopOffset(event.contentInset?.top);
        if (Math.abs(nextTopOffset - primaryScrollTopOffset.value) > 0.5) {
          primaryScrollTopOffset.value = nextTopOffset;
        }
        primaryScrollOffset.value = event.contentOffset.y;
        if (activePrimaryList.value) {
          if (Math.abs(nextTopOffset - scrollTopOffset.value) > 0.5) {
            scrollTopOffset.value = nextTopOffset;
          }
          scrollOffset.value = event.contentOffset.y;
        }
      },
      onBeginDrag: () => {
        if (!activePrimaryList.value) {
          return;
        }
        isInMomentum.value = false;
      },
      onMomentumBegin: () => {
        if (!activePrimaryList.value) {
          return;
        }
        isInMomentum.value = true;
        if (onMomentumBeginJS) {
          runOnJS(onMomentumBeginJS)();
        }
      },
      onMomentumEnd: () => {
        if (!activePrimaryList.value) {
          return;
        }
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
      activePrimaryList,
      isInMomentum,
      onMomentumBeginJS,
      onMomentumEndJS,
      onScrollOffsetChange,
      primaryScrollOffset,
      primaryScrollTopOffset,
      scrollOffset,
      scrollTopOffset,
    ]
  );
  const secondaryAnimatedScrollHandler = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        const nextTopOffset = getScrollTopOffset(event.contentInset?.top);
        if (Math.abs(nextTopOffset - secondaryScrollTopOffset.value) > 0.5) {
          secondaryScrollTopOffset.value = nextTopOffset;
        }
        secondaryScrollOffset.value = event.contentOffset.y;
        if (!activePrimaryList.value) {
          if (Math.abs(nextTopOffset - scrollTopOffset.value) > 0.5) {
            scrollTopOffset.value = nextTopOffset;
          }
          scrollOffset.value = event.contentOffset.y;
        }
      },
      onBeginDrag: () => {
        if (activePrimaryList.value) {
          return;
        }
        isInMomentum.value = false;
      },
      onMomentumBegin: () => {
        if (activePrimaryList.value) {
          return;
        }
        isInMomentum.value = true;
        if (onMomentumBeginJS) {
          runOnJS(onMomentumBeginJS)();
        }
      },
      onMomentumEnd: () => {
        if (activePrimaryList.value) {
          return;
        }
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
      activePrimaryList,
      isInMomentum,
      onMomentumBeginJS,
      onMomentumEndJS,
      onScrollOffsetChange,
      scrollOffset,
      scrollTopOffset,
      secondaryScrollOffset,
      secondaryScrollTopOffset,
    ]
  );
  const primaryListOnScroll =
    primaryAnimatedScrollHandler as unknown as FlashListProps<T>['onScroll'];
  const secondaryListOnScroll =
    secondaryAnimatedScrollHandler as unknown as FlashListProps<T>['onScroll'];
  const primaryScrollViewOnScroll =
    primaryAnimatedScrollHandler as unknown as ScrollViewProps['onScroll'];
  const snapCandidates = React.useMemo(() => {
    const points = [snapPoints.expanded, snapPoints.middle, snapPoints.collapsed];
    if (typeof snapPoints.hidden === 'number' && !preventSwipeDismiss) {
      points.push(snapPoints.hidden);
    }
    points.sort((a, b) => a - b);
    const deduped = [];
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
      const upperBound = preventSwipeDismiss ? collapsedSnap : (hiddenSnap ?? collapsedSnap);
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
      source: BottomSheetSnapChangeSource = 'programmatic'
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
            runOnJS(dispatchSnapChange)(snapKey, localSource);
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
      source: BottomSheetSnapChangeSource = 'programmatic'
    ) => {
      runOnUI(startSpring)(target, velocity, shouldNotifyHidden, source);
    },
    [startSpring]
  );
  const resolveSnapValue = React.useCallback(
    (snapKey: BottomSheetSnap) => {
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
    (fromValue: number, toValue: number): number => {
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
  const sheetDiagRef = React.useRef<SheetDiagSnapshot | null>(null);
  React.useEffect(() => {
    if (!isSearchResultsSheet) {
      return;
    }
    const nextSnapshot = {
      visible,
      listScrollEnabled: resolvedListScrollEnabled,
      interactionEnabled: resolvedInteractionEnabled,
      shouldEnableScroll,
      gestureEnabled,
      activeList: resolvedActiveList,
      snapTo,
      snapToToken: snapToToken ?? null,
      currentSnapKey: currentSnapKeyRef.current,
      dataCount: data.length,
      secondaryDataCount: secondaryList?.data.length ?? 0,
      touchBlockingEnabled,
      scrollHeaderHeight,
    };
    const previousSnapshot = sheetDiagRef.current;
    if (
      previousSnapshot &&
      previousSnapshot.visible === nextSnapshot.visible &&
      previousSnapshot.listScrollEnabled === nextSnapshot.listScrollEnabled &&
      previousSnapshot.interactionEnabled === nextSnapshot.interactionEnabled &&
      previousSnapshot.shouldEnableScroll === nextSnapshot.shouldEnableScroll &&
      previousSnapshot.gestureEnabled === nextSnapshot.gestureEnabled &&
      previousSnapshot.activeList === nextSnapshot.activeList &&
      previousSnapshot.snapTo === nextSnapshot.snapTo &&
      previousSnapshot.snapToToken === nextSnapshot.snapToToken &&
      previousSnapshot.currentSnapKey === nextSnapshot.currentSnapKey &&
      previousSnapshot.dataCount === nextSnapshot.dataCount &&
      previousSnapshot.secondaryDataCount === nextSnapshot.secondaryDataCount &&
      previousSnapshot.touchBlockingEnabled === nextSnapshot.touchBlockingEnabled &&
      previousSnapshot.scrollHeaderHeight === nextSnapshot.scrollHeaderHeight
    ) {
      return;
    }
    logger.info('[BOTTOM-SHEET-DIAG] props', {
      testID: resolvedTestID,
      listKey,
      ...nextSnapshot,
    });
    sheetDiagRef.current = nextSnapshot;
  }, [
    data.length,
    gestureEnabled,
    resolvedInteractionEnabled,
    isSearchResultsSheet,
    listKey,
    resolvedListScrollEnabled,
    resolvedActiveList,
    scrollHeaderHeight,
    secondaryList?.data.length,
    shouldEnableScroll,
    snapTo,
    snapToToken,
    resolvedTestID,
    touchBlockingEnabled,
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
      dispatchSnapChange(snapTo, 'programmatic', { force: true });
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
    dispatchSnapChange,
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
  const onScrollHeaderLayout = React.useCallback((event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    setScrollHeaderHeight((previous) =>
      Math.abs(previous - nextHeight) < 0.5 ? previous : nextHeight
    );
  }, []);
  React.useEffect(() => {
    if (scrollHeaderComponent == null && scrollHeaderHeight !== 0) {
      setScrollHeaderHeight(0);
    }
  }, [scrollHeaderComponent, scrollHeaderHeight]);
  const gestures = React.useMemo(() => {
    const upperBound = preventSwipeDismiss ? collapsedSnap : (hiddenSnap ?? collapsedSnap);
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
      stateManager: GestureStateManagerLike,
      options?: HandoffOptions
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
      stateManager.fail();
    };
    const failExpandGesturePassThrough = (stateManager: GestureStateManagerLike) => {
      'worklet';
      expandPanActive.value = false;
      expandDidHandoffToScroll.value = true;
      syncDragging();
      stateManager.fail();
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
      <BottomSheetScrollContainer
        {...props}
        ref={ref}
        gesture={gestures.scroll}
        transparent={scrollHeaderComponent != null}
      />
    ));
    Component.displayName = 'OverlaySheetScrollView';
    return Component;
  }, [gestures.scroll, scrollHeaderComponent]);
  // Keep height fixed to avoid relayout of large lists during sheet drag.
  const sheetHeightStyle = React.useMemo(() => ({ height: screenHeight }), [screenHeight]);
  const animatedSheetStyle = useAnimatedStyle(
    () => ({
      transform: [{ translateY: Math.round(sheetY.value * pixelRatio) / pixelRatio }],
    }),
    [pixelRatio]
  );
  const sanitizedContentContainerStyle = React.useMemo(
    () => sanitizeContentContainerStyle(resolvedContentContainerStyle),
    [resolvedContentContainerStyle]
  );
  const sanitizedSecondaryContentContainerStyle = React.useMemo(
    () =>
      sanitizeContentContainerStyle(
        secondaryList?.contentContainerStyle ?? resolvedContentContainerStyle
      ),
    [resolvedContentContainerStyle, secondaryList?.contentContainerStyle]
  );
  const listContentContainerStyle = React.useMemo(
    () =>
      resolveListContentContainerStyle({
        baseStyle: sanitizedContentContainerStyle,
        hasScrollHeaderOverlay: scrollHeaderComponent != null,
        scrollHeaderHeight,
      }),
    [sanitizedContentContainerStyle, scrollHeaderComponent, scrollHeaderHeight]
  );
  const secondaryListContentContainerStyle = React.useMemo(
    () =>
      resolveListContentContainerStyle({
        baseStyle: sanitizedSecondaryContentContainerStyle,
        hasScrollHeaderOverlay: scrollHeaderComponent != null,
        scrollHeaderHeight,
      }),
    [sanitizedSecondaryContentContainerStyle, scrollHeaderComponent, scrollHeaderHeight]
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
      // FlashList v2 keeps accepting this runtime prop even though the published
      // TS surface removed it; keep it for behavior parity with existing tuning.
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
  const resolvedSurfaceStyle = isSceneRegistrySurface
    ? styles.registrySurface
    : (surfaceStyle ?? overlaySheetStyles.surface);
  const resolvedShadowStyle = shadowStyle ?? overlaySheetStyles.shadowShell;
  const shadowShellStyle = [
    resolvedShadowStyle,
    Platform.OS === 'android' ? overlaySheetStyles.shadowShellAndroid : null,
  ];
  const scrollHeaderSyncStyle = useAnimatedStyle(() => {
    const relativeScrollY = scrollOffset.value - scrollTopOffset.value;
    return {
      transform: [{ translateY: -relativeScrollY }],
    };
  }, [scrollOffset, scrollTopOffset]);
  const sceneRegistryKeys = React.useMemo(
    () => (isSceneRegistrySurface && sceneKeys ? sceneKeys : []),
    [isSceneRegistrySurface, sceneKeys]
  );
  const sceneRegistryBodyContext = React.useMemo<SceneRegistryBodyRenderContext>(
    () => ({
      shouldEnableScroll,
      scrollHeaderComponent,
      scrollHeaderHeight,
      ScrollComponent,
      primaryScrollViewOnScroll,
      primaryListOnScroll,
      secondaryListOnScroll,
      effectiveShowsVerticalScrollIndicator,
      resolvedKeyboardShouldPersistTaps,
      resolvedKeyboardDismissMode,
      resolvedBounces,
      resolvedAlwaysBounceVertical,
      resolvedOverScrollMode,
      resolvedScrollIndicatorInsets,
      resolvedTestID,
      resolvedContentContainerStyle,
      activeFlashListProps:
        activeFlashListProps as BaseBottomSheetWithFlashListProps<unknown>['flashListProps'],
      scrollOffset,
    }),
    [
      ScrollComponent,
      activeFlashListProps,
      effectiveShowsVerticalScrollIndicator,
      primaryListOnScroll,
      primaryScrollViewOnScroll,
      resolvedAlwaysBounceVertical,
      resolvedBounces,
      resolvedContentContainerStyle,
      resolvedKeyboardDismissMode,
      resolvedKeyboardShouldPersistTaps,
      resolvedOverScrollMode,
      resolvedScrollIndicatorInsets,
      resolvedTestID,
      scrollHeaderComponent,
      scrollHeaderHeight,
      scrollOffset,
      secondaryListOnScroll,
      shouldEnableScroll,
    ]
  );
  const renderSceneRegistryUnderlayLayers = isSceneRegistrySurface
    ? sceneRegistryKeys.map((sceneKey) => (
        <SceneRegistryDecorLayer
          key={`underlay-${sceneKey}`}
          kind="underlay"
          sceneKey={sceneKey}
          isActive={sceneKey === activeSceneKey}
        />
      ))
    : null;
  const renderSceneRegistryBackgroundLayers = isSceneRegistrySurface
    ? sceneRegistryKeys.map((sceneKey) => (
        <SceneRegistryDecorLayer
          key={`background-${sceneKey}`}
          kind="background"
          sceneKey={sceneKey}
          isActive={sceneKey === activeSceneKey}
        />
      ))
    : null;
  const renderSceneRegistryHeaderLayers = isSceneRegistrySurface
    ? sceneRegistryKeys.map((sceneKey) => (
        <SceneRegistryHeaderLayer
          key={`header-${sceneKey}`}
          sceneKey={sceneKey}
          isActive={sceneKey === activeSceneKey}
        />
      ))
    : null;
  const renderSceneRegistryOverlayLayers = isSceneRegistrySurface
    ? sceneRegistryKeys.map((sceneKey) => (
        <SceneRegistryDecorLayer
          key={`overlay-${sceneKey}`}
          kind="overlay"
          sceneKey={sceneKey}
          isActive={sceneKey === activeSceneKey}
        />
      ))
    : null;
  const renderSceneRegistryBodyLayers = isSceneRegistrySurface
    ? sceneRegistryKeys.map((sceneKey) => (
        <SceneRegistryBodyLayer
          key={`scene-${sceneKey}`}
          sceneKey={sceneKey}
          isActive={sceneKey === activeSceneKey}
          context={sceneRegistryBodyContext}
        />
      ))
    : null;
  return (
    <GestureDetector gesture={gestures.sheet}>
      <Animated.View
        // Keep the sheet as a touch barrier whenever it's visible so taps don't "fall through"
        // to the map during brief interaction lockouts (e.g. overlay transitions).
        pointerEvents={visible && !touchBlockingEnabled ? 'auto' : 'none'}
        style={[style, sheetHeightStyle, animatedSheetStyle]}
      >
        {renderSceneRegistryUnderlayLayers}
        <View style={shadowShellStyle}>
          <View style={resolvedSurfaceStyle}>
            {isSceneRegistrySurface ? (
              renderSceneRegistryBackgroundLayers
            ) : resolvedBackgroundComponent ? (
              <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
                {resolvedBackgroundComponent}
              </View>
            ) : null}
            {isSceneRegistrySurface ? (
              <View onLayout={onHeaderLayout} style={styles.fixedHeader}>
                {renderSceneRegistryHeaderLayers}
              </View>
            ) : resolvedHeaderComponent ? (
              <View onLayout={onHeaderLayout} style={styles.fixedHeader}>
                {resolvedHeaderComponent}
              </View>
            ) : null}
            <View
              style={[styles.contentHost, !isSceneRegistrySurface ? contentSurfaceStyle : null]}
            >
              {scrollHeaderComponent ? (
                <Animated.View
                  onLayout={onScrollHeaderLayout}
                  style={[styles.scrollHeaderOverlay, scrollHeaderSyncStyle]}
                >
                  {scrollHeaderComponent}
                </Animated.View>
              ) : null}
              {isSceneRegistrySurface ? (
                renderSceneRegistryBodyLayers
              ) : isContentSurface ? (
                <View pointerEvents="auto" style={styles.singleListLayer}>
                  {contentScrollMode === 'static' ? (
                    <StaticContentSurface
                      content={contentComponent}
                      containerStyle={listContentContainerStyle}
                      surfaceStyle={flashListSurfaceStyle}
                    />
                  ) : (
                    <ScrollComponent
                      style={flashListSurfaceStyle}
                      contentContainerStyle={listContentContainerStyle}
                      keyboardShouldPersistTaps={resolvedKeyboardShouldPersistTaps}
                      scrollEnabled={shouldEnableScroll}
                      onScroll={primaryScrollViewOnScroll}
                      scrollEventThrottle={16}
                      onScrollBeginDrag={(_event: ScrollEvent) => {
                        resolvedOnScrollBeginDrag?.();
                      }}
                      onScrollEndDrag={(_event: ScrollEvent) => {
                        resolvedOnScrollEndDrag?.();
                        if (resolvedOnScrollOffsetChange) {
                          resolvedOnScrollOffsetChange(scrollOffset.value);
                        }
                      }}
                      onMomentumScrollBegin={() => {
                        resolvedOnMomentumBeginJS?.();
                      }}
                      onMomentumScrollEnd={() => {
                        resolvedOnMomentumEndJS?.();
                        if (resolvedOnScrollOffsetChange) {
                          resolvedOnScrollOffsetChange(scrollOffset.value);
                        }
                      }}
                      showsVerticalScrollIndicator={effectiveShowsVerticalScrollIndicator}
                      keyboardDismissMode={resolvedKeyboardDismissMode}
                      bounces={resolvedBounces}
                      alwaysBounceVertical={resolvedAlwaysBounceVertical}
                      overScrollMode={resolvedOverScrollMode}
                      testID={resolvedTestID}
                      scrollIndicatorInsets={resolvedScrollIndicatorInsets}
                    >
                      {contentComponent}
                    </ScrollComponent>
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
                      scrollEnabled={
                        shouldEnableScroll &&
                        (!shouldRenderDualLists || resolvedActiveList === 'primary')
                      }
                      renderScrollComponent={
                        !shouldRenderDualLists || resolvedActiveList === 'primary'
                          ? ScrollComponent
                          : undefined
                      }
                      onScroll={primaryListOnScroll}
                      scrollEventThrottle={16}
                      onScrollBeginDrag={(event: ScrollEvent) => {
                        resolvedOnScrollBeginDrag?.();
                        activeFlashListProps?.onScrollBeginDrag?.(event);
                      }}
                      onScrollEndDrag={(event: ScrollEvent) => {
                        resolvedOnScrollEndDrag?.();
                        if (resolvedOnScrollOffsetChange) {
                          resolvedOnScrollOffsetChange(scrollOffset.value);
                        }
                        activeFlashListProps?.onScrollEndDrag?.(event);
                      }}
                      onEndReached={onEndReached}
                      onEndReachedThreshold={onEndReachedThreshold}
                      showsVerticalScrollIndicator={
                        effectiveShowsVerticalScrollIndicator &&
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
                        scrollEnabled={shouldEnableScroll && resolvedActiveList === 'secondary'}
                        renderScrollComponent={
                          resolvedActiveList === 'secondary' ? ScrollComponent : undefined
                        }
                        onScroll={secondaryListOnScroll}
                        scrollEventThrottle={16}
                        onScrollBeginDrag={(event: ScrollEvent) => {
                          resolvedOnScrollBeginDrag?.();
                          (
                            secondaryList?.flashListProps ?? activeFlashListProps
                          )?.onScrollBeginDrag?.(event);
                        }}
                        onScrollEndDrag={(event: ScrollEvent) => {
                          resolvedOnScrollEndDrag?.();
                          if (resolvedOnScrollOffsetChange) {
                            resolvedOnScrollOffsetChange(scrollOffset.value);
                          }
                          (
                            secondaryList?.flashListProps ?? activeFlashListProps
                          )?.onScrollEndDrag?.(event);
                        }}
                        onEndReached={secondaryList.onEndReached ?? onEndReached}
                        onEndReachedThreshold={onEndReachedThreshold}
                        showsVerticalScrollIndicator={
                          effectiveShowsVerticalScrollIndicator &&
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
            {isSceneRegistrySurface ? (
              renderSceneRegistryOverlayLayers
            ) : resolvedOverlayComponent ? (
              <View pointerEvents="box-none" style={StyleSheet.absoluteFillObject}>
                {resolvedOverlayComponent}
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
  registrySurface: {
    ...overlaySheetStyles.surface,
    backgroundColor: 'transparent',
  },
  sceneHeaderActive: {},
  sceneHeaderHidden: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
  },
  sceneRegistryBodyLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  transparentFlashListSurface: {
    backgroundColor: 'transparent',
  },
});
export default BottomSheetWithFlashList;
