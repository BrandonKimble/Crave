import React from 'react';
import { useWindowDimensions } from 'react-native';
import type { FlashListProps } from '@shopify/flash-list';

import type {
  AppRouteSceneBodyContentSpec,
  AppRouteSceneBodyTransportSpec,
} from '../../../../navigation/runtime/app-route-scene-descriptor-contract';
import { getSearchSurfaceRuntime } from '../surface/search-surface-runtime';
import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
  logPerfScenarioStackAttribution,
  SEARCH_SUBMIT_DISMISS_REPEAT_SCENARIO,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import type { useSearchRouteSearchSceneModelOwner } from './use-search-route-search-scene-model-owner';
import {
  publishSearchMountedResultsBodyLayoutSnapshot,
  syncSearchMountedResultsListDecorationsSnapshot,
} from './search-mounted-results-data-store';
import { SceneLoadingSurface } from '../../../../components/skeletons';

// Stable element (reference-equal across renders so the body-content equality check holds): the
// post-cover empty-frame skeleton for the results list. Catches the brief window between the
// initial_loading cover lifting and the first results row paint so the reveal never flashes blank.
const RESULTS_LOADING_EMPTY_COMPONENT = React.createElement(SceneLoadingSurface, {
  rowType: 'restaurant',
});

type SearchMountedListBodyContentSpec = Extract<
  AppRouteSceneBodyContentSpec,
  { surfaceKind: 'list' }
>;

type SearchMountedListBodyTransportSpec = AppRouteSceneBodyTransportSpec;

const useLatestRef = <TValue>(value: TValue): React.MutableRefObject<TValue> => {
  const valueRef = React.useRef(value);
  valueRef.current = value;
  return valueRef;
};

let bodyInputOwnerInstanceSeq = 0;

const nowMs = (): number => globalThis.performance?.now?.() ?? Date.now();

const EMPTY_SECONDARY_LIST_ROWS: ReadonlyArray<unknown> = [];

const markSearchMountedBodyInputScenarioWorkSpan = ({
  activeList,
  durationMs,
  handoffPhase,
  hydratedResultsKey,
  hydrationOperationId,
}: {
  activeList?: string | null;
  durationMs: number;
  handoffPhase: string;
  hydratedResultsKey: string | null;
  hydrationOperationId: string | null;
}): void => {
  const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
  if (!isPerfScenarioAttributionActive(scenarioConfig, SEARCH_SUBMIT_DISMISS_REPEAT_SCENARIO)) {
    return;
  }

  logPerfScenarioAttributionEvent('WorkSpan', scenarioConfig, {
    event: 'scenario_work_span',
    owner: 'search_mounted_scene_body_input_sync_effect',
    path: 'stableSceneBodyContent,stableSceneBodyTransport',
    durationMs,
    handoffPhase,
    hydrationOperationId,
    hydratedResultsKey,
    activeList: activeList ?? null,
  });
};

export const useSearchRouteSearchSceneBodyInputOwner = ({
  routeSearchSceneModel,
}: {
  routeSearchSceneModel: ReturnType<typeof useSearchRouteSearchSceneModelOwner>;
}): void => {
  const { height: viewportHeight } = useWindowDimensions();
  const rawSceneBodyContent = routeSearchSceneModel.routeSearchSceneListBodyContentSnapshot;
  const rawSceneBodyTransport = routeSearchSceneModel.routeSearchSceneListBodyTransportSnapshot;
  const handoffPhase =
    routeSearchSceneModel.routeSearchSceneDataRuntime.routeSearchSceneHydrationRuntimeState
      .searchSurfaceRedrawPhase;
  const hydratedResultsKey =
    routeSearchSceneModel.routeSearchSceneDataRuntime.routeSearchSceneHydrationKeyRuntime
      .hydratedResultsKey;
  const targetSnapPoints =
    routeSearchSceneModel.routeSearchSceneSheetTransportRuntime.routeSearchSceneSheetPlaneRuntime
      .snapPoints;
  const effectiveResultsBodyHeaderHeight =
    routeSearchSceneModel.routeSearchSceneRenderRuntime.resultsBodyHeaderHeightForRender;
  const handoffPhaseRef = useLatestRef(handoffPhase);
  const hydratedResultsKeyRef = useLatestRef(hydratedResultsKey);
  const rawSceneBodyContentRef = useLatestRef(rawSceneBodyContent);
  const rawSceneBodyTransportRef = useLatestRef(rawSceneBodyTransport);
  const bodyInputOwnerInstanceIdRef = React.useRef<number | null>(null);
  if (bodyInputOwnerInstanceIdRef.current == null) {
    bodyInputOwnerInstanceIdRef.current = ++bodyInputOwnerInstanceSeq;
  }
  const stableListHeaderComponent = React.useCallback(() => {
    const HeaderComponent = rawSceneBodyContentRef.current.ListHeaderComponent;
    if (HeaderComponent == null) {
      return null;
    }
    return React.isValidElement(HeaderComponent)
      ? HeaderComponent
      : React.createElement(HeaderComponent as React.ElementType);
  }, [rawSceneBodyContentRef]);
  const stableListFooterComponent = React.useCallback(() => {
    const FooterComponent = rawSceneBodyContentRef.current.ListFooterComponent;
    if (FooterComponent == null) {
      return null;
    }
    return React.isValidElement(FooterComponent)
      ? FooterComponent
      : React.createElement(FooterComponent as React.ElementType);
  }, [rawSceneBodyContentRef]);
  const stablePrimaryRenderItem = React.useCallback<
    NonNullable<SearchMountedListBodyContentSpec['renderItem']>
  >((info) => rawSceneBodyContentRef.current.renderItem?.(info) ?? null, [rawSceneBodyContentRef]);
  const stablePrimaryKeyExtractor = React.useCallback<
    NonNullable<SearchMountedListBodyContentSpec['keyExtractor']>
  >(
    (item, index) => rawSceneBodyContentRef.current.keyExtractor?.(item, index) ?? `${index}`,
    [rawSceneBodyContentRef]
  );
  const stablePrimaryItemSeparatorComponent = React.useCallback<
    NonNullable<SearchMountedListBodyContentSpec['ItemSeparatorComponent']>
  >(
    (props) => {
      const SeparatorComponent = rawSceneBodyContentRef.current.ItemSeparatorComponent;
      return SeparatorComponent == null ? null : React.createElement(SeparatorComponent, props);
    },
    [rawSceneBodyContentRef]
  );
  const stablePrimaryOnEndReached = React.useCallback<
    NonNullable<SearchMountedListBodyContentSpec['onEndReached']>
  >((...args) => rawSceneBodyContentRef.current.onEndReached?.(...args), [rawSceneBodyContentRef]);
  const stableSecondaryRenderItem = React.useCallback<
    NonNullable<NonNullable<SearchMountedListBodyContentSpec['secondaryList']>['renderItem']>
  >(
    (info) => rawSceneBodyContentRef.current.secondaryList?.renderItem?.(info) ?? null,
    [rawSceneBodyContentRef]
  );
  const stableSecondaryKeyExtractor = React.useCallback<
    NonNullable<NonNullable<SearchMountedListBodyContentSpec['secondaryList']>['keyExtractor']>
  >(
    (item, index) =>
      rawSceneBodyContentRef.current.secondaryList?.keyExtractor?.(item, index) ?? `${index}`,
    [rawSceneBodyContentRef]
  );
  const stableSecondaryItemSeparatorComponent = React.useCallback<
    NonNullable<
      NonNullable<SearchMountedListBodyContentSpec['secondaryList']>['ItemSeparatorComponent']
    >
  >(
    (props) => {
      const SeparatorComponent =
        rawSceneBodyContentRef.current.secondaryList?.ItemSeparatorComponent ??
        rawSceneBodyContentRef.current.ItemSeparatorComponent;
      return SeparatorComponent == null ? null : React.createElement(SeparatorComponent, props);
    },
    [rawSceneBodyContentRef]
  );
  const stableSecondaryOnEndReached = React.useCallback<
    NonNullable<NonNullable<SearchMountedListBodyContentSpec['secondaryList']>['onEndReached']>
  >(
    (...args) =>
      (
        rawSceneBodyContentRef.current.secondaryList?.onEndReached ??
        rawSceneBodyContentRef.current.onEndReached
      )?.(...args),
    [rawSceneBodyContentRef]
  );
  const stableOnUserListScrollActivity = React.useCallback<
    NonNullable<SearchMountedListBodyTransportSpec['onUserListScrollActivity']>
  >(
    (...args) => rawSceneBodyTransportRef.current.onUserListScrollActivity?.(...args),
    [rawSceneBodyTransportRef]
  );
  const stableOnScrollOffsetChange = React.useCallback<
    NonNullable<SearchMountedListBodyTransportSpec['onScrollOffsetChange']>
  >(
    (...args) => rawSceneBodyTransportRef.current.onScrollOffsetChange?.(...args),
    [rawSceneBodyTransportRef]
  );
  const stableOnScrollBeginDrag = React.useCallback<
    NonNullable<SearchMountedListBodyTransportSpec['onScrollBeginDrag']>
  >(
    (...args) => rawSceneBodyTransportRef.current.onScrollBeginDrag?.(...args),
    [rawSceneBodyTransportRef]
  );
  const stableOnScrollEndDrag = React.useCallback<
    NonNullable<SearchMountedListBodyTransportSpec['onScrollEndDrag']>
  >(
    (...args) => rawSceneBodyTransportRef.current.onScrollEndDrag?.(...args),
    [rawSceneBodyTransportRef]
  );
  const stableOnMomentumBeginJS = React.useCallback<
    NonNullable<SearchMountedListBodyTransportSpec['onMomentumBeginJS']>
  >(
    (...args) => rawSceneBodyTransportRef.current.onMomentumBeginJS?.(...args),
    [rawSceneBodyTransportRef]
  );
  const stableOnMomentumEndJS = React.useCallback<
    NonNullable<SearchMountedListBodyTransportSpec['onMomentumEndJS']>
  >(
    (...args) => rawSceneBodyTransportRef.current.onMomentumEndJS?.(...args),
    [rawSceneBodyTransportRef]
  );
  const stableOnViewableItemsChanged = React.useCallback<
    NonNullable<FlashListProps<unknown>['onViewableItemsChanged']>
  >(
    (info) => {
      rawSceneBodyTransportRef.current.flashListProps?.onViewableItemsChanged?.(info);
    },
    [rawSceneBodyTransportRef]
  );
  const stableOnScrollBeginDragFlashList = React.useCallback<
    NonNullable<FlashListProps<unknown>['onScrollBeginDrag']>
  >(
    (event) => {
      rawSceneBodyTransportRef.current.flashListProps?.onScrollBeginDrag?.(event);
    },
    [rawSceneBodyTransportRef]
  );
  const stableOnScrollEndDragFlashList = React.useCallback<
    NonNullable<FlashListProps<unknown>['onScrollEndDrag']>
  >(
    (event) => {
      rawSceneBodyTransportRef.current.flashListProps?.onScrollEndDrag?.(event);
    },
    [rawSceneBodyTransportRef]
  );
  const stableFlashListProps = React.useMemo<SearchMountedListBodyTransportSpec['flashListProps']>(
    () => ({
      onScrollBeginDrag: stableOnScrollBeginDragFlashList,
      onUserListScrollActivity: stableOnUserListScrollActivity,
      onScrollEndDrag: stableOnScrollEndDragFlashList,
      onViewableItemsChanged: stableOnViewableItemsChanged,
    }),
    [stableOnScrollBeginDragFlashList, stableOnScrollEndDragFlashList, stableOnViewableItemsChanged]
  );
  const stableSecondaryListContent = React.useMemo<
    SearchMountedListBodyContentSpec['secondaryList']
  >(
    () =>
      rawSceneBodyContent.secondaryList == null
        ? rawSceneBodyContent.secondaryList
        : {
            data: EMPTY_SECONDARY_LIST_ROWS,
            estimatedItemSize:
              rawSceneBodyContent.secondaryList.estimatedItemSize ??
              rawSceneBodyContent.estimatedItemSize,
            renderItem: stableSecondaryRenderItem,
            keyExtractor: stableSecondaryKeyExtractor,
            ItemSeparatorComponent: stableSecondaryItemSeparatorComponent,
            listKey: rawSceneBodyContent.secondaryList.listKey ?? 'results-secondary',
            onEndReached: stableSecondaryOnEndReached,
          },
    [
      rawSceneBodyContent.secondaryList?.estimatedItemSize,
      rawSceneBodyContent.secondaryList?.listKey,
      rawSceneBodyContent.secondaryList == null,
      stableSecondaryKeyExtractor,
      stableSecondaryItemSeparatorComponent,
      stableSecondaryOnEndReached,
      stableSecondaryRenderItem,
    ]
  );
  const stableSceneBodyContent = React.useMemo<SearchMountedListBodyContentSpec>(
    () => ({
      ...rawSceneBodyContent,
      renderItem: stablePrimaryRenderItem,
      keyExtractor:
        rawSceneBodyContent.keyExtractor == null ? undefined : stablePrimaryKeyExtractor,
      ListChromeComponent: null,
      ListHeaderComponent: null,
      ListFooterComponent: null,
      ListEmptyComponent: RESULTS_LOADING_EMPTY_COMPONENT,
      ItemSeparatorComponent: stablePrimaryItemSeparatorComponent,
      onEndReached: stablePrimaryOnEndReached,
      secondaryList: stableSecondaryListContent,
    }),
    [
      rawSceneBodyContent.estimatedItemSize,
      rawSceneBodyContent.keyExtractor == null,
      rawSceneBodyContent.listKey,
      rawSceneBodyContent.onEndReachedThreshold,
      stablePrimaryItemSeparatorComponent,
      stablePrimaryKeyExtractor,
      stablePrimaryOnEndReached,
      stablePrimaryRenderItem,
      stableSecondaryListContent,
    ]
  );
  const stableSceneBodyTransport = React.useMemo<SearchMountedListBodyTransportSpec>(
    () => ({
      ...rawSceneBodyTransport,
      activeList: undefined,
      contentContainerStyle: undefined,
      scrollIndicatorInsets: undefined,
      onScrollOffsetChange:
        rawSceneBodyTransport.onScrollOffsetChange == null ? undefined : stableOnScrollOffsetChange,
      onScrollBeginDrag:
        rawSceneBodyTransport.onScrollBeginDrag == null ? undefined : stableOnScrollBeginDrag,
      onScrollEndDrag:
        rawSceneBodyTransport.onScrollEndDrag == null ? undefined : stableOnScrollEndDrag,
      onMomentumBeginJS:
        rawSceneBodyTransport.onMomentumBeginJS == null ? undefined : stableOnMomentumBeginJS,
      onMomentumEndJS:
        rawSceneBodyTransport.onMomentumEndJS == null ? undefined : stableOnMomentumEndJS,
      flashListProps: stableFlashListProps,
    }),
    [
      rawSceneBodyTransport.contentSurfaceStyle,
      rawSceneBodyTransport.keyboardDismissMode,
      rawSceneBodyTransport.keyboardShouldPersistTaps,
      rawSceneBodyTransport.listRef,
      rawSceneBodyTransport.onMomentumBeginJS == null,
      rawSceneBodyTransport.onMomentumEndJS == null,
      rawSceneBodyTransport.onScrollBeginDrag == null,
      rawSceneBodyTransport.onScrollEndDrag == null,
      rawSceneBodyTransport.onScrollOffsetChange == null,
      rawSceneBodyTransport.showsVerticalScrollIndicator,
      rawSceneBodyTransport.testID,
      stableFlashListProps,
      stableOnMomentumBeginJS,
      stableOnMomentumEndJS,
      stableOnScrollBeginDrag,
      stableOnScrollEndDrag,
      stableOnScrollOffsetChange,
    ]
  );
  const hasListHeaderComponent = rawSceneBodyContent.ListHeaderComponent != null;
  const hasListFooterComponent = rawSceneBodyContent.ListFooterComponent != null;
  React.useEffect(() => {
    syncSearchMountedResultsListDecorationsSnapshot({
      primaryListHeaderComponent: hasListHeaderComponent ? stableListHeaderComponent : null,
      primaryListFooterComponent: hasListFooterComponent ? stableListFooterComponent : null,
    });
  }, [
    hasListFooterComponent,
    hasListHeaderComponent,
    stableListFooterComponent,
    stableListHeaderComponent,
  ]);

  React.useEffect(() => {
    const startedAtMs = nowMs();
    const latestHandoffPhase = handoffPhaseRef.current;
    const latestHydratedResultsKey = hydratedResultsKeyRef.current;
    logPerfScenarioStackAttribution({
      owner: 'search_surface_results_body_bundle_sync',
      path: 'structural',
      details: {
        activeList: stableSceneBodyTransport.activeList,
        // Instance identity: distinguishes a hook REMOUNT (new instance ids) from two
        // live instances PING-PONGING the latest-wins body bundle sync.
        bodyInputOwnerInstanceId: bodyInputOwnerInstanceIdRef.current,
        listKey: stableSceneBodyContent.listKey ?? null,
      },
    });
    getSearchSurfaceRuntime().syncResultsPageBodyBundle({
      sceneBodyContent: stableSceneBodyContent,
      sceneBodyTransport: stableSceneBodyTransport,
    });
    markSearchMountedBodyInputScenarioWorkSpan({
      activeList: stableSceneBodyTransport.activeList,
      durationMs: nowMs() - startedAtMs,
      handoffPhase: latestHandoffPhase,
      hydratedResultsKey: latestHydratedResultsKey,
      hydrationOperationId: null,
    });
  }, [handoffPhaseRef, hydratedResultsKeyRef, stableSceneBodyContent, stableSceneBodyTransport]);
  React.useEffect(() => {
    const targetSnapPointMiddle =
      targetSnapPoints == null || !Number.isFinite(targetSnapPoints.middle)
        ? null
        : targetSnapPoints.middle;
    publishSearchMountedResultsBodyLayoutSnapshot({
      headerHeight: effectiveResultsBodyHeaderHeight,
      targetSnapPointMiddle,
      targetSnapPoints,
      viewportHeight,
    });
  }, [effectiveResultsBodyHeaderHeight, targetSnapPoints, viewportHeight]);
};
