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
import { Dimensions, StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import type { SheetSceneKey } from '../navigation/runtime/scene-foundation-spec';
import {
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
import { SceneBodySceneKeyContext } from '../overlays/SceneBodyReadyGate';
import { SceneLoadingSurface } from '../components/skeletons';
import { SceneSkeletonWidthHintContext } from '../components/skeletons/scene-skeleton-width-hint';
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
import type {
  MountedSceneBodyProps,
  MountedTrackBodySceneKey,
} from './track-mounted-body-contract';
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
import { planTrackHandoffRelease } from './track-handoff-release';
import { isResolutionReady, resolutionHasRealRows } from './track-entry-readiness';
import { resolveTrackPaint } from './track-paint-resolver';
import type { TrackPresentedEntryLatch } from './track-presented-authority';
import { trackSkeletonMaterialForScene } from './track-entry-skeleton';
import { planTrackLegBody, resolveTrackLegRowSurfaceKind } from './track-leg-plan';

/** THE DECLARED BODY-LANE WIDTH (fix 2a): the track's body cell spans the window;
 * non-edge-to-edge bodies (and the track skeleton) sit inside the mountedBodyInset
 * padding. A construction fact, not a measurement — it seeds skeleton hole
 * geometry so first commits carry holes; onLayout refines. */
const trackBodyLaneWidth = (edgeToEdge: boolean): number =>
  Dimensions.get('window').width - (edgeToEdge ? 0 : OVERLAY_HORIZONTAL_PADDING * 2);

// THE COMPONENT MAP. The schema declares `body.kind: 'mounted'` (F872 —
// scene-foundation-spec.ts); this map binds the key to its React component.
// (Registration cannot hoist into the pure table without inverting the
// dependency — the table would import every panel.)
// F981: an exhaustive Record over the contract's key list — a missing component
// is a BUILD ERROR; the key-list↔schema agreement is a parity-spec CI RED
// (scene-declaration-schema-parity.spec.ts), not a dev-only bark.
const MOUNTED_BODY_COMPONENTS: Record<
  MountedTrackBodySceneKey,
  React.ComponentType<MountedSceneBodyProps>
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

// The old dev-only assertMountedBodyAgreement bark is gone (residue-kill-plan §3):
// map↔key-list agreement is a BUILD ERROR (exhaustive Record above) and
// key-list↔schema agreement is a parity-spec CI RED.

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
  presentedLatch,
}: {
  scene: OverlayKey;
  entryId: string | null;
  entry?: OverlayRouteEntry | null;
  /** THE ONE presented-entry authority (R8): host-owned, read here instead of
   * a second live ref mirroring the same fact. */
  presentedLatch: TrackPresentedEntryLatch;
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
  // current commit's presented entry through the host-owned latch at invoke
  // time (R8: the second live ref that mirrored it is deleted).
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
      const Body = MOUNTED_BODY_COMPONENTS[legScene as MountedTrackBodySceneKey] as
        | React.ComponentType<MountedSceneBodyProps>
        | undefined;
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
      const isPresented = presentedLatch.entryKey === legEntryKey;
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
        // THE GATE'S SCENE RESOLUTION (skeleton-path audit, 2026-08-08): mounted
        // bodies gate their pending queries through SceneBodyReadyGate, which
        // resolves its foundation skeleton ONLY via this context — and the only
        // other provider is the old host (BottomSheetSceneStackHost), dark behind
        // the flip. Without it, a pending body on the track rendered NULL (blank
        // white) instead of its declared material. Per-LEG scene, not the
        // presented scene: a hidden retained leg must carry its own key.
        <SceneBodySceneKeyContext.Provider value={legScene}>
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
                    {/* THE WIDTH HINT (fix 2a): a pending body's gate skeleton
                        (SceneBodyReadyGate → SceneLoadingSurface) seeds its hole
                        geometry from this DECLARED lane width, so the commit that
                        replaces the handoff skeleton paints holes immediately —
                        the two skeleton phases are pixel-continuous (same
                        material, same geometry, no measuring blank between). */}
                    <SceneSkeletonWidthHintContext.Provider
                      value={trackBodyLaneWidth(sceneMountedBodyIsEdgeToEdge(legScene))}
                    >
                      <ChromeProbeBoundary label={`${legScene}.body`}>
                        <Body entry={legEntry ?? undefined} />
                      </ChromeProbeBoundary>
                    </SceneSkeletonWidthHintContext.Provider>
                  </View>
                </SceneBodyFoundationSurface>
              </BottomSheetSceneStackBodyIsActiveContext.Provider>
            </BottomSheetSceneStackBodyRenderActivityContext.Provider>
          </BottomSheetSceneStackBodyDataActivityContext.Provider>
        </SceneBodySceneKeyContext.Provider>
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
          {/* width is DECLARED (fix 2a): the track cell is window-wide and this
              surface sits inside the mountedBodyInset padding, so its width is a
              construction fact — holes exist on the skeleton's FIRST commit. */}
          <SceneLoadingSurface
            rowType={material.rowType}
            withFilterStripHoles={material.withStripHoles}
            insetX={0}
            width={trackBodyLaneWidth(false)}
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
  // THE PRESENTED KEY comes from the host's latch (one authority). The latch
  // was committed with this commit's painted (scene, entryId) before this hook
  // ran, so it is exactly makeTrackEntryKey(scene, resident ? null : entryId).
  const presentedEntryKey = presentedLatch.entryKey;
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
  // ── THE FROZEN WORLD (OA6.1 → OA8) ──
  // The last-good store: a live body, once built, is recorded here so a later
  // commit can paint it without the entry's live resolution. R8: the readiness
  // LEDGER is deleted — "has shown content" is subsumed by "a frozen body
  // exists" (track-paint-resolver.ts header), held by the store that has it.
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
  // THE RELEASE FACTS (fix 2b, 2026-08-08). The rAF stays as the mechanism that
  // guarantees the flip frame reached the screen first; WHETHER the release may
  // fire is the pure decision (track-handoff-release.ts): flip painted AND the
  // destination's resolution is ready at attempt time. Readiness is read off a
  // ref written every render so the rAF callback and later commits judge the
  // CURRENT fact, never a captured one.
  const presentedResolutionReadyRef = React.useRef(false);
  presentedResolutionReadyRef.current = isResolutionReady(
    resolveLegBodyPlan(presentedEntryKey, scene).resolution
  );
  /** Which armed entry's flip frame has already painted (the rAF fired). */
  const flipPaintedForRef = React.useRef<TrackEntryKey | null>(null);
  /** Dev observation port for the release-law bark below. */
  const justReleasedRef = React.useRef<TrackEntryKey | null>(null);
  if (__DEV__ && justReleasedRef.current != null) {
    // THE RELEASE-LAW BARK (fix 2b falsifier port): the commit a release lands
    // in must have a ready destination resolution — a release that beat
    // readiness (the old bare-rAF schedule, reintroduced) swapped the armed
    // handoff paint for nothing the destination could stand behind. Judged at
    // the release COMMIT, one level away from the decision it audits, so a
    // mutated decision cannot silence it.
    const releasedEntry = justReleasedRef.current;
    justReleasedRef.current = null;
    if (releasedEntry === presentedEntryKey && !presentedResolutionReadyRef.current) {
      // eslint-disable-next-line no-console
      console.error(
        `[HANDOFF] release committed without destination readiness (${releasedEntry}) — ` +
          `the handoff skeleton was evicted before the destination could paint content.`
      );
    }
  }
  const attemptHandoffRelease = React.useCallback(
    (armed: TrackEntryKey) => {
      if (deferredEntryRef.current !== armed) {
        return;
      }
      const release = planTrackHandoffRelease({
        flipHasPainted: flipPaintedForRef.current === armed,
        destinationResolutionReady: presentedResolutionReadyRef.current,
      });
      if (!release) {
        // WITHHELD: the handoff paint (skeleton/frozen) persists — the reveal
        // law's "no white gap between skeleton and content" as a schedule. A
        // later commit (the one that restores readiness) re-attempts below.
        return;
      }
      deferredEntryRef.current = null;
      if (__DEV__) {
        justReleasedRef.current = armed;
      }
      bumpHandoffSeq();
    },
    [bumpHandoffSeq]
  );
  // THE RELEASE, at the paint boundary. rAF (not a bare effect) is the honest
  // schedule: a passive effect can still run inside the frame the commit is
  // being mounted in, and the whole point is that the skeleton frame reaches
  // the screen BEFORE the expensive body renders. Same rAF-is-after-paint
  // reading the [PERF] switch probe already runs on. Guarded per armed key so
  // an unrelated re-render cannot re-arm or starve the release. When the rAF
  // attempt was withheld (readiness lost mid-handoff), every subsequent commit
  // re-attempts — the commit that restores readiness IS the release commit.
  React.useEffect(() => {
    const armed = deferredEntryRef.current;
    if (armed == null) {
      return;
    }
    if (handoffScheduledForRef.current === armed) {
      // Already past the flip's paint boundary for this key: re-attempt on the
      // current commit's facts (readiness may have just returned).
      if (flipPaintedForRef.current === armed) {
        attemptHandoffRelease(armed);
      }
      return;
    }
    handoffScheduledForRef.current = armed;
    // A fresh arm invalidates any previous episode's painted flag — the same
    // entry can re-arm on a later revisit, and a stale flag would let the
    // re-attempt branch above release BEFORE this episode's paint boundary.
    flipPaintedForRef.current = null;
    requestAnimationFrame(() => {
      flipPaintedForRef.current = armed;
      attemptHandoffRelease(armed);
    });
  });

  const resolveLegList = (
    legEntryKey: TrackEntryKey,
    legScene: OverlayKey,
    legEntry: OverlayRouteEntry | null
  ): ResolvedLegList => {
    const { source, resolution, published, parts } = resolveLegBodyPlan(legEntryKey, legScene);
    // ── THE ONE PAINT DECISION (R8 / OA8): frozen when affordable, skeleton
    // when not, live when resident. resolveTrackPaint is the single total
    // resolver — the readiness ledger's present() and the handoff's inline
    // frozen/skeleton branch (the two rival deciders) are merged into it.
    const isHandingOff = legIsHandingOff(legEntryKey);
    const frozen = lastGoodListRef.current.get(legEntryKey);
    const paint = resolveTrackPaint({
      isHandingOff,
      ready: isResolutionReady(resolution),
      hasFrozenBody: frozen != null,
    });
    if (isHandingOff) {
      // WHICH BODY the handoff frame painted, RECORDED (not asserted) where the
      // choice is made — a frozen body IS the destination's own rows, and the
      // [PERF] line must not conflate the two.
      handoffBodyRef.current = paint.body === 'frozen' ? 'frozen' : 'skeleton';
    }
    if (paint.body === 'frozen' && frozen != null) {
      // The frozen world (OA6.1 as OA8 reframed it): the frame shows the
      // entry's last-good body — on the handoff flip frame AND on a live
      // resolution gap alike. Residency is NOT written: nothing of the
      // entry's real body is mounted by this frame.
      return frozen;
    }
    if (paint.body !== 'live') {
      // THE SKELETON (G-READY cold visit + G-SKEL variant-as-data): a REAL
      // sheet body whose one item renders THE ONE loading material, shaped by
      // the scene's foundation spec — painted in the SAME commit as the
      // switch. OA8: reachable on a revisit too, when no frozen body is
      // affordable — an honest brief skeleton beats a frozen finger.
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
    if (paint.freezeLiveBody) {
      // The write that makes 'frozen' affordable later, on the condition the
      // resolver STATED (freezeLiveBody) — not a drifted second condition.
      lastGoodListRef.current.set(legEntryKey, list);
    }
    // F9403 (R8): the LIST-LANE liveness sample. Mounted bodies record what
    // their render closure delivered; list-lane legs (polls/home published/
    // parts rows) deliver their activity implicitly by being built as the
    // page's rows — sample it at build time so a presented-but-suspended
    // polls/home body can show RED instead of being structurally exempt.
    if (__DEV__ && (source === 'published' || source === 'parts')) {
      const legIsPresented = legEntryKey === presentedEntryKey;
      const listLaneActivity = deriveTrackEntryBodyActivity(legScene, legIsPresented);
      livenessSamplesRef.current.set(legEntryKey, {
        entryKey: legEntryKey,
        renderedAsPresented: legIsPresented,
        shouldRunDataLane: listLaneActivity.shouldRunDataLane,
        shouldSubscribeDataLane: listLaneActivity.shouldSubscribeDataLane,
        shouldRenderExpandedContent: listLaneActivity.shouldRenderExpandedContent,
        seq: renderSeqRef.current,
      });
    }
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
  // Production's body inset (the old host's body runtime applied
  // OVERLAY_HORIZONTAL_PADDING via the transport; the track keeps the same
  // geometry) — mounted bodies expect it.
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
