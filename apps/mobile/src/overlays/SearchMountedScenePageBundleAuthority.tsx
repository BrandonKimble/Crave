import React from 'react';

import { SceneScrollFactsSceneKeyContext } from './sceneScrollStateRegistry';

import { computeSceneChromeHeight } from '../navigation/runtime/scene-chrome-geometry';
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
// F6200: the `kind: 'results_page_bundle'` discriminant is gone. P5 replaced the
// swappable render object with three fixed slot components, so the union had a single
// member and its only two readers were log-string interpolations — an instrument field
// that could emit exactly one value (the F2901 family). The three parts ARE the bundle.
export type SearchResultsPageBundleRenderObject = {
  underlayComponent: React.ReactNode | null;
  backgroundComponent: React.ReactNode | null;
  overlayComponent: React.ReactNode | null;
};

type Listener = () => void;

const listeners = new Set<Listener>();
// What the authority stores is PRESENCE, not a bundle: the parts live in their own
// store below and the only object ever published was the module constant. A structural
// equality over a two-inhabitant domain reads as protection while protecting nothing,
// so this is a boolean and `Object.is` is the whole comparison.
let isPageBundlePresented = false;
const partsListeners = new Set<Listener>();
let partsSnapshot: SearchResultsPageBundleRenderObject = {
  underlayComponent: null,
  backgroundComponent: null,
  overlayComponent: null,
};
let deferredVisibleDismissPageBundleClear = false;
let deferredVisibleDismissPageBundleClearLogKey: string | null = null;
let visibleDismissPageBundleFrozenLogKey: string | null = null;
let unsubscribeDeferredVisibleDismissPageBundleClear: (() => void) | null = null;

const areSearchResultsPageBundlePartsEqual = (
  left: SearchResultsPageBundleRenderObject,
  right: SearchResultsPageBundleRenderObject
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

// L1 (THE PAGE): the retained measured-height authority is DEAD — search's sheet chrome
// is the same persistent chrome row as every scene (its strip rides in-list), so its
// chrome height is the COMPUTED constant; the geometry bark in PersistentSheetHeaderHost
// falsifies this on every present.
const SEARCH_SCENE_CHROME_HEIGHT = computeSceneChromeHeight('search');

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
  nextSnapshot: SearchResultsPageBundleRenderObject
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
  Key extends keyof SearchResultsPageBundleRenderObject,
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
        (nextSnapshot: SearchResultsPageBundleRenderObject) => nextSnapshot[key],
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
  publishSearchResultsPageBundleImmediate(false, 'visible_dismiss_settled_clear');
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
  nextIsPresented: boolean,
  path = nextIsPresented ? 'results_page_bundle' : 'clear'
): void => {
  if (Object.is(isPageBundlePresented, nextIsPresented)) {
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

  isPageBundlePresented = nextIsPresented;
  listeners.forEach((listener) => {
    listener();
  });
};

export const publishSearchResultsPageBundle = (
  nextSnapshot: SearchResultsPageBundleRenderObject | null
): void => {
  if (isSearchSurfaceRetainingVisibleDismissPageBundle() && isPageBundlePresented) {
    const transactionId =
      getSearchSurfaceRuntime().getSnapshot().dismissTransaction?.id ?? 'unknown';
    if (nextSnapshot != null) {
      // F1455: ARM WITHOUT DISARM — a prior publish(null) in this SAME dismiss armed
      // deferredVisibleDismissPageBundleClear (+ its settle subscription). A fresh
      // publish(non-null) supersedes that stale clear intent; without disarming here the
      // parked clear survives to fire on a LATER settle and wipes a bundle this call
      // explicitly asked to keep.
      if (deferredVisibleDismissPageBundleClear) {
        deferredVisibleDismissPageBundleClear = false;
        deferredVisibleDismissPageBundleClearLogKey = null;
        clearDeferredVisibleDismissPageBundleSubscription();
      }
      const frozenLogKey = transactionId;
      if (visibleDismissPageBundleFrozenLogKey !== frozenLogKey) {
        visibleDismissPageBundleFrozenLogKey = frozenLogKey;
        logPerfScenarioWorkSpan({
          owner: 'search_results_page_bundle_parts_publish_frozen',
          path: 'results_page_bundle',
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
    if (isPageBundlePresented) {
      return;
    }
    publishSearchResultsPageBundleImmediate(true);
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
  publishSearchResultsPageBundleImmediate(false);
};

const searchResultsPageBundleAuthority = {
  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => isPageBundlePresented,
};

type SearchResultsPageBundleHostProps = {
  bodyDefaults?: BottomSheetSceneStackBodyDefaults;
  bodyScrollRuntime?: BottomSheetSceneStackBodyScrollRuntime;
};

export const SearchResultsPageBundleHost = React.memo(
  ({ bodyDefaults, bodyScrollRuntime }: SearchResultsPageBundleHostProps) => {
    const isPageBundlePresentedForRender = useRouteAuthoritySelector({
      subscribe: searchResultsPageBundleAuthority.subscribe,
      getSnapshot: searchResultsPageBundleAuthority.getSnapshot,
      selector: React.useCallback((nextIsPresented: boolean) => nextIsPresented, []),
      isEqual: Object.is,
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
    if (!isPageBundlePresentedForRender) {
      // P5 NEVER-NULL SEARCH LEG (invariant SR1, unscoped): a presented 'search' leg must never
      // render null. Pre-bundle (cold mount, mid-motion poll-CTA presentation, unmount gap) it
      // renders a REAL results-skeleton page: the shared page frame (constant hoisted frost
      // behind it) + the cutout-shimmer results skeleton, frost-through (no opaque layer blocks
      // the map here — same contrast model as the scene-stack skeleton legs), with the header
      // lane reserved at the COMPUTED chrome height. The old `return null` was the
      // frosty-blank hole this replaces.
      return (
        <BottomSheetSceneStackPageFrame
          bodyComponent={<SceneLoadingSurface rowType={skeletonRowType} withFilterStripHoles />}
          reserveHeaderLane
          chromeHeight={SEARCH_SCENE_CHROME_HEIGHT}
        />
      );
    }

    // The three slots are the module constant's fixed part components — each one a memo
    // that subscribes to its own part of the parts store, so this frame never re-renders
    // for a part change.
    return (
      <BottomSheetSceneStackPageFrame
        underlayComponent={STABLE_SEARCH_RESULTS_PAGE_BUNDLE.underlayComponent}
        backgroundComponent={STABLE_SEARCH_RESULTS_PAGE_BUNDLE.backgroundComponent}
        bodyComponent={
          <SceneScrollFactsSceneKeyContext.Provider value="search">
            <SearchResultsPersistentBodyHost
              bodyDefaults={bodyDefaults}
              bodyScrollRuntime={bodyScrollRuntime}
            />
          </SceneScrollFactsSceneKeyContext.Provider>
        }
        // P5/L1: no in-frame header — the results header rides the hoisted
        // PersistentSheetHeaderHost ('search' descriptor). The lane is reserved at the
        // COMPUTED chrome height; the scroll divider is hoisted too, so the in-frame
        // headerDividerScrollOffset lane is gone — no double-draw.
        overlayComponent={STABLE_SEARCH_RESULTS_PAGE_BUNDLE.overlayComponent}
        reserveHeaderLane
        chromeHeight={SEARCH_SCENE_CHROME_HEIGHT}
      />
    );
  }
);

SearchResultsPageBundleHost.displayName = 'SearchResultsPageBundleHost';
