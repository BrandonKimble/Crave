import { getAppOverlayRouteMetadata } from './app-overlay-route-types';
import { isResidencyManagedScene } from '../../overlays/shell-residency-registry';
import {
  getLiveTransitionTxn,
  subscribeTransitionTxn,
} from './transition-engine/transition-transaction';
import type { OverlayRouteEntry } from './app-overlay-route-types';
import {
  areSceneEntryMountUnitArraysEqual,
  isEntryKeyedMountSceneKey,
  resolveActiveEntryIdForScene,
  resolveMountedSceneEntryUnits,
  type SceneEntryMountUnit,
} from './app-route-scene-entry-mounts';
import type {
  SearchRouteSceneStackBodyContentEntry,
  SearchRouteSceneStackBodyTransportEntry,
  SearchRouteSceneStackChromeEntry,
  SearchRouteSceneStackFrameEntry,
} from '../../overlays/searchRouteSceneStackSheetContract';
import {
  areSearchRouteSceneStackBodyContentEntriesEqual,
  areSearchRouteSceneStackBodyTransportEntriesEqual,
  createSearchRouteSceneStackBodyContentEntry,
  createSearchRouteSceneStackBodyTransportEntry,
} from '../../overlays/searchRouteSceneStackSheetContract';
import type {
  AppRouteSceneBodyAdmissionPolicy,
  AppRouteSceneChromePublication,
} from './app-route-scene-descriptor-contract';
import { areAppRouteSceneBodyAdmissionPoliciesEqual } from './app-route-scene-descriptor-contract';
import {
  APP_ROUTE_SCENE_INPUT_KEYS,
  APP_ROUTE_STATIC_SCENE_INPUT_KEYS,
  isSceneBodyDataActivityKey,
  type AppRouteSceneInputAuthority,
  type AppRouteSceneInputKey,
  type AppRouteSceneInputSnapshot,
} from './app-route-scene-input-registry';
import {
  EMPTY_APP_ROUTE_SCENE_STACK_ACTIVE_CHROME_SNAPSHOT,
  EMPTY_APP_ROUTE_SCENE_STACK_BODY_SNAPSHOT,
  EMPTY_APP_ROUTE_SCENE_STACK_BODY_SURFACE_SNAPSHOT,
  EMPTY_APP_ROUTE_SCENE_STACK_CHROME_SURFACES_SNAPSHOT,
  EMPTY_APP_ROUTE_SCENE_STACK_MOUNTED_SCENES_SNAPSHOT,
  EMPTY_APP_ROUTE_SCENE_STACK_SCENE_ACTIVITY_SNAPSHOT,
  EMPTY_APP_ROUTE_SCENE_STACK_SCENE_PRESENTATION_SNAPSHOT,
  PERSISTENT_POLL_IDLE_SHEET_HEADER_RESTORATION_CONTRACT,
  type AppRouteSceneStackActiveChromeSnapshot,
  type AppRouteSceneStackBodySnapshot,
  type AppRouteSceneStackBodySurfaceAuthority,
  type AppRouteSceneStackBodySurfaceSnapshot,
  type AppRouteSceneStackChromeSurfacesSnapshot,
  type AppRouteSceneStackMountedScenesSnapshot,
  type AppRouteSceneStackSceneActivitySnapshot,
  type AppRouteSceneStackScenePresentationAuthority,
  type AppRouteSceneStackScenePresentationSnapshot,
  type AppRouteSceneStackSurfaceAuthority,
} from './app-route-scene-stack-surface-contract';
import type { OverlayKey } from '../../overlays/types';
import type { PresentationFrame } from './app-route-presentation-frame-contract';
import {
  markSearchNavSwitchRuntimeAttribution,
  withSearchNavSwitchRuntimeAttribution,
} from '../../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';
import {
  areSearchSurfaceVisualPoliciesEqual,
  getSearchSurfaceRuntime,
  selectSearchSurfaceRouteGraphPolicy,
  selectSearchSurfaceVisualPolicy,
} from '../../screens/Search/runtime/surface/search-surface-runtime';
import type { RouteSceneSwitchTransitionPhase } from './app-overlay-route-transition-contract';
import type {
  AppRouteSceneSwitchRuntime,
  RouteSceneSwitchSceneStackDispatchSnapshot,
} from './app-route-scene-switch-controller';
import { resolveRouteSceneSwitchSceneStackDispatchSnapshot } from './app-route-scene-switch-controller';
import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../perf/perf-scenario-runtime-store';

type Listener = () => void;

type AppRouteStaticSceneMountState = {
  bookmarksBootstrapped: boolean;
  pollsPrewarmed: boolean;
  profileBootstrapped: boolean;
  inactiveTabsPrewarmed: boolean;
};

type AppRouteStaticSceneMountSnapshot = {
  bookmarksShouldMount: boolean;
  pollsShouldMount: boolean;
  profileShouldMount: boolean;
};

export type AppRouteSceneFrameSnapshot = {
  activeSceneFrameEntry: SearchRouteSceneStackFrameEntry | null;
};

export const EMPTY_APP_ROUTE_SCENE_FRAME_SNAPSHOT: AppRouteSceneFrameSnapshot = {
  activeSceneFrameEntry: null,
};

export type AppRouteSceneStackLayerFrameAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => AppRouteSceneFrameSnapshot;
  getSceneFrameEntry: (
    sceneKey: OverlayKey | null | undefined
  ) => SearchRouteSceneStackFrameEntry | null;
};

export type AppRouteSceneStackRuntime = {
  sceneFrameAuthority: AppRouteSceneStackLayerFrameAuthority;
  sceneStackSurfaceAuthority: AppRouteSceneStackSurfaceAuthority;
  dispose: () => void;
};

const APP_ROUTE_SCENE_STACK_KEYS = APP_ROUTE_SCENE_INPUT_KEYS;

type AppRouteSceneStackKey = AppRouteSceneInputKey;

const SCENE_DATA_LANE_QUIET_DELAY_MS = 350;

// W1 slice 1 — stable fallback states for getSceneEntryMountState (reference-stable so the
// body-surface equality stays cheap).
const EMPTY_SCENE_ENTRY_MOUNT_STATE: {
  units: readonly SceneEntryMountUnit[];
  activeEntryId: string | null;
} = { units: [], activeEntryId: null };
const NULL_SCENE_ENTRY_MOUNT_STATE: {
  units: readonly SceneEntryMountUnit[] | null;
  activeEntryId: string | null;
} = { units: null, activeEntryId: null };

type SceneStackControllerSceneEntry = {
  sceneKey: OverlayKey;
  frameEntry: SearchRouteSceneStackFrameEntry | null;
  chromeEntry: SearchRouteSceneStackChromeEntry | null;
  contentEntry: SearchRouteSceneStackBodyContentEntry | null;
  transportEntry: SearchRouteSceneStackBodyTransportEntry | null;
  bodyAdmissionPolicy: AppRouteSceneBodyAdmissionPolicy | null;
};

type SceneStackControllerSnapshot = {
  activeSceneKey: OverlayKey | null;
  interactiveSceneKey: OverlayKey | null;
  handoffSceneKey: OverlayKey | null;
  transitionPhase: RouteSceneSwitchTransitionPhase;
  isInteractive: boolean;
  mountedSceneKeys: readonly OverlayKey[];
  activeSceneFrameEntry: SearchRouteSceneStackFrameEntry | null;
  activeSceneChromeEntry: SearchRouteSceneStackChromeEntry | null;
  sceneEntryByKey: Readonly<Partial<Record<OverlayKey, SceneStackControllerSceneEntry | null>>>;
};

const EMPTY_SCENE_STACK_CONTROLLER_SNAPSHOT: SceneStackControllerSnapshot = {
  activeSceneKey: null,
  interactiveSceneKey: null,
  handoffSceneKey: null,
  transitionPhase: 'idle',
  isInteractive: true,
  mountedSceneKeys: [],
  activeSceneFrameEntry: null,
  activeSceneChromeEntry: null,
  sceneEntryByKey: {},
};

const areOverlayKeyArraysEqual = (
  left: readonly OverlayKey[],
  right: readonly OverlayKey[]
): boolean =>
  left.length === right.length && left.every((sceneKey, index) => sceneKey === right[index]);

const createAppRouteStaticSceneMountState = (): AppRouteStaticSceneMountState => ({
  bookmarksBootstrapped: false,
  pollsPrewarmed: false,
  profileBootstrapped: false,
  inactiveTabsPrewarmed: false,
});

const resolveAppRouteStaticSceneMount = ({
  state,
  activeSceneKey,
  transitionPhase,
  areStaticTabScenesReady,
  isPollsSceneReady,
}: {
  state: AppRouteStaticSceneMountState;
  activeSceneKey: OverlayKey | null;
  transitionPhase: RouteSceneSwitchTransitionPhase;
  areStaticTabScenesReady: boolean;
  isPollsSceneReady: boolean;
}): {
  state: AppRouteStaticSceneMountState;
  snapshot: AppRouteStaticSceneMountSnapshot;
} => {
  let nextState = state;

  if (activeSceneKey === 'bookmarks' && !nextState.bookmarksBootstrapped) {
    nextState = {
      ...nextState,
      bookmarksBootstrapped: true,
    };
  }

  if (!nextState.pollsPrewarmed && isPollsSceneReady && transitionPhase === 'idle') {
    nextState = {
      ...nextState,
      pollsPrewarmed: true,
    };
  }

  if (activeSceneKey === 'profile' && !nextState.profileBootstrapped) {
    nextState = {
      ...nextState,
      profileBootstrapped: true,
    };
  }

  if (!nextState.inactiveTabsPrewarmed && areStaticTabScenesReady && transitionPhase === 'idle') {
    nextState = {
      ...nextState,
      bookmarksBootstrapped: true,
      profileBootstrapped: true,
      inactiveTabsPrewarmed: true,
    };
  }

  return {
    state: nextState,
    snapshot: {
      bookmarksShouldMount: nextState.bookmarksBootstrapped || activeSceneKey === 'bookmarks',
      pollsShouldMount: nextState.pollsPrewarmed || activeSceneKey === 'polls',
      profileShouldMount: nextState.profileBootstrapped || activeSceneKey === 'profile',
    },
  };
};

const isAppRouteSceneStackKey = (
  sceneKey: string | null | undefined
): sceneKey is AppRouteSceneStackKey =>
  sceneKey != null && (APP_ROUTE_SCENE_STACK_KEYS as readonly string[]).includes(sceneKey);

const areMountedChromeSurfacesEqual = (
  left: SearchRouteSceneStackChromeEntry['excludedSurfaces'],
  right: SearchRouteSceneStackChromeEntry['excludedSurfaces']
): boolean => {
  if (left === right) {
    return true;
  }
  if ((left?.length ?? 0) !== (right?.length ?? 0)) {
    return false;
  }
  if (!left || !right) {
    return true;
  }
  return left.every((surface, index) => surface === right[index]);
};

const areChromeEntriesEqual = (
  left: SearchRouteSceneStackChromeEntry | null,
  right: SearchRouteSceneStackChromeEntry | null
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.sceneKey === right.sceneKey &&
    left.surfaceKind === right.surfaceKind &&
    left.mountedChromeKey === right.mountedChromeKey &&
    areMountedChromeSurfacesEqual(left.excludedSurfaces, right.excludedSurfaces) &&
    left.underlayComponent === right.underlayComponent &&
    left.backgroundComponent === right.backgroundComponent &&
    left.headerComponent === right.headerComponent &&
    left.overlayComponent === right.overlayComponent);

const areFrameEntriesIdentical = (
  left: SearchRouteSceneStackFrameEntry | null,
  right: SearchRouteSceneStackFrameEntry | null
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.sceneKey === right.sceneKey &&
    left.shellSpec === right.shellSpec);

const areFrameEntryNativeFrameFieldsEqual = (
  left: SearchRouteSceneStackFrameEntry | null,
  right: SearchRouteSceneStackFrameEntry | null
): boolean => {
  if (left === right) {
    return true;
  }
  const leftShellSpec = left?.shellSpec ?? null;
  const rightShellSpec = right?.shellSpec ?? null;
  if (leftShellSpec == null || rightShellSpec == null) {
    return leftShellSpec == null && rightShellSpec == null;
  }

  return (
    leftShellSpec.surfaceKind === rightShellSpec.surfaceKind &&
    leftShellSpec.snapPoints.expanded === rightShellSpec.snapPoints.expanded &&
    leftShellSpec.snapPoints.middle === rightShellSpec.snapPoints.middle &&
    leftShellSpec.snapPoints.collapsed === rightShellSpec.snapPoints.collapsed &&
    leftShellSpec.snapPoints.hidden === rightShellSpec.snapPoints.hidden
  );
};

const markSceneStackDiff = (operation: string): void => {
  markSearchNavSwitchRuntimeAttribution('sceneStackDiff', operation);
};

const markSceneStackFieldDiff = (field: string, left: unknown, right: unknown): void => {
  if (!Object.is(left, right)) {
    markSceneStackDiff(`field:${field}`);
  }
};

const markSceneStackArrayDiff = (
  field: string,
  left: readonly unknown[],
  right: readonly unknown[]
): void => {
  if (
    left.length !== right.length ||
    left.some((value, index) => !Object.is(value, right[index]))
  ) {
    markSceneStackDiff(`field:${field}`);
  }
};

const markSceneStackFrameEntryDiffs = (
  left: SearchRouteSceneStackFrameEntry | null,
  right: SearchRouteSceneStackFrameEntry | null,
  prefix: string
): void => {
  markSceneStackFieldDiff(`${prefix}:sceneKey`, left?.sceneKey ?? null, right?.sceneKey ?? null);
  markSceneStackFieldDiff(
    `${prefix}:shellSpecRef`,
    left?.shellSpec ?? null,
    right?.shellSpec ?? null
  );

  const leftShellSpec = left?.shellSpec ?? null;
  const rightShellSpec = right?.shellSpec ?? null;
  if (leftShellSpec == null && rightShellSpec == null) {
    return;
  }

  markSceneStackFieldDiff(
    `${prefix}:shellSpec.overlayKey`,
    leftShellSpec?.overlayKey ?? null,
    rightShellSpec?.overlayKey ?? null
  );
  markSceneStackFieldDiff(
    `${prefix}:shellSpec.semanticOverlayKey`,
    leftShellSpec?.semanticOverlayKey ?? null,
    rightShellSpec?.semanticOverlayKey ?? null
  );
  markSceneStackFieldDiff(
    `${prefix}:shellSpec.shellIdentityKey`,
    leftShellSpec?.shellIdentityKey ?? null,
    rightShellSpec?.shellIdentityKey ?? null
  );
  markSceneStackFieldDiff(
    `${prefix}:shellSpec.sceneIdentityKey`,
    leftShellSpec?.sceneIdentityKey ?? null,
    rightShellSpec?.sceneIdentityKey ?? null
  );
  markSceneStackFieldDiff(
    `${prefix}:shellSpec.surfaceKind`,
    leftShellSpec?.surfaceKind ?? null,
    rightShellSpec?.surfaceKind ?? null
  );
  markSceneStackFieldDiff(
    `${prefix}:shellSpec.snapPoints.expanded`,
    leftShellSpec?.snapPoints.expanded ?? null,
    rightShellSpec?.snapPoints.expanded ?? null
  );
  markSceneStackFieldDiff(
    `${prefix}:shellSpec.snapPoints.middle`,
    leftShellSpec?.snapPoints.middle ?? null,
    rightShellSpec?.snapPoints.middle ?? null
  );
  markSceneStackFieldDiff(
    `${prefix}:shellSpec.snapPoints.collapsed`,
    leftShellSpec?.snapPoints.collapsed ?? null,
    rightShellSpec?.snapPoints.collapsed ?? null
  );
  markSceneStackFieldDiff(
    `${prefix}:shellSpec.snapPoints.hidden`,
    leftShellSpec?.snapPoints.hidden ?? null,
    rightShellSpec?.snapPoints.hidden ?? null
  );
  markSceneStackFieldDiff(
    `${prefix}:shellSpec.headerComponent`,
    leftShellSpec?.headerComponent ?? null,
    rightShellSpec?.headerComponent ?? null
  );
  markSceneStackFieldDiff(
    `${prefix}:shellSpec.backgroundComponent`,
    leftShellSpec?.backgroundComponent ?? null,
    rightShellSpec?.backgroundComponent ?? null
  );
  markSceneStackFieldDiff(
    `${prefix}:shellSpec.overlayComponent`,
    leftShellSpec?.overlayComponent ?? null,
    rightShellSpec?.overlayComponent ?? null
  );
  markSceneStackFieldDiff(
    `${prefix}:shellSpec.flashListProps`,
    leftShellSpec?.flashListProps ?? null,
    rightShellSpec?.flashListProps ?? null
  );
  markSceneStackFieldDiff(
    `${prefix}:shellSpec.style`,
    leftShellSpec?.style ?? null,
    rightShellSpec?.style ?? null
  );
  markSceneStackFieldDiff(
    `${prefix}:shellSpec.contentContainerStyle`,
    leftShellSpec?.contentContainerStyle ?? null,
    rightShellSpec?.contentContainerStyle ?? null
  );
  markSceneStackFieldDiff(
    `${prefix}:shellSpec.listScrollEnabled`,
    leftShellSpec?.listScrollEnabled ?? null,
    rightShellSpec?.listScrollEnabled ?? null
  );
  markSceneStackFieldDiff(
    `${prefix}:shellSpec.interactionEnabled`,
    leftShellSpec?.interactionEnabled ?? null,
    rightShellSpec?.interactionEnabled ?? null
  );
  markSceneStackFieldDiff(
    `${prefix}:shellSpec.testID`,
    leftShellSpec?.testID ?? null,
    rightShellSpec?.testID ?? null
  );
};

const markSceneStackChromeEntryDiffs = (
  left: SearchRouteSceneStackChromeEntry | null,
  right: SearchRouteSceneStackChromeEntry | null,
  prefix: string
): void => {
  markSceneStackFieldDiff(`${prefix}:sceneKey`, left?.sceneKey ?? null, right?.sceneKey ?? null);
  markSceneStackFieldDiff(
    `${prefix}:surfaceKind`,
    left?.surfaceKind ?? null,
    right?.surfaceKind ?? null
  );
  markSceneStackFieldDiff(
    `${prefix}:mountedChromeKey`,
    left?.mountedChromeKey ?? null,
    right?.mountedChromeKey ?? null
  );
  markSceneStackFieldDiff(
    `${prefix}:excludedSurfaces`,
    left?.excludedSurfaces?.join(',') ?? null,
    right?.excludedSurfaces?.join(',') ?? null
  );
  markSceneStackFieldDiff(
    `${prefix}:underlayComponent`,
    left?.underlayComponent ?? null,
    right?.underlayComponent ?? null
  );
  markSceneStackFieldDiff(
    `${prefix}:backgroundComponent`,
    left?.backgroundComponent ?? null,
    right?.backgroundComponent ?? null
  );
  markSceneStackFieldDiff(
    `${prefix}:headerComponent`,
    left?.headerComponent ?? null,
    right?.headerComponent ?? null
  );
  markSceneStackFieldDiff(
    `${prefix}:overlayComponent`,
    left?.overlayComponent ?? null,
    right?.overlayComponent ?? null
  );
};

const areLayerSceneEntriesEqual = (
  left: SceneStackControllerSceneEntry | null | undefined,
  right: SceneStackControllerSceneEntry | null | undefined
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.sceneKey === right.sceneKey &&
    areFrameEntriesIdentical(left.frameEntry, right.frameEntry) &&
    areChromeEntriesEqual(left.chromeEntry, right.chromeEntry) &&
    areSearchRouteSceneStackBodyContentEntriesEqual(left.contentEntry, right.contentEntry) &&
    areSearchRouteSceneStackBodyTransportEntriesEqual(left.transportEntry, right.transportEntry) &&
    areAppRouteSceneBodyAdmissionPoliciesEqual(
      left.bodyAdmissionPolicy,
      right.bodyAdmissionPolicy
    ));

const areLayerSceneEntryMapsEqual = (
  sceneKeys: readonly OverlayKey[],
  left: SceneStackControllerSnapshot['sceneEntryByKey'],
  right: SceneStackControllerSnapshot['sceneEntryByKey']
): boolean =>
  sceneKeys.every((sceneKey) => areLayerSceneEntriesEqual(left[sceneKey], right[sceneKey]));

const areLayerSnapshotsEqual = (
  left: SceneStackControllerSnapshot,
  right: SceneStackControllerSnapshot
): boolean =>
  left.activeSceneKey === right.activeSceneKey &&
  left.interactiveSceneKey === right.interactiveSceneKey &&
  left.handoffSceneKey === right.handoffSceneKey &&
  left.transitionPhase === right.transitionPhase &&
  left.isInteractive === right.isInteractive &&
  areOverlayKeyArraysEqual(left.mountedSceneKeys, right.mountedSceneKeys) &&
  areFrameEntriesIdentical(left.activeSceneFrameEntry, right.activeSceneFrameEntry) &&
  areChromeEntriesEqual(left.activeSceneChromeEntry, right.activeSceneChromeEntry) &&
  areLayerSceneEntryMapsEqual(right.mountedSceneKeys, left.sceneEntryByKey, right.sceneEntryByKey);

const createChromeEntry = ({
  sceneKey,
  sceneChrome,
}: {
  sceneKey: OverlayKey | null;
  sceneChrome: AppRouteSceneChromePublication | null;
}): SearchRouteSceneStackChromeEntry | null => {
  if (sceneKey == null) {
    return null;
  }

  if (sceneChrome?.surfaceKind === 'mounted') {
    return {
      sceneKey,
      surfaceKind: 'mounted',
      mountedChromeKey: sceneChrome.mountedChromeKey,
      excludedSurfaces: sceneChrome.excludedSurfaces,
      underlayComponent: null,
      backgroundComponent: null,
      headerComponent: null,
      overlayComponent: null,
    };
  }

  return {
    sceneKey,
    surfaceKind: 'inline',
    mountedChromeKey: null,
    excludedSurfaces: undefined,
    underlayComponent: sceneChrome?.underlayComponent ?? null,
    backgroundComponent: sceneChrome?.backgroundComponent ?? null,
    headerComponent: sceneChrome?.headerComponent ?? null,
    overlayComponent: sceneChrome?.overlayComponent ?? null,
  };
};

const createFrameEntry = (
  sceneEntry: AppRouteSceneInputSnapshot | null
): SearchRouteSceneStackFrameEntry | null => {
  if (sceneEntry == null || sceneEntry.shellSpec == null) {
    return null;
  }

  return {
    sceneKey: sceneEntry.sceneKey,
    shellSpec: sceneEntry.shellSpec,
  };
};

const createLayerSceneEntry = (
  sceneEntry: AppRouteSceneInputSnapshot | null
): SceneStackControllerSceneEntry | null => {
  if (sceneEntry == null) {
    return null;
  }

  return {
    sceneKey: sceneEntry.sceneKey,
    frameEntry: createFrameEntry(sceneEntry),
    chromeEntry: createChromeEntry({
      sceneKey: sceneEntry.sceneKey,
      sceneChrome: sceneEntry.sceneChrome,
    }),
    contentEntry: createSearchRouteSceneStackBodyContentEntry({
      sceneKey: sceneEntry.sceneKey,
      bodyContentSpec: sceneEntry.sceneBodyContent,
    }),
    transportEntry: createSearchRouteSceneStackBodyTransportEntry({
      sceneKey: sceneEntry.sceneKey,
      bodyTransportSpec: sceneEntry.sceneBodyTransport,
    }),
    bodyAdmissionPolicy: sceneEntry.sceneBodyAdmissionPolicy,
  };
};

const createStableLayerSceneEntry = ({
  previousEntry,
  sceneEntry,
}: {
  previousEntry: SceneStackControllerSceneEntry | null | undefined;
  sceneEntry: AppRouteSceneInputSnapshot | null;
}): SceneStackControllerSceneEntry | null => {
  const nextEntry = createLayerSceneEntry(sceneEntry);
  return areLayerSceneEntriesEqual(previousEntry, nextEntry) ? (previousEntry ?? null) : nextEntry;
};

const createStableLayerSceneEntryWithChrome = ({
  previousEntry,
  sceneEntry,
}: {
  previousEntry: SceneStackControllerSceneEntry | null | undefined;
  sceneEntry: AppRouteSceneInputSnapshot | null;
}): SceneStackControllerSceneEntry | null => {
  if (sceneEntry == null) {
    return null;
  }

  const nextEntry: SceneStackControllerSceneEntry = {
    sceneKey: sceneEntry.sceneKey,
    frameEntry: createFrameEntry(sceneEntry),
    chromeEntry: createChromeEntry({
      sceneKey: sceneEntry.sceneKey,
      sceneChrome: sceneEntry.sceneChrome,
    }),
    contentEntry:
      previousEntry?.contentEntry ??
      createSearchRouteSceneStackBodyContentEntry({
        sceneKey: sceneEntry.sceneKey,
        bodyContentSpec: sceneEntry.sceneBodyContent,
      }),
    transportEntry:
      previousEntry?.transportEntry ??
      createSearchRouteSceneStackBodyTransportEntry({
        sceneKey: sceneEntry.sceneKey,
        bodyTransportSpec: sceneEntry.sceneBodyTransport,
      }),
    bodyAdmissionPolicy: sceneEntry.sceneBodyAdmissionPolicy,
  };

  return areLayerSceneEntriesEqual(previousEntry, nextEntry) ? (previousEntry ?? null) : nextEntry;
};

const createStableLayerSceneEntryWithBody = ({
  previousEntry,
  sceneEntry,
}: {
  previousEntry: SceneStackControllerSceneEntry | null | undefined;
  sceneEntry: AppRouteSceneInputSnapshot | null;
}): SceneStackControllerSceneEntry | null => {
  if (sceneEntry == null) {
    return null;
  }

  const nextEntry: SceneStackControllerSceneEntry = {
    sceneKey: sceneEntry.sceneKey,
    frameEntry: createFrameEntry(sceneEntry),
    chromeEntry:
      previousEntry?.chromeEntry ??
      createChromeEntry({
        sceneKey: sceneEntry.sceneKey,
        sceneChrome: sceneEntry.sceneChrome,
      }),
    contentEntry: createSearchRouteSceneStackBodyContentEntry({
      sceneKey: sceneEntry.sceneKey,
      bodyContentSpec: sceneEntry.sceneBodyContent,
    }),
    transportEntry: createSearchRouteSceneStackBodyTransportEntry({
      sceneKey: sceneEntry.sceneKey,
      bodyTransportSpec: sceneEntry.sceneBodyTransport,
    }),
    bodyAdmissionPolicy: sceneEntry.sceneBodyAdmissionPolicy,
  };

  return areLayerSceneEntriesEqual(previousEntry, nextEntry) ? (previousEntry ?? null) : nextEntry;
};

const shouldDeferSceneBodyInputPublication = ({
  activeSceneKey,
  sceneKey,
  sceneEntry,
  transitionPhase,
  previousSceneEntry,
}: {
  activeSceneKey: OverlayKey | null;
  sceneKey: AppRouteSceneStackKey;
  sceneEntry: AppRouteSceneInputSnapshot | null;
  transitionPhase: RouteSceneSwitchTransitionPhase;
  previousSceneEntry?: SceneStackControllerSceneEntry | null;
}): boolean => {
  if (sceneEntry?.sceneBodyContent == null) {
    return false;
  }
  const bodyAdmissionPolicy = sceneEntry.sceneBodyAdmissionPolicy;

  if (activeSceneKey !== sceneKey) {
    return (
      sceneEntry.sceneBodyContent.surfaceKind === 'list' &&
      shouldRetainSceneListBody(bodyAdmissionPolicy)
    );
  }

  return (
    transitionPhase !== 'idle' &&
    previousSceneEntry?.contentEntry != null &&
    (shouldRetainSceneListBody(bodyAdmissionPolicy) ||
      shouldRetainMountedSceneBody(bodyAdmissionPolicy))
  );
};

const shouldRetainSceneListBody = (
  bodyAdmissionPolicy: AppRouteSceneBodyAdmissionPolicy | null | undefined
): boolean => bodyAdmissionPolicy?.retainListBodyDuringTransition === true;

const shouldRetainMountedSceneBody = (
  bodyAdmissionPolicy: AppRouteSceneBodyAdmissionPolicy | null | undefined
): boolean => bodyAdmissionPolicy?.retainMountedBodyDuringTransition === true;

const shouldPrewarmRetainedMountedSceneBody = (
  bodyAdmissionPolicy: AppRouteSceneBodyAdmissionPolicy | null | undefined
): boolean => bodyAdmissionPolicy?.prewarmRetainedMountedBody === true;

const shouldDelaySceneDataLane = (
  bodyAdmissionPolicy: AppRouteSceneBodyAdmissionPolicy | null | undefined
): boolean => bodyAdmissionPolicy?.delayFirstDataAdmission === true;

const shouldDelaySceneDataLaneOnActivation = (
  bodyAdmissionPolicy: AppRouteSceneBodyAdmissionPolicy | null | undefined
): boolean => bodyAdmissionPolicy?.delayDataAdmissionOnActivation === true;

const resolveSceneDataLaneAdmissionDelayMs = (
  bodyAdmissionPolicy: AppRouteSceneBodyAdmissionPolicy | null | undefined
): number => bodyAdmissionPolicy?.dataAdmissionDelayMs ?? SCENE_DATA_LANE_QUIET_DELAY_MS;

const shouldPrewarmSearchDismissPollDataLane = ({
  bodyAdmissionPolicy,
  isMounted,
  sceneKey,
}: {
  bodyAdmissionPolicy: AppRouteSceneBodyAdmissionPolicy | null | undefined;
  isMounted: boolean;
  sceneKey: OverlayKey;
}): boolean => {
  if (sceneKey !== 'polls' || !isMounted || !shouldRetainMountedSceneBody(bodyAdmissionPolicy)) {
    return false;
  }
  const searchSurfaceSnapshot = getSearchSurfaceRuntime().getSnapshot();
  const surfaceVisualPolicy = selectSearchSurfaceVisualPolicy(searchSurfaceSnapshot);
  return (
    searchSurfaceSnapshot.activeBundle.kind === 'results' &&
    searchSurfaceSnapshot.dismissTransaction != null &&
    surfaceVisualPolicy.phase === 'results_dismissing' &&
    !surfaceVisualPolicy.canReleasePersistentPolls
  );
};

const shouldSyncSearchDismissPollDataPrewarmScene = (
  mountedSceneKeys: readonly OverlayKey[]
): boolean => {
  if (!mountedSceneKeys.includes('polls')) {
    return false;
  }
  const searchSurfaceSnapshot = getSearchSurfaceRuntime().getSnapshot();
  const surfaceVisualPolicy = selectSearchSurfaceVisualPolicy(searchSurfaceSnapshot);
  return (
    searchSurfaceSnapshot.activeBundle.kind === 'results' &&
    searchSurfaceSnapshot.dismissTransaction != null &&
    surfaceVisualPolicy.phase === 'results_dismissing' &&
    !surfaceVisualPolicy.canReleasePersistentPolls
  );
};

const shouldRetainSceneBodySnapshotDuringTransition = ({
  transitionPhase,
  previousSceneEntry,
}: {
  transitionPhase: RouteSceneSwitchTransitionPhase;
  previousSceneEntry: SceneStackControllerSceneEntry | null | undefined;
}): boolean =>
  transitionPhase !== 'idle' &&
  previousSceneEntry?.contentEntry != null &&
  previousSceneEntry.transportEntry != null &&
  (shouldRetainSceneListBody(previousSceneEntry.bodyAdmissionPolicy) ||
    shouldRetainMountedSceneBody(previousSceneEntry.bodyAdmissionPolicy));

const appendRouteSceneKey = ({
  mountedSceneKeys,
  sceneKey,
}: {
  mountedSceneKeys: Set<AppRouteSceneStackKey>;
  sceneKey: OverlayKey | null | undefined;
}): void => {
  if (isAppRouteSceneStackKey(sceneKey)) {
    mountedSceneKeys.add(sceneKey);
  }
};

const appendActivitySceneKey = ({
  sceneKeys,
  sceneKey,
}: {
  sceneKeys: Set<OverlayKey>;
  sceneKey: OverlayKey | null | undefined;
}): void => {
  if (sceneKey != null) {
    sceneKeys.add(sceneKey);
  }
};

const orderMountedSceneKeys = (
  sceneKeys: ReadonlySet<AppRouteSceneStackKey>
): readonly OverlayKey[] =>
  APP_ROUTE_SCENE_STACK_KEYS.filter((sceneKey) => sceneKeys.has(sceneKey));

const areStaticTabSceneInputsReady = (sceneInputAuthority: AppRouteSceneInputAuthority): boolean =>
  sceneInputAuthority.getSceneInputSnapshot('bookmarks')?.shellSpec != null &&
  sceneInputAuthority.getSceneInputSnapshot('profile')?.shellSpec != null;

const isPollsSceneInputReady = (sceneInputAuthority: AppRouteSceneInputAuthority): boolean =>
  sceneInputAuthority.getSceneInputSnapshot('polls')?.shellSpec != null;

// S-B slice 3a — child-leg LIFECYCLE (plans/s-b-entries-as-values.md design note): a child
// leg's lifetime is its entry's lifetime in the route stack (+ the transition window while it
// is still the active/presented/pending/handoff leg). Root scenes keep the accumulate-forever
// warm-leg behavior (tab-switch perf); popped children UNMOUNT and their per-key state clears
// (resolveSceneEntryByKey already deletes evicted keys). Re-opening after a pop is a NEW entry
// ⇒ a fresh seeded leg, never the previous instance's warm content.
const resolveMountedSceneKeys = ({
  previousMountedSceneKeys,
  activeSceneKey,
  sheetPresentationSceneKey,
  pendingSceneKey,
  handoffSceneKey,
  staticSceneMountSnapshot,
  routeStackSceneKeys,
}: {
  previousMountedSceneKeys: ReadonlySet<AppRouteSceneStackKey>;
  activeSceneKey: OverlayKey | null;
  sheetPresentationSceneKey: OverlayKey | null;
  pendingSceneKey: OverlayKey | null;
  handoffSceneKey: OverlayKey | null;
  staticSceneMountSnapshot: AppRouteStaticSceneMountSnapshot;
  routeStackSceneKeys: ReadonlySet<OverlayKey>;
}): ReadonlySet<AppRouteSceneStackKey> => {
  const transitionReferencedSceneKeys = new Set(
    [activeSceneKey, sheetPresentationSceneKey, pendingSceneKey, handoffSceneKey].filter(
      (sceneKey): sceneKey is OverlayKey => sceneKey != null
    )
  );
  const mountedSceneKeys = new Set(
    [...previousMountedSceneKeys].filter(
      (sceneKey) =>
        getAppOverlayRouteMetadata(sceneKey).role !== 'child' ||
        routeStackSceneKeys.has(sceneKey) ||
        transitionReferencedSceneKeys.has(sceneKey)
    )
  );
  appendRouteSceneKey({ mountedSceneKeys, sceneKey: activeSceneKey });
  appendRouteSceneKey({ mountedSceneKeys, sceneKey: sheetPresentationSceneKey });
  appendRouteSceneKey({ mountedSceneKeys, sceneKey: pendingSceneKey });
  appendRouteSceneKey({ mountedSceneKeys, sceneKey: handoffSceneKey });

  if (staticSceneMountSnapshot.bookmarksShouldMount) {
    mountedSceneKeys.add('bookmarks');
  }

  if (staticSceneMountSnapshot.pollsShouldMount) {
    mountedSceneKeys.add('polls');
  }

  if (staticSceneMountSnapshot.profileShouldMount) {
    mountedSceneKeys.add('profile');
  }

  return mountedSceneKeys;
};

// PF REWIRE (page-switch-master-plan.md §9.2 site 2): the old resolveSheetPresentationSceneKey /
// resolveTransitionSheetPresentationSceneKey re-derivations are DELETED. The presented scene is
// frame.presentedSceneKey and the held leg during a switch is frame.outgoingSceneKey — both read
// from the controller-minted PresentationFrame (the single writer), never re-derived here.

const resolveSceneEntryByKey = ({
  mountedSceneKeys,
  previousMountedSceneKeys,
  previousSceneEntryByKey,
  bodyRefreshSceneKeys,
  sceneInputAuthority,
}: {
  mountedSceneKeys: readonly OverlayKey[];
  previousMountedSceneKeys: readonly OverlayKey[];
  previousSceneEntryByKey: SceneStackControllerSnapshot['sceneEntryByKey'];
  bodyRefreshSceneKeys: ReadonlySet<OverlayKey>;
  sceneInputAuthority: AppRouteSceneInputAuthority;
}): SceneStackControllerSnapshot['sceneEntryByKey'] => {
  const sceneEntryByKey: Partial<Record<OverlayKey, SceneStackControllerSceneEntry | null>> = {
    ...previousSceneEntryByKey,
  };
  const mountedSceneKeySet = new Set(mountedSceneKeys);

  mountedSceneKeys.forEach((sceneKey) => {
    if (sceneEntryByKey[sceneKey] !== undefined && !bodyRefreshSceneKeys.has(sceneKey)) {
      return;
    }
    const previousEntry = previousSceneEntryByKey[sceneKey];
    const sourceSceneEntry = sceneInputAuthority.getSceneInputSnapshot(sceneKey);
    sceneEntryByKey[sceneKey] =
      previousEntry != null && bodyRefreshSceneKeys.has(sceneKey)
        ? createStableLayerSceneEntryWithBody({
            previousEntry,
            sceneEntry: sourceSceneEntry,
          })
        : createStableLayerSceneEntry({
            previousEntry,
            sceneEntry: sourceSceneEntry,
          });
  });

  previousMountedSceneKeys.forEach((sceneKey) => {
    if (!mountedSceneKeySet.has(sceneKey)) {
      delete sceneEntryByKey[sceneKey];
    }
  });

  return sceneEntryByKey;
};

class AppRouteSceneStackLayerStateController {
  private snapshot: SceneStackControllerSnapshot = EMPTY_SCENE_STACK_CONTROLLER_SNAPSHOT;

  private mountedScenesSnapshot: AppRouteSceneStackMountedScenesSnapshot =
    EMPTY_APP_ROUTE_SCENE_STACK_MOUNTED_SCENES_SNAPSHOT;

  private activeChromeSnapshot: AppRouteSceneStackActiveChromeSnapshot =
    EMPTY_APP_ROUTE_SCENE_STACK_ACTIVE_CHROME_SNAPSHOT;

  private activeSceneFrameSnapshot: AppRouteSceneFrameSnapshot =
    EMPTY_APP_ROUTE_SCENE_FRAME_SNAPSHOT;

  private mountedSceneKeys = new Set<AppRouteSceneStackKey>();

  private staticSceneMountState = createAppRouteStaticSceneMountState();

  private readonly mountedSceneListeners = new Set<Listener>();

  private readonly activeChromeListeners = new Set<Listener>();

  private readonly scenePresentationListeners = new Map<OverlayKey, Set<Listener>>();

  private readonly scenePresentationAuthorities = new Map<
    OverlayKey,
    AppRouteSceneStackScenePresentationAuthority
  >();

  private readonly scenePresentationSnapshots = new Map<
    OverlayKey,
    AppRouteSceneStackScenePresentationSnapshot
  >();

  private readonly sceneBodySnapshots = new Map<OverlayKey, AppRouteSceneStackBodySnapshot>();

  private readonly sceneActivitySnapshots = new Map<
    OverlayKey,
    AppRouteSceneStackSceneActivitySnapshot
  >();

  private readonly sceneBodySurfaceListeners = new Map<OverlayKey, Set<Listener>>();

  private readonly sceneBodySurfaceAuthorities = new Map<
    OverlayKey,
    AppRouteSceneStackBodySurfaceAuthority
  >();

  private readonly sceneBodySurfaceSnapshots = new Map<
    OverlayKey,
    AppRouteSceneStackBodySurfaceSnapshot
  >();

  // W1 slice 1 — per-scene entry-keyed mount units (child-role scenes only). The reducer is
  // pure (app-route-scene-entry-mounts.ts, spec-pinned); this map is the runtime's committed
  // copy, published on the per-scene body-surface snapshot.
  private readonly sceneEntryMountStateByKey = new Map<
    OverlayKey,
    { units: readonly SceneEntryMountUnit[]; activeEntryId: string | null }
  >();

  private readonly deferredSceneBodyInputKeys = new Set<AppRouteSceneStackKey>();

  private readonly dataLaneReadySceneKeys = new Set<OverlayKey>();

  private readonly retainedExpandedContentSceneKeys = new Set<OverlayKey>();

  private readonly dataLaneTimers = new Map<OverlayKey, ReturnType<typeof setTimeout>>();

  private readonly frameListeners = new Set<Listener>();

  private lastPersistentPollHeaderRestorationContractKey: string | null = null;

  private readonly unsubscribers: Array<() => void> = [];

  private readonly sceneInputUnsubscribersByKey = new Map<
    AppRouteSceneStackKey,
    Array<() => void>
  >();

  public readonly sceneStackSurfaceAuthority: AppRouteSceneStackSurfaceAuthority;

  public readonly sceneFrameAuthority: AppRouteSceneStackLayerFrameAuthority;

  constructor({
    sceneInputAuthority,
    routeSceneSwitchRuntime,
  }: {
    sceneInputAuthority: AppRouteSceneInputAuthority;
    routeSceneSwitchRuntime: AppRouteSceneSwitchRuntime;
  }) {
    this.sceneStackSurfaceAuthority = {
      mountedScenesAuthority: {
        subscribe: (listener) => this.subscribeMountedScenes(listener),
        getSnapshot: () => this.mountedScenesSnapshot,
      },
      activeChromeAuthority: {
        subscribe: (listener) => this.subscribeActiveChrome(listener),
        getSnapshot: () => this.activeChromeSnapshot,
      },
      getScenePresentationAuthority: (sceneKey) => this.getScenePresentationAuthority(sceneKey),
      getSceneBodySurfaceAuthority: (sceneKey) => this.getSceneBodySurfaceAuthority(sceneKey),
      replayPersistentPollHeaderRestorationContract: (source) =>
        this.logPersistentPollHeaderRestorationContract(source, true),
    };
    this.sceneFrameAuthority = {
      subscribe: (listener) => this.subscribeFrame(listener),
      getSnapshot: () => this.activeSceneFrameSnapshot,
      getSceneFrameEntry: (sceneKey) => this.getSceneFrameEntry(sceneKey),
    };
    const recomputeTransitionSlice = (
      source = 'unknown',
      routeSceneSwitchSnapshot?: RouteSceneSwitchSceneStackDispatchSnapshot
    ) =>
      this.recomputeTransitionSlice({
        sceneInputAuthority,
        routeSceneSwitchRuntime,
        source,
        routeSceneSwitchSnapshot,
      });

    recomputeTransitionSlice('initial');
    this.unsubscribers.push(
      routeSceneSwitchRuntime.setRouteSceneStackTransitionDispatchTarget(
        (routeSceneSwitchSnapshot) => {
          if (
            this.applyRouteSwitchPresentationUpdate({
              routeSceneSwitchRuntime,
              routeSceneSwitchSnapshot,
            })
          ) {
            return;
          }
          recomputeTransitionSlice('routeSceneSwitchDispatchTarget', routeSceneSwitchSnapshot);
        }
      ),
      // PF re-mint coverage (§9.1 R1): laneKind's inputs can change WITHOUT a transition-state
      // dispatch (docked-polls gesture dismiss; the results_dismissing release) — the controller
      // re-mints the frame and flushes it on the SAME dispatch-flush cadence (PF flushes first),
      // so this is the one delivery lane for frame changes the stack dispatch doesn't carry.
      routeSceneSwitchRuntime.subscribePresentationFrame(() => {
        const routeSceneSwitchSnapshot = resolveRouteSceneSwitchSceneStackDispatchSnapshot(
          routeSceneSwitchRuntime.getTransitionState()
        );
        if (
          this.applyRouteSwitchPresentationUpdate({
            routeSceneSwitchRuntime,
            routeSceneSwitchSnapshot,
          })
        ) {
          return;
        }
        recomputeTransitionSlice('presentationFrame', routeSceneSwitchSnapshot);
      }),
      ...APP_ROUTE_STATIC_SCENE_INPUT_KEYS.map((sceneKey) =>
        sceneInputAuthority.subscribeSceneShell(sceneKey, () => {
          recomputeTransitionSlice(`sceneShell:${sceneKey}`);
        })
      ),
      sceneInputAuthority.subscribeSceneShell('polls', () => {
        if (this.staticSceneMountState.pollsPrewarmed) {
          return;
        }
        recomputeTransitionSlice('sceneShell:pollsPrewarm');
      }),
      sceneInputAuthority.subscribeSceneBody('polls', () => {
        if (this.staticSceneMountState.pollsPrewarmed) {
          return;
        }
        recomputeTransitionSlice('sceneBody:pollsPrewarm');
      }),
      sceneInputAuthority.subscribeSceneChrome('polls', () => {
        if (this.staticSceneMountState.pollsPrewarmed) {
          return;
        }
        recomputeTransitionSlice('sceneChrome:pollsPrewarm');
      }),
      getSearchSurfaceRuntime().subscribeSelector(
        selectSearchSurfaceRouteGraphPolicy,
        () => {
          recomputeTransitionSlice('searchSurfaceRuntime');
          if (getSearchSurfaceRuntime().getSnapshot().dismissTransaction == null) {
            return;
          }
          this.logPersistentPollHeaderRestorationContract('searchSurfaceRuntime');
        },
        areSearchSurfaceVisualPoliciesEqual
      )
    );
  }

  public dispose(): void {
    this.unsubscribers.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.unsubscribers.length = 0;
    this.sceneInputUnsubscribersByKey.forEach((unsubscribers) => {
      unsubscribers.forEach((unsubscribe) => {
        unsubscribe();
      });
    });
    this.sceneInputUnsubscribersByKey.clear();
    this.mountedSceneListeners.clear();
    this.activeChromeListeners.clear();
    this.scenePresentationListeners.clear();
    this.scenePresentationAuthorities.clear();
    this.scenePresentationSnapshots.clear();
    this.sceneBodySnapshots.clear();
    this.sceneActivitySnapshots.clear();
    this.sceneBodySurfaceListeners.clear();
    this.sceneBodySurfaceAuthorities.clear();
    if (this.deferredBodySurfaceNotifyHandle != null) {
      clearTimeout(this.deferredBodySurfaceNotifyHandle);
      this.deferredBodySurfaceNotifyHandle = null;
    }
    this.deferredBodySurfaceTxnUnsubscribe?.();
    this.deferredBodySurfaceTxnUnsubscribe = null;
    this.deferredBodySurfaceNotifySceneKeys.clear();
    this.sceneBodySurfaceSnapshots.clear();
    this.sceneEntryMountStateByKey.clear();
    this.deferredSceneBodyInputKeys.clear();
    this.dataLaneTimers.forEach((timer) => {
      clearTimeout(timer);
    });
    this.dataLaneTimers.clear();
    this.dataLaneReadySceneKeys.clear();
    this.frameListeners.clear();
  }

  private subscribeMountedScenes(listener: Listener): () => void {
    this.mountedSceneListeners.add(listener);
    return () => {
      this.mountedSceneListeners.delete(listener);
    };
  }

  private subscribeActiveChrome(listener: Listener): () => void {
    this.activeChromeListeners.add(listener);
    return () => {
      this.activeChromeListeners.delete(listener);
    };
  }

  private subscribeFrame(listener: Listener): () => void {
    this.frameListeners.add(listener);
    return () => {
      this.frameListeners.delete(listener);
    };
  }

  private getSceneBodySnapshot(sceneKey: OverlayKey): AppRouteSceneStackBodySnapshot {
    return this.sceneBodySnapshots.get(sceneKey) ?? EMPTY_APP_ROUTE_SCENE_STACK_BODY_SNAPSHOT;
  }

  private getSceneFrameEntry(
    sceneKey: OverlayKey | null | undefined
  ): SearchRouteSceneStackFrameEntry | null {
    if (sceneKey == null) {
      return null;
    }
    return this.snapshot.sceneEntryByKey[sceneKey]?.frameEntry ?? null;
  }

  private getSceneActivitySnapshot(sceneKey: OverlayKey): AppRouteSceneStackSceneActivitySnapshot {
    return (
      this.sceneActivitySnapshots.get(sceneKey) ??
      EMPTY_APP_ROUTE_SCENE_STACK_SCENE_ACTIVITY_SNAPSHOT
    );
  }

  private getSceneBodySurfaceSnapshot(sceneKey: OverlayKey): AppRouteSceneStackBodySurfaceSnapshot {
    return (
      this.sceneBodySurfaceSnapshots.get(sceneKey) ??
      EMPTY_APP_ROUTE_SCENE_STACK_BODY_SURFACE_SNAPSHOT
    );
  }

  private subscribeSceneBodySurface(sceneKey: OverlayKey, listener: Listener): () => void {
    const listeners = this.sceneBodySurfaceListeners.get(sceneKey) ?? new Set<Listener>();
    listeners.add(listener);
    this.sceneBodySurfaceListeners.set(sceneKey, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.sceneBodySurfaceListeners.delete(sceneKey);
      }
    };
  }

  private getSceneBodySurfaceAuthority(
    sceneKey: OverlayKey
  ): AppRouteSceneStackBodySurfaceAuthority {
    const existingAuthority = this.sceneBodySurfaceAuthorities.get(sceneKey);
    if (existingAuthority != null) {
      return existingAuthority;
    }

    const authority: AppRouteSceneStackBodySurfaceAuthority = {
      subscribe: (listener) => this.subscribeSceneBodySurface(sceneKey, listener),
      getSnapshot: () => this.getSceneBodySurfaceSnapshot(sceneKey),
    };
    this.sceneBodySurfaceAuthorities.set(sceneKey, authority);
    return authority;
  }

  private getScenePresentationSnapshot(
    sceneKey: OverlayKey
  ): AppRouteSceneStackScenePresentationSnapshot {
    return (
      this.scenePresentationSnapshots.get(sceneKey) ??
      EMPTY_APP_ROUTE_SCENE_STACK_SCENE_PRESENTATION_SNAPSHOT
    );
  }

  private subscribeScenePresentation(sceneKey: OverlayKey, listener: Listener): () => void {
    const listeners = this.scenePresentationListeners.get(sceneKey) ?? new Set<Listener>();
    listeners.add(listener);
    this.scenePresentationListeners.set(sceneKey, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.scenePresentationListeners.delete(sceneKey);
      }
    };
  }

  private getScenePresentationAuthority(
    sceneKey: OverlayKey
  ): AppRouteSceneStackScenePresentationAuthority {
    const existingAuthority = this.scenePresentationAuthorities.get(sceneKey);
    if (existingAuthority != null) {
      return existingAuthority;
    }

    const authority: AppRouteSceneStackScenePresentationAuthority = {
      subscribe: (listener) => this.subscribeScenePresentation(sceneKey, listener),
      getSnapshot: () => this.getScenePresentationSnapshot(sceneKey),
    };
    this.scenePresentationAuthorities.set(sceneKey, authority);
    return authority;
  }

  private logPersistentPollHeaderRestorationContract(source: string, force = false): void {
    const presentationSnapshot = this.getScenePresentationSnapshot('polls');
    const bodySurfaceSnapshot = this.getSceneBodySurfaceSnapshot('polls');
    const headerEntry = presentationSnapshot.chromeSurfaces.header;
    const mountedBodyKey = this.getBodySurfaceMountedBodyKey(bodySurfaceSnapshot);
    const bodySurfaceKind = bodySurfaceSnapshot.contentEntry?.bodyContentSpec?.surfaceKind ?? null;
    const expectedContract = PERSISTENT_POLL_IDLE_SHEET_HEADER_RESTORATION_CONTRACT;
    const contentActivity = {
      shouldAttachMountedContent: bodySurfaceSnapshot.contentActivity.shouldAttachMountedContent,
      shouldRenderListBody: bodySurfaceSnapshot.contentActivity.shouldRenderListBody,
      shouldRunDataLane: bodySurfaceSnapshot.contentActivity.shouldRunDataLane,
      shouldSubscribeDataLane: bodySurfaceSnapshot.contentActivity.shouldSubscribeDataLane,
    };
    const searchSurfaceRuntime = getSearchSurfaceRuntime();
    const dismissTransaction = searchSurfaceRuntime.getSnapshot().dismissTransaction;
    const hasMountedPollHeader =
      headerEntry?.surfaceKind === 'mounted' &&
      headerEntry.mountedChromeKey === expectedContract.mountedChromeKey;
    // The polls feed now renders as a `'list'` surface (the shared results-sheet
    // surface), so the dismiss handoff must treat a rendered list body as "ready"
    // just like the legacy mounted body — otherwise markPollPagePartReady never
    // fires for the body/host and the search→docked-polls restore stalls.
    const hasPollBody =
      (mountedBodyKey === 'polls' && contentActivity.shouldAttachMountedContent) ||
      (bodySurfaceKind === 'list' && contentActivity.shouldRenderListBody);
    const hasPollBodyContentLane =
      hasPollBody && contentActivity.shouldRunDataLane && contentActivity.shouldSubscribeDataLane;
    if (dismissTransaction != null) {
      if (hasMountedPollHeader) {
        searchSurfaceRuntime.markPollPagePartReady(
          'header',
          dismissTransaction.id,
          `sceneStack:${source}:header`
        );
      }
      // DISMISS DEADLOCK FIX (2026-06-22): the body/host readiness gates required
      // `hasPollBodyContentLane` = hasPollBody && shouldRunDataLane && shouldSubscribeDataLane. But
      // shouldSubscribeDataLane (and shouldRunDataLane, which mirrors it) = `currentSnap !== 'hidden'`
      // — false while the persistent-polls sheet is still hidden UNDER the closing results sheet. So
      // the gate could never open: the handoff that un-hides the polls sheet (→ subscribes the data
      // lane) was itself gated on the data lane already being subscribed. Result: pollBody/pollHost
      // never marked ready → completeDismissHandoff never fires → leftover "Best restaurants" sheet
      // and you can't start another search (attributed via [DISMISS-HOSTGATE] Metro logs:
      // isMounted/hasMountedPollHeader true, hasPollBody true, but hasPollBodyContentLane stuck false).
      // The body-fix comment above already intended "treat a RENDERED list body as ready"; honor it by
      // gating on hasPollBody (the list body is mounted/rendered) — the data lane subscribes a beat
      // later once the handoff un-hides the sheet (brief poll-feed loading state, never a deadlock).
      if (hasPollBody) {
        searchSurfaceRuntime.markPollPagePartReady(
          'body',
          dismissTransaction.id,
          `sceneStack:${source}:body`
        );
      }
      if (presentationSnapshot.isMounted && hasMountedPollHeader && hasPollBody) {
        searchSurfaceRuntime.markPollPagePartReady(
          'host',
          dismissTransaction.id,
          `sceneStack:${source}:host`
        );
      }
    }
    const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
    if (!isPerfScenarioAttributionActive(scenarioConfig)) {
      return;
    }
    const payload = {
      event: 'persistent_polls_scene_header_restoration_contract',
      source,
      sheetContentLaneKind: expectedContract.sheetContentLaneKind,
      displayedSceneKey: expectedContract.displayedSceneKey,
      sheetPresentationSceneKey: expectedContract.sheetPresentationSceneKey,
      isMounted: presentationSnapshot.isMounted,
      headerSurfaceKind: headerEntry?.surfaceKind ?? null,
      mountedChromeKey: headerEntry?.mountedChromeKey ?? null,
      mountedBodyKey,
      pollsHeaderChromeNonNull:
        headerEntry?.surfaceKind === 'mounted' &&
        headerEntry.mountedChromeKey === expectedContract.mountedChromeKey,
      pollsBodyMountedContentNonNull: mountedBodyKey === 'polls',
      pollsBodyContentLaneActive: hasPollBodyContentLane,
      contentActivity,
      shouldAttachMountedContent: contentActivity.shouldAttachMountedContent,
      shouldRunDataLane: contentActivity.shouldRunDataLane,
      shouldSubscribeDataLane: contentActivity.shouldSubscribeDataLane,
    };
    const contractKey = JSON.stringify({
      headerSurfaceKind: payload.headerSurfaceKind,
      isMounted: payload.isMounted,
      mountedBodyKey: payload.mountedBodyKey,
      mountedChromeKey: payload.mountedChromeKey,
      pollsBodyContentLaneActive: payload.pollsBodyContentLaneActive,
      shouldAttachMountedContent: payload.shouldAttachMountedContent,
      shouldRunDataLane: payload.shouldRunDataLane,
      shouldSubscribeDataLane: payload.shouldSubscribeDataLane,
    });
    if (!force && this.lastPersistentPollHeaderRestorationContractKey === contractKey) {
      return;
    }
    this.lastPersistentPollHeaderRestorationContractKey = contractKey;
    logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, payload);
  }

  private createActiveSceneFrameSnapshot(
    activeSceneFrameEntry: SearchRouteSceneStackFrameEntry | null
  ): AppRouteSceneFrameSnapshot {
    return activeSceneFrameEntry == null
      ? EMPTY_APP_ROUTE_SCENE_FRAME_SNAPSHOT
      : { activeSceneFrameEntry };
  }

  private createMountedScenesSnapshot(
    mountedSceneKeys: readonly OverlayKey[]
  ): AppRouteSceneStackMountedScenesSnapshot {
    return mountedSceneKeys.length === 0
      ? EMPTY_APP_ROUTE_SCENE_STACK_MOUNTED_SCENES_SNAPSHOT
      : { mountedSceneKeys };
  }

  private createActiveChromeSnapshot(
    activeSceneChromeEntry: SearchRouteSceneStackChromeEntry | null
  ): AppRouteSceneStackActiveChromeSnapshot {
    return activeSceneChromeEntry == null
      ? EMPTY_APP_ROUTE_SCENE_STACK_ACTIVE_CHROME_SNAPSHOT
      : { activeSceneChromeEntry };
  }

  private pickPresentationChromeSurfaceEntry({
    entry,
    surface,
  }: {
    entry: SearchRouteSceneStackChromeEntry;
    surface: keyof AppRouteSceneStackChromeSurfacesSnapshot;
  }): SearchRouteSceneStackChromeEntry | null {
    if (entry.surfaceKind === 'mounted') {
      if (entry.excludedSurfaces?.includes(surface)) {
        return null;
      }
      return entry;
    }
    const surfaceComponent =
      surface === 'underlay'
        ? entry.underlayComponent
        : surface === 'background'
          ? entry.backgroundComponent
          : surface === 'header'
            ? entry.headerComponent
            : entry.overlayComponent;
    if (surfaceComponent == null) {
      return null;
    }

    return {
      ...entry,
      underlayComponent: surface === 'underlay' ? surfaceComponent : null,
      backgroundComponent: surface === 'background' ? surfaceComponent : null,
      headerComponent: surface === 'header' ? surfaceComponent : null,
      overlayComponent: surface === 'overlay' ? surfaceComponent : null,
    };
  }

  private createSceneChromeSurfacesSnapshot({
    sceneEntry,
    isMounted,
  }: {
    sceneEntry: SceneStackControllerSceneEntry | null | undefined;
    isMounted: boolean;
  }): AppRouteSceneStackChromeSurfacesSnapshot {
    const chromeEntry = sceneEntry?.chromeEntry;
    if (!isMounted || chromeEntry == null) {
      return EMPTY_APP_ROUTE_SCENE_STACK_CHROME_SURFACES_SNAPSHOT;
    }

    const chromeSurfaces: AppRouteSceneStackChromeSurfacesSnapshot = {
      underlay: this.pickPresentationChromeSurfaceEntry({
        entry: chromeEntry,
        surface: 'underlay',
      }),
      background: this.pickPresentationChromeSurfaceEntry({
        entry: chromeEntry,
        surface: 'background',
      }),
      header: this.pickPresentationChromeSurfaceEntry({
        entry: chromeEntry,
        surface: 'header',
      }),
      overlay: this.pickPresentationChromeSurfaceEntry({
        entry: chromeEntry,
        surface: 'overlay',
      }),
    };

    return chromeSurfaces.underlay == null &&
      chromeSurfaces.background == null &&
      chromeSurfaces.header == null &&
      chromeSurfaces.overlay == null
      ? EMPTY_APP_ROUTE_SCENE_STACK_CHROME_SURFACES_SNAPSHOT
      : chromeSurfaces;
  }

  private areSceneChromeSurfacesSnapshotsEqual(
    left: AppRouteSceneStackChromeSurfacesSnapshot,
    right: AppRouteSceneStackChromeSurfacesSnapshot
  ): boolean {
    return (
      areChromeEntriesEqual(left.underlay, right.underlay) &&
      areChromeEntriesEqual(left.background, right.background) &&
      areChromeEntriesEqual(left.header, right.header) &&
      areChromeEntriesEqual(left.overlay, right.overlay)
    );
  }

  private createScenePresentationSnapshot({
    sceneKey,
    sceneEntry,
    isMounted,
  }: {
    sceneKey: OverlayKey;
    sceneEntry: SceneStackControllerSceneEntry | null | undefined;
    isMounted: boolean;
  }): AppRouteSceneStackScenePresentationSnapshot {
    const activitySnapshot = this.getSceneActivitySnapshot(sceneKey);
    if (!isMounted || !activitySnapshot.isMounted) {
      return EMPTY_APP_ROUTE_SCENE_STACK_SCENE_PRESENTATION_SNAPSHOT;
    }

    return {
      isMounted: activitySnapshot.isMounted,
      chromeSurfaces: this.createSceneChromeSurfacesSnapshot({
        sceneEntry,
        isMounted,
      }),
    };
  }

  private areScenePresentationSnapshotsEqual(
    left: AppRouteSceneStackScenePresentationSnapshot,
    right: AppRouteSceneStackScenePresentationSnapshot
  ): boolean {
    return (
      left.isMounted === right.isMounted &&
      this.areSceneChromeSurfacesSnapshotsEqual(left.chromeSurfaces, right.chromeSurfaces)
    );
  }

  private syncScenePresentationSnapshot({
    sceneKey,
    sceneEntry,
    isMounted,
  }: {
    sceneKey: OverlayKey;
    sceneEntry: SceneStackControllerSceneEntry | null | undefined;
    isMounted: boolean;
  }): boolean {
    const nextSnapshot = this.createScenePresentationSnapshot({
      sceneKey,
      sceneEntry,
      isMounted,
    });
    const previousSnapshot = this.getScenePresentationSnapshot(sceneKey);
    if (this.areScenePresentationSnapshotsEqual(previousSnapshot, nextSnapshot)) {
      return false;
    }
    if (nextSnapshot === EMPTY_APP_ROUTE_SCENE_STACK_SCENE_PRESENTATION_SNAPSHOT) {
      this.scenePresentationSnapshots.delete(sceneKey);
    } else {
      this.scenePresentationSnapshots.set(sceneKey, nextSnapshot);
    }
    if (sceneKey === 'polls') {
      this.logPersistentPollHeaderRestorationContract('syncScenePresentationSnapshot');
    }
    return true;
  }

  private syncScenePresentationSnapshots({
    sceneKeysToCheck,
    mountedSceneKeys,
    sceneEntryByKey,
  }: {
    sceneKeysToCheck: readonly OverlayKey[];
    mountedSceneKeys: readonly OverlayKey[];
    sceneEntryByKey: SceneStackControllerSnapshot['sceneEntryByKey'];
  }): OverlayKey[] {
    if (sceneKeysToCheck.length === 0) {
      return [];
    }

    const mountedSceneKeySet = new Set(mountedSceneKeys);
    const changedSceneKeys: OverlayKey[] = [];

    sceneKeysToCheck.forEach((sceneKey) => {
      if (
        !this.syncScenePresentationSnapshot({
          sceneKey,
          sceneEntry: sceneEntryByKey[sceneKey],
          isMounted: mountedSceneKeySet.has(sceneKey),
        })
      ) {
        return;
      }
      changedSceneKeys.push(sceneKey);
    });

    return changedSceneKeys;
  }

  private notifyScenePresentationListeners(sceneKeys: readonly OverlayKey[]): void {
    withSearchNavSwitchRuntimeAttribution('sceneStack', 'notify:scenePresentation', () => {
      sceneKeys.forEach((sceneKey) => {
        withSearchNavSwitchRuntimeAttribution(
          'sceneStack',
          `notify:scenePresentation:${sceneKey}`,
          () => {
            this.scenePresentationListeners.get(sceneKey)?.forEach((listener) => {
              listener();
            });
          }
        );
      });
    });
  }

  private createSceneBodySnapshot({
    sceneEntry,
    isMounted,
  }: {
    sceneEntry: SceneStackControllerSceneEntry | null | undefined;
    isMounted: boolean;
  }): AppRouteSceneStackBodySnapshot {
    if (!isMounted || sceneEntry == null) {
      return EMPTY_APP_ROUTE_SCENE_STACK_BODY_SNAPSHOT;
    }

    return {
      contentEntry: sceneEntry.contentEntry,
      transportEntry: sceneEntry.transportEntry,
    };
  }

  private syncSceneBodySnapshot({
    sceneKey,
    sceneEntry,
    isMounted,
  }: {
    sceneKey: OverlayKey;
    sceneEntry: SceneStackControllerSceneEntry | null | undefined;
    isMounted: boolean;
  }): boolean {
    const nextSnapshot = this.createSceneBodySnapshot({
      sceneEntry,
      isMounted,
    });
    const previousSnapshot = this.getSceneBodySnapshot(sceneKey);
    if (
      previousSnapshot.contentEntry === nextSnapshot.contentEntry &&
      previousSnapshot.transportEntry === nextSnapshot.transportEntry
    ) {
      return false;
    }
    if (nextSnapshot === EMPTY_APP_ROUTE_SCENE_STACK_BODY_SNAPSHOT) {
      this.sceneBodySnapshots.delete(sceneKey);
    } else {
      this.sceneBodySnapshots.set(sceneKey, nextSnapshot);
    }
    return true;
  }

  private syncSceneBodySnapshots({
    sceneKeysToCheck,
    mountedSceneKeys,
    sceneEntryByKey,
  }: {
    sceneKeysToCheck: readonly OverlayKey[];
    mountedSceneKeys: readonly OverlayKey[];
    sceneEntryByKey: SceneStackControllerSnapshot['sceneEntryByKey'];
  }): OverlayKey[] {
    const mountedSceneKeySet = new Set(mountedSceneKeys);
    const changedSceneKeys: OverlayKey[] = [];

    sceneKeysToCheck.forEach((sceneKey) => {
      if (
        !this.syncSceneBodySnapshot({
          sceneKey,
          sceneEntry: sceneEntryByKey[sceneKey],
          isMounted: mountedSceneKeySet.has(sceneKey),
        })
      ) {
        return;
      }
      changedSceneKeys.push(sceneKey);
    });

    return changedSceneKeys;
  }

  // ─── W1 slice 1 — entry-keyed child mounts ────────────────────────────────────────────────
  private getSceneEntryMountState(sceneKey: OverlayKey): {
    units: readonly SceneEntryMountUnit[] | null;
    activeEntryId: string | null;
  } {
    const state = this.sceneEntryMountStateByKey.get(sceneKey);
    if (state != null) {
      return state;
    }
    // Child keys with no live entries publish an EMPTY unit list (still entry-keyed); root/
    // topLevel/shell scenes publish null → the body host's legacy singleton path.
    return isEntryKeyedMountSceneKey(sceneKey)
      ? EMPTY_SCENE_ENTRY_MOUNT_STATE
      : NULL_SCENE_ENTRY_MOUNT_STATE;
  }

  /**
   * Recompute the per-entry mounted units for every child-role scene the route stack (or a
   * settle-window hold) references. Returns the scene keys whose units/active id changed —
   * the caller merges them into the body-surface sync + notify lists.
   */
  private syncSceneEntryMountUnits({
    overlayRouteStack,
    outgoingEntryId,
  }: {
    overlayRouteStack: readonly OverlayRouteEntry[];
    outgoingEntryId: string | null;
  }): OverlayKey[] {
    const sceneKeysToCheck = new Set<OverlayKey>();
    overlayRouteStack.forEach((entry) => {
      if (entry != null && isEntryKeyedMountSceneKey(entry.key)) {
        sceneKeysToCheck.add(entry.key);
      }
    });
    this.sceneEntryMountStateByKey.forEach((_state, sceneKey) => {
      sceneKeysToCheck.add(sceneKey);
    });

    const changedSceneKeys: OverlayKey[] = [];
    sceneKeysToCheck.forEach((sceneKey) => {
      const previousState = this.sceneEntryMountStateByKey.get(sceneKey) ?? null;
      const units = resolveMountedSceneEntryUnits({
        sceneKey,
        overlayRouteStack,
        outgoingEntryId,
        previousUnits: previousState?.units ?? null,
      });
      if (units == null) {
        return; // non-child (defensive — the check set only admits child keys)
      }
      const activeEntryId = resolveActiveEntryIdForScene(sceneKey, overlayRouteStack);
      const isUnchanged =
        previousState != null
          ? areSceneEntryMountUnitArraysEqual(previousState.units, units) &&
            previousState.activeEntryId === activeEntryId
          : units.length === 0 && activeEntryId == null;
      if (isUnchanged) {
        return;
      }
      if (units.length === 0 && activeEntryId == null) {
        this.sceneEntryMountStateByKey.delete(sceneKey);
      } else {
        this.sceneEntryMountStateByKey.set(sceneKey, { units, activeEntryId });
      }
      changedSceneKeys.push(sceneKey);
    });
    return changedSceneKeys;
  }

  private createSceneBodySurfaceSnapshot({
    sceneKey,
    bodySnapshot,
    activitySnapshot,
  }: {
    sceneKey: OverlayKey;
    bodySnapshot: AppRouteSceneStackBodySnapshot;
    activitySnapshot: AppRouteSceneStackSceneActivitySnapshot;
  }): AppRouteSceneStackBodySurfaceSnapshot {
    if (
      bodySnapshot.contentEntry == null ||
      bodySnapshot.transportEntry == null ||
      !activitySnapshot.isMounted
    ) {
      return EMPTY_APP_ROUTE_SCENE_STACK_BODY_SURFACE_SNAPSHOT;
    }
    const entryMountState = this.getSceneEntryMountState(sceneKey);
    const bodySurfaceKind = bodySnapshot.contentEntry.bodyContentSpec.surfaceKind;
    const isMountedBodySurface = bodySurfaceKind === 'mounted';

    return {
      contentEntry: bodySnapshot.contentEntry,
      transportEntry: bodySnapshot.transportEntry,
      contentActivity: {
        // P3 return-to-origin: surface isActive so the mounted-scroll body can detect when its
        // RETAINED (never-unmounted) scene becomes the active scene again on a dismiss-return,
        // the trigger for applying a pending scroll restore (a cold re-mount never happens for
        // the retained static tabs).
        isActive: activitySnapshot.isActive,
        shouldRenderListBody:
          bodySurfaceKind === 'list' ? activitySnapshot.shouldRenderListBody : false,
        shouldAttachMountedContent: isMountedBodySurface
          ? activitySnapshot.shouldAttachMountedContent
          : false,
        shouldRunDataLane: isMountedBodySurface ? activitySnapshot.shouldRunDataLane : false,
        shouldSubscribeDataLane: isMountedBodySurface
          ? activitySnapshot.shouldSubscribeDataLane
          : false,
        shouldRenderExpandedContent: isMountedBodySurface
          ? activitySnapshot.shouldRenderExpandedContent
          : false,
        hasActivatedExpandedContent: isMountedBodySurface
          ? activitySnapshot.hasActivatedExpandedContent
          : false,
      },
      mountedEntryUnits: entryMountState.units,
      activeEntryId: entryMountState.activeEntryId,
    };
  }

  private shouldCompareSceneBodyDataActivity(
    snapshot: AppRouteSceneStackBodySurfaceSnapshot
  ): boolean {
    return isSceneBodyDataActivityKey(snapshot.contentEntry?.sceneKey);
  }

  private markSceneBodySurfaceSnapshotDiff(
    sceneKey: string | null | undefined,
    field: string,
    left: unknown,
    right: unknown
  ): void {
    if (Object.is(left, right)) {
      return;
    }
    markSceneStackDiff(`bodySurface:${sceneKey ?? 'unknown'}:${field}`);
  }

  private getBodySurfaceMountedBodyKey(
    snapshot: AppRouteSceneStackBodySurfaceSnapshot
  ): string | null {
    const spec = snapshot.contentEntry?.bodyContentSpec;
    return spec?.surfaceKind === 'mounted' ? spec.mountedBodyKey : null;
  }

  private markSceneBodySurfaceSnapshotDiffs(
    left: AppRouteSceneStackBodySurfaceSnapshot,
    right: AppRouteSceneStackBodySurfaceSnapshot,
    shouldCompareDataLane: boolean
  ): void {
    const sceneKey = right.contentEntry?.sceneKey ?? left.contentEntry?.sceneKey ?? null;
    this.markSceneBodySurfaceSnapshotDiff(
      sceneKey,
      'contentEntryRef',
      left.contentEntry,
      right.contentEntry
    );
    this.markSceneBodySurfaceSnapshotDiff(
      sceneKey,
      'contentEntry.sceneKey',
      left.contentEntry?.sceneKey ?? null,
      right.contentEntry?.sceneKey ?? null
    );
    this.markSceneBodySurfaceSnapshotDiff(
      sceneKey,
      'contentEntry.surfaceKind',
      left.contentEntry?.bodyContentSpec.surfaceKind ?? null,
      right.contentEntry?.bodyContentSpec.surfaceKind ?? null
    );
    this.markSceneBodySurfaceSnapshotDiff(
      sceneKey,
      'contentEntry.mountedBodyKey',
      this.getBodySurfaceMountedBodyKey(left),
      this.getBodySurfaceMountedBodyKey(right)
    );
    this.markSceneBodySurfaceSnapshotDiff(
      sceneKey,
      'transportEntryRef',
      left.transportEntry,
      right.transportEntry
    );
    this.markSceneBodySurfaceSnapshotDiff(
      sceneKey,
      'contentActivity.shouldRenderListBody',
      left.contentActivity.shouldRenderListBody,
      right.contentActivity.shouldRenderListBody
    );
    this.markSceneBodySurfaceSnapshotDiff(
      sceneKey,
      'contentActivity.shouldAttachMountedContent',
      left.contentActivity.shouldAttachMountedContent,
      right.contentActivity.shouldAttachMountedContent
    );
    if (shouldCompareDataLane) {
      this.markSceneBodySurfaceSnapshotDiff(
        sceneKey,
        'contentActivity.shouldRunDataLane',
        left.contentActivity.shouldRunDataLane,
        right.contentActivity.shouldRunDataLane
      );
    }
    this.markSceneBodySurfaceSnapshotDiff(
      sceneKey,
      'contentActivity.shouldSubscribeDataLane',
      left.contentActivity.shouldSubscribeDataLane,
      right.contentActivity.shouldSubscribeDataLane
    );
    this.markSceneBodySurfaceSnapshotDiff(
      sceneKey,
      'contentActivity.shouldRenderExpandedContent',
      left.contentActivity.shouldRenderExpandedContent,
      right.contentActivity.shouldRenderExpandedContent
    );
    this.markSceneBodySurfaceSnapshotDiff(
      sceneKey,
      'contentActivity.hasActivatedExpandedContent',
      left.contentActivity.hasActivatedExpandedContent,
      right.contentActivity.hasActivatedExpandedContent
    );
  }

  private areSceneBodySurfaceSnapshotsEqual(
    left: AppRouteSceneStackBodySurfaceSnapshot,
    right: AppRouteSceneStackBodySurfaceSnapshot
  ): boolean {
    const sceneKey = right.contentEntry?.sceneKey ?? left.contentEntry?.sceneKey ?? null;
    // W1 slice 1 — the entry-mount fields are render-read by the body host (snapshot-equality
    // landmine: a field the render reads MUST be compared). Roots carry null/null → cheap.
    const areEntryMountFieldsEqual =
      areSceneEntryMountUnitArraysEqual(left.mountedEntryUnits, right.mountedEntryUnits) &&
      left.activeEntryId === right.activeEntryId;
    if (!areEntryMountFieldsEqual) {
      this.markSceneBodySurfaceSnapshotDiff(
        sceneKey,
        'mountedEntryUnits',
        left.mountedEntryUnits,
        right.mountedEntryUnits
      );
      return false;
    }
    if (sceneKey === 'search' || sceneKey === 'polls') {
      const areEntriesEqual =
        areSearchRouteSceneStackBodyContentEntriesEqual(left.contentEntry, right.contentEntry) &&
        areSearchRouteSceneStackBodyTransportEntriesEqual(
          left.transportEntry,
          right.transportEntry
        );
      const shouldCompareDataLane = sceneKey === 'polls';
      const isEqual =
        areEntriesEqual &&
        (sceneKey === 'search' ||
          (left.contentActivity.isActive === right.contentActivity.isActive &&
            left.contentActivity.shouldRenderListBody ===
              right.contentActivity.shouldRenderListBody &&
            left.contentActivity.shouldAttachMountedContent ===
              right.contentActivity.shouldAttachMountedContent &&
            (!shouldCompareDataLane ||
              left.contentActivity.shouldRunDataLane === right.contentActivity.shouldRunDataLane) &&
            left.contentActivity.shouldSubscribeDataLane ===
              right.contentActivity.shouldSubscribeDataLane &&
            left.contentActivity.shouldRenderExpandedContent ===
              right.contentActivity.shouldRenderExpandedContent &&
            left.contentActivity.hasActivatedExpandedContent ===
              right.contentActivity.hasActivatedExpandedContent));
      if (!isEqual) {
        this.markSceneBodySurfaceSnapshotDiffs(left, right, shouldCompareDataLane);
      }
      return isEqual;
    }

    const shouldCompareDataLane =
      this.shouldCompareSceneBodyDataActivity(left) ||
      this.shouldCompareSceneBodyDataActivity(right);
    const isEqual =
      left.contentEntry === right.contentEntry &&
      left.transportEntry === right.transportEntry &&
      left.contentActivity.isActive === right.contentActivity.isActive &&
      left.contentActivity.shouldRenderListBody === right.contentActivity.shouldRenderListBody &&
      left.contentActivity.shouldAttachMountedContent ===
        right.contentActivity.shouldAttachMountedContent &&
      (!shouldCompareDataLane ||
        left.contentActivity.shouldRunDataLane === right.contentActivity.shouldRunDataLane) &&
      left.contentActivity.shouldSubscribeDataLane ===
        right.contentActivity.shouldSubscribeDataLane &&
      left.contentActivity.shouldRenderExpandedContent ===
        right.contentActivity.shouldRenderExpandedContent &&
      left.contentActivity.hasActivatedExpandedContent ===
        right.contentActivity.hasActivatedExpandedContent;
    if (!isEqual) {
      this.markSceneBodySurfaceSnapshotDiffs(left, right, shouldCompareDataLane);
    }
    return isEqual;
  }

  private syncSceneBodySurfaceSnapshot(sceneKey: OverlayKey): boolean {
    const nextSnapshot = this.createSceneBodySurfaceSnapshot({
      sceneKey,
      bodySnapshot: this.getSceneBodySnapshot(sceneKey),
      activitySnapshot: this.getSceneActivitySnapshot(sceneKey),
    });
    const previousSnapshot = this.getSceneBodySurfaceSnapshot(sceneKey);
    if (this.areSceneBodySurfaceSnapshotsEqual(previousSnapshot, nextSnapshot)) {
      return false;
    }
    if (nextSnapshot === EMPTY_APP_ROUTE_SCENE_STACK_BODY_SURFACE_SNAPSHOT) {
      this.sceneBodySurfaceSnapshots.delete(sceneKey);
    } else {
      this.sceneBodySurfaceSnapshots.set(sceneKey, nextSnapshot);
    }
    if (sceneKey === 'polls') {
      this.logPersistentPollHeaderRestorationContract('syncSceneBodySurfaceSnapshot');
    }
    return true;
  }

  private syncSceneBodySurfaceSnapshots(sceneKeysToCheck: readonly OverlayKey[]): OverlayKey[] {
    const changedSceneKeys: OverlayKey[] = [];
    sceneKeysToCheck.forEach((sceneKey) => {
      if (!this.syncSceneBodySurfaceSnapshot(sceneKey)) {
        return;
      }
      changedSceneKeys.push(sceneKey);
    });
    return changedSceneKeys;
  }

  // L4 ACTIVITY-FLIP DEFERRAL (Law 1's stamp diet, [L4STAMP]-measured): a managed
  // scene's body-surface notify moves ONE TASK behind the frame/header publish, so
  // the content re-activation cascade (data-lane re-admission renders — the press-up
  // commit's measured bulk) lands in the FIRST BEAT after the reveal, not inside the
  // reveal commit the chrome ack waits on. The SNAPSHOT still computes synchronously
  // (P4's press-up admission is state truth immediately; only the render defers one
  // pass); unmanaged scenes keep the synchronous notify. Coalesced per flush; late
  // subscribers are covered by useSyncExternalStore's subscribe-time re-read.
  private deferredBodySurfaceNotifySceneKeys = new Set<OverlayKey>();
  private deferredBodySurfaceNotifyHandle: ReturnType<typeof setTimeout> | null = null;
  private deferredBodySurfaceTxnUnsubscribe: (() => void) | null = null;

  // BEATS FLUSH AT THE REVEAL (L4 Law 1, refined after the first cut raced): a
  // task-deferred flush can still land BEFORE the chrome commit when that commit is
  // itself a later task — so while a transition is pre-reveal (staged/committed/
  // joining), the managed flush HOLDS and releases on the txn's revealed edge (+one
  // task, so the beat lands after the reveal commit paints). The engine's forced-
  // reveal contract guarantees the phase always advances — no held-forever risk.
  // Deadlock-free by construction: the reveal joins paint (instant for warm legs)
  // and chrome (frame-driven header) — neither consumes body-surface notifies.
  private scheduleDeferredBodySurfaceFlush(): void {
    if (
      this.deferredBodySurfaceNotifyHandle != null ||
      this.deferredBodySurfaceTxnUnsubscribe != null
    ) {
      return;
    }
    const liveTxn = getLiveTransitionTxn();
    if (
      liveTxn != null &&
      (liveTxn.phase === 'staged' || liveTxn.phase === 'committed' || liveTxn.phase === 'joining')
    ) {
      this.deferredBodySurfaceTxnUnsubscribe = subscribeTransitionTxn(() => {
        const current = getLiveTransitionTxn();
        if (
          current == null ||
          current.phase === 'revealed' ||
          current.phase === 'settled' ||
          current.phase === 'superseded'
        ) {
          this.deferredBodySurfaceTxnUnsubscribe?.();
          this.deferredBodySurfaceTxnUnsubscribe = null;
          if (this.deferredBodySurfaceNotifyHandle == null) {
            this.deferredBodySurfaceNotifyHandle = setTimeout(() => {
              this.flushDeferredBodySurfaceNotifies();
            }, 0);
          }
        }
      });
      return;
    }
    this.deferredBodySurfaceNotifyHandle = setTimeout(() => {
      this.flushDeferredBodySurfaceNotifies();
    }, 0);
  }

  private flushDeferredBodySurfaceNotifies(): void {
    this.deferredBodySurfaceNotifyHandle = null;
    if (this.deferredBodySurfaceNotifySceneKeys.size === 0) {
      return;
    }
    const sceneKeys = [...this.deferredBodySurfaceNotifySceneKeys];
    this.deferredBodySurfaceNotifySceneKeys.clear();
    withSearchNavSwitchRuntimeAttribution('sceneStack', 'notify:sceneBodySurface:deferred', () => {
      sceneKeys.forEach((sceneKey) => {
        this.sceneBodySurfaceListeners.get(sceneKey)?.forEach((listener) => {
          listener();
        });
      });
    });
  }

  private notifySceneBodySurfaceListeners(sceneKeys: readonly OverlayKey[]): void {
    const syncSceneKeys: OverlayKey[] = [];
    sceneKeys.forEach((sceneKey) => {
      if (isResidencyManagedScene(sceneKey)) {
        this.deferredBodySurfaceNotifySceneKeys.add(sceneKey);
      } else {
        syncSceneKeys.push(sceneKey);
      }
    });
    if (this.deferredBodySurfaceNotifySceneKeys.size > 0) {
      this.scheduleDeferredBodySurfaceFlush();
    }
    if (syncSceneKeys.length === 0) {
      return;
    }
    withSearchNavSwitchRuntimeAttribution('sceneStack', 'notify:sceneBodySurface', () => {
      syncSceneKeys.forEach((sceneKey) => {
        withSearchNavSwitchRuntimeAttribution(
          'sceneStack',
          `notify:sceneBodySurface:${sceneKey}`,
          () => {
            this.sceneBodySurfaceListeners.get(sceneKey)?.forEach((listener) => {
              listener();
            });
          }
        );
      });
    });
  }

  private createSceneActivitySnapshot({
    sceneKey,
    sceneEntry,
    activeSceneKey,
    interactiveSceneKey,
    handoffSceneKey,
    isMounted,
    transitionPhase,
    isInteractive,
  }: {
    sceneKey: OverlayKey;
    sceneEntry: SceneStackControllerSceneEntry | null | undefined;
    activeSceneKey: OverlayKey | null;
    interactiveSceneKey: OverlayKey | null;
    handoffSceneKey: OverlayKey | null;
    isMounted: boolean;
    transitionPhase: RouteSceneSwitchTransitionPhase;
    isInteractive: boolean;
  }): AppRouteSceneStackSceneActivitySnapshot {
    if (!isMounted) {
      return EMPTY_APP_ROUTE_SCENE_STACK_SCENE_ACTIVITY_SNAPSHOT;
    }

    const isActive = activeSceneKey === sceneKey;
    const canInteract = interactiveSceneKey === sceneKey && isInteractive;
    const isTransitionParticipant =
      transitionPhase !== 'idle' &&
      (sceneKey === activeSceneKey ||
        sceneKey === interactiveSceneKey ||
        sceneKey === handoffSceneKey);
    const activationPhase = !isActive
      ? 'inactive'
      : isTransitionParticipant || !canInteract
        ? 'transitioning'
        : 'interactive';
    const bodyAdmissionPolicy = sceneEntry?.bodyAdmissionPolicy;
    const shouldRetainMountedBody = shouldRetainMountedSceneBody(bodyAdmissionPolicy);
    // Entry-keyed mounts (W1 slice 1): a CHILD key with any in-stack entry
    // within depth-K keeps its mounted content attached — per-entry state
    // isolation is meaningless if the key's content detaches at settle and
    // guillotines every unit (the sim probe's unmount-churn finding).
    const hasRetainedEntryUnits =
      getAppOverlayRouteMetadata(sceneKey).role === 'child' &&
      (this.sceneEntryMountStateByKey.get(sceneKey)?.units.length ?? 0) > 0;
    const hasActivatedExpandedContent =
      shouldRetainMountedBody && this.retainedExpandedContentSceneKeys.has(sceneKey);
    const canAdmitInteractiveDataLane = canInteract && activationPhase === 'interactive';
    // P4 PRESENTED-ACTIVATION (page-switch-master-plan.md §6-P4 / §9.1 — the cold-tab blank fix):
    // a PRESENTED retained tab activates from PF presented-ness ALONE — `isActive` here derives
    // from frame.presentedSceneKey (the activity scene key the callers pass) — never from the
    // legacy transition-settle edge (phase idle + isInteractive + interactive-key match + the
    // 350ms quiet timer) that hard-swap/instant commits reach late or, when a settle plane's
    // completer is missed, never. Scoped by the descriptor's prewarmRetainedMountedBody flag
    // (the static tabs' always-warm signature: bookmarks/profile), so polls keeps its
    // transition-window data-lane pause and non-retained scenes keep today's timing. Idle legs
    // are untouched (isActive false ⇒ inert); activation stays STICKY via
    // retainedExpandedContentSceneKeys, so the warm Fav→Profile→Fav round-trip is unchanged.
    const canActivatePresentedRetainedMountedBody =
      shouldRetainMountedBody &&
      shouldPrewarmRetainedMountedSceneBody(bodyAdmissionPolicy) &&
      isActive &&
      isMounted;
    // THE RUNTIME-GOVERNANCE MERGE (L3, A#9 — invisible shells subscribe to NOTHING):
    // for residency-managed scenes the hidden-idle prewarm lane DIES — it was a
    // STANDING data lane (this flag holds continuously while hidden at idle), i.e.
    // the background render tax: every cache invalidation re-rendered display:none
    // resident trees. The resident TREE is the warmth (a tab switch shows last data
    // instantly); the lane re-admits at press-up via P4 presented-activation
    // (immediate admission), and stale queries re-derive at reveal. Unmanaged scenes
    // (polls) keep today's timing — the strangler boolean scopes the law.
    const isResidencyManaged = isResidencyManagedScene(sceneKey);
    const canPrewarmRetainedMountedBody =
      shouldRetainMountedBody &&
      shouldPrewarmRetainedMountedSceneBody(bodyAdmissionPolicy) &&
      !isResidencyManaged &&
      !isActive &&
      isMounted &&
      transitionPhase === 'idle' &&
      isInteractive;
    const canPrewarmSearchDismissPollData =
      !isActive &&
      shouldPrewarmSearchDismissPollDataLane({
        bodyAdmissionPolicy,
        isMounted,
        sceneKey,
      });
    const canAdmitDataLane =
      canAdmitInteractiveDataLane ||
      canActivatePresentedRetainedMountedBody ||
      canPrewarmRetainedMountedBody ||
      canPrewarmSearchDismissPollData;
    const isDataLaneReady = this.isSceneDataLaneReady({
      sceneKey,
      canAdmitDataLane,
      // "Immediate admission" lane (no quiet timer): the prewarm paths AND the P4
      // presented-activation path — a presented tab's data lane must start at press-up,
      // not after settle + 350ms.
      allowInactiveDataLaneAdmission:
        canActivatePresentedRetainedMountedBody ||
        canPrewarmRetainedMountedBody ||
        canPrewarmSearchDismissPollData,
      retainMountedBody: shouldRetainMountedBody,
      delayFirstDataAdmission: shouldDelaySceneDataLane(bodyAdmissionPolicy),
      delayDataAdmissionOnActivation: shouldDelaySceneDataLaneOnActivation(bodyAdmissionPolicy),
      dataAdmissionDelayMs: resolveSceneDataLaneAdmissionDelayMs(bodyAdmissionPolicy),
    });
    const shouldRunDataLane = canAdmitDataLane && isDataLaneReady;
    if (shouldRetainMountedBody && shouldRunDataLane) {
      this.retainedExpandedContentSceneKeys.add(sceneKey);
    }
    const nextHasActivatedExpandedContent =
      hasActivatedExpandedContent || (shouldRetainMountedBody && shouldRunDataLane);
    // A#9's second arm: keep-subscribed-after-activation retention is a STANDING
    // subscription on a hidden shell — dead for managed scenes (same law as above).
    const shouldSubscribeDataLane =
      shouldRunDataLane ||
      (!isResidencyManaged &&
        bodyAdmissionPolicy?.keepDataSubscribedAfterActivation === true &&
        nextHasActivatedExpandedContent);
    const shouldRenderExpandedContent = shouldRetainMountedBody
      ? nextHasActivatedExpandedContent || shouldRunDataLane
      : canInteract && activationPhase === 'interactive';

    return {
      isMounted: true,
      isActive,
      isInteractive: canInteract,
      // OR in isTransitionParticipant so BOTH the incoming (active) AND the
      // outgoing (handoff) scene paint their body during the overlap window —
      // else the crossfade's outgoing leg (opacity 1→0) would fade a blank.
      shouldRenderListBody:
        isActive || isTransitionParticipant || shouldRetainSceneListBody(bodyAdmissionPolicy),
      shouldAttachMountedContent:
        canInteract || isTransitionParticipant || shouldRetainMountedBody || hasRetainedEntryUnits,
      isTransitionParticipant,
      activationPhase,
      shouldRunDataLane,
      shouldSubscribeDataLane,
      shouldRenderExpandedContent,
      hasActivatedExpandedContent: nextHasActivatedExpandedContent,
    };
  }

  private syncSceneActivitySnapshot({
    sceneKey,
    sceneEntry,
    activeSceneKey,
    interactiveSceneKey,
    handoffSceneKey,
    isMounted,
    transitionPhase,
    isInteractive,
  }: {
    sceneKey: OverlayKey;
    sceneEntry: SceneStackControllerSceneEntry | null | undefined;
    activeSceneKey: OverlayKey | null;
    interactiveSceneKey: OverlayKey | null;
    handoffSceneKey: OverlayKey | null;
    isMounted: boolean;
    transitionPhase: RouteSceneSwitchTransitionPhase;
    isInteractive: boolean;
  }): boolean {
    const nextSnapshot = withSearchNavSwitchRuntimeAttribution(
      'sceneStack',
      `sceneActivity:${sceneKey}:createSnapshot`,
      () =>
        this.createSceneActivitySnapshot({
          sceneKey,
          sceneEntry,
          activeSceneKey,
          interactiveSceneKey,
          handoffSceneKey,
          isMounted,
          transitionPhase,
          isInteractive,
        })
    );
    const previousSnapshot = this.getSceneActivitySnapshot(sceneKey);
    if (
      previousSnapshot.isMounted === nextSnapshot.isMounted &&
      previousSnapshot.isActive === nextSnapshot.isActive &&
      previousSnapshot.isInteractive === nextSnapshot.isInteractive &&
      previousSnapshot.shouldRenderListBody === nextSnapshot.shouldRenderListBody &&
      previousSnapshot.shouldAttachMountedContent === nextSnapshot.shouldAttachMountedContent &&
      previousSnapshot.isTransitionParticipant === nextSnapshot.isTransitionParticipant &&
      previousSnapshot.activationPhase === nextSnapshot.activationPhase &&
      previousSnapshot.shouldRunDataLane === nextSnapshot.shouldRunDataLane &&
      previousSnapshot.shouldSubscribeDataLane === nextSnapshot.shouldSubscribeDataLane &&
      previousSnapshot.shouldRenderExpandedContent === nextSnapshot.shouldRenderExpandedContent &&
      previousSnapshot.hasActivatedExpandedContent === nextSnapshot.hasActivatedExpandedContent
    ) {
      return false;
    }
    if (__DEV__) {
      // [pageswitch] ACTIVITY producer probe (P4 blank-body attribution): per-scene activation
      // flags whenever the snapshot CHANGES, plus the producer inputs that decided them — pins
      // which flag is stuck and which input failed to flip on a cold presented leg.
      // eslint-disable-next-line no-console
      console.log(
        `[pageswitch] activity ${JSON.stringify({
          scene: sceneKey,
          attach: nextSnapshot.shouldAttachMountedContent,
          expand: nextSnapshot.shouldRenderExpandedContent,
          activated: nextSnapshot.hasActivatedExpandedContent,
          runData: nextSnapshot.shouldRunDataLane,
          subData: nextSnapshot.shouldSubscribeDataLane,
          active: nextSnapshot.isActive,
          canInteract: nextSnapshot.isInteractive,
          actPhase: nextSnapshot.activationPhase,
          in: {
            act: activeSceneKey,
            inter: interactiveSceneKey,
            handoff: handoffSceneKey,
            phase: transitionPhase,
            interactive: isInteractive,
            mounted: isMounted,
            entry: sceneEntry != null,
            retain: sceneEntry?.bodyAdmissionPolicy?.retainMountedBodyDuringTransition === true,
          },
        })}`
      );
    }
    if (nextSnapshot === EMPTY_APP_ROUTE_SCENE_STACK_SCENE_ACTIVITY_SNAPSHOT) {
      this.sceneActivitySnapshots.delete(sceneKey);
    } else {
      this.sceneActivitySnapshots.set(sceneKey, nextSnapshot);
    }
    return true;
  }

  private syncSceneActivitySnapshots({
    previousMountedSceneKeys,
    mountedSceneKeys,
    previousActiveSceneKey,
    activeSceneKey,
    previousInteractiveSceneKey,
    interactiveSceneKey,
    previousHandoffSceneKey,
    handoffSceneKey,
    transitionPhase,
    isInteractive,
    sceneEntryByKey,
  }: {
    previousMountedSceneKeys: readonly OverlayKey[];
    mountedSceneKeys: readonly OverlayKey[];
    previousActiveSceneKey: OverlayKey | null;
    activeSceneKey: OverlayKey | null;
    previousInteractiveSceneKey: OverlayKey | null;
    interactiveSceneKey: OverlayKey | null;
    previousHandoffSceneKey: OverlayKey | null;
    handoffSceneKey: OverlayKey | null;
    transitionPhase: RouteSceneSwitchTransitionPhase;
    isInteractive: boolean;
    sceneEntryByKey: SceneStackControllerSnapshot['sceneEntryByKey'];
  }): OverlayKey[] {
    const sceneKeysToCheck = new Set<OverlayKey>();
    mountedSceneKeys
      .filter((sceneKey) => !previousMountedSceneKeys.includes(sceneKey))
      .forEach((sceneKey) => sceneKeysToCheck.add(sceneKey));
    previousMountedSceneKeys
      .filter((sceneKey) => !mountedSceneKeys.includes(sceneKey))
      .forEach((sceneKey) => sceneKeysToCheck.add(sceneKey));
    appendActivitySceneKey({ sceneKeys: sceneKeysToCheck, sceneKey: previousActiveSceneKey });
    appendActivitySceneKey({ sceneKeys: sceneKeysToCheck, sceneKey: activeSceneKey });
    appendActivitySceneKey({
      sceneKeys: sceneKeysToCheck,
      sceneKey: previousInteractiveSceneKey,
    });
    appendActivitySceneKey({ sceneKeys: sceneKeysToCheck, sceneKey: interactiveSceneKey });
    appendActivitySceneKey({ sceneKeys: sceneKeysToCheck, sceneKey: previousHandoffSceneKey });
    appendActivitySceneKey({ sceneKeys: sceneKeysToCheck, sceneKey: handoffSceneKey });
    if (shouldSyncSearchDismissPollDataPrewarmScene(mountedSceneKeys)) {
      sceneKeysToCheck.add('polls');
    }
    const changedSceneKeys: OverlayKey[] = [];

    sceneKeysToCheck.forEach((sceneKey) => {
      const isMounted = mountedSceneKeys.includes(sceneKey);
      if (
        !this.syncSceneActivitySnapshot({
          sceneKey,
          sceneEntry: sceneEntryByKey[sceneKey],
          activeSceneKey,
          interactiveSceneKey,
          handoffSceneKey,
          isMounted,
          transitionPhase,
          isInteractive,
        })
      ) {
        return;
      }
      changedSceneKeys.push(sceneKey);
    });

    return changedSceneKeys;
  }

  private cancelSceneDataLaneTimer(sceneKey: OverlayKey): void {
    const timer = this.dataLaneTimers.get(sceneKey);
    if (timer == null) {
      return;
    }
    clearTimeout(timer);
    this.dataLaneTimers.delete(sceneKey);
  }

  private isSceneDataLaneReady({
    sceneKey,
    canAdmitDataLane,
    allowInactiveDataLaneAdmission,
    retainMountedBody,
    delayFirstDataAdmission,
    delayDataAdmissionOnActivation,
    dataAdmissionDelayMs,
  }: {
    sceneKey: OverlayKey;
    canAdmitDataLane: boolean;
    allowInactiveDataLaneAdmission: boolean;
    retainMountedBody: boolean;
    delayFirstDataAdmission: boolean;
    delayDataAdmissionOnActivation: boolean;
    dataAdmissionDelayMs: number;
  }): boolean {
    if (!canAdmitDataLane) {
      this.cancelSceneDataLaneTimer(sceneKey);
      if (delayDataAdmissionOnActivation) {
        this.dataLaneReadySceneKeys.delete(sceneKey);
        return false;
      }
      if (retainMountedBody && this.retainedExpandedContentSceneKeys.has(sceneKey)) {
        return true;
      }
      this.dataLaneReadySceneKeys.delete(sceneKey);
      return false;
    }

    if (allowInactiveDataLaneAdmission) {
      this.cancelSceneDataLaneTimer(sceneKey);
      this.dataLaneReadySceneKeys.add(sceneKey);
      if (retainMountedBody) {
        this.retainedExpandedContentSceneKeys.add(sceneKey);
      }
      return true;
    }

    if (!delayFirstDataAdmission && !delayDataAdmissionOnActivation) {
      if (retainMountedBody) {
        this.retainedExpandedContentSceneKeys.add(sceneKey);
      }
      return true;
    }

    if (this.dataLaneReadySceneKeys.has(sceneKey)) {
      if (retainMountedBody) {
        this.retainedExpandedContentSceneKeys.add(sceneKey);
      }
      return true;
    }

    if (!this.dataLaneTimers.has(sceneKey)) {
      const timer = setTimeout(() => {
        withSearchNavSwitchRuntimeAttribution('sceneStack', `dataLaneTimer:${sceneKey}`, () => {
          this.dataLaneTimers.delete(sceneKey);
          const activeSnapshot = this.snapshot;
          const canCommitInteractiveAdmission =
            activeSnapshot.interactiveSceneKey === sceneKey &&
            activeSnapshot.isInteractive &&
            activeSnapshot.transitionPhase === 'idle';
          const canCommitInactiveAdmission =
            allowInactiveDataLaneAdmission &&
            activeSnapshot.activeSceneKey !== sceneKey &&
            activeSnapshot.mountedSceneKeys.includes(sceneKey) &&
            activeSnapshot.isInteractive &&
            activeSnapshot.transitionPhase === 'idle';
          if (!canCommitInteractiveAdmission && !canCommitInactiveAdmission) {
            return;
          }
          this.dataLaneReadySceneKeys.add(sceneKey);
          if (retainMountedBody) {
            this.retainedExpandedContentSceneKeys.add(sceneKey);
          }
          const changed = this.syncSceneActivitySnapshot({
            sceneKey,
            sceneEntry: activeSnapshot.sceneEntryByKey[sceneKey],
            activeSceneKey: activeSnapshot.activeSceneKey,
            interactiveSceneKey: activeSnapshot.interactiveSceneKey,
            handoffSceneKey: activeSnapshot.handoffSceneKey,
            isMounted: activeSnapshot.mountedSceneKeys.includes(sceneKey),
            transitionPhase: activeSnapshot.transitionPhase,
            isInteractive: activeSnapshot.isInteractive,
          });
          if (changed) {
            const changedSceneBodySurfaceKeys = this.syncSceneBodySurfaceSnapshots([sceneKey]);
            const changedScenePresentationKeys = this.syncScenePresentationSnapshots({
              sceneKeysToCheck: [sceneKey],
              mountedSceneKeys: activeSnapshot.mountedSceneKeys,
              sceneEntryByKey: activeSnapshot.sceneEntryByKey,
            });
            this.notifySceneBodySurfaceListeners(changedSceneBodySurfaceKeys);
            this.notifyScenePresentationListeners(changedScenePresentationKeys);
          }
        });
      }, dataAdmissionDelayMs);
      this.dataLaneTimers.set(sceneKey, timer);
    }

    return false;
  }

  private setSceneEntrySnapshot({
    sceneKey,
    sceneEntry,
  }: {
    sceneKey: AppRouteSceneStackKey;
    sceneEntry: SceneStackControllerSceneEntry | null;
  }): SceneStackControllerSnapshot['sceneEntryByKey'] {
    const sceneEntryByKey = {
      ...this.snapshot.sceneEntryByKey,
      [sceneKey]: sceneEntry,
    };
    if (sceneEntry == null) {
      delete sceneEntryByKey[sceneKey];
    }
    return sceneEntryByKey;
  }

  private syncSceneShellInput(
    sceneInputAuthority: AppRouteSceneInputAuthority,
    sceneKey: AppRouteSceneStackKey
  ): void {
    if (this.snapshot.activeSceneKey !== sceneKey) {
      return;
    }

    const sourceSceneEntry = sceneInputAuthority.getSceneInputSnapshot(sceneKey);
    const activeSceneFrameEntry = createFrameEntry(sourceSceneEntry);
    markSceneStackFrameEntryDiffs(
      this.snapshot.activeSceneFrameEntry,
      activeSceneFrameEntry,
      'syncSceneShellInput.activeSceneFrameEntry'
    );
    if (areFrameEntriesIdentical(this.snapshot.activeSceneFrameEntry, activeSceneFrameEntry)) {
      return;
    }
    const shouldNotifyFrameListeners = !areFrameEntryNativeFrameFieldsEqual(
      this.snapshot.activeSceneFrameEntry,
      activeSceneFrameEntry
    );
    if (shouldNotifyFrameListeners) {
      markSceneStackDiff('notify:frameInput:reason:syncSceneShellInput.activeSceneFrameEntry');
    }

    const nextSnapshot: SceneStackControllerSnapshot = {
      ...this.snapshot,
      activeSceneFrameEntry,
    };
    this.snapshot = nextSnapshot;
    this.activeSceneFrameSnapshot = this.createActiveSceneFrameSnapshot(
      nextSnapshot.activeSceneFrameEntry
    );
    if (!shouldNotifyFrameListeners) {
      return;
    }
    withSearchNavSwitchRuntimeAttribution('sceneStack', 'notify:frameInput', () => {
      this.frameListeners.forEach((listener) => {
        listener();
      });
    });
  }

  private syncSceneChromeInput(
    sceneInputAuthority: AppRouteSceneInputAuthority,
    sceneKey: AppRouteSceneStackKey
  ): void {
    const isMounted = this.snapshot.mountedSceneKeys.includes(sceneKey);
    const previousSceneEntry = this.snapshot.sceneEntryByKey[sceneKey] ?? null;
    const sourceSceneEntry = sceneInputAuthority.getSceneInputSnapshot(sceneKey);
    const nextSceneEntry = isMounted
      ? createStableLayerSceneEntryWithChrome({
          previousEntry: previousSceneEntry,
          sceneEntry: sourceSceneEntry,
        })
      : null;
    const sceneEntryByKey = this.setSceneEntrySnapshot({
      sceneKey,
      sceneEntry: nextSceneEntry,
    });
    const didChangeScenePresentation = this.syncScenePresentationSnapshot({
      sceneKey,
      sceneEntry: nextSceneEntry,
      isMounted,
    });
    const activeSceneChromeEntry =
      this.snapshot.activeSceneKey === sceneKey
        ? (nextSceneEntry?.chromeEntry ?? null)
        : this.snapshot.activeSceneChromeEntry;

    if (
      areLayerSceneEntriesEqual(previousSceneEntry, nextSceneEntry) &&
      areChromeEntriesEqual(this.snapshot.activeSceneChromeEntry, activeSceneChromeEntry) &&
      !didChangeScenePresentation
    ) {
      return;
    }

    const shouldNotifyActiveChromeListeners = !areChromeEntriesEqual(
      this.snapshot.activeSceneChromeEntry,
      activeSceneChromeEntry
    );
    const nextSnapshot: SceneStackControllerSnapshot = {
      ...this.snapshot,
      activeSceneChromeEntry,
      sceneEntryByKey,
    };
    this.snapshot = nextSnapshot;
    if (shouldNotifyActiveChromeListeners) {
      this.activeChromeSnapshot = this.createActiveChromeSnapshot(
        nextSnapshot.activeSceneChromeEntry
      );
      withSearchNavSwitchRuntimeAttribution('sceneStack', 'notify:activeChromeInput', () => {
        this.activeChromeListeners.forEach((listener) => {
          listener();
        });
      });
    }
    if (didChangeScenePresentation) {
      this.notifyScenePresentationListeners([sceneKey]);
    }
  }

  private syncSceneBodyInput(
    sceneInputAuthority: AppRouteSceneInputAuthority,
    sceneKey: AppRouteSceneStackKey
  ): void {
    const isMounted = this.snapshot.mountedSceneKeys.includes(sceneKey);
    const previousSceneEntry = this.snapshot.sceneEntryByKey[sceneKey] ?? null;
    const sourceSceneEntry = sceneInputAuthority.getSceneInputSnapshot(sceneKey);
    if (
      isMounted &&
      shouldDeferSceneBodyInputPublication({
        activeSceneKey: this.snapshot.activeSceneKey,
        sceneKey,
        sceneEntry: sourceSceneEntry,
        transitionPhase: this.snapshot.transitionPhase,
        previousSceneEntry,
      })
    ) {
      this.deferredSceneBodyInputKeys.add(sceneKey);
      return;
    }
    this.deferredSceneBodyInputKeys.delete(sceneKey);
    const nextSceneEntry = isMounted
      ? createStableLayerSceneEntryWithBody({
          previousEntry: previousSceneEntry,
          sceneEntry: sourceSceneEntry,
        })
      : null;
    const sceneEntryByKey = this.setSceneEntrySnapshot({
      sceneKey,
      sceneEntry: nextSceneEntry,
    });
    const didChangeSceneEntry = !areLayerSceneEntriesEqual(previousSceneEntry, nextSceneEntry);
    const didChangeSceneBody = this.syncSceneBodySnapshot({
      sceneKey,
      sceneEntry: nextSceneEntry,
      isMounted,
    });
    if (!didChangeSceneEntry && !didChangeSceneBody) {
      return;
    }
    this.snapshot = {
      ...this.snapshot,
      sceneEntryByKey,
    };
    if (didChangeSceneBody) {
      this.notifySceneBodySurfaceListeners(this.syncSceneBodySurfaceSnapshots([sceneKey]));
    }
  }

  private syncSceneInputSubscriptions({
    mountedSceneKeys,
    sceneInputAuthority,
  }: {
    mountedSceneKeys: readonly OverlayKey[];
    sceneInputAuthority: AppRouteSceneInputAuthority;
  }): void {
    const mountedInputKeys = new Set(mountedSceneKeys.filter(isAppRouteSceneStackKey));

    this.sceneInputUnsubscribersByKey.forEach((unsubscribers, sceneKey) => {
      if (mountedInputKeys.has(sceneKey)) {
        return;
      }
      unsubscribers.forEach((unsubscribe) => {
        unsubscribe();
      });
      this.sceneInputUnsubscribersByKey.delete(sceneKey);
    });

    mountedInputKeys.forEach((sceneKey) => {
      if (this.sceneInputUnsubscribersByKey.has(sceneKey)) {
        return;
      }
      this.sceneInputUnsubscribersByKey.set(sceneKey, [
        sceneInputAuthority.subscribeSceneShell(sceneKey, () => {
          this.syncSceneShellInput(sceneInputAuthority, sceneKey);
        }),
        sceneInputAuthority.subscribeSceneChrome(sceneKey, () => {
          this.syncSceneChromeInput(sceneInputAuthority, sceneKey);
        }),
        sceneInputAuthority.subscribeSceneBody(sceneKey, () => {
          this.syncSceneBodyInput(sceneInputAuthority, sceneKey);
        }),
      ]);
    });
  }

  private hasMountedSceneEntry(sceneKey: OverlayKey | null | undefined): boolean {
    return !isAppRouteSceneStackKey(sceneKey) || this.snapshot.sceneEntryByKey[sceneKey] != null;
  }

  private canApplyRouteSwitchPresentationUpdate({
    presentationFrame,
    routeSceneSwitchSnapshot,
  }: {
    presentationFrame: PresentationFrame;
    routeSceneSwitchSnapshot: RouteSceneSwitchSceneStackDispatchSnapshot;
  }): boolean {
    const activeSceneKey = routeSceneSwitchSnapshot.routeActiveSceneKey;
    // PF REWIRE (§9.3): the mount-defer gate keys on the frame's presented leg; the held leg is
    // frame.outgoingSceneKey. The frame is pulled LIVE per attempt (not queued at dispatch time),
    // so a superseding switch re-evaluates the defer against the NEWEST frame only (last-wins
    // collapses the defer queue — §9.1). Null presented = pre-first-commit; route truth stands in.
    const sheetPresentationSceneKey = presentationFrame.presentedSceneKey ?? activeSceneKey;
    const handoffSceneKey =
      routeSceneSwitchSnapshot.transitionPhase === 'idle'
        ? null
        : routeSceneSwitchSnapshot.handoffSceneKey;

    if (
      routeSceneSwitchSnapshot.transitionPhase === 'idle' &&
      this.deferredSceneBodyInputKeys.size > 0
    ) {
      return false;
    }
    // S-B slice 3a (red-team ledger item 8): a popped child's leg must UNMOUNT — the
    // mounted-keys filter only runs on the full recompute, so the fast path must yield
    // whenever a mounted CHILD key is no longer in the route stack (stack shrank).
    if (routeSceneSwitchSnapshot.transitionPhase === 'idle') {
      const routeStackSceneKeys = new Set(
        routeSceneSwitchSnapshot.overlayRouteStack.map((entry) => entry.key)
      );
      for (const mountedKey of this.mountedSceneKeys) {
        if (
          getAppOverlayRouteMetadata(mountedKey as OverlayKey).role === 'child' &&
          !routeStackSceneKeys.has(mountedKey as OverlayKey) &&
          mountedKey !== sheetPresentationSceneKey &&
          mountedKey !== handoffSceneKey &&
          mountedKey !== presentationFrame.outgoingSceneKey
        ) {
          return false;
        }
      }
    }
    if (
      routeSceneSwitchSnapshot.transitionPhase === 'idle' &&
      !this.staticSceneMountState.inactiveTabsPrewarmed
    ) {
      return false;
    }
    if (
      sheetPresentationSceneKey === 'polls' &&
      !this.staticSceneMountState.pollsPrewarmed &&
      !this.hasMountedSceneEntry('polls')
    ) {
      return false;
    }

    return (
      this.hasMountedSceneEntry(activeSceneKey) &&
      this.hasMountedSceneEntry(routeSceneSwitchSnapshot.pendingSceneKey) &&
      this.hasMountedSceneEntry(handoffSceneKey) &&
      this.hasMountedSceneEntry(sheetPresentationSceneKey) &&
      this.hasMountedSceneEntry(presentationFrame.outgoingSceneKey)
    );
  }

  private applyRouteSwitchPresentationUpdate({
    routeSceneSwitchRuntime,
    routeSceneSwitchSnapshot,
  }: {
    routeSceneSwitchRuntime: AppRouteSceneSwitchRuntime;
    routeSceneSwitchSnapshot: RouteSceneSwitchSceneStackDispatchSnapshot;
  }): boolean {
    // The LIVE committed frame — the PF flush runs FIRST in the controller's dispatch-flush
    // block, so this is fresh for whichever dispatch triggered us (§9.1 R7).
    const presentationFrame = routeSceneSwitchRuntime.getPresentationFrame();
    if (
      !this.canApplyRouteSwitchPresentationUpdate({
        presentationFrame,
        routeSceneSwitchSnapshot,
      })
    ) {
      return false;
    }

    withSearchNavSwitchRuntimeAttribution('sceneStack', 'routeSwitchPresentation', () => {
      const activeSceneKey = routeSceneSwitchSnapshot.routeActiveSceneKey;
      const interactiveSceneKey = routeSceneSwitchSnapshot.interactiveSceneKey;
      const handoffSceneKey =
        routeSceneSwitchSnapshot.transitionPhase === 'idle'
          ? null
          : routeSceneSwitchSnapshot.handoffSceneKey;
      // PF REWIRE (§9.2 site 2 / §9.3): the presented scene IS frame.presentedSceneKey — the old
      // outgoing-hold preserve branch is subsumed by frame.outgoingSceneKey, never re-derived.
      const sheetPresentationSceneKey = presentationFrame.presentedSceneKey;
      const activitySceneKey = sheetPresentationSceneKey ?? activeSceneKey;
      // INTERACTIVE RULE (§9.1): the interactive scene is the presented leg ('polls' is already
      // the presented key under laneKind==='docked-polls'); the input-owner is the OUTGOING leg
      // while a held window is open. Null presented = pre-first-commit; route truth stands in.
      const activityInteractiveSceneKey =
        sheetPresentationSceneKey == null
          ? interactiveSceneKey
          : (presentationFrame.outgoingSceneKey ?? sheetPresentationSceneKey);
      const mountedSceneKeys = this.snapshot.mountedSceneKeys;
      const sceneEntryByKey = this.snapshot.sceneEntryByKey;
      // W1 slice 1 — entry-keyed child mounts follow the SAME dispatch cadence as the frame.
      const changedEntryMountSceneKeys = this.syncSceneEntryMountUnits({
        overlayRouteStack: routeSceneSwitchSnapshot.overlayRouteStack,
        outgoingEntryId: presentationFrame.outgoingEntryId,
      });
      const activeSceneEntry =
        activeSceneKey == null ? null : (sceneEntryByKey[activeSceneKey] ?? null);
      const nextSnapshot: SceneStackControllerSnapshot = {
        activeSceneKey,
        interactiveSceneKey,
        handoffSceneKey,
        transitionPhase: routeSceneSwitchSnapshot.transitionPhase,
        isInteractive: routeSceneSwitchSnapshot.isInteractive,
        mountedSceneKeys,
        activeSceneFrameEntry: activeSceneEntry?.frameEntry ?? null,
        activeSceneChromeEntry:
          activeSceneKey == null ? null : (sceneEntryByKey[activeSceneKey]?.chromeEntry ?? null),
        sceneEntryByKey,
      };

      if (areLayerSnapshotsEqual(this.snapshot, nextSnapshot)) {
        // Entry-mount units can change with an otherwise-identical layer snapshot (a settle
        // commit clearing the outgoing hold; a same-key push under one leg) — publish them.
        if (changedEntryMountSceneKeys.length > 0) {
          this.notifySceneBodySurfaceListeners(
            this.syncSceneBodySurfaceSnapshots(changedEntryMountSceneKeys)
          );
        }
        return;
      }

      const shouldUpdateFrameSnapshot = !areFrameEntriesIdentical(
        this.snapshot.activeSceneFrameEntry,
        nextSnapshot.activeSceneFrameEntry
      );
      const shouldNotifyFrameListeners = !areFrameEntryNativeFrameFieldsEqual(
        this.snapshot.activeSceneFrameEntry,
        nextSnapshot.activeSceneFrameEntry
      );
      const shouldNotifyActiveChromeListeners = !areChromeEntriesEqual(
        this.snapshot.activeSceneChromeEntry,
        nextSnapshot.activeSceneChromeEntry
      );
      const changedSceneActivityKeys = withSearchNavSwitchRuntimeAttribution(
        'sceneStack',
        'routeSwitchPresentation:syncSceneActivitySnapshots',
        () =>
          this.syncSceneActivitySnapshots({
            previousMountedSceneKeys: mountedSceneKeys,
            mountedSceneKeys: nextSnapshot.mountedSceneKeys,
            previousActiveSceneKey: this.snapshot.activeSceneKey,
            activeSceneKey: activitySceneKey,
            previousInteractiveSceneKey: this.snapshot.interactiveSceneKey,
            interactiveSceneKey: activityInteractiveSceneKey,
            previousHandoffSceneKey: this.snapshot.handoffSceneKey,
            handoffSceneKey: nextSnapshot.handoffSceneKey,
            transitionPhase: nextSnapshot.transitionPhase,
            isInteractive: nextSnapshot.isInteractive,
            sceneEntryByKey: nextSnapshot.sceneEntryByKey,
          })
      );
      const bodySurfaceKeysToSync = Array.from(
        new Set([...changedSceneActivityKeys, ...changedEntryMountSceneKeys])
      );
      const changedSceneBodySurfaceKeys =
        bodySurfaceKeysToSync.length === 0
          ? []
          : withSearchNavSwitchRuntimeAttribution(
              'sceneStack',
              'routeSwitchPresentation:syncSceneBodySurfaceSnapshots',
              () => this.syncSceneBodySurfaceSnapshots(bodySurfaceKeysToSync)
            );
      const changedScenePresentationKeys =
        changedSceneActivityKeys.length === 0
          ? []
          : withSearchNavSwitchRuntimeAttribution(
              'sceneStack',
              'routeSwitchPresentation:syncScenePresentationSnapshots',
              () =>
                this.syncScenePresentationSnapshots({
                  sceneKeysToCheck: changedSceneActivityKeys,
                  mountedSceneKeys: nextSnapshot.mountedSceneKeys,
                  sceneEntryByKey: nextSnapshot.sceneEntryByKey,
                })
            );

      this.snapshot = nextSnapshot;
      if (shouldUpdateFrameSnapshot) {
        this.activeSceneFrameSnapshot = this.createActiveSceneFrameSnapshot(
          nextSnapshot.activeSceneFrameEntry
        );
      }
      if (shouldNotifyActiveChromeListeners) {
        this.activeChromeSnapshot = this.createActiveChromeSnapshot(
          nextSnapshot.activeSceneChromeEntry
        );
        withSearchNavSwitchRuntimeAttribution('sceneStack', 'notify:activeChrome', () => {
          this.activeChromeListeners.forEach((listener) => {
            listener();
          });
        });
      }
      if (changedSceneBodySurfaceKeys.length > 0) {
        this.notifySceneBodySurfaceListeners(changedSceneBodySurfaceKeys);
      }
      if (changedScenePresentationKeys.length > 0) {
        this.notifyScenePresentationListeners(changedScenePresentationKeys);
      }
      if (shouldNotifyFrameListeners) {
        withSearchNavSwitchRuntimeAttribution('sceneStack', 'notify:frame', () => {
          this.frameListeners.forEach((listener) => {
            listener();
          });
        });
      }
    });

    return true;
  }

  private recomputeTransitionSlice({
    sceneInputAuthority,
    routeSceneSwitchRuntime,
    source,
    routeSceneSwitchSnapshot,
  }: {
    sceneInputAuthority: AppRouteSceneInputAuthority;
    routeSceneSwitchRuntime: AppRouteSceneSwitchRuntime;
    source: string;
    routeSceneSwitchSnapshot?: RouteSceneSwitchSceneStackDispatchSnapshot;
  }): void {
    withSearchNavSwitchRuntimeAttribution(
      'sceneStack',
      `recomputeTransitionSlice:${source}`,
      () => {
        const resolvedRouteSceneSwitchSnapshot =
          routeSceneSwitchSnapshot ??
          resolveRouteSceneSwitchSceneStackDispatchSnapshot(
            routeSceneSwitchRuntime.getTransitionState()
          );
        const activeSceneKey = resolvedRouteSceneSwitchSnapshot.routeActiveSceneKey;
        const interactiveSceneKey = resolvedRouteSceneSwitchSnapshot.interactiveSceneKey;
        // PF REWIRE (§9.2 site 2 / §9.3): the presented scene IS frame.presentedSceneKey — the
        // old outgoing-hold preserve branch is subsumed by frame.outgoingSceneKey, never
        // re-derived. The frame is pulled LIVE (the PF flush runs first on every cadence that
        // reaches here), so a superseded recompute lands on the NEWEST frame (last-wins — §9.1).
        const presentationFrame = routeSceneSwitchRuntime.getPresentationFrame();
        const areStaticTabScenesReady = areStaticTabSceneInputsReady(sceneInputAuthority);
        const handoffSceneKey =
          resolvedRouteSceneSwitchSnapshot.transitionPhase === 'idle'
            ? null
            : resolvedRouteSceneSwitchSnapshot.handoffSceneKey;
        const sheetPresentationSceneKey = presentationFrame.presentedSceneKey;
        const activitySceneKey = sheetPresentationSceneKey ?? activeSceneKey;
        // INTERACTIVE RULE (§9.1): the interactive scene is the presented leg ('polls' is
        // already the presented key under laneKind==='docked-polls'); the input-owner is the
        // OUTGOING leg while a held window is open. Null presented = pre-first-commit.
        const activityInteractiveSceneKey =
          sheetPresentationSceneKey == null
            ? interactiveSceneKey
            : (presentationFrame.outgoingSceneKey ?? sheetPresentationSceneKey);
        const previousMountedSceneKeys = this.snapshot.mountedSceneKeys;
        const { state: staticSceneMountState, snapshot: staticSceneMountSnapshot } =
          withSearchNavSwitchRuntimeAttribution(
            'sceneStack',
            'transition:resolveStaticSceneMount',
            () =>
              resolveAppRouteStaticSceneMount({
                state: this.staticSceneMountState,
                activeSceneKey: activitySceneKey,
                transitionPhase: resolvedRouteSceneSwitchSnapshot.transitionPhase,
                areStaticTabScenesReady,
                isPollsSceneReady: isPollsSceneInputReady(sceneInputAuthority),
              })
          );
        this.staticSceneMountState = staticSceneMountState;
        const overlayRouteStack = routeSceneSwitchRuntime.getRouteState().overlayRouteStack;
        // W1 slice 1 — entry-keyed child mounts recompute on the same cadence as the key set.
        const changedEntryMountSceneKeys = this.syncSceneEntryMountUnits({
          overlayRouteStack,
          outgoingEntryId: presentationFrame.outgoingEntryId,
        });
        this.mountedSceneKeys = new Set(
          withSearchNavSwitchRuntimeAttribution(
            'sceneStack',
            'transition:resolveMountedSceneKeys',
            () =>
              resolveMountedSceneKeys({
                previousMountedSceneKeys: this.mountedSceneKeys,
                activeSceneKey,
                sheetPresentationSceneKey,
                pendingSceneKey: resolvedRouteSceneSwitchSnapshot.pendingSceneKey,
                handoffSceneKey,
                staticSceneMountSnapshot,
                routeStackSceneKeys: new Set(overlayRouteStack.map((entry) => entry.key)),
              })
          )
        );
        const mountedSceneKeys = withSearchNavSwitchRuntimeAttribution(
          'sceneStack',
          'transition:orderMountedSceneKeys',
          () => orderMountedSceneKeys(this.mountedSceneKeys)
        );
        withSearchNavSwitchRuntimeAttribution(
          'sceneStack',
          'transition:syncSceneInputSubscriptions',
          () => {
            this.syncSceneInputSubscriptions({
              mountedSceneKeys,
              sceneInputAuthority,
            });
          }
        );
        const bodyRefreshSceneKeys = new Set<OverlayKey>();
        if (resolvedRouteSceneSwitchSnapshot.transitionPhase === 'idle') {
          this.deferredSceneBodyInputKeys.forEach((sceneKey) => {
            bodyRefreshSceneKeys.add(sceneKey);
          });
        }
        withSearchNavSwitchRuntimeAttribution(
          'sceneStack',
          'transition:filterBodyRefreshSceneKeys',
          () => {
            bodyRefreshSceneKeys.forEach((sceneKey) => {
              if (
                shouldRetainSceneBodySnapshotDuringTransition({
                  transitionPhase: resolvedRouteSceneSwitchSnapshot.transitionPhase,
                  previousSceneEntry: this.snapshot.sceneEntryByKey[sceneKey],
                })
              ) {
                bodyRefreshSceneKeys.delete(sceneKey);
              }
            });
          }
        );
        const sceneEntryByKey = withSearchNavSwitchRuntimeAttribution(
          'sceneStack',
          'transition:resolveSceneEntryByKey',
          () =>
            resolveSceneEntryByKey({
              mountedSceneKeys,
              previousMountedSceneKeys,
              previousSceneEntryByKey: this.snapshot.sceneEntryByKey,
              bodyRefreshSceneKeys,
              sceneInputAuthority,
            })
        );
        bodyRefreshSceneKeys.forEach((sceneKey) => {
          if (isAppRouteSceneStackKey(sceneKey)) {
            this.deferredSceneBodyInputKeys.delete(sceneKey);
          }
        });
        const activeSceneEntry =
          activeSceneKey == null ? null : (sceneEntryByKey[activeSceneKey] ?? null);

        const nextSnapshot: SceneStackControllerSnapshot = {
          activeSceneKey,
          interactiveSceneKey,
          handoffSceneKey,
          transitionPhase: resolvedRouteSceneSwitchSnapshot.transitionPhase,
          isInteractive: resolvedRouteSceneSwitchSnapshot.isInteractive,
          mountedSceneKeys,
          activeSceneFrameEntry: activeSceneEntry?.frameEntry ?? null,
          activeSceneChromeEntry:
            activeSceneKey == null ? null : (sceneEntryByKey[activeSceneKey]?.chromeEntry ?? null),
          sceneEntryByKey,
        };

        markSceneStackFieldDiff(
          'routeSwitch.routeActiveSceneKey',
          this.snapshot.activeSceneKey,
          nextSnapshot.activeSceneKey
        );
        markSceneStackFieldDiff(
          'routeSwitch.interactiveSceneKey',
          this.snapshot.interactiveSceneKey,
          nextSnapshot.interactiveSceneKey
        );
        markSceneStackFieldDiff(
          'routeSwitch.handoffSceneKey',
          this.snapshot.handoffSceneKey,
          nextSnapshot.handoffSceneKey
        );
        markSceneStackFieldDiff(
          'routeSwitch.pendingSceneKey',
          null,
          resolvedRouteSceneSwitchSnapshot.pendingSceneKey
        );
        markSceneStackFieldDiff(
          'routeSwitch.transitionPhase',
          this.snapshot.transitionPhase,
          nextSnapshot.transitionPhase
        );
        markSceneStackFieldDiff(
          'routeSwitch.isInteractive',
          this.snapshot.isInteractive,
          nextSnapshot.isInteractive
        );
        markSceneStackArrayDiff(
          'mountedSceneKeys',
          this.snapshot.mountedSceneKeys,
          nextSnapshot.mountedSceneKeys
        );
        markSceneStackFrameEntryDiffs(
          this.snapshot.activeSceneFrameEntry,
          nextSnapshot.activeSceneFrameEntry,
          'activeSceneFrameEntry'
        );
        markSceneStackChromeEntryDiffs(
          this.snapshot.activeSceneChromeEntry,
          nextSnapshot.activeSceneChromeEntry,
          'activeSceneChromeEntry'
        );
        markSceneStackArrayDiff(
          'bodyRefreshSceneKeys',
          [],
          Array.from(bodyRefreshSceneKeys).sort()
        );

        if (areLayerSnapshotsEqual(this.snapshot, nextSnapshot)) {
          // Entry-mount units can change with an otherwise-identical layer snapshot (settle
          // clearing the outgoing hold; same-key push under one leg) — publish them.
          if (changedEntryMountSceneKeys.length > 0) {
            this.notifySceneBodySurfaceListeners(
              this.syncSceneBodySurfaceSnapshots(changedEntryMountSceneKeys)
            );
          }
          return;
        }

        const shouldUpdateFrameSnapshot = !areFrameEntriesIdentical(
          this.snapshot.activeSceneFrameEntry,
          nextSnapshot.activeSceneFrameEntry
        );
        const shouldNotifyFrameListeners = !areFrameEntryNativeFrameFieldsEqual(
          this.snapshot.activeSceneFrameEntry,
          nextSnapshot.activeSceneFrameEntry
        );
        const shouldNotifyMountedSceneListeners = !areOverlayKeyArraysEqual(
          this.snapshot.mountedSceneKeys,
          nextSnapshot.mountedSceneKeys
        );
        const shouldNotifyActiveChromeListeners = !areChromeEntriesEqual(
          this.snapshot.activeSceneChromeEntry,
          nextSnapshot.activeSceneChromeEntry
        );
        const sceneBodyKeysToSync = [
          ...mountedSceneKeys.filter((sceneKey) => !previousMountedSceneKeys.includes(sceneKey)),
          ...previousMountedSceneKeys.filter((sceneKey) => !mountedSceneKeys.includes(sceneKey)),
          ...Array.from(bodyRefreshSceneKeys),
        ];
        const changedSceneBodyKeys =
          sceneBodyKeysToSync.length === 0
            ? []
            : withSearchNavSwitchRuntimeAttribution(
                'sceneStack',
                'transition:syncSceneBodySnapshots',
                () =>
                  this.syncSceneBodySnapshots({
                    sceneKeysToCheck: sceneBodyKeysToSync,
                    mountedSceneKeys: nextSnapshot.mountedSceneKeys,
                    sceneEntryByKey: nextSnapshot.sceneEntryByKey,
                  })
              );
        const changedSceneActivityKeys = withSearchNavSwitchRuntimeAttribution(
          'sceneStack',
          'transition:syncSceneActivitySnapshots',
          () =>
            this.syncSceneActivitySnapshots({
              previousMountedSceneKeys,
              mountedSceneKeys: nextSnapshot.mountedSceneKeys,
              previousActiveSceneKey: this.snapshot.activeSceneKey,
              activeSceneKey: activitySceneKey,
              previousInteractiveSceneKey: this.snapshot.interactiveSceneKey,
              interactiveSceneKey: activityInteractiveSceneKey,
              previousHandoffSceneKey: this.snapshot.handoffSceneKey,
              handoffSceneKey: nextSnapshot.handoffSceneKey,
              transitionPhase: nextSnapshot.transitionPhase,
              isInteractive: nextSnapshot.isInteractive,
              sceneEntryByKey: nextSnapshot.sceneEntryByKey,
            })
        );
        const sceneBodySurfaceKeysToSync = Array.from(
          new Set([
            ...changedSceneBodyKeys,
            ...changedSceneActivityKeys,
            ...changedEntryMountSceneKeys,
          ])
        );
        const changedSceneBodySurfaceKeys =
          sceneBodySurfaceKeysToSync.length === 0
            ? []
            : withSearchNavSwitchRuntimeAttribution(
                'sceneStack',
                'transition:syncSceneBodySurfaceSnapshots',
                () => this.syncSceneBodySurfaceSnapshots(sceneBodySurfaceKeysToSync)
              );
        const scenePresentationKeysToSync = Array.from(
          new Set([
            ...mountedSceneKeys.filter((sceneKey) => !previousMountedSceneKeys.includes(sceneKey)),
            ...previousMountedSceneKeys.filter((sceneKey) => !mountedSceneKeys.includes(sceneKey)),
            ...changedSceneActivityKeys,
          ])
        );
        const changedScenePresentationKeys =
          scenePresentationKeysToSync.length === 0
            ? []
            : withSearchNavSwitchRuntimeAttribution(
                'sceneStack',
                'transition:syncScenePresentationSnapshots',
                () =>
                  this.syncScenePresentationSnapshots({
                    sceneKeysToCheck: scenePresentationKeysToSync,
                    mountedSceneKeys: nextSnapshot.mountedSceneKeys,
                    sceneEntryByKey: nextSnapshot.sceneEntryByKey,
                  })
              );
        if (shouldNotifyFrameListeners) {
          markSceneStackDiff('notify:frame:reason:activeSceneFrameEntry');
        }
        if (shouldNotifyMountedSceneListeners) {
          markSceneStackDiff('notify:mountedScenes:reason:mountedSceneKeys');
        }
        if (shouldNotifyActiveChromeListeners) {
          markSceneStackDiff('notify:activeChrome:reason:activeSceneChromeEntry');
        }
        markSceneStackArrayDiff('sceneBodyKeysToSync', [], [...sceneBodyKeysToSync].sort());
        markSceneStackArrayDiff('changedSceneBodyKeys', [], [...changedSceneBodyKeys].sort());
        markSceneStackArrayDiff(
          'changedSceneActivityKeys',
          [],
          [...changedSceneActivityKeys].sort()
        );
        markSceneStackArrayDiff(
          'changedSceneBodySurfaceKeys',
          [],
          [...changedSceneBodySurfaceKeys].sort()
        );
        markSceneStackArrayDiff(
          'changedScenePresentationKeys',
          [],
          [...changedScenePresentationKeys].sort()
        );
        this.snapshot = nextSnapshot;
        if (shouldUpdateFrameSnapshot) {
          this.activeSceneFrameSnapshot = this.createActiveSceneFrameSnapshot(
            nextSnapshot.activeSceneFrameEntry
          );
        }
        if (shouldNotifyMountedSceneListeners) {
          this.mountedScenesSnapshot = this.createMountedScenesSnapshot(
            nextSnapshot.mountedSceneKeys
          );
          withSearchNavSwitchRuntimeAttribution('sceneStack', 'notify:mountedScenes', () => {
            this.mountedSceneListeners.forEach((listener) => {
              listener();
            });
          });
        }
        if (shouldNotifyActiveChromeListeners) {
          this.activeChromeSnapshot = this.createActiveChromeSnapshot(
            nextSnapshot.activeSceneChromeEntry
          );
          withSearchNavSwitchRuntimeAttribution('sceneStack', 'notify:activeChrome', () => {
            this.activeChromeListeners.forEach((listener) => {
              listener();
            });
          });
        }
        if (changedSceneBodySurfaceKeys.length > 0) {
          this.notifySceneBodySurfaceListeners(changedSceneBodySurfaceKeys);
        }
        if (changedScenePresentationKeys.length > 0) {
          this.notifyScenePresentationListeners(changedScenePresentationKeys);
        }
        if (shouldNotifyFrameListeners) {
          withSearchNavSwitchRuntimeAttribution('sceneStack', 'notify:frame', () => {
            this.frameListeners.forEach((listener) => {
              listener();
            });
          });
        }
      }
    );
  }
}

// NOTE: the PF rewire (§9.2 site 2) deleted this runtime's display-snapshot reads (presentation
// now comes from the frame), so the runtime takes no routeOverlayDisplayAuthority anymore.
export const createAppRouteSceneStackRuntime = ({
  sceneInputAuthority,
  routeSceneSwitchRuntime,
}: {
  sceneInputAuthority: AppRouteSceneInputAuthority;
  routeSceneSwitchRuntime: AppRouteSceneSwitchRuntime;
}): AppRouteSceneStackRuntime => {
  const stackController = new AppRouteSceneStackLayerStateController({
    sceneInputAuthority,
    routeSceneSwitchRuntime,
  });

  return {
    sceneFrameAuthority: stackController.sceneFrameAuthority,
    sceneStackSurfaceAuthority: stackController.sceneStackSurfaceAuthority,
    dispose: () => {
      stackController.dispose();
    },
  };
};
