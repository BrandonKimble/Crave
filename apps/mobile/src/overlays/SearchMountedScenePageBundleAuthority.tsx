import React from 'react';
import type { LayoutChangeEvent } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { OVERLAY_TAB_HEADER_HEIGHT } from './overlaySheetStyles';
import { getPerfScenarioWorkNow, logPerfScenarioWorkSpan } from '../perf/perf-scenario-work-span';
import { useRouteAuthoritySelector } from '../navigation/runtime/use-route-authority-selector';
import { getSearchSurfaceRuntime } from '../screens/Search/runtime/surface/search-surface-runtime';
import { BottomSheetSceneStackPageFrame } from './BottomSheetSceneStackPageFrame';
import type {
  BottomSheetSceneStackBodyDefaults,
  BottomSheetSceneStackBodyScrollRuntime,
} from './bottomSheetSceneStackHostContract';
import { SearchMountedSceneBody } from './SearchMountedSceneBody';
import { useSearchOverlayProfilerRender } from './SearchOverlayProfilerContext';

export type SearchResultsPageBundleRenderObject = {
  kind: 'results_page_bundle';
  underlayComponent: React.ReactNode | null;
  backgroundComponent: React.ReactNode | null;
  headerComponent: React.ReactNode | null;
  overlayComponent: React.ReactNode | null;
};

type Listener = () => void;
type SearchResultsPageBundlePartsSnapshot = Pick<
  SearchResultsPageBundleRenderObject,
  'underlayComponent' | 'backgroundComponent' | 'headerComponent' | 'overlayComponent'
>;

export const EMPTY_SEARCH_RESULTS_PAGE_BUNDLE: SearchResultsPageBundleRenderObject | null = null;

const listeners = new Set<Listener>();
let snapshot: SearchResultsPageBundleRenderObject | null = EMPTY_SEARCH_RESULTS_PAGE_BUNDLE;
const partsListeners = new Set<Listener>();
let partsSnapshot: SearchResultsPageBundlePartsSnapshot = {
  underlayComponent: null,
  backgroundComponent: null,
  headerComponent: null,
  overlayComponent: null,
};
let retainedResultsHeaderHeight = OVERLAY_TAB_HEADER_HEIGHT;
let deferredVisibleDismissPageBundleClear = false;
let deferredVisibleDismissPageBundleClearLogKey: string | null = null;
let visibleDismissPageBundleFrozenLogKey: string | null = null;
let unsubscribeDeferredVisibleDismissPageBundleClear: (() => void) | null = null;

const areSearchResultsPageBundlesEqual = (
  left: SearchResultsPageBundleRenderObject | null,
  right: SearchResultsPageBundleRenderObject | null
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.kind === right.kind &&
    left.underlayComponent === right.underlayComponent &&
    left.backgroundComponent === right.backgroundComponent &&
    left.headerComponent === right.headerComponent &&
    left.overlayComponent === right.overlayComponent);

const areSearchResultsPageBundlePartsEqual = (
  left: SearchResultsPageBundlePartsSnapshot,
  right: SearchResultsPageBundlePartsSnapshot
): boolean =>
  left.underlayComponent === right.underlayComponent &&
  left.backgroundComponent === right.backgroundComponent &&
  left.headerComponent === right.headerComponent &&
  left.overlayComponent === right.overlayComponent;

const SearchResultsPersistentBodyHost = React.memo(
  ({
    bodyDefaults,
    bodyScrollRuntime,
  }: {
    bodyDefaults?: BottomSheetSceneStackBodyDefaults;
    bodyScrollRuntime?: BottomSheetSceneStackBodyScrollRuntime;
  }) => {
    const onProfilerRender = useSearchOverlayProfilerRender();
    const body = (
      <SearchMountedSceneBody bodyDefaults={bodyDefaults} bodyScrollRuntime={bodyScrollRuntime} />
    );
    return onProfilerRender ? (
      <React.Profiler id="SearchResultsPersistentBodyHost" onRender={onProfilerRender}>
        {body}
      </React.Profiler>
    ) : (
      body
    );
  }
);
SearchResultsPersistentBodyHost.displayName = 'SearchResultsPersistentBodyHost';

const headerHeightListeners = new Set<Listener>();

const searchResultsHeaderHeightAuthority = {
  subscribe: (listener: Listener) => {
    headerHeightListeners.add(listener);
    return () => {
      headerHeightListeners.delete(listener);
    };
  },
  getSnapshot: () => retainedResultsHeaderHeight,
};

const publishRetainedResultsHeaderHeight = (nextHeight: number): void => {
  if (!Number.isFinite(nextHeight) || nextHeight <= 0) {
    return;
  }
  if (Math.abs(retainedResultsHeaderHeight - nextHeight) < 0.5) {
    return;
  }
  retainedResultsHeaderHeight = nextHeight;
  headerHeightListeners.forEach((listener) => {
    listener();
  });
};

const searchResultsPageBundlePartsAuthority = {
  subscribe: (listener: Listener) => {
    partsListeners.add(listener);
    return () => {
      partsListeners.delete(listener);
    };
  },
  getSnapshot: () => partsSnapshot,
};

const publishSearchResultsPageBundleParts = (
  nextSnapshot: SearchResultsPageBundlePartsSnapshot
): void => {
  if (areSearchResultsPageBundlePartsEqual(partsSnapshot, nextSnapshot)) {
    return;
  }
  partsSnapshot = nextSnapshot;
  partsListeners.forEach((listener) => {
    listener();
  });
};

const createSearchResultsPageBundlePartSlot = <
  Key extends keyof SearchResultsPageBundlePartsSnapshot,
>(
  key: Key,
  displayName: string
) => {
  const SearchResultsPageBundlePartSlot = React.memo(() => {
    const onProfilerRender = useSearchOverlayProfilerRender();
    const part = useRouteAuthoritySelector({
      subscribe: searchResultsPageBundlePartsAuthority.subscribe,
      getSnapshot: searchResultsPageBundlePartsAuthority.getSnapshot,
      selector: React.useCallback(
        (nextSnapshot: SearchResultsPageBundlePartsSnapshot) => nextSnapshot[key],
        [key]
      ),
      isEqual: Object.is,
      attributionOwner: displayName,
      attributionOperation: 'pageBundlePartSelector',
    });
    const slot = <>{part}</>;
    return onProfilerRender ? (
      <React.Profiler id={displayName} onRender={onProfilerRender}>
        {slot}
      </React.Profiler>
    ) : (
      slot
    );
  });
  SearchResultsPageBundlePartSlot.displayName = displayName;
  return <SearchResultsPageBundlePartSlot />;
};

const STABLE_SEARCH_RESULTS_PAGE_BUNDLE: SearchResultsPageBundleRenderObject = {
  kind: 'results_page_bundle',
  underlayComponent: createSearchResultsPageBundlePartSlot(
    'underlayComponent',
    'SearchResultsPageBundleUnderlaySlot'
  ),
  backgroundComponent: createSearchResultsPageBundlePartSlot(
    'backgroundComponent',
    'SearchResultsPageBundleBackgroundSlot'
  ),
  headerComponent: createSearchResultsPageBundlePartSlot(
    'headerComponent',
    'SearchResultsPageBundleHeaderSlot'
  ),
  overlayComponent: createSearchResultsPageBundlePartSlot(
    'overlayComponent',
    'SearchResultsPageBundleOverlaySlot'
  ),
};

const isSearchSurfaceRetainingVisibleDismissPageBundle = (): boolean => {
  const surfaceSnapshot = getSearchSurfaceRuntime().getSnapshot();
  return surfaceSnapshot.dismissTransaction != null;
};

const canClearSearchResultsPageBundleAfterVisibleDismissSettled = (): boolean => {
  const surfaceSnapshot = getSearchSurfaceRuntime().getSnapshot();
  return (
    surfaceSnapshot.dismissTransaction == null &&
    surfaceSnapshot.redrawTransaction == null &&
    surfaceSnapshot.activeBundle.kind === 'poll' &&
    surfaceSnapshot.heldBundle == null
  );
};

const clearDeferredVisibleDismissPageBundleSubscription = (): void => {
  unsubscribeDeferredVisibleDismissPageBundleClear?.();
  unsubscribeDeferredVisibleDismissPageBundleClear = null;
};

function clearSearchResultsPageBundleAfterVisibleDismissSettled(): void {
  if (!deferredVisibleDismissPageBundleClear) {
    return;
  }
  if (!canClearSearchResultsPageBundleAfterVisibleDismissSettled()) {
    return;
  }
  deferredVisibleDismissPageBundleClear = false;
  deferredVisibleDismissPageBundleClearLogKey = null;
  visibleDismissPageBundleFrozenLogKey = null;
  clearDeferredVisibleDismissPageBundleSubscription();
  publishSearchResultsPageBundleParts({
    underlayComponent: null,
    backgroundComponent: null,
    headerComponent: null,
    overlayComponent: null,
  });
  publishSearchResultsPageBundleImmediate(null, 'visible_dismiss_settled_clear');
}

const ensureDeferredVisibleDismissPageBundleSubscription = (): void => {
  if (unsubscribeDeferredVisibleDismissPageBundleClear != null) {
    return;
  }
  unsubscribeDeferredVisibleDismissPageBundleClear = getSearchSurfaceRuntime().subscribe(() => {
    clearSearchResultsPageBundleAfterVisibleDismissSettled();
  });
};

const publishSearchResultsPageBundleImmediate = (
  nextSnapshot: SearchResultsPageBundleRenderObject | null,
  path = nextSnapshot == null ? 'clear' : nextSnapshot.kind
): void => {
  if (areSearchResultsPageBundlesEqual(snapshot, nextSnapshot)) {
    return;
  }

  logPerfScenarioWorkSpan({
    owner: 'search_results_page_bundle_publish',
    path,
    startedAtMs: getPerfScenarioWorkNow(),
    details: {
      listenerCount: listeners.size,
    },
  });

  snapshot = nextSnapshot;
  listeners.forEach((listener) => {
    listener();
  });
};

export const publishSearchResultsPageBundle = (
  nextSnapshot: SearchResultsPageBundleRenderObject | null
): void => {
  if (isSearchSurfaceRetainingVisibleDismissPageBundle() && snapshot != null) {
    const transactionId =
      getSearchSurfaceRuntime().getSnapshot().dismissTransaction?.id ?? 'unknown';
    if (nextSnapshot != null) {
      const frozenLogKey = `${transactionId}|${nextSnapshot.kind}`;
      if (visibleDismissPageBundleFrozenLogKey !== frozenLogKey) {
        visibleDismissPageBundleFrozenLogKey = frozenLogKey;
        logPerfScenarioWorkSpan({
          owner: 'search_results_page_bundle_parts_publish_frozen',
          path: nextSnapshot.kind,
          startedAtMs: getPerfScenarioWorkNow(),
          details: {
            listenerCount: partsListeners.size,
            transactionId,
          },
        });
      }
      return;
    }
    deferredVisibleDismissPageBundleClear = true;
    ensureDeferredVisibleDismissPageBundleSubscription();
    const clearLogKey = `${transactionId}|clear`;
    if (deferredVisibleDismissPageBundleClearLogKey !== clearLogKey) {
      deferredVisibleDismissPageBundleClearLogKey = clearLogKey;
      logPerfScenarioWorkSpan({
        owner: 'search_results_page_bundle_publish_deferred_clear',
        path: 'visible_dismiss',
        startedAtMs: getPerfScenarioWorkNow(),
        details: {
          listenerCount: listeners.size,
          transactionId,
        },
      });
    }
    clearSearchResultsPageBundleAfterVisibleDismissSettled();
    return;
  }
  if (nextSnapshot != null) {
    visibleDismissPageBundleFrozenLogKey = null;
    publishSearchResultsPageBundleParts({
      underlayComponent: nextSnapshot.underlayComponent,
      backgroundComponent: nextSnapshot.backgroundComponent,
      headerComponent: nextSnapshot.headerComponent,
      overlayComponent: nextSnapshot.overlayComponent,
    });
    if (snapshot != null) {
      return;
    }
    publishSearchResultsPageBundleImmediate(STABLE_SEARCH_RESULTS_PAGE_BUNDLE);
    return;
  }
  deferredVisibleDismissPageBundleClear = false;
  deferredVisibleDismissPageBundleClearLogKey = null;
  visibleDismissPageBundleFrozenLogKey = null;
  clearDeferredVisibleDismissPageBundleSubscription();
  publishSearchResultsPageBundleParts({
    underlayComponent: null,
    backgroundComponent: null,
    headerComponent: null,
    overlayComponent: null,
  });
  publishSearchResultsPageBundleImmediate(null);
};

const searchResultsPageBundleAuthority = {
  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => snapshot,
};

type SearchResultsPageBundleHostProps = {
  bodyDefaults?: BottomSheetSceneStackBodyDefaults;
  bodyScrollRuntime?: BottomSheetSceneStackBodyScrollRuntime;
  onHeaderLayout: (event: LayoutChangeEvent) => void;
  sheetYValue?: SharedValue<number>;
};

export const SearchResultsPageBundleHost = React.memo(
  ({ bodyDefaults, bodyScrollRuntime, onHeaderLayout }: SearchResultsPageBundleHostProps) => {
    const reservedHeaderHeight = useRouteAuthoritySelector({
      subscribe: searchResultsHeaderHeightAuthority.subscribe,
      getSnapshot: searchResultsHeaderHeightAuthority.getSnapshot,
      selector: React.useCallback((nextHeight: number) => nextHeight, []),
      isEqual: Object.is,
      attributionOwner: 'SearchResultsPageBundleHost',
      attributionOperation: 'headerHeightSelector',
    });
    const pageBundle = useRouteAuthoritySelector({
      subscribe: searchResultsPageBundleAuthority.subscribe,
      getSnapshot: searchResultsPageBundleAuthority.getSnapshot,
      selector: React.useCallback(
        (nextSnapshot: SearchResultsPageBundleRenderObject | null) => nextSnapshot,
        []
      ),
      isEqual: areSearchResultsPageBundlesEqual,
      attributionOwner: 'SearchResultsPageBundleHost',
      attributionOperation: 'pageBundleSelector',
    });
    if (pageBundle == null) {
      return null;
    }

    const handleHeaderLayout = (event: LayoutChangeEvent) => {
      publishRetainedResultsHeaderHeight(event.nativeEvent.layout.height);
      onHeaderLayout(event);
    };

    // Frost now comes from the shared page-frame foundation (BottomSheetSceneStackPageFrame);
    // the result sheet just contributes its own background material on top of it.
    const backgroundComponent = pageBundle.backgroundComponent;

    return (
      <BottomSheetSceneStackPageFrame
        underlayComponent={pageBundle.underlayComponent}
        backgroundComponent={backgroundComponent}
        bodyComponent={
          <SearchResultsPersistentBodyHost
            bodyDefaults={bodyDefaults}
            bodyScrollRuntime={bodyScrollRuntime}
          />
        }
        headerComponent={pageBundle.headerComponent}
        overlayComponent={pageBundle.overlayComponent}
        onHeaderLayout={handleHeaderLayout}
        reserveHeaderLane={pageBundle.headerComponent == null}
        reservedHeaderHeight={reservedHeaderHeight}
        headerDividerScrollOffset={bodyScrollRuntime?.scrollOffset}
      />
    );
  }
);

SearchResultsPageBundleHost.displayName = 'SearchResultsPageBundleHost';
