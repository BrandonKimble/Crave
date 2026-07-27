import React from 'react';
import { Dimensions, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import type { SheetSceneKey } from '../navigation/runtime/scene-foundation-spec';

import { getPersistentHeaderDescriptor } from '../navigation/runtime/app-route-persistent-header-registry';
import {
  runHeaderCloseAction,
  runHeaderCreateAction,
} from '../navigation/runtime/header-nav-action-registry';
import { TOGGLE_STRIP_BAND_HEIGHT } from '../toggles/toggle-strip-metrics';
import { useAppOverlayRouteController } from '../overlays/useAppOverlayRouteController';
import { OVERLAY_HORIZONTAL_PADDING } from '../overlays/overlay-chrome-metrics';
import { SceneBodyFoundationSurface } from '../overlays/SceneBodyFoundationSurface';
import { useAppRouteSceneRuntime } from '../navigation/runtime/AppRouteSceneRuntimeProvider';
import { useAppRouteSharedSheetRuntimeOwner } from '../navigation/runtime/AppRouteSharedSheetRuntimeProvider';
import { usePresentationFrame } from '../navigation/runtime/use-presentation-frame';
import type { OverlayRouteEntry } from '../navigation/runtime/app-overlay-route-types';
import type { OverlayKey } from '../overlays/types';
import { getSearchStartupGeometrySeed } from '../screens/Search/runtime/shared/search-startup-geometry-seed-runtime';
import {
  BottomSheetSceneStackBodyDataActivityContext,
  BottomSheetSceneStackBodyIsActiveContext,
  BottomSheetSceneStackBodyRenderActivityContext,
} from '../overlays/BottomSheetSceneStackBodyActivityContext';
import {
  EditProfileMountedSceneBody,
  FollowListMountedSceneBody,
  ListDetailMountedSceneBody,
  NotificationsMountedSceneBody,
  SettingsMountedSceneBody,
  UserProfileMountedSceneBody,
} from '../overlays/panels/ChildScenePanels';
import { ListsMountedSceneBody } from '../overlays/panels/ListsPanel';
import { DmSessionPanelBody, MessagesInboxPanelBody } from '../overlays/panels/MessagingPanels';
import { PostPhotosPanelBody } from '../overlays/panels/PostPhotosPanel';
import { ProfileMountedSceneBody } from '../overlays/panels/ProfilePanel';
import { SaveListMountedSceneBody } from '../overlays/panels/SaveListPanel';
import { useHomePanelListSceneParts } from '../overlays/panels/HomePanel';
import { usePollsPanelListSceneParts } from '../overlays/panels/PollsPanel';
import type { SearchRouteMountedSceneBodyKey } from '../overlays/searchOverlayRouteHostContract';
import {
  TrackSheetPage,
  type TrackSheetCommands,
  type TrackSheetPageProps,
} from './TrackSheetPage';

// ─── TrackSheetRouteHost — migration RUNG 1 (dev-flagged parallel host) ────────
//
// The strangler's first rung: TrackSheetPage mounted in the REAL app with REAL
// production inputs — calculateSnapPoints geometry and the scene's registered
// persistent-header descriptor (Title + Strip components from the registry).
// The old sheet host is untouched; this renders above it behind a dev deep
// link. Purpose: prove the registry chrome renders inside the parallel host
// and the production geometry rides the track, before scene switching (rung 2)
// and real bodies (rung 3) wire in.
//
//   crave://tracksheet-host?on=1&scene=polls   (off: on=0; scene: any OverlayKey)

const DEEP_LINK_HOST = 'tracksheet-host';
const SCREEN = Dimensions.get('window');

class ChromeProbeBoundary extends React.Component<
  { label: string; children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: unknown) {
    return { error: String(error) };
  }
  render() {
    if (this.state.error != null) {
      // A registry component that needs the old host's contexts is a FINDING,
      // not a crash — surface it in place.
      return (
        <Text style={probeStyles.error} numberOfLines={3}>
          [{this.props.label}] needs host context: {this.state.error}
        </Text>
      );
    }
    return this.props.children;
  }
}

const probeStyles = StyleSheet.create({
  error: { color: '#b91c1c', fontSize: 11, padding: 8 },
});

export const TrackSheetRouteHost: React.FC = () => {
  const [state, setState] = React.useState<{ on: boolean; scene: OverlayKey }>({
    on: false,
    scene: 'polls' as OverlayKey,
  });

  React.useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url || !url.includes(DEEP_LINK_HOST)) {
        return;
      }
      const on = /[?&]on=(1|true)/i.test(url);
      const sceneMatch = /[?&]scene=([a-zA-Z]+)/.exec(url);
      setState((prev) => ({
        on: /[?&]on=(0|false)/i.test(url) ? false : on || !prev.on,
        scene: (sceneMatch?.[1] as OverlayKey) ?? prev.scene,
      }));
    };
    Linking.getInitialURL()
      .then(handleUrl)
      .catch(() => undefined);
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  // HIDE, never unmount: tearing the track down mid-session hit a Fabric
  // mounting-coordinator assert (unregisterViewComponentDescriptor SIGABRT).
  // The surface mounts once on first enable and then only toggles visibility —
  // which is also the production shape (one persistent sheet surface).
  const everOnRef = React.useRef(false);
  everOnRef.current = everOnRef.current || state.on;
  if (!everOnRef.current) {
    return null;
  }
  return (
    <View
      // z at the SIBLING level: zIndex only competes among siblings, and the
      // production stack (z 90) is THIS wrapper's sibling — an inner z was
      // silently losing whenever the sheets overlapped (anti-trap round 3).
      style={[StyleSheet.absoluteFill, styles.hostAboveStack, !state.on && styles.hidden]}
      pointerEvents={state.on ? 'box-none' : 'none'}
    >
      <NavExcludedTrackSurface scene={state.scene} />
    </View>
  );
};

/** NAV EXCLUSION (inventory §5.1): the sheet subtree renders inside the same
 * native mask the production frame host uses — the sheet is carved around the
 * nav silhouette and hard-clipped at the nav top. Static persistent-mode props
 * for now (nav hide choreography joins with the motion work). */
const NavExcludedTrackSurface: React.FC<{ scene: OverlayKey }> = ({ scene }) => {
  const seed = getSearchStartupGeometrySeed();
  // HARD CLIP half of nav exclusion (inventory §5.1): the sheet subtree may
  // never paint below the nav top. The native silhouette-curve mask
  // (SearchRouteSheetNavExclusionMaskNativeView) made the whole surface
  // invisible when mounted without the frame host's init — reusing it needs a
  // study of its native impl, queued; the hard clip carries the contract
  // (sheet never covers nav) until then.
  // The compose chin renders as a SIBLING of the clip — true viewport coords
  // (the published chin's offsets assume a viewport-spanning container; inside
  // the clip it landed mid-screen).
  const sceneRuntime = useAppRouteSceneRuntime();
  const frame = usePresentationFrame(sceneRuntime.routeSceneSwitchRuntime);
  const liveScene = frame.activeSceneKey ?? scene;
  const chinInput = sceneRuntime.sceneInputAuthority.getSceneInputSnapshot(liveScene);
  const chinBody = chinInput?.sceneBodyContent;
  const listChrome =
    chinBody != null && chinBody.surfaceKind === 'list'
      ? renderListLeader(chinBody.ListChromeComponent ?? null)
      : null;
  return (
    <>
      <View
        style={{
          width: seed.windowWidth,
          height: Math.max(0, seed.navBarTopForSnaps),
          overflow: 'hidden',
        }}
        pointerEvents="box-none"
      >
        <TrackSheetRouteSurface scene={scene} />
      </View>
      {listChrome != null ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {listChrome}
        </View>
      ) : null}
    </>
  );
};

const TrackSheetRouteSurface: React.FC<{ scene: OverlayKey }> = ({ scene: sceneOverride }) => {
  React.useEffect(() => {
    console.log('[TRACKHOST] surface mounted');
    return () => console.log('[TRACKHOST] surface unmounted');
  }, []);
  // RUNG 2 — REAL GEOMETRY + LIVE SCENE: the canonical snap points come from the
  // startup geometry seed (the same routeOverlaySnapPoints the production sheet
  // rides), and the presented scene tracks the PresentationFrame — tab presses
  // switch this host's chrome exactly as they switch the production sheet's.
  // THE CANONICAL GEOMETRY + PUBLICATION SVs: the shared sheet runtime owner is
  // the live production source (snapPoints synced in place; sheetTranslateY /
  // sheetScrollOffset are what every legacy rider subscribes to). Geometry
  // unification: attach config and chrome both read THIS object now.
  const sharedSheetOwner = useAppRouteSharedSheetRuntimeOwner();
  const snapPoints = sharedSheetOwner.snapPoints;
  const sceneRuntime = useAppRouteSceneRuntime();
  const frame = usePresentationFrame(sceneRuntime.routeSceneSwitchRuntime);
  const scene = frame.activeSceneKey ?? sceneOverride;

  // THE ENTRY: child bodies receive their route entry (params — listId etc.)
  // exactly like the registry mount unit passes it (W1 slice 1). Resolve the
  // frame's activeEntryId against the live route stack.
  const activeEntry = React.useMemo(() => {
    if (frame.activeEntryId == null) {
      return null;
    }
    const routeState = sceneRuntime.routeSceneSwitchRuntime.getRouteState();
    return (
      routeState.overlayRouteStack.find((entry) => entry.entryId === frame.activeEntryId) ??
      (routeState.activeOverlayRoute.entryId === frame.activeEntryId
        ? routeState.activeOverlayRoute
        : null)
    );
  }, [frame.activeEntryId, sceneRuntime]);

  // RUNG 3 — REAL BODIES through ONE PERSISTENT PAGE: the track surface never
  // remounts (production shape; remount churn hit a Fabric unmount assert) —
  // scene switches swap chrome + body content inside UnifiedTrackScenePage.
  return <UnifiedTrackScenePage scene={scene} snapPoints={snapPoints} entry={activeEntry} />;
};

// The mounted-body registry's scene set (searchOverlayRouteHostContract) minus
// the list-parts scenes and search (owns its dual-band composition — LAST).
const ROOT_TRACK_SCENES = new Set<OverlayKey>([
  'home',
  'polls',
  'lists',
  'profile',
  'search',
] as OverlayKey[]);

// Scenes whose bodies own their insets (in-list strips must bleed edge-to-edge —
// the ToggleStrip band law barks inside any padded mount).
const UNPADDED_BODY_SCENES = new Set<OverlayKey>(['listDetail'] as OverlayKey[]);

const MOUNTED_TRACK_SCENES = new Set<OverlayKey>([
  'lists',
  'profile',
  'saveList',
  'userProfile',
  'listDetail',
  'followList',
  'notifications',
  'settings',
  'editProfile',
  'postPhotos',
  'messagesInbox',
  'dmSession',
]);

type TrackScenePageProps = {
  scene: OverlayKey;
  snapPoints: ReturnType<typeof getSearchStartupGeometrySeed>['routeOverlaySnapPoints'];
  entry?: OverlayRouteEntry | null;
};

/** Shared chrome + page assembly for every scene page. */
const useTrackScenePageChrome = (
  scene: OverlayKey,
  snapPoints: TrackScenePageProps['snapPoints']
) => {
  const commandsRef = React.useRef<TrackSheetCommands | null>(null);
  const trackH = snapPoints.collapsed - snapPoints.expanded;
  // THE PRODUCTION POSTURE (rung 4): the seat comes from the snap session —
  // posture seats + per-scene remembered detents, gesture-written only
  // (inventory §5.10). τ mapping: expanded→H, middle→collapsed−middle,
  // collapsed→0. 'hidden' has no track posture yet (dismiss choreography is a
  // later slice) — it seats collapsed.
  const sceneRuntimeForSeat = useAppRouteSceneRuntime();
  const seatSnap = sceneRuntimeForSeat.routeSheetSnapSessionActions.getRouteSceneSwitchSceneSnap(
    scene
  );
  const seatTau =
    seatSnap === 'expanded'
      ? trackH
      : seatSnap === 'middle'
        ? snapPoints.collapsed - snapPoints.middle
        : 0;

  // THE SETTLE OBSERVER → SESSION: gesture rests write posture memory with the
  // production writer semantics (writer:'gesture'; the snap-law seats accept it).
  const middleTau = snapPoints.collapsed - snapPoints.middle;
  const onGestureSettle = React.useCallback(
    (detentTau: number) => {
      const snap =
        Math.abs(detentTau - trackH) <= 2
          ? ('expanded' as const)
          : Math.abs(detentTau - middleTau) <= 2
            ? ('middle' as const)
            : ('collapsed' as const);
      sceneRuntimeForSeat.routeSheetSnapSessionActions.recordRouteSceneSheetSettle({
        sceneKey: scene,
        snap,
        writer: 'gesture',
      });
    },
    [middleTau, scene, sceneRuntimeForSeat, trackH]
  );

  const descriptor = getPersistentHeaderDescriptor(scene);
  const Title = descriptor?.Title;
  const Strip = descriptor?.Strip;
  // Rung-4 chrome parity: the kit renders the production chrome (cutout plate,
  // grab handle, HeaderNavAction). The host supplies title + action wiring.
  const { closeActiveRoute, promoteActiveSheet, pushRoute } = useAppOverlayRouteController();
  const isChildScene = !ROOT_TRACK_SCENES.has(scene);
  const navActionProgress = useSharedValue(isChildScene ? 1 : 0);
  React.useEffect(() => {
    // Inventory §1.4: 220ms out-cubic; source = scene role (child → X).
    navActionProgress.value = withTiming(isChildScene ? 1 : 0, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [isChildScene, navActionProgress]);
  const onNavActionPress = React.useCallback(() => {
    // Production semantics (PersistentSheetHeaderHost.handleNavActionPress):
    // child → registered close override, else the route close; root → the
    // scene's registered create action (plus), with the polls fallback.
    if (isChildScene) {
      if (!runHeaderCloseAction(scene)) {
        closeActiveRoute();
      }
      return;
    }
    if (!runHeaderCreateAction(scene) && scene === 'polls') {
      pushRoute('pollCreation');
    }
  }, [closeActiveRoute, isChildScene, pushRoute, scene]);
  const title = React.useMemo(
    () =>
      Title != null ? (
        <ChromeProbeBoundary label={`${scene}.Title`}>
          <Title />
        </ChromeProbeBoundary>
      ) : (
        <Text style={styles.fallbackTitle}>{scene}</Text>
      ),
    [Title, scene]
  );
  const onGrabHandlePress = React.useCallback(() => {
    promoteActiveSheet({ snap: 'middle' });
  }, [promoteActiveSheet]);
  const dockedStrip = React.useMemo(
    () =>
      Strip != null
        ? {
            height: TOGGLE_STRIP_BAND_HEIGHT,
            children: (
              <ChromeProbeBoundary label={`${scene}.Strip`}>
                <Strip />
              </ChromeProbeBoundary>
            ),
          }
        : undefined,
    [Strip, scene]
  );
  const sharedSheetOwner2 = useAppRouteSharedSheetRuntimeOwner();
  // RED-proven (2026-07-27): binding sheetTranslateY woke BEHAVIORAL riders —
  // the dismiss-motion plane / search foreground-launch intent read the track's
  // header drag as search-session motion and opened the suggestion surface.
  // The old writer carried implicit session context; those riders must be
  // audited scene-by-scene before translateY binds (acceptance inventory §5.8
  // subscriber table). Until then only the safe reader set (divider, origin
  // capture) gets its value via sheetScrollOffset.
  const sharedSheetPublicationBindings = React.useMemo(
    () => ({
      sheetScrollOffset: sharedSheetOwner2.sheetScrollOffset,
    }),
    [sharedSheetOwner2.sheetScrollOffset]
  );
  const geometry = React.useMemo(
    () => ({
      expandedTop: snapPoints.expanded,
      collapsedTop: snapPoints.collapsed,
      detentTops: [snapPoints.expanded, snapPoints.middle, snapPoints.collapsed],
    }),
    [snapPoints]
  );
  return {
    commandsRef,
    title,
    dockedStrip,
    geometry,
    seatTau,
    navActionProgress,
    onNavActionPress,
    isChildScene,
    onGrabHandlePress,
    sharedSheetPublicationBindings,
    onGestureSettle,
  };
};

/** RUNG 3 — the ONE persistent scene page. Both list-parts hooks run
 * unconditionally (their data lanes are snap-gated internally); the presented
 * scene picks which content the persistent FlashList renders:
 *   polls/home → the scene's real body-content spec;
 *   mounted-registry scenes → the registry body as a one-item track body;
 *   anything else → placeholder rows. */
const UnifiedTrackScenePage: React.FC<TrackScenePageProps> = ({ scene, snapPoints, entry }) => {
  const {
    commandsRef,
    title,
    dockedStrip,
    geometry,
    seatTau,
    navActionProgress,
    onNavActionPress,
    isChildScene,
    onGrabHandlePress,
    sharedSheetPublicationBindings,
    onGestureSettle,
  } = useTrackScenePageChrome(scene, snapPoints);
  const pollsParts = usePollsPanelListSceneParts();
  const homeParts = useHomePanelListSceneParts();

  // THE LANE PATH (pollDetail conversion, generalized): scenes that PUBLISH a
  // 'list' body spec through the scene input lane (pollDetail, pollCreation,
  // restaurant, …) render those rows AS TRACK ROWS — the writers already run
  // app-wide, so the track host is just another lane reader. This is what
  // makes nested scrollables structurally unnecessary.
  const sceneRuntime = useAppRouteSceneRuntime();
  const inputAuthority = sceneRuntime.sceneInputAuthority;
  const subscribeBody = React.useCallback(
    (listener: () => void) => {
      try {
        return inputAuthority.subscribeSceneBody(
          scene as Parameters<typeof inputAuthority.subscribeSceneBody>[0],
          listener
        );
      } catch {
        return () => undefined;
      }
    },
    [inputAuthority, scene]
  );
  const getBodySnapshot = React.useCallback(
    () => inputAuthority.getSceneInputSnapshot(scene),
    [inputAuthority, scene]
  );
  const publishedInput = React.useSyncExternalStore(subscribeBody, getBodySnapshot);
  const publishedBody = publishedInput?.sceneBodyContent ?? null;

  // Static SV: on the track the body CELL rides the scroll, so the foundation
  // plate needs no counter-translation — holes track their boxes for free.
  const zeroScrollOffset = useSharedValue(0);
  const renderMountedBody = React.useCallback(() => {
    // DIRECT bodies, no registry wrapper: the wrapper's residency boundary
    // renders hidden prewarm legs which, without the old host's shell-liveness
    // context, painted VISIBLY below the live body (the phantom duplicate).
    const Body = MOUNTED_BODY_COMPONENTS[scene as SearchRouteMountedSceneBodyKey];
    if (Body == null) {
      return null;
    }
    // THE ACTIVATION BRIDGE: mounted bodies gate their data lanes on the old
    // host's activity contexts (all-false defaults left lists blank on the
    // track). On the track host the rendered scene IS the live presented scene
    // at its seat — activity is true by construction. (Rung 4 derives
    // shouldRenderExpandedContent from τ for collapsed postures.)
    const activity = {
      sceneKey: scene,
      shouldAttachMountedContent: true,
      shouldRunDataLane: true,
      shouldSubscribeDataLane: true,
      shouldRenderExpandedContent: true,
      hasActivatedExpandedContent: true,
    };
    return (
      <BottomSheetSceneStackBodyDataActivityContext.Provider value={activity}>
        <BottomSheetSceneStackBodyRenderActivityContext.Provider value={activity}>
          <BottomSheetSceneStackBodyIsActiveContext.Provider value={true}>
            {/* THE REAL FOUNDATION (rung 4): white plate + FrostCutout store —
                profile stats / home bands punch through to the kit's frost;
                the strip law sees its plate. Zero scroll offset: the cell
                itself rides the track. */}
            <SceneBodyFoundationSurface
              scrollOffset={zeroScrollOffset}
              sceneKey={scene as SheetSceneKey}
            >
              {/* padding INSIDE the surface so the white plate spans the full
                  cell (padded-outside left frost gutters at the margins). */}
              <View
                style={
                  UNPADDED_BODY_SCENES.has(scene) ? undefined : styles.mountedBodyInset
                }
              >
                <ChromeProbeBoundary label={`${scene}.body`}>
                  <Body entry={entry ?? undefined} />
                </ChromeProbeBoundary>
              </View>
            </SceneBodyFoundationSurface>
          </BottomSheetSceneStackBodyIsActiveContext.Provider>
        </BottomSheetSceneStackBodyRenderActivityContext.Provider>
      </BottomSheetSceneStackBodyDataActivityContext.Provider>
    );
  }, [entry, scene, zeroScrollOffset]);
  const renderPlaceholderRow = React.useCallback(
    ({ item }: { item: unknown }) => (
      <View style={styles.row}>
        <View style={styles.rowDot} />
        <View style={styles.rowLine} />
        <Text style={styles.rowIndex}>{String((item as number) + 1)}</Text>
      </View>
    ),
    []
  );

  const list = React.useMemo(() => {
    if (publishedBody != null && publishedBody.surfaceKind === 'list') {
      return {
        leader: publishedBody.ListHeaderComponent ?? null,
        chrome: publishedBody.ListChromeComponent ?? null,
        data: publishedBody.data,
        renderItem: publishedBody.renderItem,
        keyExtractor: publishedBody.keyExtractor,
        ListEmptyComponent: publishedBody.ListEmptyComponent,
        ItemSeparatorComponent: publishedBody.ItemSeparatorComponent,
        extraData: publishedBody.extraData,
        onEndReached: publishedBody.onEndReached,
        onEndReachedThreshold: publishedBody.onEndReachedThreshold,
      };
    }
    const partsFor = scene === 'polls' ? pollsParts : scene === 'home' ? homeParts : null;
    if (partsFor != null && partsFor.sceneBodyContent.surfaceKind === 'list') {
      const spec = partsFor.sceneBodyContent;
      return {
        data: spec.data,
        renderItem: spec.renderItem,
        keyExtractor: spec.keyExtractor,
        ListEmptyComponent: spec.ListEmptyComponent,
        ItemSeparatorComponent: spec.ItemSeparatorComponent,
        extraData: spec.extraData,
        onEndReached: spec.onEndReached,
        onEndReachedThreshold: spec.onEndReachedThreshold,
      };
    }
    if (MOUNTED_TRACK_SCENES.has(scene)) {
      return { data: [scene], renderItem: renderMountedBody };
    }
    return {
      data: PLACEHOLDER_ROWS,
      renderItem: renderPlaceholderRow,
    };
  }, [homeParts, pollsParts, publishedBody, renderMountedBody, renderPlaceholderRow, scene]);

  return (
    <View style={styles.root} pointerEvents="box-none">
      <TrackSheetPage
        geometry={geometry}
        title={title}
        navActionProgress={navActionProgress}
        onNavActionPress={onNavActionPress}
        grabHandleHidden={scene === 'settings'}
        onGrabHandlePress={onGrabHandlePress}
        dockedStrip={dockedStrip}
        list={list as TrackSheetPageProps<unknown>['list']}
        listLeader={
          (list as { leader?: unknown }).leader != null ? (
            <SceneBodyFoundationSurface
              scrollOffset={zeroScrollOffset}
              sceneKey={scene as SheetSceneKey}
            >
              {/* Lane leaders (poll card): white plate + FrostCutout support +
                  the production content inset. */}
              <View style={styles.mountedBodyInset}>
                {renderListLeader((list as { leader?: unknown }).leader)}
              </View>
            </SceneBodyFoundationSurface>
          ) : null
        }

        rowSurfaceStyle={
          MOUNTED_TRACK_SCENES.has(scene)
            ? UNPADDED_BODY_SCENES.has(scene)
              ? styles.mountedSurfaceUnpadded
              : styles.mountedSurface
            : publishedBody?.surfaceKind === 'list' || scene === 'polls'
              ? styles.rowSurface
              : undefined
        }
        debugHud
        commandsRef={commandsRef}
        seatTau={seatTau}
        publicationBindings={sharedSheetPublicationBindings}
        onGestureSettle={onGestureSettle}
        onUserListScrollActivity={
          scene === 'polls' ? pollsParts.sceneBodyTransport.onUserListScrollActivity : undefined
        }
      />
    </View>
  );
};

const PLACEHOLDER_ROWS = Array.from({ length: 30 }, (_, index) => index);

// Published specs carry ListHeaderComponent as element OR component type.
const renderListLeader = (leader: unknown): React.ReactNode => {
  if (leader == null) {
    return null;
  }
  if (React.isValidElement(leader)) {
    return leader;
  }
  const Leader = leader as React.ComponentType;
  return <Leader />;
};

const MOUNTED_BODY_COMPONENTS: Partial<
  Record<SearchRouteMountedSceneBodyKey, React.ComponentType<{ entry?: OverlayRouteEntry | null }>>
> = {
  lists: ListsMountedSceneBody,
  profile: ProfileMountedSceneBody,
  saveList: SaveListMountedSceneBody,
  userProfile: UserProfileMountedSceneBody,
  listDetail: ListDetailMountedSceneBody,
  followList: FollowListMountedSceneBody,
  notifications: NotificationsMountedSceneBody,
  settings: SettingsMountedSceneBody,
  editProfile: EditProfileMountedSceneBody,
  postPhotos: PostPhotosPanelBody,
  messagesInbox: MessagesInboxPanelBody,
  dmSession: DmSessionPanelBody,
};

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 91 },
  hidden: { opacity: 0 },
  hostAboveStack: { zIndex: 91 },
  headerRow: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  fallbackTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  // Production's body inset (useBottomSheetSceneStackBodyContentRuntime applies
  // OVERLAY_HORIZONTAL_PADDING via the transport) — mounted bodies expect it.
  rowSurface: { paddingHorizontal: OVERLAY_HORIZONTAL_PADDING },
  // Mounted cells: the FOUNDATION plate is the white now — the cell must be
  // transparent or cutout holes reveal cell-white instead of frost.
  mountedSurface: { backgroundColor: 'transparent' },
  mountedBodyInset: { paddingHorizontal: OVERLAY_HORIZONTAL_PADDING },
  mountedSurfaceUnpadded: { backgroundColor: 'transparent' },
  closeAction: {
    position: 'absolute',
    right: 16,
    top: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeActionText: { fontSize: 20, color: '#0f172a', lineHeight: 22 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 20, gap: 12 },
  rowDot: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#cbd5e1' },
  rowLine: { flex: 1, height: 12, borderRadius: 6, backgroundColor: '#e2e8f0' },
  rowIndex: { color: '#94a3b8', fontSize: 12 },
});

export default TrackSheetRouteHost;
