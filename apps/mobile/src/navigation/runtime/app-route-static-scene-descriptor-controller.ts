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

type StaticTabSceneKey = 'lists' | 'profile';
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
// scene's white plate at the body lane; the old lists/profile transport white was the
// per-scene hack it replaces.
// F950 — THE SCROLL-TAIL INSET, NAMED.
//
// `paddingBottom: 72` was written literally SIX times below and `160` once, with neither the
// repetition nor the exception explained. Both are now named for the job they do, and their
// status is stated honestly: they are OWNER CHOICES about how much empty runway a scrolled
// body leaves under its last row, NOT derivations. Nobody should go looking for a formula.
//
// If they were ever meant to clear the bottom nav they would be derived from
// `resolveAppRouteBottomNavHeight` — they are not, and this comment exists so the next reader
// does not "fix" them into that and change every static scene's tail.
const STATIC_SCENE_SCROLL_TAIL_INSET = 72;

// The profile body's tail is deliberately DEEPER than every other static scene's. The
// exception is the point: profile is the one static body whose last block is interactive
// (the section list), so it wants runway to scroll that block clear of the thumb rather than
// merely clear of the edge. Also an owner choice, also not a derivation.
const PROFILE_SCENE_SCROLL_TAIL_INSET = 160;

const LISTS_BODY_TRANSPORT: AppRouteSceneBodyTransportSpec = {
  contentContainerStyle: {
    ...STATIC_SCENE_SCROLL_CONTENT_INSETS,
    paddingBottom: STATIC_SCENE_SCROLL_TAIL_INSET,
  },
};

const PROFILE_BODY_TRANSPORT: AppRouteSceneBodyTransportSpec = {
  contentContainerStyle: {
    ...STATIC_SCENE_SCROLL_CONTENT_INSETS,
    paddingBottom: PROFILE_SCENE_SCROLL_TAIL_INSET,
  },
  keyboardShouldPersistTaps: 'handled',
};

const SAVE_LIST_BODY_TRANSPORT: AppRouteSceneBodyTransportSpec = {
  contentContainerStyle: {
    ...STATIC_SCENE_SCROLL_CONTENT_INSETS,
    paddingBottom: STATIC_SCENE_SCROLL_TAIL_INSET,
  },
  keyboardShouldPersistTaps: 'handled',
};

// Shared transport for the stub child scenes (SAVE_LIST_BODY_TRANSPORT minus the
// keyboard field — no inputs in a stub body).
const STUB_CHILD_BODY_TRANSPORT: AppRouteSceneBodyTransportSpec = {
  contentContainerStyle: {
    ...STATIC_SCENE_SCROLL_CONTENT_INSETS,
    paddingBottom: STATIC_SCENE_SCROLL_TAIL_INSET,
  },
};

// Leg 9 (listdetail-ideal §2b): listDetail hosts a FULL-BLEED in-list ToggleStrip — the
// engine's edge-to-edge law forbids a horizontally-padded mount, so the scroll transport
// carries NO horizontal inset; the panel owns per-block padding (strip full-bleed with
// contentInset alignment, every other block padded to OVERLAY_HORIZONTAL_PADDING).
const LIST_DETAIL_BODY_TRANSPORT: AppRouteSceneBodyTransportSpec = {
  contentContainerStyle: { paddingBottom: STATIC_SCENE_SCROLL_TAIL_INSET },
};

// W2: postPhotos publishes separately — same static-child shape, but with the
// keyboard-persist transport (the panel has typeahead + free-text dish inputs).
const POST_PHOTOS_BODY_TRANSPORT: AppRouteSceneBodyTransportSpec = {
  contentContainerStyle: {
    ...STATIC_SCENE_SCROLL_CONTENT_INSETS,
    paddingBottom: STATIC_SCENE_SCROLL_TAIL_INSET,
  },
  keyboardShouldPersistTaps: 'handled',
};

// W3 messaging (§4.1): the inbox is a RE-SORTING list (rows re-order on every
// new message) — MVCP must be OFF (CLAUDE.md: re-sortable feeds disable it).
const MESSAGES_INBOX_BODY_TRANSPORT: AppRouteSceneBodyTransportSpec = {
  contentContainerStyle: {
    ...STATIC_SCENE_SCROLL_CONTENT_INSETS,
    paddingBottom: STATIC_SCENE_SCROLL_TAIL_INSET,
  },
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

// F1390 — TOTALITY, not a hand-kept list.
//
// This used to be `readonly StaticStubChildSceneKey[]` naming SIX of the union's NINE
// members, with the other three hand-published one-by-one below. `readonly T[]` cannot
// express totality, so adding a tenth union member COMPILED CLEANLY and published NO
// descriptor — the sheet would mount with a null shell/chrome/body, a silent blank scene
// instead of a type error. (This is the F908 shape exactly.)
//
// It is now a TOTAL `Record<StaticStubChildSceneKey, ...>`: every member must appear, and
// a new one is a BUILD ERROR until its spec is written. The per-scene differences the
// hand-publishing existed to express (a different transport, dmSession's static body) are
// now DATA in the record, so there is nothing left to publish by hand.
type StaticStubChildSceneSpec = {
  bodyTransport: AppRouteSceneBodyTransportSpec;
  /** Omitted = the default scrolled mounted body. */
  bodyContent?: AppRouteSceneBodyContentSpec;
};

const STATIC_STUB_CHILD_SCENE_SPECS: Record<StaticStubChildSceneKey, StaticStubChildSceneSpec> = {
  userProfile: { bodyTransport: STUB_CHILD_BODY_TRANSPORT },
  listDetail: { bodyTransport: LIST_DETAIL_BODY_TRANSPORT },
  followList: { bodyTransport: STUB_CHILD_BODY_TRANSPORT },
  notifications: { bodyTransport: STUB_CHILD_BODY_TRANSPORT },
  settings: { bodyTransport: STUB_CHILD_BODY_TRANSPORT },
  editProfile: { bodyTransport: STUB_CHILD_BODY_TRANSPORT },
  // W2: postPhotos — same static-child shape with the keyboard-persist transport
  // (the panel has typeahead + free-text dish inputs).
  postPhotos: { bodyTransport: POST_PHOTOS_BODY_TRANSPORT },
  // W3 messaging (§4.1) — per-scene transports.
  messagesInbox: { bodyTransport: MESSAGES_INBOX_BODY_TRANSPORT },
  dmSession: {
    bodyTransport: DM_SESSION_BODY_TRANSPORT,
    bodyContent: {
      surfaceKind: 'mounted',
      mountedBodyKey: 'dmSession',
      contentScrollMode: 'static',
    },
  },
};

const STATIC_STUB_CHILD_SCENE_KEYS = Object.keys(
  STATIC_STUB_CHILD_SCENE_SPECS
) as readonly StaticStubChildSceneKey[];

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
    // Stub-pass child scenes — same static-descriptor shape as saveList. EVERY member of
    // StaticStubChildSceneKey publishes here, by construction (F1390): the spec record is
    // total, so no scene can be forgotten.
    STATIC_STUB_CHILD_SCENE_KEYS.forEach((sceneKey) => {
      const stubChildSpec = STATIC_STUB_CHILD_SCENE_SPECS[sceneKey];
      sceneInputLane.publishRouteSceneDescriptor({
        sceneKey,
        shellSpec: createStaticChildShellSpec({
          sceneKey,
          sceneLayout,
        }),
        sceneChrome: createMountedChrome(sceneKey),
        sceneBodyContent: stubChildSpec.bodyContent ?? createMountedBody(sceneKey),
        sceneBodyTransport: stubChildSpec.bodyTransport,
      });
    });
    sceneInputLane.publishRouteSceneDescriptor({
      sceneKey: 'lists',
      shellSpec: createStaticTabShellSpec({
        sceneKey: 'lists',
        sceneLayout,
      }),
      sceneChrome: createMountedChrome('lists'),
      sceneBodyContent: createMountedBody('lists'),
      sceneBodyTransport: LISTS_BODY_TRANSPORT,
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
