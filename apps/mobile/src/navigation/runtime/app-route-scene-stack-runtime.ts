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
import type {
  RouteSceneSwitchSheetContentHandoff,
  RouteSceneSwitchTransitionPhase,
} from './app-overlay-route-transition-contract';
import type {
  AppRouteSceneSwitchRuntime,
  RouteSceneSwitchSceneStackDispatchSnapshot,
} from './app-route-scene-switch-controller';
import { resolveRouteSceneSwitchSceneStackDispatchSnapshot } from './app-route-scene-switch-controller';
import type { RouteOverlayDisplaySnapshot } from './route-overlay-display-snapshot-contract';
import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../perf/perf-scenario-runtime-store';

type Listener = () => void;

type SnapshotAuthority<TSnapshot> = {
  getSnapshot: () => TSnapshot;
};

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

  if (
    !nextState.pollsPrewarmed &&
    activeSceneKey === 'search' &&
    isPollsSceneReady &&
    transitionPhase === 'idle'
  ) {
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
    `${prefix}:shellSpec.initialSnapPoint`,
    leftShellSpec?.initialSnapPoint ?? null,
    rightShellSpec?.initialSnapPoint ?? null
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
    `${prefix}:shellSpec.runtimeModel`,
    leftShellSpec?.runtimeModel ?? null,
    rightShellSpec?.runtimeModel ?? null
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
  return areLayerSceneEntriesEqual(previousEntry, nextEntry) ? previousEntry ?? null : nextEntry;
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

  return areLayerSceneEntriesEqual(previousEntry, nextEntry) ? previousEntry ?? null : nextEntry;
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

  return areLayerSceneEntriesEqual(previousEntry, nextEntry) ? previousEntry ?? null : nextEntry;
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
    surfaceVisualPolicy.phase === 'results_dismissing' &&
    surfaceVisualPolicy.canDisplayPersistentPollSubstrate &&
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
    surfaceVisualPolicy.phase === 'results_dismissing' &&
    surfaceVisualPolicy.canDisplayPersistentPollSubstrate &&
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

const resolveMountedSceneKeys = ({
  previousMountedSceneKeys,
  activeSceneKey,
  sheetPresentationSceneKey,
  pendingSceneKey,
  handoffSceneKey,
  staticSceneMountSnapshot,
}: {
  previousMountedSceneKeys: ReadonlySet<AppRouteSceneStackKey>;
  activeSceneKey: OverlayKey | null;
  sheetPresentationSceneKey: OverlayKey | null;
  pendingSceneKey: OverlayKey | null;
  handoffSceneKey: OverlayKey | null;
  staticSceneMountSnapshot: AppRouteStaticSceneMountSnapshot;
}): ReadonlySet<AppRouteSceneStackKey> => {
  const mountedSceneKeys = new Set(previousMountedSceneKeys);
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

const resolveSheetPresentationSceneKey = ({
  routeActiveSceneKey,
  routeOverlayDisplaySnapshot,
}: {
  routeActiveSceneKey: OverlayKey | null;
  routeOverlayDisplaySnapshot: RouteOverlayDisplaySnapshot;
}): OverlayKey | null =>
  routeOverlayDisplaySnapshot.isPersistentPollLane ? 'polls' : routeActiveSceneKey;

const resolveTransitionSheetPresentationSceneKey = ({
  routeActiveSceneKey,
  routeOverlayDisplaySnapshot,
  handoffSceneKey,
  sheetContentHandoff,
  transitionPhase,
}: {
  routeActiveSceneKey: OverlayKey | null;
  routeOverlayDisplaySnapshot: RouteOverlayDisplaySnapshot;
  handoffSceneKey: OverlayKey | null;
  sheetContentHandoff: RouteSceneSwitchSheetContentHandoff;
  transitionPhase: RouteSceneSwitchTransitionPhase;
}): OverlayKey | null => {
  if (
    transitionPhase !== 'idle' &&
    sheetContentHandoff === 'preserveOutgoingUntilSettle' &&
    handoffSceneKey != null
  ) {
    return handoffSceneKey;
  }
  return resolveSheetPresentationSceneKey({
    routeActiveSceneKey,
    routeOverlayDisplaySnapshot,
  });
};

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
    routeOverlayDisplayAuthority,
  }: {
    sceneInputAuthority: AppRouteSceneInputAuthority;
    routeSceneSwitchRuntime: AppRouteSceneSwitchRuntime;
    routeOverlayDisplayAuthority: SnapshotAuthority<RouteOverlayDisplaySnapshot>;
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
        routeOverlayDisplayAuthority,
        source,
        routeSceneSwitchSnapshot,
      });

    recomputeTransitionSlice('initial');
    this.unsubscribers.push(
      routeSceneSwitchRuntime.setRouteSceneStackTransitionDispatchTarget(
        (routeSceneSwitchSnapshot) => {
          if (
            this.applyRouteSwitchPresentationUpdate({
              routeOverlayDisplayAuthority,
              routeSceneSwitchSnapshot,
            })
          ) {
            return;
          }
          recomputeTransitionSlice('routeSceneSwitchDispatchTarget', routeSceneSwitchSnapshot);
        }
      ),
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
    this.sceneBodySurfaceSnapshots.clear();
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
    const expectedContract = PERSISTENT_POLL_IDLE_SHEET_HEADER_RESTORATION_CONTRACT;
    const contentActivity = {
      shouldAttachMountedContent: bodySurfaceSnapshot.contentActivity.shouldAttachMountedContent,
      shouldRunDataLane: bodySurfaceSnapshot.contentActivity.shouldRunDataLane,
      shouldSubscribeDataLane: bodySurfaceSnapshot.contentActivity.shouldSubscribeDataLane,
    };
    const searchSurfaceRuntime = getSearchSurfaceRuntime();
    const dismissTransaction = searchSurfaceRuntime.getSnapshot().dismissTransaction;
    const hasMountedPollHeader =
      headerEntry?.surfaceKind === 'mounted' &&
      headerEntry.mountedChromeKey === expectedContract.mountedChromeKey;
    const hasMountedPollBody =
      mountedBodyKey === 'polls' && contentActivity.shouldAttachMountedContent;
    const hasPollBodyContentLane =
      hasMountedPollBody &&
      contentActivity.shouldRunDataLane &&
      contentActivity.shouldSubscribeDataLane;
    if (dismissTransaction != null) {
      if (hasMountedPollHeader) {
        searchSurfaceRuntime.markPollPagePartReady(
          'header',
          dismissTransaction.id,
          `sceneStack:${source}:header`
        );
      }
      if (hasPollBodyContentLane) {
        searchSurfaceRuntime.markPollPagePartReady(
          'body',
          dismissTransaction.id,
          `sceneStack:${source}:body`
        );
      }
      if (presentationSnapshot.isMounted && hasMountedPollHeader && hasPollBodyContentLane) {
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

  private createSceneBodySurfaceSnapshot({
    bodySnapshot,
    activitySnapshot,
  }: {
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
    const bodySurfaceKind = bodySnapshot.contentEntry.bodyContentSpec.surfaceKind;
    const isMountedBodySurface = bodySurfaceKind === 'mounted';

    return {
      contentEntry: bodySnapshot.contentEntry,
      transportEntry: bodySnapshot.transportEntry,
      contentActivity: {
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
    };
  }

  private shouldCompareSceneBodyDataActivity(
    snapshot: AppRouteSceneStackBodySurfaceSnapshot
  ): boolean {
    const sceneKey = snapshot.contentEntry?.sceneKey;
    return sceneKey === 'polls' || sceneKey === 'pollCreation' || sceneKey === 'saveList';
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
          (left.contentActivity.shouldRenderListBody ===
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

  private notifySceneBodySurfaceListeners(sceneKeys: readonly OverlayKey[]): void {
    withSearchNavSwitchRuntimeAttribution('sceneStack', 'notify:sceneBodySurface', () => {
      sceneKeys.forEach((sceneKey) => {
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
    const hasActivatedExpandedContent =
      shouldRetainMountedBody && this.retainedExpandedContentSceneKeys.has(sceneKey);
    const canAdmitInteractiveDataLane = canInteract && activationPhase === 'interactive';
    const canPrewarmRetainedMountedBody =
      shouldRetainMountedBody &&
      shouldPrewarmRetainedMountedSceneBody(bodyAdmissionPolicy) &&
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
      canPrewarmRetainedMountedBody ||
      canPrewarmSearchDismissPollData;
    const isDataLaneReady = this.isSceneDataLaneReady({
      sceneKey,
      canAdmitDataLane,
      allowInactiveDataLaneAdmission:
        canPrewarmRetainedMountedBody || canPrewarmSearchDismissPollData,
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
    const shouldSubscribeDataLane =
      shouldRunDataLane ||
      (bodyAdmissionPolicy?.keepDataSubscribedAfterActivation === true &&
        nextHasActivatedExpandedContent);
    const shouldRenderExpandedContent = shouldRetainMountedBody
      ? nextHasActivatedExpandedContent || shouldRunDataLane
      : canInteract && activationPhase === 'interactive';

    return {
      isMounted: true,
      isActive,
      isInteractive: canInteract,
      shouldRenderListBody: isActive || shouldRetainSceneListBody(bodyAdmissionPolicy),
      shouldAttachMountedContent: canInteract || shouldRetainMountedBody,
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
        ? nextSceneEntry?.chromeEntry ?? null
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
    routeOverlayDisplaySnapshot,
    routeSceneSwitchSnapshot,
  }: {
    routeOverlayDisplaySnapshot: RouteOverlayDisplaySnapshot;
    routeSceneSwitchSnapshot: RouteSceneSwitchSceneStackDispatchSnapshot;
  }): boolean {
    const activeSceneKey = routeSceneSwitchSnapshot.routeActiveSceneKey;
    const sheetPresentationSceneKey = resolveSheetPresentationSceneKey({
      routeActiveSceneKey: activeSceneKey,
      routeOverlayDisplaySnapshot,
    });
    const handoffSceneKey =
      routeSceneSwitchSnapshot.transitionPhase === 'idle'
        ? null
        : routeSceneSwitchSnapshot.handoffSceneKey;
    const transitionSheetPresentationSceneKey = resolveTransitionSheetPresentationSceneKey({
      routeActiveSceneKey: activeSceneKey,
      routeOverlayDisplaySnapshot,
      handoffSceneKey,
      sheetContentHandoff: routeSceneSwitchSnapshot.sheetContentHandoff,
      transitionPhase: routeSceneSwitchSnapshot.transitionPhase,
    });

    if (
      routeSceneSwitchSnapshot.transitionPhase === 'idle' &&
      this.deferredSceneBodyInputKeys.size > 0
    ) {
      return false;
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
      this.hasMountedSceneEntry(transitionSheetPresentationSceneKey)
    );
  }

  private applyRouteSwitchPresentationUpdate({
    routeOverlayDisplayAuthority,
    routeSceneSwitchSnapshot,
  }: {
    routeOverlayDisplayAuthority: SnapshotAuthority<RouteOverlayDisplaySnapshot>;
    routeSceneSwitchSnapshot: RouteSceneSwitchSceneStackDispatchSnapshot;
  }): boolean {
    const routeOverlayDisplaySnapshot = routeOverlayDisplayAuthority.getSnapshot();
    if (
      !this.canApplyRouteSwitchPresentationUpdate({
        routeOverlayDisplaySnapshot,
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
      const sheetPresentationSceneKey = resolveTransitionSheetPresentationSceneKey({
        routeActiveSceneKey: activeSceneKey,
        routeOverlayDisplaySnapshot,
        handoffSceneKey,
        sheetContentHandoff: routeSceneSwitchSnapshot.sheetContentHandoff,
        transitionPhase: routeSceneSwitchSnapshot.transitionPhase,
      });
      const activitySceneKey = sheetPresentationSceneKey ?? activeSceneKey;
      const activityInteractiveSceneKey = routeOverlayDisplaySnapshot.isPersistentPollLane
        ? sheetPresentationSceneKey
        : interactiveSceneKey;
      const mountedSceneKeys = this.snapshot.mountedSceneKeys;
      const sceneEntryByKey = this.snapshot.sceneEntryByKey;
      const activeSceneEntry =
        activeSceneKey == null ? null : sceneEntryByKey[activeSceneKey] ?? null;
      const nextSnapshot: SceneStackControllerSnapshot = {
        activeSceneKey,
        interactiveSceneKey,
        handoffSceneKey,
        transitionPhase: routeSceneSwitchSnapshot.transitionPhase,
        isInteractive: routeSceneSwitchSnapshot.isInteractive,
        mountedSceneKeys,
        activeSceneFrameEntry: activeSceneEntry?.frameEntry ?? null,
        activeSceneChromeEntry:
          activeSceneKey == null ? null : sceneEntryByKey[activeSceneKey]?.chromeEntry ?? null,
        sceneEntryByKey,
      };

      if (areLayerSnapshotsEqual(this.snapshot, nextSnapshot)) {
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
      const changedSceneBodySurfaceKeys =
        changedSceneActivityKeys.length === 0
          ? []
          : withSearchNavSwitchRuntimeAttribution(
              'sceneStack',
              'routeSwitchPresentation:syncSceneBodySurfaceSnapshots',
              () => this.syncSceneBodySurfaceSnapshots(changedSceneActivityKeys)
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
    routeOverlayDisplayAuthority,
    source,
    routeSceneSwitchSnapshot,
  }: {
    sceneInputAuthority: AppRouteSceneInputAuthority;
    routeSceneSwitchRuntime: AppRouteSceneSwitchRuntime;
    routeOverlayDisplayAuthority: SnapshotAuthority<RouteOverlayDisplaySnapshot>;
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
        const routeOverlayDisplaySnapshot = routeOverlayDisplayAuthority.getSnapshot();
        const areStaticTabScenesReady = areStaticTabSceneInputsReady(sceneInputAuthority);
        const handoffSceneKey =
          resolvedRouteSceneSwitchSnapshot.transitionPhase === 'idle'
            ? null
            : resolvedRouteSceneSwitchSnapshot.handoffSceneKey;
        const sheetPresentationSceneKey = resolveTransitionSheetPresentationSceneKey({
          routeActiveSceneKey: activeSceneKey,
          routeOverlayDisplaySnapshot,
          handoffSceneKey,
          sheetContentHandoff: resolvedRouteSceneSwitchSnapshot.sheetContentHandoff,
          transitionPhase: resolvedRouteSceneSwitchSnapshot.transitionPhase,
        });
        const activitySceneKey = sheetPresentationSceneKey ?? activeSceneKey;
        const activityInteractiveSceneKey = routeOverlayDisplaySnapshot.isPersistentPollLane
          ? sheetPresentationSceneKey
          : interactiveSceneKey;
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
          activeSceneKey == null ? null : sceneEntryByKey[activeSceneKey] ?? null;

        const nextSnapshot: SceneStackControllerSnapshot = {
          activeSceneKey,
          interactiveSceneKey,
          handoffSceneKey,
          transitionPhase: resolvedRouteSceneSwitchSnapshot.transitionPhase,
          isInteractive: resolvedRouteSceneSwitchSnapshot.isInteractive,
          mountedSceneKeys,
          activeSceneFrameEntry: activeSceneEntry?.frameEntry ?? null,
          activeSceneChromeEntry:
            activeSceneKey == null ? null : sceneEntryByKey[activeSceneKey]?.chromeEntry ?? null,
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
          new Set([...changedSceneBodyKeys, ...changedSceneActivityKeys])
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

export const createAppRouteSceneStackRuntime = ({
  sceneInputAuthority,
  routeSceneSwitchRuntime,
  routeOverlayDisplayAuthority,
}: {
  sceneInputAuthority: AppRouteSceneInputAuthority;
  routeSceneSwitchRuntime: AppRouteSceneSwitchRuntime;
  routeOverlayDisplayAuthority: SnapshotAuthority<RouteOverlayDisplaySnapshot>;
}): AppRouteSceneStackRuntime => {
  const stackController = new AppRouteSceneStackLayerStateController({
    sceneInputAuthority,
    routeSceneSwitchRuntime,
    routeOverlayDisplayAuthority,
  });

  return {
    sceneFrameAuthority: stackController.sceneFrameAuthority,
    sceneStackSurfaceAuthority: stackController.sceneStackSurfaceAuthority,
    dispose: () => {
      stackController.dispose();
    },
  };
};
