import type {
  BottomSheetProgrammaticRuntimeModel,
  BottomSheetRuntimeModel,
} from '../../overlays/useBottomSheetRuntime';
import { runOnUI, type SharedValue } from 'react-native-reanimated';
import type {
  BottomSheetSharedRuntimeConfigSharedValues,
  BottomSheetSharedRuntimeConfigSnapshot,
} from '../../overlays/bottomSheetSharedRuntimeContract';
import {
  ROUTE_SHARED_SNAP_PERSISTENCE_KEY,
  type AppRouteSheetSnapSessionAuthority,
  type AppRouteSheetSnapSessionActions,
  type AppRouteSheetSnapSessionSnapshot,
} from './app-route-sheet-snap-session-runtime';
import type { OverlayKey, OverlaySheetSnap } from '../../overlays/types';
import {
  EMPTY_SEARCH_ROUTE_VISUAL_STATE,
  type SearchRouteOverlayRouteScope,
} from '../../overlays/searchRouteOverlayRuntimeContract';
import type {
  SearchRouteSceneStackFrameEntry,
  SearchRouteSceneStackPresentationState,
  SearchRouteSceneStackChromeVisualState,
} from '../../overlays/searchRouteSceneStackSheetContract';
import { EMPTY_SEARCH_ROUTE_SHEET_CHROME_TRANSPORT_SNAPSHOT } from '../../screens/Search/runtime/shared/search-route-sheet-chrome-transport-snapshot-contract';
import {
  EMPTY_SEARCH_ROUTE_SHEET_MOTION_STATE_SNAPSHOT,
  type SearchRouteSheetMotionStateSnapshot,
} from '../../screens/Search/runtime/shared/search-route-sheet-motion-state-snapshot-contract';
import { EMPTY_SEARCH_ROUTE_SHEET_RESOLVED_VISUAL_SELECTION_SNAPSHOT } from '../../screens/Search/runtime/shared/search-route-sheet-resolved-visual-selection-snapshot-contract';
import { EMPTY_SEARCH_ROUTE_SHEET_SCROLL_BODY_DEFAULTS_SNAPSHOT } from '../../screens/Search/runtime/shared/search-route-sheet-scroll-body-defaults-snapshot-contract';
import { EMPTY_SEARCH_ROUTE_SHEET_SCROLL_SHARED_RUNTIME_SNAPSHOT } from '../../screens/Search/runtime/shared/search-route-sheet-scroll-shared-runtime-snapshot-contract';
import type { SearchRouteSheetHostFrameSnapshot } from '../../screens/Search/runtime/shared/search-route-sheet-host-frame-snapshot-contract';
import { withSearchNavSwitchRuntimeAttribution } from '../../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';
import type {
  RouteOverlayNavigationAuthority,
  RouteOverlaySheetPolicyAuthority,
  RouteSceneFrameAuthority,
  RouteSheetVisualAuthority,
} from '../../screens/Search/runtime/shared/route-authority-contract';
import type {
  AppRouteSceneInteractivityAuthority,
  AppRouteSceneSwitchAuthority,
  AppRouteSceneTransitionAuthority,
} from './app-route-scene-switch-authority';
import type { AppRouteSceneMotionRuntime } from './app-route-scene-motion-controller';
import type { RouteSceneSwitchTransitionActions } from './app-route-scene-switch-controller';
import type { AppRouteSharedSheetPresentationRuntime } from './app-route-shared-sheet-presentation-controller';
import {
  EMPTY_APP_ROUTE_SHEET_HOST_FRAME_SNAPSHOT,
  EMPTY_APP_ROUTE_SHEET_HOST_SURFACE_SNAPSHOT,
  EMPTY_APP_ROUTE_SHEET_HOST_SURFACE_BODY_SNAPSHOT,
  areAppRouteSheetHostSurfaceSnapshotsEqual,
  areAppRouteSheetHostSurfaceBodySnapshotsEqual,
  type AppRouteSheetHostRuntimeConfigAuthority,
  type AppRouteSheetHostMotionRuntimeAuthority,
  type AppRouteSheetHostSurfaceBodyAuthority,
  type AppRouteSheetHostSurfaceAuthority,
  type AppRouteSheetHostSurfaceSnapshot,
  type AppRouteSheetHostSurfaceBodySnapshot,
  type AppRouteSheetHostSurfaceFrameAuthority,
} from './app-route-sheet-host-surface-runtime-contract';
import type {
  SearchRouteSheetFrameHostInput,
  SearchRouteSheetMotionPersistenceInput,
} from './search-route-sheet-surface-state-runtime-contract';
import {
  syncSheetFrameHostNativeSharedValues,
  type AppRouteSheetFrameHostNativeSharedValues,
} from './app-route-sheet-frame-host-native-targets';
import { resolveAppRouteSheetScenePolicy } from './app-route-scene-policy-registry';
import {
  areSearchSurfaceVisualPoliciesEqual,
  getSearchSurfaceRuntime,
  selectSearchSurfaceRouteGraphPolicy,
  selectSearchSurfaceVisualPolicy,
  type SearchSurfaceRuntimeSnapshot,
  type SearchSurfaceVisualPolicySnapshot,
} from '../../screens/Search/runtime/surface/search-surface-runtime';

type Listener = () => void;
type SelectorEquality<TSelected> = (currentSelected: TSelected, nextSelected: TSelected) => boolean;
type SelectorListenerRecord<TSnapshot> = {
  isEqual: SelectorEquality<unknown>;
  selected: unknown;
  selector: (snapshot: TSnapshot) => unknown;
};

type SheetRuntimeModel = BottomSheetRuntimeModel | BottomSheetProgrammaticRuntimeModel;

export type AppRouteSheetHostNativeAdapterSnapshot = {
  presentationStateOverride: BottomSheetRuntimeModel['presentationState'];
  initialSheetY: number;
  frameHostInput: SearchRouteSheetFrameHostInput;
  chromeVisualState: SearchRouteSceneStackChromeVisualState | null;
};

export type AppRouteSheetHostNativeAdapterAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => AppRouteSheetHostNativeAdapterSnapshot;
  registerSharedValues: (values: AppRouteSheetFrameHostNativeSharedValues) => () => void;
};

type AppRouteSheetHostNativeRuntimeInput = {
  sharedRuntimeModel: BottomSheetRuntimeModel;
  routeSheetFrameHostAuthority: AppRouteSheetHostSurfaceFrameAuthority;
};

type SheetHostNavigationSelectorSnapshot = {
  activeOverlayRouteKey: OverlayKey;
  isPersistentPollLane: boolean;
  overlayRouteStackLength: number;
  rootOverlayKey: OverlayKey;
};

type SheetHostSearchSurfaceRuntimeReseedSnapshot = {
  activeBundleKind: SearchSurfaceRuntimeSnapshot['activeBundle']['kind'];
  activeBundleKey: string;
  activeResultsDataMode: string | null;
  activeResultsCoverState: string | null;
  activeResultsFrozen: boolean | null;
  dismissBoundaryReached: boolean | null;
  dismissTransactionId: string | null;
  heldBundleKey: string | null;
  heldResultsDataMode: string | null;
  redrawDataMode: string | null;
  redrawTransactionId: string | null;
  visualPhase: SearchSurfaceVisualPolicySnapshot['phase'];
  visualTransactionId: string | null;
};

type AppRouteSheetHostSurfaceVisibilityAuthority = {
  subscribe: (listener: Listener, attributionLabel?: string) => () => void;
  getSnapshot: () => AppRouteSheetHostSurfaceSnapshot;
};

type AppRouteSheetHostAuthorityControllerInput = {
  routeSceneFrameAuthority: RouteSceneFrameAuthority;
  routeSheetHostSurfaceAuthority: AppRouteSheetHostSurfaceVisibilityAuthority;
  routeOverlayNavigationAuthority: RouteOverlayNavigationAuthority;
  routeOverlaySheetPolicyAuthority: RouteOverlaySheetPolicyAuthority;
  routeSheetVisualAuthority: RouteSheetVisualAuthority;
  routeSceneSwitchAuthority: AppRouteSceneSwitchAuthority;
  routeSceneInteractivityAuthority: AppRouteSceneInteractivityAuthority;
  routeSceneTransitionAuthority: AppRouteSceneTransitionAuthority;
  routeSceneMotionRuntime: AppRouteSceneMotionRuntime;
  routeSceneSwitchActions: RouteSceneSwitchTransitionActions;
  routeSharedSheetPresentationRuntime: AppRouteSharedSheetPresentationRuntime;
  routeSheetSnapSessionAuthority: AppRouteSheetSnapSessionAuthority;
  routeSheetSnapSessionActions: AppRouteSheetSnapSessionActions;
};

type AppRouteSheetHostResolvedSurfaceInput = {
  activeSceneKey: OverlayKey | null;
  activeShellSpec: NonNullable<SearchRouteSceneStackFrameEntry['shellSpec']>;
  activeRenderableShellSpec: NonNullable<SearchRouteSceneStackFrameEntry['shellSpec']> | null;
  activeSemanticOverlayKey: OverlayKey;
  canRenderSurface: boolean;
  chromeVisualState: SearchRouteSceneStackChromeVisualState | null;
  displayedSceneKey: OverlayKey | null;
  initialSheetY: number;
  isPersistentPollLane: boolean;
  isRenderable: boolean;
  overlayRouteScope: SearchRouteOverlayRouteScope;
  overlaySheetPolicy: ReturnType<
    RouteOverlaySheetPolicyAuthority['getSnapshot']
  >['overlaySheetPolicy'];
  presentationState: SearchRouteSceneStackPresentationState;
  resolvedRuntimeModel: SheetRuntimeModel | null;
  resolvedShellIdentityKey: string;
  rootOverlayKey: OverlayKey;
  surfaceVisualPolicy: SearchSurfaceVisualPolicySnapshot;
  visible: boolean;
};

type AppRouteSheetHostInteractionPolicy = {
  dismissThreshold?: number;
  preventSwipeDismiss: boolean;
};

const resolvePreservedOutgoingSheetSceneKey = (
  snapshot: ReturnType<AppRouteSceneSwitchAuthority['getSnapshot']>
): OverlayKey | null => {
  const transitionContract = snapshot.transitionContract;
  if (
    snapshot.transitionPhase === 'idle' ||
    transitionContract?.sheetTransitionPlan.contentHandoff !== 'preserveOutgoingUntilSettle'
  ) {
    return null;
  }
  return transitionContract.sourceSceneKey ?? snapshot.handoffSceneKey;
};

export type AppRouteSheetHostAuthorityControllerRuntime = {
  nativeAdapterAuthority: AppRouteSheetHostNativeAdapterAuthority;
  routeSheetMotionRuntimeAuthority: AppRouteSheetHostMotionRuntimeAuthority;
  routeSheetRuntimeConfigAuthority: AppRouteSheetHostRuntimeConfigAuthority;
  routeSheetSurfaceBodyAuthority: AppRouteSheetHostSurfaceBodyAuthority;
  routeSheetSurfaceFrameAuthority: AppRouteSheetHostSurfaceFrameAuthority;
  routeSheetSurfaceAuthority: AppRouteSheetHostSurfaceAuthority;
  setNativeRuntime: (input: AppRouteSheetHostNativeRuntimeInput) => void;
  dispose: () => void;
};

const EMPTY_ROUTE_SHEET_SHELL_SPEC: NonNullable<SearchRouteSceneStackFrameEntry['shellSpec']> = {
  overlayKey: 'searchRoute',
  semanticOverlayKey: null,
  shellIdentityKey: 'route-sheet-surface:empty',
  sceneIdentityKey: null,
  surfaceKind: 'scene-stack',
  snapPoints: EMPTY_SEARCH_ROUTE_VISUAL_STATE.snapPoints,
};

const EMPTY_ACTIVE_SCENE_FRAME_ENTRY: SearchRouteSceneStackFrameEntry = {
  sceneKey: 'searchRoute',
  shellSpec: EMPTY_ROUTE_SHEET_SHELL_SPEC,
};

const EMPTY_PRESENTATION_STATE: SearchRouteSceneStackPresentationState = {
  sheetTranslateY: EMPTY_SEARCH_ROUTE_VISUAL_STATE.sheetTranslateY,
  sheetScrollOffset: EMPTY_SEARCH_ROUTE_VISUAL_STATE.sheetScrollOffset,
  sheetMomentum: EMPTY_SEARCH_ROUTE_VISUAL_STATE.sheetMomentum,
};

const EMPTY_RUNTIME_CONFIG_SNAPSHOT: BottomSheetSharedRuntimeConfigSnapshot = {
  visible: false,
  listScrollEnabled: true,
  snapPoints: EMPTY_SEARCH_ROUTE_VISUAL_STATE.snapPoints,
  initialSnapPoint: 'middle',
  dismissThreshold: undefined,
  preventSwipeDismiss: false,
  interactionEnabled: true,
};

const EMPTY_MOTION_PERSISTENCE_INPUT: SearchRouteSheetMotionPersistenceInput = {
  activeShellSpec: null,
  resolvedShellIdentityKey: 'route-sheet-surface:empty',
  activeSemanticOverlayKey: 'searchRoute',
  rootOverlayKey: 'searchRoute',
  overlayRouteStackLength: 0,
};

const hasRenderableSheetSurface = ({
  isRenderable,
  overlaySheetVisible,
  headerComponent,
  backgroundComponent,
  overlayComponent,
  flashListProps,
}: {
  isRenderable: boolean;
  overlaySheetVisible: boolean;
  headerComponent: unknown;
  backgroundComponent: unknown;
  overlayComponent: unknown;
  flashListProps: unknown;
}): boolean =>
  isRenderable &&
  (overlaySheetVisible ||
    headerComponent != null ||
    backgroundComponent != null ||
    overlayComponent != null ||
    flashListProps != null);

const resolveSnapPersistenceKey = ({
  resolvedShellIdentityKey,
  activeSemanticOverlayKey,
  activeShellSpec,
}: SearchRouteSheetMotionPersistenceInput): string | null => {
  if (activeShellSpec == null) {
    return null;
  }
  const sceneSnapPersistence =
    resolveAppRouteSheetScenePolicy(activeSemanticOverlayKey).snapPersistence;
  switch (sceneSnapPersistence) {
    case 'shared':
      return ROUTE_SHARED_SNAP_PERSISTENCE_KEY;
    case 'scene':
      return `overlay:${resolvedShellIdentityKey}`;
    case 'none':
    default:
      return null;
  }
};

const isDockedPollsSearchSurface = ({
  activeSemanticOverlayKey,
  rootOverlayKey,
  overlayRouteScope,
}: Pick<
  AppRouteSheetHostResolvedSurfaceInput,
  'activeSemanticOverlayKey' | 'rootOverlayKey' | 'overlayRouteScope'
>): boolean =>
  activeSemanticOverlayKey === 'polls' &&
  rootOverlayKey === 'search' &&
  overlayRouteScope.overlayRouteStackLength <= 1;

const isExplicitlyDismissedDockedPollsRoot = (
  resolvedSurfaceInput: Pick<
    AppRouteSheetHostResolvedSurfaceInput,
    'rootOverlayKey' | 'overlayRouteScope'
  >,
  sheetSnapSessionSnapshot: AppRouteSheetSnapSessionSnapshot
): boolean =>
  resolvedSurfaceInput.rootOverlayKey === 'search' &&
  resolvedSurfaceInput.overlayRouteScope.overlayRouteStackLength <= 1 &&
  sheetSnapSessionSnapshot.isDockedPollsDismissed &&
  sheetSnapSessionSnapshot.sceneSheetSnaps.polls === 'hidden';

const normalizePolicyInitialSnap = (
  snap: OverlaySheetSnap | null | undefined
): Exclude<OverlaySheetSnap, 'hidden'> => (snap != null && snap !== 'hidden' ? snap : 'middle');

const resolvePolicyInitialSnap = (
  sceneKey: OverlayKey | null
): Exclude<OverlaySheetSnap, 'hidden'> =>
  normalizePolicyInitialSnap(
    resolveAppRouteSheetScenePolicy(sceneKey ?? 'searchRoute').defaultFirstEntrySnap
  );

const resolveSharedSheetInteractionPolicy = ({
  activeSemanticOverlayKey,
  activeShellSpec,
  overlayRouteScope,
  rootOverlayKey,
}: Pick<
  AppRouteSheetHostResolvedSurfaceInput,
  'activeSemanticOverlayKey' | 'activeShellSpec' | 'overlayRouteScope' | 'rootOverlayKey'
>): AppRouteSheetHostInteractionPolicy => {
  if (
    isDockedPollsSearchSurface({
      activeSemanticOverlayKey,
      rootOverlayKey,
      overlayRouteScope,
    })
  ) {
    return {
      dismissThreshold: activeShellSpec.snapPoints.collapsed + 1,
      preventSwipeDismiss: false,
    };
  }

  const scenePolicy = resolveAppRouteSheetScenePolicy(activeSemanticOverlayKey);
  return {
    dismissThreshold: undefined,
    preventSwipeDismiss: !scenePolicy.canSwipeDismiss,
  };
};

const areNativeAdapterSnapshotsEqual = (
  left: AppRouteSheetHostNativeAdapterSnapshot,
  right: AppRouteSheetHostNativeAdapterSnapshot
): boolean =>
  left.presentationStateOverride.sheetY === right.presentationStateOverride.sheetY &&
  left.presentationStateOverride.scrollOffset === right.presentationStateOverride.scrollOffset &&
  left.presentationStateOverride.momentumFlag === right.presentationStateOverride.momentumFlag &&
  left.initialSheetY === right.initialSheetY &&
  left.frameHostInput.activeSemanticOverlayKey === right.frameHostInput.activeSemanticOverlayKey &&
  left.frameHostInput.overlaySheetPolicy === right.frameHostInput.overlaySheetPolicy &&
  left.frameHostInput.expandedSnapPoint === right.frameHostInput.expandedSnapPoint &&
  left.frameHostInput.middleSnapPoint === right.frameHostInput.middleSnapPoint &&
  left.frameHostInput.collapsedSnapPoint === right.frameHostInput.collapsedSnapPoint &&
  left.frameHostInput.sheetY === right.frameHostInput.sheetY &&
  left.chromeVisualState === right.chromeVisualState;

const shouldNotifyNativeAdapterListeners = (
  left: AppRouteSheetHostNativeAdapterSnapshot,
  right: AppRouteSheetHostNativeAdapterSnapshot
): boolean =>
  left.presentationStateOverride.sheetY !== right.presentationStateOverride.sheetY ||
  left.presentationStateOverride.scrollOffset !== right.presentationStateOverride.scrollOffset ||
  left.presentationStateOverride.momentumFlag !== right.presentationStateOverride.momentumFlag ||
  left.frameHostInput.activeSemanticOverlayKey !== right.frameHostInput.activeSemanticOverlayKey ||
  left.frameHostInput.overlaySheetPolicy !== right.frameHostInput.overlaySheetPolicy ||
  left.frameHostInput.expandedSnapPoint !== right.frameHostInput.expandedSnapPoint ||
  left.frameHostInput.middleSnapPoint !== right.frameHostInput.middleSnapPoint ||
  left.frameHostInput.collapsedSnapPoint !== right.frameHostInput.collapsedSnapPoint ||
  left.chromeVisualState !== right.chromeVisualState;

const shouldSyncNativeAdapterSharedValues = (
  left: AppRouteSheetHostNativeAdapterSnapshot,
  right: AppRouteSheetHostNativeAdapterSnapshot
): boolean =>
  left.frameHostInput.overlaySheetPolicy !== right.frameHostInput.overlaySheetPolicy ||
  left.frameHostInput.activeSemanticOverlayKey !== right.frameHostInput.activeSemanticOverlayKey ||
  left.frameHostInput.middleSnapPoint !== right.frameHostInput.middleSnapPoint ||
  left.frameHostInput.collapsedSnapPoint !== right.frameHostInput.collapsedSnapPoint ||
  left.chromeVisualState !== right.chromeVisualState;

const areRuntimeConfigSnapshotsEqual = (
  left: BottomSheetSharedRuntimeConfigSnapshot,
  right: BottomSheetSharedRuntimeConfigSnapshot
): boolean =>
  left.visible === right.visible &&
  left.listScrollEnabled === right.listScrollEnabled &&
  left.snapPoints.expanded === right.snapPoints.expanded &&
  left.snapPoints.middle === right.snapPoints.middle &&
  left.snapPoints.collapsed === right.snapPoints.collapsed &&
  left.snapPoints.hidden === right.snapPoints.hidden &&
  left.initialSnapPoint === right.initialSnapPoint &&
  left.dismissThreshold === right.dismissThreshold &&
  left.preventSwipeDismiss === right.preventSwipeDismiss &&
  left.interactionEnabled === right.interactionEnabled;

const areMotionRuntimeSnapshotsEqual = (
  left: SearchRouteSheetMotionStateSnapshot,
  right: SearchRouteSheetMotionStateSnapshot
): boolean =>
  left.stateEntry?.visible === right.stateEntry?.visible &&
  left.stateEntry?.snapPoints === right.stateEntry?.snapPoints &&
  left.stateEntry?.initialSnapPoint === right.stateEntry?.initialSnapPoint &&
  left.stateEntry?.currentSnapPoint === right.stateEntry?.currentSnapPoint &&
  left.stateEntry?.sheetYValue === right.stateEntry?.sheetYValue &&
  left.stateEntry?.scrollOffsetValue === right.stateEntry?.scrollOffsetValue &&
  left.stateEntry?.momentumFlag === right.stateEntry?.momentumFlag &&
  left.stateEntry?.motionCommandValue === right.stateEntry?.motionCommandValue;

const areSheetHostNavigationSelectorSnapshotsEqual = (
  left: SheetHostNavigationSelectorSnapshot,
  right: SheetHostNavigationSelectorSnapshot
): boolean =>
  left.activeOverlayRouteKey === right.activeOverlayRouteKey &&
  left.isPersistentPollLane === right.isPersistentPollLane &&
  left.overlayRouteStackLength === right.overlayRouteStackLength &&
  left.rootOverlayKey === right.rootOverlayKey;

const selectSheetHostSearchSurfaceRuntimeReseedSnapshot = (
  snapshot: SearchSurfaceRuntimeSnapshot
): SheetHostSearchSurfaceRuntimeReseedSnapshot => {
  const activeBundle = snapshot.activeBundle;
  const visualPolicy = selectSearchSurfaceVisualPolicy(snapshot);
  return {
    activeBundleKind: activeBundle.kind,
    activeBundleKey: activeBundle.bundleKey,
    activeResultsDataMode: activeBundle.kind === 'results' ? activeBundle.dataMode : null,
    activeResultsCoverState: activeBundle.kind === 'results' ? activeBundle.coverState : null,
    activeResultsFrozen: activeBundle.kind === 'results' ? activeBundle.frozen : null,
    dismissBoundaryReached: snapshot.dismissTransaction?.bottomBoundaryReached ?? null,
    dismissTransactionId: snapshot.dismissTransaction?.id ?? null,
    heldBundleKey: snapshot.heldBundle?.bundleKey ?? null,
    heldResultsDataMode: snapshot.heldBundle?.dataMode ?? null,
    redrawDataMode: snapshot.redrawTransaction?.dataMode ?? null,
    redrawTransactionId: snapshot.redrawTransaction?.id ?? null,
    visualPhase: visualPolicy.phase,
    visualTransactionId: visualPolicy.transactionId,
  };
};

const areSheetHostSearchSurfaceRuntimeReseedSnapshotsEqual = (
  left: SheetHostSearchSurfaceRuntimeReseedSnapshot,
  right: SheetHostSearchSurfaceRuntimeReseedSnapshot
): boolean =>
  left.activeBundleKind === right.activeBundleKind &&
  left.activeBundleKey === right.activeBundleKey &&
  left.activeResultsDataMode === right.activeResultsDataMode &&
  left.activeResultsCoverState === right.activeResultsCoverState &&
  left.activeResultsFrozen === right.activeResultsFrozen &&
  left.dismissBoundaryReached === right.dismissBoundaryReached &&
  left.dismissTransactionId === right.dismissTransactionId &&
  left.heldBundleKey === right.heldBundleKey &&
  left.heldResultsDataMode === right.heldResultsDataMode &&
  left.redrawDataMode === right.redrawDataMode &&
  left.redrawTransactionId === right.redrawTransactionId &&
  left.visualPhase === right.visualPhase &&
  left.visualTransactionId === right.visualTransactionId;

const syncRuntimeConfigSharedValuesOnUI = (
  values: BottomSheetSharedRuntimeConfigSharedValues,
  snapshot: BottomSheetSharedRuntimeConfigSnapshot
): void => {
  'worklet';
  const hiddenSnap = snapshot.snapPoints.hidden;
  const hiddenOrCollapsed = hiddenSnap ?? snapshot.snapPoints.collapsed;
  values.visible.value = snapshot.visible;
  values.listScrollEnabled.value = snapshot.listScrollEnabled;
  values.interactionEnabled.value = snapshot.interactionEnabled;
  values.gestureEnabled.value = snapshot.visible && snapshot.interactionEnabled ? 1 : 0;
  values.shouldEnableScroll.value =
    snapshot.visible && snapshot.listScrollEnabled && snapshot.interactionEnabled;
  values.preventSwipeDismiss.value = snapshot.preventSwipeDismiss;
  values.dismissThreshold.value =
    typeof snapshot.dismissThreshold === 'number' ? snapshot.dismissThreshold : null;
  values.expandedSnap.value = snapshot.snapPoints.expanded;
  values.middleSnap.value = snapshot.snapPoints.middle;
  values.collapsedSnap.value = snapshot.snapPoints.collapsed;
  values.hasHiddenSnap.value = typeof hiddenSnap === 'number';
  values.hiddenSnap.value = hiddenOrCollapsed;
  values.initialSnapValue.value = snapshot.snapPoints[snapshot.initialSnapPoint];
  values.hiddenOrCollapsed.value = hiddenOrCollapsed;
};

const syncRuntimeConfigSharedValues = (
  values: BottomSheetSharedRuntimeConfigSharedValues,
  snapshot: BottomSheetSharedRuntimeConfigSnapshot
): void => {
  runOnUI(syncRuntimeConfigSharedValuesOnUI)(values, snapshot);
};

const seedSheetYOnUI = (sheetY: SharedValue<number>, value: number): void => {
  'worklet';
  sheetY.value = value;
};

class AppRouteSheetHostAuthorityController {
  private nativeAdapterSnapshot: AppRouteSheetHostNativeAdapterSnapshot;

  private bodySnapshot: AppRouteSheetHostSurfaceBodySnapshot =
    EMPTY_APP_ROUTE_SHEET_HOST_SURFACE_BODY_SNAPSHOT;

  private runtimeConfigSnapshot: BottomSheetSharedRuntimeConfigSnapshot =
    EMPTY_RUNTIME_CONFIG_SNAPSHOT;

  private motionRuntimeSnapshot: SearchRouteSheetMotionStateSnapshot =
    EMPTY_SEARCH_ROUTE_SHEET_MOTION_STATE_SNAPSHOT;

  private frameSnapshot: SearchRouteSheetHostFrameSnapshot =
    EMPTY_APP_ROUTE_SHEET_HOST_FRAME_SNAPSHOT;

  private surfaceSnapshot: AppRouteSheetHostSurfaceSnapshot =
    EMPTY_APP_ROUTE_SHEET_HOST_SURFACE_SNAPSHOT;

  private sharedRuntimeModel: BottomSheetRuntimeModel | null = null;

  private nativeRouteSheetFrameHostAuthority: AppRouteSheetHostSurfaceFrameAuthority | null = null;

  private unsubscribeRouteSheetFrameHost: (() => void) | null = null;

  private unregisterSheetMotionTarget: (() => void) | null = null;

  private registeredSheetRuntimeModel: SheetRuntimeModel | null = null;

  private registeredSheetMotionCommandValue:
    | SheetRuntimeModel['snapController']['motionCommand']
    | null = null;

  private currentSnap: OverlaySheetSnap = 'hidden';

  private initialVisibleSnapDispatchKey: string | null = null;

  private pendingInitialVisibleSnapDispatchKey: string | null = null;

  private readonly nativeAdapterListeners = new Set<Listener>();

  private readonly runtimeConfigListeners = new Set<Listener>();

  private readonly runtimeConfigSharedValueTargets =
    new Set<BottomSheetSharedRuntimeConfigSharedValues>();
  private pendingRuntimeConfigSharedValuesSnapshot: BottomSheetSharedRuntimeConfigSnapshot | null =
    null;
  private runtimeConfigSharedValuesSyncScheduled = false;
  private isRecomputingRuntimeConfig = false;
  private pendingRuntimeConfigRecompute = false;
  private pendingRuntimeConfigRecomputeNotify = false;
  private runtimeConfigRecomputeScheduled = false;

  private readonly motionRuntimeListeners = new Set<Listener>();
  private readonly motionRuntimeSelectorListeners = new Map<
    Listener,
    SelectorListenerRecord<SearchRouteSheetMotionStateSnapshot>
  >();

  private readonly nativeAdapterSharedValueTargets =
    new Set<AppRouteSheetFrameHostNativeSharedValues>();

  private readonly bodyListeners = new Set<Listener>();
  private readonly bodySelectorListeners = new Map<
    Listener,
    SelectorListenerRecord<AppRouteSheetHostSurfaceBodySnapshot>
  >();

  private readonly frameListeners = new Set<Listener>();
  private readonly frameSelectorListeners = new Map<
    Listener,
    SelectorListenerRecord<SearchRouteSheetHostFrameSnapshot>
  >();

  private readonly surfaceListeners = new Set<Listener>();
  private readonly surfaceSelectorListeners = new Map<
    Listener,
    SelectorListenerRecord<AppRouteSheetHostSurfaceSnapshot>
  >();

  private readonly unsubscribers: Array<() => void> = [];

  private readonly motionCallbacksEntry: AppRouteSheetHostSurfaceBodySnapshot['motionCallbacksEntry'];

  public readonly nativeAdapterAuthority: AppRouteSheetHostAuthorityControllerRuntime['nativeAdapterAuthority'];

  public readonly routeSheetMotionRuntimeAuthority: AppRouteSheetHostMotionRuntimeAuthority;

  public readonly routeSheetRuntimeConfigAuthority: AppRouteSheetHostRuntimeConfigAuthority;

  public readonly routeSheetSurfaceBodyAuthority: AppRouteSheetHostSurfaceBodyAuthority;

  public readonly routeSheetSurfaceFrameAuthority: AppRouteSheetHostSurfaceFrameAuthority;

  public readonly routeSheetSurfaceAuthority: AppRouteSheetHostSurfaceAuthority;

  constructor(private readonly input: AppRouteSheetHostAuthorityControllerInput) {
    this.motionCallbacksEntry = {
      onSnapStart: this.handleSheetSnapStart,
      onSnapChange: this.recordSharedSheetSnap,
      onDragStateChange: this.handleDragStateChange,
      onSettleStateChange: this.handleSettleStateChange,
      onSnapSettleComplete: this.handleSnapSettleComplete,
    };
    this.nativeAdapterAuthority = {
      subscribe: (listener) => this.subscribeNativeAdapter(listener),
      getSnapshot: () => this.nativeAdapterSnapshot,
      registerSharedValues: (values) => this.registerNativeAdapterSharedValues(values),
    };
    this.routeSheetMotionRuntimeAuthority = {
      subscribe: (listener) => this.subscribeMotionRuntime(listener),
      subscribeSelector: (selector, listener, isEqual = Object.is) =>
        this.subscribeSelector(
          this.motionRuntimeSelectorListeners,
          this.motionRuntimeSnapshot,
          selector,
          listener,
          isEqual
        ),
      getSnapshot: () => this.motionRuntimeSnapshot,
    };
    this.routeSheetRuntimeConfigAuthority = {
      subscribe: (listener) => this.subscribeRuntimeConfig(listener),
      getSnapshot: () => this.runtimeConfigSnapshot,
      registerSharedValues: (values) => this.registerRuntimeConfigSharedValues(values),
    };
    this.routeSheetSurfaceBodyAuthority = {
      subscribe: (listener) => this.subscribeBody(listener),
      subscribeSelector: (selector, listener, isEqual = Object.is) =>
        this.subscribeSelector(
          this.bodySelectorListeners,
          this.bodySnapshot,
          selector,
          listener,
          isEqual
        ),
      getSnapshot: () => this.bodySnapshot,
    };
    this.routeSheetSurfaceFrameAuthority = {
      subscribe: (listener) => this.subscribeFrame(listener),
      subscribeSelector: (selector, listener, isEqual = Object.is) =>
        this.subscribeSelector(
          this.frameSelectorListeners,
          this.frameSnapshot,
          selector,
          listener,
          isEqual
        ),
      getSnapshot: () => this.frameSnapshot,
    };
    this.routeSheetSurfaceAuthority = {
      subscribe: (listener) => this.subscribeSurface(listener),
      subscribeSelector: (selector, listener, isEqual = Object.is) =>
        this.subscribeSelector(
          this.surfaceSelectorListeners,
          this.surfaceSnapshot,
          selector,
          listener,
          isEqual
        ),
      getSnapshot: () => this.surfaceSnapshot,
    };
    this.nativeAdapterSnapshot = this.createNativeAdapterSnapshot();
    this.runtimeConfigSnapshot = this.createRuntimeConfigSnapshot();
    this.motionRuntimeSnapshot = this.createMotionRuntimeSnapshot();
    this.bodySnapshot = this.createBodySnapshot();
    this.surfaceSnapshot = this.createSurfaceSnapshot();
    this.unsubscribers.push(
      input.routeSceneFrameAuthority.subscribe(() => {
        this.recomputeAll(true, 'routeSceneFrameAuthority');
      }),
      input.routeOverlayNavigationAuthority.registerTarget({
        selector: (snapshot): SheetHostNavigationSelectorSnapshot => ({
          activeOverlayRouteKey: snapshot.activeOverlayRouteKey,
          isPersistentPollLane: snapshot.isPersistentPollLane,
          overlayRouteStackLength: snapshot.overlayRouteStackLength,
          rootOverlayKey: snapshot.rootOverlayKey,
        }),
        syncNavigationSnapshot: () => {
          this.recomputeAll(true, 'routeOverlayNavigationAuthority');
        },
        isEqual: areSheetHostNavigationSelectorSnapshotsEqual,
        attributionLabel: 'AppRouteSheetHostNavigation',
      }),
      input.routeSheetHostSurfaceAuthority.subscribe(() => {
        this.recomputeSurfaceVisibility(true);
      }, 'AppRouteSheetHostSurface'),
      input.routeOverlaySheetPolicyAuthority.registerTarget({
        syncSheetPolicySnapshot: () => {
          this.recomputeSheetPolicy(true);
        },
        attributionLabel: 'AppRouteSheetHostSheetPolicy',
      }),
      input.routeSceneSwitchAuthority.subscribe(() => {
        this.recomputeAll(true, 'routeSceneSwitchAuthority');
      }, 'AppRouteSheetHostRouteSwitch'),
      getSearchSurfaceRuntime().subscribeSelector(
        selectSearchSurfaceRouteGraphPolicy,
        () => {
          this.recomputeAll(true, 'searchSurfaceRuntime');
        },
        areSearchSurfaceVisualPoliciesEqual
      ),
      getSearchSurfaceRuntime().subscribeSelector(
        selectSheetHostSearchSurfaceRuntimeReseedSnapshot,
        () => {
          this.recomputeRuntimeReseed(true, 'searchSurfaceRuntime:runtimeReseed');
        },
        areSheetHostSearchSurfaceRuntimeReseedSnapshotsEqual
      ),
      input.routeSheetVisualAuthority.subscribe(() => {
        this.recomputeVisualSelection();
      })
    );
  }

  public setNativeRuntime({
    sharedRuntimeModel,
    routeSheetFrameHostAuthority,
  }: AppRouteSheetHostNativeRuntimeInput): void {
    withSearchNavSwitchRuntimeAttribution('sheetHost', 'setNativeRuntime', () => {
      this.sharedRuntimeModel = sharedRuntimeModel;
      if (this.nativeRouteSheetFrameHostAuthority !== routeSheetFrameHostAuthority) {
        this.unsubscribeRouteSheetFrameHost?.();
        this.nativeRouteSheetFrameHostAuthority = routeSheetFrameHostAuthority;
        this.unsubscribeRouteSheetFrameHost = routeSheetFrameHostAuthority.subscribe(() => {
          this.recomputeFrame(true);
        });
      }
      const resolvedSurfaceInput = this.getResolvedSurfaceInput();
      const frameChanged = this.recomputeFrame(false, false, false);
      const runtimeConfigChanged = this.recomputeRuntimeConfig(false, resolvedSurfaceInput);
      const motionRuntimeChanged = this.recomputeMotionRuntime(false, resolvedSurfaceInput);
      const bodyChanged = this.recomputeBody(false, resolvedSurfaceInput, false, false);
      this.syncSheetMotionTarget(resolvedSurfaceInput);
      this.syncInitialVisibleSnap(resolvedSurfaceInput);
      this.recomputeSurface(true);
      this.notifyBatchedSurfaceLaneListeners({
        bodyChanged,
        frameChanged,
        motionRuntimeChanged,
        runtimeConfigChanged,
        notify: true,
      });
    });
  }

  public dispose(): void {
    this.unsubscribeRouteSheetFrameHost?.();
    this.unsubscribeRouteSheetFrameHost = null;
    this.unregisterSheetMotionTarget?.();
    this.unregisterSheetMotionTarget = null;
    this.unsubscribers.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.unsubscribers.length = 0;
    this.nativeAdapterListeners.clear();
    this.nativeAdapterSharedValueTargets.clear();
    this.runtimeConfigListeners.clear();
    this.motionRuntimeListeners.clear();
    this.motionRuntimeSelectorListeners.clear();
    this.bodyListeners.clear();
    this.bodySelectorListeners.clear();
    this.frameListeners.clear();
    this.frameSelectorListeners.clear();
    this.surfaceListeners.clear();
    this.surfaceSelectorListeners.clear();
    this.pendingInitialVisibleSnapDispatchKey = null;
    this.pendingRuntimeConfigSharedValuesSnapshot = null;
    this.runtimeConfigSharedValuesSyncScheduled = false;
    this.isRecomputingRuntimeConfig = false;
    this.pendingRuntimeConfigRecompute = false;
    this.pendingRuntimeConfigRecomputeNotify = false;
    this.runtimeConfigRecomputeScheduled = false;
  }

  private subscribeNativeAdapter(listener: Listener): () => void {
    this.nativeAdapterListeners.add(listener);
    return () => {
      this.nativeAdapterListeners.delete(listener);
    };
  }

  private registerNativeAdapterSharedValues(
    values: AppRouteSheetFrameHostNativeSharedValues
  ): () => void {
    this.nativeAdapterSharedValueTargets.add(values);
    withSearchNavSwitchRuntimeAttribution(
      'sheetHost',
      'syncNativeAdapterSharedValues:register',
      () => {
        syncSheetFrameHostNativeSharedValues(values, this.nativeAdapterSnapshot);
      }
    );
    return () => {
      this.nativeAdapterSharedValueTargets.delete(values);
    };
  }

  private subscribeRuntimeConfig(listener: Listener): () => void {
    this.runtimeConfigListeners.add(listener);
    return () => {
      this.runtimeConfigListeners.delete(listener);
    };
  }

  private subscribeMotionRuntime(listener: Listener): () => void {
    this.motionRuntimeListeners.add(listener);
    return () => {
      this.motionRuntimeListeners.delete(listener);
    };
  }

  private registerRuntimeConfigSharedValues(
    values: BottomSheetSharedRuntimeConfigSharedValues
  ): () => void {
    this.runtimeConfigSharedValueTargets.add(values);
    withSearchNavSwitchRuntimeAttribution(
      'sheetHost',
      'syncRuntimeConfigSharedValues:register',
      () => {
        syncRuntimeConfigSharedValues(values, this.runtimeConfigSnapshot);
      }
    );
    return () => {
      this.runtimeConfigSharedValueTargets.delete(values);
    };
  }

  private scheduleRuntimeConfigSharedValuesSync(
    snapshot: BottomSheetSharedRuntimeConfigSnapshot
  ): void {
    this.pendingRuntimeConfigSharedValuesSnapshot = snapshot;
    if (this.runtimeConfigSharedValuesSyncScheduled) {
      return;
    }
    this.runtimeConfigSharedValuesSyncScheduled = true;
    Promise.resolve().then(() => {
      this.runtimeConfigSharedValuesSyncScheduled = false;
      const pendingSnapshot = this.pendingRuntimeConfigSharedValuesSnapshot;
      this.pendingRuntimeConfigSharedValuesSnapshot = null;
      if (pendingSnapshot == null || this.runtimeConfigSharedValueTargets.size === 0) {
        return;
      }
      withSearchNavSwitchRuntimeAttribution('sheetHost', 'syncRuntimeConfigSharedValues', () => {
        this.runtimeConfigSharedValueTargets.forEach((values) => {
          syncRuntimeConfigSharedValues(values, pendingSnapshot);
        });
      });
    });
  }

  private subscribeBody(listener: Listener): () => void {
    this.bodyListeners.add(listener);
    return () => {
      this.bodyListeners.delete(listener);
    };
  }

  private subscribeFrame(listener: Listener): () => void {
    this.frameListeners.add(listener);
    return () => {
      this.frameListeners.delete(listener);
    };
  }

  private subscribeSurface(listener: Listener): () => void {
    this.surfaceListeners.add(listener);
    return () => {
      this.surfaceListeners.delete(listener);
    };
  }

  private subscribeSelector<TSnapshot, TSelected>(
    selectorListeners: Map<Listener, SelectorListenerRecord<TSnapshot>>,
    snapshot: TSnapshot,
    selector: (snapshot: TSnapshot) => TSelected,
    listener: Listener,
    isEqual: SelectorEquality<TSelected>
  ): () => void {
    selectorListeners.set(listener, {
      isEqual: isEqual as SelectorEquality<unknown>,
      selected: selector(snapshot),
      selector,
    });
    return () => {
      selectorListeners.delete(listener);
    };
  }

  private notifySelectorListeners<TSnapshot>(
    selectorListeners: Map<Listener, SelectorListenerRecord<TSnapshot>>,
    snapshot: TSnapshot
  ): void {
    selectorListeners.forEach((record, listener) => {
      const nextSelected = record.selector(snapshot);
      if (record.isEqual(record.selected, nextSelected)) {
        return;
      }
      record.selected = nextSelected;
      listener();
    });
  }

  private getResolvedSurfaceInput(): AppRouteSheetHostResolvedSurfaceInput {
    const routeSceneFrameSnapshot = this.input.routeSceneFrameAuthority.getSnapshot();
    const routeOverlayNavigationSnapshot = this.input.routeOverlayNavigationAuthority.getSnapshot();
    const routeSceneSwitchSnapshot = this.input.routeSceneSwitchAuthority.getSnapshot();
    const routeOverlaySheetPolicySnapshot =
      this.input.routeOverlaySheetPolicyAuthority.getSnapshot();
    const routeSheetVisualSnapshot = this.input.routeSheetVisualAuthority.getSnapshot();
    const surfaceVisualPolicy = selectSearchSurfaceVisualPolicy(
      getSearchSurfaceRuntime().getSnapshot()
    );
    const activeSceneFrameEntry =
      routeSceneFrameSnapshot.activeSceneFrameEntry ?? EMPTY_ACTIVE_SCENE_FRAME_ENTRY;
    const overlayRouteScope: SearchRouteOverlayRouteScope = {
      activeOverlayRouteKey: routeOverlayNavigationSnapshot.activeOverlayRouteKey,
      rootOverlayKey: routeOverlayNavigationSnapshot.rootOverlayKey,
      overlayRouteStackLength: routeOverlayNavigationSnapshot.overlayRouteStackLength,
    };
    const overlaySheetPolicy = routeOverlaySheetPolicySnapshot.overlaySheetPolicy;
    const presentationState =
      routeSheetVisualSnapshot.presentationState ??
      EMPTY_SEARCH_ROUTE_SHEET_RESOLVED_VISUAL_SELECTION_SNAPSHOT.resolvedPresentationState;
    const chromeVisualState =
      routeSheetVisualSnapshot.chromeVisualState ??
      EMPTY_SEARCH_ROUTE_SHEET_RESOLVED_VISUAL_SELECTION_SNAPSHOT.resolvedChromeVisualState;
    const isPersistentPollLane = routeOverlayNavigationSnapshot.isPersistentPollLane;
    const activeOverlayRouteKey = overlayRouteScope.activeOverlayRouteKey;
    const rootOverlayKey = overlayRouteScope.rootOverlayKey;
    const routeSwitchPreservedOutgoingSheetSceneKey =
      resolvePreservedOutgoingSheetSceneKey(routeSceneSwitchSnapshot);
    const searchDismissPreservedOutgoingSheetSceneKey =
      surfaceVisualPolicy.phase === 'results_dismissing' &&
      !surfaceVisualPolicy.canReleasePersistentPolls
        ? surfaceVisualPolicy.outgoingSheetSceneKey
        : null;
    const preservedOutgoingSheetSceneKey =
      routeSwitchPreservedOutgoingSheetSceneKey ?? searchDismissPreservedOutgoingSheetSceneKey;
    const preservedOutgoingFrameEntry =
      preservedOutgoingSheetSceneKey == null
        ? null
        : this.input.routeSceneFrameAuthority.getSceneFrameEntry(preservedOutgoingSheetSceneKey);
    const preservedOutgoingRenderableFrameEntry =
      preservedOutgoingFrameEntry?.shellSpec != null ? preservedOutgoingFrameEntry : null;
    const preservedOutgoingFrameSceneKey = preservedOutgoingRenderableFrameEntry?.sceneKey ?? null;
    const shouldPreserveOutgoingSheetContent = preservedOutgoingFrameSceneKey != null;
    const isSearchDismissPollBoundaryCommitted =
      !shouldPreserveOutgoingSheetContent &&
      surfaceVisualPolicy.phase === 'results_dismissing' &&
      surfaceVisualPolicy.canReleasePersistentPolls;
    const shouldUseSearchSheetHostForSearchSurface =
      !shouldPreserveOutgoingSheetContent &&
      !isSearchDismissPollBoundaryCommitted &&
      activeOverlayRouteKey === 'search' &&
      surfaceVisualPolicy.bottomBandOwner === 'results_header';
    const effectiveIsPersistentPollLane =
      isSearchDismissPollBoundaryCommitted ||
      (isPersistentPollLane && !shouldUseSearchSheetHostForSearchSurface);
    const isPersistentPollSheetHostActive =
      isSearchDismissPollBoundaryCommitted ||
      (isPersistentPollLane && !shouldUseSearchSheetHostForSearchSurface);
    const sheetPresentationSceneKey =
      preservedOutgoingFrameSceneKey ??
      (isSearchDismissPollBoundaryCommitted
        ? 'polls'
        : shouldUseSearchSheetHostForSearchSurface
          ? 'search'
          : isPersistentPollSheetHostActive
            ? 'polls'
            : activeSceneFrameEntry.sceneKey);
    const sheetPresentationFrameEntry =
      preservedOutgoingRenderableFrameEntry != null
        ? preservedOutgoingRenderableFrameEntry
        : isSearchDismissPollBoundaryCommitted ||
            shouldUseSearchSheetHostForSearchSurface ||
            isPersistentPollSheetHostActive
          ? (this.input.routeSceneFrameAuthority.getSceneFrameEntry(sheetPresentationSceneKey) ??
            activeSceneFrameEntry)
          : activeSceneFrameEntry;
    const sheetPresentationShellSpec =
      sheetPresentationFrameEntry.shellSpec ?? EMPTY_ROUTE_SHEET_SHELL_SPEC;
    const isRenderable =
      sheetPresentationFrameEntry.shellSpec != null &&
      overlaySheetPolicy != null &&
      presentationState != null;
    const visible = overlaySheetPolicy?.overlaySheetVisible ?? false;
    const activeSemanticOverlayKey =
      sheetPresentationShellSpec.semanticOverlayKey ??
      sheetPresentationShellSpec.overlayKey ??
      activeOverlayRouteKey;
    const resolvedShellIdentityKey =
      sheetPresentationShellSpec.shellIdentityKey ??
      sheetPresentationShellSpec.overlayKey ??
      activeOverlayRouteKey;
    const initialSnapPoint = resolvePolicyInitialSnap(activeSemanticOverlayKey);
    const hiddenOrCollapsed =
      sheetPresentationShellSpec.snapPoints.hidden ??
      sheetPresentationShellSpec.snapPoints.collapsed;
    const initialSheetY = visible
      ? sheetPresentationShellSpec.snapPoints[initialSnapPoint]
      : hiddenOrCollapsed;
    const canRenderSurface = hasRenderableSheetSurface({
      isRenderable,
      overlaySheetVisible: overlaySheetPolicy?.overlaySheetVisible ?? false,
      headerComponent: sheetPresentationShellSpec.headerComponent,
      backgroundComponent: sheetPresentationShellSpec.backgroundComponent,
      overlayComponent: sheetPresentationShellSpec.overlayComponent,
      flashListProps: sheetPresentationShellSpec.flashListProps,
    });
    const resolvedRuntimeModel = canRenderSurface ? this.sharedRuntimeModel : null;
    const displayedSceneKey =
      preservedOutgoingFrameSceneKey ??
      (isSearchDismissPollBoundaryCommitted
        ? 'polls'
        : shouldUseSearchSheetHostForSearchSurface
          ? 'search'
          : isPersistentPollSheetHostActive
            ? 'polls'
            : activeSceneFrameEntry.sceneKey);
    return {
      activeSceneKey: sheetPresentationFrameEntry.sceneKey,
      activeShellSpec: sheetPresentationShellSpec,
      activeRenderableShellSpec: canRenderSurface ? sheetPresentationShellSpec : null,
      activeSemanticOverlayKey,
      canRenderSurface,
      chromeVisualState,
      displayedSceneKey:
        displayedSceneKey,
      initialSheetY,
      isPersistentPollLane: effectiveIsPersistentPollLane,
      isRenderable,
      overlayRouteScope,
      overlaySheetPolicy,
      presentationState,
      resolvedRuntimeModel,
      resolvedShellIdentityKey,
      rootOverlayKey,
      surfaceVisualPolicy,
      visible,
    };
  }

  private createNativeAdapterSnapshot(
    resolvedSurfaceInput = this.getResolvedSurfaceInput()
  ): AppRouteSheetHostNativeAdapterSnapshot {
    const {
      activeSemanticOverlayKey,
      activeShellSpec,
      canRenderSurface,
      chromeVisualState,
      initialSheetY,
      overlaySheetPolicy,
      presentationState,
      resolvedRuntimeModel,
      surfaceVisualPolicy: _surfaceVisualPolicy,
    } = resolvedSurfaceInput;
    return {
      presentationStateOverride: {
        sheetY: presentationState.sheetTranslateY ?? EMPTY_PRESENTATION_STATE.sheetTranslateY,
        scrollOffset:
          presentationState.sheetScrollOffset ?? EMPTY_PRESENTATION_STATE.sheetScrollOffset,
        momentumFlag: presentationState.sheetMomentum ?? EMPTY_PRESENTATION_STATE.sheetMomentum,
      },
      initialSheetY,
      frameHostInput: {
        activeSemanticOverlayKey,
        overlaySheetPolicy: overlaySheetPolicy ?? null,
        expandedSnapPoint: canRenderSurface ? activeShellSpec.snapPoints.expanded : 0,
        middleSnapPoint: canRenderSurface ? activeShellSpec.snapPoints.middle : 0,
        collapsedSnapPoint: canRenderSurface ? activeShellSpec.snapPoints.collapsed : 0,
        sheetY: resolvedRuntimeModel?.presentationState.sheetY ?? null,
      },
      chromeVisualState,
    };
  }

  private createMotionPersistenceInput(
    resolvedSurfaceInput = this.getResolvedSurfaceInput()
  ): SearchRouteSheetMotionPersistenceInput {
    const {
      activeRenderableShellSpec,
      activeSemanticOverlayKey,
      overlayRouteScope,
      resolvedShellIdentityKey,
      rootOverlayKey,
    } = resolvedSurfaceInput;
    return activeRenderableShellSpec == null
      ? EMPTY_MOTION_PERSISTENCE_INPUT
      : {
          activeShellSpec: activeRenderableShellSpec,
          resolvedShellIdentityKey,
          activeSemanticOverlayKey,
          rootOverlayKey,
          overlayRouteStackLength: overlayRouteScope.overlayRouteStackLength,
        };
  }

  private createBodySnapshot(
    resolvedSurfaceInput = this.getResolvedSurfaceInput()
  ): AppRouteSheetHostSurfaceBodySnapshot {
    const {
      activeSceneKey,
      activeShellSpec,
      canRenderSurface,
      chromeVisualState,
      displayedSceneKey,
    } = resolvedSurfaceInput;
    const interactionPolicy = resolveSharedSheetInteractionPolicy(resolvedSurfaceInput);

    const chromeSnapshot = canRenderSurface
      ? {
          chromeEntry: {
            headerComponent: activeShellSpec.headerComponent,
            backgroundComponent: activeShellSpec.backgroundComponent,
            overlayComponent: activeShellSpec.overlayComponent,
            shadowStyle: activeShellSpec.shadowStyle,
            surfaceStyle: activeShellSpec.surfaceStyle,
            style: activeShellSpec.style,
          },
        }
      : EMPTY_SEARCH_ROUTE_SHEET_CHROME_TRANSPORT_SNAPSHOT;
    const scrollSharedRuntimeSnapshot = canRenderSurface
      ? {
          sharedRuntimeEntry: {
            listScrollEnabled: activeShellSpec.listScrollEnabled,
            onHidden: this.handleHidden,
            onScrollOffsetChange: this.handleScrollOffsetChange,
            onMomentumBeginJS: this.handleMomentumBegin,
            onMomentumEndJS: this.handleMomentumEnd,
            showsVerticalScrollIndicator: activeShellSpec.showsVerticalScrollIndicator,
            testID: activeShellSpec.testID,
            dismissThreshold: interactionPolicy.dismissThreshold,
            preventSwipeDismiss: interactionPolicy.preventSwipeDismiss,
            interactionEnabled: activeShellSpec.interactionEnabled,
            animateOnMount: activeShellSpec.animateOnMount,
          },
        }
      : EMPTY_SEARCH_ROUTE_SHEET_SCROLL_SHARED_RUNTIME_SNAPSHOT;
    const scrollBodyDefaultsSnapshot = canRenderSurface
      ? {
          bodyDefaultsEntry: {
            contentContainerStyle: activeShellSpec.contentContainerStyle,
            keyboardShouldPersistTaps: activeShellSpec.keyboardShouldPersistTaps,
            scrollIndicatorInsets: activeShellSpec.scrollIndicatorInsets,
            keyboardDismissMode: activeShellSpec.keyboardDismissMode,
            bounces: activeShellSpec.bounces,
            alwaysBounceVertical: activeShellSpec.alwaysBounceVertical,
            overScrollMode: activeShellSpec.overScrollMode,
            testID: activeShellSpec.testID,
            flashListProps: activeShellSpec.flashListProps,
          },
        }
      : EMPTY_SEARCH_ROUTE_SHEET_SCROLL_BODY_DEFAULTS_SNAPSHOT;
    const motionStateSnapshot = this.createMotionRuntimeSnapshot(resolvedSurfaceInput);

    return {
      activeSceneKey: canRenderSurface ? activeSceneKey : null,
      displayedSceneKey: canRenderSurface ? displayedSceneKey : null,
      hasRenderableSheetSurface: canRenderSurface,
      chromeEntry: chromeSnapshot.chromeEntry ?? null,
      scrollSharedRuntimeEntry: scrollSharedRuntimeSnapshot.sharedRuntimeEntry ?? null,
      scrollBodyDefaultsEntry: scrollBodyDefaultsSnapshot.bodyDefaultsEntry ?? null,
      motionStateEntry: motionStateSnapshot.stateEntry ?? null,
      motionCallbacksEntry: this.motionCallbacksEntry,
      searchSurfacePageBundleProgress:
        chromeVisualState?.searchSurfacePageBundleProgress ??
        EMPTY_SEARCH_ROUTE_VISUAL_STATE.searchSurfacePageBundleProgress,
    };
  }

  private createMotionRuntimeSnapshot(
    resolvedSurfaceInput = this.getResolvedSurfaceInput()
  ): SearchRouteSheetMotionStateSnapshot {
    const { activeShellSpec, canRenderSurface, resolvedRuntimeModel, visible } =
      resolvedSurfaceInput;
    const initialSnapPoint = this.resolveSheetRuntimeInitialSnap(resolvedSurfaceInput);
    return canRenderSurface && resolvedRuntimeModel != null
      ? {
          stateEntry: {
            visible,
            snapPoints: activeShellSpec.snapPoints,
            initialSnapPoint,
            currentSnapPoint: this.currentSnap === 'hidden' ? initialSnapPoint : this.currentSnap,
            sheetYValue: resolvedRuntimeModel.presentationState.sheetY,
            scrollOffsetValue: resolvedRuntimeModel.presentationState.scrollOffset,
            momentumFlag: resolvedRuntimeModel.presentationState.momentumFlag,
            motionCommandValue: resolvedRuntimeModel.snapController.motionCommand,
          },
        }
      : EMPTY_SEARCH_ROUTE_SHEET_MOTION_STATE_SNAPSHOT;
  }

  private createRuntimeConfigSnapshot(
    resolvedSurfaceInput = this.getResolvedSurfaceInput()
  ): BottomSheetSharedRuntimeConfigSnapshot {
    const { activeShellSpec, canRenderSurface, visible } = resolvedSurfaceInput;
    if (!canRenderSurface) {
      return EMPTY_RUNTIME_CONFIG_SNAPSHOT;
    }
    const interactionPolicy = resolveSharedSheetInteractionPolicy(resolvedSurfaceInput);
    const initialSnapPoint = this.resolveSheetRuntimeInitialSnap(resolvedSurfaceInput);
    return {
      visible,
      listScrollEnabled: activeShellSpec.listScrollEnabled ?? true,
      snapPoints: activeShellSpec.snapPoints,
      initialSnapPoint,
      dismissThreshold: interactionPolicy.dismissThreshold,
      preventSwipeDismiss: interactionPolicy.preventSwipeDismiss,
      interactionEnabled: activeShellSpec.interactionEnabled ?? true,
    };
  }

  private createSurfaceSnapshot(): AppRouteSheetHostSurfaceSnapshot {
    return this.input.routeSheetHostSurfaceAuthority.getSnapshot();
  }

  private recomputeAll(notify: boolean, source = 'unknown'): void {
    withSearchNavSwitchRuntimeAttribution(
      'sheetHost',
      notify ? 'recomputeAll:notify' : 'recomputeAll:silent',
      () => {
        const resolvedSurfaceInput = this.getResolvedSurfaceInput();
        this.recomputeNativeAdapter(notify, resolvedSurfaceInput);
        const frameChanged = this.recomputeFrame(false, false, false);
        const runtimeConfigChanged = this.recomputeRuntimeConfig(false, resolvedSurfaceInput);
        const motionRuntimeChanged = this.recomputeMotionRuntime(false, resolvedSurfaceInput);
        const bodyChanged = this.recomputeBody(false, resolvedSurfaceInput, false, false);
        this.syncSheetMotionTarget(resolvedSurfaceInput);
        this.syncInitialVisibleSnap(resolvedSurfaceInput);
        this.recomputeSurface(notify);
        this.notifyBatchedSurfaceLaneListeners({
          bodyChanged,
          frameChanged,
          motionRuntimeChanged,
          runtimeConfigChanged,
          notify,
        });
      }
    );
  }

  private recomputeRuntimeReseed(notify: boolean, source = 'unknown'): void {
    withSearchNavSwitchRuntimeAttribution(
      'sheetHost',
      notify ? 'recomputeRuntimeReseed:notify' : 'recomputeRuntimeReseed:silent',
      () => {
        const resolvedSurfaceInput = this.getResolvedSurfaceInput();
        this.recomputeNativeAdapter(false, resolvedSurfaceInput);
        const runtimeConfigChanged = this.recomputeRuntimeConfig(false, resolvedSurfaceInput);
        this.recomputeMotionRuntime(false, resolvedSurfaceInput);
        this.syncSheetMotionTarget(resolvedSurfaceInput);
        this.syncInitialVisibleSnap(resolvedSurfaceInput);
        this.notifyBatchedSurfaceLaneListeners({
          bodyChanged: false,
          frameChanged: false,
          motionRuntimeChanged: false,
          runtimeConfigChanged,
          notify,
        });
      }
    );
  }

  private recomputeVisualSelection(): void {
    withSearchNavSwitchRuntimeAttribution('sheetHost', 'recomputeVisualSelection', () => {
      this.recomputeNativeAdapter(true, this.getResolvedSurfaceInput());
    });
  }

  private recomputeSheetPolicy(notify: boolean): void {
    withSearchNavSwitchRuntimeAttribution('sheetHost', 'recomputeSheetPolicy', () => {
      const resolvedSurfaceInput = this.getResolvedSurfaceInput();
      this.recomputeNativeAdapter(notify, resolvedSurfaceInput);
      const runtimeConfigChanged = this.recomputeRuntimeConfig(false, resolvedSurfaceInput);
      const motionRuntimeChanged = this.recomputeMotionRuntime(false, resolvedSurfaceInput);
      const bodyChanged = this.recomputeBody(false, resolvedSurfaceInput, false, false);
      this.syncSheetMotionTarget(resolvedSurfaceInput);
      this.syncInitialVisibleSnap(resolvedSurfaceInput);
      this.notifyBatchedSurfaceLaneListeners({
        bodyChanged,
        frameChanged: false,
        motionRuntimeChanged,
        runtimeConfigChanged,
        notify,
      });
    });
  }

  private recomputeSurfaceVisibility(notify: boolean): void {
    withSearchNavSwitchRuntimeAttribution('sheetHost', 'recomputeSurfaceVisibility', () => {
      this.recomputeSurface(notify);
    });
  }

  private recomputeNativeAdapter(
    notify: boolean,
    resolvedSurfaceInput = this.getResolvedSurfaceInput()
  ): void {
    withSearchNavSwitchRuntimeAttribution('sheetHost', 'recomputeNativeAdapter', () => {
      const nextSnapshot = this.createNativeAdapterSnapshot(resolvedSurfaceInput);
      if (areNativeAdapterSnapshotsEqual(this.nativeAdapterSnapshot, nextSnapshot)) {
        return;
      }
      const shouldNotifyListeners = shouldNotifyNativeAdapterListeners(
        this.nativeAdapterSnapshot,
        nextSnapshot
      );
      const shouldSyncSharedValues = shouldSyncNativeAdapterSharedValues(
        this.nativeAdapterSnapshot,
        nextSnapshot
      );
      this.nativeAdapterSnapshot = nextSnapshot;
      if (shouldSyncSharedValues && this.nativeAdapterSharedValueTargets.size > 0) {
        withSearchNavSwitchRuntimeAttribution('sheetHost', 'syncNativeAdapterSharedValues', () => {
          this.nativeAdapterSharedValueTargets.forEach((values) => {
            syncSheetFrameHostNativeSharedValues(values, nextSnapshot);
          });
        });
      }
      if (notify && shouldNotifyListeners) {
        withSearchNavSwitchRuntimeAttribution('sheetHost', 'notify:nativeAdapter', () => {
          this.nativeAdapterListeners.forEach((listener) => {
            listener();
          });
        });
      }
    });
  }

  private recomputeRuntimeConfig(
    notify: boolean,
    resolvedSurfaceInput = this.getResolvedSurfaceInput()
  ): boolean {
    if (this.isRecomputingRuntimeConfig) {
      this.pendingRuntimeConfigRecompute = true;
      this.pendingRuntimeConfigRecomputeNotify =
        this.pendingRuntimeConfigRecomputeNotify || notify;
      this.schedulePendingRuntimeConfigRecompute();
      return false;
    }
    this.isRecomputingRuntimeConfig = true;
    return withSearchNavSwitchRuntimeAttribution('sheetHost', 'recomputeRuntimeConfig', () => {
      try {
        const nextSnapshot = this.createRuntimeConfigSnapshot(resolvedSurfaceInput);
        if (areRuntimeConfigSnapshotsEqual(this.runtimeConfigSnapshot, nextSnapshot)) {
          return false;
        }
        this.runtimeConfigSnapshot = nextSnapshot;
        if (this.runtimeConfigSharedValueTargets.size > 0) {
          this.scheduleRuntimeConfigSharedValuesSync(nextSnapshot);
        }
        if (notify && this.runtimeConfigListeners.size > 0) {
          withSearchNavSwitchRuntimeAttribution('sheetHost', 'notify:runtimeConfig', () => {
            this.runtimeConfigListeners.forEach((listener) => {
              listener();
            });
          });
        }
        return true;
      } finally {
        this.isRecomputingRuntimeConfig = false;
      }
    });
  }

  private schedulePendingRuntimeConfigRecompute(): void {
    if (this.runtimeConfigRecomputeScheduled) {
      return;
    }
    this.runtimeConfigRecomputeScheduled = true;
    Promise.resolve().then(() => {
      this.runtimeConfigRecomputeScheduled = false;
      if (!this.pendingRuntimeConfigRecompute) {
        return;
      }
      const notify = this.pendingRuntimeConfigRecomputeNotify;
      this.pendingRuntimeConfigRecompute = false;
      this.pendingRuntimeConfigRecomputeNotify = false;
      this.recomputeRuntimeConfig(notify);
    });
  }

  private recomputeMotionRuntime(
    notify: boolean,
    resolvedSurfaceInput = this.getResolvedSurfaceInput()
  ): boolean {
    return withSearchNavSwitchRuntimeAttribution('sheetHost', 'recomputeMotionRuntime', () => {
      const nextSnapshot = this.createMotionRuntimeSnapshot(resolvedSurfaceInput);
      if (areMotionRuntimeSnapshotsEqual(this.motionRuntimeSnapshot, nextSnapshot)) {
        return false;
      }
      this.motionRuntimeSnapshot = nextSnapshot;
      if (notify && this.motionRuntimeListeners.size > 0) {
        withSearchNavSwitchRuntimeAttribution('sheetHost', 'notify:motionRuntime', () => {
          this.motionRuntimeListeners.forEach((listener) => {
            listener();
          });
          this.notifySelectorListeners(
            this.motionRuntimeSelectorListeners,
            this.motionRuntimeSnapshot
          );
        });
      }
      return true;
    });
  }

  private recomputeBody(
    notify: boolean,
    resolvedSurfaceInput = this.getResolvedSurfaceInput(),
    notifySurface = true,
    notifyBody = notifySurface
  ): boolean {
    return withSearchNavSwitchRuntimeAttribution('sheetHost', 'recomputeBody', () => {
      const nextSnapshot = this.createBodySnapshot(resolvedSurfaceInput);
      if (areAppRouteSheetHostSurfaceBodySnapshotsEqual(this.bodySnapshot, nextSnapshot)) {
        return false;
      }
      const previousSheetYValue = this.bodySnapshot.motionStateEntry?.sheetYValue ?? null;
      const nextSheetYValue = nextSnapshot.motionStateEntry?.sheetYValue ?? null;
      const shouldSeedIncomingSheetPosition =
        resolvedSurfaceInput.surfaceVisualPolicy.phase === 'results_dismissing' &&
        resolvedSurfaceInput.surfaceVisualPolicy.bottomBandOwner === 'persistent_polls' &&
        previousSheetYValue != null &&
        nextSheetYValue != null &&
        previousSheetYValue !== nextSheetYValue;
      if (shouldSeedIncomingSheetPosition) {
        const inheritedSheetY = previousSheetYValue.value;
        nextSheetYValue.value = inheritedSheetY;
        runOnUI(seedSheetYOnUI)(nextSheetYValue, inheritedSheetY);
      }
      this.bodySnapshot = nextSnapshot;
      if (notify && notifyBody) {
        withSearchNavSwitchRuntimeAttribution('sheetHost', 'notify:body', () => {
          this.bodyListeners.forEach((listener) => {
            listener();
          });
          this.notifySelectorListeners(this.bodySelectorListeners, this.bodySnapshot);
        });
      }
      if (notifySurface) {
        this.recomputeSurface(notify);
      }
      return true;
    });
  }

  private recomputeFrame(
    notify: boolean,
    notifySurface = true,
    notifyFrame = notifySurface
  ): boolean {
    return withSearchNavSwitchRuntimeAttribution('sheetHost', 'recomputeFrame', () => {
      const nextSnapshot =
        this.nativeRouteSheetFrameHostAuthority?.getSnapshot() ??
        EMPTY_APP_ROUTE_SHEET_HOST_FRAME_SNAPSHOT;
      if (this.frameSnapshot.sheetClipStyle === nextSnapshot.sheetClipStyle) {
        return false;
      }
      this.frameSnapshot = nextSnapshot;
      if (notify && notifyFrame) {
        withSearchNavSwitchRuntimeAttribution('sheetHost', 'notify:frame', () => {
          this.frameListeners.forEach((listener) => {
            listener();
          });
          this.notifySelectorListeners(this.frameSelectorListeners, this.frameSnapshot);
        });
      }
      if (notifySurface) {
        this.recomputeSurface(notify);
      }
      return true;
    });
  }

  private notifyBatchedSurfaceLaneListeners({
    bodyChanged,
    frameChanged,
    motionRuntimeChanged,
    runtimeConfigChanged,
    notify,
  }: {
    bodyChanged: boolean;
    frameChanged: boolean;
    motionRuntimeChanged: boolean;
    runtimeConfigChanged: boolean;
    notify: boolean;
  }): void {
    if (!notify) {
      return;
    }
    if (frameChanged) {
      withSearchNavSwitchRuntimeAttribution('sheetHost', 'notifyBatched:frame', () => {
        this.frameListeners.forEach((listener) => {
          listener();
        });
        this.notifySelectorListeners(this.frameSelectorListeners, this.frameSnapshot);
      });
    }
    if (motionRuntimeChanged) {
      withSearchNavSwitchRuntimeAttribution('sheetHost', 'notifyBatched:motionRuntime', () => {
        this.motionRuntimeListeners.forEach((listener) => {
          listener();
        });
        this.notifySelectorListeners(
          this.motionRuntimeSelectorListeners,
          this.motionRuntimeSnapshot
        );
      });
    }
    if (bodyChanged) {
      withSearchNavSwitchRuntimeAttribution('sheetHost', 'notifyBatched:body', () => {
        this.bodyListeners.forEach((listener) => {
          listener();
        });
        this.notifySelectorListeners(this.bodySelectorListeners, this.bodySnapshot);
      });
    }
    if (runtimeConfigChanged && this.runtimeConfigListeners.size > 0) {
      withSearchNavSwitchRuntimeAttribution('sheetHost', 'notifyBatched:runtimeConfig', () => {
        this.runtimeConfigListeners.forEach((listener) => {
          listener();
        });
      });
    }
  }

  private recomputeSurface(notify: boolean): void {
    withSearchNavSwitchRuntimeAttribution('sheetHost', 'recomputeSurface', () => {
      const nextSnapshot = this.createSurfaceSnapshot();
      if (areAppRouteSheetHostSurfaceSnapshotsEqual(this.surfaceSnapshot, nextSnapshot)) {
        return;
      }
      this.surfaceSnapshot = nextSnapshot;
      if (!notify) {
        return;
      }
      withSearchNavSwitchRuntimeAttribution('sheetHost', 'notify:surface', () => {
        this.surfaceListeners.forEach((listener) => {
          listener();
        });
        this.notifySelectorListeners(this.surfaceSelectorListeners, this.surfaceSnapshot);
      });
    });
  }

  private syncSheetMotionTarget(resolvedSurfaceInput = this.getResolvedSurfaceInput()): void {
    withSearchNavSwitchRuntimeAttribution('sheetHost', 'syncSheetMotionTarget', () => {
      const { activeRenderableShellSpec, resolvedRuntimeModel } = resolvedSurfaceInput;
      const motionCommandValue = this.resolveMountedSheetMotionCommandValue(resolvedSurfaceInput);
      if (
        this.registeredSheetRuntimeModel === resolvedRuntimeModel &&
        this.registeredSheetMotionCommandValue === motionCommandValue
      ) {
        return;
      }
      this.unregisterSheetMotionTarget?.();
      this.unregisterSheetMotionTarget = null;
      this.registeredSheetRuntimeModel = resolvedRuntimeModel;
      this.registeredSheetMotionCommandValue = motionCommandValue;
      if (resolvedRuntimeModel == null || motionCommandValue == null) {
        return;
      }
      this.unregisterSheetMotionTarget =
        this.input.routeSceneMotionRuntime.registerSheetMotionTarget({
          sceneKey: 'searchRoute',
          motionCommandValue,
          resolveCurrentSnapTarget: this.resolveCurrentSnapTarget,
        });
      const seedSnap = this.resolveSheetRuntimeRegistrationSeedSnap(resolvedSurfaceInput);
      const initialSheetY = activeRenderableShellSpec?.snapPoints[seedSnap];
      const mountedSheetYValue = this.resolveMountedSheetYValue(resolvedSurfaceInput);
      if (typeof initialSheetY === 'number' && mountedSheetYValue != null) {
        runOnUI(seedSheetYOnUI)(mountedSheetYValue, initialSheetY);
      }
    });
  }

  private scheduleInitialVisibleSnapBootstrap({
    dispatchKey,
    persistenceKey,
    persistedSnap,
    snap,
  }: {
    dispatchKey: string;
    persistenceKey: string | null;
    persistedSnap: OverlaySheetSnap | null;
    snap: Exclude<OverlaySheetSnap, 'hidden'>;
  }): void {
    if (this.pendingInitialVisibleSnapDispatchKey === dispatchKey) {
      return;
    }
    this.pendingInitialVisibleSnapDispatchKey = dispatchKey;
    Promise.resolve().then(() => {
      if (this.pendingInitialVisibleSnapDispatchKey !== dispatchKey) {
        return;
      }
      this.pendingInitialVisibleSnapDispatchKey = null;
      if (this.initialVisibleSnapDispatchKey !== dispatchKey || this.currentSnap !== 'hidden') {
        return;
      }
      const latestSurfaceInput = this.getResolvedSurfaceInput();
      const latestSnapSessionSnapshot = this.input.routeSheetSnapSessionAuthority.getSnapshot();
      if (isExplicitlyDismissedDockedPollsRoot(latestSurfaceInput, latestSnapSessionSnapshot)) {
        this.initialVisibleSnapDispatchKey = null;
        return;
      }
      if (persistenceKey != null && persistedSnap == null) {
        this.input.routeSheetSnapSessionActions.recordPersistentSnap({
          key: persistenceKey,
          snap,
        });
      }
      this.input.routeSceneMotionRuntime.requestBootstrapSharedSheetTransition({
        snap,
        token: null,
      });
    });
  }

  private resolveSheetRuntimeRegistrationSeedSnap(
    resolvedSurfaceInput = this.getResolvedSurfaceInput()
  ): OverlaySheetSnap {
    const initialSnap = this.resolveSheetRuntimeInitialSnap(resolvedSurfaceInput);
    if (!resolvedSurfaceInput.visible) {
      return initialSnap;
    }
    if (this.currentSnap !== 'hidden') {
      return this.currentSnap;
    }
    const sheetSnapSessionSnapshot = this.input.routeSheetSnapSessionAuthority.getSnapshot();
    if (sheetSnapSessionSnapshot.hasUserSharedSnap) {
      return sheetSnapSessionSnapshot.sharedSnap;
    }
    return initialSnap;
  }

  private resolveSheetRuntimeInitialSnap(
    resolvedSurfaceInput = this.getResolvedSurfaceInput()
  ): Exclude<OverlaySheetSnap, 'hidden'> {
    const policyInitialSnap = resolvePolicyInitialSnap(
      resolvedSurfaceInput.activeSemanticOverlayKey
    );
    const surfaceVisualPolicy = resolvedSurfaceInput.surfaceVisualPolicy;
    if (!resolvedSurfaceInput.visible) {
      return policyInitialSnap;
    }
    if (surfaceVisualPolicy.phase === 'results_dismissing') {
      return 'collapsed';
    }
    if (surfaceVisualPolicy.phase === 'results_redrawing') {
      return policyInitialSnap;
    }
    return policyInitialSnap;
  }

  private syncInitialVisibleSnap(resolvedSurfaceInput = this.getResolvedSurfaceInput()): void {
    withSearchNavSwitchRuntimeAttribution('sheetHost', 'syncInitialVisibleSnap', () => {
      const {
        activeRenderableShellSpec,
        canRenderSurface,
        resolvedShellIdentityKey,
        resolvedRuntimeModel,
        rootOverlayKey,
        visible,
      } = resolvedSurfaceInput;
      const routeSceneSwitchSnapshot = this.input.routeSceneInteractivityAuthority.getSnapshot();
      if (routeSceneSwitchSnapshot.transitionPhase !== 'idle') {
        return;
      }
      const sheetSnapSessionSnapshot = this.input.routeSheetSnapSessionAuthority.getSnapshot();
      if (isExplicitlyDismissedDockedPollsRoot(resolvedSurfaceInput, sheetSnapSessionSnapshot)) {
        this.initialVisibleSnapDispatchKey = null;
        return;
      }
      if (
        !visible ||
        !canRenderSurface ||
        activeRenderableShellSpec == null ||
        resolvedRuntimeModel == null
      ) {
        this.initialVisibleSnapDispatchKey = null;
        return;
      }

      const motionPersistenceInput = this.createMotionPersistenceInput(resolvedSurfaceInput);
      const resolvedSnapPersistenceKey = resolveSnapPersistenceKey(motionPersistenceInput);
      if (this.currentSnap !== 'hidden') {
        this.initialVisibleSnapDispatchKey = null;
        return;
      }
      const rawPersistedSnap =
        resolvedSnapPersistenceKey != null
          ? this.input.routeSheetSnapSessionActions.getPersistentSnap(resolvedSnapPersistenceKey)
          : null;
      const persistedSnap = rawPersistedSnap !== 'hidden' ? rawPersistedSnap : null;
      const desiredSnap =
        persistedSnap ?? resolvePolicyInitialSnap(resolvedSurfaceInput.activeSemanticOverlayKey);
      const initialVisibleSnapDispatchKey = [
        rootOverlayKey,
        resolvedShellIdentityKey,
        desiredSnap,
        resolvedSnapPersistenceKey ?? 'unpersisted',
      ].join(':');

      if (this.initialVisibleSnapDispatchKey === initialVisibleSnapDispatchKey) {
        return;
      }
      this.initialVisibleSnapDispatchKey = initialVisibleSnapDispatchKey;
      const desiredSheetY = activeRenderableShellSpec.snapPoints[desiredSnap];
      const mountedSheetYValue = this.resolveMountedSheetYValue(resolvedSurfaceInput);
      if (typeof desiredSheetY === 'number' && mountedSheetYValue != null) {
        runOnUI(seedSheetYOnUI)(mountedSheetYValue, desiredSheetY);
      }

      this.scheduleInitialVisibleSnapBootstrap({
        dispatchKey: initialVisibleSnapDispatchKey,
        persistenceKey: resolvedSnapPersistenceKey,
        persistedSnap,
        snap: desiredSnap,
      });
    });
  }

  private readonly resolveCurrentSnapTarget = (): OverlaySheetSnap => {
    const sharedSheetState = this.input.routeSharedSheetPresentationRuntime.getSnapshot().sheetState;
    if (sharedSheetState !== 'hidden') {
      return sharedSheetState;
    }
    return this.currentSnap;
  };

  private shouldUseMountedSheetRuntimeReseedLane(
    resolvedSurfaceInput: AppRouteSheetHostResolvedSurfaceInput
  ): boolean {
    return (
      this.bodySnapshot.hasRenderableSheetSurface &&
      this.bodySnapshot.motionStateEntry != null &&
      resolvedSurfaceInput.activeSemanticOverlayKey === 'search' &&
      resolvedSurfaceInput.activeSceneKey === this.bodySnapshot.activeSceneKey
    );
  }

  private getMountedSheetRuntimeReseedMotionStateEntry(
    resolvedSurfaceInput: AppRouteSheetHostResolvedSurfaceInput
  ): NonNullable<AppRouteSheetHostSurfaceBodySnapshot['motionStateEntry']> | null {
    if (!this.shouldUseMountedSheetRuntimeReseedLane(resolvedSurfaceInput)) {
      return null;
    }
    return this.bodySnapshot.motionStateEntry;
  }

  private resolveMountedSheetMotionCommandValue(
    resolvedSurfaceInput: AppRouteSheetHostResolvedSurfaceInput
  ): SheetRuntimeModel['snapController']['motionCommand'] | null {
    return (
      this.getMountedSheetRuntimeReseedMotionStateEntry(resolvedSurfaceInput)?.motionCommandValue ??
      resolvedSurfaceInput.resolvedRuntimeModel?.snapController.motionCommand ??
      null
    );
  }

  private resolveMountedSheetYValue(
    resolvedSurfaceInput: AppRouteSheetHostResolvedSurfaceInput
  ): SheetRuntimeModel['presentationState']['sheetY'] | null {
    return (
      this.getMountedSheetRuntimeReseedMotionStateEntry(resolvedSurfaceInput)?.sheetYValue ??
      resolvedSurfaceInput.resolvedRuntimeModel?.presentationState.sheetY ??
      null
    );
  }

  private readonly handleDragStateChange = (isDragging: boolean): void => {
    const resolvedSurfaceInput = this.getResolvedSurfaceInput();
    resolvedSurfaceInput.activeRenderableShellSpec?.onDragStateChange?.(isDragging);
    this.getParentSearchShellSpecForSearchOriginRestaurant(
      resolvedSurfaceInput
    )?.onDragStateChange?.(isDragging);
  };

  private readonly handleHidden = (): void => {
    this.input.routeSharedSheetPresentationRuntime.markSharedSheetHidden();
  };

  private readonly handleScrollOffsetChange = (offsetY: number): void => {
    this.getResolvedSurfaceInput().activeRenderableShellSpec?.onScrollOffsetChange?.(offsetY);
  };

  private readonly handleMomentumBegin = (): void => {
    this.getResolvedSurfaceInput().activeRenderableShellSpec?.onMomentumBeginJS?.();
  };

  private readonly handleMomentumEnd = (): void => {
    this.getResolvedSurfaceInput().activeRenderableShellSpec?.onMomentumEndJS?.();
  };

  private readonly handleSettleStateChange = (isSettling: boolean): void => {
    const resolvedSurfaceInput = this.getResolvedSurfaceInput();
    resolvedSurfaceInput.activeRenderableShellSpec?.onSettleStateChange?.(isSettling);
    this.getParentSearchShellSpecForSearchOriginRestaurant(
      resolvedSurfaceInput
    )?.onSettleStateChange?.(isSettling);
  };

  private readonly handleSnapSettleComplete = (settleToken: number): void => {
    this.input.routeSceneMotionRuntime.completeFromSheetSettle(settleToken);
  };

  private readonly handleSheetSnapStart = (
    snap: OverlaySheetSnap,
    meta?: { source: 'gesture' | 'programmatic' }
  ): void => {
    const resolvedSurfaceInput = this.getResolvedSurfaceInput();
    if (snap !== 'hidden') {
      this.markSearchSurfaceSheetReadyForVisibleSnap(resolvedSurfaceInput);
      this.input.routeSharedSheetPresentationRuntime.recordSharedSheetSnap(snap);
    }
  };

  private readonly recordSharedSheetSnap = (
    snap: OverlaySheetSnap,
    meta?: { source: 'gesture' | 'programmatic' }
  ): void => {
    this.currentSnap = snap;
    if (snap !== 'hidden') {
      this.initialVisibleSnapDispatchKey = null;
    }
    const resolvedSurfaceInput = this.getResolvedSurfaceInput();
    const {
      activeSemanticOverlayKey,
      resolvedRuntimeModel,
      rootOverlayKey,
    } = resolvedSurfaceInput;
    this.input.routeSharedSheetPresentationRuntime.recordSharedSheetSnap(snap);
    if (snap !== 'hidden') {
      this.markSearchSurfaceSheetReadyForVisibleSnap(resolvedSurfaceInput);
    }
    if (
      snap === 'collapsed' &&
      resolvedSurfaceInput.surfaceVisualPolicy.phase === 'results_dismissing' &&
      resolvedSurfaceInput.surfaceVisualPolicy.transactionId != null
    ) {
      getSearchSurfaceRuntime().commitDismissBoundary(
        resolvedSurfaceInput.surfaceVisualPolicy.transactionId
      );
    }
    if (
      resolvedRuntimeModel != null &&
      'handleProgrammaticSnapEvent' in resolvedRuntimeModel.snapController
    ) {
      resolvedRuntimeModel.snapController.handleProgrammaticSnapEvent(
        snap,
        meta?.source ?? 'gesture'
      );
    }
    this.recordRouteSceneSnapFact(resolvedSurfaceInput, snap, meta);

    const motionPersistenceInput = this.createMotionPersistenceInput(resolvedSurfaceInput);
    const resolvedSnapPersistenceKey = resolveSnapPersistenceKey(motionPersistenceInput);
    if (resolvedSnapPersistenceKey != null) {
      this.input.routeSheetSnapSessionActions.recordPersistentSnap({
        key: resolvedSnapPersistenceKey,
        snap,
      });
    }
    if (meta?.source === 'gesture') {
      this.input.routeSheetSnapSessionActions.recordUserSnap({
        rootOverlay: rootOverlayKey,
        activeOverlayKey: activeSemanticOverlayKey,
        snap,
      });
    }
  };

  private markSearchSurfaceSheetReadyForVisibleSnap(
    resolvedSurfaceInput: AppRouteSheetHostResolvedSurfaceInput
  ): void {
    if (
      resolvedSurfaceInput.rootOverlayKey !== 'search' ||
      (resolvedSurfaceInput.activeSemanticOverlayKey !== 'search' &&
        resolvedSurfaceInput.activeSemanticOverlayKey !== 'restaurant')
    ) {
      return;
    }
    const searchSurfaceRuntime = getSearchSurfaceRuntime();
    const transactionId = searchSurfaceRuntime.getActiveOrPendingRedrawTransactionId();
    if (transactionId == null) {
      return;
    }
    searchSurfaceRuntime.markRedrawSheetReady(transactionId);
  }

  private recordRouteSceneSnapFact(
    resolvedSurfaceInput: AppRouteSheetHostResolvedSurfaceInput,
    snap: OverlaySheetSnap,
    meta?: { source: 'gesture' | 'programmatic' }
  ): void {
    const { activeSemanticOverlayKey, rootOverlayKey } = resolvedSurfaceInput;
    if (activeSemanticOverlayKey === 'polls') {
      const transitionSnapshot = this.input.routeSceneTransitionAuthority.getSnapshot();
      const activeDockedRestoreIntent = transitionSnapshot.activeDockedPollsRestoreIntent;
      this.input.routeSheetSnapSessionActions.settleRouteScenePollsSnap({
        rootOverlayKey,
        snap,
        source: meta?.source,
      });
      if (meta?.source === 'gesture' && snap !== 'hidden') {
        this.input.routeSceneSwitchActions.clearDockedPollsRestoreIntent();
      }
      if (
        activeDockedRestoreIntent != null &&
        (snap === activeDockedRestoreIntent.snap || meta?.source === 'gesture') &&
        snap !== 'hidden'
      ) {
        this.input.routeSceneSwitchActions.clearDockedPollsRestoreIntent(
          activeDockedRestoreIntent.token,
          activeDockedRestoreIntent.snap
        );
      }
      return;
    }
    if (activeSemanticOverlayKey === 'bookmarks' || activeSemanticOverlayKey === 'profile') {
      this.input.routeSheetSnapSessionActions.settleRouteSceneTabSnap({
        sceneKey: activeSemanticOverlayKey,
        snap,
      });
      return;
    }
    this.input.routeSheetSnapSessionActions.recordRouteSceneSheetSettle({
      sceneKey: activeSemanticOverlayKey,
      snap,
    });
  }

  private getParentSearchShellSpecForSearchOriginRestaurant(
    resolvedSurfaceInput: AppRouteSheetHostResolvedSurfaceInput
  ): NonNullable<SearchRouteSceneStackFrameEntry['shellSpec']> | null {
    if (
      resolvedSurfaceInput.rootOverlayKey !== 'search' ||
      resolvedSurfaceInput.activeSemanticOverlayKey !== 'restaurant'
    ) {
      return null;
    }
    const searchShellSpec =
      this.input.routeSceneFrameAuthority.getSceneFrameEntry('search')?.shellSpec ?? null;
    if (
      searchShellSpec == null ||
      searchShellSpec === resolvedSurfaceInput.activeRenderableShellSpec
    ) {
      return null;
    }
    return searchShellSpec;
  }
}

export const createAppRouteSheetHostAuthorityController = (
  input: AppRouteSheetHostAuthorityControllerInput
): AppRouteSheetHostAuthorityControllerRuntime => new AppRouteSheetHostAuthorityController(input);
