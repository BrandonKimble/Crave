import { StyleSheet } from 'react-native';

import {
  EMPTY_SEARCH_ROUTE_SCENE_LAYOUT_STATE,
  type SearchRouteSceneLayoutState,
} from '../../overlays/searchRouteSceneLayoutContract';
import { normalizeSearchRouteSceneStackShellSpec } from '../../overlays/searchOverlayRouteHostContract';
import { overlaySheetStyles, OVERLAY_HORIZONTAL_PADDING } from '../../overlays/overlaySheetStyles';
import type { RouteSceneLayoutSnapshot } from '../../screens/Search/runtime/shared/route-scene-layout-snapshot-contract';
import type {
  AppRouteSceneBodyAdmissionPolicy,
  AppRouteSceneBodyContentSpec,
  AppRouteSceneBodyTransportSpec,
  AppRouteSceneChromePublication,
  AppRouteSceneStackShellSpec,
} from './app-route-scene-descriptor-contract';
import type {
  RouteShellSceneInputLane,
} from './app-route-scene-foundation-runtime';

type RouteSceneLayoutAuthority = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => RouteSceneLayoutSnapshot;
};

export type AppRouteStaticSceneDescriptorRuntime = {
  dispose: () => void;
};

type StaticTabSceneKey = 'bookmarks' | 'profile';
type StaticSceneKey = 'saveList' | StaticTabSceneKey;

const staticSceneStyles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
  },
});

const BOOKMARKS_BODY_TRANSPORT: AppRouteSceneBodyTransportSpec = {
  contentContainerStyle: [staticSceneStyles.scrollContent, { paddingBottom: 72 }],
  bounces: false,
  alwaysBounceVertical: false,
  overScrollMode: 'never',
  contentSurfaceStyle: overlaySheetStyles.contentSurfaceWhite,
};

const PROFILE_BODY_TRANSPORT: AppRouteSceneBodyTransportSpec = {
  contentContainerStyle: [staticSceneStyles.scrollContent, { paddingBottom: 160 }],
  keyboardShouldPersistTaps: 'handled',
  bounces: false,
  alwaysBounceVertical: false,
  overScrollMode: 'never',
  contentSurfaceStyle: overlaySheetStyles.contentSurfaceWhite,
};

const SAVE_LIST_BODY_TRANSPORT: AppRouteSceneBodyTransportSpec = {
  contentContainerStyle: [staticSceneStyles.scrollContent, { paddingBottom: 72 }],
  keyboardShouldPersistTaps: 'handled',
};

const STATIC_RETAINED_TAB_BODY_ADMISSION_POLICY: AppRouteSceneBodyAdmissionPolicy = {
  retainMountedBodyDuringTransition: true,
  prewarmRetainedMountedBody: true,
  delayFirstDataAdmission: true,
  keepDataSubscribedAfterActivation: true,
};

const createMountedChrome = (mountedChromeKey: StaticSceneKey): AppRouteSceneChromePublication => ({
  surfaceKind: 'mounted',
  mountedChromeKey,
});

const createMountedBody = (mountedBodyKey: StaticSceneKey): AppRouteSceneBodyContentSpec => ({
  surfaceKind: 'mounted',
  mountedBodyKey,
  contentScrollMode: 'scroll',
});

const createStaticTabShellSpec = ({
  sceneKey,
  sceneLayout,
}: {
  sceneKey: StaticTabSceneKey;
  sceneLayout: SearchRouteSceneLayoutState;
}): AppRouteSceneStackShellSpec =>
  normalizeSearchRouteSceneStackShellSpec({
    overlayKey: sceneKey,
    snapPoints: sceneLayout.snapPoints,
    style: overlaySheetStyles.container,
  });

const createSaveListShellSpec = ({
  sceneLayout,
}: {
  sceneLayout: SearchRouteSceneLayoutState;
}): AppRouteSceneStackShellSpec =>
  normalizeSearchRouteSceneStackShellSpec({
    overlayKey: 'saveList',
    snapPoints: sceneLayout.snapPoints,
    style: overlaySheetStyles.container,
  });

class AppRouteStaticSceneDescriptorController {
  private readonly unsubscribers: Array<() => void> = [];

  constructor({
    sceneInputLane,
    routeSceneLayoutAuthority,
  }: {
    sceneInputLane: RouteShellSceneInputLane;
    routeSceneLayoutAuthority: RouteSceneLayoutAuthority;
  }) {
    const publishDescriptors = () => {
      this.publishDescriptors({
        sceneInputLane,
        sceneLayout:
          routeSceneLayoutAuthority.getSnapshot().routeSceneLayout ??
          EMPTY_SEARCH_ROUTE_SCENE_LAYOUT_STATE,
      });
    };

    publishDescriptors();
    this.unsubscribers.push(routeSceneLayoutAuthority.subscribe(publishDescriptors));
  }

  public dispose(): void {
    this.unsubscribers.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.unsubscribers.length = 0;
  }

  private publishDescriptors({
    sceneInputLane,
    sceneLayout,
  }: {
    sceneInputLane: RouteShellSceneInputLane;
    sceneLayout: SearchRouteSceneLayoutState;
  }): void {
    sceneInputLane.publishRouteSceneDescriptor({
      sceneKey: 'saveList',
      shellSpec: createSaveListShellSpec({
        sceneLayout,
      }),
      sceneChrome: createMountedChrome('saveList'),
      sceneBodyContent: createMountedBody('saveList'),
      sceneBodyTransport: SAVE_LIST_BODY_TRANSPORT,
    });
    sceneInputLane.publishRouteSceneDescriptor({
      sceneKey: 'bookmarks',
      shellSpec: createStaticTabShellSpec({
        sceneKey: 'bookmarks',
        sceneLayout,
      }),
      sceneChrome: createMountedChrome('bookmarks'),
      sceneBodyContent: createMountedBody('bookmarks'),
      sceneBodyTransport: BOOKMARKS_BODY_TRANSPORT,
      sceneBodyAdmissionPolicy: STATIC_RETAINED_TAB_BODY_ADMISSION_POLICY,
    });
    sceneInputLane.publishRouteSceneDescriptor({
      sceneKey: 'profile',
      shellSpec: createStaticTabShellSpec({
        sceneKey: 'profile',
        sceneLayout,
      }),
      sceneChrome: createMountedChrome('profile'),
      sceneBodyContent: createMountedBody('profile'),
      sceneBodyTransport: PROFILE_BODY_TRANSPORT,
      sceneBodyAdmissionPolicy: STATIC_RETAINED_TAB_BODY_ADMISSION_POLICY,
    });
  }
}

export const createAppRouteStaticSceneDescriptorRuntime = ({
  sceneInputLane,
  routeSceneLayoutAuthority,
}: {
  sceneInputLane: RouteShellSceneInputLane;
  routeSceneLayoutAuthority: RouteSceneLayoutAuthority;
}): AppRouteStaticSceneDescriptorRuntime => {
  const controller = new AppRouteStaticSceneDescriptorController({
    sceneInputLane,
    routeSceneLayoutAuthority,
  });

  return {
    dispose: () => {
      controller.dispose();
    },
  };
};
