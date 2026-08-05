import React from 'react';
import { Linking, NativeEventEmitter, NativeModules, StyleSheet, Text, View } from 'react-native';

import {
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import type { SheetSceneKey } from '../navigation/runtime/scene-foundation-spec';
// THE ONE SCENE-DECLARATION SCHEMA — every per-scene fact this host used to hand-keep.
import {
  SCENE_DECLARATIONS,
  resolveSceneCreateFallbackRoute,
  resolveSceneListPartsSource,
  sceneDeclaresSharedRowSurface,
  sceneHidesGrabHandle,
  sceneIsChildRole,
  sceneIsResidentTrackScene,
  sceneMountedBodyIsEdgeToEdge,
  sceneReportsUserScrollActivity,
  sceneUsesMountedTrackBody,
} from '../navigation/runtime/scene-foundation-spec';

import { getPersistentHeaderDescriptor } from '../navigation/runtime/app-route-persistent-header-registry';
import {
  amendTransitionTxnJoinInputs,
  getLiveTransitionTxn,
  offerTransitionJoinInput,
  sealLiveTransitionTxnJoin,
} from '../navigation/runtime/transition-engine/transition-transaction';
import { recordSceneChromeAck } from '../overlays/scene-chrome-ack-runtime';
import { setTrackFlipState, useTrackFlipState } from './track-flip-store';
import {
  runHeaderCloseAction,
  runHeaderCreateAction,
} from '../navigation/runtime/header-nav-action-registry';
import { useAppOverlayRouteController } from '../overlays/useAppOverlayRouteController';
import { OVERLAY_HORIZONTAL_PADDING } from '../overlays/overlay-chrome-metrics';
import { SceneBodyFoundationSurface } from '../overlays/SceneBodyFoundationSurface';
import { SceneLoadingSurface } from '../components/skeletons';
import { SearchRouteSheetFrameHost } from '../overlays/SearchRouteSheetFrameHost';
import { useAppRouteSceneRuntime } from '../navigation/runtime/AppRouteSceneRuntimeProvider';
import { useAppRouteSharedSheetRuntimeOwner } from '../navigation/runtime/AppRouteSharedSheetRuntimeProvider';
import { usePresentationFrame } from '../navigation/runtime/use-presentation-frame';
import type { OverlayRouteEntry } from '../navigation/runtime/app-overlay-route-types';
import type { OverlayKey } from '../overlays/types';
import { getSearchSurfaceRuntime } from '../screens/Search/runtime/surface/search-surface-runtime';
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
import { TrackSheetPage, type TrackSheetCommands } from './TrackSheetPage';
import {
  makeTrackEntryKey,
  publicationMatchesEntry,
  type TrackEntryKey,
} from './track-entry-identity';
import {
  consumeTrackScenePrewarmRequests,
  planScenePrewarm,
  subscribeTrackScenePrewarm,
} from './track-entry-prewarm';
import { auditTrackEntryLiveness, type TrackEntryLivenessSample } from './track-entry-liveness';
import { resolveSnapTargetForRead } from './track-entry-interrupt';
import { TrackEntryRetention, TRACK_CHILD_RETENTION_DEPTH } from './track-entry-retention';
import { deriveTrackEntryBodyActivity } from './track-entry-activity';
import {
  isResolutionReady,
  resolutionHasRealRows,
  TrackEntryReadinessLedger,
  type TrackEntryBodyResolution,
} from './track-entry-readiness';
import { trackSkeletonMaterialForScene } from './track-entry-skeleton';
import { resolveHiddenPresentation } from './track-entry-hidden';
import { getTrackMotionAuthority, type TrackMotionTransition } from './track-motion-authority';

// ─── TrackSheetRouteHost — THE PRODUCTION SHEET HOST ──────────────────────────
//
// This file IS the sheet the app renders through. `track-flip-store.ts:12` ships
// `on: true` and this host is mounted unconditionally; the strangler completed at
// rung 5 (see "THE FLIP" below). It owns the scene's registered persistent-header
// descriptor (Title + Strip from the registry), the calculateSnapPoints geometry
// riding the track, scene switching, and the real scene bodies.
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

const markSheetLegReady = (): void => {
  const runtime = getSearchSurfaceRuntime();
  const transactionId = runtime.getActiveOrPendingRedrawTransactionId();
  if (transactionId != null) {
    runtime.markRedrawSheetReady(transactionId);
  }
};

// THE FENCE, PENDING side (R7 — D2 closed; see track-motion-authority.ts for the
// derivation): flip the surface's sheet-motion fence the instant a PROVEN motion
// begins — a will-move command or a native drag begin. Keyed to a live/pending
// search redraw exactly like the READY side, so unrelated surfaces never touch it.
const markSheetLegMotionPending = (): void => {
  const runtime = getSearchSurfaceRuntime();
  const transactionId = runtime.getActiveOrPendingRedrawTransactionId();
  if (transactionId != null) {
    runtime.markRedrawSheetMotionPending(transactionId);
  }
};

// ─── THE ONE NATIVE EDGE SOURCE (motion authority) ────────────────────────────
// Native stamps every trackHiddenEdgeCleared with the excursion generation it
// minted at arm time. This file used to hold BOTH a module-scope
// `armedHiddenExcursionGeneration` register AND two independent
// NativeEventEmitter subscriptions to the same emission (the deferred-swap gate
// and the hidden-settle completion), each re-validating the stamp by hand — the
// textbook "no bus" tell. Now there is ONE subscription: it dispatches the raw
// fact into the motion authority, which validates it against the episode that
// armed it and fans the VALIDATED edge out to both consumers
// (authority.subscribeHiddenEdge). The register is the authority's
// state.armedExcursion.
//
// It lives here (not in the authority module) because the authority is
// deliberately RN-free: the pure jest lane and the search surface runtime both
// consult it, and neither may import the native boundary.
const useNativeHiddenEdgeSource = (): void => {
  React.useEffect(() => {
    const physicsModule = NativeModules.TrackScrollPhysics;
    if (physicsModule == null) {
      return undefined;
    }
    const emitter = new NativeEventEmitter(physicsModule);
    const sub = emitter.addListener(
      'trackHiddenEdgeCleared',
      (event: { generation?: number } | undefined) => {
        getTrackMotionAuthority().dispatch({
          type: 'excursion-edge',
          generation: event?.generation ?? null,
        });
      }
    );
    return () => sub.remove();
  }, []);
};

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
  assertMountedBodyAgreement();
  // THE FLIP (rung 5): the track host is the DEFAULT. The deep link is the
  // emergency rollback + debug-visuals toggle (see track-flip-store).
  const state = useTrackFlipState();
  // THE ONE native edge subscription for the whole track (see above): mounted
  // once, at the root, feeding the motion authority.
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

  // THE ACK BRIDGE (flip prerequisite, inventory §5.5): with the old host
  // unmounted, THIS host records the chrome + paint acks that scene-switch
  // transactions join on — otherwise every switch deadlocks. Layout effect
  // (ack before the paint-visible frame); stale switchIds are rejected
  // controller-side, so over-acking is harmless.
  React.useLayoutEffect(() => {
    recordSceneChromeAck(scene);
    const liveTxn = getLiveTransitionTxn();
    if (liveTxn?.mutation.targetSceneKey === scene) {
      // THE SEAL (joinWait red team, 2026-08-01): sealing was the OLD host's
      // duty (its roles-change subscriber armed {paint, chrome} and sealed);
      // the ack bridge ported the offers but not the seal, so every track
      // switch was "un-armed" and only sealed at the idle boundary — behind
      // the sheet-settle plane's 700ms fallback. Result: revealed/settled
      // (and the L4 flush + interactivity they gate) landed ~1s after paint.
      // Port the duty: arm + seal here, where presented truth commits.
      // ORDER LAW (proven by TXN-TRACE): offers before the amend are DISCARDED
      // (consumed iff the plan declares the input), and recordSceneChromeAck
      // dedupes per scene so a revisit never re-offers — both left 'chrome'
      // pending and every reveal rode the 600ms liveness degrade. Arm FIRST,
      // then offer both inputs explicitly: the per-leg chrome twin is mounted
      // evidence at this commit, exactly like the old host's warm-paint offer.
      // NOT A BYPASS ANY MORE — THE HIDDEN FAMILY'S ROUTING (G-HIDDEN, R4):
      // a freeze-dismiss txn declares joinInputs ['boundary'] (stager) and is
      // sealed at commit; its reveal input is offered by the deferred-swap
      // gate at the screen-edge crossing (trackHiddenEdgeCleared). Amending
      // it to {paint, chrome} here would clobber that join and flip content
      // mid-slide. The branch is therefore the hidden family's routing rule,
      // not a guard around a missing feature; it dies only with the
      // freezeUntilSnap plan kind itself (R8, old-system delete).
      if (
        (liveTxn.phase === 'staged' || liveTxn.phase === 'committed') &&
        liveTxn.plan.content.kind !== 'freezeUntilSnap'
      ) {
        amendTransitionTxnJoinInputs(['paint', 'chrome']);
        sealLiveTransitionTxnJoin();
        offerTransitionJoinInput('chrome');
      }
      offerTransitionJoinInput('paint');
    }
    sceneRuntime.routeSceneSwitchRuntime.commitPresentationPaintAck(frame.switchId);
  }, [frame.switchId, scene, sceneRuntime]);

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

// F872 DISCHARGED (the ONE scene-declaration schema, redteam finding 6): the three
// hand-kept sets that used to live here — ROOT_TRACK_SCENES, RESIDENT_TRACK_SCENES,
// UNPADDED_BODY_SCENES — plus the derived MOUNTED_TRACK_SCENES and the per-scene
// ternaries (`legScene === 'polls' ? … : homeParts`, the polls create fallback, the
// `scene === 'settings'` grab handle) are DELETED. Every one of those facts is now a
// required column on the shared row in navigation/runtime/scene-foundation-spec.ts, read
// through the derived selectors imported above. A scene that disagrees with itself is no
// longer representable, and adding a scene is a single row edit.
//
// What stays here is the COMPONENT map: the schema declares `body.kind: 'mounted'`, this
// map binds the key to its React component. (Registration cannot hoist into the pure
// table without inverting the dependency — the table would import every panel.)
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

/**
 * The COMPONENT-MAP ↔ SCHEMA agreement check (the F872 failure mode, kept as a falsifier
 * now that the membership fact moved): a scene the schema declares `body.kind: 'mounted'`
 * with no component here renders NOTHING — blank body, no error. The schema is the
 * authority; this bark makes the disagreement loud instead of silent. (The reverse — a
 * component with no mounted declaration — is dead weight and also barks.)
 */
// (Run once at FIRST RENDER, not at module init: this file sits in an import cycle with the
// panel modules, so SCENE_DECLARATIONS is not yet initialized when this module body runs.)
let mountedBodyAgreementChecked = false;
const assertMountedBodyAgreement = (): void => {
  if (!__DEV__ || mountedBodyAgreementChecked) {
    return;
  }
  mountedBodyAgreementChecked = true;
  for (const sceneKey of Object.keys(SCENE_DECLARATIONS) as OverlayKey[]) {
    const declaredMounted = sceneUsesMountedTrackBody(sceneKey);
    const hasComponent =
      MOUNTED_BODY_COMPONENTS[sceneKey as SearchRouteMountedSceneBodyKey] != null;
    if (declaredMounted !== hasComponent) {
      // eslint-disable-next-line no-console
      console.error(
        `[track-host] scene '${sceneKey}' declares mounted-body=${declaredMounted} in the scene ` +
          `schema but ${hasComponent ? 'HAS' : 'has NO'} mounted body component here.`
      );
    }
  }
};

/** A leg's resolved body — whatever phase produced it (content, frozen, or the
 * skeleton), it feeds TrackSheetPage's per-leg FlashList props. Loosely typed
 * on purpose: the three lanes (published spec / parts spec / mounted one-item)
 * carry different concrete row types, reconciled at the page boundary. */
type ResolvedLegList = {
  leader?: unknown;
  data: readonly unknown[];
  renderItem: unknown;
  keyExtractor?: unknown;
  ListEmptyComponent?: unknown;
  ItemSeparatorComponent?: unknown;
  extraData?: unknown;
  onEndReached?: unknown;
  onEndReachedThreshold?: unknown;
};

type TrackScenePageProps = {
  scene: OverlayKey;
  /** Route-stack entry id for the presented scene (null for tab roots / pre-commit). */
  entryId: string | null;
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
  // collapsed→0, hidden→−depth (the τ-domain excursion below collapsed;
  // G-HIDDEN R4, track-entry-hidden.ts).
  // THE SEAT SOCKET (residents rung 4): the PARALLEL SEAT IS DELETED. The
  // track host registers as the 'sheetHost' motion target and consumes the
  // descriptor table's commands — the locked-in switch logic (stays-put,
  // home-crossing seats, preserveLiveY, promoteAtLeast, child rules) comes
  // back verbatim from the code that always owned it. Commands are
  // POSTURE-space snaps; snapTo natively adds σ and short-circuits <0.5pt.
  // F861 (2026-08-03): `const seatTau = null` and its threading are DELETED along with the
  // ~80 lines of unreachable seat machinery in TrackSheetPage it gated. The comment block
  // above already recorded the supersession ("THE PARALLEL SEAT IS DELETED"); the code had
  // not caught up. The live path is the motion-target registration below.
  const sceneRuntime = useAppRouteSceneRuntime();
  const motionCommandValue = useSharedValue<{
    snapTo: 'expanded' | 'middle' | 'collapsed' | 'hidden';
    token: number;
    settleToken?: number | null;
  } | null>(null);
  // THE MOTION AUTHORITY (deep red team item 1) replaces THREE private refs
  // that used to live here — pendingSettleTokenRef (red team #4's settle-token
  // wait), inFlightSnapTargetRef (G-INTERRUPT/A5's spring destination) and
  // hiddenExcursionInFlightRef (the R7 fence's excursion bit) — plus the
  // module-scope armed-generation register. All four were one EPISODE wearing
  // four coats; the authority stores it once, with an identity, and every
  // consumer READS it (fence, interrupt read, hidden settle, reveal seed).
  const motionAuthority = getTrackMotionAuthority();
  // Every REST fact (settle observer, generation-matched screen edge, 700ms
  // deadline) funnels here: restore the fence and complete the episode's
  // settle token. The token rides the EPISODE now, so a superseded command's
  // token can never be completed by a later episode's rest.
  const applyMotionRestFact = React.useCallback(
    (transition: TrackMotionTransition) => {
      if (!transition.rest) {
        return;
      }
      // R7 fence: every rest fact restores it — including the hidden edge,
      // whose rest is not a detent and never reaches the settle observer.
      markSheetLegReady();
      const token = transition.ended?.settleToken ?? null;
      if (token != null) {
        sceneRuntime.routeSceneMotionRuntime.completeFromSheetSettle?.(token);
      }
    },
    [sceneRuntime]
  );
  const executeMotionCommand = React.useCallback(
    (snap: 'expanded' | 'middle' | 'collapsed' | 'hidden', settleToken: number | null) => {
      const commands = commandsRef.current;
      // THE HIDDEN EXCURSION (G-HIDDEN, R4): 'hidden' is a REACHABLE seat — a
      // GLIDE below collapsed on the same native spring (the second motion
      // primitive: τ-domain extension; see track-entry-hidden.ts for the
      // derivation). Before the excursion moves τ, snapshot the presented
      // entry's scroll — the deferred swap commits at τ=−depth, where the
      // live term is gone (planEntrySwitch suppresses hidden-domain saves).
      // THE DEPTH IS NATIVE (ratified item 5): this used to compute the target
      // from Dimensions.get('window') — a module-scope screen snapshot against
      // live UIKit bounds (G-ROTATE's staleness). The command now carries the
      // INTENT and the engine states the pixel.
      const isHidden = snap === 'hidden';
      if (isHidden) {
        commands?.saveScrollForPresentedEntry();
      }
      const postureTau: number | 'hidden' = isHidden
        ? 'hidden'
        : snap === 'expanded'
          ? trackH
          : snap === 'middle'
            ? snapPoints.collapsed - snapPoints.middle
            : 0;
      // THE ZERO-PIXEL SETTLE (joinWait red team): a same-posture switch
      // short-circuits inside native snapTo (<0.5pt) and produces NO settle
      // fact — waiting the 700ms fallback held every tab switch's revealed/
      // settled edges (and with them the L4 flush + interactivity) ~1s past
      // paint. Detect the zero-move case here, synchronously, and complete
      // the token now; the timer stays only as the safety net for snaps that
      // genuinely move.
      const currentPosture = Math.min(
        Math.max(0, (commands?.readTau() ?? 0) - (commands?.readSigma() ?? 0)),
        trackH
      );
      // A hidden excursion ALWAYS moves: its target is below collapsed and the
      // clamped posture above is >= 0, so the comparison was never in doubt —
      // it is stated rather than computed now that the pixel lives natively.
      const willMove = postureTau === 'hidden' || Math.abs(currentPosture - postureTau) >= 0.5;
      // THE COMMAND FACT into the authority. A real flight records its
      // destination for mid-flight reads; a hidden excursion records none (its
      // target is not a detent posture) and a zero-move snap opens no episode
      // at all. A non-hidden command also supersedes any armed excursion —
      // that law now lives in the reducer, not in a module-scope register.
      const commandTransition = motionAuthority.dispatch({
        type: 'command-issued',
        willMove,
        snapTo: snap,
        settleToken,
        atMs: Date.now(),
      });
      const episodeId = commandTransition.started?.episodeId ?? null;
      // R7 FENCE, PENDING (D2 closed): a command that WILL move is a proven
      // motion signal — flip the fence BEFORE the spring starts so a reveal can
      // never land mid-slide (the mid-slide latch in the surface runtime retries
      // the commit at the settle-side restore). Motion-keyed on both sides: this
      // flip only ever happens with a rest fact (settle observer / hidden edge)
      // or the 700ms deadline behind it, so a no-op snap can never strand the bit.
      if (willMove) {
        markSheetLegMotionPending();
      }
      commands?.snapToTau(postureTau, (outcome) => {
        if (episodeId == null) {
          // A zero-move command opened no episode; a late outcome names none.
          return;
        }
        if (outcome.refused) {
          // THE FINGER OWNS TAU (native FIX 3): the command yielded to a live
          // drag and is DEAD — no machine target exists, nothing is re-issued.
          // The episode becomes the drag it lost to (it is still moving), so
          // the gesture settle or the deadline is what restores the fence and
          // completes the token.
          motionAuthority.dispatch({ type: 'command-refused', episodeId });
          return;
        }
        if (outcome.hiddenGeneration != null) {
          // The generation OUR hide armed — the stamp every edge event must
          // match to be consumed (deferred swap + hidden settle). Episode-
          // matched, so a superseded command's late outcome arms nothing.
          motionAuthority.dispatch({
            type: 'excursion-armed',
            episodeId,
            generation: outcome.hiddenGeneration,
          });
        }
      });
      if (settleToken != null) {
        if (!willMove || commands == null || episodeId == null) {
          sceneRuntime.routeSceneMotionRuntime.completeFromSheetSettle?.(settleToken);
        } else {
          setTimeout(() => {
            // EPISODE-MATCHED (was: token-matched against a private ref). A
            // deadline can only ever end the episode that armed it.
            applyMotionRestFact(motionAuthority.dispatch({ type: 'deadline-expired', episodeId }));
            // PROVENANCE (F874, 2026-08-03): 700ms is a DEADLINE, not a duration — it is
            // the "the settle fact never arrived" backstop for a snap whose native spring
            // should have reported settle long before. It is deliberately longer than any
            // real spring so it never PREEMPTS a genuine settle (that would complete the
            // token early and let chrome move before the sheet did), and short enough that
            // a lost settle costs one visible beat rather than a wedged transition. Not
            // measured against the spring; sized to be safely past it.
          }, 700);
        }
      }
    },
    [applyMotionRestFact, commandsRef, motionAuthority, sceneRuntime, snapPoints, trackH]
  );
  // THE SETTLE FACT: the detent rest observed on the track (gesture or
  // programmatic). It ends whatever episode was live — the authority decides
  // which, and whether a token is owed.
  const reportSettleFact = React.useCallback(() => {
    applyMotionRestFact(motionAuthority.dispatch({ type: 'settle' }));
  }, [applyMotionRestFact, motionAuthority]);
  // THE DRAG FACT: the finger takes τ. Opens a drag episode (so every consumer
  // can SEE the sheet is moving — F2's window) and flips the fence pending.
  const reportDragBeginFact = React.useCallback(() => {
    motionAuthority.dispatch({ type: 'drag-begin', atMs: Date.now() });
    markSheetLegMotionPending();
  }, [motionAuthority]);
  // THE HIDDEN SETTLE (G-HIDDEN): a hide's rest is not a detent, so the
  // gesture/detent settle observer never fires for it — the native edge fact
  // (the sheet cleared the screen) IS its settle. Without this, every hide's
  // settleToken rode the 700ms fallback. The authority validates the stamp
  // against the episode that armed it (was: a second emitter subscription
  // re-checking a module-scope register by hand).
  React.useEffect(
    () => motionAuthority.subscribeHiddenEdge(applyMotionRestFact),
    [applyMotionRestFact, motionAuthority]
  );
  useAnimatedReaction(
    () => motionCommandValue.value,
    (command, previous) => {
      if (command == null || command.token === (previous?.token ?? -1)) {
        return;
      }
      runOnJS(executeMotionCommand)(command.snapTo, command.settleToken ?? null);
      motionCommandValue.value = null;
    },
    [executeMotionCommand]
  );
  // Red team #3: without resolveCurrentSnapTarget, promoteAtLeast DEMOTES an
  // expanded sheet (the registry returns null and the short-circuit never
  // fires). The track answers from its own posture — and mid-flight, from the
  // SPRING TARGET (G-INTERRUPT / A5, resolveSnapTargetForRead): a ±2pt read of
  // a moving τ misclassifies, and THE FINGER OWNS TAU kills the machine target
  // for the read the moment a drag is live.
  const resolveCurrentSnapTarget = React.useCallback(() => {
    const middleTau = snapPoints.collapsed - snapPoints.middle;
    const commands = commandsRef.current;
    if (commands == null) {
      return null;
    }
    const posture = Math.min(Math.max(0, commands.readTau() - commands.readSigma()), trackH);
    return resolveSnapTargetForRead({
      // READ, DON'T SHADOW: the in-flight target is the authority's episode.
      inFlightTarget: motionAuthority.inFlightSnapTarget(),
      dragging: commands.readDragging(),
      posture,
      trackH,
      middleTau,
    });
  }, [commandsRef, motionAuthority, snapPoints, trackH]);
  React.useEffect(
    () =>
      sceneRuntime.routeSceneMotionRuntime.registerSheetMotionTarget({
        sceneKey: 'sheetHost' as OverlayKey,
        resolveCurrentSnapTarget,
        motionCommandValue: motionCommandValue as unknown as Parameters<
          typeof sceneRuntime.routeSceneMotionRuntime.registerSheetMotionTarget
        >[0]['motionCommandValue'],
      }),
    [motionCommandValue, resolveCurrentSnapTarget, sceneRuntime]
  );

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
      sceneRuntime.routeSheetSnapSessionActions.recordRouteSceneSheetSettle({
        sceneKey: scene,
        snap,
        writer: 'gesture',
      });
    },
    [middleTau, scene, sceneRuntime, trackH]
  );

  // ── THE SHEET LEG OF THE REDRAW JOIN ([JOINT], attributed 2026-07-28) ──────
  // canAdmitResultsBody joins {cards→'paint', mapFrame, sheet}. The OLD host was
  // THE sheet-motion authority for that last leg (app-route-sheet-host-authority-
  // controller: markRedrawSheetReady at snap SETTLE). With it unmounted NOTHING
  // produced 'sheet', so a world-backed list held its rows until the 1500ms bark
  // and the reveal never joined. This host is that authority now.
  //   • settle → ready (the faithful port of the old snap-SETTLE producer)
  //   • redraw arms while the sheet is already AT REST → ready immediately,
  //     because a sheet that never moves has no settle to wait for. This is the
  //     case list entry actually hits. AT REST is now a checked fact
  //     (sheetLegIsAtRest — R7): this subscriber runs on EVERY runtime publish,
  //     so an unconditional ready here would clobber a pending flip in the same
  //     tick. The PENDING side is WIRED now (R7, D2 closed — the deferral is
  //     over): will-move commands and native drag-begins flip the fence
  //     (markSheetLegMotionPending), and every restore is a rest fact (settle
  //     observer, hidden edge) or the 700ms deadline — motion-keyed on both
  //     sides, so a deferred/no-op snap can never strand the bit.
  // markRedrawSheetReady is idempotent (publishes + offers), so producers may
  // overlap.
  React.useEffect(() => {
    const runtime = getSearchSurfaceRuntime();
    const offerSheetReadyIfAtRest = () => {
      // ONE at-rest definition (motion authority): the four host refs this
      // predicate used to project over ARE the authority's episode now.
      if (motionAuthority.isAtRest()) {
        markSheetLegReady();
      }
    };
    offerSheetReadyIfAtRest();
    return runtime.subscribe(offerSheetReadyIfAtRest);
  }, [motionAuthority]);

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
  // THE PERSISTENT STRIPS moved to the legs memo (entry-keyed under G-ENTRY):
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

/** RUNG 3 — the ONE persistent scene page. Both list-parts hooks run
 * unconditionally (their data lanes are snap-gated internally); the presented
 * scene picks which content the persistent FlashList renders:
 *   polls/home → the scene's real body-content spec;
 *   mounted-registry scenes → the registry body as a one-item track body;
 *   anything else → placeholder rows. */
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
  // THE ENTRY STAMP GATE (R6, closing R2's item-5 residual): a STAMPED
  // publication is accepted only when it was rendered FOR the presented entry.
  // On a same-scene pop (pollDetail A→B) the scene-keyed lane still carries
  // A's stamped rows for a commit — rejecting the mismatch paints B's
  // frozen/skeleton phase instead of aliasing A's rows into B. Unstamped
  // publications (legacy writers, singleton scenes) always pass.
  const publishedBodyIsForPresentedEntry = publicationMatchesEntry(
    publishedInput?.sceneBodyForEntryId,
    entryId ?? null
  );

  // Static SV: on the track the body CELL rides the scroll, so the foundation
  // plate needs no counter-translation — holes track their boxes for free.
  const zeroScrollOffset = useSharedValue(0);
  // MOUNTED BODIES ARE PER ENTRY (A3 — entry identity reaches React element
  // identity): the renderer is cached by ENTRY key and closes over the LEG's
  // own scene + entry value, so two stacked entries of the same scene (two DM
  // threads, two userProfiles) are two React instances — composer drafts and
  // hook state never shared, pop-back byte-exact. Params come from the ENTRY
  // VALUE captured at push (retained even after pop, W1 semantics).
  const mountedRendererCacheRef = React.useRef(
    new Map<
      TrackEntryKey,
      { entry: OverlayRouteEntry | null; render: () => React.ReactElement | null }
    >()
  );
  // G-ACTIVITY live read: cached render closures must never capture a
  // presented-flag (stale) nor an all-true (the pre-R2 defect) — they read the
  // current commit's presented entry through this ref at invoke time.
  const presentedEntryKeyLiveRef = React.useRef<TrackEntryKey | null>(null);
  // ── THE LIVENESS PROBE (G-LIVENESS, R5) — dev-only runtime falsifier ───────
  // Samples are what the render closures ACTUALLY DELIVERED to the bodies'
  // activity contexts (recorded at invoke time, tagged with the render seq) —
  // never re-derived, or the audit would compare the derivation with itself
  // and could not show RED. Only CURRENT-seq samples are audited: a hidden
  // body does not render on today's page, so an old sample is history, not a
  // live claim — but any body that DOES render this commit (including a
  // hidden one leaking live lanes, or a cached closure using a stale
  // presented flag) is judged.
  const livenessSamplesRef = React.useRef(
    new Map<TrackEntryKey, TrackEntryLivenessSample & { seq: number }>()
  );
  const renderSeqRef = React.useRef(0);
  renderSeqRef.current += 1;
  const rendererForMountedEntry = (
    legEntryKey: TrackEntryKey,
    legScene: OverlayKey,
    legEntry: OverlayRouteEntry | null
  ): (() => React.ReactElement | null) => {
    const cached = mountedRendererCacheRef.current.get(legEntryKey);
    if (cached != null && cached.entry === legEntry) {
      return cached.render;
    }
    const render = (): React.ReactElement | null => {
      // DIRECT bodies, no registry wrapper: the wrapper's residency boundary
      // renders hidden prewarm legs which, without the old host's shell-liveness
      // context, painted VISIBLY below the live body (the phantom duplicate).
      const Body = MOUNTED_BODY_COMPONENTS[legScene as SearchRouteMountedSceneBodyKey];
      if (Body == null) {
        return null;
      }
      // THE ACTIVATION BRIDGE (G-ACTIVITY, R2): mounted bodies gate their data
      // lanes on the old host's activity contexts (all-false defaults left
      // lists blank on the track). Activity is DERIVED from presentation at
      // invoke time — the render closure is cached per entry, so the value may
      // not be captured (a captured all-true was the pre-R2 defect; a captured
      // presented-flag would freeze). The live ref reads the current commit's
      // presented entry.
      const isPresented = presentedEntryKeyLiveRef.current === legEntryKey;
      const activity = deriveTrackEntryBodyActivity(legScene, isPresented);
      if (__DEV__) {
        // G-LIVENESS sample: the activity as DELIVERED, at invoke time.
        livenessSamplesRef.current.set(legEntryKey, {
          entryKey: legEntryKey,
          renderedAsPresented: isPresented,
          shouldRunDataLane: activity.shouldRunDataLane,
          shouldSubscribeDataLane: activity.shouldSubscribeDataLane,
          shouldRenderExpandedContent: activity.shouldRenderExpandedContent,
          seq: renderSeqRef.current,
        });
      }
      return (
        <BottomSheetSceneStackBodyDataActivityContext.Provider value={activity}>
          <BottomSheetSceneStackBodyRenderActivityContext.Provider value={activity}>
            <BottomSheetSceneStackBodyIsActiveContext.Provider value={isPresented}>
              {/* THE REAL FOUNDATION (rung 4): white plate + FrostCutout store —
                profile stats / home bands punch through to the kit's frost;
                the strip law sees its plate. Zero scroll offset: the cell
                itself rides the track. */}
              <SceneBodyFoundationSurface
                scrollOffset={zeroScrollOffset}
                sceneKey={legScene as SheetSceneKey}
              >
                {/* padding INSIDE the surface so the white plate spans the full
                  cell (padded-outside left frost gutters at the margins). */}
                <View
                  style={
                    sceneMountedBodyIsEdgeToEdge(legScene) ? undefined : styles.mountedBodyInset
                  }
                >
                  <ChromeProbeBoundary label={`${legScene}.body`}>
                    <Body entry={legEntry ?? undefined} />
                  </ChromeProbeBoundary>
                </View>
              </SceneBodyFoundationSurface>
            </BottomSheetSceneStackBodyIsActiveContext.Provider>
          </BottomSheetSceneStackBodyRenderActivityContext.Provider>
        </BottomSheetSceneStackBodyDataActivityContext.Provider>
      );
    };
    mountedRendererCacheRef.current.set(legEntryKey, { entry: legEntry, render });
    return render;
  };
  // THE SKELETON IS PER-SCENE DATA (G-SKEL / OA2, R2): the variant — rowType +
  // strip-in-skeleton pills — comes from the scene's foundation spec through
  // ONE resolver (trackSkeletonMaterialForScene), never a hardcoded rowType.
  // Renderers are cached per SCENE (the material is scene data, not entry
  // state) so cold legs keep stable renderItem identities.
  const skeletonRendererCacheRef = React.useRef(new Map<OverlayKey, () => React.ReactElement>());
  const rendererForSkeleton = (legScene: OverlayKey): (() => React.ReactElement) => {
    const cached = skeletonRendererCacheRef.current.get(legScene);
    if (cached != null) {
      return cached;
    }
    const material = trackSkeletonMaterialForScene(legScene);
    const render = () => (
      <SceneBodyFoundationSurface
        scrollOffset={zeroScrollOffset}
        sceneKey={legScene as SheetSceneKey}
      >
        <View style={styles.mountedBodyInset}>
          {/* insetX=0: the surface already renders inside the mountedBodyInset
              padding — the default inset would double it and the skeleton
              would jump narrower→wider on the content swap (its own doc). */}
          <SceneLoadingSurface
            rowType={material.rowType}
            withFilterStripHoles={material.withStripHoles}
            insetX={0}
          />
        </View>
      </SceneBodyFoundationSurface>
    );
    skeletonRendererCacheRef.current.set(legScene, render);
    return render;
  };

  // ROWS ON THE FOUNDATION (owner report: home shelf boxes lost their
  // cutouts): lane/list rows render in bare track cells, so a row's
  // FrostCutout found no surface and silently rendered a plain box. Each row
  // cell now carries its own foundation surface — holes measure against the
  // cell (their own root), which is exactly right on the track since the cell
  // IS the scrolling unit.
  const wrapRowOnFoundation = React.useCallback(
    (node: React.ReactNode) => (
      <SceneBodyFoundationSurface scrollOffset={zeroScrollOffset} sceneKey={scene as SheetSceneKey}>
        {node}
      </SceneBodyFoundationSurface>
    ),
    [scene, zeroScrollOffset]
  );

  // ── THE RESIDENT LEGS + ENTRY RETENTION (residents-cutover F; G-ENTRY/A3) ──
  // Tab scenes become residents on FIRST visit (E1 lazy mount) and stay
  // mounted — pinned to their `scene#root` singleton identity (top-level tabs
  // are one logical entry forever; a re-minted stack entry per revisit must
  // not fork their scroll memory). Child scenes are ENTRY-KEYED and retained
  // as hidden legs with depth-K LRU (K=3): pushing B over A keeps A's leg —
  // hook state, strip selection, scroll — alive for a byte-exact pop-back.
  const isResidentScene = sceneIsResidentTrackScene(scene);
  const presentedEntryKey = makeTrackEntryKey(scene, isResidentScene ? null : entryId);
  const visitedResidentsRef = React.useRef(new Set<OverlayKey>());
  if (isResidentScene) {
    visitedResidentsRef.current.add(scene);
  }
  // ── G-PREWARM (R3): begin resolving a PREDICTABLE cold switch early ────────
  // The nav's press-DOWN names a scene before press-up commits the switch; a
  // cold RESIDENT scene mounts its leg NOW — chrome/title/strip elements,
  // skeleton renderer and list-parts cells build in this early commit, so the
  // cold window starts at finger-down, not at the flip. The decision is pure
  // and data-driven (planScenePrewarm over the same residency table the legs
  // ride); the switch commit itself is untouched — one frame, always.
  const [prewarmSeq, bumpPrewarmSeq] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    const drainPrewarmRequests = () => {
      let mountedResidentLeg = false;
      for (const requestedScene of consumeTrackScenePrewarmRequests()) {
        const decision = planScenePrewarm({
          isResidentScene: sceneIsResidentTrackScene(requestedScene as OverlayKey),
          alreadyVisited: visitedResidentsRef.current.has(requestedScene as OverlayKey),
        });
        if (decision.kind === 'mountResidentLeg') {
          visitedResidentsRef.current.add(requestedScene as OverlayKey);
          mountedResidentLeg = true;
        }
      }
      if (mountedResidentLeg) {
        bumpPrewarmSeq();
      }
    };
    // Requests raised before this host mounted (early presses) drain now.
    drainPrewarmRequests();
    return subscribeTrackScenePrewarm(drainPrewarmRequests);
  }, []);
  const legTitleCacheRef = React.useRef(new Map<TrackEntryKey, React.ReactNode>());
  const stripElementCacheRef = React.useRef(new Map<TrackEntryKey, React.ReactNode>());
  const retainedChildrenRef = React.useRef(
    new Map<TrackEntryKey, { scene: OverlayKey; entry: OverlayRouteEntry | null }>()
  );
  const childRetentionRef = React.useRef(new TrackEntryRetention(TRACK_CHILD_RETENTION_DEPTH));
  // ── THE READINESS AXIS STATE (G-READY + OA6.1, R2) ──
  // The ledger latches "this entry has shown content"; the last-good store is
  // the OA6.1 frozen world — when a latched entry's lane momentarily resolves
  // to nothing, its previous body renders, never a skeleton.
  const readinessLedgerRef = React.useRef(new TrackEntryReadinessLedger());
  const lastGoodListRef = React.useRef(new Map<TrackEntryKey, ResolvedLegList>());
  presentedEntryKeyLiveRef.current = presentedEntryKey;
  if (!isResidentScene) {
    // Refresh the stored entry value each render (params can update in place —
    // the algebra preserves entryId across param writes). G-HIDDEN: during a
    // deferred swap the HELD entry may already be popped off the route stack —
    // its lookup returns null; keep the retained value rather than clobbering
    // the params its body still renders from.
    retainedChildrenRef.current.set(presentedEntryKey, {
      scene,
      entry: entry ?? retainedChildrenRef.current.get(presentedEntryKey)?.entry ?? null,
    });
    for (const evictedKey of childRetentionRef.current.touch(presentedEntryKey)) {
      retainedChildrenRef.current.delete(evictedKey);
      legTitleCacheRef.current.delete(evictedKey);
      stripElementCacheRef.current.delete(evictedKey);
      mountedRendererCacheRef.current.delete(evictedKey);
      readinessLedgerRef.current.forget(evictedKey);
      lastGoodListRef.current.delete(evictedKey);
      livenessSamplesRef.current.delete(evictedKey);
      // Scroll memory deliberately survives eviction (TrackEntryScrollMemory).
    }
    // The A7 capacity bark is DELETED with its premise (R2 kill-list): activity
    // now derives from presentation (deriveTrackEntryBodyActivity) — hidden
    // entries' host-owned lanes are suspended, so retention at capacity no
    // longer means live all-true data lanes.
  }
  // ── THE READINESS AXIS (G-READY, R2): resolution → phase → body ────────────
  // Step 1 names WHAT EXISTS for the entry this commit (a pure fact); step 2
  // asks the ledger WHICH BODY to paint (content | skeleton | frozen — never a
  // wait, so the switch commit always paints in the same frame); step 3 builds
  // it. The old skeleton "fallthrough" is now the not-ready phase by CONDITION
  // — the dead branch of the contract's G-READY row, made reachable.
  const resolveLegBodyResolution = (
    legEntryKey: TrackEntryKey,
    legScene: OverlayKey
  ): TrackEntryBodyResolution => {
    // The published scene-input lane is SCENE-keyed — only the PRESENTED entry
    // may read it (a hidden same-scene entry reading it would alias the
    // presented entry's rows: the exact G-ENTRY collision).
    if (
      legEntryKey === presentedEntryKey &&
      publishedBody != null &&
      publishedBody.surfaceKind === 'list' &&
      publishedBodyIsForPresentedEntry
    ) {
      return { kind: 'list', rowCount: publishedBody.data?.length ?? 0 };
    }
    const partsSource = resolveSceneListPartsSource(legScene);
    const partsFor =
      partsSource === 'polls' ? pollsParts : partsSource === 'home' ? homeParts : null;
    if (partsFor != null && partsFor.sceneBodyContent.surfaceKind === 'list') {
      return { kind: 'list', rowCount: partsFor.sceneBodyContent.data?.length ?? 0 };
    }
    if (sceneUsesMountedTrackBody(legScene)) {
      return { kind: 'mounted' };
    }
    return { kind: 'none' };
  };
  const resolveLegList = (
    legEntryKey: TrackEntryKey,
    legScene: OverlayKey,
    legEntry: OverlayRouteEntry | null
  ): ResolvedLegList => {
    const resolution = resolveLegBodyResolution(legEntryKey, legScene);
    const phase = readinessLedgerRef.current.present(legEntryKey, isResolutionReady(resolution));
    if (phase !== 'content') {
      if (phase === 'frozen') {
        // OA6.1: content is never replaced by a skeleton when content exists —
        // a latched entry whose lane momentarily resolves to nothing keeps its
        // frozen last-good body.
        const frozen = lastGoodListRef.current.get(legEntryKey);
        if (frozen != null) {
          return frozen;
        }
      }
      // THE SKELETON (G-READY cold visit + G-SKEL variant-as-data): a cold leg
      // is a REAL sheet body whose one item renders THE ONE loading material
      // (the cutout plate — THE SKELETON SHEET laws), shaped by the scene's
      // foundation spec. Painted in the SAME commit as the switch — the switch
      // never waits on data; readiness flips it to real rows (two-phase).
      return { data: ['skeleton'], renderItem: rendererForSkeleton(legScene) };
    }
    let list: ResolvedLegList;
    if (
      legEntryKey === presentedEntryKey &&
      publishedBody != null &&
      publishedBody.surfaceKind === 'list' &&
      publishedBodyIsForPresentedEntry
    ) {
      list = {
        leader: publishedBody.ListHeaderComponent ?? null,
        data: publishedBody.data,
        renderItem: publishedBody.renderItem,
        keyExtractor: publishedBody.keyExtractor,
        ListEmptyComponent: publishedBody.ListEmptyComponent,
        ItemSeparatorComponent: publishedBody.ItemSeparatorComponent,
        extraData: publishedBody.extraData,
        onEndReached: publishedBody.onEndReached,
        onEndReachedThreshold: publishedBody.onEndReachedThreshold,
      };
    } else if (resolution.kind === 'list') {
      const partsFor = resolveSceneListPartsSource(legScene) === 'polls' ? pollsParts : homeParts;
      const spec = partsFor.sceneBodyContent;
      if (spec.surfaceKind !== 'list') {
        // Unreachable by construction (the resolution said 'list'); typed out.
        return { data: ['skeleton'], renderItem: rendererForSkeleton(legScene) };
      }
      const specRenderItem = spec.renderItem;
      list = {
        data: spec.data,
        renderItem: (info: Parameters<NonNullable<typeof specRenderItem>>[0]) =>
          wrapRowOnFoundation(specRenderItem?.(info) ?? null),
        keyExtractor: spec.keyExtractor,
        ListEmptyComponent: spec.ListEmptyComponent,
        ItemSeparatorComponent: spec.ItemSeparatorComponent,
        extraData: spec.extraData,
        onEndReached: spec.onEndReached,
        onEndReachedThreshold: spec.onEndReachedThreshold,
      };
    } else {
      // data carries the ENTRY key so a same-scene entry switch is a data
      // change to the one FlashList, never an aliased row.
      list = {
        data: [legEntryKey],
        renderItem: rendererForMountedEntry(legEntryKey, legScene, legEntry),
      };
    }
    lastGoodListRef.current.set(legEntryKey, list);
    return list;
  };

  const legs = React.useMemo(() => {
    const legEntries: Array<{
      entryKey: TrackEntryKey;
      legScene: OverlayKey;
      legEntry: OverlayRouteEntry | null;
    }> = [];
    for (const residentScene of visitedResidentsRef.current) {
      legEntries.push({
        entryKey: makeTrackEntryKey(residentScene, null),
        legScene: residentScene,
        legEntry: null,
      });
    }
    for (const retainedKey of childRetentionRef.current.keys()) {
      const retained = retainedChildrenRef.current.get(retainedKey);
      if (retained != null) {
        legEntries.push({
          entryKey: retainedKey,
          legScene: retained.scene,
          legEntry: retained.entry,
        });
      }
    }
    if (!legEntries.some((candidate) => candidate.entryKey === presentedEntryKey)) {
      legEntries.push({ entryKey: presentedEntryKey, legScene: scene, legEntry: entry ?? null });
    }
    return legEntries.map(({ entryKey: legEntryKey, legScene, legEntry }) => {
      const list = resolveLegList(legEntryKey, legScene, legEntry);
      // Title + strip elements are cached PER ENTRY: a fresh element per
      // switch would miss the page's chrome cache and rebuild every leg's
      // chrome on every flip (measured: it doubled switch cost) — and a
      // per-SCENE cache would share strip/title state across two entries of
      // the same scene (G-ENTRY).
      let legTitle = legTitleCacheRef.current.get(legEntryKey) ?? null;
      if (legTitle == null) {
        const LegTitle = getPersistentHeaderDescriptor(legScene)?.Title;
        legTitle = LegTitle != null ? <LegTitle /> : null;
        legTitleCacheRef.current.set(legEntryKey, legTitle);
      }
      if (!stripElementCacheRef.current.has(legEntryKey)) {
        const LegStrip = getPersistentHeaderDescriptor(legScene)?.Strip;
        stripElementCacheRef.current.set(
          legEntryKey,
          LegStrip != null ? (
            <ChromeProbeBoundary label={`${legScene}.Strip`}>
              <LegStrip />
            </ChromeProbeBoundary>
          ) : null
        );
      }
      const leader = (list as { leader?: unknown }).leader ?? null;
      return {
        entryKey: legEntryKey,
        sceneKey: legScene as string,
        title: legTitle,
        stripChildren: stripElementCacheRef.current.get(legEntryKey) ?? null,
        list: list as never,
        listLeader:
          leader != null ? (
            <SceneBodyFoundationSurface
              scrollOffset={zeroScrollOffset}
              sceneKey={legScene as SheetSceneKey}
            >
              <View style={styles.mountedBodyInset}>{renderListLeader(leader)}</View>
            </SceneBodyFoundationSurface>
          ) : null,
        rowSurfaceStyle: sceneUsesMountedTrackBody(legScene)
          ? sceneMountedBodyIsEdgeToEdge(legScene)
            ? styles.mountedSurfaceUnpadded
            : styles.mountedSurface
          : (legEntryKey === presentedEntryKey && publishedBody?.surfaceKind === 'list') ||
              sceneDeclaresSharedRowSurface(legScene)
            ? styles.rowSurface
            : undefined,
        onUserListScrollActivity: sceneReportsUserScrollActivity(legScene)
          ? pollsParts.sceneBodyTransport.onUserListScrollActivity
          : undefined,
      };
    });
    // resolveLegList / rendererForMountedEntry are render-scoped closures whose
    // real inputs are the deps below; caches keep renderItem identities stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pollsParts,
    homeParts,
    publishedBody,
    publishedBodyIsForPresentedEntry,
    scene,
    entry,
    presentedEntryKey,
    // A prewarm mounts a resident leg between presentation frames — the legs
    // list must rebuild for it (visitedResidentsRef is read inside).
    prewarmSeq,
    zeroScrollOffset,
  ]);

  // ── THE TWO-PHASE COLD-FLIP PROBE ([PERF], R2) ────────────────────────────
  // The owner's original complaint was a multi-second polls switch. The law:
  // the switch PRESENTS in one commit (skeleton or retained content); real
  // rows are the second phase. This probe measures phase two — the time from
  // the switch commit to the first commit whose presented body has real rows —
  // so the on-device claim is a number, not an impression. Dev-only.
  const presentedHasRealRows = resolutionHasRealRows(
    resolveLegBodyResolution(presentedEntryKey, scene)
  );
  const coldFlipProbeRef = React.useRef<{ entryKey: TrackEntryKey; t0: number } | null>(null);
  const probePrevEntryRef = React.useRef<TrackEntryKey | null>(null);
  React.useEffect(() => {
    if (!__DEV__) {
      return;
    }
    if (probePrevEntryRef.current !== presentedEntryKey) {
      probePrevEntryRef.current = presentedEntryKey;
      if (presentedHasRealRows) {
        coldFlipProbeRef.current = null;
        // eslint-disable-next-line no-console
        console.log(`[PERF] switch ${presentedEntryKey} presented real rows in the switch commit`);
      } else {
        coldFlipProbeRef.current = { entryKey: presentedEntryKey, t0: Date.now() };
        // eslint-disable-next-line no-console
        console.log(`[PERF] switch ${presentedEntryKey} presented cold (skeleton commit)`);
      }
      return;
    }
    const probe = coldFlipProbeRef.current;
    if (probe != null && probe.entryKey === presentedEntryKey && presentedHasRealRows) {
      coldFlipProbeRef.current = null;
      // eslint-disable-next-line no-console
      console.log(
        `[PERF] cold-flip ${presentedEntryKey} switch-commit->real-rows=${Date.now() - probe.t0}ms`
      );
    }
  }, [presentedEntryKey, presentedHasRealRows]);

  // ── THE LIVENESS AUDIT (G-LIVENESS, R5) — every commit, dev only ──────────
  // Judges only samples DELIVERED in this render pass (seq-tagged above): a
  // presented body handed suspended lanes, a hidden body handed live lanes,
  // or a cached closure that used a stale presented flag all bark RED here.
  React.useEffect(() => {
    if (!__DEV__) {
      return;
    }
    const freshSamples = [...livenessSamplesRef.current.values()].filter(
      (sample) => sample.seq === renderSeqRef.current
    );
    for (const violation of auditTrackEntryLiveness(presentedEntryKey, freshSamples)) {
      // eslint-disable-next-line no-console
      console.error(
        `[LIVENESS] ${violation.kind} ${violation.entryKey}: ${violation.detail} (presented=${presentedEntryKey})`
      );
    }
  });

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

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 91 },
  hidden: { opacity: 0 },
  hostAboveStack: { zIndex: 91 },
  fallbackTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  // Production's body inset (useBottomSheetSceneStackBodyContentRuntime applies
  // OVERLAY_HORIZONTAL_PADDING via the transport) — mounted bodies expect it.
  rowSurface: { paddingHorizontal: OVERLAY_HORIZONTAL_PADDING },
  // Mounted cells: the FOUNDATION plate is the white now — the cell must be
  // transparent or cutout holes reveal cell-white instead of frost.
  mountedSurface: { backgroundColor: 'transparent' },
  mountedBodyInset: { paddingHorizontal: OVERLAY_HORIZONTAL_PADDING },
  mountedSurfaceUnpadded: { backgroundColor: 'transparent' },
});

export default TrackSheetRouteHost;
