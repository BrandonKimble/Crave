import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { FlashListProps } from '@shopify/flash-list';
import { FlashList } from '@shopify/flash-list';
import Animated from 'react-native-reanimated';

import type {
  BottomSheetSceneStackBodyDefaults,
  BottomSheetSceneStackBodyScrollRuntime,
} from './bottomSheetSceneStackHostContract';
import type { ScrollEvent } from './bottomSheetSceneStackBodyLayerContract';
import { bottomSheetSceneStackHostStyles as styles } from './bottomSheetSceneStackHostStyles';
import {
  resolveListContentContainerStyle,
  sanitizeContentContainerStyle,
} from './bottomSheetSurfaceStyleUtils';
import { useSearchOverlayProfilerRender } from './SearchOverlayProfilerContext';
import type {
  SearchRouteSceneBodyContentSpec,
  SearchRouteSceneBodyTransportSpec,
} from './searchOverlayRouteHostContract';
import {
  finishSearchNavSwitchRuntimeAttributionSpan,
  markSearchNavSwitchRuntimeAttribution,
  startSearchNavSwitchRuntimeAttributionSpan,
} from '../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';
import { useSearchNavSwitchCommitAttribution } from '../screens/Search/runtime/shared/use-search-nav-switch-commit-attribution';
import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
  logPerfScenarioRenderAttribution,
  logPerfScenarioStackAttribution,
} from '../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../perf/perf-scenario-runtime-store';
import { useSearchResultsListRenderItemRuntime } from '../screens/Search/runtime/read-models/use-search-results-list-render-item-runtime';
import type { ResultsListItem } from '../screens/Search/runtime/read-models/list-read-model-builder';
import {
  getSearchMountedResultsDataSnapshot,
  getSearchMountedResultsListDataSnapshot,
  getSearchMountedResultsRowsSnapshot,
  markSearchMountedResultsPreparedRowsCommitted,
  subscribeSearchMountedResultsListDataSnapshot,
  type SearchMountedResultsListDataSnapshot,
} from '../screens/Search/runtime/shared/search-mounted-results-data-store';
import { markSearchResultsListAdmissionCounter } from '../screens/Search/runtime/shared/search-results-list-admission-attribution';
import {
  getSearchSurfaceRuntime,
  type SearchSurfaceResultsBodyBundle,
} from '../screens/Search/runtime/surface/search-surface-runtime';

type SearchMountedListBodyContentSpec = Extract<
  SearchRouteSceneBodyContentSpec,
  { surfaceKind: 'list' }
>;

type SearchMountedResultsListDataAuthority = {
  getSnapshot: () => SearchMountedResultsListDataSnapshot;
  subscribe: (listener: () => void) => () => void;
};

const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList as React.ComponentType<object>
) as typeof FlashList;

const DEFAULT_DRAW_DISTANCE = 140;
const DEFAULT_INITIAL_DRAW_BATCH_SIZE = 8;
const MAX_PREPARED_ROWS_INITIAL_DRAW_BATCH_SIZE = 32;
const EMPTY_SEARCH_MOUNTED_RESULTS_LIST_DATA: ResultsListItem[] = [];
const nowMs = (): number => globalThis.performance?.now?.() ?? Date.now();

const hashResultsListDebugKey = (key: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const compactResultsListDebugKey = (key: string | null | undefined): string =>
  key == null ? 'null' : `prep:${hashResultsListDebugKey(key)}|len:${key.length}`;

const compactResultsListDebugTransition = (
  previousKey: string | null | undefined,
  nextKey: string | null | undefined
): string => `${compactResultsListDebugKey(previousKey)}->${compactResultsListDebugKey(nextKey)}`;

const isSearchResultCardRow = (item: unknown): boolean => {
  if (item == null || typeof item !== 'object') {
    return false;
  }
  if ('kind' in item) {
    return item.kind === 'mounted_restaurant_card';
  }
  return true;
};

const useLatestRef = <TValue,>(value: TValue): React.MutableRefObject<TValue> => {
  const valueRef = React.useRef(value);
  valueRef.current = value;
  return valueRef;
};

const hasSearchSurfaceResultsBodyBundle = (
  bundle: SearchSurfaceResultsBodyBundle | null
): bundle is SearchSurfaceResultsBodyBundle =>
  bundle?.sceneBodyContent != null && bundle.sceneBodyTransport != null;

const SEARCH_MOUNTED_RESULTS_LIST_DATA_AUTHORITY: SearchMountedResultsListDataAuthority = {
  getSnapshot: getSearchMountedResultsListDataSnapshot,
  subscribe: (listener) => {
    const unsubscribe = subscribeSearchMountedResultsListDataSnapshot(() => {
      const startedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
      listener();
      finishSearchNavSwitchRuntimeAttributionSpan({
        owner: 'SearchMountedResultsListDataAuthority',
        operation: 'notify',
        startedAtMs,
      });
    });
    return unsubscribe;
  },
};

const markSearchMountedResultsListTargetCommit = ({
  next,
  previous,
}: {
  next: SearchMountedResultsListDataSnapshot;
  previous: SearchMountedResultsListDataSnapshot | null;
}): void => {
  if (
    previous != null &&
    previous.debugRowsSnapshotVersion === next.debugRowsSnapshotVersion &&
    previous.debugPreparationKey === next.debugPreparationKey
  ) {
    return;
  }
  const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
  if (!isPerfScenarioAttributionActive(scenarioConfig)) {
    return;
  }

  logPerfScenarioAttributionEvent('WorkSpan', scenarioConfig, {
    event: 'scenario_work_span',
    owner: 'search_mounted_results_list_target_commit',
    path: compactResultsListDebugTransition(
      previous?.debugPreparationKey,
      next.debugPreparationKey
    ),
    durationMs: 0,
    activeList: next.activeList,
    admissionMode: next.debugAdmissionMode,
    primaryRowCount: next.debugPrimaryRowCount,
    renderRowCount: next.debugRenderRowCount,
    rowsSnapshotVersion: next.debugRowsSnapshotVersion,
    secondaryRowCount: next.debugSecondaryRowCount,
  });
};

const renderSearchMountedListComponent = (
  component: SearchMountedListBodyContentSpec['ListHeaderComponent']
): React.ReactNode => {
  if (component == null) {
    return null;
  }
  if (React.isValidElement(component)) {
    return component;
  }
  return React.createElement(component as React.ElementType);
};

type SearchMountedSceneLiveListSurfaceProps = {
  retainedSnapshot: SearchSurfaceResultsBodyBundle;
  bodyDefaults: BottomSheetSceneStackBodyDefaults;
  bodyScrollRuntime: BottomSheetSceneStackBodyScrollRuntime;
};

type RetainedSearchMountedBodyRuntime = {
  retainedSnapshot: SearchSurfaceResultsBodyBundle;
  bodyDefaults: BottomSheetSceneStackBodyDefaults;
  bodyScrollRuntime: BottomSheetSceneStackBodyScrollRuntime;
};

type SearchMountedSceneBodySelection = {
  bodyBundle: SearchSurfaceResultsBodyBundle | null;
  shouldRetainResultsBody: boolean;
};

const areSearchMountedSceneBodySelectionsEqual = (
  left: SearchMountedSceneBodySelection,
  right: SearchMountedSceneBodySelection
): boolean =>
  left.bodyBundle === right.bodyBundle &&
  left.shouldRetainResultsBody === right.shouldRetainResultsBody;

const resolveSearchMountedSceneBodySelection = (): SearchMountedSceneBodySelection => {
  const surfaceSnapshot = getSearchSurfaceRuntime().getSnapshot();
  const activeBundle = surfaceSnapshot.activeBundle;
  const resultsBundle = activeBundle.kind === 'results' ? activeBundle : surfaceSnapshot.heldBundle;
  const bodyBundle = resultsBundle?.bodyBundle ?? null;
  const hasMountedResultsData = getSearchMountedResultsDataSnapshot().results != null;
  return {
    bodyBundle,
    shouldRetainResultsBody:
      bodyBundle != null || hasMountedResultsData || surfaceSnapshot.heldBundle != null,
  };
};

const searchMountedSceneBodySelectionListeners = new Set<() => void>();
let searchMountedSceneBodySelectionSnapshot = resolveSearchMountedSceneBodySelection();

const getSearchMountedSceneBodySelectionSnapshot = (): SearchMountedSceneBodySelection =>
  searchMountedSceneBodySelectionSnapshot;

const publishSearchMountedSceneBodySelectionIfChanged = (): void => {
  const nextSnapshot = resolveSearchMountedSceneBodySelection();
  if (
    areSearchMountedSceneBodySelectionsEqual(searchMountedSceneBodySelectionSnapshot, nextSnapshot)
  ) {
    return;
  }
  searchMountedSceneBodySelectionSnapshot = nextSnapshot;
  searchMountedSceneBodySelectionListeners.forEach((listener) => {
    listener();
  });
};

const subscribeSearchMountedSceneBodySelection = (listener: () => void): (() => void) => {
  searchMountedSceneBodySelectionListeners.add(listener);
  const unsubscribeSurface = getSearchSurfaceRuntime().subscribe(
    publishSearchMountedSceneBodySelectionIfChanged
  );
  publishSearchMountedSceneBodySelectionIfChanged();
  return () => {
    searchMountedSceneBodySelectionListeners.delete(listener);
    unsubscribeSurface();
  };
};

const SearchMountedResultsListTarget = React.memo(
  ({
    bodyDefaults,
    bodyScrollRuntime,
    listDataSnapshot,
    sceneBodyContent,
    sceneBodyTransport,
  }: {
    bodyDefaults: BottomSheetSceneStackBodyDefaults;
    bodyScrollRuntime: BottomSheetSceneStackBodyScrollRuntime;
    listDataSnapshot: SearchMountedResultsListDataSnapshot;
    sceneBodyContent: SearchMountedListBodyContentSpec;
    sceneBodyTransport: SearchRouteSceneBodyTransportSpec;
  }) => {
    useSearchNavSwitchCommitAttribution('SearchMountedResultsListTarget');
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
    const onProfilerRender = useSearchOverlayProfilerRender();
    const previousListDataSnapshotRef = React.useRef<SearchMountedResultsListDataSnapshot | null>(
      null
    );
    markSearchMountedResultsListTargetCommit({
      next: listDataSnapshot,
      previous: previousListDataSnapshotRef.current,
    });
    previousListDataSnapshotRef.current = listDataSnapshot;

    const activeList =
      listDataSnapshot.activeList === 'secondary' && sceneBodyContent.secondaryList != null
        ? 'secondary'
        : 'primary';
    const activeSecondaryList = sceneBodyContent.secondaryList;
    const activeListContent = activeList === 'secondary' ? activeSecondaryList : sceneBodyContent;
    const activeListTransport =
      activeList === 'secondary' ? sceneBodyTransport.secondaryList : null;
    const activeFlashListProps = React.useMemo(
      () => ({
        ...(sceneBodyTransport.flashListProps ?? bodyDefaults.activeFlashListProps ?? {}),
        ...(activeListTransport?.flashListProps ?? {}),
      }),
      [
        activeListTransport?.flashListProps,
        bodyDefaults.activeFlashListProps,
        sceneBodyTransport.flashListProps,
      ]
    );
    const activeData =
      activeList === 'secondary' ? listDataSnapshot.secondaryData : listDataSnapshot.primaryData;
    const activeExtraData =
      activeList === 'secondary'
        ? listDataSnapshot.secondaryExtraData
        : listDataSnapshot.primaryExtraData;
    const activeListRef =
      activeList === 'secondary' ? activeListTransport?.listRef : sceneBodyTransport.listRef;
    const activeRenderItem = activeListContent?.renderItem ?? sceneBodyContent.renderItem;
    const activeKeyExtractor = activeListContent?.keyExtractor ?? sceneBodyContent.keyExtractor;
    const activeEstimatedItemSize =
      activeListContent?.estimatedItemSize ?? sceneBodyContent.estimatedItemSize;
    const activeListHeaderComponent =
      activeListContent?.ListHeaderComponent ?? sceneBodyContent.ListHeaderComponent;
    const activeListFooterComponent =
      activeListContent?.ListFooterComponent ?? sceneBodyContent.ListFooterComponent;
    const activeListEmptyComponent =
      activeListContent?.ListEmptyComponent ?? sceneBodyContent.ListEmptyComponent;
    const activeItemSeparatorComponent =
      activeListContent?.ItemSeparatorComponent ?? sceneBodyContent.ItemSeparatorComponent;
    const activeOnEndReached = activeListContent?.onEndReached ?? sceneBodyContent.onEndReached;
    const activeListOnScroll =
      activeList === 'secondary'
        ? bodyScrollRuntime.secondaryListOnScroll
        : bodyScrollRuntime.primaryListOnScroll;
    const sceneKeyboardShouldPersistTaps =
      sceneBodyTransport.keyboardShouldPersistTaps ??
      bodyDefaults.resolvedKeyboardShouldPersistTaps;
    const sceneKeyboardDismissMode =
      sceneBodyTransport.keyboardDismissMode ?? bodyDefaults.resolvedKeyboardDismissMode;
    const sceneContentContainerStyle = React.useMemo(
      () =>
        sanitizeContentContainerStyle(
          activeListTransport?.contentContainerStyle ??
            listDataSnapshot.contentContainerStyle ??
            sceneBodyTransport.contentContainerStyle ??
            bodyDefaults.resolvedContentContainerStyle
        ),
      [
        activeListTransport?.contentContainerStyle,
        bodyDefaults.resolvedContentContainerStyle,
        listDataSnapshot.contentContainerStyle,
        sceneBodyTransport.contentContainerStyle,
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
    const handleScrollBeginDrag = React.useCallback(
      (event: ScrollEvent) => {
        sceneBodyTransport.onScrollBeginDrag?.();
        activeFlashListProps.onScrollBeginDrag?.(event);
      },
      [activeFlashListProps, sceneBodyTransport]
    );
    const handleEndReached = React.useCallback(() => {
      activeOnEndReached?.();
    }, [activeOnEndReached]);
    const handleScrollEndDrag = React.useCallback(
      (event: ScrollEvent) => {
        sceneBodyTransport.onScrollEndDrag?.();
        sceneBodyTransport.onScrollOffsetChange?.(bodyScrollRuntime.scrollOffset.value);
        activeFlashListProps.onScrollEndDrag?.(event);
      },
      [activeFlashListProps, bodyScrollRuntime.scrollOffset, sceneBodyTransport]
    );
    const sceneFlashListSurfaceStyle = React.useMemo(
      () =>
        StyleSheet.flatten([
          activeFlashListProps.style,
          bodyDefaults.scrollHeaderComponent ? styles.transparentFlashListSurface : null,
        ]) ?? undefined,
      [activeFlashListProps.style, bodyDefaults.scrollHeaderComponent]
    );
    const preparedRowsInitialDrawBatchSize = Math.min(
      MAX_PREPARED_ROWS_INITIAL_DRAW_BATCH_SIZE,
      Math.max(DEFAULT_INITIAL_DRAW_BATCH_SIZE, activeData.length)
    );
    const resolvedFlashListProps = React.useMemo(
      () => ({
        drawDistance: DEFAULT_DRAW_DISTANCE,
        removeClippedSubviews: false,
        estimatedItemSize: activeEstimatedItemSize,
        ...activeFlashListProps,
        overrideProps: {
          ...(activeFlashListProps.overrideProps ?? {}),
          initialDrawBatchSize: preparedRowsInitialDrawBatchSize,
        },
      }),
      [activeEstimatedItemSize, activeFlashListProps, preparedRowsInitialDrawBatchSize]
    );
    const flashListPropsForRender = React.useMemo(
      () =>
        ({
          ...resolvedFlashListProps,
          style: sceneFlashListSurfaceStyle,
          data: activeData,
          renderItem: activeRenderItem,
          keyExtractor: activeKeyExtractor,
          contentContainerStyle: sceneListContentContainerStyle,
        }) as FlashListProps<unknown>,
      [
        activeData,
        activeKeyExtractor,
        activeRenderItem,
        resolvedFlashListProps,
        sceneFlashListSurfaceStyle,
        sceneListContentContainerStyle,
      ]
    );

    React.useLayoutEffect(() => {
      finishSearchNavSwitchRuntimeAttributionSpan({
        owner: 'SearchMountedResultsListTarget',
        operation: 'renderToLayoutEffect',
        startedAtMs: renderStartedAtMs,
      });
      markSearchMountedResultsPreparedRowsCommitted({
        activeRowCount: listDataSnapshot.preparedRowsActiveRowCount,
        resultsIdentityKey: listDataSnapshot.preparedRowsIdentityKey,
      });
      const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
      if (isPerfScenarioAttributionActive(scenarioConfig)) {
        const durationMs = renderStartedAtMs == null ? 0 : nowMs() - renderStartedAtMs;
        markSearchResultsListAdmissionCounter(
          listDataSnapshot.debugPreparationKey,
          'listTargetRenderCount'
        );
        logPerfScenarioAttributionEvent('WorkSpan', scenarioConfig, {
          event: 'scenario_work_span',
          owner: 'search_mounted_results_list_target_render_to_layout',
          path: compactResultsListDebugKey(listDataSnapshot.debugPreparationKey),
          durationMs: Number(durationMs.toFixed(3)),
          activeList,
          preparedRowsIdentityKey: listDataSnapshot.preparedRowsIdentityKey,
          renderRowCount: listDataSnapshot.debugRenderRowCount,
        });
      }
    });

    const renderedListLayer = (
      <View style={styles.singleListLayer}>
        <AnimatedFlashList
          key={`search:${activeList}:${
            activeListContent?.listKey ?? sceneBodyContent.listKey ?? 'mounted-results-list'
          }`}
          ref={activeListRef}
          {...flashListPropsForRender}
          ListHeaderComponent={
            listDataSnapshot.primaryListHeaderComponent !== undefined
              ? (listDataSnapshot.primaryListHeaderComponent as typeof activeListHeaderComponent)
              : activeListHeaderComponent
          }
          ListFooterComponent={
            activeList === 'primary' && listDataSnapshot.primaryListFooterComponent !== undefined
              ? (listDataSnapshot.primaryListFooterComponent as typeof activeListFooterComponent)
              : activeListFooterComponent
          }
          ListEmptyComponent={activeListEmptyComponent}
          ItemSeparatorComponent={activeItemSeparatorComponent}
          keyboardShouldPersistTaps={sceneKeyboardShouldPersistTaps}
          scrollEnabled={bodyScrollRuntime.shouldEnableScroll}
          renderScrollComponent={renderSceneScrollComponent}
          onScroll={activeListOnScroll}
          scrollEventThrottle={16}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEndDrag}
          onEndReached={handleEndReached}
          onEndReachedThreshold={sceneBodyContent.onEndReachedThreshold}
          showsVerticalScrollIndicator={bodyDefaults.effectiveShowsVerticalScrollIndicator}
          keyboardDismissMode={sceneKeyboardDismissMode}
          testID={
            activeListTransport?.testID ?? sceneBodyTransport.testID ?? bodyDefaults.resolvedTestID
          }
          extraData={activeExtraData}
          scrollIndicatorInsets={
            activeListTransport?.scrollIndicatorInsets ?? listDataSnapshot.scrollIndicatorInsets
          }
        />
      </View>
    );

    const listTarget = (
      <View style={styles.listBodySurfaceHost}>
        {renderedListLayer}
        {sceneBodyContent.ListChromeComponent != null ? (
          <View pointerEvents="box-none" style={styles.listChromeOverlay}>
            {sceneBodyContent.ListChromeComponent}
          </View>
        ) : null}
      </View>
    );

    if (!onProfilerRender) {
      return listTarget;
    }

    return (
      <React.Profiler id="SearchMountedResultsListTarget" onRender={onProfilerRender}>
        {listTarget}
      </React.Profiler>
    );
  }
);

SearchMountedResultsListTarget.displayName = 'SearchMountedResultsListTarget';

const SearchMountedSceneLiveListSurface = React.memo(
  ({
    retainedSnapshot,
    bodyDefaults,
    bodyScrollRuntime,
  }: SearchMountedSceneLiveListSurfaceProps) => {
    useSearchNavSwitchCommitAttribution('SearchMountedSceneLiveListSurface');
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
    logPerfScenarioRenderAttribution({
      owner: 'SearchMountedSceneLiveListSurface',
      details: {
        path: 'stable_shell',
      },
    });

    React.useLayoutEffect(() => {
      finishSearchNavSwitchRuntimeAttributionSpan({
        owner: 'SearchMountedSceneLiveListSurface',
        operation: 'renderToLayoutEffect:stable_shell',
        startedAtMs: renderStartedAtMs,
      });
    }, [renderStartedAtMs]);

    return (
      <SearchMountedResultsListDataLeaf
        retainedSnapshot={retainedSnapshot}
        bodyDefaults={bodyDefaults}
        bodyScrollRuntime={bodyScrollRuntime}
      />
    );
  }
);

SearchMountedSceneLiveListSurface.displayName = 'SearchMountedSceneLiveListSurface';

const SearchMountedResultsListDataLeaf = React.memo(
  ({
    retainedSnapshot,
    bodyDefaults,
    bodyScrollRuntime,
  }: SearchMountedSceneLiveListSurfaceProps) => {
    useSearchNavSwitchCommitAttribution('SearchMountedResultsListDataLeaf');
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
    const sceneBodyContentRef = useLatestRef(retainedSnapshot.sceneBodyContent);
    logPerfScenarioRenderAttribution({
      owner: 'SearchMountedResultsListDataLeaf',
      details: {
        path: 'list_data_leaf',
      },
    });
    const listDataSnapshot = React.useSyncExternalStore(
      SEARCH_MOUNTED_RESULTS_LIST_DATA_AUTHORITY.subscribe,
      SEARCH_MOUNTED_RESULTS_LIST_DATA_AUTHORITY.getSnapshot,
      SEARCH_MOUNTED_RESULTS_LIST_DATA_AUTHORITY.getSnapshot
    );
    const localRenderDishCard = React.useCallback(
      (item: ResultsListItem, index: number) =>
        sceneBodyContentRef.current.renderItem?.({
          item,
          index,
        } as never) as React.ReactElement | null,
      [sceneBodyContentRef]
    );
    const localRenderRestaurantCard = React.useCallback(
      (item: ResultsListItem, index: number) =>
        sceneBodyContentRef.current.renderItem?.({
          item,
          index,
        } as never) as React.ReactElement | null,
      [sceneBodyContentRef]
    );
    const handleShowMoreExactDishes = React.useCallback(
      () => getSearchMountedResultsRowsSnapshot().handleShowMoreExactDishes(),
      []
    );
    const handleShowMoreExactRestaurants = React.useCallback(
      () => getSearchMountedResultsRowsSnapshot().handleShowMoreExactRestaurants(),
      []
    );
    const baseRenderItem = useSearchResultsListRenderItemRuntime({
      renderDishCard: localRenderDishCard as never,
      renderRestaurantCard: localRenderRestaurantCard as never,
      handleShowMoreExactDishes,
      handleShowMoreExactRestaurants,
    });
    const renderItem = React.useCallback(
      (info: { item: ResultsListItem; index: number }) => {
        const admissionKey = listDataSnapshot.debugPreparationKey;
        markSearchResultsListAdmissionCounter(admissionKey, 'renderItemCount');
        if (isSearchResultCardRow(info.item)) {
          markSearchResultsListAdmissionCounter(admissionKey, 'restaurantCardRenderCount');
          if (
            info.item != null &&
            typeof info.item === 'object' &&
            'kind' in info.item &&
            info.item.kind === 'mounted_restaurant_card' &&
            info.item.preparedDescriptor != null
          ) {
            markSearchResultsListAdmissionCounter(admissionKey, 'preparedCardRenderCount');
          }
        }
        return baseRenderItem(info as never);
      },
      [baseRenderItem, listDataSnapshot.debugPreparationKey]
    );
    const sceneBodyContent = React.useMemo<SearchMountedListBodyContentSpec>(
      () => ({
        ...retainedSnapshot.sceneBodyContent,
        data: EMPTY_SEARCH_MOUNTED_RESULTS_LIST_DATA,
        extraData: 'mounted-results-list-authority',
        ListFooterComponent: null,
        renderItem: renderItem as SearchMountedListBodyContentSpec['renderItem'],
        secondaryList:
          retainedSnapshot.sceneBodyContent.secondaryList == null
            ? retainedSnapshot.sceneBodyContent.secondaryList
            : {
                ...retainedSnapshot.sceneBodyContent.secondaryList,
                data: EMPTY_SEARCH_MOUNTED_RESULTS_LIST_DATA,
                extraData: 'mounted-results-list-authority',
                renderItem: renderItem as SearchMountedListBodyContentSpec['renderItem'],
              },
      }),
      [renderItem, retainedSnapshot.sceneBodyContent]
    );
    const sceneBodyTransport = React.useMemo<SearchRouteSceneBodyTransportSpec>(
      () => ({ ...retainedSnapshot.sceneBodyTransport }),
      [retainedSnapshot.sceneBodyTransport]
    );

    React.useLayoutEffect(() => {
      finishSearchNavSwitchRuntimeAttributionSpan({
        owner: 'SearchMountedResultsListDataLeaf',
        operation: 'renderToLayoutEffect:list_data_leaf',
        startedAtMs: renderStartedAtMs,
      });
    }, [renderStartedAtMs]);

    return (
      <SearchMountedResultsListTarget
        bodyDefaults={bodyDefaults}
        bodyScrollRuntime={bodyScrollRuntime}
        listDataSnapshot={listDataSnapshot}
        sceneBodyContent={sceneBodyContent}
        sceneBodyTransport={sceneBodyTransport}
      />
    );
  }
);

SearchMountedResultsListDataLeaf.displayName = 'SearchMountedResultsListDataLeaf';

type SearchMountedSceneBodyProps = {
  bodyDefaults?: BottomSheetSceneStackBodyDefaults;
  bodyScrollRuntime?: BottomSheetSceneStackBodyScrollRuntime;
};

export const SearchMountedSceneBody = React.memo(
  ({ bodyDefaults, bodyScrollRuntime }: SearchMountedSceneBodyProps) => {
    logPerfScenarioRenderAttribution({ owner: 'SearchMountedSceneBody' });
    useSearchNavSwitchCommitAttribution('SearchMountedSceneBody');
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
    const liveBundleState = React.useSyncExternalStore(
      subscribeSearchMountedSceneBodySelection,
      getSearchMountedSceneBodySelectionSnapshot,
      getSearchMountedSceneBodySelectionSnapshot
    );
    const liveBundle = liveBundleState.bodyBundle;
    const retainedBundleRef = React.useRef<SearchSurfaceResultsBodyBundle | null>(liveBundle);
    const retainedBodyRuntimeRef = React.useRef<RetainedSearchMountedBodyRuntime | null>(null);

    if (hasSearchSurfaceResultsBodyBundle(liveBundle)) {
      markSearchNavSwitchRuntimeAttribution('SearchMountedSceneBody', 'surfaceBundleCapture');
      retainedBundleRef.current = liveBundle;
    } else if (!liveBundleState.shouldRetainResultsBody) {
      retainedBundleRef.current = null;
      retainedBodyRuntimeRef.current = null;
    }

    React.useLayoutEffect(() => {
      finishSearchNavSwitchRuntimeAttributionSpan({
        owner: 'SearchMountedSceneBody',
        operation: 'renderToLayoutEffect:subscribe:on',
        startedAtMs: renderStartedAtMs,
      });
    });

    const retainedBundle = retainedBundleRef.current;
    const retainedBodyRuntime = retainedBodyRuntimeRef.current;
    if (
      bodyDefaults == null ||
      bodyScrollRuntime == null ||
      !hasSearchSurfaceResultsBodyBundle(retainedBundle)
    ) {
      return null;
    }
    if (retainedBodyRuntime == null || retainedBodyRuntime.retainedSnapshot !== retainedBundle) {
      retainedBodyRuntimeRef.current = {
        retainedSnapshot: retainedBundle,
        bodyDefaults,
        bodyScrollRuntime,
      };
    }
    const frozenBodyRuntime = retainedBodyRuntimeRef.current;
    if (frozenBodyRuntime == null) {
      return null;
    }

    return (
      <SearchMountedSceneLiveListSurface
        retainedSnapshot={frozenBodyRuntime.retainedSnapshot}
        bodyDefaults={frozenBodyRuntime.bodyDefaults}
        bodyScrollRuntime={frozenBodyRuntime.bodyScrollRuntime}
      />
    );
  }
);

SearchMountedSceneBody.displayName = 'SearchMountedSceneBody';
