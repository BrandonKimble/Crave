import React from 'react';

import { OVERLAY_TAB_HEADER_HEIGHT } from './overlaySheetStyles';
import { getPerfScenarioWorkNow, logPerfScenarioWorkSpan } from '../perf/perf-scenario-work-span';
import { useRouteAuthoritySelector } from '../navigation/runtime/use-route-authority-selector';
import {
  getSearchSurfaceRuntime,
  useSearchSurfaceRuntimeSelector,
} from '../screens/Search/runtime/surface/search-surface-runtime';
import { SceneLoadingSurface } from '../components/skeletons';
import { BottomSheetSceneStackPageFrame } from './BottomSheetSceneStackPageFrame';
import type {
  BottomSheetSceneStackBodyDefaults,
  BottomSheetSceneStackBodyScrollRuntime,
} from './bottomSheetSceneStackHostContract';
import { SearchMountedSceneBody } from './SearchMountedSceneBody';
import { useSearchOverlayProfilerRender } from './SearchOverlayProfilerContext';

// P5: no headerComponent lane — the results header rides the hoisted PersistentSheetHeaderHost
// (persistent-header registry 'search' descriptor, search-results-header-live-state.tsx).
export type SearchResultsPageBundleRenderObject = {
  kind: 'results_page_bundle';
  underlayComponent: React.ReactNode | null;
  backgroundComponent: React.ReactNode | null;
  overlayComponent: React.ReactNode | null;
};

type Listener = () => void;
type SearchResultsPageBundlePartsSnapshot = Pick<
  SearchResultsPageBundleRenderObject,
  'underlayComponent' | 'backgroundComponent' | 'overlayComponent'
>;

const listeners = new Set<Listener>();
let snapshot: SearchResultsPageBundleRenderObject | null = null;
const partsListeners = new Set<Listener>();
let partsSnapshot: SearchResultsPageBundlePartsSnapshot = {
  underlayComponent: null,
  backgroundComponent: null,
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
    left.overlayComponent === right.overlayComponent);

const areSearchResultsPageBundlePartsEqual = (
  left: SearchResultsPageBundlePartsSnapshot,
  right: SearchResultsPageBundlePartsSnapshot
): boolean =>
  left.underlayComponent === right.underlayComponent &&
  left.backgroundComponent === right.backgroundComponent &&
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

// P5: exported — the search results header now renders in the hoisted PersistentSheetHeaderHost
// (persistent-header registry descriptor, search-results-header-live-state.tsx), so the retained
// height is fed from THAT chrome's onLayout (descriptor onChromeLayout) instead of an in-frame
// header layer. The retained value keeps seeding the reserved header lane for both the published
// page and the pre-bundle skeleton page below.
export const publishRetainedResultsHeaderHeight = (nextHeight: number): void => {
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

// NEAR-UNREACHABLE BY DESIGN (kept as the deferred-clear release valve): a clear requested WHILE
// a visible dismiss is retaining the page bundle is parked (deferredVisibleDismissPageBundleClear)
// and released here once the surface settles back to the poll bundle with no dismiss/redraw/held
// state. In practice the model owner republishes a non-null bundle long before that settle (it
// stays mounted and publishes unconditionally post-P5), so this lane only fires if the model
// owner UNMOUNTS mid-visible-dismiss (its cleanup publishes null). Without it that parked clear
// would leak a stale frozen bundle forever.
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
};

export const SearchResultsPageBundleHost = React.memo(
  ({ bodyDefaults, bodyScrollRuntime }: SearchResultsPageBundleHostProps) => {
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
    // P5 skeleton rowType: mirror the ACTIVE tab of the in-flight search (the redraw txn's
    // targetTab — synchronously available on the surface snapshot at submit time). Unconditional
    // hook (rules-of-hooks) — cheap string selector.
    const skeletonRowType = useSearchSurfaceRuntimeSelector(
      React.useCallback(
        (surfaceSnapshot) =>
          surfaceSnapshot.redrawTransaction?.targetTab === 'dishes'
            ? ('dish' as const)
            : ('restaurant' as const),
        []
      )
    );
    if (pageBundle == null) {
      // P5 NEVER-NULL SEARCH LEG (invariant SR1, unscoped): a presented 'search' leg must never
      // render null. Pre-bundle (cold mount, mid-motion poll-CTA presentation, unmount gap) it
      // renders a REAL results-skeleton page: the shared page frame (constant hoisted frost
      // behind it) + the cutout-shimmer results skeleton, frost-through (no opaque layer blocks
      // the map here — same contrast model as the scene-stack skeleton legs), with the header
      // lane reserved at the persistent header's retained height. The old `return null` was the
      // frosty-blank hole this replaces.
      return (
        <BottomSheetSceneStackPageFrame
          bodyComponent={<SceneLoadingSurface rowType={skeletonRowType} />}
          reserveHeaderLane
          reservedHeaderHeight={reservedHeaderHeight}
        />
      );
    }

    // Frost now comes from the shared page-frame foundation (BottomSheetSceneStackPageFrame);
    // the result sheet just contributes its own background material on top of it.
    const backgroundComponent = pageBundle.backgroundComponent;

    return (
      <BottomSheetSceneStackPageFrame
        bodyScrollOffset={bodyScrollRuntime?.scrollOffset}
        underlayComponent={pageBundle.underlayComponent}
        backgroundComponent={backgroundComponent}
        bodyComponent={
          <SearchResultsPersistentBodyHost
            bodyDefaults={bodyDefaults}
            bodyScrollRuntime={bodyScrollRuntime}
          />
        }
        // P5: no in-frame header — the results header rides the hoisted PersistentSheetHeaderHost
        // (persistent-header registry 'search' descriptor). The lane is reserved at the retained
        // chrome height so the body top-inset is unchanged; the scroll divider is hoisted too
        // (PersistentHeaderScrollDividerHost keys off the same descriptor), so the in-frame
        // headerDividerScrollOffset lane is gone — no double-draw.
        overlayComponent={pageBundle.overlayComponent}
        reserveHeaderLane
        reservedHeaderHeight={reservedHeaderHeight}
      />
    );
  }
);

SearchResultsPageBundleHost.displayName = 'SearchResultsPageBundleHost';
