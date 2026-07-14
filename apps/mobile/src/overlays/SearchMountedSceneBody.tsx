import React from 'react';
import { InteractionManager, StyleSheet, View } from 'react-native';

import type { FlashListProps } from '@shopify/flash-list';
import { FlashList } from '@shopify/flash-list';
import Animated, { runOnJS, useAnimatedReaction } from 'react-native-reanimated';

import type {
  BottomSheetSceneStackBodyDefaults,
  BottomSheetSceneStackBodyScrollRuntime,
} from './bottomSheetSceneStackHostContract';
import type { ScrollEvent } from './bottomSheetSceneStackBodyLayerContract';
import { bottomSheetSceneStackHostStyles as styles } from './bottomSheetSceneStackHostStyles';
import { resolveListContentContainerStyle } from './bottomSheetSurfaceStyleUtils';
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

// SHEET-MOTION FENCE, list lane (eye-verified 2026-07-13): the press-up list-target
// update (~28ms render + its Fabric mount, the widest press-up subtree) landed inside
// the reveal slide's first frames and froze the UI-thread spring (newArch mounts block
// the main thread). Same motion-keyed predicate as the map's structural-apply fence:
// while the sheet is physically moving for the active redraw (sheetReady false), this
// view keeps returning the HELD pre-motion snapshot — no re-render, no mount. The
// surface-runtime subscription re-notifies on the sheetReady settle flip, and the lazy
// getter re-reads the live authority then (latest-wins; intermediate updates coalesce).
const isSearchSheetMotionFenceClosed = (): boolean => {
  const redrawTransaction = getSearchSurfaceRuntime().getSnapshot().redrawTransaction;
  return redrawTransaction != null && !redrawTransaction.readiness.sheetReady;
};

let motionFencedListDataSnapshot: SearchMountedResultsListDataSnapshot | null = null;

const getMotionFencedListDataSnapshot = (): SearchMountedResultsListDataSnapshot => {
  if (motionFencedListDataSnapshot == null || !isSearchSheetMotionFenceClosed()) {
    motionFencedListDataSnapshot = getSearchMountedResultsListDataSnapshot();
  }
  return motionFencedListDataSnapshot;
};

const SEARCH_MOUNTED_RESULTS_LIST_DATA_AUTHORITY: SearchMountedResultsListDataAuthority = {
  getSnapshot: getMotionFencedListDataSnapshot,
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
    // Fence-release leg: the sheetReady settle flip must re-notify so a data update
    // held during the slide lands right after settle (the quiet window).
    const unsubscribeFenceRelease = getSearchSurfaceRuntime().subscribe(listener);
    return () => {
      unsubscribe();
      unsubscribeFenceRelease();
    };
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
  // NOTE (2026-07-13, tried-and-reverted): fencing THIS publish behind the sheet-motion
  // fence deadlocks the whole presentation — the body bundle also feeds the scene
  // shellSpec, which the sheet-motion target resolution needs (the motion executor sat
  // in 'awaiting-target' forever and the reveal snap never dispatched). Any press-up
  // diet here must split shell publication from body content first.
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

    // R2-C1 toggle-render eviction: BOTH tabs' FlashLists stay co-mounted (primary=restaurants,
    // secondary=dishes — the admission controller binds them permanently). The toggle is a
    // visibility flip (opacity/pointerEvents), NOT a data swap or remount, so the incoming tab's
    // cards are already rendered and the ~250-290ms card render leaves the commit window.
    const secondaryListContent = sceneBodyContent.secondaryList;
    const secondaryListTransport = sceneBodyTransport.secondaryList;
    const hasSecondaryList = secondaryListContent != null;
    const activeList =
      listDataSnapshot.activeList === 'secondary' && hasSecondaryList ? 'secondary' : 'primary';
    const primaryOwnsScroll = activeList === 'primary';
    const secondaryOwnsScroll = activeList === 'secondary';
    const activeListValueRef = useLatestRef(activeList);
    const primaryFlashListProps = React.useMemo(
      () => ({
        ...(sceneBodyTransport.flashListProps ?? bodyDefaults.activeFlashListProps ?? {}),
      }),
      [bodyDefaults.activeFlashListProps, sceneBodyTransport.flashListProps]
    );
    const secondaryFlashListProps = React.useMemo(
      () => ({
        ...primaryFlashListProps,
        ...(secondaryListTransport?.flashListProps ?? {}),
      }),
      [primaryFlashListProps, secondaryListTransport?.flashListProps]
    );
    const sceneKeyboardShouldPersistTaps =
      sceneBodyTransport.keyboardShouldPersistTaps ??
      bodyDefaults.resolvedKeyboardShouldPersistTaps;
    const sceneKeyboardDismissMode =
      sceneBodyTransport.keyboardDismissMode ?? bodyDefaults.resolvedKeyboardDismissMode;
    const primaryListContentContainerStyle = React.useMemo(
      () =>
        resolveListContentContainerStyle({
          baseStyle:
            listDataSnapshot.contentContainerStyle ??
            sceneBodyTransport.contentContainerStyle ??
            bodyDefaults.resolvedContentContainerStyle,
          hasScrollHeaderOverlay: bodyDefaults.scrollHeaderComponent != null,
          scrollHeaderHeight: bodyDefaults.scrollHeaderHeight,
        }),
      [
        bodyDefaults.resolvedContentContainerStyle,
        bodyDefaults.scrollHeaderComponent,
        bodyDefaults.scrollHeaderHeight,
        listDataSnapshot.contentContainerStyle,
        sceneBodyTransport.contentContainerStyle,
      ]
    );
    const secondaryListContentContainerStyle = React.useMemo(
      () =>
        resolveListContentContainerStyle({
          baseStyle:
            secondaryListTransport?.contentContainerStyle ??
            listDataSnapshot.contentContainerStyle ??
            sceneBodyTransport.contentContainerStyle ??
            bodyDefaults.resolvedContentContainerStyle,
          hasScrollHeaderOverlay: bodyDefaults.scrollHeaderComponent != null,
          scrollHeaderHeight: bodyDefaults.scrollHeaderHeight,
        }),
      [
        bodyDefaults.resolvedContentContainerStyle,
        bodyDefaults.scrollHeaderComponent,
        bodyDefaults.scrollHeaderHeight,
        listDataSnapshot.contentContainerStyle,
        sceneBodyTransport.contentContainerStyle,
        secondaryListTransport?.contentContainerStyle,
      ]
    );
    const renderSceneScrollComponent = bodyScrollRuntime.ScrollComponent as NonNullable<
      FlashListProps<unknown>['renderScrollComponent']
    >;
    // Secondary list rides the SAME ScrollComponent type (container mints per-instance gestures
    // now) — attached PERMANENTLY so the toggle never changes the scroll-container component type.
    const renderSecondarySceneScrollComponent = renderSceneScrollComponent;
    if (__DEV__) {
      // [T1DBG] render-body mark: partitions the dark gap between store publish and projection
      console.log(`[T1DBG] bodyRender t=${performance.now().toFixed(1)}`);
    }
    // Pagination #6b (Reanimated-correct): activeListOnScroll is a Reanimated handler OBJECT —
    // it must stay the direct onScroll prop (wrapping it in a JS closure throws
    // "activeListOnScroll is not a function"). The user-scroll-activity signal is derived from
    // the scrollOffset SharedValue instead; content/layout heights come from list callbacks.
    const primaryContentHeightRef = React.useRef(0);
    const primaryLayoutHeightRef = React.useRef(0);
    const secondaryContentHeightRef = React.useRef(0);
    const secondaryLayoutHeightRef = React.useRef(0);
    const emitUserListScrollActivity = React.useCallback(
      (offsetY: number) => {
        // Heights of the ACTIVE list only: the shared scrollOffset SharedValue is driven by the
        // visible list (the hidden co-mounted list cannot scroll), so the pagination signal keeps
        // tracking the active tab exactly as before the dual-mount.
        const activeIsSecondary = activeListValueRef.current === 'secondary';
        const contentHeight = activeIsSecondary
          ? secondaryContentHeightRef.current
          : primaryContentHeightRef.current;
        const layoutHeight = activeIsSecondary
          ? secondaryLayoutHeightRef.current
          : primaryLayoutHeightRef.current;
        const distanceFromEnd = contentHeight - layoutHeight - offsetY;
        sceneBodyTransport.onUserListScrollActivity?.(offsetY, distanceFromEnd);
      },
      [activeListValueRef, sceneBodyTransport]
    );
    useAnimatedReaction(
      () => bodyScrollRuntime.scrollOffset.value,
      (current, previous) => {
        if (previous == null || Math.abs(current - previous) >= 48) {
          runOnJS(emitUserListScrollActivity)(current);
        }
      },
      [emitUserListScrollActivity]
    );
    const handlePrimaryContentSizeChange = React.useCallback((_w: number, h: number) => {
      primaryContentHeightRef.current = h;
    }, []);
    const handlePrimaryLayout = React.useCallback(
      (event: { nativeEvent: { layout: { height: number } } }) => {
        primaryLayoutHeightRef.current = event.nativeEvent.layout.height;
      },
      []
    );
    const handleSecondaryContentSizeChange = React.useCallback((_w: number, h: number) => {
      secondaryContentHeightRef.current = h;
    }, []);
    const handleSecondaryLayout = React.useCallback(
      (event: { nativeEvent: { layout: { height: number } } }) => {
        secondaryLayoutHeightRef.current = event.nativeEvent.layout.height;
      },
      []
    );
    const handlePrimaryScrollBeginDrag = React.useCallback(
      (event: ScrollEvent) => {
        if (__DEV__) {
          console.log(
            `[PAGDBG] body scrollBeginDrag fired list=primary transportHandler=${sceneBodyTransport.onScrollBeginDrag != null}`
          );
        }
        sceneBodyTransport.onScrollBeginDrag?.();
        primaryFlashListProps.onScrollBeginDrag?.(event);
      },
      [primaryFlashListProps, sceneBodyTransport]
    );
    const handleSecondaryScrollBeginDrag = React.useCallback(
      (event: ScrollEvent) => {
        if (__DEV__) {
          console.log(
            `[PAGDBG] body scrollBeginDrag fired list=secondary transportHandler=${sceneBodyTransport.onScrollBeginDrag != null}`
          );
        }
        sceneBodyTransport.onScrollBeginDrag?.();
        secondaryFlashListProps.onScrollBeginDrag?.(event);
      },
      [secondaryFlashListProps, sceneBodyTransport]
    );
    // onEndReached stays attached to both lists (prop identity stability) but only the ACTIVE
    // list may trigger pagination — the hidden prewarmed list must never fire it.
    const primaryOnEndReached = sceneBodyContent.onEndReached;
    const secondaryOnEndReached =
      secondaryListContent?.onEndReached ?? sceneBodyContent.onEndReached;
    const handlePrimaryEndReached = React.useCallback(() => {
      if (activeListValueRef.current !== 'primary') {
        return;
      }
      primaryOnEndReached?.();
    }, [activeListValueRef, primaryOnEndReached]);
    const handleSecondaryEndReached = React.useCallback(() => {
      if (activeListValueRef.current !== 'secondary') {
        return;
      }
      secondaryOnEndReached?.();
    }, [activeListValueRef, secondaryOnEndReached]);
    const handlePrimaryScrollEndDrag = React.useCallback(
      (event: ScrollEvent) => {
        sceneBodyTransport.onScrollEndDrag?.();
        sceneBodyTransport.onScrollOffsetChange?.(bodyScrollRuntime.scrollOffset.value);
        primaryFlashListProps.onScrollEndDrag?.(event);
      },
      [bodyScrollRuntime.scrollOffset, primaryFlashListProps, sceneBodyTransport]
    );
    const handleSecondaryScrollEndDrag = React.useCallback(
      (event: ScrollEvent) => {
        sceneBodyTransport.onScrollEndDrag?.();
        sceneBodyTransport.onScrollOffsetChange?.(bodyScrollRuntime.scrollOffset.value);
        secondaryFlashListProps.onScrollEndDrag?.(event);
      },
      [bodyScrollRuntime.scrollOffset, secondaryFlashListProps, sceneBodyTransport]
    );
    const primaryFlashListSurfaceStyle = React.useMemo(
      () =>
        StyleSheet.flatten([
          primaryFlashListProps.style,
          bodyDefaults.scrollHeaderComponent ? styles.transparentFlashListSurface : null,
        ]) ?? undefined,
      [primaryFlashListProps.style, bodyDefaults.scrollHeaderComponent]
    );
    const secondaryFlashListSurfaceStyle = React.useMemo(
      () =>
        StyleSheet.flatten([
          secondaryFlashListProps.style,
          bodyDefaults.scrollHeaderComponent ? styles.transparentFlashListSurface : null,
        ]) ?? undefined,
      [secondaryFlashListProps.style, bodyDefaults.scrollHeaderComponent]
    );
    // Prewarm scheduling: a NEW rows snapshot (search response / page commit) only re-renders the
    // ACTIVE list synchronously. The hidden list keeps its previous rows for that commit and picks
    // up the new rows right after interactions settle — so neither the response commit nor the
    // toggle commit pays both tabs' card renders. If the user toggles before the prewarm lands,
    // the incoming list reads live data in the toggle commit (no worse than the pre-dual-mount
    // behavior).
    const livePrimaryWarmTarget = React.useMemo(
      () => ({
        data: listDataSnapshot.primaryData,
        extraData: listDataSnapshot.primaryExtraData,
      }),
      [listDataSnapshot.primaryData, listDataSnapshot.primaryExtraData]
    );
    const liveSecondaryWarmTarget = React.useMemo(
      () => ({
        data: listDataSnapshot.secondaryData,
        extraData: listDataSnapshot.secondaryExtraData,
      }),
      [listDataSnapshot.secondaryData, listDataSnapshot.secondaryExtraData]
    );
    const [warmPrimaryTarget, setWarmPrimaryTarget] = React.useState(() =>
      primaryOwnsScroll
        ? livePrimaryWarmTarget
        : { data: EMPTY_SEARCH_MOUNTED_RESULTS_LIST_DATA, extraData: 0 as unknown }
    );
    const [warmSecondaryTarget, setWarmSecondaryTarget] = React.useState(() =>
      secondaryOwnsScroll
        ? liveSecondaryWarmTarget
        : { data: EMPTY_SEARCH_MOUNTED_RESULTS_LIST_DATA, extraData: 0 as unknown }
    );
    React.useEffect(() => {
      if (
        warmPrimaryTarget === livePrimaryWarmTarget &&
        warmSecondaryTarget === liveSecondaryWarmTarget
      ) {
        return;
      }
      const interactionHandle = InteractionManager.runAfterInteractions(() => {
        setWarmPrimaryTarget(livePrimaryWarmTarget);
        setWarmSecondaryTarget(liveSecondaryWarmTarget);
        if (__DEV__) {
          console.log(`[T1DBG] inactiveListPrewarm t=${performance.now().toFixed(1)}`);
        }
      });
      return () => {
        interactionHandle.cancel();
      };
    }, [livePrimaryWarmTarget, liveSecondaryWarmTarget, warmPrimaryTarget, warmSecondaryTarget]);
    const primaryRenderTarget = primaryOwnsScroll ? livePrimaryWarmTarget : warmPrimaryTarget;
    const secondaryRenderTarget = secondaryOwnsScroll
      ? liveSecondaryWarmTarget
      : warmSecondaryTarget;
    const primaryInitialDrawBatchSize = Math.min(
      MAX_PREPARED_ROWS_INITIAL_DRAW_BATCH_SIZE,
      Math.max(DEFAULT_INITIAL_DRAW_BATCH_SIZE, primaryRenderTarget.data.length)
    );
    const secondaryInitialDrawBatchSize = Math.min(
      MAX_PREPARED_ROWS_INITIAL_DRAW_BATCH_SIZE,
      Math.max(DEFAULT_INITIAL_DRAW_BATCH_SIZE, secondaryRenderTarget.data.length)
    );
    const primaryFlashListPropsForRender = React.useMemo(
      () =>
        ({
          drawDistance: DEFAULT_DRAW_DISTANCE,
          removeClippedSubviews: false,
          estimatedItemSize: sceneBodyContent.estimatedItemSize,
          ...primaryFlashListProps,
          overrideProps: {
            ...(primaryFlashListProps.overrideProps ?? {}),
            initialDrawBatchSize: primaryInitialDrawBatchSize,
          },
          style: primaryFlashListSurfaceStyle,
          data: primaryRenderTarget.data,
          renderItem: sceneBodyContent.renderItem,
          keyExtractor: sceneBodyContent.keyExtractor,
          contentContainerStyle: primaryListContentContainerStyle,
        }) as FlashListProps<unknown>,
      [
        primaryFlashListProps,
        primaryFlashListSurfaceStyle,
        primaryInitialDrawBatchSize,
        primaryListContentContainerStyle,
        primaryRenderTarget.data,
        sceneBodyContent.estimatedItemSize,
        sceneBodyContent.keyExtractor,
        sceneBodyContent.renderItem,
      ]
    );
    const secondaryFlashListPropsForRender = React.useMemo(
      () =>
        ({
          drawDistance: DEFAULT_DRAW_DISTANCE,
          removeClippedSubviews: false,
          estimatedItemSize:
            secondaryListContent?.estimatedItemSize ?? sceneBodyContent.estimatedItemSize,
          ...secondaryFlashListProps,
          overrideProps: {
            ...(secondaryFlashListProps.overrideProps ?? {}),
            initialDrawBatchSize: secondaryInitialDrawBatchSize,
          },
          style: secondaryFlashListSurfaceStyle,
          data: secondaryRenderTarget.data,
          renderItem: secondaryListContent?.renderItem ?? sceneBodyContent.renderItem,
          keyExtractor: secondaryListContent?.keyExtractor ?? sceneBodyContent.keyExtractor,
          contentContainerStyle: secondaryListContentContainerStyle,
        }) as FlashListProps<unknown>,
      [
        sceneBodyContent.estimatedItemSize,
        sceneBodyContent.keyExtractor,
        sceneBodyContent.renderItem,
        secondaryFlashListProps,
        secondaryFlashListSurfaceStyle,
        secondaryInitialDrawBatchSize,
        secondaryListContent?.estimatedItemSize,
        secondaryListContent?.keyExtractor,
        secondaryListContent?.renderItem,
        secondaryListContentContainerStyle,
        secondaryRenderTarget.data,
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

    const primaryListHeaderComponent =
      listDataSnapshot.primaryListHeaderComponent !== undefined
        ? (listDataSnapshot.primaryListHeaderComponent as SearchMountedListBodyContentSpec['ListHeaderComponent'])
        : sceneBodyContent.ListHeaderComponent;
    const secondaryListHeaderComponent =
      listDataSnapshot.primaryListHeaderComponent !== undefined
        ? (listDataSnapshot.primaryListHeaderComponent as SearchMountedListBodyContentSpec['ListHeaderComponent'])
        : (secondaryListContent?.ListHeaderComponent ?? sceneBodyContent.ListHeaderComponent);
    // Co-mounted dual list layers: the toggle flips visibility (opacity/pointerEvents) only —
    // keys, refs, data bindings, and scroll containers are PERMANENT per list, so nothing
    // remounts and the incoming tab's already-rendered cards paint on the flip frame. Header,
    // footer, and empty components follow scroll ownership (sibling pattern:
    // BottomSheetSceneStackListBodySurface) — inserting a header is a layout shift for the
    // incoming list, not a card re-render. NOTE (2026-07-06): do NOT permanent-mount the header
    // on both lists to chase the once-reported strip flash — the header elements flow through
    // the chrome-freeze snapshot store, so a permanently-mounted instance can receive a STALE
    // element (measured: the pill stuck on the old tab). The flash itself no longer reproduces
    // (188-frame @60fps sweep) now that the press-up fade choreography is fixed.
    const renderedListLayer = (
      <>
        <View
          pointerEvents={primaryOwnsScroll ? 'auto' : 'none'}
          style={[
            hasSecondaryList ? styles.dualListLayer : styles.singleListLayer,
            primaryOwnsScroll ? styles.visibleLayer : styles.hiddenLayer,
          ]}
        >
          <AnimatedFlashList
            key={`search:primary:${sceneBodyContent.listKey ?? 'mounted-results-list'}`}
            ref={sceneBodyTransport.listRef}
            {...primaryFlashListPropsForRender}
            ListHeaderComponent={primaryOwnsScroll ? primaryListHeaderComponent : null}
            ListFooterComponent={
              primaryOwnsScroll
                ? listDataSnapshot.primaryListFooterComponent !== undefined
                  ? (listDataSnapshot.primaryListFooterComponent as SearchMountedListBodyContentSpec['ListFooterComponent'])
                  : sceneBodyContent.ListFooterComponent
                : null
            }
            ListEmptyComponent={primaryOwnsScroll ? sceneBodyContent.ListEmptyComponent : null}
            ItemSeparatorComponent={sceneBodyContent.ItemSeparatorComponent}
            keyboardShouldPersistTaps={sceneKeyboardShouldPersistTaps}
            renderScrollComponent={renderSceneScrollComponent}
            onScroll={bodyScrollRuntime.primaryListOnScroll}
            onContentSizeChange={handlePrimaryContentSizeChange}
            onLayout={handlePrimaryLayout}
            scrollEventThrottle={16}
            onScrollBeginDrag={handlePrimaryScrollBeginDrag}
            onScrollEndDrag={handlePrimaryScrollEndDrag}
            onEndReached={handlePrimaryEndReached}
            onEndReachedThreshold={sceneBodyContent.onEndReachedThreshold}
            showsVerticalScrollIndicator={
              bodyDefaults.effectiveShowsVerticalScrollIndicator && primaryOwnsScroll
            }
            keyboardDismissMode={sceneKeyboardDismissMode}
            testID={sceneBodyTransport.testID ?? bodyDefaults.resolvedTestID}
            extraData={primaryRenderTarget.extraData}
            scrollIndicatorInsets={listDataSnapshot.scrollIndicatorInsets}
          />
        </View>
        {hasSecondaryList ? (
          <View
            pointerEvents={secondaryOwnsScroll ? 'auto' : 'none'}
            style={[
              styles.dualListLayer,
              secondaryOwnsScroll ? styles.visibleLayer : styles.hiddenLayer,
            ]}
          >
            <AnimatedFlashList
              key={`search:secondary:${
                secondaryListContent?.listKey ?? sceneBodyContent.listKey ?? 'mounted-results-list'
              }`}
              ref={secondaryListTransport?.listRef}
              {...secondaryFlashListPropsForRender}
              ListHeaderComponent={secondaryOwnsScroll ? secondaryListHeaderComponent : null}
              ListFooterComponent={
                secondaryOwnsScroll
                  ? (secondaryListContent?.ListFooterComponent ??
                    sceneBodyContent.ListFooterComponent)
                  : null
              }
              ListEmptyComponent={
                secondaryOwnsScroll
                  ? (secondaryListContent?.ListEmptyComponent ??
                    sceneBodyContent.ListEmptyComponent)
                  : null
              }
              ItemSeparatorComponent={
                secondaryListContent?.ItemSeparatorComponent ??
                sceneBodyContent.ItemSeparatorComponent
              }
              keyboardShouldPersistTaps={sceneKeyboardShouldPersistTaps}
              renderScrollComponent={renderSecondarySceneScrollComponent}
              onScroll={bodyScrollRuntime.secondaryListOnScroll}
              onContentSizeChange={handleSecondaryContentSizeChange}
              onLayout={handleSecondaryLayout}
              scrollEventThrottle={16}
              onScrollBeginDrag={handleSecondaryScrollBeginDrag}
              onScrollEndDrag={handleSecondaryScrollEndDrag}
              onEndReached={handleSecondaryEndReached}
              onEndReachedThreshold={sceneBodyContent.onEndReachedThreshold}
              showsVerticalScrollIndicator={
                bodyDefaults.effectiveShowsVerticalScrollIndicator && secondaryOwnsScroll
              }
              keyboardDismissMode={sceneKeyboardDismissMode}
              testID={
                secondaryListTransport?.testID ??
                sceneBodyTransport.testID ??
                bodyDefaults.resolvedTestID
              }
              extraData={secondaryRenderTarget.extraData}
              scrollIndicatorInsets={
                secondaryListTransport?.scrollIndicatorInsets ??
                listDataSnapshot.scrollIndicatorInsets
              }
            />
          </View>
        ) : null}
      </>
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
  },
  (previousProps, nextProps) => {
    // Shallow compare (the default), instrumented: name the exact prop whose identity
    // churn re-renders the LIST subtree (the measured 70ms/commit hot spot) so the
    // churn source is provable from one scenario run.
    let equal = true;
    for (const key of [
      'bodyDefaults',
      'bodyScrollRuntime',
      'listDataSnapshot',
      'sceneBodyContent',
      'sceneBodyTransport',
    ] as const) {
      if (!Object.is(previousProps[key], nextProps[key])) {
        equal = false;
        logPerfScenarioStackAttribution({
          owner: 'search_mounted_results_list_target_props_diff',
          path: `field:${key}`,
        });
        // Sub-field granularity for the composite specs: name the exact member whose
        // identity churned so the producer's broken memo dep is provable in one run.
        if (key === 'sceneBodyContent' || key === 'sceneBodyTransport') {
          const previousValue = previousProps[key] as unknown as Record<string, unknown>;
          const nextValue = nextProps[key] as unknown as Record<string, unknown>;
          for (const subKey of new Set([
            ...Object.keys(previousValue ?? {}),
            ...Object.keys(nextValue ?? {}),
          ])) {
            if (!Object.is(previousValue?.[subKey], nextValue?.[subKey])) {
              logPerfScenarioStackAttribution({
                owner: 'search_mounted_results_list_target_props_diff',
                path: `field:${key}.${subKey}`,
              });
            }
          }
        }
      }
    }
    return equal;
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
    // IDENTITY-STABLE renderItem (perf attribution 2026-07-13): the admission-counter
    // key used to ride the dep array, so EVERY rows re-prep minted a new renderItem →
    // new sceneBodyContent → FlashList re-rendered every visible row even when the row
    // data was snapshot-equal (~70ms/commit × 5 per cycle, the measured list-subtree
    // cost center). The counter key is telemetry — read it through a ref.
    const debugPreparationKeyRef = useLatestRef(listDataSnapshot.debugPreparationKey);
    const renderItem = React.useCallback(
      (info: { item: ResultsListItem; index: number }) => {
        const admissionKey = debugPreparationKeyRef.current;
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
      [baseRenderItem, debugPreparationKeyRef]
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
