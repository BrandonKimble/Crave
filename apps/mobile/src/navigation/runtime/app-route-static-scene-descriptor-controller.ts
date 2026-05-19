import { StyleSheet } from 'react-native';

import {
  EMPTY_SEARCH_ROUTE_SCENE_LAYOUT_STATE,
  type SearchRouteSceneLayoutState,
} from '../../overlays/searchRouteSceneLayoutContract';
import { normalizeSearchRouteSceneStackShellSpec } from '../../overlays/searchOverlayRouteHostContract';
import { overlaySheetStyles, OVERLAY_HORIZONTAL_PADDING } from '../../overlays/overlaySheetStyles';
import type { OverlaySheetSnap } from '../../overlays/types';
import type { RouteSceneLayoutSnapshot } from '../../screens/Search/runtime/shared/route-scene-layout-snapshot-contract';
import type {
  AppRouteSceneBodyAdmissionPolicy,
  AppRouteSceneBodyContentSpec,
  AppRouteSceneBodyTransportSpec,
  AppRouteSceneChromePublication,
  AppRouteSceneStackShellSpec,
} from './app-route-scene-descriptor-contract';
import type {
  RouteShellOverlayNavigationAuthority,
  RouteShellSceneInputLane,
  RouteShellSceneSwitchAuthority,
} from './app-route-scene-foundation-runtime';
import type { AppRouteOverlayCommandActions } from './app-route-overlay-command-controller';
import type { AppSearchRouteCommandActions } from './app-search-route-command-runtime';
import type { AppRouteSheetSnapSessionActions } from './app-route-sheet-snap-session-runtime';

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
  onSnapChange,
}: {
  sceneKey: StaticTabSceneKey;
  sceneLayout: SearchRouteSceneLayoutState;
  onSnapChange: (snap: OverlaySheetSnap) => void;
}): AppRouteSceneStackShellSpec =>
  normalizeSearchRouteSceneStackShellSpec({
    overlayKey: sceneKey,
    snapPoints: sceneLayout.snapPoints,
    style: overlaySheetStyles.container,
    onSnapChange,
    dismissThreshold: sceneLayout.navBarTop > 0 ? sceneLayout.navBarTop : undefined,
    preventSwipeDismiss: true,
  });

const createSaveListShellSpec = ({
  sceneLayout,
  onHidden,
}: {
  sceneLayout: SearchRouteSceneLayoutState;
  onHidden: () => void;
}): AppRouteSceneStackShellSpec =>
  normalizeSearchRouteSceneStackShellSpec({
    overlayKey: 'saveList',
    snapPoints: sceneLayout.snapPoints,
    style: overlaySheetStyles.container,
    onHidden,
  });

class AppRouteStaticSceneDescriptorController {
  private readonly unsubscribers: Array<() => void> = [];

  private readonly handleSaveListHidden: () => void;

  private readonly handleBookmarksSnapChange: (snap: OverlaySheetSnap) => void;

  private readonly handleProfileSnapChange: (snap: OverlaySheetSnap) => void;

  constructor({
    sceneInputLane,
    routeSceneLayoutAuthority,
    routeOverlayNavigationAuthority,
    sceneSwitchAuthority,
    routeOverlayCommandActions,
    routeSearchCommandActions,
    routeSheetSnapSessionActions,
  }: {
    sceneInputLane: RouteShellSceneInputLane;
    routeSceneLayoutAuthority: RouteSceneLayoutAuthority;
    routeOverlayNavigationAuthority: RouteShellOverlayNavigationAuthority;
    sceneSwitchAuthority: RouteShellSceneSwitchAuthority;
    routeOverlayCommandActions: AppRouteOverlayCommandActions;
    routeSearchCommandActions: AppSearchRouteCommandActions;
    routeSheetSnapSessionActions: AppRouteSheetSnapSessionActions;
  }) {
    this.handleSaveListHidden = () => {
      routeOverlayCommandActions.handleCloseSaveSheet();
    };
    this.handleBookmarksSnapChange = (snap) => {
      this.settleTabSnap({
        sceneKey: 'bookmarks',
        snap,
        routeOverlayNavigationAuthority,
        sceneSwitchAuthority,
        routeSearchCommandActions,
        routeSheetSnapSessionActions,
      });
    };
    this.handleProfileSnapChange = (snap) => {
      this.settleTabSnap({
        sceneKey: 'profile',
        snap,
        routeOverlayNavigationAuthority,
        sceneSwitchAuthority,
        routeSearchCommandActions,
        routeSheetSnapSessionActions,
      });
    };

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

  private settleTabSnap({
    sceneKey,
    snap,
    routeOverlayNavigationAuthority,
    sceneSwitchAuthority,
    routeSearchCommandActions,
    routeSheetSnapSessionActions,
  }: {
    sceneKey: StaticTabSceneKey;
    snap: OverlaySheetSnap;
    routeOverlayNavigationAuthority: RouteShellOverlayNavigationAuthority;
    sceneSwitchAuthority: RouteShellSceneSwitchAuthority;
    routeSearchCommandActions: AppSearchRouteCommandActions;
    routeSheetSnapSessionActions: AppRouteSheetSnapSessionActions;
  }): void {
    const rootOverlayKey = routeOverlayNavigationAuthority.getSnapshot().rootOverlayKey;
    routeSheetSnapSessionActions.settleRouteSceneTabSnap({
      sceneKey,
      snap,
      rootOverlayKey,
      isOverlaySwitchInFlight: sceneSwitchAuthority.getSnapshot().transitionPhase !== 'idle',
      returnToDockedSearch: () => {
        routeSearchCommandActions.returnAppSearchRouteToDockedSearch({
          snap: 'collapsed',
        });
      },
    });
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
        onHidden: this.handleSaveListHidden,
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
        onSnapChange: this.handleBookmarksSnapChange,
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
        onSnapChange: this.handleProfileSnapChange,
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
  routeOverlayNavigationAuthority,
  sceneSwitchAuthority,
  routeOverlayCommandActions,
  routeSearchCommandActions,
  routeSheetSnapSessionActions,
}: {
  sceneInputLane: RouteShellSceneInputLane;
  routeSceneLayoutAuthority: RouteSceneLayoutAuthority;
  routeOverlayNavigationAuthority: RouteShellOverlayNavigationAuthority;
  sceneSwitchAuthority: RouteShellSceneSwitchAuthority;
  routeOverlayCommandActions: AppRouteOverlayCommandActions;
  routeSearchCommandActions: AppSearchRouteCommandActions;
  routeSheetSnapSessionActions: AppRouteSheetSnapSessionActions;
}): AppRouteStaticSceneDescriptorRuntime => {
  const controller = new AppRouteStaticSceneDescriptorController({
    sceneInputLane,
    routeSceneLayoutAuthority,
    routeOverlayNavigationAuthority,
    sceneSwitchAuthority,
    routeOverlayCommandActions,
    routeSearchCommandActions,
    routeSheetSnapSessionActions,
  });

  return {
    dispose: () => {
      controller.dispose();
    },
  };
};
