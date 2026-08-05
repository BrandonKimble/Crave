import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { useSharedValue, withTiming, Easing } from 'react-native-reanimated';
// THE ONE SCENE-DECLARATION SCHEMA — every per-scene fact this host used to hand-keep.
import {
  resolveSceneCreateFallbackRoute,
  sceneHidesGrabHandle,
  sceneIsChildRole,
} from '../navigation/runtime/scene-foundation-spec';

import { getPersistentHeaderDescriptor } from '../navigation/runtime/app-route-persistent-header-registry';
import {
  getLiveTransitionTxn,
  offerTransitionJoinInput,
} from '../navigation/runtime/transition-engine/transition-transaction';
import { setTrackFlipState, useTrackFlipState } from './track-flip-store';
import {
  runHeaderCloseAction,
  runHeaderCreateAction,
} from '../navigation/runtime/header-nav-action-registry';
import { useAppOverlayRouteController } from '../overlays/useAppOverlayRouteController';
import { SearchRouteSheetFrameHost } from '../overlays/SearchRouteSheetFrameHost';
import { useAppRouteSceneRuntime } from '../navigation/runtime/AppRouteSceneRuntimeProvider';
import { useAppRouteSharedSheetRuntimeOwner } from '../navigation/runtime/AppRouteSharedSheetRuntimeProvider';
import { usePresentationFrame } from '../navigation/runtime/use-presentation-frame';
import type { OverlayRouteEntry } from '../navigation/runtime/app-overlay-route-types';
import type { OverlayKey } from '../overlays/types';
import { getSearchStartupGeometrySeed } from '../screens/Search/runtime/shared/search-startup-geometry-seed-runtime';
import { TrackSheetPage } from './TrackSheetPage';
import { resolveHiddenPresentation } from './track-entry-hidden';
import { getTrackMotionAuthority } from './track-motion-authority';
import { ChromeProbeBoundary, renderListLeader } from './track-sheet-chrome-parts';
import { runTrackCommitTxnBridge } from './track-txn-bridge';
import { useNativeHiddenEdgeSource, useTrackMotionController } from './use-track-motion-controller';
import { assertMountedBodyAgreement, useTrackLegResolver } from './use-track-leg-resolver';
import { useTrackA11yAnnouncer } from './use-track-a11y-announcer';

// ─── TrackSheetRouteHost — THE PRODUCTION SHEET HOST ──────────────────────────
//
// This file IS the sheet the app renders through. `track-flip-store.ts:12` ships
// `on: true` and this host is mounted unconditionally; the strangler completed at
// rung 5 (see "THE FLIP" below). It owns the scene's registered persistent-header
// descriptor (Title + Strip from the registry), the calculateSnapPoints geometry
// riding the track, scene switching, and the real scene bodies.
//
// THE HOST EXTRACTIONS (deep red team §4, the last ratified deferred item): the
// three governments this orchestrator used to run left the .tsx, each with its
// own pure decision module and falsifier —
//   • MOTION       → use-track-motion-controller.ts + track-motion-plan.ts
//   • TXN BRIDGE   → track-txn-bridge.ts
//   • LEG / BODY   → use-track-leg-resolver.tsx + track-leg-plan.ts
// What is left is the orchestration the critique judged legitimate: read the
// frame, resolve the presented (scene, entry), build the chrome, hand the page a
// plan.
//
// The deep link is the EMERGENCY ROLLBACK + debug-visuals toggle, not the way in:
//
//   crave://tracksheet-host?on=0   (rollback to the old host; on=1 restores; scene: any OverlayKey)
//
// F877 (2026-08-03): this header used to read "migration RUNG 1 (dev-flagged parallel
// host) … The old sheet host is untouched; this renders above it behind a dev deep link"
// — the exact OPPOSITE of the code, contradicted fifty lines below by its own post-flip
// note. A reader who trusted it believed this file was inert scaffolding and would have
// edited it accordingly. Scaffolding prose that outlives its scaffolding is worse than no
// prose: it spends the trust the surviving comments need.

const DEEP_LINK_HOST = 'tracksheet-host';

export const TrackSheetRouteHost: React.FC = () => {
  assertMountedBodyAgreement();
  // THE FLIP (rung 5): the track host is the DEFAULT. The deep link is the
  // emergency rollback + debug-visuals toggle (see track-flip-store).
  const state = useTrackFlipState();
  // THE ONE native edge subscription for the whole track (motion controller):
  // mounted once, at the root, feeding the motion authority.
  useNativeHiddenEdgeSource();

  React.useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url || !url.includes(DEEP_LINK_HOST)) {
        return;
      }
      if (/[?&]on=(0|false)/i.test(url)) {
        setTrackFlipState({ on: false });
      } else if (/[?&]on=(1|true)/i.test(url)) {
        setTrackFlipState({ on: true });
      }
      if (/[?&]debug=(1|true)/i.test(url)) {
        setTrackFlipState({ debug: true });
      } else if (/[?&]debug=(0|false)/i.test(url)) {
        setTrackFlipState({ debug: false });
      }
    };
    Linking.getInitialURL()
      .then(handleUrl)
      .catch(() => undefined);
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  // HIDE, never unmount: tearing the track down mid-session hit a Fabric
  // mounting-coordinator assert (unregisterViewComponentDescriptor SIGABRT).
  return (
    <View
      // z at the SIBLING level: zIndex only competes among siblings, and the
      // production stack (z 90) is THIS wrapper's sibling — an inner z was
      // silently losing whenever the sheets overlapped (anti-trap round 3).
      style={[StyleSheet.absoluteFill, styles.hostAboveStack, !state.on && styles.hidden]}
      pointerEvents={state.on ? 'box-none' : 'none'}
    >
      <NavExcludedTrackSurface scene={'polls' as OverlayKey} />
    </View>
  );
};

/** NAV EXCLUSION (inventory §5.1): the sheet subtree renders inside the same
 * native mask the production frame host uses — the sheet is carved around the
 * nav silhouette and hard-clipped at the nav top. Static persistent-mode props
 * for now (nav hide choreography joins with the motion work). */
const NavExcludedTrackSurface: React.FC<{ scene: OverlayKey }> = ({ scene }) => {
  // NAV EXCLUSION — REUSE, DON'T REIMPLEMENT (2026-07-28). SearchRouteSheetFrameHost
  // IS the nav-exclusion abstraction: it selects the live nav SharedValues from
  // routeHostVisualRuntimeAuthority and drives ONE native mask view with an
  // ANIMATED pair (maskEnabled + navBodyBoundaryTranslateY) plus a following
  // hard clip. That single mechanism produces BOTH behaviours we need — the
  // boundary that follows the nav out and back (so the vacated band never shows
  // the map) AND the silhouette curve — in the same frame as the nav's own
  // motion. Writing a second copy here would be a second writer of the same
  // boundary, which is the exact class of bug this whole arc has been deleting;
  // my earlier attempt failed only because I passed STATIC props instead of the
  // animated pair. The old static clip is gone with this.
  const sceneRuntime = useAppRouteSceneRuntime();
  const frame = usePresentationFrame(sceneRuntime.routeSceneSwitchRuntime);
  // PRESENTED truth (the old host's documented law): the sheet titles and hosts
  // WHAT IT IS PAINTING. The one legal steady divergence is the docked lane —
  // activeSceneKey is 'search' while the sheet presents the docked feed; reading
  // activeSceneKey here rendered the SEARCH chrome ("Results") over home at boot.
  const liveScene = frame.presentedSceneKey ?? frame.activeSceneKey ?? scene;
  const chinInput = sceneRuntime.sceneInputAuthority.getSceneInputSnapshot(liveScene);
  const chinBody = chinInput?.sceneBodyContent;
  const listChrome =
    chinBody != null && chinBody.surfaceKind === 'list'
      ? renderListLeader(chinBody.ListChromeComponent ?? null)
      : null;
  return (
    <>
      <SearchRouteSheetFrameHost
        routeHostVisualRuntimeAuthority={sceneRuntime.routeHostVisualRuntimeAuthority}
      >
        <TrackSheetRouteSurface scene={scene} />
      </SearchRouteSheetFrameHost>
      {/* The compose chin stays OUTSIDE the mask: its offsets are viewport-based
          (production numbers), and it must not be carved by the nav silhouette. */}
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
  // PRESENTED truth, same law as the outer host (see liveScene above).
  const scene = frame.presentedSceneKey ?? frame.activeSceneKey ?? sceneOverride;

  // THE TRANSACTION BRIDGE (track-txn-bridge.ts): with the old host unmounted,
  // THIS host records the chrome + paint acks that scene-switch transactions
  // join on — otherwise every switch deadlocks. The ORDER LAW and the hidden
  // family's routing rule are a pure function with a falsifier there, instead of
  // thirty lines of prose here.
  const switchId = frame.switchId;
  React.useLayoutEffect(() => {
    runTrackCommitTxnBridge({
      scene,
      commitPaintAck: () =>
        sceneRuntime.routeSceneSwitchRuntime.commitPresentationPaintAck(switchId),
    });
  }, [switchId, scene, sceneRuntime]);

  // THE ENTRY: child bodies receive their route entry (params — listId etc.)
  // exactly like the registry mount unit passes it (W1 slice 1). ENTRY IDENTITY
  // (G-ENTRY): the id rides the scene we chose — presentedEntryId when the
  // scene came from presented truth, activeEntryId otherwise — and is the
  // second half of the track's `sceneKey#entryId` identity.
  const sceneEntryId =
    frame.presentedSceneKey != null ? frame.presentedEntryId : frame.activeEntryId;

  // ── THE DEFERRED SWAP AT THE SCREEN EDGE (G-HIDDEN / A2, R4) ───────────────
  // A freeze-mode dismiss (terminalDismiss + preserveOutgoingUntilSettle) is a
  // user-visible, multi-frame slide: the outgoing entry AND its chrome must
  // ride it fully opaque, and the content swap fires only when the sheet
  // CLEARS THE SCREEN EDGE — never at τ=0 (the collapsed band is still
  // visible there) and never mid-flight. The edge fact is native
  // (trackHiddenEdgeCleared, emitted the frame τ reaches the excursion
  // target); the paint decision is pure (resolveHiddenPresentation). The
  // txn's 'boundary' join input — declared by the stager for freeze plans —
  // is offered HERE, so the reveal joins exactly at the edge.
  const paintedRef = React.useRef<{ scene: OverlayKey; entryId: string | null }>({
    scene,
    entryId: sceneEntryId ?? null,
  });
  const clearedTxnRef = React.useRef<unknown>(null);
  const [, bumpEdgeSeq] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(
    () =>
      // THE AUTHORITY IS THE BUS (was: a second hand-rolled emitter subscription
      // re-validating the generation stamp here). Only edges the authority
      // matched to the excursion WE armed reach this listener — a stale native
      // target's event can never commit a swap.
      getTrackMotionAuthority().subscribeHiddenEdge(() => {
        // Record WHICH transaction's edge cleared (a later hide must hold again
        // even if this state lingers), offer the boundary, then re-render to
        // commit the swap in the next paint.
        clearedTxnRef.current = getLiveTransitionTxn();
        offerTransitionJoinInput('boundary');
        bumpEdgeSeq();
      }),
    []
  );
  const liveTxnForHide = getLiveTransitionTxn();
  const hideInFlight =
    liveTxnForHide != null &&
    liveTxnForHide.plan.content.kind === 'freezeUntilSnap' &&
    (liveTxnForHide.phase === 'staged' || liveTxnForHide.phase === 'committed');
  const presentation = resolveHiddenPresentation({
    frameScene: scene,
    frameEntryId: sceneEntryId ?? null,
    paintedScene: paintedRef.current.scene,
    paintedEntryId: paintedRef.current.entryId,
    hideInFlight,
    edgeCleared: clearedTxnRef.current === liveTxnForHide,
  });
  const paintedScene = presentation.scene as OverlayKey;
  const paintedEntryId = presentation.entryId;
  paintedRef.current = { scene: paintedScene, entryId: paintedEntryId };

  const activeEntry = React.useMemo(() => {
    if (paintedEntryId == null) {
      return null;
    }
    const routeState = sceneRuntime.routeSceneSwitchRuntime.getRouteState();
    return (
      routeState.overlayRouteStack.find((entry) => entry.entryId === paintedEntryId) ??
      (routeState.activeOverlayRoute.entryId === paintedEntryId
        ? routeState.activeOverlayRoute
        : null)
    );
  }, [paintedEntryId, sceneRuntime]);

  // RUNG 3 — REAL BODIES through ONE PERSISTENT PAGE: the track surface never
  // remounts (production shape; remount churn hit a Fabric unmount assert) —
  // scene switches swap chrome + body content inside UnifiedTrackScenePage.
  return (
    <UnifiedTrackScenePage
      scene={paintedScene}
      entryId={paintedEntryId}
      snapPoints={snapPoints}
      entry={activeEntry}
    />
  );
};

type TrackScenePageProps = {
  scene: OverlayKey;
  /** Route-stack entry id for the presented scene (null for tab roots / pre-commit). */
  entryId: string | null;
  snapPoints: ReturnType<typeof getSearchStartupGeometrySeed>['routeOverlaySnapPoints'];
  entry?: OverlayRouteEntry | null;
};

/** Shared chrome + page assembly for every scene page. The MOTION half of this
 * hook is the motion controller now (use-track-motion-controller.ts); what
 * remains is chrome: title, extras, the nav action, the grab handle, the
 * publication bridge, and the page geometry. */
const useTrackScenePageChrome = (
  scene: OverlayKey,
  snapPoints: TrackScenePageProps['snapPoints']
) => {
  // THE PRODUCTION POSTURE (rung 4): the seat comes from the snap session —
  // posture seats + per-scene remembered detents, gesture-written only
  // (inventory §5.10). τ mapping: expanded→H, middle→collapsed−middle,
  // collapsed→0, hidden→the excursion below collapsed (G-HIDDEN R4).
  // THE SEAT SOCKET (residents rung 4): the PARALLEL SEAT IS DELETED. The
  // track host registers as the 'sheetHost' motion target and consumes the
  // descriptor table's commands — the locked-in switch logic (stays-put,
  // home-crossing seats, preserveLiveY, promoteAtLeast, child rules) comes
  // back verbatim from the code that always owned it. Commands are
  // POSTURE-space snaps; snapTo natively adds σ and short-circuits <0.5pt.
  const sceneRuntime = useAppRouteSceneRuntime();
  const { commandsRef, reportSettleFact, reportDragBeginFact, onGestureSettle } =
    useTrackMotionController({ scene, snapPoints, sceneRuntime });

  const descriptor = getPersistentHeaderDescriptor(scene);
  const Title = descriptor?.Title;
  // Rung-4 chrome parity: the kit renders the production chrome (cutout plate,
  // grab handle, HeaderNavAction). The host supplies title + action wiring.
  const { closeActiveRoute, promoteActiveSheet, pushRoute } = useAppOverlayRouteController();
  const isChildScene = sceneIsChildRole(scene);
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
    const createFallbackRoute = resolveSceneCreateFallbackRoute(scene);
    if (!runHeaderCreateAction(scene) && createFallbackRoute != null) {
      pushRoute(createFallbackRoute);
    }
  }, [closeActiveRoute, isChildScene, pushRoute, scene]);
  // G-EXTRAS (R6): the registry's per-scene Extras chrome renders LEFT of the
  // nav action, riding the SAME 0→1 progress as the plus↔X rotation (the
  // PersistentHeaderExtrasProps contract). Scenes without Extras yield null —
  // the chrome element cache signature stays stable for them.
  const Extras = descriptor?.Extras;
  const headerExtras = React.useMemo(
    () => (Extras != null ? <Extras transitionProgress={navActionProgress} /> : null),
    [Extras, navActionProgress]
  );
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
  // THE PERSISTENT STRIPS live in the leg resolver (entry-keyed under G-ENTRY):
  // one strip element PER ENTRY, cached until the entry's leg is evicted —
  // mounted once in the band and opacity-flipped, so chips never re-measure on
  // a switch, and two entries of the same scene keep independent strip state.
  const sharedSheetOwner2 = useAppRouteSharedSheetRuntimeOwner();
  // POST-FLIP: the track is the ONLY sheetTranslateY writer (the old runtime
  // no longer renders), so the full binding is on — search chrome scale, the
  // scrim, and the shortcut choreography ride the track (inventory §3). The
  // pre-flip misfire (suggestion surface) was the OLD system's state machines
  // reacting to a second writer; with one writer the semantics are the
  // production ones. Behavioral riders stay on the burn-in watchlist.
  const sharedSheetPublicationBindings = React.useMemo(
    () => ({
      sheetTranslateY: sharedSheetOwner2.sheetTranslateY,
      sheetScrollOffset: sharedSheetOwner2.sheetScrollOffset,
    }),
    [sharedSheetOwner2.sheetScrollOffset, sharedSheetOwner2.sheetTranslateY]
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
    headerExtras,
    reportSettleFact,
    reportDragBeginFact,
    geometry,
    navActionProgress,
    onNavActionPress,
    onGrabHandlePress,
    sharedSheetPublicationBindings,
    onGestureSettle,
  };
};

/** RUNG 3 — the ONE persistent scene page: chrome from the descriptor registry,
 * legs from the leg resolver, motion from the motion controller. */
const UnifiedTrackScenePage: React.FC<TrackScenePageProps> = ({
  scene,
  entryId,
  snapPoints,
  entry,
}) => {
  const debugVisuals = useTrackFlipState().debug;
  const {
    commandsRef,
    title,
    headerExtras,
    reportSettleFact,
    reportDragBeginFact,
    geometry,
    navActionProgress,
    onNavActionPress,
    onGrabHandlePress,
    sharedSheetPublicationBindings,
    onGestureSettle,
  } = useTrackScenePageChrome(scene, snapPoints);
  const { presentedEntryKey, legs } = useTrackLegResolver({ scene, entryId, entry });
  // G-A11Y: the swap IS the navigation event. The host states it (announce +
  // move the cursor to the destination's header) because nothing else can —
  // one persistent list emits no screen change. Decision: track-a11y-plan.ts.
  const headerFocusRef = React.useRef<unknown>(null);
  useTrackA11yAnnouncer({ presentedEntryKey, scene, headerFocusRef });

  return (
    <View style={styles.root} pointerEvents="box-none">
      <TrackSheetPage
        geometry={geometry}
        title={title}
        headerExtras={headerExtras}
        navActionProgress={navActionProgress}
        onNavActionPress={onNavActionPress}
        grabHandleHidden={sceneHidesGrabHandle(scene)}
        onGrabHandlePress={onGrabHandlePress}
        legs={legs}
        presentedEntryKey={presentedEntryKey}
        headerFocusRef={headerFocusRef}
        debugHud={debugVisuals}
        commandsRef={commandsRef}
        publicationBindings={sharedSheetPublicationBindings}
        onGestureSettle={onGestureSettle}
        // R7 fence, pending side: a native drag begin is a proven motion fact —
        // it OPENS a drag episode in the motion authority (so a redraw arming
        // mid-drag can see the motion: F2) and flips the fence pending.
        onDragBegin={reportDragBeginFact}
        // The settle fact goes to the authority, which decides which episode it
        // ends; the rest handler restores the fence and completes its token.
        onSettle={reportSettleFact}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 91 },
  hidden: { opacity: 0 },
  hostAboveStack: { zIndex: 91 },
  fallbackTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
});

export default TrackSheetRouteHost;
