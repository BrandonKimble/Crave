import type {
  SearchOverlayChromeContainerSnapshot,
  SearchOverlayChromeFrameSnapshot,
  SearchOverlayChromeHostSnapshot,
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
import { areOverlayRouteEntryValuesEqual } from './app-overlay-route-params-equality';
import type { SearchRoutePanelInteractionRef } from '../../overlays/searchOverlayRouteHostContract';
import type {
  AppRouteOverlayHostAuthoritySurface,
  AppRouteOverlayHostPublicationLane,
} from './app-route-overlay-host-runtime-contract';
import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../perf/perf-scenario-runtime-store';

type Listener = () => void;
type SnapshotEquality<TSnapshot> = (currentSnapshot: TSnapshot, nextSnapshot: TSnapshot) => boolean;
type SelectorEquality<TSelected> = (currentSelected: TSelected, nextSelected: TSelected) => boolean;
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
  shouldFreezeSuggestionSurfaceForRunOne: false,
  shouldFreezeOverlayHeaderChromeForRunOne: false,
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

const EMPTY_SEARCH_OVERLAY_CHROME_HOST_SNAPSHOT: SearchOverlayChromeHostSnapshot = {
  frameSnapshot: EMPTY_SEARCH_OVERLAY_CHROME_FRAME_SNAPSHOT,
  containerSnapshot: EMPTY_SEARCH_OVERLAY_CHROME_CONTAINER_SNAPSHOT,
  headerProps: EMPTY_SEARCH_OVERLAY_CHROME_HEADER_PROPS,
  suggestionSurfaceProps: EMPTY_SEARCH_OVERLAY_CHROME_SUGGESTION_SURFACE_PROPS,
};

const EMPTY_SEARCH_OVERLAY_GATE_SNAPSHOT: SearchOverlayHostGateSnapshot = {
  isFocused: false,
  statusBarFadeHeight: null,
  onProfilerRender: null,
};

const EMPTY_SEARCH_OVERLAY_SHELL_SNAPSHOT: SearchOverlayShellHostSnapshot = {
  isFocused: false,
  statusBarFadeHeight: null,
  backdropDimProgress: null,
  backdropSheetTopY: null,
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

const getChangedRecordKeys = <TSnapshot>(left: TSnapshot, right: TSnapshot): string[] => {
  if (Object.is(left, right)) {
    return [];
  }
  if (left == null || right == null || typeof left !== 'object' || typeof right !== 'object') {
    return ['<value>'];
  }

  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const changedKeys: string[] = [];
  keys.forEach((key) => {
    const leftValue = (left as Record<string, unknown>)[key];
    const rightValue = (right as Record<string, unknown>)[key];
    if (!Object.is(leftValue, rightValue)) {
      changedKeys.push(key);
    }
  });
  return changedKeys;
};

// F5411 — THE SLOT-PUBLISH WORK SPAN, MEASURED.
//
// This emitted `durationMs: 0` HARD-CODED. A WorkSpan whose duration is a literal zero
// cannot ever report a slow publish — the dimension its own event type is named for was a
// constant, and its two honest fields (changedKeys, listenerCount) made the event look
// measured. CLAUDE.md's methodology, verbatim: "every metric must be able to show RED (an
// always-green metric is lying — that was the whole disease)".
//
// The consumer settles the F2901 question of measure-or-delete. scripts/perf-scenario-report.js
// sorts WorkSpans by `durationMs` for `worstByDuration` and sums them into per-owner totals
// and maxima — so a permanent zero pinned this owner to the bottom of the worst list and
// contributed nothing to any total. The report could not surface this publish however slow it
// got. The span is worth having; what it needed was a number.
//
// WHAT IS MEASURED is the publish's real cost: the listener fan-out. So the scenario gate is
// read BEFORE the fan-out (it decides whether to take the clock at all) and the event is
// emitted after it. Two `performance.now()` calls, paid only while a perf scenario is
// attributing — and the changed-key diff, which used to be computed on EVERY publish as an
// argument to a logger that usually returned immediately, is now behind the same gate.
type OverlayChromeSlotPublishSpan = {
  scenarioConfig: NonNullable<ReturnType<typeof resolveActivePerfScenarioConfig>>;
  startedAt: number;
  changedKeys: string[];
};

const resolveActivePerfScenarioConfig = () => {
  const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
  return isPerfScenarioAttributionActive(scenarioConfig) ? scenarioConfig : null;
};

const logOverlayChromeSlotScenarioPublish = ({
  slotName,
  span,
  listenerCount,
}: {
  slotName: string;
  span: OverlayChromeSlotPublishSpan;
  listenerCount: number;
}): void => {
  logPerfScenarioAttributionEvent('WorkSpan', span.scenarioConfig, {
    event: 'scenario_work_span',
    owner: `overlay_chrome_slot_publish:${slotName}`,
    durationMs: performance.now() - span.startedAt,
    path: span.changedKeys.join(',') || '<unknown>',
    listenerCount,
  });
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

const createChromeHeaderPropsNormalizer =
  (): SnapshotNormalizer<SearchOverlayChromeHeaderProps> => {
    const normalizeTopLevel =
      createTopLevelStableCallbackNormalizer<SearchOverlayChromeHeaderProps>();

    return (nextRawSnapshot, currentSnapshot, getRawSnapshot) => {
      const normalizedSnapshot = normalizeTopLevel(
        nextRawSnapshot,
        currentSnapshot,
        getRawSnapshot
      );
      if (
        currentSnapshot.headerVisualModel != null &&
        normalizedSnapshot.headerVisualModel != null &&
        currentSnapshot.headerVisualModel !== normalizedSnapshot.headerVisualModel &&
        areShallowSnapshotsEqual(
          currentSnapshot.headerVisualModel,
          normalizedSnapshot.headerVisualModel
        )
      ) {
        return {
          ...normalizedSnapshot,
          headerVisualModel: currentSnapshot.headerVisualModel,
        };
      }

      return normalizedSnapshot;
    };
  };

const areChromeContainerSnapshotsEqual = (
  left: SearchOverlayChromeContainerSnapshot,
  right: SearchOverlayChromeContainerSnapshot
): boolean => {
  if (left.isSuggestionOverlayVisible !== right.isSuggestionOverlayVisible) {
    return false;
  }
  const leftStyle =
    left.overlayContainerStyle != null && typeof left.overlayContainerStyle === 'object'
      ? (left.overlayContainerStyle as Record<string, unknown>)
      : null;
  const rightStyle =
    right.overlayContainerStyle != null && typeof right.overlayContainerStyle === 'object'
      ? (right.overlayContainerStyle as Record<string, unknown>)
      : null;
  if (!areShallowSnapshotsEqual(leftStyle, rightStyle)) {
    return false;
  }

  return (
    !left.isSuggestionOverlayVisible ||
    left.shouldHideBottomNavForRender === right.shouldHideBottomNavForRender
  );
};

const areChromeSuggestionSurfacePropsEqual = (
  left: SearchOverlayChromeSuggestionSurfaceProps,
  right: SearchOverlayChromeSuggestionSurfaceProps
): boolean => {
  if (
    left.shouldShowSuggestionSurface === false &&
    right.shouldShowSuggestionSurface === false &&
    left.pointerEvents === 'none' &&
    right.pointerEvents === 'none'
  ) {
    const normalizedLeft = {
      ...left,
      navBarHeight: right.navBarHeight,
      shouldHideBottomNav: right.shouldHideBottomNav,
    };
    return areShallowSnapshotsEqual(normalizedLeft, right);
  }

  return areShallowSnapshotsEqual(left, right);
};

const areChromeHostSnapshotsEqual = (
  left: SearchOverlayChromeHostSnapshot,
  right: SearchOverlayChromeHostSnapshot
): boolean =>
  areShallowSnapshotsEqual(left.frameSnapshot, right.frameSnapshot) &&
  areChromeContainerSnapshotsEqual(left.containerSnapshot, right.containerSnapshot) &&
  areShallowSnapshotsEqual(left.headerProps, right.headerProps) &&
  areChromeSuggestionSurfacePropsEqual(left.suggestionSurfaceProps, right.suggestionSurfaceProps);

const createChromeHostSnapshotNormalizer =
  (): SnapshotNormalizer<SearchOverlayChromeHostSnapshot> => {
    const normalizeFrame =
      createTopLevelStableCallbackNormalizer<SearchOverlayChromeFrameSnapshot>();
    const normalizeHeader = createChromeHeaderPropsNormalizer();
    const normalizeSuggestion =
      createTopLevelStableCallbackNormalizer<SearchOverlayChromeSuggestionSurfaceProps>();

    return (nextRawSnapshot, currentSnapshot, getRawSnapshot) => {
      const frameSnapshot = normalizeFrame(
        nextRawSnapshot.frameSnapshot,
        currentSnapshot.frameSnapshot,
        () => getRawSnapshot().frameSnapshot
      );
      const containerSnapshot = areChromeContainerSnapshotsEqual(
        currentSnapshot.containerSnapshot,
        nextRawSnapshot.containerSnapshot
      )
        ? currentSnapshot.containerSnapshot
        : nextRawSnapshot.containerSnapshot;
      const headerProps = normalizeHeader(
        nextRawSnapshot.headerProps,
        currentSnapshot.headerProps,
        () => getRawSnapshot().headerProps
      );
      const suggestionSurfaceProps = normalizeSuggestion(
        nextRawSnapshot.suggestionSurfaceProps,
        currentSnapshot.suggestionSurfaceProps,
        () => getRawSnapshot().suggestionSurfaceProps
      );
      const nextSnapshot =
        frameSnapshot === nextRawSnapshot.frameSnapshot &&
        containerSnapshot === nextRawSnapshot.containerSnapshot &&
        headerProps === nextRawSnapshot.headerProps &&
        suggestionSurfaceProps === nextRawSnapshot.suggestionSurfaceProps
          ? nextRawSnapshot
          : {
              frameSnapshot,
              containerSnapshot,
              headerProps,
              suggestionSurfaceProps,
            };

      return areChromeHostSnapshotsEqual(currentSnapshot, nextSnapshot)
        ? currentSnapshot
        : nextSnapshot;
    };
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

// Per-scene params equality lives in app-overlay-route-params-equality.ts: a
// compile-exhaustive Record<OverlayKey, comparator> dispatched by the entry's key
// (entryId + key guard + typed per-scene params compare — no shape sniffing).
const areOverlayRouteEntriesEqual = areOverlayRouteEntryValuesEqual;

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
    left.sharedSheetRuntimeOwner === right.sharedSheetRuntimeOwner &&
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

// F5411 — `slotName` is REQUIRED and comes SECOND. It used to default to `null`, and the
// logger early-returned on null, so of the four publication slots only the two that happened
// to be named were attributed at all: `gateSlot` and `localRestaurantSheetSlot` were invisible
// to the perf scenario by OMISSION rather than by decision. A fallback that silently opts a
// subject out of instrumentation is the same disease as a constant duration, one level up —
// the instrument reports on whatever it happens to have been named for. A new slot cannot be
// created uninstrumented now; tsc enforces it.
const createSnapshotSlot = <TSnapshot>(
  initialSnapshot: TSnapshot,
  slotName: string,
  isEqual: SnapshotEquality<TSnapshot> = areShallowSnapshotsEqual,
  normalizeSnapshot: SnapshotNormalizer<TSnapshot> | null = null
): SnapshotSlot<TSnapshot> => {
  let snapshot = initialSnapshot;
  let rawSnapshot = initialSnapshot;
  const listeners = new Set<Listener>();
  const selectorListeners = new Map<
    Listener,
    {
      isEqual: SelectorEquality<unknown>;
      selected: unknown;
      selector: (snapshot: TSnapshot) => unknown;
    }
  >();
  const getRawSnapshot = () => rawSnapshot;

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    subscribeSelector: (selector, listener, selectorIsEqual = Object.is) => {
      selectorListeners.set(listener, {
        isEqual: selectorIsEqual as SelectorEquality<unknown>,
        selected: selector(snapshot),
        selector,
      });
      return () => {
        selectorListeners.delete(listener);
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

      // The span opens BEFORE the fan-out and closes after it — the fan-out IS the cost this
      // publish has. Nothing here runs unless a perf scenario is actively attributing.
      const scenarioConfig = resolveActivePerfScenarioConfig();
      const span: OverlayChromeSlotPublishSpan | null =
        scenarioConfig == null
          ? null
          : {
              scenarioConfig,
              startedAt: performance.now(),
              changedKeys: getChangedRecordKeys(snapshot, normalizedSnapshot),
            };
      snapshot = normalizedSnapshot;
      listeners.forEach((listener) => {
        listener();
      });
      selectorListeners.forEach((record, listener) => {
        const nextSelected = record.selector(snapshot);
        if (record.isEqual(record.selected, nextSelected)) {
          return;
        }
        record.selected = nextSelected;
        listener();
      });
      if (span != null) {
        logOverlayChromeSlotScenarioPublish({ slotName, span, listenerCount: listeners.size });
      }
      return true;
    },
    clearListeners: () => {
      listeners.clear();
      selectorListeners.clear();
    },
  };
};

export class AppRouteOverlayHostAuthorityController {
  private readonly chromeHostSlot = createSnapshotSlot(
    EMPTY_SEARCH_OVERLAY_CHROME_HOST_SNAPSHOT,
    'chromeHost',
    areChromeHostSnapshotsEqual,
    createChromeHostSnapshotNormalizer()
  );

  private readonly gateSlot = createSnapshotSlot(
    EMPTY_SEARCH_OVERLAY_GATE_SNAPSHOT,
    'gate',
    areShallowSnapshotsEqual,
    createTopLevelStableCallbackNormalizer()
  );

  private readonly shellSlot = createSnapshotSlot(
    EMPTY_SEARCH_OVERLAY_SHELL_SNAPSHOT,
    'shell',
    areShallowSnapshotsEqual,
    createShellSnapshotNormalizer()
  );

  private readonly localRestaurantSheetSlot = createSnapshotSlot(
    EMPTY_SEARCH_OVERLAY_LOCAL_RESTAURANT_SHEET_SNAPSHOT,
    'localRestaurantSheet',
    areLocalRestaurantSheetHostSnapshotsEqual
  );

  private overlayLocalRestaurantSheetHostAuthority: AppRouteOverlayHostAuthoritySurface['overlayLocalRestaurantSheetHostAuthority'] =
    this.localRestaurantSheetSlot;

  private searchInteractionRef: SearchRoutePanelInteractionRef | null = null;

  private readonly searchInteractionRefListeners = new Set<Listener>();

  // F1362: bumped on EVERY publish that notifies searchInteractionRefListeners (ref
  // change or authority swap), so a subscriber can see a change even when the ref
  // itself is unchanged.
  private overlayHostPublicationVersion = 0;

  public readonly authoritySurface: AppRouteOverlayHostAuthoritySurface = (() => {
    const getOverlayLocalRestaurantSheetHostAuthority = () =>
      this.overlayLocalRestaurantSheetHostAuthority;
    return {
      overlayChromeHostAuthority: this.chromeHostSlot,
      overlayGateHostAuthority: this.gateSlot,
      overlayShellHostAuthority: this.shellSlot,
      get overlayLocalRestaurantSheetHostAuthority() {
        return getOverlayLocalRestaurantSheetHostAuthority();
      },
      subscribeSearchInteractionRef: (listener) => this.subscribeSearchInteractionRef(listener),
      getSearchInteractionRefSnapshot: () => this.searchInteractionRef,
      subscribeOverlayHostPublicationVersion: (listener) =>
        this.subscribeSearchInteractionRef(listener),
      getOverlayHostPublicationVersionSnapshot: () => this.overlayHostPublicationVersion,
    };
  })();

  public readonly publicationLane: AppRouteOverlayHostPublicationLane = {
    publishOverlayChromeHostSnapshot: (snapshot) => this.chromeHostSlot.setSnapshot(snapshot),
    publishOverlayGateSnapshot: (snapshot) => this.gateSlot.setSnapshot(snapshot),
    publishOverlayShellSnapshot: (snapshot) => this.shellSlot.setSnapshot(snapshot),
    publishOverlayRestaurantHostAuthorities: (authorities) =>
      this.publishOverlayRestaurantHostAuthorities(authorities),
    publishSearchInteractionRef: (searchInteractionRef) =>
      this.setSearchInteractionRef(searchInteractionRef),
    clearSearchOverlayHostPublication: () => this.clearSearchOverlayHostPublication(),
  };

  public dispose(): void {
    this.chromeHostSlot.clearListeners();
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
    this.overlayHostPublicationVersion += 1;
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
    this.overlayHostPublicationVersion += 1;
    this.searchInteractionRefListeners.forEach((listener) => {
      listener();
    });
  }

  private clearSearchOverlayHostPublication(): void {
    this.chromeHostSlot.setSnapshot(EMPTY_SEARCH_OVERLAY_CHROME_HOST_SNAPSHOT);
    this.gateSlot.setSnapshot(EMPTY_SEARCH_OVERLAY_GATE_SNAPSHOT);
    this.shellSlot.setSnapshot(EMPTY_SEARCH_OVERLAY_SHELL_SNAPSHOT);
    this.localRestaurantSheetSlot.setSnapshot(EMPTY_SEARCH_OVERLAY_LOCAL_RESTAURANT_SHEET_SNAPSHOT);
    this.overlayLocalRestaurantSheetHostAuthority = this.localRestaurantSheetSlot;
    this.setSearchInteractionRef(null);
  }
}

export const createAppRouteOverlayHostAuthorityController =
  (): AppRouteOverlayHostAuthorityController => new AppRouteOverlayHostAuthorityController();
