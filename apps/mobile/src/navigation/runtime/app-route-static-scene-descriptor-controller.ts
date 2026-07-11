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
import type { RouteShellSceneInputLane } from './app-route-scene-foundation-runtime';

type RouteSceneLayoutAuthority = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => RouteSceneLayoutSnapshot;
};

export type AppRouteStaticSceneDescriptorRuntime = {
  dispose: () => void;
};

type StaticTabSceneKey = 'bookmarks' | 'profile';
// Stub-pass child scenes (plans/page-registry.md §1) — static descriptors with placeholder bodies.
type StaticStubChildSceneKey =
  | 'userProfile'
  | 'listDetail'
  | 'followList'
  | 'notifications'
  | 'settings'
  | 'editProfile'
  | 'postPhotos'
  | 'messagesInbox'
  | 'dmSession';
type StaticSceneKey = 'saveList' | StaticTabSceneKey | StaticStubChildSceneKey;

// Typed SceneBodyContentInsets — the transport's contentContainerStyle carries
// insets only (compile-enforced), so these are plain objects, not StyleSheet styles.
const STATIC_SCENE_SCROLL_CONTENT_INSETS = {
  paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
} as const;

// Over-scroll is enforced no-bounce structurally by BottomSheetScrollContainer (the shared sheet
// scroll container) so the scroll↔sheet handoff works — no per-scene over-scroll config needed.
// NOTE: no per-transport contentSurfaceStyle white here anymore — the foundation white layer
// (scene-foundation-spec `bodySurface: 'white'` → SceneBodyFoundationSurface) paints every sheet
// scene's white plate at the body lane; the old bookmarks/profile transport white was the
// per-scene hack it replaces.
const BOOKMARKS_BODY_TRANSPORT: AppRouteSceneBodyTransportSpec = {
  contentContainerStyle: { ...STATIC_SCENE_SCROLL_CONTENT_INSETS, paddingBottom: 72 },
};

const PROFILE_BODY_TRANSPORT: AppRouteSceneBodyTransportSpec = {
  contentContainerStyle: { ...STATIC_SCENE_SCROLL_CONTENT_INSETS, paddingBottom: 160 },
  keyboardShouldPersistTaps: 'handled',
};

const SAVE_LIST_BODY_TRANSPORT: AppRouteSceneBodyTransportSpec = {
  contentContainerStyle: { ...STATIC_SCENE_SCROLL_CONTENT_INSETS, paddingBottom: 72 },
  keyboardShouldPersistTaps: 'handled',
};

// Shared transport for the stub child scenes (SAVE_LIST_BODY_TRANSPORT minus the
// keyboard field — no inputs in a stub body).
const STUB_CHILD_BODY_TRANSPORT: AppRouteSceneBodyTransportSpec = {
  contentContainerStyle: { ...STATIC_SCENE_SCROLL_CONTENT_INSETS, paddingBottom: 72 },
};

const STATIC_STUB_CHILD_SCENE_KEYS: readonly StaticStubChildSceneKey[] = [
  'userProfile',
  'listDetail',
  'followList',
  'notifications',
  'settings',
  'editProfile',
];

// W2: postPhotos publishes separately — same static-child shape, but with the
// keyboard-persist transport (the panel has typeahead + free-text dish inputs).
const POST_PHOTOS_BODY_TRANSPORT: AppRouteSceneBodyTransportSpec = {
  contentContainerStyle: { ...STATIC_SCENE_SCROLL_CONTENT_INSETS, paddingBottom: 72 },
  keyboardShouldPersistTaps: 'handled',
};

// W3 messaging (§4.1): the inbox is a RE-SORTING list (rows re-order on every
// new message) — MVCP must be OFF (CLAUDE.md: re-sortable feeds disable it).
const MESSAGES_INBOX_BODY_TRANSPORT: AppRouteSceneBodyTransportSpec = {
  contentContainerStyle: { ...STATIC_SCENE_SCROLL_CONTENT_INSETS, paddingBottom: 72 },
  flashListProps: { maintainVisibleContentPosition: { disabled: true } },
};

// dmSession: STATIC body — the panel owns its layout (chat column: thread
// ScrollView flex:1 + a composer bar PINNED to the sheet's visible bottom that
// rides above the keyboard — the PollDetail chin's geometry on the static
// path). The shared scroll container put the composer at content-bottom
// mid-sheet, which was exactly the W4 keyboard bug. Keyboard props live on the
// panel's own thread ScrollView. No layout styles here — the transport's
// contentContainerStyle is typed SceneBodyContentInsets (insets only, compile-
// enforced); the static-mode frame fill lives in useBottomSheetSceneStackBodyContentRuntime.
const DM_SESSION_BODY_TRANSPORT: AppRouteSceneBodyTransportSpec = {
  contentContainerStyle: STATIC_SCENE_SCROLL_CONTENT_INSETS,
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

// Settings publishes the STANDARD child shell (identical snaps → profile↔settings never
// moves the sheet); its top-snap pin is the scene-foundation `snapLock: 'expanded'` literal
// (rubber-band drags, expanded-only releases), paired with `grabHandle: 'hidden'`.

// Parameterized shell spec for the static child scenes (saveList + the stub pass).
const createStaticChildShellSpec = ({
  sceneKey,
  sceneLayout,
}: {
  sceneKey: 'saveList' | StaticStubChildSceneKey;
  sceneLayout: SearchRouteSceneLayoutState;
}): AppRouteSceneStackShellSpec =>
  normalizeSearchRouteSceneStackShellSpec({
    overlayKey: sceneKey,
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
      shellSpec: createStaticChildShellSpec({
        sceneKey: 'saveList',
        sceneLayout,
      }),
      sceneChrome: createMountedChrome('saveList'),
      sceneBodyContent: createMountedBody('saveList'),
      sceneBodyTransport: SAVE_LIST_BODY_TRANSPORT,
    });
    // Stub-pass child scenes — same static-descriptor shape as saveList, placeholder bodies.
    STATIC_STUB_CHILD_SCENE_KEYS.forEach((sceneKey) => {
      sceneInputLane.publishRouteSceneDescriptor({
        sceneKey,
        shellSpec: createStaticChildShellSpec({
          sceneKey,
          sceneLayout,
        }),
        sceneChrome: createMountedChrome(sceneKey),
        sceneBodyContent: createMountedBody(sceneKey),
        sceneBodyTransport: STUB_CHILD_BODY_TRANSPORT,
      });
    });
    sceneInputLane.publishRouteSceneDescriptor({
      sceneKey: 'postPhotos',
      shellSpec: createStaticChildShellSpec({
        sceneKey: 'postPhotos',
        sceneLayout,
      }),
      sceneChrome: createMountedChrome('postPhotos'),
      sceneBodyContent: createMountedBody('postPhotos'),
      sceneBodyTransport: POST_PHOTOS_BODY_TRANSPORT,
    });
    // W3 messaging (§4.1) — separate publishes for the per-scene transports.
    sceneInputLane.publishRouteSceneDescriptor({
      sceneKey: 'messagesInbox',
      shellSpec: createStaticChildShellSpec({
        sceneKey: 'messagesInbox',
        sceneLayout,
      }),
      sceneChrome: createMountedChrome('messagesInbox'),
      sceneBodyContent: createMountedBody('messagesInbox'),
      sceneBodyTransport: MESSAGES_INBOX_BODY_TRANSPORT,
    });
    sceneInputLane.publishRouteSceneDescriptor({
      sceneKey: 'dmSession',
      shellSpec: createStaticChildShellSpec({
        sceneKey: 'dmSession',
        sceneLayout,
      }),
      sceneChrome: createMountedChrome('dmSession'),
      sceneBodyContent: {
        surfaceKind: 'mounted',
        mountedBodyKey: 'dmSession',
        contentScrollMode: 'static',
      },
      sceneBodyTransport: DM_SESSION_BODY_TRANSPORT,
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
