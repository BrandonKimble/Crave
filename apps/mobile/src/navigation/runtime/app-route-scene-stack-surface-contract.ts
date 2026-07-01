import type {
  SearchRouteSceneStackBodyContentEntry,
  SearchRouteSceneStackBodyTransportEntry,
  SearchRouteSceneStackChromeEntry,
} from '../../overlays/searchRouteSceneStackSheetContract';
import type { OverlayKey } from '../../overlays/types';

export type AppRouteSceneStackMountedScenesSnapshot = {
  mountedSceneKeys: readonly OverlayKey[];
};

export type AppRouteSceneStackActiveChromeSnapshot = {
  activeSceneChromeEntry: SearchRouteSceneStackChromeEntry | null;
};

export type AppRouteSceneStackChromeSurfacesSnapshot = {
  underlay: SearchRouteSceneStackChromeEntry | null;
  background: SearchRouteSceneStackChromeEntry | null;
  header: SearchRouteSceneStackChromeEntry | null;
  overlay: SearchRouteSceneStackChromeEntry | null;
};

export type AppRouteSceneStackBodySnapshot = {
  contentEntry: SearchRouteSceneStackBodyContentEntry | null;
  transportEntry: SearchRouteSceneStackBodyTransportEntry | null;
};

export type AppRouteSceneStackSceneActivitySnapshot = {
  isMounted: boolean;
  isActive: boolean;
  isInteractive: boolean;
  shouldRenderListBody: boolean;
  shouldAttachMountedContent: boolean;
  isTransitionParticipant: boolean;
  activationPhase: 'unmounted' | 'inactive' | 'transitioning' | 'interactive';
  shouldRunDataLane: boolean;
  shouldSubscribeDataLane: boolean;
  shouldRenderExpandedContent: boolean;
  hasActivatedExpandedContent: boolean;
};

export type AppRouteSceneStackBodySurfaceSnapshot = AppRouteSceneStackBodySnapshot & {
  contentActivity: Pick<
    AppRouteSceneStackSceneActivitySnapshot,
    | 'isActive'
    | 'shouldRenderListBody'
    | 'shouldAttachMountedContent'
    | 'shouldRunDataLane'
    | 'shouldSubscribeDataLane'
    | 'shouldRenderExpandedContent'
    | 'hasActivatedExpandedContent'
  >;
};

export type AppRouteSceneStackScenePresentationSnapshot = {
  isMounted: boolean;
  chromeSurfaces: AppRouteSceneStackChromeSurfacesSnapshot;
};

export type AppRouteSceneStackMountedScenesAuthority = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => AppRouteSceneStackMountedScenesSnapshot;
};

export type AppRouteSceneStackActiveChromeAuthority = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => AppRouteSceneStackActiveChromeSnapshot;
};

export type AppRouteSceneStackScenePresentationAuthority = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => AppRouteSceneStackScenePresentationSnapshot;
};

export type AppRouteSceneStackBodySurfaceAuthority = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => AppRouteSceneStackBodySurfaceSnapshot;
};

export type AppRouteSceneStackSurfaceAuthority = {
  mountedScenesAuthority: AppRouteSceneStackMountedScenesAuthority;
  activeChromeAuthority: AppRouteSceneStackActiveChromeAuthority;
  getScenePresentationAuthority: (
    sceneKey: OverlayKey
  ) => AppRouteSceneStackScenePresentationAuthority;
  getSceneBodySurfaceAuthority: (sceneKey: OverlayKey) => AppRouteSceneStackBodySurfaceAuthority;
  replayPersistentPollHeaderRestorationContract: (source: string) => void;
};

export type PersistentPollIdleSheetHeaderRestorationContract = {
  sheetContentLaneKind: 'persistent_poll';
  displayedSceneKey: 'polls';
  overlaySheetVisible: true;
  sheetPresentationSceneKey: 'polls';
  mountedChromeKey: NonNullable<SearchRouteSceneStackChromeEntry['mountedChromeKey']>;
  pollsHeaderChromeNonNull: true;
  pollsBodyContentLaneActive: true;
  contentActivity: Pick<
    AppRouteSceneStackSceneActivitySnapshot,
    'shouldAttachMountedContent' | 'shouldRunDataLane' | 'shouldSubscribeDataLane'
  >;
};

export const PERSISTENT_POLL_IDLE_SHEET_HEADER_RESTORATION_CONTRACT: PersistentPollIdleSheetHeaderRestorationContract =
  {
    sheetContentLaneKind: 'persistent_poll',
    displayedSceneKey: 'polls',
    overlaySheetVisible: true,
    sheetPresentationSceneKey: 'polls',
    mountedChromeKey: 'polls',
    pollsHeaderChromeNonNull: true,
    pollsBodyContentLaneActive: true,
    contentActivity: {
      shouldAttachMountedContent: true,
      shouldRunDataLane: true,
      shouldSubscribeDataLane: true,
    },
  };

export const EMPTY_APP_ROUTE_SCENE_STACK_MOUNTED_SCENES_SNAPSHOT: AppRouteSceneStackMountedScenesSnapshot =
  {
    mountedSceneKeys: [],
  };

export const EMPTY_APP_ROUTE_SCENE_STACK_ACTIVE_CHROME_SNAPSHOT: AppRouteSceneStackActiveChromeSnapshot =
  {
    activeSceneChromeEntry: null,
  };

export const EMPTY_APP_ROUTE_SCENE_STACK_CHROME_SURFACES_SNAPSHOT: AppRouteSceneStackChromeSurfacesSnapshot =
  {
    underlay: null,
    background: null,
    header: null,
    overlay: null,
  };

export const EMPTY_APP_ROUTE_SCENE_STACK_BODY_SNAPSHOT: AppRouteSceneStackBodySnapshot = {
  contentEntry: null,
  transportEntry: null,
};

export const EMPTY_APP_ROUTE_SCENE_STACK_SCENE_ACTIVITY_SNAPSHOT: AppRouteSceneStackSceneActivitySnapshot =
  {
    isMounted: false,
    isActive: false,
    isInteractive: false,
    shouldRenderListBody: false,
    shouldAttachMountedContent: false,
    isTransitionParticipant: false,
    activationPhase: 'unmounted',
    shouldRunDataLane: false,
    shouldSubscribeDataLane: false,
    shouldRenderExpandedContent: false,
    hasActivatedExpandedContent: false,
  };

export const EMPTY_APP_ROUTE_SCENE_STACK_SCENE_PRESENTATION_SNAPSHOT: AppRouteSceneStackScenePresentationSnapshot =
  {
    isMounted: false,
    chromeSurfaces: EMPTY_APP_ROUTE_SCENE_STACK_CHROME_SURFACES_SNAPSHOT,
  };

export const EMPTY_APP_ROUTE_SCENE_STACK_BODY_SURFACE_SNAPSHOT: AppRouteSceneStackBodySurfaceSnapshot =
  {
    contentEntry: null,
    transportEntry: null,
    contentActivity: {
      isActive: false,
      shouldRenderListBody: false,
      shouldAttachMountedContent: false,
      shouldRunDataLane: false,
      shouldSubscribeDataLane: false,
      shouldRenderExpandedContent: false,
      hasActivatedExpandedContent: false,
    },
  };
