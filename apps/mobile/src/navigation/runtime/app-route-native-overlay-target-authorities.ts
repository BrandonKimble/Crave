import type {
  RouteOverlayChromeModeSnapshot,
  RouteOverlayDisplaySnapshot,
  RouteOverlayPollsVisibilitySnapshot,
  RouteOverlayRootSnapshot,
} from './route-overlay-display-snapshot-contract';
import type { RouteOverlayVisibilitySnapshot } from './route-overlay-visibility-snapshot-contract';
import {
  EMPTY_ROUTE_OVERLAY_IDENTITY_SNAPSHOT,
  EMPTY_ROUTE_OVERLAY_NAVIGATION_SNAPSHOT,
  type RouteOverlayIdentitySnapshot,
  type RouteOverlayNavigationSnapshot,
} from './route-overlay-navigation-snapshot-contract';
import {
  EMPTY_ROUTE_OVERLAY_SHEET_POLICY_SNAPSHOT,
  type RouteOverlaySheetPolicySnapshot,
} from './route-overlay-sheet-policy-snapshot-contract';
import type { RouteSceneSwitchSnapshot } from './route-scene-switch-snapshot-contract';
import { withSearchNavSwitchRuntimeAttribution } from '../../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';
import type { OverlayHeaderActionMode } from '../../overlays/useOverlayHeaderActionController';
import type { AppRouteOverlayCommandAuthority } from './app-route-overlay-command-controller';
import type { AppRouteSheetHostSurfaceSnapshot } from './app-route-sheet-host-surface-runtime-contract';
import type { RouteScenePolicyAuthority } from './route-scene-policy-authority-contract';
import type {
  AppRouteSheetSnapSessionAuthority,
  AppRouteSheetSnapSessionSnapshot,
} from './app-route-sheet-snap-session-runtime';
import {
  resolveRouteOverlayBottomNavIndex,
  syncRouteOverlayDisplaySharedValues,
  type RouteOverlayDisplaySharedValueTargets,
} from './route-overlay-display-shared-values';
import {
  syncRouteOverlayChromeSnapSharedValues,
  type RouteOverlayChromeSnapSharedValueTargets,
} from './route-overlay-chrome-snap-targets';
import type {
  AppRouteSceneSwitchRuntime,
  RouteSceneSwitchTransitionState,
} from './app-route-scene-switch-controller';
import {
  areSearchSurfaceVisualPoliciesEqual,
  getSearchSurfaceRuntime,
  selectSearchSurfaceRouteGraphPolicy,
  selectSearchSurfaceVisualPolicy,
  type SearchSurfaceVisualPolicySnapshot,
} from '../../screens/Search/runtime/surface/search-surface-runtime';

type Listener = () => void;

type EqualityFn<TValue> = (left: TValue, right: TValue) => boolean;

type OutputAuthority<TSnapshot> = {
  subscribe: (listener: Listener, attributionLabel?: string) => () => void;
  getSnapshot: () => TSnapshot;
};

type NavigationTarget<TSelected> = {
  selector: (snapshot: RouteOverlayNavigationSnapshot) => TSelected;
  syncNavigationSnapshot: (snapshot: RouteOverlayNavigationSnapshot, selected: TSelected) => void;
  isEqual?: EqualityFn<TSelected>;
  attributionLabel: string;
};

type NavigationOutputAuthority = {
  getSnapshot: () => RouteOverlayNavigationSnapshot;
  registerTarget: <TSelected>(target: NavigationTarget<TSelected>) => () => void;
};

type DisplayOutputAuthority = {
  getSnapshot: () => RouteOverlayDisplaySnapshot;
  registerSharedValues: (values: RouteOverlayDisplaySharedValueTargets) => () => void;
};

type ChromeModeOutputAuthority = {
  getSnapshot: () => RouteOverlayChromeModeSnapshot;
  registerSharedValues: (values: RouteOverlayChromeSnapSharedValueTargets) => () => void;
};

type PollsVisibilityTarget = {
  syncPollsVisibilitySnapshot: (snapshot: RouteOverlayPollsVisibilitySnapshot) => void;
  attributionLabel: string;
};

type DisplaySharedValueTarget = {
  values: RouteOverlayDisplaySharedValueTargets;
  activeTabIndex: number | null;
  displayedSceneKey: RouteOverlayDisplaySnapshot['displayedSceneKey'] | null;
  prewarmedSceneKey: RouteOverlayDisplaySnapshot['prewarmedSceneKey'] | null;
};

type IdentityTarget = {
  syncIdentitySnapshot: (snapshot: RouteOverlayIdentitySnapshot) => void;
  attributionLabel: string;
};

type RootTarget = {
  syncRootSnapshot: (snapshot: RouteOverlayRootSnapshot) => void;
  attributionLabel: string;
};

type SheetPolicyTarget = {
  syncSheetPolicySnapshot: (snapshot: RouteOverlaySheetPolicySnapshot) => void;
  attributionLabel: string;
};

type NavigationTargetEntry = {
  selector: (snapshot: RouteOverlayNavigationSnapshot) => unknown;
  syncNavigationSnapshot: (snapshot: RouteOverlayNavigationSnapshot, selected: unknown) => void;
  isEqual: EqualityFn<unknown>;
  attributionLabel: string;
  selected: unknown;
};

type IdentityOutputAuthority = {
  getSnapshot: () => RouteOverlayIdentitySnapshot;
  registerTarget: (target: IdentityTarget) => () => void;
};

type RootOutputAuthority = {
  getSnapshot: () => RouteOverlayRootSnapshot;
  registerTarget: (target: RootTarget) => () => void;
};

type PollsVisibilityOutputAuthority = {
  getSnapshot: () => RouteOverlayPollsVisibilitySnapshot;
  registerTarget: (target: PollsVisibilityTarget) => () => void;
};

type SheetPolicyOutputAuthority = {
  getSnapshot: () => RouteOverlaySheetPolicySnapshot;
  registerTarget: (target: SheetPolicyTarget) => () => void;
};

type ListenerEntry = {
  listener: Listener;
  attributionLabel: string;
  shouldNotify?: () => boolean;
};

type RouteScenePolicySnapshot = ReturnType<RouteScenePolicyAuthority['getSnapshot']>;
type AppRouteOverlayCommandSnapshot = ReturnType<AppRouteOverlayCommandAuthority['getSnapshot']>;
type RouteSceneSheetSessionSnapshot = AppRouteSheetSnapSessionSnapshot;

type NativeOverlayTargetSourceSnapshot = {
  routeSceneSwitchSnapshot: RouteSceneSwitchSnapshot;
  surfaceVisualPolicy: SearchSurfaceVisualPolicySnapshot;
  routeScenePolicySnapshot: RouteScenePolicySnapshot;
  commandSnapshot: AppRouteOverlayCommandSnapshot;
  sheetSessionSnapshot: RouteSceneSheetSessionSnapshot;
};

type NativeOverlayOutputKey =
  | 'chromeMode'
  | 'display'
  | 'identity'
  | 'pollsVisibility'
  | 'root'
  | 'sheetHostSurface'
  | 'navigation'
  | 'sheetPolicy'
  | 'visibility';

type NativeOverlayTargetLaneKey = NativeOverlayOutputKey;

type NativeOverlayOutputSignature = readonly unknown[];

const ROUTE_SWITCH_NATIVE_OVERLAY_TARGET_LANES: readonly NativeOverlayTargetLaneKey[] = [
  'navigation',
  'identity',
  'root',
  'display',
  'pollsVisibility',
  'sheetHostSurface',
  'chromeMode',
  'sheetPolicy',
  'visibility',
];

const POLICY_NATIVE_OVERLAY_TARGET_LANES: readonly NativeOverlayTargetLaneKey[] = [
  'navigation',
  'display',
  'pollsVisibility',
  'sheetPolicy',
];

const COMMAND_NATIVE_OVERLAY_TARGET_LANES: readonly NativeOverlayTargetLaneKey[] = ['sheetPolicy'];

const SHEET_SESSION_NATIVE_OVERLAY_TARGET_LANES: readonly NativeOverlayTargetLaneKey[] = [
  'navigation',
  'display',
  'pollsVisibility',
  'sheetPolicy',
];

type NativeOverlayTargetAuthorities = {
  routeOverlayNavigationAuthority: NavigationOutputAuthority;
  routeOverlayIdentityAuthority: IdentityOutputAuthority;
  routeOverlayRootAuthority: RootOutputAuthority;
  routeOverlayChromeModeAuthority: ChromeModeOutputAuthority;
  routeOverlayDisplayAuthority: DisplayOutputAuthority;
  routeOverlayPollsVisibilityAuthority: PollsVisibilityOutputAuthority;
  routeOverlayVisibilityAuthority: OutputAuthority<RouteOverlayVisibilitySnapshot>;
  routeSheetHostSurfaceAuthority: OutputAuthority<AppRouteSheetHostSurfaceSnapshot>;
  routeSheetHostNavigationAuthority: NavigationOutputAuthority;
  routeSheetHostSheetPolicyAuthority: SheetPolicyOutputAuthority;
  dispose: () => void;
};

const areOverlayRoutesEqual = (
  left: RouteOverlayNavigationSnapshot['activeOverlayRoute'],
  right: RouteOverlayNavigationSnapshot['activeOverlayRoute']
): boolean => left === right || (left.key === right.key && left.params === right.params);

const areOverlayRouteStacksEqual = (
  left: readonly RouteOverlayNavigationSnapshot['activeOverlayRoute'][],
  right: readonly RouteOverlayNavigationSnapshot['activeOverlayRoute'][]
): boolean =>
  left.length === right.length &&
  left.every((route, index) => areOverlayRoutesEqual(route, right[index] ?? route));

const areNavigationSnapshotsEqual = (
  left: RouteOverlayNavigationSnapshot,
  right: RouteOverlayNavigationSnapshot
): boolean =>
  areOverlayRoutesEqual(left.activeOverlayRoute, right.activeOverlayRoute) &&
  areOverlayRouteStacksEqual(left.overlayRouteStack, right.overlayRouteStack) &&
  left.activeOverlayRouteKey === right.activeOverlayRouteKey &&
  left.rootOverlayKey === right.rootOverlayKey &&
  left.overlayRouteStackLength === right.overlayRouteStackLength &&
  left.isSearchOverlay === right.isSearchOverlay &&
  left.isPersistentPollLane === right.isPersistentPollLane;

const areIdentitySnapshotsEqual = (
  left: RouteOverlayIdentitySnapshot,
  right: RouteOverlayIdentitySnapshot
): boolean =>
  left.activeOverlayRouteKey === right.activeOverlayRouteKey &&
  left.rootOverlayKey === right.rootOverlayKey &&
  left.isSearchOverlay === right.isSearchOverlay;

const areRootSnapshotsEqual = (
  left: RouteOverlayRootSnapshot,
  right: RouteOverlayRootSnapshot
): boolean =>
  left.rootOverlayKey === right.rootOverlayKey && left.isSearchOverlay === right.isSearchOverlay;

const areDisplaySnapshotsEqual = (
  left: RouteOverlayDisplaySnapshot,
  right: RouteOverlayDisplaySnapshot
): boolean =>
  left.rootOverlayKey === right.rootOverlayKey &&
  left.displayedRootOverlayKey === right.displayedRootOverlayKey &&
  left.displayedSceneKey === right.displayedSceneKey &&
  left.prewarmedSceneKey === right.prewarmedSceneKey &&
  left.isSearchOverlay === right.isSearchOverlay &&
  left.isPersistentPollLane === right.isPersistentPollLane;

const arePollsVisibilitySnapshotsEqual = (
  left: RouteOverlayPollsVisibilitySnapshot,
  right: RouteOverlayPollsVisibilitySnapshot
): boolean =>
  left.isSearchOverlay === right.isSearchOverlay &&
  left.isPersistentPollLane === right.isPersistentPollLane;

const areChromeModeSnapshotsEqual = (
  left: RouteOverlayChromeModeSnapshot,
  right: RouteOverlayChromeModeSnapshot
): boolean => left.routeChromeOverlayMode === right.routeChromeOverlayMode;

const areVisibilitySnapshotsEqual = (
  left: RouteOverlayVisibilitySnapshot,
  right: RouteOverlayVisibilitySnapshot
): boolean => left.shouldRenderSearchOverlay === right.shouldRenderSearchOverlay;

const areSheetHostSurfaceSnapshotsEqual = (
  left: AppRouteSheetHostSurfaceSnapshot,
  right: AppRouteSheetHostSurfaceSnapshot
): boolean => left.shouldRenderSceneStackSurface === right.shouldRenderSceneStackSurface;

const areSheetPolicySnapshotsEqual = (
  left: RouteOverlaySheetPolicySnapshot,
  right: RouteOverlaySheetPolicySnapshot
): boolean =>
  left.overlaySheetPolicy === right.overlaySheetPolicy ||
  (left.overlaySheetPolicy != null &&
    right.overlaySheetPolicy != null &&
    left.overlaySheetPolicy.overlaySheetVisible === right.overlaySheetPolicy.overlaySheetVisible &&
    left.overlaySheetPolicy.overlaySheetApplyNavBarCutout ===
      right.overlaySheetPolicy.overlaySheetApplyNavBarCutout &&
    left.overlaySheetPolicy.overlayHeaderActionMode ===
      right.overlaySheetPolicy.overlayHeaderActionMode);

const resolveSceneHeaderActionMode = (
  routeActiveSceneKey: RouteSceneSwitchSnapshot['routeActiveSceneKey']
): OverlayHeaderActionMode | null => {
  if (routeActiveSceneKey == null) {
    return null;
  }
  return routeActiveSceneKey === 'polls' ? 'follow-collapse' : 'fixed-close';
};

const resolveRouteSceneSwitchSnapshotFromTransitionState = (
  state: RouteSceneSwitchTransitionState
): RouteSceneSwitchSnapshot => ({
  routeActiveSceneKey: state.activeSceneKey,
  interactiveSceneKey: state.interactiveSceneKey,
  pendingSceneKey: state.isOverlaySwitchInFlight ? state.pendingTargetSceneKey : null,
  handoffSceneKey: state.isOverlaySwitchInFlight ? state.handoffSceneKey : null,
  transitionPhase: state.transitionPhase,
  transitionToken: state.transitionToken,
  transitionContract: state.transitionContract,
  activePollsParams: state.activePollsParams,
  activeDockedPollsRestoreIntent: state.activeDockedPollsRestoreIntent,
  isInteractive: state.isInteractive,
  routeState: state.routeState,
});

export const createAppRouteNativeOverlayTargetAuthorities = ({
  routeSceneSwitchRuntime,
  routeScenePolicyAuthority,
  routeOverlayCommandAuthority,
  routeSheetSnapSessionAuthority,
}: {
  routeSceneSwitchRuntime: AppRouteSceneSwitchRuntime;
  routeScenePolicyAuthority: RouteScenePolicyAuthority;
  routeOverlayCommandAuthority: AppRouteOverlayCommandAuthority;
  routeSheetSnapSessionAuthority: AppRouteSheetSnapSessionAuthority;
}): NativeOverlayTargetAuthorities => {
  let searchHeaderActionResetToken = 0;
  let searchHeaderActionModeOverride: OverlayHeaderActionMode | null = null;
  let closeHandoffOverlayHeaderActionMode: OverlayHeaderActionMode | null = null;

  const resolveSourceSnapshot = (
    transitionState = routeSceneSwitchRuntime.getTransitionState()
  ): NativeOverlayTargetSourceSnapshot => ({
    routeSceneSwitchSnapshot: resolveRouteSceneSwitchSnapshotFromTransitionState(transitionState),
    surfaceVisualPolicy: selectSearchSurfaceVisualPolicy(getSearchSurfaceRuntime().getSnapshot()),
    routeScenePolicySnapshot: routeScenePolicyAuthority.getSnapshot(),
    commandSnapshot: routeOverlayCommandAuthority.getSnapshot(),
    sheetSessionSnapshot: routeSheetSnapSessionAuthority.getSnapshot(),
  });

  const resolveIsPersistentPollLane = ({
    routeSceneSwitchSnapshot,
    surfaceVisualPolicy,
    routeScenePolicySnapshot,
    sheetSessionSnapshot,
  }: NativeOverlayTargetSourceSnapshot): boolean => {
    const routeState = routeSceneSwitchSnapshot.routeState;
    const isSurfacePersistentPollCommitted =
      surfaceVisualPolicy.phase === 'results_dismissing' &&
      surfaceVisualPolicy.canReleasePersistentPolls;
    const isPersistentPollLaneEligible =
      (routeScenePolicySnapshot.isPersistentPollLaneEligible &&
        surfaceVisualPolicy.phase !== 'results_dismissing') ||
      isSurfacePersistentPollCommitted;
    return (
      routeState.rootOverlayKey === 'search' &&
      isPersistentPollLaneEligible &&
      (!sheetSessionSnapshot.isDockedPollsDismissed ||
        routeSceneSwitchSnapshot.activeDockedPollsRestoreIntent != null ||
        isSurfacePersistentPollCommitted)
    );
  };

  const shouldRenderRouteSheetSurfaceForRouteState = (
    routeState: RouteSceneSwitchTransitionState['routeState']
  ): boolean => {
    if (routeState.rootOverlayKey === 'restaurant') {
      return false;
    }
    return true;
  };

  const areOutputSignaturesEqual = (
    left: NativeOverlayOutputSignature,
    right: NativeOverlayOutputSignature
  ): boolean =>
    left.length === right.length && left.every((value, index) => Object.is(value, right[index]));

  const resolveNavigationSignature = (
    sourceSnapshot: NativeOverlayTargetSourceSnapshot
  ): NativeOverlayOutputSignature => {
    const routeState = sourceSnapshot.routeSceneSwitchSnapshot.routeState;
    return [
      routeState.activeOverlayRoute,
      routeState.overlayRouteStack,
      routeState.rootOverlayKey,
      routeState.overlayRouteStackLength,
      resolveIsPersistentPollLane(sourceSnapshot),
    ];
  };

  const resolveIdentitySignature = (
    sourceSnapshot: NativeOverlayTargetSourceSnapshot
  ): NativeOverlayOutputSignature => {
    const routeState = sourceSnapshot.routeSceneSwitchSnapshot.routeState;
    return [routeState.activeOverlayRoute, routeState.rootOverlayKey];
  };

  const resolveRootSignature = (
    sourceSnapshot: NativeOverlayTargetSourceSnapshot
  ): NativeOverlayOutputSignature => {
    const routeState = sourceSnapshot.routeSceneSwitchSnapshot.routeState;
    return [routeState.rootOverlayKey];
  };

  const resolveDisplaySignature = (
    sourceSnapshot: NativeOverlayTargetSourceSnapshot
  ): NativeOverlayOutputSignature => {
    const { routeSceneSwitchSnapshot } = sourceSnapshot;
    const routeState = routeSceneSwitchSnapshot.routeState;
    const transitionContract = routeSceneSwitchSnapshot.transitionContract;
    return [
      routeState.rootOverlayKey,
      transitionContract?.committedRootRouteKey ?? null,
      transitionContract?.targetSceneKey ?? null,
      routeSceneSwitchSnapshot.pendingSceneKey,
      routeSceneSwitchSnapshot.routeActiveSceneKey,
      resolveIsPersistentPollLane(sourceSnapshot),
    ];
  };

  const resolvePollsVisibilitySignature = (
    sourceSnapshot: NativeOverlayTargetSourceSnapshot
  ): NativeOverlayOutputSignature => {
    const routeState = sourceSnapshot.routeSceneSwitchSnapshot.routeState;
    return [routeState.rootOverlayKey, resolveIsPersistentPollLane(sourceSnapshot)];
  };

  const resolveSheetHostSurfaceSignature = (
    sourceSnapshot: NativeOverlayTargetSourceSnapshot
  ): NativeOverlayOutputSignature => {
    const routeState = sourceSnapshot.routeSceneSwitchSnapshot.routeState;
    return [shouldRenderRouteSheetSurfaceForRouteState(routeState)];
  };

  const resolveChromeModeSignature = (
    sourceSnapshot: NativeOverlayTargetSourceSnapshot
  ): NativeOverlayOutputSignature => [
    sourceSnapshot.routeSceneSwitchSnapshot.routeState.rootOverlayKey,
  ];

  const resolveSheetPolicySignature = ({
    routeSceneSwitchSnapshot,
    surfaceVisualPolicy,
    routeScenePolicySnapshot,
    commandSnapshot,
    sheetSessionSnapshot,
  }: NativeOverlayTargetSourceSnapshot): NativeOverlayOutputSignature => [
    routeSceneSwitchSnapshot.routeActiveSceneKey,
    routeSceneSwitchSnapshot.transitionContract?.headerActionModeTarget ?? null,
    routeSceneSwitchSnapshot.routeState.rootOverlayKey,
    routeSceneSwitchSnapshot.activeDockedPollsRestoreIntent,
    routeScenePolicySnapshot.isPersistentPollLaneEligible,
    routeScenePolicySnapshot.shouldSuppressSearchAndTabSheetsForForegroundEditing,
    routeScenePolicySnapshot.shouldSuppressTabSheetsForSuggestions,
    routeScenePolicySnapshot.foregroundActivity,
    routeScenePolicySnapshot.shouldRenderRouteSheetSurface,
    routeScenePolicySnapshot.closeHandoffFreezeClassification,
    surfaceVisualPolicy.canExposePersistentPolls,
    surfaceVisualPolicy.canReleasePersistentPolls,
    commandSnapshot.searchHeaderActionResetToken,
    sheetSessionSnapshot.isDockedPollsDismissed,
  ];

  const resolveVisibilitySignature = (
    sourceSnapshot: NativeOverlayTargetSourceSnapshot
  ): NativeOverlayOutputSignature => [
    resolveIsPersistentPollLane(sourceSnapshot) ||
      sourceSnapshot.routeSceneSwitchSnapshot.routeActiveSceneKey != null ||
      sourceSnapshot.routeSceneSwitchSnapshot.transitionPhase !== 'idle',
  ];

  const resolveNavigationSnapshot = (
    sourceSnapshot: NativeOverlayTargetSourceSnapshot
  ): RouteOverlayNavigationSnapshot => {
    const { routeSceneSwitchSnapshot } = sourceSnapshot;
    const routeState = routeSceneSwitchSnapshot.routeState;
    return {
      activeOverlayRoute: routeState.activeOverlayRoute,
      overlayRouteStack: routeState.overlayRouteStack,
      activeOverlayRouteKey: routeState.activeOverlayRoute.key,
      rootOverlayKey: routeState.rootOverlayKey,
      overlayRouteStackLength: routeState.overlayRouteStackLength,
      isSearchOverlay: routeState.rootOverlayKey === 'search',
      isPersistentPollLane: resolveIsPersistentPollLane(sourceSnapshot),
    };
  };

  const resolveIdentitySnapshot = (
    sourceSnapshot: NativeOverlayTargetSourceSnapshot
  ): RouteOverlayIdentitySnapshot => {
    const routeState = sourceSnapshot.routeSceneSwitchSnapshot.routeState;
    return {
      activeOverlayRouteKey: routeState.activeOverlayRoute.key,
      rootOverlayKey: routeState.rootOverlayKey,
      isSearchOverlay: routeState.rootOverlayKey === 'search',
    };
  };

  const resolveRootSnapshot = (
    sourceSnapshot: NativeOverlayTargetSourceSnapshot
  ): RouteOverlayRootSnapshot => {
    const routeState = sourceSnapshot.routeSceneSwitchSnapshot.routeState;
    return {
      rootOverlayKey: routeState.rootOverlayKey,
      isSearchOverlay: routeState.rootOverlayKey === 'search',
    };
  };

  const resolveDisplaySnapshot = (
    sourceSnapshot: NativeOverlayTargetSourceSnapshot
  ): RouteOverlayDisplaySnapshot => {
    const { routeSceneSwitchSnapshot } = sourceSnapshot;
    const routeState = routeSceneSwitchSnapshot.routeState;
    const isPersistentPollLane = resolveIsPersistentPollLane(sourceSnapshot);
    return {
      rootOverlayKey: routeState.rootOverlayKey,
      displayedRootOverlayKey:
        routeSceneSwitchSnapshot.transitionContract?.committedRootRouteKey ??
        routeState.rootOverlayKey,
      displayedSceneKey: isPersistentPollLane
        ? 'polls'
        : routeSceneSwitchSnapshot.transitionContract?.targetSceneKey ??
          routeSceneSwitchSnapshot.pendingSceneKey ??
          routeSceneSwitchSnapshot.routeActiveSceneKey,
      prewarmedSceneKey: null,
      isSearchOverlay: routeState.rootOverlayKey === 'search',
      isPersistentPollLane,
    };
  };

  const resolvePollsVisibilitySnapshot = (
    sourceSnapshot: NativeOverlayTargetSourceSnapshot
  ): RouteOverlayPollsVisibilitySnapshot => {
    const routeState = sourceSnapshot.routeSceneSwitchSnapshot.routeState;
    const isPersistentPollLane = resolveIsPersistentPollLane(sourceSnapshot);
    return {
      isSearchOverlay: routeState.rootOverlayKey === 'search' && isPersistentPollLane,
      isPersistentPollLane,
    };
  };

  const resolveVisibilitySnapshot = (
    sourceSnapshot: NativeOverlayTargetSourceSnapshot
  ): RouteOverlayVisibilitySnapshot => ({
    shouldRenderSearchOverlay:
      resolveIsPersistentPollLane(sourceSnapshot) ||
      sourceSnapshot.routeSceneSwitchSnapshot.routeActiveSceneKey != null ||
      sourceSnapshot.routeSceneSwitchSnapshot.transitionPhase !== 'idle',
  });

  const resolveSheetHostSurfaceSnapshot = (
    sourceSnapshot: NativeOverlayTargetSourceSnapshot
  ): AppRouteSheetHostSurfaceSnapshot => {
    const routeState = sourceSnapshot.routeSceneSwitchSnapshot.routeState;
    return {
      shouldRenderSceneStackSurface: shouldRenderRouteSheetSurfaceForRouteState(routeState),
    };
  };

  const resolveChromeModeSnapshot = ({
    routeSceneSwitchSnapshot,
  }: NativeOverlayTargetSourceSnapshot): RouteOverlayChromeModeSnapshot => {
    const rootOverlayKey = routeSceneSwitchSnapshot.routeState.rootOverlayKey;
    return {
      routeChromeOverlayMode:
        rootOverlayKey === 'bookmarks' || rootOverlayKey === 'profile'
          ? 'expandedMiddle'
          : 'search',
    };
  };

  const shouldSuppressOverlaySheetVisibility = (
    sourceSnapshot: NativeOverlayTargetSourceSnapshot
  ): boolean => {
    const { routeSceneSwitchSnapshot, routeScenePolicySnapshot } = sourceSnapshot;
    const routeActiveSceneKey = routeSceneSwitchSnapshot.routeActiveSceneKey;
    const isPersistentPollLane = resolveIsPersistentPollLane(sourceSnapshot);
    const shouldSuppressOverlaySheetForForegroundEditing =
      routeScenePolicySnapshot.shouldSuppressSearchAndTabSheetsForForegroundEditing &&
      (routeActiveSceneKey === 'search' ||
        routeActiveSceneKey === 'polls' ||
        routeActiveSceneKey === 'bookmarks' ||
        routeActiveSceneKey === 'profile');
    const shouldSuppressTabOverlaySheetForSuggestions =
      routeScenePolicySnapshot.shouldSuppressTabSheetsForSuggestions &&
      (routeActiveSceneKey === 'polls' ||
        routeActiveSceneKey === 'bookmarks' ||
        routeActiveSceneKey === 'profile');
    const shouldSuppressIdleSearchOverlaySheet =
      routeActiveSceneKey === 'search' &&
      routeScenePolicySnapshot.foregroundActivity === 'idle' &&
      !routeScenePolicySnapshot.shouldRenderRouteSheetSurface &&
      !isPersistentPollLane;

    return (
      shouldSuppressOverlaySheetForForegroundEditing ||
      shouldSuppressTabOverlaySheetForSuggestions ||
      shouldSuppressIdleSearchOverlaySheet
    );
  };

  const resolveOverlayHeaderActionMode = (
    sourceSnapshot: NativeOverlayTargetSourceSnapshot
  ): OverlayHeaderActionMode | null => {
    const { commandSnapshot, routeScenePolicySnapshot, routeSceneSwitchSnapshot } = sourceSnapshot;
    const routeActiveSceneKey = routeSceneSwitchSnapshot.routeActiveSceneKey;
    const sheetHeaderSceneKey = resolveIsPersistentPollLane(sourceSnapshot)
      ? 'polls'
      : routeActiveSceneKey;
    const transitionHeaderActionModeTarget =
      routeSceneSwitchSnapshot.transitionContract?.headerActionModeTarget;
    const sceneHeaderActionMode =
      transitionHeaderActionModeTarget != null && transitionHeaderActionModeTarget !== 'preserve'
        ? transitionHeaderActionModeTarget
        : resolveSceneHeaderActionMode(sheetHeaderSceneKey);

    if (commandSnapshot.searchHeaderActionResetToken !== searchHeaderActionResetToken) {
      searchHeaderActionResetToken = commandSnapshot.searchHeaderActionResetToken;
      if (searchHeaderActionResetToken !== 0) {
        searchHeaderActionModeOverride = 'follow-collapse';
      }
    }

    const overlayHeaderActionMode =
      sceneHeaderActionMode !== 'fixed-close'
        ? sceneHeaderActionMode
        : searchHeaderActionModeOverride ?? sceneHeaderActionMode;
    const isCloseHandoffFreezeActive =
      routeScenePolicySnapshot.closeHandoffFreezeClassification === 'close-handoff';

    closeHandoffOverlayHeaderActionMode =
      !isCloseHandoffFreezeActive || closeHandoffOverlayHeaderActionMode == null
        ? overlayHeaderActionMode
        : closeHandoffOverlayHeaderActionMode;

    if (overlayHeaderActionMode == null) {
      return null;
    }

    return isCloseHandoffFreezeActive
      ? closeHandoffOverlayHeaderActionMode ?? overlayHeaderActionMode
      : overlayHeaderActionMode;
  };

  const resolveSheetPolicySnapshot = (
    sourceSnapshot: NativeOverlayTargetSourceSnapshot
  ): RouteOverlaySheetPolicySnapshot => {
    const routeActiveSceneKey = sourceSnapshot.routeSceneSwitchSnapshot.routeActiveSceneKey;
    const isPersistentPollLane = resolveIsPersistentPollLane(sourceSnapshot);
    const overlayHeaderActionMode = resolveOverlayHeaderActionMode(sourceSnapshot);

    if ((!isPersistentPollLane && routeActiveSceneKey == null) || overlayHeaderActionMode == null) {
      return EMPTY_ROUTE_OVERLAY_SHEET_POLICY_SNAPSHOT;
    }

    return {
      overlaySheetPolicy: {
        overlaySheetVisible: !shouldSuppressOverlaySheetVisibility(sourceSnapshot),
        overlaySheetApplyNavBarCutout: true,
        overlayHeaderActionMode,
      },
    };
  };

  const initialSourceSnapshot = resolveSourceSnapshot();
  let navigationSnapshot = resolveNavigationSnapshot(initialSourceSnapshot);
  let identitySnapshot = resolveIdentitySnapshot(initialSourceSnapshot);
  let rootSnapshot = resolveRootSnapshot(initialSourceSnapshot);
  let displaySnapshot = resolveDisplaySnapshot(initialSourceSnapshot);
  let pollsVisibilitySnapshot = resolvePollsVisibilitySnapshot(initialSourceSnapshot);
  let sheetHostSurfaceSnapshot = resolveSheetHostSurfaceSnapshot(initialSourceSnapshot);
  let chromeModeSnapshot = resolveChromeModeSnapshot(initialSourceSnapshot);
  let sheetPolicySnapshot = resolveSheetPolicySnapshot(initialSourceSnapshot);
  let visibilitySnapshot = resolveVisibilitySnapshot(initialSourceSnapshot);
  let navigationSignature = resolveNavigationSignature(initialSourceSnapshot);
  let identitySignature = resolveIdentitySignature(initialSourceSnapshot);
  let rootSignature = resolveRootSignature(initialSourceSnapshot);
  let displaySignature = resolveDisplaySignature(initialSourceSnapshot);
  let pollsVisibilitySignature = resolvePollsVisibilitySignature(initialSourceSnapshot);
  let sheetHostSurfaceSignature = resolveSheetHostSurfaceSignature(initialSourceSnapshot);
  let chromeModeSignature = resolveChromeModeSignature(initialSourceSnapshot);
  let sheetPolicySignature = resolveSheetPolicySignature(initialSourceSnapshot);
  let visibilitySignature = resolveVisibilitySignature(initialSourceSnapshot);
  if (navigationSnapshot == null) {
    navigationSnapshot = EMPTY_ROUTE_OVERLAY_NAVIGATION_SNAPSHOT;
  }
  if (identitySnapshot == null) {
    identitySnapshot = EMPTY_ROUTE_OVERLAY_IDENTITY_SNAPSHOT;
  }
  const chromeSnapSharedValueTargets = new Set<RouteOverlayChromeSnapSharedValueTargets>();
  const displaySharedValueTargets = new Set<DisplaySharedValueTarget>();
  const identityTargets = new Set<IdentityTarget>();
  const pollsVisibilityTargets = new Set<PollsVisibilityTarget>();
  const rootTargets = new Set<RootTarget>();
  const sheetPolicyTargets = new Set<SheetPolicyTarget>();
  const navigationTargets = new Set<NavigationTargetEntry>();
  const sheetHostSurfaceListeners = new Set<ListenerEntry>();
  const visibilityListeners = new Set<ListenerEntry>();

  const notifyListeners = (
    outputKey: NativeOverlayOutputKey,
    listeners: Set<ListenerEntry>
  ): void => {
    if (listeners.size === 0) {
      return;
    }
    withSearchNavSwitchRuntimeAttribution('nativeOverlayTargets', `notify:${outputKey}`, () => {
      listeners.forEach(({ listener, attributionLabel, shouldNotify }) => {
        if (shouldNotify != null && !shouldNotify()) {
          return;
        }
        withSearchNavSwitchRuntimeAttribution(
          'nativeOverlayTargets',
          `notify:${outputKey}:${attributionLabel}`,
          listener
        );
      });
    });
  };

  const syncDisplaySharedValueTargets = (
    snapshot: RouteOverlayDisplaySnapshot,
    operation = 'syncDisplaySharedValues'
  ): void => {
    if (displaySharedValueTargets.size === 0) {
      return;
    }
    const activeTabIndex = resolveRouteOverlayBottomNavIndex(snapshot.displayedRootOverlayKey);
    const targetsToSync = [...displaySharedValueTargets].filter(
      (target) =>
        target.activeTabIndex !== activeTabIndex ||
        target.displayedSceneKey !== snapshot.displayedSceneKey ||
        target.prewarmedSceneKey !== snapshot.prewarmedSceneKey
    );
    if (targetsToSync.length === 0) {
      return;
    }
    withSearchNavSwitchRuntimeAttribution('nativeOverlayTargets', operation, () => {
      targetsToSync.forEach((target) => {
        syncRouteOverlayDisplaySharedValues(
          target.values,
          snapshot,
          target.displayedSceneKey ?? null,
          target.prewarmedSceneKey ?? null
        );
        target.activeTabIndex = activeTabIndex;
        target.displayedSceneKey = snapshot.displayedSceneKey;
        target.prewarmedSceneKey = snapshot.prewarmedSceneKey;
      });
    });
  };

  const syncChromeSnapSharedValueTargets = (
    snapshot: RouteOverlayChromeModeSnapshot,
    operation = 'syncChromeSnapSharedValues'
  ): void => {
    if (chromeSnapSharedValueTargets.size === 0) {
      return;
    }
    withSearchNavSwitchRuntimeAttribution('nativeOverlayTargets', operation, () => {
      chromeSnapSharedValueTargets.forEach((values) => {
        syncRouteOverlayChromeSnapSharedValues(values, snapshot);
      });
    });
  };

  const syncPollsVisibilityTargets = (
    snapshot: RouteOverlayPollsVisibilitySnapshot,
    operation = 'syncPollsVisibilityTargets'
  ): void => {
    if (pollsVisibilityTargets.size === 0) {
      return;
    }
    withSearchNavSwitchRuntimeAttribution('nativeOverlayTargets', operation, () => {
      pollsVisibilityTargets.forEach((target) => {
        withSearchNavSwitchRuntimeAttribution(
          'nativeOverlayTargets',
          `${operation}:${target.attributionLabel}`,
          () => target.syncPollsVisibilitySnapshot(snapshot)
        );
      });
    });
  };

  const syncIdentityTargets = (
    snapshot: RouteOverlayIdentitySnapshot,
    operation = 'syncIdentityTargets'
  ): void => {
    if (identityTargets.size === 0) {
      return;
    }
    withSearchNavSwitchRuntimeAttribution('nativeOverlayTargets', operation, () => {
      identityTargets.forEach((target) => {
        withSearchNavSwitchRuntimeAttribution(
          'nativeOverlayTargets',
          `${operation}:${target.attributionLabel}`,
          () => target.syncIdentitySnapshot(snapshot)
        );
      });
    });
  };

  const syncRootTargets = (
    snapshot: RouteOverlayRootSnapshot,
    operation = 'syncRootTargets'
  ): void => {
    if (rootTargets.size === 0) {
      return;
    }
    withSearchNavSwitchRuntimeAttribution('nativeOverlayTargets', operation, () => {
      rootTargets.forEach((target) => {
        withSearchNavSwitchRuntimeAttribution(
          'nativeOverlayTargets',
          `${operation}:${target.attributionLabel}`,
          () => target.syncRootSnapshot(snapshot)
        );
      });
    });
  };

  const syncSheetPolicyTargets = (
    snapshot: RouteOverlaySheetPolicySnapshot,
    operation = 'syncSheetPolicyTargets'
  ): void => {
    if (sheetPolicyTargets.size === 0) {
      return;
    }
    withSearchNavSwitchRuntimeAttribution('nativeOverlayTargets', operation, () => {
      sheetPolicyTargets.forEach((target) => {
        withSearchNavSwitchRuntimeAttribution(
          'nativeOverlayTargets',
          `${operation}:${target.attributionLabel}`,
          () => target.syncSheetPolicySnapshot(snapshot)
        );
      });
    });
  };

  const syncNavigationTargets = (
    snapshot: RouteOverlayNavigationSnapshot,
    operation = 'syncNavigationTargets'
  ): void => {
    if (navigationTargets.size === 0) {
      return;
    }
    const targetsToSync: Array<{
      entry: NavigationTargetEntry;
      selected: unknown;
    }> = [];
    navigationTargets.forEach((entry) => {
      const nextSelected = entry.selector(snapshot);
      if (entry.isEqual(entry.selected, nextSelected)) {
        return;
      }
      entry.selected = nextSelected;
      targetsToSync.push({ entry, selected: nextSelected });
    });
    if (targetsToSync.length === 0) {
      return;
    }
    withSearchNavSwitchRuntimeAttribution('nativeOverlayTargets', operation, () => {
      targetsToSync.forEach(({ entry, selected }) => {
        withSearchNavSwitchRuntimeAttribution(
          'nativeOverlayTargets',
          `${operation}:${entry.attributionLabel}`,
          () => entry.syncNavigationSnapshot(snapshot, selected)
        );
      });
    });
  };

  const resolveWithNativeOverlayAttribution = <TValue>(
    operation: string,
    resolve: () => TValue
  ): TValue =>
    withSearchNavSwitchRuntimeAttribution(
      'nativeOverlayTargets',
      `recompute:${operation}`,
      resolve
    );

  const recomputeLanes = (
    laneKeys: readonly NativeOverlayTargetLaneKey[],
    source: string,
    transitionState?: RouteSceneSwitchTransitionState
  ): void => {
    const recompute = (): void => {
      const sourceSnapshot = resolveWithNativeOverlayAttribution(
        `${source}:resolveSourceSnapshot`,
        () => resolveSourceSnapshot(transitionState)
      );

      let didSheetHostSurfaceChange = false;
      let didVisibilityChange = false;

      laneKeys.forEach((laneKey) => {
        switch (laneKey) {
          case 'navigation': {
            const nextSignature = resolveNavigationSignature(sourceSnapshot);
            if (areOutputSignaturesEqual(navigationSignature, nextSignature)) {
              return;
            }
            const nextSnapshot = resolveNavigationSnapshot(sourceSnapshot);
            navigationSignature = nextSignature;
            if (!areNavigationSnapshotsEqual(navigationSnapshot, nextSnapshot)) {
              navigationSnapshot = nextSnapshot;
              syncNavigationTargets(nextSnapshot, `syncNavigationTargets:${source}`);
            }
            return;
          }
          case 'identity': {
            const nextSignature = resolveIdentitySignature(sourceSnapshot);
            if (areOutputSignaturesEqual(identitySignature, nextSignature)) {
              return;
            }
            const nextSnapshot = resolveIdentitySnapshot(sourceSnapshot);
            identitySignature = nextSignature;
            if (!areIdentitySnapshotsEqual(identitySnapshot, nextSnapshot)) {
              identitySnapshot = nextSnapshot;
              syncIdentityTargets(nextSnapshot, `syncIdentityTargets:${source}`);
            }
            return;
          }
          case 'root': {
            const nextSignature = resolveRootSignature(sourceSnapshot);
            if (areOutputSignaturesEqual(rootSignature, nextSignature)) {
              return;
            }
            const nextSnapshot = resolveRootSnapshot(sourceSnapshot);
            rootSignature = nextSignature;
            if (!areRootSnapshotsEqual(rootSnapshot, nextSnapshot)) {
              rootSnapshot = nextSnapshot;
              syncRootTargets(nextSnapshot, `syncRootTargets:${source}`);
            }
            return;
          }
          case 'display': {
            const nextSignature = resolveDisplaySignature(sourceSnapshot);
            if (areOutputSignaturesEqual(displaySignature, nextSignature)) {
              return;
            }
            const nextSnapshot = resolveDisplaySnapshot(sourceSnapshot);
            displaySignature = nextSignature;
            if (!areDisplaySnapshotsEqual(displaySnapshot, nextSnapshot)) {
              displaySnapshot = nextSnapshot;
              syncDisplaySharedValueTargets(nextSnapshot, `syncDisplaySharedValues:${source}`);
            }
            return;
          }
          case 'pollsVisibility': {
            const nextSignature = resolvePollsVisibilitySignature(sourceSnapshot);
            if (areOutputSignaturesEqual(pollsVisibilitySignature, nextSignature)) {
              return;
            }
            const nextSnapshot = resolvePollsVisibilitySnapshot(sourceSnapshot);
            pollsVisibilitySignature = nextSignature;
            if (!arePollsVisibilitySnapshotsEqual(pollsVisibilitySnapshot, nextSnapshot)) {
              pollsVisibilitySnapshot = nextSnapshot;
              syncPollsVisibilityTargets(nextSnapshot, `syncPollsVisibilityTargets:${source}`);
            }
            return;
          }
          case 'sheetHostSurface': {
            const nextSignature = resolveSheetHostSurfaceSignature(sourceSnapshot);
            if (areOutputSignaturesEqual(sheetHostSurfaceSignature, nextSignature)) {
              return;
            }
            const nextSnapshot = resolveSheetHostSurfaceSnapshot(sourceSnapshot);
            sheetHostSurfaceSignature = nextSignature;
            if (!areSheetHostSurfaceSnapshotsEqual(sheetHostSurfaceSnapshot, nextSnapshot)) {
              sheetHostSurfaceSnapshot = nextSnapshot;
              didSheetHostSurfaceChange = true;
            }
            return;
          }
          case 'chromeMode': {
            const nextSignature = resolveChromeModeSignature(sourceSnapshot);
            if (areOutputSignaturesEqual(chromeModeSignature, nextSignature)) {
              return;
            }
            const nextSnapshot = resolveChromeModeSnapshot(sourceSnapshot);
            chromeModeSignature = nextSignature;
            if (!areChromeModeSnapshotsEqual(chromeModeSnapshot, nextSnapshot)) {
              chromeModeSnapshot = nextSnapshot;
              syncChromeSnapSharedValueTargets(
                nextSnapshot,
                `syncChromeSnapSharedValues:${source}`
              );
            }
            return;
          }
          case 'sheetPolicy': {
            const nextSignature = resolveSheetPolicySignature(sourceSnapshot);
            if (areOutputSignaturesEqual(sheetPolicySignature, nextSignature)) {
              return;
            }
            const nextSnapshot = resolveSheetPolicySnapshot(sourceSnapshot);
            sheetPolicySignature = nextSignature;
            if (!areSheetPolicySnapshotsEqual(sheetPolicySnapshot, nextSnapshot)) {
              sheetPolicySnapshot = nextSnapshot;
              syncSheetPolicyTargets(nextSnapshot, `syncSheetPolicyTargets:${source}`);
            }
            return;
          }
          case 'visibility': {
            const nextSignature = resolveVisibilitySignature(sourceSnapshot);
            if (areOutputSignaturesEqual(visibilitySignature, nextSignature)) {
              return;
            }
            const nextSnapshot = resolveVisibilitySnapshot(sourceSnapshot);
            visibilitySignature = nextSignature;
            if (!areVisibilitySnapshotsEqual(visibilitySnapshot, nextSnapshot)) {
              visibilitySnapshot = nextSnapshot;
              didVisibilityChange = true;
            }
            return;
          }
        }
      });

      if (!didSheetHostSurfaceChange && !didVisibilityChange) {
        return;
      }
      if (didSheetHostSurfaceChange) {
        notifyListeners('sheetHostSurface', sheetHostSurfaceListeners);
      }
      if (didVisibilityChange) {
        notifyListeners('visibility', visibilityListeners);
      }
    };

    if (source === 'routeSwitch') {
      recompute();
      return;
    }

    withSearchNavSwitchRuntimeAttribution('nativeOverlayTargets', `recompute:${source}`, recompute);
  };

  const subscribeToSet =
    (listeners: Set<ListenerEntry>) =>
    (listener: Listener, attributionLabel = 'anonymous'): (() => void) => {
      const entry = {
        listener,
        attributionLabel,
      };
      listeners.add(entry);
      return () => {
        listeners.delete(entry);
      };
    };

  const registerNavigationTarget = <TSelected>(
    target: NavigationTarget<TSelected>
  ): (() => void) => {
    const entry: NavigationTargetEntry = {
      selector: target.selector as (snapshot: RouteOverlayNavigationSnapshot) => unknown,
      syncNavigationSnapshot: target.syncNavigationSnapshot as (
        snapshot: RouteOverlayNavigationSnapshot,
        selected: unknown
      ) => void,
      isEqual: (target.isEqual ?? Object.is) as EqualityFn<unknown>,
      attributionLabel: target.attributionLabel,
      selected: target.selector(navigationSnapshot),
    };
    navigationTargets.add(entry);
    return () => {
      navigationTargets.delete(entry);
    };
  };

  const unsubscribers = [
    routeSceneSwitchRuntime.setRouteNativeOverlayTransitionDispatchTarget((transitionState) => {
      recomputeLanes(ROUTE_SWITCH_NATIVE_OVERLAY_TARGET_LANES, 'routeSwitch', transitionState);
    }),
    routeScenePolicyAuthority.subscribe(() =>
      recomputeLanes(POLICY_NATIVE_OVERLAY_TARGET_LANES, 'policy')
    ),
    routeOverlayCommandAuthority.subscribe(() =>
      recomputeLanes(COMMAND_NATIVE_OVERLAY_TARGET_LANES, 'command')
    ),
    routeSheetSnapSessionAuthority.subscribe(() =>
      recomputeLanes(SHEET_SESSION_NATIVE_OVERLAY_TARGET_LANES, 'sheetSession')
    ),
    getSearchSurfaceRuntime().subscribeSelector(
      selectSearchSurfaceRouteGraphPolicy,
      () => recomputeLanes(POLICY_NATIVE_OVERLAY_TARGET_LANES, 'searchSurface'),
      areSearchSurfaceVisualPoliciesEqual
    ),
  ];

  return {
    routeOverlayNavigationAuthority: {
      getSnapshot: () => navigationSnapshot,
      registerTarget: registerNavigationTarget,
    },
    routeOverlayIdentityAuthority: {
      getSnapshot: () => identitySnapshot,
      registerTarget: (target) => {
        identityTargets.add(target);
        syncIdentityTargets(identitySnapshot, 'syncIdentityTargets:register');
        return () => {
          identityTargets.delete(target);
        };
      },
    },
    routeOverlayRootAuthority: {
      getSnapshot: () => rootSnapshot,
      registerTarget: (target) => {
        rootTargets.add(target);
        syncRootTargets(rootSnapshot, 'syncRootTargets:register');
        return () => {
          rootTargets.delete(target);
        };
      },
    },
    routeOverlayChromeModeAuthority: {
      getSnapshot: () => chromeModeSnapshot,
      registerSharedValues: (values) => {
        chromeSnapSharedValueTargets.add(values);
        syncChromeSnapSharedValueTargets(chromeModeSnapshot, 'syncChromeSnapSharedValues:register');
        return () => {
          chromeSnapSharedValueTargets.delete(values);
        };
      },
    },
    routeSheetHostNavigationAuthority: {
      getSnapshot: () => navigationSnapshot,
      registerTarget: registerNavigationTarget,
    },
    routeOverlayDisplayAuthority: {
      getSnapshot: () => displaySnapshot,
      registerSharedValues: (values) => {
        const target: DisplaySharedValueTarget = {
          values,
          activeTabIndex: null,
          displayedSceneKey: null,
          prewarmedSceneKey: null,
        };
        displaySharedValueTargets.add(target);
        syncDisplaySharedValueTargets(displaySnapshot, 'syncDisplaySharedValues:register');
        return () => {
          displaySharedValueTargets.delete(target);
        };
      },
    },
    routeOverlayPollsVisibilityAuthority: {
      getSnapshot: () => pollsVisibilitySnapshot,
      registerTarget: (target) => {
        pollsVisibilityTargets.add(target);
        syncPollsVisibilityTargets(pollsVisibilitySnapshot, 'syncPollsVisibilityTargets:register');
        return () => {
          pollsVisibilityTargets.delete(target);
        };
      },
    },
    routeOverlayVisibilityAuthority: {
      subscribe: subscribeToSet(visibilityListeners),
      getSnapshot: () => visibilitySnapshot,
    },
    routeSheetHostSurfaceAuthority: {
      subscribe: subscribeToSet(sheetHostSurfaceListeners),
      getSnapshot: () => sheetHostSurfaceSnapshot,
    },
    routeSheetHostSheetPolicyAuthority: {
      getSnapshot: () => sheetPolicySnapshot,
      registerTarget: (target) => {
        sheetPolicyTargets.add(target);
        syncSheetPolicyTargets(sheetPolicySnapshot, 'syncSheetPolicyTargets:register');
        return () => {
          sheetPolicyTargets.delete(target);
        };
      },
    },
    dispose: () => {
      unsubscribers.forEach((unsubscribe) => {
        unsubscribe();
      });
      chromeSnapSharedValueTargets.clear();
      navigationTargets.clear();
      displaySharedValueTargets.clear();
      identityTargets.clear();
      pollsVisibilityTargets.clear();
      rootTargets.clear();
      sheetPolicyTargets.clear();
      sheetHostSurfaceListeners.clear();
      visibilityListeners.clear();
    },
  };
};
