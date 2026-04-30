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
import { EMPTY_SEARCH_ROUTE_SHEET_MOTION_STATE_SNAPSHOT } from '../../screens/Search/runtime/shared/search-route-sheet-motion-state-snapshot-contract';
import { EMPTY_SEARCH_ROUTE_SHEET_RESOLVED_VISUAL_SELECTION_SNAPSHOT } from '../../screens/Search/runtime/shared/search-route-sheet-resolved-visual-selection-snapshot-contract';
import { EMPTY_SEARCH_ROUTE_SHEET_SCROLL_BODY_DEFAULTS_SNAPSHOT } from '../../screens/Search/runtime/shared/search-route-sheet-scroll-body-defaults-snapshot-contract';
import { EMPTY_SEARCH_ROUTE_SHEET_SCROLL_SHARED_RUNTIME_SNAPSHOT } from '../../screens/Search/runtime/shared/search-route-sheet-scroll-shared-runtime-snapshot-contract';
import type { SearchRouteSheetHostFrameSnapshot } from '../../screens/Search/runtime/shared/search-route-sheet-host-frame-snapshot-contract';
import {
  markSearchNavSwitchRuntimeAttribution,
  withSearchNavSwitchRuntimeAttribution,
} from '../../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';
import type {
  RouteOverlayNavigationAuthority,
  RouteOverlaySheetPolicyAuthority,
  RouteSceneFrameAuthority,
  RouteSheetVisualAuthority,
} from '../../screens/Search/runtime/shared/route-authority-contract';
import type { AppRouteSceneInteractivityAuthority } from './app-route-scene-switch-authority';
import type { AppRouteSceneMotionRuntime } from './app-route-scene-motion-controller';
import {
  EMPTY_APP_ROUTE_SHEET_HOST_FRAME_SNAPSHOT,
  EMPTY_APP_ROUTE_SHEET_HOST_SURFACE_SNAPSHOT,
  EMPTY_APP_ROUTE_SHEET_HOST_SURFACE_BODY_SNAPSHOT,
  areAppRouteSheetHostSurfaceSnapshotsEqual,
  areAppRouteSheetHostSurfaceBodySnapshotsEqual,
  type AppRouteSheetHostRuntimeConfigAuthority,
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

type Listener = () => void;

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
  fallbackRuntimeModel: BottomSheetRuntimeModel;
  routeSheetFrameHostAuthority: AppRouteSheetHostSurfaceFrameAuthority;
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
  routeSceneInteractivityAuthority: AppRouteSceneInteractivityAuthority;
  routeSceneMotionRuntime: AppRouteSceneMotionRuntime;
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
  initialSheetY: number;
  isRenderable: boolean;
  overlayRouteScope: SearchRouteOverlayRouteScope;
  overlaySheetPolicy: ReturnType<
    RouteOverlaySheetPolicyAuthority['getSnapshot']
  >['overlaySheetPolicy'];
  presentationState: SearchRouteSceneStackPresentationState;
  resolvedRuntimeModel: SheetRuntimeModel | null;
  resolvedShellIdentityKey: string;
  rootOverlayKey: OverlayKey;
  visible: boolean;
};

export type AppRouteSheetHostAuthorityControllerRuntime = {
  nativeAdapterAuthority: AppRouteSheetHostNativeAdapterAuthority;
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
  initialSnapPoint: 'middle',
};

const EMPTY_ACTIVE_SCENE_FRAME_ENTRY: SearchRouteSceneStackFrameEntry = {
  sceneKey: 'searchRoute',
  shellSpec: EMPTY_ROUTE_SHEET_SHELL_SPEC,
};

const EMPTY_PRESENTATION_STATE: SearchRouteSceneStackPresentationState = {
  sheetTranslateY: EMPTY_SEARCH_ROUTE_VISUAL_STATE.sheetTranslateY,
  resultsScrollOffset: EMPTY_SEARCH_ROUTE_VISUAL_STATE.resultsScrollOffset,
  resultsMomentum: EMPTY_SEARCH_ROUTE_VISUAL_STATE.resultsMomentum,
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
  activeShellSpec,
  resolvedShellIdentityKey,
  activeSemanticOverlayKey,
  rootOverlayKey,
  overlayRouteStackLength,
}: SearchRouteSheetMotionPersistenceInput): string | null => {
  if (activeShellSpec == null) {
    return null;
  }
  if (activeShellSpec.snapPersistenceKey === null) {
    return null;
  }
  if (typeof activeShellSpec.snapPersistenceKey === 'string') {
    return activeShellSpec.snapPersistenceKey;
  }
  const isTabOverlay =
    activeSemanticOverlayKey === 'polls' ||
    activeSemanticOverlayKey === 'pollCreation' ||
    activeSemanticOverlayKey === 'bookmarks' ||
    activeSemanticOverlayKey === 'profile';
  if (isTabOverlay) {
    return ROUTE_SHARED_SNAP_PERSISTENCE_KEY;
  }
  if (overlayRouteStackLength > 1) {
    return `overlay-stack:${rootOverlayKey}`;
  }
  return `overlay:${resolvedShellIdentityKey}`;
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

const areNativeAdapterSnapshotsEqual = (
  left: AppRouteSheetHostNativeAdapterSnapshot,
  right: AppRouteSheetHostNativeAdapterSnapshot
): boolean =>
  left.presentationStateOverride.sheetY === right.presentationStateOverride.sheetY &&
  left.presentationStateOverride.scrollOffset === right.presentationStateOverride.scrollOffset &&
  left.presentationStateOverride.momentumFlag === right.presentationStateOverride.momentumFlag &&
  left.initialSheetY === right.initialSheetY &&
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

const markSheetHostDiff = (operation: string): void => {
  markSearchNavSwitchRuntimeAttribution('sheetHostDiff', operation);
};

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

const markSheetHostFieldDiff = (field: string, left: unknown, right: unknown): void => {
  if (!Object.is(left, right)) {
    markSheetHostDiff(`field:${field}`);
  }
};

const markSheetHostResolvedSurfaceInputDiffs = (
  left: AppRouteSheetHostResolvedSurfaceInput | null,
  right: AppRouteSheetHostResolvedSurfaceInput,
  source: string
): void => {
  markSheetHostDiff(`source:${source}`);
  if (left == null) {
    return;
  }

  markSheetHostFieldDiff('resolved.activeSceneKey', left.activeSceneKey, right.activeSceneKey);
  markSheetHostFieldDiff(
    'resolved.activeShellSpecRef',
    left.activeShellSpec,
    right.activeShellSpec
  );
  markSheetHostFieldDiff(
    'resolved.activeRenderableShellSpecRef',
    left.activeRenderableShellSpec,
    right.activeRenderableShellSpec
  );
  markSheetHostFieldDiff(
    'resolved.activeSemanticOverlayKey',
    left.activeSemanticOverlayKey,
    right.activeSemanticOverlayKey
  );
  markSheetHostFieldDiff(
    'resolved.canRenderSurface',
    left.canRenderSurface,
    right.canRenderSurface
  );
  markSheetHostFieldDiff(
    'resolved.chromeVisualState',
    left.chromeVisualState,
    right.chromeVisualState
  );
  markSheetHostFieldDiff('resolved.initialSheetY', left.initialSheetY, right.initialSheetY);
  markSheetHostFieldDiff('resolved.isRenderable', left.isRenderable, right.isRenderable);
  markSheetHostFieldDiff(
    'resolved.overlayRouteScope.activeOverlayRouteKey',
    left.overlayRouteScope.activeOverlayRouteKey,
    right.overlayRouteScope.activeOverlayRouteKey
  );
  markSheetHostFieldDiff(
    'resolved.overlayRouteScope.rootOverlayKey',
    left.overlayRouteScope.rootOverlayKey,
    right.overlayRouteScope.rootOverlayKey
  );
  markSheetHostFieldDiff(
    'resolved.overlayRouteScope.overlayRouteStackLength',
    left.overlayRouteScope.overlayRouteStackLength,
    right.overlayRouteScope.overlayRouteStackLength
  );
  markSheetHostFieldDiff(
    'resolved.overlaySheetPolicy',
    left.overlaySheetPolicy,
    right.overlaySheetPolicy
  );
  markSheetHostFieldDiff(
    'resolved.presentationState',
    left.presentationState,
    right.presentationState
  );
  markSheetHostFieldDiff(
    'resolved.resolvedRuntimeModel',
    left.resolvedRuntimeModel,
    right.resolvedRuntimeModel
  );
  markSheetHostFieldDiff(
    'resolved.resolvedShellIdentityKey',
    left.resolvedShellIdentityKey,
    right.resolvedShellIdentityKey
  );
  markSheetHostFieldDiff('resolved.rootOverlayKey', left.rootOverlayKey, right.rootOverlayKey);
  markSheetHostFieldDiff('resolved.visible', left.visible, right.visible);

  const leftShellSpec = left.activeShellSpec;
  const rightShellSpec = right.activeShellSpec;
  markSheetHostFieldDiff(
    'resolved.shellSpec.overlayKey',
    leftShellSpec.overlayKey,
    rightShellSpec.overlayKey
  );
  markSheetHostFieldDiff(
    'resolved.shellSpec.semanticOverlayKey',
    leftShellSpec.semanticOverlayKey,
    rightShellSpec.semanticOverlayKey
  );
  markSheetHostFieldDiff(
    'resolved.shellSpec.shellIdentityKey',
    leftShellSpec.shellIdentityKey,
    rightShellSpec.shellIdentityKey
  );
  markSheetHostFieldDiff(
    'resolved.shellSpec.sceneIdentityKey',
    leftShellSpec.sceneIdentityKey,
    rightShellSpec.sceneIdentityKey
  );
  markSheetHostFieldDiff(
    'resolved.shellSpec.surfaceKind',
    leftShellSpec.surfaceKind,
    rightShellSpec.surfaceKind
  );
  markSheetHostFieldDiff(
    'resolved.shellSpec.snapPersistenceKey',
    leftShellSpec.snapPersistenceKey,
    rightShellSpec.snapPersistenceKey
  );
  markSheetHostFieldDiff(
    'resolved.shellSpec.initialSnapPoint',
    leftShellSpec.initialSnapPoint,
    rightShellSpec.initialSnapPoint
  );
  markSheetHostFieldDiff(
    'resolved.shellSpec.snapPoints.expanded',
    leftShellSpec.snapPoints.expanded,
    rightShellSpec.snapPoints.expanded
  );
  markSheetHostFieldDiff(
    'resolved.shellSpec.snapPoints.middle',
    leftShellSpec.snapPoints.middle,
    rightShellSpec.snapPoints.middle
  );
  markSheetHostFieldDiff(
    'resolved.shellSpec.snapPoints.collapsed',
    leftShellSpec.snapPoints.collapsed,
    rightShellSpec.snapPoints.collapsed
  );
  markSheetHostFieldDiff(
    'resolved.shellSpec.snapPoints.hidden',
    leftShellSpec.snapPoints.hidden,
    rightShellSpec.snapPoints.hidden
  );
  markSheetHostFieldDiff(
    'resolved.shellSpec.headerComponent',
    leftShellSpec.headerComponent,
    rightShellSpec.headerComponent
  );
  markSheetHostFieldDiff(
    'resolved.shellSpec.backgroundComponent',
    leftShellSpec.backgroundComponent,
    rightShellSpec.backgroundComponent
  );
  markSheetHostFieldDiff(
    'resolved.shellSpec.overlayComponent',
    leftShellSpec.overlayComponent,
    rightShellSpec.overlayComponent
  );
  markSheetHostFieldDiff(
    'resolved.shellSpec.flashListProps',
    leftShellSpec.flashListProps,
    rightShellSpec.flashListProps
  );
  markSheetHostFieldDiff('resolved.shellSpec.style', leftShellSpec.style, rightShellSpec.style);
  markSheetHostFieldDiff(
    'resolved.shellSpec.contentContainerStyle',
    leftShellSpec.contentContainerStyle,
    rightShellSpec.contentContainerStyle
  );
  markSheetHostFieldDiff(
    'resolved.shellSpec.runtimeModel',
    leftShellSpec.runtimeModel,
    rightShellSpec.runtimeModel
  );
  markSheetHostFieldDiff(
    'resolved.shellSpec.listScrollEnabled',
    leftShellSpec.listScrollEnabled,
    rightShellSpec.listScrollEnabled
  );
  markSheetHostFieldDiff(
    'resolved.shellSpec.interactionEnabled',
    leftShellSpec.interactionEnabled,
    rightShellSpec.interactionEnabled
  );
  markSheetHostFieldDiff('resolved.shellSpec.testID', leftShellSpec.testID, rightShellSpec.testID);
};

const markSheetHostNativeAdapterDiffs = (
  left: AppRouteSheetHostNativeAdapterSnapshot,
  right: AppRouteSheetHostNativeAdapterSnapshot
): void => {
  markSheetHostFieldDiff(
    'native.presentationStateOverride.sheetY',
    left.presentationStateOverride.sheetY,
    right.presentationStateOverride.sheetY
  );
  markSheetHostFieldDiff(
    'native.presentationStateOverride.scrollOffset',
    left.presentationStateOverride.scrollOffset,
    right.presentationStateOverride.scrollOffset
  );
  markSheetHostFieldDiff(
    'native.presentationStateOverride.momentumFlag',
    left.presentationStateOverride.momentumFlag,
    right.presentationStateOverride.momentumFlag
  );
  markSheetHostFieldDiff('native.initialSheetY', left.initialSheetY, right.initialSheetY);
  markSheetHostFieldDiff(
    'native.frameHostInput.overlaySheetPolicy',
    left.frameHostInput.overlaySheetPolicy,
    right.frameHostInput.overlaySheetPolicy
  );
  markSheetHostFieldDiff(
    'native.frameHostInput.expandedSnapPoint',
    left.frameHostInput.expandedSnapPoint,
    right.frameHostInput.expandedSnapPoint
  );
  markSheetHostFieldDiff(
    'native.frameHostInput.middleSnapPoint',
    left.frameHostInput.middleSnapPoint,
    right.frameHostInput.middleSnapPoint
  );
  markSheetHostFieldDiff(
    'native.frameHostInput.collapsedSnapPoint',
    left.frameHostInput.collapsedSnapPoint,
    right.frameHostInput.collapsedSnapPoint
  );
  markSheetHostFieldDiff(
    'native.frameHostInput.sheetY',
    left.frameHostInput.sheetY,
    right.frameHostInput.sheetY
  );
  markSheetHostFieldDiff(
    'native.chromeVisualState',
    left.chromeVisualState,
    right.chromeVisualState
  );
};

const markSheetHostBodySnapshotDiffs = (
  left: AppRouteSheetHostSurfaceBodySnapshot,
  right: AppRouteSheetHostSurfaceBodySnapshot
): void => {
  markSheetHostFieldDiff('body.activeSceneKey', left.activeSceneKey, right.activeSceneKey);
  markSheetHostFieldDiff(
    'body.hasRenderableSheetSurface',
    left.hasRenderableSheetSurface,
    right.hasRenderableSheetSurface
  );
  markSheetHostFieldDiff(
    'body.chromeEntry.headerComponent',
    left.chromeEntry?.headerComponent ?? null,
    right.chromeEntry?.headerComponent ?? null
  );
  markSheetHostFieldDiff(
    'body.chromeEntry.backgroundComponent',
    left.chromeEntry?.backgroundComponent ?? null,
    right.chromeEntry?.backgroundComponent ?? null
  );
  markSheetHostFieldDiff(
    'body.chromeEntry.overlayComponent',
    left.chromeEntry?.overlayComponent ?? null,
    right.chromeEntry?.overlayComponent ?? null
  );
  markSheetHostFieldDiff(
    'body.chromeEntry.shadowStyle',
    left.chromeEntry?.shadowStyle ?? null,
    right.chromeEntry?.shadowStyle ?? null
  );
  markSheetHostFieldDiff(
    'body.chromeEntry.surfaceStyle',
    left.chromeEntry?.surfaceStyle ?? null,
    right.chromeEntry?.surfaceStyle ?? null
  );
  markSheetHostFieldDiff(
    'body.chromeEntry.style',
    left.chromeEntry?.style ?? null,
    right.chromeEntry?.style ?? null
  );
  markSheetHostFieldDiff(
    'body.scrollSharedRuntimeEntry.listScrollEnabled',
    left.scrollSharedRuntimeEntry?.listScrollEnabled ?? null,
    right.scrollSharedRuntimeEntry?.listScrollEnabled ?? null
  );
  markSheetHostFieldDiff(
    'body.scrollSharedRuntimeEntry.interactionEnabled',
    left.scrollSharedRuntimeEntry?.interactionEnabled ?? null,
    right.scrollSharedRuntimeEntry?.interactionEnabled ?? null
  );
  markSheetHostFieldDiff(
    'body.scrollSharedRuntimeEntry.testID',
    left.scrollSharedRuntimeEntry?.testID ?? null,
    right.scrollSharedRuntimeEntry?.testID ?? null
  );
  markSheetHostFieldDiff(
    'body.scrollBodyDefaultsEntry.contentContainerStyle',
    left.scrollBodyDefaultsEntry?.contentContainerStyle ?? null,
    right.scrollBodyDefaultsEntry?.contentContainerStyle ?? null
  );
  markSheetHostFieldDiff(
    'body.scrollBodyDefaultsEntry.flashListProps',
    left.scrollBodyDefaultsEntry?.flashListProps ?? null,
    right.scrollBodyDefaultsEntry?.flashListProps ?? null
  );
  markSheetHostFieldDiff(
    'body.motionStateEntry.visible',
    left.motionStateEntry?.visible ?? null,
    right.motionStateEntry?.visible ?? null
  );
  markSheetHostFieldDiff(
    'body.motionStateEntry.snapPoints.expanded',
    left.motionStateEntry?.snapPoints.expanded ?? null,
    right.motionStateEntry?.snapPoints.expanded ?? null
  );
  markSheetHostFieldDiff(
    'body.motionStateEntry.snapPoints.middle',
    left.motionStateEntry?.snapPoints.middle ?? null,
    right.motionStateEntry?.snapPoints.middle ?? null
  );
  markSheetHostFieldDiff(
    'body.motionStateEntry.snapPoints.collapsed',
    left.motionStateEntry?.snapPoints.collapsed ?? null,
    right.motionStateEntry?.snapPoints.collapsed ?? null
  );
  markSheetHostFieldDiff(
    'body.motionStateEntry.snapPoints.hidden',
    left.motionStateEntry?.snapPoints.hidden ?? null,
    right.motionStateEntry?.snapPoints.hidden ?? null
  );
  markSheetHostFieldDiff(
    'body.motionStateEntry.initialSnapPoint',
    left.motionStateEntry?.initialSnapPoint ?? null,
    right.motionStateEntry?.initialSnapPoint ?? null
  );
  markSheetHostFieldDiff(
    'body.motionStateEntry.sheetYValue',
    left.motionStateEntry?.sheetYValue ?? null,
    right.motionStateEntry?.sheetYValue ?? null
  );
  markSheetHostFieldDiff(
    'body.motionStateEntry.scrollOffsetValue',
    left.motionStateEntry?.scrollOffsetValue ?? null,
    right.motionStateEntry?.scrollOffsetValue ?? null
  );
  markSheetHostFieldDiff(
    'body.motionStateEntry.motionCommandValue',
    left.motionStateEntry?.motionCommandValue ?? null,
    right.motionStateEntry?.motionCommandValue ?? null
  );
};

class AppRouteSheetHostAuthorityController {
  private nativeAdapterSnapshot: AppRouteSheetHostNativeAdapterSnapshot;

  private bodySnapshot: AppRouteSheetHostSurfaceBodySnapshot =
    EMPTY_APP_ROUTE_SHEET_HOST_SURFACE_BODY_SNAPSHOT;

  private runtimeConfigSnapshot: BottomSheetSharedRuntimeConfigSnapshot =
    EMPTY_RUNTIME_CONFIG_SNAPSHOT;

  private frameSnapshot: SearchRouteSheetHostFrameSnapshot =
    EMPTY_APP_ROUTE_SHEET_HOST_FRAME_SNAPSHOT;

  private surfaceSnapshot: AppRouteSheetHostSurfaceSnapshot =
    EMPTY_APP_ROUTE_SHEET_HOST_SURFACE_SNAPSHOT;

  private fallbackRuntimeModel: BottomSheetRuntimeModel | null = null;

  private nativeRouteSheetFrameHostAuthority: AppRouteSheetHostSurfaceFrameAuthority | null = null;

  private unsubscribeRouteSheetFrameHost: (() => void) | null = null;

  private unregisterSheetMotionTarget: (() => void) | null = null;

  private registeredSheetRuntimeModel: SheetRuntimeModel | null = null;

  private currentSnap: OverlaySheetSnap = 'hidden';

  private initialVisibleSnapDispatchKey: string | null = null;

  private previousResolvedSurfaceInputForAttribution: AppRouteSheetHostResolvedSurfaceInput | null =
    null;

  private readonly nativeAdapterListeners = new Set<Listener>();

  private readonly runtimeConfigListeners = new Set<Listener>();

  private readonly runtimeConfigSharedValueTargets =
    new Set<BottomSheetSharedRuntimeConfigSharedValues>();

  private readonly nativeAdapterSharedValueTargets =
    new Set<AppRouteSheetFrameHostNativeSharedValues>();

  private readonly bodyListeners = new Set<Listener>();

  private readonly frameListeners = new Set<Listener>();

  private readonly surfaceListeners = new Set<Listener>();

  private readonly unsubscribers: Array<() => void> = [];

  private readonly motionCallbacksEntry: AppRouteSheetHostSurfaceBodySnapshot['motionCallbacksEntry'];

  public readonly nativeAdapterAuthority: AppRouteSheetHostAuthorityControllerRuntime['nativeAdapterAuthority'];

  public readonly routeSheetRuntimeConfigAuthority: AppRouteSheetHostRuntimeConfigAuthority;

  public readonly routeSheetSurfaceBodyAuthority: AppRouteSheetHostSurfaceBodyAuthority;

  public readonly routeSheetSurfaceFrameAuthority: AppRouteSheetHostSurfaceFrameAuthority;

  public readonly routeSheetSurfaceAuthority: AppRouteSheetHostSurfaceAuthority;

  constructor(private readonly input: AppRouteSheetHostAuthorityControllerInput) {
    this.motionCallbacksEntry = {
      onSnapStart: this.handleSheetSnapStart,
      onSnapChange: this.handleSheetSnapChange,
      onDragStateChange: this.handleDragStateChange,
      onSettleStateChange: this.handleSettleStateChange,
      onSnapSettleComplete: this.handleSnapSettleComplete,
    };
    this.nativeAdapterAuthority = {
      subscribe: (listener) => this.subscribeNativeAdapter(listener),
      getSnapshot: () => this.nativeAdapterSnapshot,
      registerSharedValues: (values) => this.registerNativeAdapterSharedValues(values),
    };
    this.routeSheetRuntimeConfigAuthority = {
      subscribe: (listener) => this.subscribeRuntimeConfig(listener),
      getSnapshot: () => this.runtimeConfigSnapshot,
      registerSharedValues: (values) => this.registerRuntimeConfigSharedValues(values),
    };
    this.routeSheetSurfaceBodyAuthority = {
      subscribe: (listener) => this.subscribeBody(listener),
      getSnapshot: () => this.bodySnapshot,
    };
    this.routeSheetSurfaceFrameAuthority = {
      subscribe: (listener) => this.subscribeFrame(listener),
      getSnapshot: () => this.frameSnapshot,
    };
    this.routeSheetSurfaceAuthority = {
      subscribe: (listener) => this.subscribeSurface(listener),
      getSnapshot: () => this.surfaceSnapshot,
    };
    this.nativeAdapterSnapshot = this.createNativeAdapterSnapshot();
    this.runtimeConfigSnapshot = this.createRuntimeConfigSnapshot();
    this.bodySnapshot = this.createBodySnapshot();
    this.surfaceSnapshot = this.createSurfaceSnapshot();
    this.previousResolvedSurfaceInputForAttribution = this.getResolvedSurfaceInput();
    this.unsubscribers.push(
      input.routeSceneFrameAuthority.subscribe(() => {
        this.recomputeAll(true, 'routeSceneFrameAuthority');
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
      input.routeSheetVisualAuthority.subscribe(() => {
        this.recomputeVisualSelection();
      })
    );
  }

  public setNativeRuntime({
    fallbackRuntimeModel,
    routeSheetFrameHostAuthority,
  }: AppRouteSheetHostNativeRuntimeInput): void {
    withSearchNavSwitchRuntimeAttribution('sheetHost', 'setNativeRuntime', () => {
      this.fallbackRuntimeModel = fallbackRuntimeModel;
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
      const bodyChanged = this.recomputeBody(false, resolvedSurfaceInput, false, false);
      this.syncSheetMotionTarget(resolvedSurfaceInput);
      this.syncInitialVisibleSnap(resolvedSurfaceInput);
      this.recomputeSurface(true);
      this.notifyBatchedSurfaceLaneListeners({
        bodyChanged,
        frameChanged,
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
    this.bodyListeners.clear();
    this.frameListeners.clear();
    this.surfaceListeners.clear();
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

  private getResolvedSurfaceInput(): AppRouteSheetHostResolvedSurfaceInput {
    const routeSceneFrameSnapshot = this.input.routeSceneFrameAuthority.getSnapshot();
    const routeOverlayNavigationSnapshot = this.input.routeOverlayNavigationAuthority.getSnapshot();
    const routeOverlaySheetPolicySnapshot =
      this.input.routeOverlaySheetPolicyAuthority.getSnapshot();
    const routeSheetVisualSnapshot = this.input.routeSheetVisualAuthority.getSnapshot();
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
    const sheetPresentationSceneKey = routeOverlayNavigationSnapshot.isPersistentPollLane
      ? 'polls'
      : activeSceneFrameEntry.sceneKey;
    const sheetPresentationFrameEntry = routeOverlayNavigationSnapshot.isPersistentPollLane
      ? this.input.routeSceneFrameAuthority.getSceneFrameEntry(sheetPresentationSceneKey) ??
        activeSceneFrameEntry
      : activeSceneFrameEntry;
    const sheetPresentationShellSpec =
      sheetPresentationFrameEntry.shellSpec ?? EMPTY_ROUTE_SHEET_SHELL_SPEC;
    const isRenderable =
      sheetPresentationFrameEntry.shellSpec != null &&
      overlaySheetPolicy != null &&
      presentationState != null;
    const visible = overlaySheetPolicy?.overlaySheetVisible ?? false;
    const activeOverlayRouteKey = overlayRouteScope.activeOverlayRouteKey;
    const rootOverlayKey = overlayRouteScope.rootOverlayKey;
    const activeSemanticOverlayKey =
      sheetPresentationShellSpec.semanticOverlayKey ??
      sheetPresentationShellSpec.overlayKey ??
      activeOverlayRouteKey;
    const resolvedShellIdentityKey =
      sheetPresentationShellSpec.shellIdentityKey ??
      sheetPresentationShellSpec.overlayKey ??
      activeOverlayRouteKey;
    const initialSnapPoint = sheetPresentationShellSpec.initialSnapPoint ?? 'middle';
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
    const resolvedRuntimeModel = canRenderSurface ? this.fallbackRuntimeModel : null;

    return {
      activeSceneKey: sheetPresentationFrameEntry.sceneKey,
      activeShellSpec: sheetPresentationShellSpec,
      activeRenderableShellSpec: canRenderSurface ? sheetPresentationShellSpec : null,
      activeSemanticOverlayKey,
      canRenderSurface,
      chromeVisualState,
      initialSheetY,
      isRenderable,
      overlayRouteScope,
      overlaySheetPolicy,
      presentationState,
      resolvedRuntimeModel,
      resolvedShellIdentityKey,
      rootOverlayKey,
      visible,
    };
  }

  private createNativeAdapterSnapshot(
    resolvedSurfaceInput = this.getResolvedSurfaceInput()
  ): AppRouteSheetHostNativeAdapterSnapshot {
    const {
      activeShellSpec,
      canRenderSurface,
      chromeVisualState,
      initialSheetY,
      overlaySheetPolicy,
      presentationState,
      resolvedRuntimeModel,
    } = resolvedSurfaceInput;

    return {
      presentationStateOverride: {
        sheetY: presentationState.sheetTranslateY ?? EMPTY_PRESENTATION_STATE.sheetTranslateY,
        scrollOffset:
          presentationState.resultsScrollOffset ?? EMPTY_PRESENTATION_STATE.resultsScrollOffset,
        momentumFlag: presentationState.resultsMomentum ?? EMPTY_PRESENTATION_STATE.resultsMomentum,
      },
      initialSheetY,
      frameHostInput: {
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
    const { activeSceneKey, activeShellSpec, canRenderSurface, resolvedRuntimeModel, visible } =
      resolvedSurfaceInput;

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
            dismissThreshold: activeShellSpec.dismissThreshold,
            preventSwipeDismiss: activeShellSpec.preventSwipeDismiss,
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
    const motionStateSnapshot =
      canRenderSurface && resolvedRuntimeModel != null
        ? {
            stateEntry: {
              visible,
              snapPoints: activeShellSpec.snapPoints,
              initialSnapPoint: activeShellSpec.initialSnapPoint ?? 'middle',
              sheetYValue: resolvedRuntimeModel.presentationState.sheetY,
              scrollOffsetValue: resolvedRuntimeModel.presentationState.scrollOffset,
              momentumFlag: resolvedRuntimeModel.presentationState.momentumFlag,
              motionCommandValue: resolvedRuntimeModel.snapController.motionCommand,
            },
          }
        : EMPTY_SEARCH_ROUTE_SHEET_MOTION_STATE_SNAPSHOT;

    return {
      activeSceneKey: canRenderSurface ? activeSceneKey : null,
      hasRenderableSheetSurface: canRenderSurface,
      chromeEntry: chromeSnapshot.chromeEntry ?? null,
      scrollSharedRuntimeEntry: scrollSharedRuntimeSnapshot.sharedRuntimeEntry ?? null,
      scrollBodyDefaultsEntry: scrollBodyDefaultsSnapshot.bodyDefaultsEntry ?? null,
      motionStateEntry: motionStateSnapshot.stateEntry ?? null,
      motionCallbacksEntry: this.motionCallbacksEntry,
    };
  }

  private createRuntimeConfigSnapshot(
    resolvedSurfaceInput = this.getResolvedSurfaceInput()
  ): BottomSheetSharedRuntimeConfigSnapshot {
    const { activeShellSpec, canRenderSurface, visible } = resolvedSurfaceInput;
    if (!canRenderSurface) {
      return EMPTY_RUNTIME_CONFIG_SNAPSHOT;
    }
    return {
      visible,
      listScrollEnabled: activeShellSpec.listScrollEnabled ?? true,
      snapPoints: activeShellSpec.snapPoints,
      initialSnapPoint: activeShellSpec.initialSnapPoint ?? 'middle',
      dismissThreshold: activeShellSpec.dismissThreshold,
      preventSwipeDismiss: activeShellSpec.preventSwipeDismiss ?? false,
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
        markSheetHostResolvedSurfaceInputDiffs(
          this.previousResolvedSurfaceInputForAttribution,
          resolvedSurfaceInput,
          source
        );
        this.previousResolvedSurfaceInputForAttribution = resolvedSurfaceInput;
        this.recomputeNativeAdapter(notify, resolvedSurfaceInput);
        const frameChanged = this.recomputeFrame(false, false, false);
        const runtimeConfigChanged = this.recomputeRuntimeConfig(false, resolvedSurfaceInput);
        const bodyChanged = this.recomputeBody(false, resolvedSurfaceInput, false, false);
        this.syncSheetMotionTarget(resolvedSurfaceInput);
        this.syncInitialVisibleSnap(resolvedSurfaceInput);
        this.recomputeSurface(notify);
        this.notifyBatchedSurfaceLaneListeners({
          bodyChanged,
          frameChanged,
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
      markSheetHostResolvedSurfaceInputDiffs(
        this.previousResolvedSurfaceInputForAttribution,
        resolvedSurfaceInput,
        'routeOverlaySheetPolicyAuthority'
      );
      this.previousResolvedSurfaceInputForAttribution = resolvedSurfaceInput;
      this.recomputeNativeAdapter(notify, resolvedSurfaceInput);
      const runtimeConfigChanged = this.recomputeRuntimeConfig(false, resolvedSurfaceInput);
      const bodyChanged = this.recomputeBody(false, resolvedSurfaceInput, false, false);
      this.syncSheetMotionTarget(resolvedSurfaceInput);
      this.syncInitialVisibleSnap(resolvedSurfaceInput);
      this.notifyBatchedSurfaceLaneListeners({
        bodyChanged,
        frameChanged: false,
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
      markSheetHostNativeAdapterDiffs(this.nativeAdapterSnapshot, nextSnapshot);
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
    return withSearchNavSwitchRuntimeAttribution('sheetHost', 'recomputeRuntimeConfig', () => {
      const nextSnapshot = this.createRuntimeConfigSnapshot(resolvedSurfaceInput);
      if (areRuntimeConfigSnapshotsEqual(this.runtimeConfigSnapshot, nextSnapshot)) {
        return false;
      }
      this.runtimeConfigSnapshot = nextSnapshot;
      if (this.runtimeConfigSharedValueTargets.size > 0) {
        withSearchNavSwitchRuntimeAttribution('sheetHost', 'syncRuntimeConfigSharedValues', () => {
          this.runtimeConfigSharedValueTargets.forEach((values) => {
            syncRuntimeConfigSharedValues(values, nextSnapshot);
          });
        });
      }
      if (notify && this.runtimeConfigListeners.size > 0) {
        withSearchNavSwitchRuntimeAttribution('sheetHost', 'notify:runtimeConfig', () => {
          this.runtimeConfigListeners.forEach((listener) => {
            listener();
          });
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
      markSheetHostBodySnapshotDiffs(this.bodySnapshot, nextSnapshot);
      this.bodySnapshot = nextSnapshot;
      if (notify && notifyBody) {
        withSearchNavSwitchRuntimeAttribution('sheetHost', 'notify:body', () => {
          this.bodyListeners.forEach((listener) => {
            listener();
          });
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
      markSheetHostFieldDiff(
        'frame.sheetClipStyle',
        this.frameSnapshot.sheetClipStyle,
        nextSnapshot.sheetClipStyle
      );
      this.frameSnapshot = nextSnapshot;
      if (notify && notifyFrame) {
        withSearchNavSwitchRuntimeAttribution('sheetHost', 'notify:frame', () => {
          this.frameListeners.forEach((listener) => {
            listener();
          });
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
    runtimeConfigChanged,
    notify,
  }: {
    bodyChanged: boolean;
    frameChanged: boolean;
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
      });
    }
    if (bodyChanged) {
      withSearchNavSwitchRuntimeAttribution('sheetHost', 'notifyBatched:body', () => {
        this.bodyListeners.forEach((listener) => {
          listener();
        });
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
      markSheetHostFieldDiff(
        'surface.shouldRenderSceneStackSurface',
        this.surfaceSnapshot.shouldRenderSceneStackSurface,
        nextSnapshot.shouldRenderSceneStackSurface
      );
      this.surfaceSnapshot = nextSnapshot;
      if (!notify) {
        return;
      }
      withSearchNavSwitchRuntimeAttribution('sheetHost', 'notify:surface', () => {
        this.surfaceListeners.forEach((listener) => {
          listener();
        });
      });
    });
  }

  private syncSheetMotionTarget(resolvedSurfaceInput = this.getResolvedSurfaceInput()): void {
    withSearchNavSwitchRuntimeAttribution('sheetHost', 'syncSheetMotionTarget', () => {
      const { resolvedRuntimeModel } = resolvedSurfaceInput;
      if (this.registeredSheetRuntimeModel === resolvedRuntimeModel) {
        return;
      }
      this.unregisterSheetMotionTarget?.();
      this.unregisterSheetMotionTarget = null;
      this.registeredSheetRuntimeModel = resolvedRuntimeModel;
      if (resolvedRuntimeModel == null) {
        return;
      }
      this.unregisterSheetMotionTarget =
        this.input.routeSceneMotionRuntime.registerSheetMotionTarget({
          sceneKey: 'searchRoute',
          motionCommandValue: resolvedRuntimeModel.snapController.motionCommand,
          resolveCurrentSnapTarget: this.resolveCurrentSnapTarget,
        });
    });
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
      const isDockedPollsSearchSurfaceActive = isDockedPollsSearchSurface(resolvedSurfaceInput);
      if (this.currentSnap !== 'hidden' && !isDockedPollsSearchSurfaceActive) {
        this.initialVisibleSnapDispatchKey = null;
        return;
      }
      const persistedSnap =
        !isDockedPollsSearchSurfaceActive && resolvedSnapPersistenceKey != null
          ? this.input.routeSheetSnapSessionActions.getPersistentSnap(resolvedSnapPersistenceKey)
          : null;
      const desiredSnap = persistedSnap ?? activeRenderableShellSpec.initialSnapPoint ?? 'middle';
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
      if (typeof desiredSheetY === 'number') {
        runOnUI(seedSheetYOnUI)(resolvedRuntimeModel.presentationState.sheetY, desiredSheetY);
      }

      if (resolvedSnapPersistenceKey != null && persistedSnap == null) {
        this.input.routeSheetSnapSessionActions.recordPersistentSnap({
          key: resolvedSnapPersistenceKey,
          snap: desiredSnap,
        });
      }
      this.input.routeSceneMotionRuntime.requestBootstrapSheetMotion('searchRoute', {
        snap: desiredSnap,
        token: null,
      });
    });
  }

  private readonly resolveCurrentSnapTarget = (): OverlaySheetSnap => {
    const resolvedSurfaceInput = this.getResolvedSurfaceInput();
    if (isDockedPollsSearchSurface(resolvedSurfaceInput)) {
      return resolvedSurfaceInput.activeRenderableShellSpec?.initialSnapPoint ?? 'collapsed';
    }
    const routeSheetSnapSessionSnapshot = this.input.routeSheetSnapSessionAuthority.getSnapshot();
    return routeSheetSnapSessionSnapshot.hasUserSharedSnap
      ? routeSheetSnapSessionSnapshot.sharedSnap
      : 'expanded';
  };

  private readonly handleDragStateChange = (isDragging: boolean): void => {
    this.getResolvedSurfaceInput().activeRenderableShellSpec?.onDragStateChange?.(isDragging);
  };

  private readonly handleHidden = (): void => {
    this.getResolvedSurfaceInput().activeRenderableShellSpec?.onHidden?.();
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
    this.getResolvedSurfaceInput().activeRenderableShellSpec?.onSettleStateChange?.(isSettling);
  };

  private readonly handleSnapSettleComplete = (settleToken: number): void => {
    this.input.routeSceneMotionRuntime.completeFromSheetSettle(settleToken);
  };

  private readonly handleSheetSnapStart = (
    snap: OverlaySheetSnap,
    meta?: { source: 'gesture' | 'programmatic' }
  ): void => {
    this.getResolvedSurfaceInput().activeRenderableShellSpec?.onSnapStart?.(snap, meta);
  };

  private readonly handleSheetSnapChange = (
    snap: OverlaySheetSnap,
    meta?: { source: 'gesture' | 'programmatic' }
  ): void => {
    this.currentSnap = snap;
    if (snap !== 'hidden') {
      this.initialVisibleSnapDispatchKey = null;
    }
    const resolvedSurfaceInput = this.getResolvedSurfaceInput();
    const {
      activeRenderableShellSpec,
      activeSemanticOverlayKey,
      resolvedRuntimeModel,
      rootOverlayKey,
    } = resolvedSurfaceInput;
    if (
      resolvedRuntimeModel != null &&
      'handleProgrammaticSnapEvent' in resolvedRuntimeModel.snapController
    ) {
      resolvedRuntimeModel.snapController.handleProgrammaticSnapEvent(
        snap,
        meta?.source ?? 'gesture'
      );
    }
    activeRenderableShellSpec?.onSnapChange?.(snap, meta);

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
}

export const createAppRouteSheetHostAuthorityController = (
  input: AppRouteSheetHostAuthorityControllerInput
): AppRouteSheetHostAuthorityControllerRuntime => new AppRouteSheetHostAuthorityController(input);
