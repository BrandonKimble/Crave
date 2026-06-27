import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { FlashListProps } from '@shopify/flash-list';
import { FlashList } from '@shopify/flash-list';
import Animated from 'react-native-reanimated';

import type {
  BottomSheetSceneStackBodyContentEntry,
  BottomSheetSceneStackBodyDefaults,
  BottomSheetSceneStackBodyScrollRuntime,
  BottomSheetSceneStackBodyTransportEntry,
} from './bottomSheetSceneStackHostContract';
import type { ScrollEvent } from './bottomSheetSceneStackBodyLayerContract';
import { bottomSheetSceneStackHostStyles as styles } from './bottomSheetSceneStackHostStyles';
import {
  resolveListContentContainerStyle,
  sanitizeContentContainerStyle,
} from './bottomSheetSurfaceStyleUtils';
import { useSearchOverlayProfilerRender } from './SearchOverlayProfilerContext';
import {
  finishSearchNavSwitchRuntimeAttributionSpan,
  markSearchNavSwitchRuntimeAttribution,
  startSearchNavSwitchRuntimeAttributionSpan,
} from '../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';
import { useSearchNavSwitchCommitAttribution } from '../screens/Search/runtime/shared/use-search-nav-switch-commit-attribution';
import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../perf/perf-scenario-runtime-store';

const DEFAULT_DRAW_DISTANCE = 140;
const DEFAULT_INITIAL_DRAW_BATCH_SIZE = 8;
const INACTIVE_SECONDARY_DRAW_DISTANCE = 0;
const INACTIVE_SECONDARY_INITIAL_DRAW_BATCH_SIZE = 1;
const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList as React.ComponentType<object>
) as typeof FlashList;

type ListBodyContentSpec = Extract<
  BottomSheetSceneStackBodyContentEntry['bodyContentSpec'],
  { surfaceKind: 'list' }
>;

type BottomSheetSceneStackListBodySurfaceProps = {
  sceneKey: string;
  shouldRenderListBody: boolean;
  bodyDefaults: BottomSheetSceneStackBodyDefaults;
  bodyScrollRuntime: BottomSheetSceneStackBodyScrollRuntime;
  sceneBodyContentSpec: ListBodyContentSpec;
  sceneBodyTransportSpec: BottomSheetSceneStackBodyTransportEntry['bodyTransportSpec'];
};

type ActiveBottomSheetSceneStackListBodySurfaceProps = Omit<
  BottomSheetSceneStackListBodySurfaceProps,
  'shouldRenderListBody'
>;

type BottomSheetSceneStackListStaticDataSnapshot = {
  activeList?: BottomSheetSceneStackBodyTransportEntry['bodyTransportSpec']['activeList'];
  contentContainerStyle?: BottomSheetSceneStackBodyTransportEntry['bodyTransportSpec']['contentContainerStyle'];
  primaryListFooterComponent?: ListBodyContentSpec['ListFooterComponent'];
  primaryData?: ReadonlyArray<unknown>;
  primaryExtraData?: unknown;
  scrollIndicatorInsets?: BottomSheetSceneStackBodyTransportEntry['bodyTransportSpec']['scrollIndicatorInsets'];
  secondaryData?: ReadonlyArray<unknown>;
  secondaryExtraData?: unknown;
};

const EMPTY_LIST_DATA_SNAPSHOT: BottomSheetSceneStackListStaticDataSnapshot = {};

type ActiveSheetListSurfaceIdentityProbe = {
  activeList: unknown;
  bodyDefaults: unknown;
  bodyScrollRuntime: unknown;
  flashListProps: unknown;
  listChromeComponent: unknown;
  primaryData: unknown;
  primaryExtraData: unknown;
  primaryRenderItem: unknown;
  sceneBodyContentSpec: unknown;
  sceneBodyTransportSpec: unknown;
  secondaryData: unknown;
  secondaryExtraData: unknown;
  secondaryRenderItem: unknown;
};

const markActiveSheetListSurfaceIdentityDiff = ({
  next,
  previous,
  sceneKey,
}: {
  next: ActiveSheetListSurfaceIdentityProbe;
  previous: ActiveSheetListSurfaceIdentityProbe | null;
  sceneKey: string;
}): void => {
  if (previous == null) {
    return;
  }
  const changedFields = [
    previous.sceneBodyContentSpec !== next.sceneBodyContentSpec ? 'contentSpec' : null,
    previous.sceneBodyTransportSpec !== next.sceneBodyTransportSpec ? 'transportSpec' : null,
    previous.primaryData !== next.primaryData ? 'primaryData' : null,
    previous.secondaryData !== next.secondaryData ? 'secondaryData' : null,
    previous.primaryRenderItem !== next.primaryRenderItem ? 'primaryRenderItem' : null,
    previous.secondaryRenderItem !== next.secondaryRenderItem ? 'secondaryRenderItem' : null,
    previous.primaryExtraData !== next.primaryExtraData ? 'primaryExtraData' : null,
    previous.secondaryExtraData !== next.secondaryExtraData ? 'secondaryExtraData' : null,
    previous.activeList !== next.activeList ? 'activeList' : null,
    previous.flashListProps !== next.flashListProps ? 'flashListProps' : null,
    previous.listChromeComponent !== next.listChromeComponent ? 'listChromeComponent' : null,
    previous.bodyDefaults !== next.bodyDefaults ? 'bodyDefaults' : null,
    previous.bodyScrollRuntime !== next.bodyScrollRuntime ? 'bodyScrollRuntime' : null,
  ].filter((field): field is string => field != null);
  if (changedFields.length === 0) {
    return;
  }
  const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
  if (!isPerfScenarioAttributionActive(scenarioConfig)) {
    return;
  }

  logPerfScenarioAttributionEvent('WorkSpan', scenarioConfig, {
    event: 'scenario_work_span',
    owner: 'active_sheet_list_surface_identity_diff',
    path: changedFields.join('|'),
    durationMs: 0,
    sceneKey,
    activeList: typeof next.activeList === 'string' ? next.activeList : null,
    primaryRowCount: Array.isArray(next.primaryData) ? next.primaryData.length : null,
    secondaryRowCount: Array.isArray(next.secondaryData) ? next.secondaryData.length : null,
  });
};

const ActiveBottomSheetSceneStackListBodySurface = React.memo(
  ({
    sceneKey,
    bodyDefaults,
    bodyScrollRuntime,
    sceneBodyContentSpec,
    sceneBodyTransportSpec,
  }: ActiveBottomSheetSceneStackListBodySurfaceProps) => {
    useSearchNavSwitchCommitAttribution(`ActiveBottomSheetSceneStackListBodySurface:${sceneKey}`);
    const onProfilerRender = useSearchOverlayProfilerRender();
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
    const listDataAuthoritySnapshot = EMPTY_LIST_DATA_SNAPSHOT;
    const scenePrimaryData = listDataAuthoritySnapshot.primaryData ?? sceneBodyContentSpec.data;
    const scenePrimaryExtraData =
      listDataAuthoritySnapshot.primaryExtraData ?? sceneBodyContentSpec.extraData;
    const sceneKeyboardShouldPersistTaps =
      sceneBodyTransportSpec.keyboardShouldPersistTaps ??
      bodyDefaults.resolvedKeyboardShouldPersistTaps;
    const sceneKeyboardDismissMode =
      sceneBodyTransportSpec.keyboardDismissMode ?? bodyDefaults.resolvedKeyboardDismissMode;
    const sceneScrollIndicatorInsets =
      listDataAuthoritySnapshot.scrollIndicatorInsets ??
      sceneBodyTransportSpec.scrollIndicatorInsets ??
      bodyDefaults.resolvedScrollIndicatorInsets;
    const sceneFlashListProps =
      sceneBodyTransportSpec.flashListProps ?? bodyDefaults.activeFlashListProps;
    const sceneContentContainerStyle = React.useMemo(
      () =>
        sanitizeContentContainerStyle(
          listDataAuthoritySnapshot.contentContainerStyle ??
            sceneBodyTransportSpec.contentContainerStyle ??
            bodyDefaults.resolvedContentContainerStyle
        ),
      [
        bodyDefaults.resolvedContentContainerStyle,
        listDataAuthoritySnapshot.contentContainerStyle,
        sceneBodyTransportSpec.contentContainerStyle,
      ]
    );
    const sceneListContentContainerStyle = React.useMemo(
      () =>
        resolveListContentContainerStyle({
          baseStyle: sceneContentContainerStyle,
          hasScrollHeaderOverlay: bodyDefaults.scrollHeaderComponent != null,
          scrollHeaderHeight: bodyDefaults.scrollHeaderHeight,
        }),
      [
        bodyDefaults.scrollHeaderComponent,
        bodyDefaults.scrollHeaderHeight,
        sceneContentContainerStyle,
      ]
    );
    const renderSceneScrollComponent = bodyScrollRuntime.ScrollComponent as NonNullable<
      FlashListProps<unknown>['renderScrollComponent']
    >;
    const handlePrimaryScrollBeginDrag = React.useCallback(
      (event: ScrollEvent) => {
        sceneBodyTransportSpec.onScrollBeginDrag?.();
        sceneFlashListProps?.onScrollBeginDrag?.(event);
      },
      [sceneBodyTransportSpec, sceneFlashListProps]
    );
    const handlePrimaryScrollEndDrag = React.useCallback(
      (event: ScrollEvent) => {
        sceneBodyTransportSpec.onScrollEndDrag?.();
        sceneBodyTransportSpec.onScrollOffsetChange?.(bodyScrollRuntime.scrollOffset.value);
        sceneFlashListProps?.onScrollEndDrag?.(event);
      },
      [bodyScrollRuntime.scrollOffset, sceneBodyTransportSpec, sceneFlashListProps]
    );

    const sceneSecondaryList = sceneBodyContentSpec.secondaryList;
    const sceneSecondaryListTransport = sceneBodyTransportSpec.secondaryList;
    const sceneSecondaryData = listDataAuthoritySnapshot.secondaryData ?? sceneSecondaryList?.data;
    const sceneSecondaryExtraData =
      listDataAuthoritySnapshot.secondaryExtraData ??
      sceneSecondaryList?.extraData ??
      scenePrimaryExtraData;
    const sceneShouldRenderDualLists = sceneSecondaryList != null;
    const sceneResolvedActiveList = sceneShouldRenderDualLists
      ? (listDataAuthoritySnapshot.activeList ?? sceneBodyTransportSpec.activeList ?? 'primary')
      : 'primary';
    const primaryOwnsScroll = !sceneShouldRenderDualLists || sceneResolvedActiveList === 'primary';
    const secondaryOwnsScroll =
      sceneShouldRenderDualLists && sceneResolvedActiveList === 'secondary';
    const [deferredSecondaryListContent, setDeferredSecondaryListContent] = React.useState<
      typeof sceneSecondaryList | null
    >(null);
    React.useEffect(() => {
      if (!sceneShouldRenderDualLists || sceneSecondaryList == null) {
        setDeferredSecondaryListContent(null);
        return;
      }

      if (secondaryOwnsScroll) {
        setDeferredSecondaryListContent(sceneSecondaryList);
        return;
      }

      const frameHandle = requestAnimationFrame(() => {
        setDeferredSecondaryListContent(sceneSecondaryList);
      });
      return () => {
        cancelAnimationFrame(frameHandle);
      };
    }, [sceneSecondaryList, sceneShouldRenderDualLists, secondaryOwnsScroll]);
    const shouldRenderSecondaryList =
      sceneShouldRenderDualLists &&
      sceneSecondaryList != null &&
      (secondaryOwnsScroll || deferredSecondaryListContent === sceneSecondaryList);
    const sceneResolvedFlashListProps = {
      drawDistance: DEFAULT_DRAW_DISTANCE,
      removeClippedSubviews: false,
      estimatedItemSize: sceneBodyContentSpec.estimatedItemSize,
      ...sceneFlashListProps,
      overrideProps: {
        initialDrawBatchSize: DEFAULT_INITIAL_DRAW_BATCH_SIZE,
        ...(sceneFlashListProps?.overrideProps ?? {}),
      },
    };
    const sceneSecondaryInputFlashListProps = {
      ...sceneFlashListProps,
      ...(sceneSecondaryListTransport?.flashListProps ?? {}),
    };
    const sceneSecondaryFlashListProps = {
      removeClippedSubviews: false,
      estimatedItemSize:
        sceneSecondaryList?.estimatedItemSize ?? sceneBodyContentSpec.estimatedItemSize,
      ...sceneSecondaryInputFlashListProps,
      drawDistance: secondaryOwnsScroll
        ? (sceneSecondaryInputFlashListProps.drawDistance ?? DEFAULT_DRAW_DISTANCE)
        : INACTIVE_SECONDARY_DRAW_DISTANCE,
      overrideProps: {
        initialDrawBatchSize: secondaryOwnsScroll
          ? DEFAULT_INITIAL_DRAW_BATCH_SIZE
          : INACTIVE_SECONDARY_INITIAL_DRAW_BATCH_SIZE,
        ...(sceneSecondaryInputFlashListProps.overrideProps ?? {}),
        ...(!secondaryOwnsScroll
          ? {
              initialDrawBatchSize: INACTIVE_SECONDARY_INITIAL_DRAW_BATCH_SIZE,
            }
          : null),
      },
    };
    const sceneFlashListSurfaceStyle =
      StyleSheet.flatten([
        sceneFlashListProps?.style,
        bodyDefaults.scrollHeaderComponent ? styles.transparentFlashListSurface : null,
      ]) ?? undefined;
    const sceneSecondaryFlashListSurfaceStyle =
      StyleSheet.flatten([
        sceneSecondaryListTransport?.flashListProps?.style ?? sceneFlashListProps?.style,
        bodyDefaults.scrollHeaderComponent ? styles.transparentFlashListSurface : null,
      ]) ?? undefined;
    const sceneSecondaryContentContainerStyle = resolveListContentContainerStyle({
      baseStyle: sanitizeContentContainerStyle(
        sceneSecondaryListTransport?.contentContainerStyle ??
          listDataAuthoritySnapshot.contentContainerStyle ??
          sceneBodyTransportSpec.contentContainerStyle ??
          bodyDefaults.resolvedContentContainerStyle
      ),
      hasScrollHeaderOverlay: bodyDefaults.scrollHeaderComponent != null,
      scrollHeaderHeight: bodyDefaults.scrollHeaderHeight,
    });
    const previousIdentityProbeRef = React.useRef<ActiveSheetListSurfaceIdentityProbe | null>(null);
    const nextIdentityProbe = React.useMemo<ActiveSheetListSurfaceIdentityProbe>(
      () => ({
        activeList: sceneResolvedActiveList,
        bodyDefaults,
        bodyScrollRuntime,
        flashListProps: sceneFlashListProps,
        primaryData: scenePrimaryData,
        primaryExtraData: scenePrimaryExtraData,
        primaryRenderItem: sceneBodyContentSpec.renderItem,
        listChromeComponent: sceneBodyContentSpec.ListChromeComponent,
        sceneBodyContentSpec,
        sceneBodyTransportSpec,
        secondaryData: sceneSecondaryData,
        secondaryExtraData: sceneSecondaryExtraData,
        secondaryRenderItem: sceneSecondaryList?.renderItem ?? sceneBodyContentSpec.renderItem,
      }),
      [
        bodyDefaults,
        bodyScrollRuntime,
        sceneBodyContentSpec,
        sceneBodyContentSpec.renderItem,
        sceneBodyTransportSpec,
        sceneFlashListProps,
        scenePrimaryData,
        scenePrimaryExtraData,
        sceneResolvedActiveList,
        sceneSecondaryData,
        sceneSecondaryExtraData,
        sceneSecondaryList?.renderItem,
      ]
    );
    markActiveSheetListSurfaceIdentityDiff({
      next: nextIdentityProbe,
      previous: previousIdentityProbeRef.current,
      sceneKey,
    });
    previousIdentityProbeRef.current = nextIdentityProbe;

    React.useLayoutEffect(() => {
      finishSearchNavSwitchRuntimeAttributionSpan({
        owner: `ActiveBottomSheetSceneStackListBodySurface:${sceneKey}`,
        operation: 'renderToLayoutEffect',
        startedAtMs: renderStartedAtMs,
      });
      return () => {
        markSearchNavSwitchRuntimeAttribution(
          `ActiveBottomSheetSceneStackListBodySurface:${sceneKey}`,
          'layoutEffectCleanup'
        );
      };
    });

    React.useEffect(() => {
      markSearchNavSwitchRuntimeAttribution(
        `ActiveBottomSheetSceneStackListBodySurface:${sceneKey}`,
        'passiveEffectMount'
      );
      return () => {
        markSearchNavSwitchRuntimeAttribution(
          `ActiveBottomSheetSceneStackListBodySurface:${sceneKey}`,
          'passiveEffectCleanup'
        );
      };
    }, [sceneKey]);

    const listBodySurface = (
      <View style={styles.listBodySurfaceHost}>
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
            key={`${sceneKey}:${sceneBodyContentSpec.listKey ?? 'primary-list'}`}
            ref={sceneBodyTransportSpec.listRef}
            {...({
              ...sceneResolvedFlashListProps,
              style: sceneFlashListSurfaceStyle,
              data: scenePrimaryData,
              renderItem: sceneBodyContentSpec.renderItem,
              keyExtractor: sceneBodyContentSpec.keyExtractor,
              contentContainerStyle: sceneListContentContainerStyle,
            } as FlashListProps<unknown>)}
            ListHeaderComponent={
              primaryOwnsScroll ? sceneBodyContentSpec.ListHeaderComponent : null
            }
            ListFooterComponent={
              primaryOwnsScroll
                ? listDataAuthoritySnapshot.primaryListFooterComponent !== undefined
                  ? listDataAuthoritySnapshot.primaryListFooterComponent
                  : sceneBodyContentSpec.ListFooterComponent
                : null
            }
            ListEmptyComponent={primaryOwnsScroll ? sceneBodyContentSpec.ListEmptyComponent : null}
            ItemSeparatorComponent={sceneBodyContentSpec.ItemSeparatorComponent}
            keyboardShouldPersistTaps={sceneKeyboardShouldPersistTaps}
            scrollEnabled={bodyScrollRuntime.shouldEnableScroll && primaryOwnsScroll}
            renderScrollComponent={primaryOwnsScroll ? renderSceneScrollComponent : undefined}
            onScroll={primaryOwnsScroll ? bodyScrollRuntime.primaryListOnScroll : undefined}
            scrollEventThrottle={primaryOwnsScroll ? 16 : undefined}
            onScrollBeginDrag={primaryOwnsScroll ? handlePrimaryScrollBeginDrag : undefined}
            onScrollEndDrag={primaryOwnsScroll ? handlePrimaryScrollEndDrag : undefined}
            onEndReached={sceneBodyContentSpec.onEndReached}
            onEndReachedThreshold={sceneBodyContentSpec.onEndReachedThreshold}
            showsVerticalScrollIndicator={
              bodyDefaults.effectiveShowsVerticalScrollIndicator && primaryOwnsScroll
            }
            keyboardDismissMode={sceneKeyboardDismissMode}
            testID={sceneBodyTransportSpec.testID ?? bodyDefaults.resolvedTestID}
            extraData={scenePrimaryExtraData}
            scrollIndicatorInsets={sceneScrollIndicatorInsets}
          />
        </View>
        {sceneSecondaryList != null && shouldRenderSecondaryList ? (
          <View
            pointerEvents={sceneResolvedActiveList === 'secondary' ? 'auto' : 'none'}
            style={[
              styles.dualListLayer,
              sceneResolvedActiveList === 'secondary' ? styles.visibleLayer : styles.hiddenLayer,
            ]}
          >
            <AnimatedFlashList
              key={`${sceneKey}:${sceneSecondaryList.listKey ?? 'secondary-list'}`}
              ref={sceneSecondaryListTransport?.listRef}
              {...({
                ...sceneSecondaryFlashListProps,
                style: sceneSecondaryFlashListSurfaceStyle,
                data: sceneSecondaryData ?? sceneSecondaryList.data,
                renderItem: sceneSecondaryList.renderItem ?? sceneBodyContentSpec.renderItem,
                keyExtractor: sceneSecondaryList.keyExtractor ?? sceneBodyContentSpec.keyExtractor,
                contentContainerStyle: sceneSecondaryContentContainerStyle,
              } as FlashListProps<unknown>)}
              ListHeaderComponent={
                secondaryOwnsScroll
                  ? (sceneSecondaryList.ListHeaderComponent ??
                    sceneBodyContentSpec.ListHeaderComponent)
                  : null
              }
              ListFooterComponent={
                secondaryOwnsScroll
                  ? (sceneSecondaryList.ListFooterComponent ??
                    sceneBodyContentSpec.ListFooterComponent)
                  : null
              }
              ListEmptyComponent={
                secondaryOwnsScroll
                  ? (sceneSecondaryList.ListEmptyComponent ??
                    sceneBodyContentSpec.ListEmptyComponent)
                  : null
              }
              ItemSeparatorComponent={
                sceneSecondaryList.ItemSeparatorComponent ??
                sceneBodyContentSpec.ItemSeparatorComponent
              }
              keyboardShouldPersistTaps={sceneKeyboardShouldPersistTaps}
              scrollEnabled={bodyScrollRuntime.shouldEnableScroll && secondaryOwnsScroll}
              renderScrollComponent={secondaryOwnsScroll ? renderSceneScrollComponent : undefined}
              onScroll={secondaryOwnsScroll ? bodyScrollRuntime.secondaryListOnScroll : undefined}
              scrollEventThrottle={secondaryOwnsScroll ? 16 : undefined}
              onScrollBeginDrag={
                secondaryOwnsScroll
                  ? (event: ScrollEvent) => {
                      sceneBodyTransportSpec.onScrollBeginDrag?.();
                      (
                        sceneSecondaryListTransport?.flashListProps ?? sceneFlashListProps
                      )?.onScrollBeginDrag?.(event);
                    }
                  : undefined
              }
              onScrollEndDrag={
                secondaryOwnsScroll
                  ? (event: ScrollEvent) => {
                      sceneBodyTransportSpec.onScrollEndDrag?.();
                      sceneBodyTransportSpec.onScrollOffsetChange?.(
                        bodyScrollRuntime.scrollOffset.value
                      );
                      (
                        sceneSecondaryListTransport?.flashListProps ?? sceneFlashListProps
                      )?.onScrollEndDrag?.(event);
                    }
                  : undefined
              }
              onEndReached={sceneSecondaryList.onEndReached ?? sceneBodyContentSpec.onEndReached}
              onEndReachedThreshold={sceneBodyContentSpec.onEndReachedThreshold}
              showsVerticalScrollIndicator={
                bodyDefaults.effectiveShowsVerticalScrollIndicator && secondaryOwnsScroll
              }
              keyboardDismissMode={sceneKeyboardDismissMode}
              testID={
                sceneSecondaryListTransport?.testID ??
                sceneBodyTransportSpec.testID ??
                bodyDefaults.resolvedTestID
              }
              extraData={sceneSecondaryExtraData}
              scrollIndicatorInsets={
                sceneSecondaryListTransport?.scrollIndicatorInsets ?? sceneScrollIndicatorInsets
              }
            />
          </View>
        ) : null}
        {sceneBodyContentSpec.ListChromeComponent != null ? (
          <View pointerEvents="box-none" style={styles.listChromeOverlay}>
            {sceneBodyContentSpec.ListChromeComponent}
          </View>
        ) : null}
      </View>
    );

    if (!onProfilerRender) {
      return listBodySurface;
    }

    return (
      <React.Profiler
        id={`ActiveBottomSheetSceneStackListBodySurface:${sceneKey}`}
        onRender={onProfilerRender}
      >
        {listBodySurface}
      </React.Profiler>
    );
  }
);

ActiveBottomSheetSceneStackListBodySurface.displayName =
  'ActiveBottomSheetSceneStackListBodySurface';

export const BottomSheetSceneStackListBodySurface = React.memo(
  ({ shouldRenderListBody, ...activeListProps }: BottomSheetSceneStackListBodySurfaceProps) => {
    useSearchNavSwitchCommitAttribution(
      `BottomSheetSceneStackListBodySurface:${activeListProps.sceneKey}`
    );
    React.useLayoutEffect(() => {
      markSearchNavSwitchRuntimeAttribution(
        `BottomSheetSceneStackListBodySurface:${activeListProps.sceneKey}`,
        `layoutEffect:render:${shouldRenderListBody ? 'active' : 'empty'}`
      );
    });

    return shouldRenderListBody ? (
      <ActiveBottomSheetSceneStackListBodySurface {...activeListProps} />
    ) : null;
  }
);

BottomSheetSceneStackListBodySurface.displayName = 'BottomSheetSceneStackListBodySurface';
