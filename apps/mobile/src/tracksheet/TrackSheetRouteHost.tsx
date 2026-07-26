import React from 'react';
import { Dimensions, Linking, StyleSheet, Text, View } from 'react-native';

import { getPersistentHeaderDescriptor } from '../navigation/runtime/app-route-persistent-header-registry';
import { OVERLAY_HORIZONTAL_PADDING } from '../overlays/overlay-chrome-metrics';
import { useAppRouteSceneRuntime } from '../navigation/runtime/AppRouteSceneRuntimeProvider';
import { usePresentationFrame } from '../navigation/runtime/use-presentation-frame';
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
      style={[StyleSheet.absoluteFill, !state.on && styles.hidden]}
      pointerEvents={state.on ? 'box-none' : 'none'}
    >
      <TrackSheetRouteSurface scene={state.scene} />
    </View>
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
  // LIVE geometry: computed per render (cheap) — a boot-time memo froze
  // pre-layout values and mis-seated the sheet.
  const snapPoints = getSearchStartupGeometrySeed().routeOverlaySnapPoints;
  const sceneRuntime = useAppRouteSceneRuntime();
  const frame = usePresentationFrame(sceneRuntime.routeSceneSwitchRuntime);
  const scene = frame.activeSceneKey ?? sceneOverride;

  // RUNG 3 — REAL BODIES through ONE PERSISTENT PAGE: the track surface never
  // remounts (production shape; remount churn hit a Fabric unmount assert) —
  // scene switches swap chrome + body content inside UnifiedTrackScenePage.
  return <UnifiedTrackScenePage scene={scene} snapPoints={snapPoints} />;
};

// The mounted-body registry's scene set (searchOverlayRouteHostContract) minus
// the list-parts scenes and search (owns its dual-band composition — LAST).
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
};

/** Shared chrome + page assembly for every scene page. */
const useTrackScenePageChrome = (
  scene: OverlayKey,
  snapPoints: TrackScenePageProps['snapPoints']
) => {
  const commandsRef = React.useRef<TrackSheetCommands | null>(null);
  const trackH = snapPoints.collapsed - snapPoints.expanded;
  // THE SEAT is declarative now: simplified posture rule (full motion-descriptor
  // table = rung 4) expressed as a target τ the page re-asserts itself.
  const seatTau = scene === 'home' ? 0 : trackH;

  const descriptor = getPersistentHeaderDescriptor(scene);
  const Title = descriptor?.Title;
  const Strip = descriptor?.Strip;
  const header = React.useMemo(
    () => (
      <View style={styles.headerRow} pointerEvents="box-none">
        {Title != null ? (
          <ChromeProbeBoundary label={`${scene}.Title`}>
            <Title />
          </ChromeProbeBoundary>
        ) : (
          <Text style={styles.fallbackTitle}>{scene}</Text>
        )}
      </View>
    ),
    [Title, scene]
  );
  const dockedStrip = React.useMemo(
    () =>
      Strip != null
        ? {
            height: 54,
            children: (
              <ChromeProbeBoundary label={`${scene}.Strip`}>
                <Strip />
              </ChromeProbeBoundary>
            ),
          }
        : undefined,
    [Strip, scene]
  );
  const geometry = React.useMemo(
    () => ({
      expandedTop: snapPoints.expanded,
      collapsedTop: snapPoints.collapsed,
      detentTops: [snapPoints.expanded, snapPoints.middle, snapPoints.collapsed],
    }),
    [snapPoints]
  );
  return { commandsRef, header, dockedStrip, geometry, seatTau };
};

/** RUNG 3 — the ONE persistent scene page. Both list-parts hooks run
 * unconditionally (their data lanes are snap-gated internally); the presented
 * scene picks which content the persistent FlashList renders:
 *   polls/home → the scene's real body-content spec;
 *   mounted-registry scenes → the registry body as a one-item track body;
 *   anything else → placeholder rows. */
const UnifiedTrackScenePage: React.FC<TrackScenePageProps> = ({ scene, snapPoints }) => {
  const { commandsRef, header, dockedStrip, geometry, seatTau } = useTrackScenePageChrome(
    scene,
    snapPoints
  );
  const pollsParts = usePollsPanelListSceneParts();
  const homeParts = useHomePanelListSceneParts();

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
            <ChromeProbeBoundary label={`${scene}.body`}>
              <Body />
            </ChromeProbeBoundary>
          </BottomSheetSceneStackBodyIsActiveContext.Provider>
        </BottomSheetSceneStackBodyRenderActivityContext.Provider>
      </BottomSheetSceneStackBodyDataActivityContext.Provider>
    );
  }, [scene]);
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
  }, [homeParts, pollsParts, renderMountedBody, renderPlaceholderRow, scene]);

  return (
    <View style={styles.root} pointerEvents="box-none">
      <TrackSheetPage
        geometry={geometry}
        header={header}
        headerHeight={64}
        dockedStrip={dockedStrip}
        list={list as TrackSheetPageProps<unknown>['list']}
        rowSurfaceStyle={
          scene === 'polls' || MOUNTED_TRACK_SCENES.has(scene) ? styles.rowSurface : undefined
        }
        debugHud
        commandsRef={commandsRef}
        seatTau={seatTau}
      />
    </View>
  );
};

const PLACEHOLDER_ROWS = Array.from({ length: 30 }, (_, index) => index);

const MOUNTED_BODY_COMPONENTS: Partial<
  Record<SearchRouteMountedSceneBodyKey, React.ComponentType>
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
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 20, gap: 12 },
  rowDot: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#cbd5e1' },
  rowLine: { flex: 1, height: 12, borderRadius: 6, backgroundColor: '#e2e8f0' },
  rowIndex: { color: '#94a3b8', fontSize: 12 },
});

export default TrackSheetRouteHost;
