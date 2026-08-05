// ─── THE MOTION CONTROLLER (host extraction 1, React half) ────────────────────
//
// Everything the track sheet host used to do about MOTION: execute the motion
// plane's commands, keep the settle-token lifecycle, arm the 700ms deadline
// backstop, register as the 'sheetHost' motion target, answer policy reads, feed
// the redraw join's sheet leg, and turn native rest facts into fence restores.
//
// It is now a THIN ADAPTER over the two things that actually own this domain:
// the MOTION AUTHORITY (track-motion-authority.ts — the facts, the episode
// identity, the one at-rest definition) and the PURE PLAN (track-motion-plan.ts
// — the three arithmetic decisions). What is left here is exactly the parts
// that cannot be pure: React refs/effects, the native command call, a timer,
// and the reanimated command channel.

import React from 'react';
import { NativeEventEmitter, NativeModules } from 'react-native';
import { runOnJS, useAnimatedReaction, useSharedValue } from 'react-native-reanimated';

import type { OverlayKey } from '../navigation/runtime/app-overlay-route-types';
import type { useAppRouteSceneRuntime } from '../navigation/runtime/AppRouteSceneRuntimeProvider';
import { getSearchSurfaceRuntime } from '../screens/Search/runtime/surface/search-surface-runtime';
import { resolveSnapTargetForRead } from './track-entry-interrupt';
import {
  getTrackMotionAuthority,
  type TrackMotionTransition,
  type TrackSnapCommand,
} from './track-motion-authority';
import {
  classifyTrackSettleDetent,
  planTrackMotionCommand,
  resolveTrackPosture,
} from './track-motion-plan';
import type { TrackSheetCommands } from './TrackSheetPage';

/** PROVENANCE (F874, 2026-08-03): 700ms is a DEADLINE, not a duration — the
 * "the settle fact never arrived" backstop for a snap whose native spring
 * should have reported settle long before. Deliberately longer than any real
 * spring so it never PREEMPTS a genuine settle (that would complete the token
 * early and let chrome move before the sheet did), and short enough that a lost
 * settle costs one visible beat rather than a wedged transition. Not measured
 * against the spring; sized to be safely past it. */
const SETTLE_DEADLINE_MS = 700;

// ── THE R7 FENCE, both sides ─────────────────────────────────────────────────
// READY side: the faithful port of the old host's snap-SETTLE producer for the
// search redraw join's 'sheet' leg. PENDING side (D2 closed): flip the fence the
// instant a PROVEN motion begins — a will-move command or a native drag begin.
// Both are keyed to a live/pending search redraw exactly the same way, so
// unrelated surfaces never touch it.

const markSheetLegReady = (): void => {
  const runtime = getSearchSurfaceRuntime();
  const transactionId = runtime.getActiveOrPendingRedrawTransactionId();
  if (transactionId != null) {
    runtime.markRedrawSheetReady(transactionId);
  }
};

const markSheetLegMotionPending = (): void => {
  const runtime = getSearchSurfaceRuntime();
  const transactionId = runtime.getActiveOrPendingRedrawTransactionId();
  if (transactionId != null) {
    runtime.markRedrawSheetMotionPending(transactionId);
  }
};

// ─── THE ONE NATIVE EDGE SOURCE ───────────────────────────────────────────────
// Native stamps every trackHiddenEdgeCleared with the excursion generation it
// minted at arm time. The host used to hold BOTH a module-scope
// `armedHiddenExcursionGeneration` register AND two independent
// NativeEventEmitter subscriptions to the same emission (the deferred-swap gate
// and the hidden-settle completion), each re-validating the stamp by hand — the
// textbook "no bus" tell. Now there is ONE subscription: it dispatches the raw
// fact into the motion authority, which validates it against the episode that
// armed it and fans the VALIDATED edge out to both consumers
// (authority.subscribeHiddenEdge). The register is the authority's
// state.armedExcursion.
//
// It lives HERE and not in the authority module because the authority is
// deliberately RN-free: the pure jest lane and the search surface runtime both
// consult it, and neither may import the native boundary.
export const useNativeHiddenEdgeSource = (): void => {
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

export type TrackMotionControllerDeps = {
  /** The PRESENTED scene — posture memory is written under it. */
  scene: OverlayKey;
  /** Canonical detent tops from the startup geometry seed. */
  snapPoints: { expanded: number; middle: number; collapsed: number };
  /** The route scene runtime — the motion plane + snap session live on it. */
  sceneRuntime: ReturnType<typeof useAppRouteSceneRuntime>;
};

export type TrackMotionController = {
  /** Filled by TrackSheetPage on mount — the native command surface. */
  commandsRef: React.MutableRefObject<TrackSheetCommands | null>;
  /** Every rest on a detent (gesture or programmatic) → the authority. */
  reportSettleFact: () => void;
  /** A native drag begin → the authority (opens a drag episode) + fence. */
  reportDragBeginFact: () => void;
  /** GESTURE-born detent rests only → posture memory (seats are gesture-written). */
  onGestureSettle: (detentTau: number) => void;
};

export const useTrackMotionController = ({
  scene,
  snapPoints,
  sceneRuntime,
}: TrackMotionControllerDeps): TrackMotionController => {
  const commandsRef = React.useRef<TrackSheetCommands | null>(null);
  const trackH = snapPoints.collapsed - snapPoints.expanded;
  const middleTau = snapPoints.collapsed - snapPoints.middle;
  const motionCommandValue = useSharedValue<{
    snapTo: TrackSnapCommand;
    token: number;
    settleToken?: number | null;
  } | null>(null);
  // THE MOTION AUTHORITY (deep red team item 1) replaced THREE private refs that
  // used to live here — the settle-token wait, the in-flight spring destination
  // and the excursion bit — plus the module-scope armed-generation register. All
  // four were one EPISODE wearing four coats; the authority stores it once, with
  // an identity, and every consumer READS it.
  const motionAuthority = getTrackMotionAuthority();

  // Every REST fact (settle observer, generation-matched screen edge, 700ms
  // deadline) funnels here: restore the fence and complete the episode's settle
  // token. The token rides the EPISODE, so a superseded command's token can
  // never be completed by a later episode's rest.
  const applyMotionRestFact = React.useCallback(
    (transition: TrackMotionTransition) => {
      if (!transition.rest) {
        return;
      }
      // R7 fence: every rest fact restores it — including the hidden edge, whose
      // rest is not a detent and never reaches the settle observer.
      markSheetLegReady();
      const token = transition.ended?.settleToken ?? null;
      if (token != null) {
        sceneRuntime.routeSceneMotionRuntime.completeFromSheetSettle?.(token);
      }
    },
    [sceneRuntime]
  );

  const executeMotionCommand = React.useCallback(
    (snap: TrackSnapCommand, settleToken: number | null) => {
      const commands = commandsRef.current;
      // THE HIDDEN EXCURSION (G-HIDDEN, R4): 'hidden' is a REACHABLE seat — a
      // GLIDE below collapsed on the same native spring (the second motion
      // primitive: τ-domain extension). Before the excursion moves τ, snapshot
      // the presented entry's scroll — the deferred swap commits at τ=−depth,
      // where the live term is gone (planEntrySwitch suppresses hidden-domain
      // saves). THE DEPTH IS NATIVE (ratified item 5): the command carries the
      // INTENT and the engine states the pixel.
      if (snap === 'hidden') {
        commands?.saveScrollForPresentedEntry();
      }
      const { postureTau, willMove } = planTrackMotionCommand({
        snap,
        trackH,
        middleTau,
        currentPosture: resolveTrackPosture(
          commands?.readTau() ?? 0,
          commands?.readSigma() ?? 0,
          trackH
        ),
      });
      // THE COMMAND FACT into the authority. A real flight records its
      // destination for mid-flight reads; a hidden excursion records none (its
      // target is not a detent posture) and a zero-move snap opens no episode at
      // all. A non-hidden command also supersedes any armed excursion — that law
      // lives in the reducer, not in a module-scope register.
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
      // or the deadline behind it, so a no-op snap can never strand the bit.
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
          // The episode becomes the drag it lost to (it is still moving), so the
          // gesture settle or the deadline restores the fence and completes the
          // token.
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
          // THE ZERO-PIXEL SETTLE (joinWait red team): a same-posture switch
          // short-circuits inside native snapTo and produces NO settle fact —
          // complete the token now; the timer stays only as the safety net for
          // snaps that genuinely move.
          sceneRuntime.routeSceneMotionRuntime.completeFromSheetSettle?.(settleToken);
        } else {
          setTimeout(() => {
            // EPISODE-MATCHED (was: token-matched against a private ref). A
            // deadline can only ever end the episode that armed it.
            applyMotionRestFact(motionAuthority.dispatch({ type: 'deadline-expired', episodeId }));
          }, SETTLE_DEADLINE_MS);
        }
      }
    },
    [applyMotionRestFact, middleTau, motionAuthority, sceneRuntime, trackH]
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
  // settleToken rode the deadline. The authority validates the stamp against the
  // episode that armed it.
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
  // SPRING TARGET (G-INTERRUPT / A5, resolveSnapTargetForRead): a ±2pt read of a
  // moving τ misclassifies, and THE FINGER OWNS TAU kills the machine target for
  // the read the moment a drag is live.
  const resolveCurrentSnapTarget = React.useCallback(() => {
    const commands = commandsRef.current;
    if (commands == null) {
      return null;
    }
    return resolveSnapTargetForRead({
      // READ, DON'T SHADOW: the in-flight target is the authority's episode.
      inFlightTarget: motionAuthority.inFlightSnapTarget(),
      dragging: commands.readDragging(),
      posture: resolveTrackPosture(commands.readTau(), commands.readSigma(), trackH),
      trackH,
      middleTau,
    });
  }, [middleTau, motionAuthority, trackH]);

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
  const onGestureSettle = React.useCallback(
    (detentTau: number) => {
      sceneRuntime.routeSheetSnapSessionActions.recordRouteSceneSheetSettle({
        sceneKey: scene,
        snap: classifyTrackSettleDetent(detentTau, trackH, middleTau),
        writer: 'gesture',
      });
    },
    [middleTau, scene, sceneRuntime, trackH]
  );

  // ── THE SHEET LEG OF THE REDRAW JOIN ([JOINT], attributed 2026-07-28) ───────
  // canAdmitResultsBody joins {cards→'paint', mapFrame, sheet}. The OLD host was
  // THE sheet-motion authority for that last leg (markRedrawSheetReady at snap
  // SETTLE). With it unmounted NOTHING produced 'sheet', so a world-backed list
  // held its rows until the 1500ms bark and the reveal never joined. The track is
  // that authority now:
  //   • settle → ready (the faithful port of the old snap-SETTLE producer)
  //   • a redraw arming while the sheet is already AT REST → ready immediately,
  //     because a sheet that never moves has no settle to wait for. This is the
  //     case list entry actually hits. This subscriber runs on EVERY runtime
  //     publish, so an unconditional ready here would clobber a pending flip in
  //     the same tick — hence the checked at-rest fact.
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

  return { commandsRef, reportSettleFact, reportDragBeginFact, onGestureSettle };
};
