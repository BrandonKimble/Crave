// ─── THE MOTION AUTHORITY (deep red team round 2, ratified item 1) ────────────
//
// THE PROBLEM IT DELETES. The system has five PROVEN motion facts — a command
// issued with willMove, a native drag begin, a settle, the hidden excursion's
// generation-stamped screen-edge event, and the 700ms deadline — and, before
// this module, no AUTHORITY over them. Every consumer kept its own ledger: the
// fence read four host refs, the interrupt read a private inFlightSnapTargetRef,
// the host kept hiddenExcursionInFlightRef plus a module-scope
// armedHiddenExcursionGeneration, TWO NativeEventEmitter subscriptions in one
// file consumed the SAME edge emission, and the reveal seed in the search
// surface runtime read a published snapshot flag it could not interrogate.
//
// Two consequences, both class-level:
//   (a) F2 — a redraw arming while the sheet is ALREADY in motion was born
//       sheetMotionSettled:true, because the seed path had nothing to ASK. A
//       reveal could land mid-slide. Patching the seed alone would have left
//       the next consumer to reopen the same window.
//   (b) four independent encodings of "at rest" (fence refs, interrupt posture
//       classification, the JS τ-stability settle sampler, native inMotion)
//       that can disagree.
//
// THE SHAPE. ONE queryable store over ONE episode:
//   • facts go IN as transitions (dispatch);
//   • state comes OUT as a total query API (isAtRest / currentEpisode /
//     episodeId / inFlightSnapTarget) — anyone, born at any moment, can ask;
//   • every episode carries an IDENTITY, so late/stale facts (a superseded
//     command's native outcome, a prior excursion's edge, an expired deadline)
//     are matched to their episode instead of trusting arrival order.
//
// This module is RN-free ON PURPOSE: the pure lane (jest.config.js, *.spec.ts,
// no react-native) must be able to falsify it, and the search surface runtime
// must be able to consult it without importing the native boundary. The single
// native edge subscription lives in the host and DISPATCHES here; consumers
// subscribe to the authority, never to the emitter.

export type TrackSnapDetent = 'expanded' | 'middle' | 'collapsed';
export type TrackSnapCommand = TrackSnapDetent | 'hidden';

/** One continuous stretch of motion, with an identity. */
export type TrackMotionEpisode = {
  /** Monotonic, minted per episode. Late facts must name it to be consumed. */
  episodeId: number;
  /**
   * 'flight'    — a commanded spring to a DETENT (its target is a policy fact);
   * 'excursion' — a commanded hidden excursion (its target is not a detent, so
   *               it records none by design; its rest is the screen edge);
   * 'drag'      — the finger owns τ (and everything after it until rest: a
   *               released drag is still decelerating).
   */
  kind: 'flight' | 'excursion' | 'drag';
  /** The live spring's destination — flights only (G-INTERRUPT / A5). */
  snapTarget: TrackSnapDetent | null;
  /** The motion plane's token this episode must complete at its rest fact. */
  settleToken: number | null;
  /** Wall-clock ms at episode start (episode age, for probes). */
  startedAtMs: number;
};

export type TrackMotionState = {
  episode: TrackMotionEpisode | null;
  /**
   * The excursion generation native minted for OUR hide, with the episode that
   * armed it. Deliberately OUTLIVES its episode: a hide whose settle deadline
   * expired must still recognise its own screen-edge event (the deferred swap
   * is a paint decision, not a rest fact). Cleared by any non-hidden command,
   * by a refusal, by the next arm, and by the edge it stamps.
   */
  armedExcursion: { episodeId: number; generation: number } | null;
  nextEpisodeId: number;
};

export const initialTrackMotionState: TrackMotionState = {
  episode: null,
  armedExcursion: null,
  nextEpisodeId: 1,
};

export type TrackMotionEvent =
  /** THE COMMAND FACT: executeMotionCommand's willMove — the same fact that
   *  arms the settle token and flips the fence. */
  | {
      type: 'command-issued';
      willMove: boolean;
      snapTo: TrackSnapCommand;
      settleToken: number | null;
      atMs: number;
    }
  /** Native answered `refused` — a drag owns τ, the machine target is DEAD. */
  | { type: 'command-refused'; episodeId: number }
  /** Native minted the excursion generation for the episode we commanded. */
  | { type: 'excursion-armed'; episodeId: number; generation: number }
  /** THE DRAG FACT: physics.dragging false→true (the finger owns τ). */
  | { type: 'drag-begin'; atMs: number }
  /** THE SETTLE FACT: the track came to rest on a detent. */
  | { type: 'settle' }
  /** THE EDGE FACT: native trackHiddenEdgeCleared, generation-stamped. */
  | { type: 'excursion-edge'; generation: number | null }
  /** THE DEADLINE FACT: the 700ms never-strand backstop for one episode. */
  | { type: 'deadline-expired'; episodeId: number };

export type TrackMotionTransition = {
  state: TrackMotionState;
  /** The event named a live fact and changed the world. A rejected event is a
   *  STALE fact (wrong episode, wrong generation, nothing in flight). */
  accepted: boolean;
  started: TrackMotionEpisode | null;
  /** The episode this event ended, if any. */
  ended: TrackMotionEpisode | null;
  /** The event PROVES the sheet is at rest (settle / consumed edge / deadline).
   *  A supersession ends an episode WITHOUT rest. */
  rest: boolean;
  /** A generation-matched screen-edge crossing — the deferred swap's boundary.
   *  True even when the episode already expired (see armedExcursion). */
  hiddenEdge: boolean;
};

const idle = (state: TrackMotionState, accepted = false): TrackMotionTransition => ({
  state,
  accepted,
  started: null,
  ended: null,
  rest: false,
  hiddenEdge: false,
});

/** THE PURE REDUCER — the whole motion law, falsifiable without a renderer. */
export const reduceTrackMotion = (
  state: TrackMotionState,
  event: TrackMotionEvent
): TrackMotionTransition => {
  switch (event.type) {
    case 'command-issued': {
      // A non-hidden command SUPERSEDES any armed excursion: its edge, if it
      // ever fires, is stale from here on (native consumes the one-shot too).
      const armedExcursion = event.snapTo === 'hidden' ? state.armedExcursion : null;
      if (!event.willMove) {
        // A zero-pixel snap is NOT motion: it produces no settle fact, so an
        // episode here could only ever be ended by the deadline.
        return idle({ ...state, armedExcursion }, false);
      }
      const started: TrackMotionEpisode = {
        episodeId: state.nextEpisodeId,
        kind: event.snapTo === 'hidden' ? 'excursion' : 'flight',
        snapTarget: event.snapTo === 'hidden' ? null : event.snapTo,
        settleToken: event.settleToken,
        startedAtMs: event.atMs,
      };
      return {
        state: {
          episode: started,
          armedExcursion,
          nextEpisodeId: state.nextEpisodeId + 1,
        },
        accepted: true,
        started,
        // A superseded episode ends WITHOUT a rest fact — its settle token is
        // abandoned exactly as the old ref-overwrite abandoned it.
        ended: state.episode,
        rest: false,
        hiddenEdge: false,
      };
    }
    case 'excursion-armed': {
      if (state.episode == null || state.episode.episodeId !== event.episodeId) {
        // A superseded command's late native outcome. Never arms an edge.
        return idle(state, false);
      }
      return idle(
        {
          ...state,
          armedExcursion: { episodeId: event.episodeId, generation: event.generation },
        },
        true
      );
    }
    case 'command-refused': {
      if (state.episode == null || state.episode.episodeId !== event.episodeId) {
        return idle(state, false);
      }
      // THE FINGER OWNS TAU: the command yielded to a live drag and is dead —
      // no machine target exists any more, but the sheet IS moving (the finger
      // is on it). The episode becomes the drag it lost to, keeping its settle
      // token and its deadline, so rest is still owed and still bounded.
      return idle(
        {
          ...state,
          episode: { ...state.episode, kind: 'drag', snapTarget: null },
          armedExcursion: null,
        },
        true
      );
    }
    case 'drag-begin': {
      if (state.episode != null) {
        // Same law as a refusal, reached from the other side.
        return idle(
          {
            ...state,
            episode: { ...state.episode, kind: 'drag', snapTarget: null },
            armedExcursion: null,
          },
          true
        );
      }
      const started: TrackMotionEpisode = {
        episodeId: state.nextEpisodeId,
        kind: 'drag',
        snapTarget: null,
        settleToken: null,
        startedAtMs: event.atMs,
      };
      return {
        state: { episode: started, armedExcursion: null, nextEpisodeId: state.nextEpisodeId + 1 },
        accepted: true,
        started,
        ended: null,
        rest: false,
        hiddenEdge: false,
      };
    }
    case 'settle': {
      // A settle is a rest fact whether or not this authority knew an episode
      // was running (a gesture the fence never armed still proves rest).
      return {
        state: { ...state, episode: null },
        accepted: true,
        started: null,
        ended: state.episode,
        rest: true,
        hiddenEdge: false,
      };
    }
    case 'excursion-edge': {
      const armed = state.armedExcursion;
      if (armed == null || event.generation == null || armed.generation !== event.generation) {
        // A stale excursion's edge: never a boundary, never a settle.
        return idle(state, false);
      }
      const endsEpisode = state.episode != null && state.episode.episodeId === armed.episodeId;
      return {
        state: {
          ...state,
          episode: endsEpisode ? null : state.episode,
          armedExcursion: null,
        },
        accepted: true,
        started: null,
        ended: endsEpisode ? state.episode : null,
        // A hide's rest is not a detent — THIS is its settle.
        rest: endsEpisode,
        hiddenEdge: true,
      };
    }
    case 'deadline-expired': {
      if (state.episode == null || state.episode.episodeId !== event.episodeId) {
        // The episode already ended (or was superseded): the deadline is moot.
        return idle(state, false);
      }
      return {
        state: { ...state, episode: null },
        accepted: true,
        started: null,
        ended: state.episode,
        // The never-strand backstop: a lost settle costs one beat, never a hang.
        rest: true,
        hiddenEdge: false,
      };
    }
    default: {
      const exhaustive: never = event;
      return idle(state, Boolean(exhaustive));
    }
  }
};

// ─── THE SELECTORS (the old fence's pure half, now the authority's readouts) ──

/** True iff NO proven motion fact is live. The ONE definition of "at rest" —
 *  the fence, the reveal seed, and any future consumer read THIS. */
export const trackMotionStateIsAtRest = (state: TrackMotionState): boolean => state.episode == null;

/** The live programmatic spring's destination (G-INTERRUPT / A5): flights only.
 *  A drag has no machine target and an excursion's target is not a detent. */
export const trackMotionStateInFlightSnapTarget = (
  state: TrackMotionState
): TrackSnapDetent | null => (state.episode?.kind === 'flight' ? state.episode.snapTarget : null);

// ─── THE STORE (module singleton — one authority per app) ─────────────────────

export type TrackMotionAuthority = {
  dispatch: (event: TrackMotionEvent) => TrackMotionTransition;
  getState: () => TrackMotionState;
  /** THE query every consumer asks instead of keeping a private ledger. */
  isAtRest: () => boolean;
  currentEpisode: () => TrackMotionEpisode | null;
  episodeId: () => number | null;
  inFlightSnapTarget: () => TrackSnapDetent | null;
  /** Every accepted transition, in dispatch order. */
  subscribe: (listener: (transition: TrackMotionTransition) => void) => () => void;
  /** Generation-VALIDATED screen-edge crossings only — the two hand-rolled
   *  NativeEventEmitter subscriptions collapse onto this. */
  subscribeHiddenEdge: (listener: (transition: TrackMotionTransition) => void) => () => void;
  reset: () => void;
};

const createTrackMotionAuthority = (): TrackMotionAuthority => {
  let state = initialTrackMotionState;
  const listeners = new Set<(transition: TrackMotionTransition) => void>();
  const edgeListeners = new Set<(transition: TrackMotionTransition) => void>();
  return {
    dispatch: (event) => {
      const transition = reduceTrackMotion(state, event);
      state = transition.state;
      if (transition.accepted) {
        [...listeners].forEach((listener) => listener(transition));
      }
      if (transition.hiddenEdge) {
        [...edgeListeners].forEach((listener) => listener(transition));
      }
      return transition;
    },
    getState: () => state,
    isAtRest: () => trackMotionStateIsAtRest(state),
    currentEpisode: () => state.episode,
    episodeId: () => state.episode?.episodeId ?? null,
    inFlightSnapTarget: () => trackMotionStateInFlightSnapTarget(state),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    subscribeHiddenEdge: (listener) => {
      edgeListeners.add(listener);
      return () => {
        edgeListeners.delete(listener);
      };
    },
    reset: () => {
      state = initialTrackMotionState;
    },
  };
};

const SHARED_TRACK_MOTION_AUTHORITY = createTrackMotionAuthority();

export const getTrackMotionAuthority = (): TrackMotionAuthority => SHARED_TRACK_MOTION_AUTHORITY;

/** Test seam only — the singleton's state must not leak between specs. */
export const resetTrackMotionAuthorityForTest = (): void => {
  SHARED_TRACK_MOTION_AUTHORITY.reset();
};

// ─── THE SNAP-RETRY DECISION (native red team FIX 3, pure) ────────────────────
// Lived in track-sheet-fence.ts, which this module absorbed. It belongs here:
// its two governing facts (a live finger, a native refusal) are motion facts,
// and both are episode-ending events above. 'done' covers arrival (τ within
// 1pt) and the attempts budget (F874: a budget that EXPIRES is deliberate).
export const SNAP_RETRY_MAX_ATTEMPTS = 12;

export type SnapRetryFacts = {
  /** The finger owns τ right now (physics.dragging). */
  dragging: boolean;
  /** Native answered the last issue with refused (a drag owned τ there). */
  refused: boolean;
  /** Issues so far, counting the one this verdict follows. */
  attempts: number;
  /** |τ − target| after the last issue. */
  distance: number;
};

export type SnapRetryDecision = 'abort-finger' | 'abort-refused' | 'retry' | 'done';

export const resolveSnapRetryDecision = (facts: SnapRetryFacts): SnapRetryDecision =>
  facts.dragging
    ? 'abort-finger'
    : facts.refused
      ? 'abort-refused'
      : facts.distance <= 1 || facts.attempts >= SNAP_RETRY_MAX_ATTEMPTS
        ? 'done'
        : 'retry';
