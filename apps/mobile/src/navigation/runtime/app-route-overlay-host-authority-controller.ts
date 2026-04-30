import type {
  SearchOverlayChromeContainerSnapshot,
  SearchOverlayChromeFrameSnapshot,
  SearchOverlayChromeHeaderProps,
  SearchOverlayChromeSuggestionSurfaceProps,
} from '../../screens/Search/runtime/shared/search-foreground-chrome-contract';
import type { SearchOverlayHostGateSnapshot } from '../../screens/Search/runtime/shared/search-overlay-host-gate-snapshot-contract';
import type { SearchOverlayLocalRestaurantSheetHostSnapshot } from '../../screens/Search/runtime/shared/search-overlay-local-restaurant-sheet-host-snapshot-contract';
import type { SearchOverlayShellHostSnapshot } from '../../screens/Search/runtime/shared/search-overlay-shell-host-snapshot-contract';
import {
  areRouteLocalRestaurantOverlayControlSelectionSnapshotsEqual,
  EMPTY_ROUTE_LOCAL_RESTAURANT_OVERLAY_CONTROL_SELECTION_SNAPSHOT,
} from '../../screens/Search/runtime/shared/route-local-restaurant-overlay-control-selection-snapshot-contract';
import { EMPTY_ROUTE_LOCAL_RESTAURANT_OVERLAY_SESSION_SNAPSHOT } from './route-local-restaurant-overlay-session-snapshot-contract';
import type { RouteLocalRestaurantOverlaySessionSnapshot } from './route-local-restaurant-overlay-session-snapshot-contract';
import type { SearchOverlayLocalRestaurantRouteVisualSnapshot } from '../../screens/Search/runtime/shared/search-overlay-local-restaurant-sheet-visual-snapshot-contract';
import type { SnapshotAuthority } from '../../screens/Search/runtime/shared/use-snapshot-authority';
import type { OverlayRouteEntry } from './app-overlay-route-types';
import type { SearchRoutePanelInteractionRef } from '../../overlays/searchOverlayRouteHostContract';
import type {
  AppRouteOverlayHostAuthoritySurface,
  AppRouteOverlayHostPublicationLane,
} from './app-route-overlay-host-runtime-contract';

type Listener = () => void;
type SnapshotEquality<TSnapshot> = (currentSnapshot: TSnapshot, nextSnapshot: TSnapshot) => boolean;
type SnapshotNormalizer<TSnapshot> = (
  nextRawSnapshot: TSnapshot,
  currentSnapshot: TSnapshot,
  getRawSnapshot: () => TSnapshot
) => TSnapshot;

type SnapshotSlot<TSnapshot> = SnapshotAuthority<TSnapshot> & {
  setSnapshot: (snapshot: TSnapshot) => boolean;
  clearListeners: () => void;
};

const EMPTY_SEARCH_OVERLAY_CHROME_FRAME_SNAPSHOT: SearchOverlayChromeFrameSnapshot = {
  isFocused: false,
  shouldRenderSearchOverlay: false,
  onProfilerRender: null,
  hiddenSearchFiltersWarmupProps: null,
};

const EMPTY_SEARCH_OVERLAY_CHROME_CONTAINER_SNAPSHOT: SearchOverlayChromeContainerSnapshot = {
  overlayContainerStyle: null,
  isSuggestionOverlayVisible: false,
  shouldHideBottomNavForRender: false,
};

const EMPTY_SEARCH_OVERLAY_CHROME_HEADER_PROPS = {} as SearchOverlayChromeHeaderProps;

const EMPTY_SEARCH_OVERLAY_CHROME_SUGGESTION_SURFACE_PROPS =
  {} as SearchOverlayChromeSuggestionSurfaceProps;

const EMPTY_SEARCH_OVERLAY_GATE_SNAPSHOT: SearchOverlayHostGateSnapshot = {
  isFocused: false,
  statusBarFadeHeight: null,
  onProfilerRender: null,
};

const EMPTY_SEARCH_OVERLAY_SHELL_SNAPSHOT: SearchOverlayShellHostSnapshot = {
  isFocused: false,
  statusBarFadeHeight: null,
  backdropDimProgress: null,
  bottomNavVisualInputs: null,
  rankAndScoreModalLayer: null,
  priceModalLayer: null,
};

const EMPTY_SEARCH_OVERLAY_LOCAL_RESTAURANT_SHEET_SNAPSHOT: SearchOverlayLocalRestaurantSheetHostSnapshot =
  {
    restaurantSessionSnapshot: EMPTY_ROUTE_LOCAL_RESTAURANT_OVERLAY_SESSION_SNAPSHOT,
    restaurantControlSelectionSnapshot:
      EMPTY_ROUTE_LOCAL_RESTAURANT_OVERLAY_CONTROL_SELECTION_SNAPSHOT,
    shouldRenderSearchOverlay: false,
    routeHostVisualSnapshot: null,
    onProfilerRender: null,
  };

const areShallowSnapshotsEqual = <TSnapshot>(left: TSnapshot, right: TSnapshot): boolean => {
  if (Object.is(left, right)) {
    return true;
  }
  if (left == null || right == null || typeof left !== 'object' || typeof right !== 'object') {
    return false;
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (let index = 0; index < leftKeys.length; index += 1) {
    const key = leftKeys[index] as keyof TSnapshot;
    if (!Object.prototype.hasOwnProperty.call(right, key)) {
      return false;
    }
    if (!Object.is(left[key], right[key])) {
      return false;
    }
  }

  return true;
};

const areShallowArraysEqual = (left: readonly unknown[], right: readonly unknown[]): boolean => {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (!Object.is(left[index], right[index])) {
      return false;
    }
  }

  return true;
};

const getRecordAtPath = <TSnapshot>(
  snapshot: TSnapshot,
  path: readonly string[]
): Record<string, unknown> | null => {
  let cursor: unknown = snapshot;

  for (let index = 0; index < path.length; index += 1) {
    if (cursor == null || typeof cursor !== 'object') {
      return null;
    }

    cursor = (cursor as Record<string, unknown>)[path[index]];
  }

  return cursor != null && typeof cursor === 'object' ? (cursor as Record<string, unknown>) : null;
};

const createStableFunctionProxy = <TSnapshot>({
  getRawSnapshot,
  path,
  key,
}: {
  getRawSnapshot: () => TSnapshot;
  path: readonly string[];
  key: string;
}): unknown => {
  const proxy = (...args: unknown[]) => {
    const record = getRecordAtPath(getRawSnapshot(), path);
    const latestFunction = record?.[key];

    if (typeof latestFunction !== 'function') {
      return undefined;
    }

    return (latestFunction as (...callbackArgs: unknown[]) => unknown)(...args);
  };

  return proxy;
};

const normalizeRecordWithStableCallbacks = <TSnapshot, TRecord>({
  rawRecord,
  currentRecord,
  getRawSnapshot,
  path,
  proxies,
}: {
  rawRecord: TRecord;
  currentRecord: TRecord;
  getRawSnapshot: () => TSnapshot;
  path: readonly string[];
  proxies: Map<string, unknown>;
}): TRecord => {
  if (rawRecord == null || typeof rawRecord !== 'object') {
    return rawRecord;
  }

  const rawSnapshotRecord = rawRecord as Record<string, unknown>;
  const currentSnapshotRecord =
    currentRecord != null && typeof currentRecord === 'object'
      ? (currentRecord as Record<string, unknown>)
      : null;
  let nextSnapshotRecord: Record<string, unknown> | null = null;
  const nextRecord = () => {
    if (nextSnapshotRecord == null) {
      nextSnapshotRecord = { ...rawSnapshotRecord };
    }
    return nextSnapshotRecord;
  };

  Object.keys(rawSnapshotRecord).forEach((key) => {
    const value = rawSnapshotRecord[key];

    if (typeof value === 'function') {
      const proxyKey = [...path, key].join('.');
      let proxy = proxies.get(proxyKey);

      if (proxy == null) {
        proxy = createStableFunctionProxy({
          getRawSnapshot,
          path,
          key,
        });
        proxies.set(proxyKey, proxy);
      }

      nextRecord()[key] = proxy;
      return;
    }

    if (Array.isArray(value)) {
      const currentValue = currentSnapshotRecord?.[key];

      if (Array.isArray(currentValue) && areShallowArraysEqual(value, currentValue)) {
        nextRecord()[key] = currentValue;
      }
    }
  });

  const normalizedRecord = nextSnapshotRecord ?? rawSnapshotRecord;

  if (
    currentSnapshotRecord != null &&
    areShallowSnapshotsEqual(currentSnapshotRecord, normalizedRecord)
  ) {
    return currentRecord;
  }

  return normalizedRecord as TRecord;
};

const createTopLevelStableCallbackNormalizer = <TSnapshot>(): SnapshotNormalizer<TSnapshot> => {
  const proxies = new Map<string, unknown>();

  return (nextRawSnapshot, currentSnapshot, getRawSnapshot) =>
    normalizeRecordWithStableCallbacks({
      rawRecord: nextRawSnapshot,
      currentRecord: currentSnapshot,
      getRawSnapshot,
      path: [],
      proxies,
    });
};

const createShellSnapshotNormalizer = (): SnapshotNormalizer<SearchOverlayShellHostSnapshot> => {
  const proxies = new Map<string, unknown>();

  return (nextRawSnapshot, currentSnapshot, getRawSnapshot) => {
    const normalizedSnapshot = normalizeRecordWithStableCallbacks({
      rawRecord: nextRawSnapshot,
      currentRecord: currentSnapshot,
      getRawSnapshot,
      path: [],
      proxies,
    });
    let nextSnapshot = normalizedSnapshot;
    const patchSnapshot = (patch: Partial<SearchOverlayShellHostSnapshot>): void => {
      if (nextSnapshot === normalizedSnapshot) {
        nextSnapshot = {
          ...normalizedSnapshot,
        };
      }
      nextSnapshot = {
        ...nextSnapshot,
        ...patch,
      };
    };

    const bottomNavVisualInputs = normalizeRecordWithStableCallbacks({
      rawRecord: nextRawSnapshot.bottomNavVisualInputs,
      currentRecord: currentSnapshot.bottomNavVisualInputs,
      getRawSnapshot,
      path: ['bottomNavVisualInputs'],
      proxies,
    });
    if (bottomNavVisualInputs !== nextSnapshot.bottomNavVisualInputs) {
      patchSnapshot({ bottomNavVisualInputs });
    }

    const rankAndScoreModalLayer = normalizeRecordWithStableCallbacks({
      rawRecord: nextRawSnapshot.rankAndScoreModalLayer,
      currentRecord: currentSnapshot.rankAndScoreModalLayer,
      getRawSnapshot,
      path: ['rankAndScoreModalLayer'],
      proxies,
    });
    if (rankAndScoreModalLayer != null && currentSnapshot.rankAndScoreModalLayer != null) {
      const rankAndScoreSheetsProps = normalizeRecordWithStableCallbacks({
        rawRecord: rankAndScoreModalLayer.rankAndScoreSheetsProps,
        currentRecord: currentSnapshot.rankAndScoreModalLayer.rankAndScoreSheetsProps,
        getRawSnapshot,
        path: ['rankAndScoreModalLayer', 'rankAndScoreSheetsProps'],
        proxies,
      });
      const nextRankAndScoreModalLayer =
        rankAndScoreSheetsProps !== rankAndScoreModalLayer.rankAndScoreSheetsProps
          ? {
              ...rankAndScoreModalLayer,
              rankAndScoreSheetsProps,
            }
          : rankAndScoreModalLayer;
      const retainedRankAndScoreModalLayer = areShallowSnapshotsEqual(
        currentSnapshot.rankAndScoreModalLayer,
        nextRankAndScoreModalLayer
      )
        ? currentSnapshot.rankAndScoreModalLayer
        : nextRankAndScoreModalLayer;

      if (retainedRankAndScoreModalLayer !== nextSnapshot.rankAndScoreModalLayer) {
        patchSnapshot({
          rankAndScoreModalLayer: retainedRankAndScoreModalLayer,
        });
      }
    } else if (rankAndScoreModalLayer !== nextSnapshot.rankAndScoreModalLayer) {
      patchSnapshot({ rankAndScoreModalLayer });
    }

    const priceModalLayer = normalizeRecordWithStableCallbacks({
      rawRecord: nextRawSnapshot.priceModalLayer,
      currentRecord: currentSnapshot.priceModalLayer,
      getRawSnapshot,
      path: ['priceModalLayer'],
      proxies,
    });
    if (priceModalLayer != null && currentSnapshot.priceModalLayer != null) {
      const priceSheetProps = normalizeRecordWithStableCallbacks({
        rawRecord: priceModalLayer.priceSheetProps,
        currentRecord: currentSnapshot.priceModalLayer.priceSheetProps,
        getRawSnapshot,
        path: ['priceModalLayer', 'priceSheetProps'],
        proxies,
      });
      const nextPriceModalLayer =
        priceSheetProps !== priceModalLayer.priceSheetProps
          ? {
              ...priceModalLayer,
              priceSheetProps,
            }
          : priceModalLayer;
      const retainedPriceModalLayer = areShallowSnapshotsEqual(
        currentSnapshot.priceModalLayer,
        nextPriceModalLayer
      )
        ? currentSnapshot.priceModalLayer
        : nextPriceModalLayer;

      if (retainedPriceModalLayer !== nextSnapshot.priceModalLayer) {
        patchSnapshot({
          priceModalLayer: retainedPriceModalLayer,
        });
      }
    } else if (priceModalLayer !== nextSnapshot.priceModalLayer) {
      patchSnapshot({ priceModalLayer });
    }

    return areShallowSnapshotsEqual(currentSnapshot, nextSnapshot) ? currentSnapshot : nextSnapshot;
  };
};

const areOverlayRouteParamsEqual = (
  left: OverlayRouteEntry['params'],
  right: OverlayRouteEntry['params']
): boolean => {
  if (left === right) {
    return true;
  }
  if (left == null || right == null) {
    return left == null && right == null;
  }
  if ('restaurantId' in left || 'restaurantId' in right) {
    return (
      'restaurantId' in left &&
      'restaurantId' in right &&
      left.restaurantId === right.restaurantId &&
      left.source === right.source &&
      left.sessionToken === right.sessionToken
    );
  }
  if ('pollId' in left || 'pollId' in right) {
    return (
      'pollId' in left &&
      'pollId' in right &&
      left.marketKey === right.marketKey &&
      left.marketName === right.marketName &&
      left.pollId === right.pollId &&
      left.pinnedMarket === right.pinnedMarket
    );
  }
  if ('bounds' in left || 'bounds' in right) {
    return (
      'bounds' in left &&
      'bounds' in right &&
      left.marketKey === right.marketKey &&
      left.marketName === right.marketName &&
      left.bounds === right.bounds
    );
  }
  return false;
};

const areOverlayRouteEntriesEqual = (left: OverlayRouteEntry, right: OverlayRouteEntry): boolean =>
  left.key === right.key && areOverlayRouteParamsEqual(left.params, right.params);

const areLocalRestaurantSessionSnapshotsEqual = (
  left: RouteLocalRestaurantOverlaySessionSnapshot,
  right: RouteLocalRestaurantOverlaySessionSnapshot
): boolean =>
  left.activeOverlayRouteKey === right.activeOverlayRouteKey &&
  left.rootOverlayKey === right.rootOverlayKey &&
  left.overlayRouteStackLength === right.overlayRouteStackLength &&
  areOverlayRouteEntriesEqual(left.activeOverlayRoute, right.activeOverlayRoute);

const areLocalRestaurantVisualSnapshotsEqual = (
  left: SearchOverlayLocalRestaurantRouteVisualSnapshot | null,
  right: SearchOverlayLocalRestaurantRouteVisualSnapshot | null
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.overlayGeometryRuntime === right.overlayGeometryRuntime &&
    left.resultsSheetRuntimeOwner === right.resultsSheetRuntimeOwner &&
    left.visualRuntime === right.visualRuntime);

const areLocalRestaurantSheetHostSnapshotsEqual = (
  left: SearchOverlayLocalRestaurantSheetHostSnapshot,
  right: SearchOverlayLocalRestaurantSheetHostSnapshot
): boolean =>
  areLocalRestaurantSessionSnapshotsEqual(
    left.restaurantSessionSnapshot,
    right.restaurantSessionSnapshot
  ) &&
  areRouteLocalRestaurantOverlayControlSelectionSnapshotsEqual(
    left.restaurantControlSelectionSnapshot,
    right.restaurantControlSelectionSnapshot
  ) &&
  left.shouldRenderSearchOverlay === right.shouldRenderSearchOverlay &&
  areLocalRestaurantVisualSnapshotsEqual(
    left.routeHostVisualSnapshot,
    right.routeHostVisualSnapshot
  ) &&
  left.onProfilerRender === right.onProfilerRender;

const createSnapshotSlot = <TSnapshot>(
  initialSnapshot: TSnapshot,
  isEqual: SnapshotEquality<TSnapshot> = areShallowSnapshotsEqual,
  normalizeSnapshot: SnapshotNormalizer<TSnapshot> | null = null
): SnapshotSlot<TSnapshot> => {
  let snapshot = initialSnapshot;
  let rawSnapshot = initialSnapshot;
  const listeners = new Set<Listener>();
  const getRawSnapshot = () => rawSnapshot;

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    setSnapshot: (nextSnapshot) => {
      rawSnapshot = nextSnapshot;
      const normalizedSnapshot =
        normalizeSnapshot?.(nextSnapshot, snapshot, getRawSnapshot) ?? nextSnapshot;

      if (isEqual(snapshot, normalizedSnapshot)) {
        return false;
      }

      snapshot = normalizedSnapshot;
      listeners.forEach((listener) => {
        listener();
      });
      return true;
    },
    clearListeners: () => {
      listeners.clear();
    },
  };
};

export class AppRouteOverlayHostAuthorityController {
  private readonly chromeFrameSlot = createSnapshotSlot(
    EMPTY_SEARCH_OVERLAY_CHROME_FRAME_SNAPSHOT,
    areShallowSnapshotsEqual,
    createTopLevelStableCallbackNormalizer()
  );

  private readonly chromeContainerSlot = createSnapshotSlot(
    EMPTY_SEARCH_OVERLAY_CHROME_CONTAINER_SNAPSHOT
  );

  private readonly chromeHeaderSlot = createSnapshotSlot(
    EMPTY_SEARCH_OVERLAY_CHROME_HEADER_PROPS,
    areShallowSnapshotsEqual,
    createTopLevelStableCallbackNormalizer()
  );

  private readonly chromeSuggestionSurfaceSlot = createSnapshotSlot(
    EMPTY_SEARCH_OVERLAY_CHROME_SUGGESTION_SURFACE_PROPS,
    areShallowSnapshotsEqual,
    createTopLevelStableCallbackNormalizer()
  );

  private readonly gateSlot = createSnapshotSlot(
    EMPTY_SEARCH_OVERLAY_GATE_SNAPSHOT,
    areShallowSnapshotsEqual,
    createTopLevelStableCallbackNormalizer()
  );

  private readonly shellSlot = createSnapshotSlot(
    EMPTY_SEARCH_OVERLAY_SHELL_SNAPSHOT,
    areShallowSnapshotsEqual,
    createShellSnapshotNormalizer()
  );

  private readonly localRestaurantSheetSlot = createSnapshotSlot(
    EMPTY_SEARCH_OVERLAY_LOCAL_RESTAURANT_SHEET_SNAPSHOT,
    areLocalRestaurantSheetHostSnapshotsEqual
  );

  private overlayLocalRestaurantSheetHostAuthority: AppRouteOverlayHostAuthoritySurface['overlayLocalRestaurantSheetHostAuthority'] =
    this.localRestaurantSheetSlot;

  private searchInteractionRef: SearchRoutePanelInteractionRef | null = null;

  private readonly searchInteractionRefListeners = new Set<Listener>();

  public readonly authoritySurface: AppRouteOverlayHostAuthoritySurface = (() => {
    const getOverlayLocalRestaurantSheetHostAuthority = () =>
      this.overlayLocalRestaurantSheetHostAuthority;
    return {
      overlayChromeFrameHostAuthority: this.chromeFrameSlot,
      overlayChromeContainerHostAuthority: this.chromeContainerSlot,
      overlayChromeHeaderHostAuthority: this.chromeHeaderSlot,
      overlayChromeSuggestionSurfaceHostAuthority: this.chromeSuggestionSurfaceSlot,
      overlayGateHostAuthority: this.gateSlot,
      overlayShellHostAuthority: this.shellSlot,
      get overlayLocalRestaurantSheetHostAuthority() {
        return getOverlayLocalRestaurantSheetHostAuthority();
      },
      subscribeSearchInteractionRef: (listener) => this.subscribeSearchInteractionRef(listener),
      getSearchInteractionRefSnapshot: () => this.searchInteractionRef,
    };
  })();

  public readonly publicationLane: AppRouteOverlayHostPublicationLane = {
    publishOverlayChromeFrameSnapshot: (snapshot) => this.chromeFrameSlot.setSnapshot(snapshot),
    publishOverlayChromeContainerSnapshot: (snapshot) =>
      this.chromeContainerSlot.setSnapshot(snapshot),
    publishOverlayChromeHeaderProps: (props) => this.chromeHeaderSlot.setSnapshot(props),
    publishOverlayChromeSuggestionSurfaceProps: (props) =>
      this.chromeSuggestionSurfaceSlot.setSnapshot(props),
    publishOverlayGateSnapshot: (snapshot) => this.gateSlot.setSnapshot(snapshot),
    publishOverlayShellSnapshot: (snapshot) => this.shellSlot.setSnapshot(snapshot),
    publishOverlayRestaurantHostAuthorities: (authorities) =>
      this.publishOverlayRestaurantHostAuthorities(authorities),
    publishSearchInteractionRef: (searchInteractionRef) =>
      this.setSearchInteractionRef(searchInteractionRef),
    clearSearchOverlayHostPublication: () => this.clearSearchOverlayHostPublication(),
  };

  public dispose(): void {
    this.chromeFrameSlot.clearListeners();
    this.chromeContainerSlot.clearListeners();
    this.chromeHeaderSlot.clearListeners();
    this.chromeSuggestionSurfaceSlot.clearListeners();
    this.gateSlot.clearListeners();
    this.shellSlot.clearListeners();
    this.localRestaurantSheetSlot.clearListeners();
    this.searchInteractionRefListeners.clear();
  }

  private subscribeSearchInteractionRef(listener: Listener): () => void {
    this.searchInteractionRefListeners.add(listener);
    return () => {
      this.searchInteractionRefListeners.delete(listener);
    };
  }

  private setSearchInteractionRef(
    searchInteractionRef: SearchRoutePanelInteractionRef | null
  ): void {
    if (this.searchInteractionRef === searchInteractionRef) {
      return;
    }
    this.searchInteractionRef = searchInteractionRef;
    this.searchInteractionRefListeners.forEach((listener) => {
      listener();
    });
  }

  private publishOverlayRestaurantHostAuthorities({
    overlayLocalRestaurantSheetHostAuthority,
  }: Parameters<
    AppRouteOverlayHostPublicationLane['publishOverlayRestaurantHostAuthorities']
  >[0]): void {
    const didChange =
      this.overlayLocalRestaurantSheetHostAuthority !== overlayLocalRestaurantSheetHostAuthority;
    if (!didChange) {
      return;
    }
    this.overlayLocalRestaurantSheetHostAuthority = overlayLocalRestaurantSheetHostAuthority;
    this.searchInteractionRefListeners.forEach((listener) => {
      listener();
    });
  }

  private clearSearchOverlayHostPublication(): void {
    this.chromeFrameSlot.setSnapshot(EMPTY_SEARCH_OVERLAY_CHROME_FRAME_SNAPSHOT);
    this.chromeContainerSlot.setSnapshot(EMPTY_SEARCH_OVERLAY_CHROME_CONTAINER_SNAPSHOT);
    this.chromeHeaderSlot.setSnapshot(EMPTY_SEARCH_OVERLAY_CHROME_HEADER_PROPS);
    this.chromeSuggestionSurfaceSlot.setSnapshot(
      EMPTY_SEARCH_OVERLAY_CHROME_SUGGESTION_SURFACE_PROPS
    );
    this.gateSlot.setSnapshot(EMPTY_SEARCH_OVERLAY_GATE_SNAPSHOT);
    this.shellSlot.setSnapshot(EMPTY_SEARCH_OVERLAY_SHELL_SNAPSHOT);
    this.localRestaurantSheetSlot.setSnapshot(EMPTY_SEARCH_OVERLAY_LOCAL_RESTAURANT_SHEET_SNAPSHOT);
    this.overlayLocalRestaurantSheetHostAuthority = this.localRestaurantSheetSlot;
    this.setSearchInteractionRef(null);
  }
}

export const createAppRouteOverlayHostAuthorityController =
  (): AppRouteOverlayHostAuthorityController => new AppRouteOverlayHostAuthorityController();
