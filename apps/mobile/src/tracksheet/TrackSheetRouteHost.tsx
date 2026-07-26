import React from 'react';
import { Dimensions, Linking, StyleSheet, Text, View } from 'react-native';

import { getPersistentHeaderDescriptor } from '../navigation/runtime/app-route-persistent-header-registry';
import { useAppRouteSceneRuntime } from '../navigation/runtime/AppRouteSceneRuntimeProvider';
import { usePresentationFrame } from '../navigation/runtime/use-presentation-frame';
import type { OverlayKey } from '../overlays/types';
import { getSearchStartupGeometrySeed } from '../screens/Search/runtime/shared/search-startup-geometry-seed-runtime';
import { usePollsPanelListSceneParts } from '../overlays/panels/PollsPanel';
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

  if (!state.on) {
    return null;
  }
  return <TrackSheetRouteSurface scene={state.scene} />;
};

const TrackSheetRouteSurface: React.FC<{ scene: OverlayKey }> = ({ scene: sceneOverride }) => {
  // RUNG 2 — REAL GEOMETRY + LIVE SCENE: the canonical snap points come from the
  // startup geometry seed (the same routeOverlaySnapPoints the production sheet
  // rides), and the presented scene tracks the PresentationFrame — tab presses
  // switch this host's chrome exactly as they switch the production sheet's.
  const snapPoints = React.useMemo(
    () => getSearchStartupGeometrySeed().routeOverlaySnapPoints,
    []
  );
  const sceneRuntime = useAppRouteSceneRuntime();
  const frame = usePresentationFrame(sceneRuntime.routeSceneSwitchRuntime);
  const scene = frame.activeSceneKey ?? sceneOverride;

  // RUNG 3 — REAL BODIES, scene by scene: migrated scenes render their real
  // body-content spec through TrackSheetPage; the rest ride the placeholder.
  const ScenePage = scene === 'polls' ? PollsTrackScenePage : PlaceholderTrackScenePage;
  return <ScenePage key={scene} scene={scene} snapPoints={snapPoints} />;
};

type TrackScenePageProps = {
  scene: OverlayKey;
  snapPoints: ReturnType<typeof getSearchStartupGeometrySeed>['routeOverlaySnapPoints'];
};

/** Shared chrome + page assembly for every scene page. */
const useTrackScenePageChrome = (scene: OverlayKey, snapPoints: TrackScenePageProps['snapPoints']) => {
  const commandsRef = React.useRef<TrackSheetCommands | null>(null);
  const trackH = snapPoints.collapsed - snapPoints.expanded;
  React.useEffect(() => {
    // Simplified posture rule (full motion-descriptor table = rung 4).
    commandsRef.current?.snapToTau(scene === 'home' ? 0 : trackH);
  }, [scene, trackH]);

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
  return { commandsRef, header, dockedStrip, geometry };
};

/** RUNG 3, scene 1: the REAL polls feed — the scene's own body-content spec
 * (usePollsPanelListSceneParts: real data lane, PollCard renderers, pagination,
 * empty/loading choreography) riding the one track. */
const PollsTrackScenePage: React.FC<TrackScenePageProps> = ({ scene, snapPoints }) => {
  const { commandsRef, header, dockedStrip, geometry } = useTrackScenePageChrome(scene, snapPoints);
  const { sceneBodyContent, sceneBodyTransport } = usePollsPanelListSceneParts();
  const list = React.useMemo(() => {
    if (sceneBodyContent.surfaceKind !== 'list') {
      return { data: [], renderItem: () => null };
    }
    return {
      data: sceneBodyContent.data,
      renderItem: sceneBodyContent.renderItem,
      keyExtractor: sceneBodyContent.keyExtractor,
      ListEmptyComponent: sceneBodyContent.ListEmptyComponent,
      ItemSeparatorComponent: sceneBodyContent.ItemSeparatorComponent,
      extraData: sceneBodyContent.extraData,
      onEndReached: sceneBodyContent.onEndReached,
      onEndReachedThreshold: sceneBodyContent.onEndReachedThreshold,
    };
  }, [sceneBodyContent]);
  // Pagination's real trigger: the transport's user-scroll-activity signal.
  const onUserScroll = sceneBodyTransport.onUserListScrollActivity;
  void onUserScroll; // wired in the follow-up slice (needs τ→list-offset mapping)
  return (
    <View style={styles.root} pointerEvents="box-none">
      <TrackSheetPage
        geometry={geometry}
        header={header}
        headerHeight={64}
        dockedStrip={dockedStrip}
        list={list as TrackSheetPageProps<unknown>['list']}
        rowSurfaceStyle={styles.rowSurface}
        debugHud
        commandsRef={commandsRef}
      />
    </View>
  );
};

const PlaceholderTrackScenePage: React.FC<TrackScenePageProps> = ({ scene, snapPoints }) => {
  const { commandsRef, header, dockedStrip, geometry } = useTrackScenePageChrome(scene, snapPoints);
  const rows = React.useMemo(() => Array.from({ length: 30 }, (_, index) => index), []);
  const renderRow = React.useCallback(
    ({ item }: { item: number }) => (
      <View style={styles.row}>
        <View style={styles.rowDot} />
        <View style={styles.rowLine} />
        <Text style={styles.rowIndex}>{item + 1}</Text>
      </View>
    ),
    []
  );
  return (
    <View style={styles.root} pointerEvents="box-none">
      <TrackSheetPage
        geometry={geometry}
        header={header}
        headerHeight={64}
        dockedStrip={dockedStrip}
        list={{ data: rows, renderItem: renderRow }}
        rowSurfaceStyle={styles.rowSurface}
        debugHud
        commandsRef={commandsRef}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 91 },
  headerRow: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  fallbackTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  rowSurface: { paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 20, gap: 12 },
  rowDot: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#cbd5e1' },
  rowLine: { flex: 1, height: 12, borderRadius: 6, backgroundColor: '#e2e8f0' },
  rowIndex: { color: '#94a3b8', fontSize: 12 },
});

export default TrackSheetRouteHost;
