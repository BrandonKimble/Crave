// ─── THE LEG / BODY RESOLVER (host extraction 3, React half) ──────────────────
//
// Everything between "which entries have legs on the track" and "what does each
// leg's FlashList render this commit". The host used to carry all of it inline:
// residency + entry retention, the readiness ledger and the OA6.1 frozen-world
// store, the three renderer caches, the per-leg chrome element caches, the two
// body-resolution passes, the legs memo, and the two dev falsifiers that judge
// the result (the cold-flip PERF probe, the G-LIVENESS audit).
//
// The DECISIONS are pure and live in track-leg-plan.ts (which lane wins, what a
// row cell's surface is) plus the modules that already owned their axis
// (readiness, skeleton material, retention, activity, liveness). What is left
// here is the part that genuinely cannot be pure: React refs, element caches,
// and JSX.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import type { SheetSceneKey } from '../navigation/runtime/scene-foundation-spec';
import {
  SCENE_DECLARATIONS,
  resolveSceneListPartsSource,
  sceneDeclaresSharedRowSurface,
  sceneIsResidentTrackScene,
  sceneMountedBodyIsEdgeToEdge,
  sceneParticipatesInWorldJoin,
  sceneReportsUserScrollActivity,
  sceneUsesMountedTrackBody,
} from '../navigation/runtime/scene-foundation-spec';
import type { OverlayRouteEntry } from '../navigation/runtime/app-overlay-route-types';
import { getPersistentHeaderDescriptor } from '../navigation/runtime/app-route-persistent-header-registry';
import { useAppRouteSceneRuntime } from '../navigation/runtime/AppRouteSceneRuntimeProvider';
import { OVERLAY_HORIZONTAL_PADDING } from '../overlays/overlay-chrome-metrics';
import { SceneBodyFoundationSurface } from '../overlays/SceneBodyFoundationSurface';
import { SceneLoadingSurface } from '../components/skeletons';
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
import type { OverlayKey } from '../overlays/types';
import type { SearchRouteMountedSceneBodyKey } from '../overlays/searchOverlayRouteHostContract';
import { ChromeProbeBoundary, renderListLeader } from './track-sheet-chrome-parts';
import {
  makeTrackEntryKey,
  publicationMatchesEntry,
  trackEntrySceneKey,
  type TrackEntryKey,
} from './track-entry-identity';
import {
  consumeTrackScenePrewarmRequests,
  formatTrackPressSpan,
  noteTrackPressFirstPaint,
  noteTrackPressRealRows,
  planScenePrewarm,
  subscribeTrackScenePrewarm,
} from './track-entry-prewarm';
import {
  finishTrackPressPhaseSpan,
  finishTrackPressRowWindow,
  formatTrackPressPhases,
  formatTrackPressRowWindow,
  noteTrackPressBodyFact,
  noteTrackPressPartsCost,
  noteTrackPressPhase,
} from './track-press-phase-probe';
import { auditTrackEntryLiveness, type TrackEntryLivenessSample } from './track-entry-liveness';
import { TrackEntryRetention, TRACK_CHILD_RETENTION_DEPTH } from './track-entry-retention';
import { deriveTrackEntryBodyActivity } from './track-entry-activity';
import { planTrackEntryHandoff, TrackEntryResidencyLedger } from './track-entry-handoff';
import {
  isResolutionReady,
  resolutionHasRealRows,
  TrackEntryReadinessLedger,
} from './track-entry-readiness';
import { trackSkeletonMaterialForScene } from './track-entry-skeleton';
import { planTrackLegBody, resolveTrackLegRowSurfaceKind } from './track-leg-plan';

// THE COMPONENT MAP. The schema declares `body.kind: 'mounted'` (F872 —
// scene-foundation-spec.ts); this map binds the key to its React component.
// (Registration cannot hoist into the pure table without inverting the
// dependency — the table would import every panel.)
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
 * The COMPONENT-MAP ↔ SCHEMA agreement check (the F872 failure mode, kept as a
 * falsifier now that the membership fact moved): a scene the schema declares
 * `body.kind: 'mounted'` with no component here renders NOTHING — blank body, no
 * error. The schema is the authority; this bark makes the disagreement loud
 * instead of silent. (The reverse — a component with no mounted declaration — is
 * dead weight and also barks.)
 *
 * Run once at FIRST RENDER, not at module init: this module sits in an import
 * cycle with the panel modules, so SCENE_DECLARATIONS is not yet initialized
 * when this module body runs.
 */
let mountedBodyAgreementChecked = false;
export const assertMountedBodyAgreement = (): void => {
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
 * skeleton), it feeds TrackSheetPage's per-leg FlashList props. Loosely typed on
 * purpose: the three lanes (published spec / parts spec / mounted one-item)
 * carry different concrete row types, reconciled at the page boundary. */
export type ResolvedLegList = {
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

/** Returns THE SWITCH FORMULA's identity for this commit (presentedEntryKey,
 *  G-ENTRY) plus one TrackSheetLeg per live leg. The leg shape is INFERRED
 *  rather than annotated: `list` is deliberately loose (see ResolvedLegList) and
 *  the page reconciles the three body dialects at its own boundary. */
export const useTrackLegResolver = ({
  scene,
  entryId,
  entry,
}: {
  scene: OverlayKey;
  entryId: string | null;
  entry?: OverlayRouteEntry | null;
}) => {
  // THE PARTS LANE, MEASURED. These two hooks run on EVERY host render whichever
  // scene is presented — so a switch cost that lives here is NOT explained by
  // "the destination's hook woke up", and a cost that does not live here rules
  // the parts lane out. No pair of phase marks brackets them (they run inside
  // the host render), so the cost is read straight off the clock.
  const partsStartedAtMs = __DEV__ ? Date.now() : 0;
  const pollsParts = usePollsPanelListSceneParts();
  const homeParts = useHomePanelListSceneParts();
  if (__DEV__) {
    noteTrackPressPartsCost(scene, Date.now() - partsStartedAtMs);
    noteTrackPressPhase(scene, 'parts', Date.now());
  }

  // THE LANE PATH (pollDetail conversion, generalized): scenes that PUBLISH a
  // 'list' body spec through the scene input lane (pollDetail, pollCreation,
  // restaurant, …) render those rows AS TRACK ROWS — the writers already run
  // app-wide, so the track host is just another lane reader. This is what makes
  // nested scrollables structurally unnecessary.
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
  // On a same-scene pop (pollDetail A→B) the scene-keyed lane still carries A's
  // stamped rows for a commit — rejecting the mismatch paints B's frozen/
  // skeleton phase instead of aliasing A's rows into B. Unstamped publications
  // (legacy writers, singleton scenes) always pass.
  const publishedBodyIsForPresentedEntry = publicationMatchesEntry(
    publishedInput?.sceneBodyForEntryId,
    entryId ?? null
  );

  // Static SV: on the track the body CELL rides the scroll, so the foundation
  // plate needs no counter-translation — holes track their boxes for free.
  const zeroScrollOffset = useSharedValue(0);
  // MOUNTED BODIES ARE PER ENTRY (A3 — entry identity reaches React element
  // identity): the renderer is cached by ENTRY key and closes over the LEG's own
  // scene + entry value, so two stacked entries of the same scene (two DM
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
  // ── THE LIVENESS PROBE (G-LIVENESS, R5) — dev-only runtime falsifier ────────
  // Samples are what the render closures ACTUALLY DELIVERED to the bodies'
  // activity contexts (recorded at invoke time, tagged with the render seq) —
  // never re-derived, or the audit would compare the derivation with itself and
  // could not show RED. Only CURRENT-seq samples are audited: a hidden body does
  // not render on today's page, so an old sample is history, not a live claim —
  // but any body that DOES render this commit (including a hidden one leaking
  // live lanes, or a cached closure using a stale presented flag) is judged.
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
      // lanes on the old host's activity contexts (all-false defaults left lists
      // blank on the track). Activity is DERIVED from presentation at invoke
      // time — the render closure is cached per entry, so the value may not be
      // captured (a captured all-true was the pre-R2 defect; a captured
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
                profile stats / home bands punch through to the kit's frost; the
                strip law sees its plate. Zero scroll offset: the cell itself
                rides the track. */}
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
  // strip-in-skeleton pills — comes from the scene's foundation spec through ONE
  // resolver (trackSkeletonMaterialForScene), never a hardcoded rowType.
  // Renderers are cached per SCENE (the material is scene data, not entry state)
  // so cold legs keep stable renderItem identities.
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
              padding — the default inset would double it and the skeleton would
              jump narrower→wider on the content swap (its own doc). */}
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

  // ROWS ON THE FOUNDATION (owner report: home shelf boxes lost their cutouts):
  // lane/list rows render in bare track cells, so a row's FrostCutout found no
  // surface and silently rendered a plain box. Each row cell now carries its own
  // foundation surface — holes measure against the cell (their own root), which
  // is exactly right on the track since the cell IS the scrolling unit.
  const wrapRowOnFoundation = React.useCallback(
    (node: React.ReactNode) => (
      <SceneBodyFoundationSurface scrollOffset={zeroScrollOffset} sceneKey={scene as SheetSceneKey}>
        {node}
      </SceneBodyFoundationSurface>
    ),
    [scene, zeroScrollOffset]
  );

  // ── THE RESIDENT LEGS + ENTRY RETENTION (residents-cutover F; G-ENTRY/A3) ───
  // Tab scenes become residents on FIRST visit (E1 lazy mount) and stay mounted
  // — pinned to their `scene#root` singleton identity (top-level tabs are one
  // logical entry forever; a re-minted stack entry per revisit must not fork
  // their scroll memory). Child scenes are ENTRY-KEYED and retained as hidden
  // legs with depth-K LRU (K=3): pushing B over A keeps A's leg — hook state,
  // strip selection, scroll — alive for a byte-exact pop-back.
  const isResidentScene = sceneIsResidentTrackScene(scene);
  const presentedEntryKey = makeTrackEntryKey(scene, isResidentScene ? null : entryId);
  const visitedResidentsRef = React.useRef(new Set<OverlayKey>());
  if (isResidentScene) {
    visitedResidentsRef.current.add(scene);
  }
  // ── G-PREWARM (R3): begin resolving a PREDICTABLE cold switch early ─────────
  // The nav's press-DOWN names a scene before press-up commits the switch; a
  // cold RESIDENT scene mounts its leg NOW — chrome/title/strip elements,
  // skeleton renderer and list-parts cells build in this early commit, so the
  // cold window starts at finger-down, not at the flip. The decision is pure and
  // data-driven (planScenePrewarm over the same residency table the legs ride);
  // the switch commit itself is untouched — one frame, always.
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
  // The ledger latches "this entry has shown content"; the last-good store is the
  // OA6.1 frozen world — when a latched entry's lane momentarily resolves to
  // nothing, its previous body renders, never a skeleton.
  const readinessLedgerRef = React.useRef(new TrackEntryReadinessLedger());
  const lastGoodListRef = React.useRef(new Map<TrackEntryKey, ResolvedLegList>());
  // ── THE PRESS-UP HANDOFF STATE (touch-latency rung) ──
  // residencyLedger: WHOSE ROWS ARE MOUNTED right now — one slot, because the
  // page has one body (the eye's fact, distinct from readiness' lane latch and
  // from the has-ever-painted fact this replaced).
  // deferredEntry: the entry whose real body is being withheld from THIS
  // commit so the flip can land in the frame after press-up.
  const residencyLedgerRef = React.useRef(new TrackEntryResidencyLedger());
  const deferredEntryRef = React.useRef<TrackEntryKey | null>(null);
  const handoffScheduledForRef = React.useRef<TrackEntryKey | null>(null);
  const handoffPrevEntryRef = React.useRef<TrackEntryKey | null>(null);
  /** Which body the LAST handoff frame painted — 'frozen' (the destination's own
   * rows, a full screenful to mount) or 'skeleton' (one cell). Written where the
   * choice is made, read by the [PERF] line. */
  const handoffBodyRef = React.useRef<'frozen' | 'skeleton' | null>(null);
  /** The data array each entry presented last time (identity only, dev probe). */
  const lastPresentedDataRef = React.useRef(new Map<TrackEntryKey, readonly unknown[]>());
  const [handoffSeq, bumpHandoffSeq] = React.useReducer((n: number) => n + 1, 0);
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
      residencyLedgerRef.current.forget(evictedKey);
      lastGoodListRef.current.delete(evictedKey);
      livenessSamplesRef.current.delete(evictedKey);
      // Scroll memory deliberately survives eviction (TrackEntryScrollMemory).
    }
    // The A7 capacity bark is DELETED with its premise (R2 kill-list): activity
    // now derives from presentation (deriveTrackEntryBodyActivity) — hidden
    // entries' host-owned lanes are suspended, so retention at capacity no
    // longer means live all-true data lanes.
  }

  // The published scene-input lane is SCENE-keyed — only the PRESENTED entry may
  // read it (a hidden same-scene entry reading it would alias the presented
  // entry's rows: the exact G-ENTRY collision), and a STAMPED publication must
  // match the presented entry.
  const publishedListForLeg = (legEntryKey: TrackEntryKey) =>
    legEntryKey === presentedEntryKey &&
    publishedBody != null &&
    publishedBody.surfaceKind === 'list' &&
    publishedBodyIsForPresentedEntry
      ? publishedBody
      : null;
  const partsListForScene = (legScene: OverlayKey) => {
    const partsSource = resolveSceneListPartsSource(legScene);
    const partsFor =
      partsSource === 'polls' ? pollsParts : partsSource === 'home' ? homeParts : null;
    return partsFor != null && partsFor.sceneBodyContent.surfaceKind === 'list'
      ? partsFor.sceneBodyContent
      : null;
  };
  // ── THE READINESS AXIS (G-READY, R2): resolution → phase → body ─────────────
  // Step 1 names WHAT EXISTS for the entry this commit (a pure fact, and it also
  // names WHICH LANE WON so step 3 does not re-walk the branch order); step 2
  // asks the ledger WHICH BODY to paint (content | skeleton | frozen — never a
  // wait, so the switch commit always paints in the same frame); step 3 builds
  // it. The old skeleton "fallthrough" is the not-ready phase by CONDITION — the
  // dead branch of the contract's G-READY row, made reachable.
  const resolveLegBodyPlan = (legEntryKey: TrackEntryKey, legScene: OverlayKey) => {
    const published = publishedListForLeg(legEntryKey);
    const parts = partsListForScene(legScene);
    return {
      published,
      parts,
      ...planTrackLegBody({
        publishedListRowCount: published != null ? (published.data?.length ?? 0) : null,
        partsListRowCount: parts != null ? (parts.data?.length ?? 0) : null,
        usesMountedBody: sceneUsesMountedTrackBody(legScene),
      }),
    };
  };
  // ── THE HANDOFF ARMS AT THE FLIP, IN RENDER (touch-latency rung) ───────────
  // The decision must be made in the SAME render pass that first sees the new
  // presented entry — an effect runs after the commit, which is exactly the
  // frame the finger is waiting for. The facts are read here; the decision is
  // pure (track-entry-handoff.ts).
  //
  // hasOutgoingPaint gates the boot pass: the very first presentation has no
  // outgoing page to hand off from, so it paints its body directly (a handoff
  // there would put a skeleton frame in front of app launch for no finger).
  if (handoffPrevEntryRef.current !== presentedEntryKey) {
    const hasOutgoingPaint = handoffPrevEntryRef.current != null;
    handoffPrevEntryRef.current = presentedEntryKey;
    const decision = planTrackEntryHandoff({
      destinationHasRealRows: resolutionHasRealRows(
        resolveLegBodyPlan(presentedEntryKey, scene).resolution
      ),
      // Read BEFORE the clear below: at this instant residency still names the
      // OUTGOING entry, which is exactly the fact — the destination's rows are
      // not mounted, so this frame cannot paint them for free.
      destinationRowsAreResident: residencyLedgerRef.current.isResident(presentedEntryKey),
      participatesInWorldJoin: sceneParticipatesInWorldJoin(scene),
      hasOutgoingPaint,
    });
    // THE FLIP IS WHERE THE OUTGOING BODY LEAVES THE TREE. Residency is a claim
    // about the current view tree; carrying the outgoing entry's slot past this
    // commit would let a later switch back to it take the 'direct' exemption on
    // rows that unmounted long ago — the has-ever-painted bug, reintroduced.
    residencyLedgerRef.current.clear();
    deferredEntryRef.current = decision === 'defer' ? presentedEntryKey : null;
  }
  /** True while this leg's real body is withheld for the flip frame. */
  const legIsHandingOff = (legEntryKey: TrackEntryKey) => deferredEntryRef.current === legEntryKey;
  // THE RELEASE, at the paint boundary. rAF (not a bare effect) is the honest
  // schedule: a passive effect can still run inside the frame the commit is
  // being mounted in, and the whole point is that the skeleton frame reaches
  // the screen BEFORE the expensive body renders. Same rAF-is-after-paint
  // reading the [PERF] switch probe already runs on. Guarded per armed key so
  // an unrelated re-render cannot re-arm or starve the release.
  React.useEffect(() => {
    const armed = deferredEntryRef.current;
    if (armed == null || handoffScheduledForRef.current === armed) {
      return;
    }
    handoffScheduledForRef.current = armed;
    requestAnimationFrame(() => {
      if (deferredEntryRef.current !== armed) {
        return;
      }
      deferredEntryRef.current = null;
      bumpHandoffSeq();
    });
  });

  const resolveLegList = (
    legEntryKey: TrackEntryKey,
    legScene: OverlayKey,
    legEntry: OverlayRouteEntry | null
  ): ResolvedLegList => {
    const { source, resolution, published, parts } = resolveLegBodyPlan(legEntryKey, legScene);
    if (legIsHandingOff(legEntryKey)) {
      // THE HANDOFF FRAME: the flip has committed — chrome, presented entry,
      // a11y, the txn's paint ack — over a body the page can produce WITHOUT
      // the destination's live resolution. The real body is the NEXT commit
      // (released at the paint boundary above).
      //
      // OA6.1 LIVES HERE, not in an exemption from the deferral: an entry that
      // has shown content has a FROZEN last-good body, and that is what the
      // flip frame paints — never a skeleton. The skeleton is only ever the
      // body of an entry that has never had one. This is why a revisit can
      // defer (paying none of the destination's CURRENT first screenful) and
      // still never flash.
      //
      // The readiness ledger is deliberately NOT consulted: this is not a
      // readiness verdict, and latching an entry as "content" on a frame that
      // is not showing its current content would corrupt the frozen-world fact.
      // Residency is likewise NOT written — nothing of the destination's real
      // body is mounted by this frame, which is the entire claim.
      const frozen = lastGoodListRef.current.get(legEntryKey);
      // WHICH BODY the handoff frame painted, RECORDED (not asserted) where the
      // choice is made. The probe used to refuse to name it on the grounds that
      // naming a body it had not looked at would be a lie — but looking is free
      // right here, and the distinction is load-bearing: a frozen body IS the
      // destination's own rows.
      handoffBodyRef.current = frozen != null ? 'frozen' : 'skeleton';
      if (frozen != null) {
        return frozen;
      }
      return { data: ['skeleton'], renderItem: rendererForSkeleton(legScene) };
    }
    const phase = readinessLedgerRef.current.present(legEntryKey, isResolutionReady(resolution));
    if (phase !== 'content') {
      if (phase === 'frozen') {
        // OA6.1: content is never replaced by a skeleton when content exists — a
        // latched entry whose lane momentarily resolves to nothing keeps its
        // frozen last-good body.
        const frozen = lastGoodListRef.current.get(legEntryKey);
        if (frozen != null) {
          return frozen;
        }
      }
      // THE SKELETON (G-READY cold visit + G-SKEL variant-as-data): a cold leg is
      // a REAL sheet body whose one item renders THE ONE loading material (the
      // cutout plate — THE SKELETON SHEET laws), shaped by the scene's foundation
      // spec. Painted in the SAME commit as the switch — the switch never waits
      // on data; readiness flips it to real rows (two-phase).
      return { data: ['skeleton'], renderItem: rendererForSkeleton(legScene) };
    }
    let list: ResolvedLegList;
    if (source === 'published' && published != null) {
      const spec = published;
      list = {
        leader: spec.ListHeaderComponent ?? null,
        data: spec.data,
        renderItem: spec.renderItem,
        keyExtractor: spec.keyExtractor,
        ListEmptyComponent: spec.ListEmptyComponent,
        ItemSeparatorComponent: spec.ItemSeparatorComponent,
        extraData: spec.extraData,
        onEndReached: spec.onEndReached,
        onEndReachedThreshold: spec.onEndReachedThreshold,
      };
    } else if (source === 'parts' && parts != null) {
      const spec = parts;
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
      // data carries the ENTRY key so a same-scene entry switch is a data change
      // to the one FlashList, never an aliased row.
      list = {
        data: [legEntryKey],
        renderItem: rendererForMountedEntry(legEntryKey, legScene, legEntry),
      };
    }
    lastGoodListRef.current.set(legEntryKey, list);
    // THE RESIDENCY FACT, written where it happens and nowhere else: this
    // entry's real rows are the ones mounted in the page's single FlashList.
    // Only the presented leg qualifies — a hidden leg's list props are built
    // every commit and never reach a pixel, and treating that as residency
    // would hand an unmounted body the free-frame exemption it cannot honour.
    if (legEntryKey === presentedEntryKey && resolutionHasRealRows(resolution)) {
      residencyLedgerRef.current.markResident(legEntryKey);
    }
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
      // Title + strip elements are cached PER ENTRY: a fresh element per switch
      // would miss the page's chrome cache and rebuild every leg's chrome on
      // every flip (measured: it doubled switch cost) — and a per-SCENE cache
      // would share strip/title state across two entries of the same scene
      // (G-ENTRY).
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
      const rowSurfaceKind = resolveTrackLegRowSurfaceKind({
        usesMountedBody: sceneUsesMountedTrackBody(legScene),
        mountedBodyIsEdgeToEdge: sceneMountedBodyIsEdgeToEdge(legScene),
        presentedLegHasPublishedList:
          legEntryKey === presentedEntryKey && publishedBody?.surfaceKind === 'list',
        declaresSharedRowSurface: sceneDeclaresSharedRowSurface(legScene),
      });
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
        rowSurfaceStyle: ROW_SURFACE_STYLE_BY_KIND[rowSurfaceKind],
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
    // The handoff release is a SECOND COMMIT by design: the legs must rebuild
    // for it, or the real body would wait on an unrelated data tick.
    handoffSeq,
    zeroScrollOffset,
  ]);
  if (__DEV__) {
    // WHAT THIS FRAME ASKED THE PAGE TO MOUNT, read off the leg actually built.
    // DATA IDENTITY is compared by object identity against this entry's previous
    // presentation, and CONTENT element-wise — because "a new array for the same
    // rows" (an upstream identity bug) and "genuinely new rows" produce the same
    // identity verdict, and assuming which one it is has been wrong repeatedly
    // in this attribution.
    const presentedLeg = legs.find((leg) => leg.entryKey === presentedEntryKey);
    const presentedList = presentedLeg?.list as ResolvedLegList | undefined;
    if (presentedList != null) {
      const previousData = lastPresentedDataRef.current.get(presentedEntryKey);
      lastPresentedDataRef.current.set(presentedEntryKey, presentedList.data);
      const contentSame =
        previousData != null &&
        previousData.length === presentedList.data.length &&
        previousData.every((row, index) => row === presentedList.data[index]);
      noteTrackPressBodyFact(
        scene,
        presentedList.data.length,
        legIsHandingOff(presentedEntryKey) ? (handoffBodyRef.current ?? 'deferred') : 'live',
        previousData == null ? 'first' : previousData === presentedList.data ? 'same' : 'new',
        previousData == null ? 'first' : contentSame ? 'same' : 'changed'
      );
    }
    // Legs are available here. What remains between this point and
    // 'layout-effect' is TrackSheetPage's own render — the span that separates
    // "the resolver was slow" from "the page was slow".
    noteTrackPressPhase(scene, 'legs-built', Date.now());
  }

  // ── THE TWO-PHASE COLD-FLIP PROBE ([PERF], R2) ──────────────────────────────
  // The owner's original complaint was a multi-second polls switch. The law: the
  // switch PRESENTS in one commit (skeleton or retained content); real rows are
  // the second phase. This probe measures phase two — the time from the switch
  // commit to the first commit whose presented body has real rows — so the
  // on-device claim is a number, not an impression. Dev-only.
  // The press-anchored span (press->first-paint AND press->real-rows, ONE line)
  // is taken here too \u2014 see the marks below.
  // PAINTED, NOT RESOLVED (touch-latency rung): during a handoff frame the
  // destination's rows RESOLVE but are deliberately not rendered. A probe that
  // read the resolution would report "presented real rows in the switch commit"
  // for the exact frame whose whole purpose is that it did not — an
  // always-green metric, and the precise lie that hid this defect. It reports
  // the cold (skeleton) commit instead, and the release commit closes it: ONE
  // log pair per switch, never two.
  const presentedHasRealRows =
    !legIsHandingOff(presentedEntryKey) &&
    resolutionHasRealRows(resolveLegBodyPlan(presentedEntryKey, scene).resolution);
  const coldFlipProbeRef = React.useRef<{ entryKey: TrackEntryKey; t0: number } | null>(null);
  const probePrevEntryRef = React.useRef<TrackEntryKey | null>(null);
  React.useEffect(() => {
    if (!__DEV__) {
      return;
    }
    const isFlipCommit = probePrevEntryRef.current !== presentedEntryKey;
    // ── THE PRESS SPAN's TWO MARKS, both taken at a PAINT BOUNDARY off the ONE
    // anchor the finger set (track-entry-prewarm.ts). rAF, not effect time: the
    // effect runs inside the commit, and the claim is about what reached the
    // screen. The deferred frame marks FIRST-PAINT; the release commit marks
    // REAL-ROWS and closes the span — one line carrying both, so a fast
    // skeleton cannot make the number the rung exists to move go green.
    const spanScene = trackEntrySceneKey(presentedEntryKey);
    const spanEntry = presentedEntryKey;
    const spanHadRealRows = presentedHasRealRows;
    requestAnimationFrame(() => {
      const paintedAt = Date.now();
      if (isFlipCommit) {
        noteTrackPressFirstPaint(spanScene, spanEntry, paintedAt, spanHadRealRows);
        // THE PHASE LINE, closed at the SAME paint boundary as first-paint — the
        // two instruments must not disagree about when the flip hit the screen.
        const phases = finishTrackPressPhaseSpan(spanScene, paintedAt);
        if (phases != null) {
          // eslint-disable-next-line no-console
          console.log(formatTrackPressPhases(phases));
        }
      }
      if (spanHadRealRows) {
        const report = noteTrackPressRealRows(spanScene, spanEntry, paintedAt);
        if (report != null) {
          // THE ROW WINDOW, closed where real rows actually landed — the count
          // that says what drawDistance=SCREEN.height over a full-screen list
          // decides to mount, which the flip frame could never have answered.
          const rowTally = finishTrackPressRowWindow(spanScene);
          if (rowTally != null) {
            // eslint-disable-next-line no-console
            console.log(formatTrackPressRowWindow(spanScene, rowTally));
          }
          // eslint-disable-next-line no-console
          console.log(formatTrackPressSpan(report));
        }
      }
    });
    if (isFlipCommit) {
      probePrevEntryRef.current = presentedEntryKey;
      if (presentedHasRealRows) {
        coldFlipProbeRef.current = null;
        // eslint-disable-next-line no-console
        console.log(`[PERF] switch ${presentedEntryKey} presented real rows in the switch commit`);
      } else {
        coldFlipProbeRef.current = { entryKey: presentedEntryKey, t0: Date.now() };
        // DEFERRED, not necessarily COLD: the handoff frame paints the frozen
        // last-good body when the entry has one and the skeleton only when it
        // has never had one. Naming it "skeleton commit" would have been the
        // probe asserting a body it did not look at.
        // eslint-disable-next-line no-console
        console.log(
          `[PERF] switch ${presentedEntryKey} presented deferred (handoff frame) ` +
            `body=${handoffBodyRef.current ?? 'unknown'}`
        );
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

  // ── THE LIVENESS AUDIT (G-LIVENESS, R5) — every commit, dev only ────────────
  // Judges only samples DELIVERED in this render pass (seq-tagged above): a
  // presented body handed suspended lanes, a hidden body handed live lanes, or a
  // cached closure that used a stale presented flag all bark RED here.
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

  return { presentedEntryKey, legs };
};

const styles = StyleSheet.create({
  // Production's body inset (useBottomSheetSceneStackBodyContentRuntime applies
  // OVERLAY_HORIZONTAL_PADDING via the transport) — mounted bodies expect it.
  rowSurface: { paddingHorizontal: OVERLAY_HORIZONTAL_PADDING },
  // Mounted cells: the FOUNDATION plate is the white now — the cell must be
  // transparent or cutout holes reveal cell-white instead of frost.
  mountedSurface: { backgroundColor: 'transparent' },
  mountedSurfaceUnpadded: { backgroundColor: 'transparent' },
  mountedBodyInset: { paddingHorizontal: OVERLAY_HORIZONTAL_PADDING },
});

/** The pure kind (track-leg-plan.ts) → the registered style. */
const ROW_SURFACE_STYLE_BY_KIND = {
  mounted: styles.mountedSurface,
  'mounted-edge-to-edge': styles.mountedSurfaceUnpadded,
  padded: styles.rowSurface,
  bare: undefined,
} as const;
