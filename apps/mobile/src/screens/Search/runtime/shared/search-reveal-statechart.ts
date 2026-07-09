// The REVEAL STATECHART — the one sequenced thing in the desired-state architecture.
// Chartered in plans/search-desired-state-architecture.md §5.
//
// Small, closed, subordinate: the reconciler eats ALL source/interleaving combinatorics
// upstream (trigger sources write the desired tuple; they never talk to this machine).
// This machine owns only the genuinely ordered choreography of one reveal:
//
//   idle → covering → covered → arming → revealing → idle
//
// Inputs are ONLY: the desired≠presented edge (a new generation), world-ready from the
// resolver, and native acks. It is preemptible back to `covering` by a new generation at
// ANY state. It is a PURE function (state, event) → (state, effects[]); the host executes
// effects (native calls, cover mounts) and feeds acks back. Every illegal transition is a
// LOUD contract effect — never a silent drop. Watchdogs may measure; nothing here has a
// timer.
//
// Choreography rules encoded structurally:
// - Covering starts at the tuple write: fade-out + collision-off effects are emitted on
//   entry to `covering` (collision at fade START — the declared min-dwell lives in the
//   native layer as a choreography constant, not here).
// - Covered-episode monotonicity: a new generation while covering/covered/arming/revealing
//   EXTENDS the episode (re-covering is idempotent; no second fade-out effect while the
//   map is already dark).
// - A→B→A reversal: if the desired generation becomes equal to the PRESENTED world while
//   we are covering (fade-out mid-ramp) and no resolve is needed, the machine emits a
//   REVERSAL (fade back in from current opacity, collision back on) instead of a reveal.
// - Arming = construct under cover (multi-tick); the joint is a VISIBILITY FLIP: the
//   `open_joint` effect is O(1) — cards + strip + pin fade-in start on the same tick.
// - Readiness is a DATA fact: `world_ready` comes from the resolver/world store (prepared
//   rows committed + coverage terminal), never from render/layout.

export type RevealPhase =
  | { phase: 'idle'; presentedWorldId: string | null }
  | { phase: 'covering'; presentedWorldId: string | null; generation: number }
  | { phase: 'covered'; presentedWorldId: string | null; generation: number }
  | {
      phase: 'arming';
      presentedWorldId: string | null;
      generation: number;
      armingWorldId: string;
    }
  | {
      phase: 'revealing';
      presentedWorldId: string | null;
      generation: number;
      revealingWorldId: string;
    };

export type RevealEvent =
  /** The reconciler observed desired ≠ presented (a NEW generation of desire). If the
   *  desired world is already presented (A→B→A), it sends `desire_matches_presented`. */
  | { type: 'desire_changed'; generation: number }
  | { type: 'desire_matches_presented'; generation: number }
  /** Native acked that the fade-out reached the dark floor (cover fully owns the map). */
  | { type: 'fade_out_acked'; generation: number }
  /** The resolver committed a ready world for the CURRENT desired tuple. */
  | { type: 'world_ready'; generation: number; worldId: string }
  /** Native acked that the world's sources are applied + mounted hidden under cover. */
  | { type: 'armed_acked'; generation: number; worldId: string }
  /** Native acked the joint ramp started (mach-clock timestamped). */
  | { type: 'reveal_acked'; generation: number; worldId: string };

export type RevealEffect =
  /** Start map fade-out NOW + flip our items' basemap-collision membership OFF. */
  | { effect: 'begin_cover'; generation: number }
  /** A→B→A: fade back in from current opacity, collision back ON. Presented is unchanged. */
  | { effect: 'reverse_to_presented'; generation: number; presentedWorldId: string }
  /** Apply the world's substrates under cover (multi-tick construction, mounted hidden). */
  | { effect: 'arm_world'; generation: number; worldId: string }
  /** The atomic joint: O(1) visibility flip — cards + strip + pin fade-in same tick. */
  | { effect: 'open_joint'; generation: number; worldId: string }
  /** presented ← worldId (the reconciler updates its presented value from this). */
  | { effect: 'commit_presented'; worldId: string }
  /** LOUD contract: an event arrived that is illegal in this state/generation. Never
   *  swallowed; carries the full snapshot for the append-only trace. */
  | {
      effect: 'contract_violation';
      code:
        | 'stale_generation_event'
        | 'world_ready_without_cover'
        | 'ack_for_unknown_world'
        | 'reveal_ack_out_of_phase';
      state: RevealPhase;
      event: RevealEvent;
    };

export type RevealTransition = { state: RevealPhase; effects: RevealEffect[] };

export const INITIAL_REVEAL_PHASE: RevealPhase = { phase: 'idle', presentedWorldId: null };

const stale = (state: RevealPhase, event: RevealEvent): RevealTransition => ({
  state,
  effects: [{ effect: 'contract_violation', code: 'stale_generation_event', state, event }],
});

/** The pure transition function. Total over (state.phase × event.type). */
export const transitionReveal = (state: RevealPhase, event: RevealEvent): RevealTransition => {
  // A NEW GENERATION preempts every phase identically: extend/enter the covered episode.
  if (event.type === 'desire_changed') {
    const alreadyDark =
      state.phase === 'covered' || state.phase === 'arming' || state.phase === 'revealing';
    return {
      state: {
        phase: 'covering',
        presentedWorldId: state.presentedWorldId,
        generation: event.generation,
      },
      // Covered-episode monotonicity: only emit the fade-out when the map isn't already
      // dark; re-covering from covered/arming/revealing is a generation retarget only.
      effects: alreadyDark ? [] : [{ effect: 'begin_cover', generation: event.generation }],
    };
  }

  // A→B→A: desire returned to the presented world.
  if (event.type === 'desire_matches_presented') {
    if (state.phase === 'idle') {
      return { state, effects: [] };
    }
    if (state.presentedWorldId == null) {
      // Nothing is presented — there is nothing to reverse to; treat as a normal
      // generation change (the resolver will deliver the world and we reveal it).
      return {
        state: {
          phase: state.phase === 'covering' ? state.phase : 'covering',
          presentedWorldId: null,
          generation: event.generation,
        } as RevealPhase,
        effects: [],
      };
    }
    return {
      state: { phase: 'idle', presentedWorldId: state.presentedWorldId },
      effects: [
        {
          effect: 'reverse_to_presented',
          generation: event.generation,
          presentedWorldId: state.presentedWorldId,
        },
      ],
    };
  }

  // Everything below is generation-scoped: stale-generation events are LOUD no-ops.
  const currentGeneration =
    state.phase === 'idle'
      ? null
      : (state as Extract<RevealPhase, { generation: number }>).generation;
  if (currentGeneration == null || event.generation !== currentGeneration) {
    return stale(state, event);
  }

  switch (event.type) {
    case 'fade_out_acked': {
      if (state.phase !== 'covering') {
        // Idempotent under monotonicity: a late fade ack while already covered/arming is
        // expected during episode extension — absorb silently only when we are PAST
        // covering in the SAME generation.
        if (state.phase === 'covered' || state.phase === 'arming' || state.phase === 'revealing') {
          return { state, effects: [] };
        }
        return stale(state, event);
      }
      return {
        state: {
          phase: 'covered',
          presentedWorldId: state.presentedWorldId,
          generation: state.generation,
        },
        effects: [],
      };
    }
    case 'world_ready': {
      if (state.phase === 'covered') {
        return {
          state: {
            phase: 'arming',
            presentedWorldId: state.presentedWorldId,
            generation: state.generation,
            armingWorldId: event.worldId,
          },
          effects: [{ effect: 'arm_world', generation: state.generation, worldId: event.worldId }],
        };
      }
      if (state.phase === 'covering') {
        // World resolved before the fade-out acked (cache hits do this): arming may begin
        // under the still-darkening cover — construction is invisible either way.
        return {
          state: {
            phase: 'arming',
            presentedWorldId: state.presentedWorldId,
            generation: state.generation,
            armingWorldId: event.worldId,
          },
          effects: [{ effect: 'arm_world', generation: state.generation, worldId: event.worldId }],
        };
      }
      if (state.phase === 'arming' && state.armingWorldId === event.worldId) {
        return { state, effects: [] };
      }
      if (state.phase === 'arming') {
        // The world for THIS generation re-resolved to a different id (e.g. revalidation
        // completed): re-arm to the newer world; same generation, same cover.
        return {
          state: { ...state, armingWorldId: event.worldId },
          effects: [{ effect: 'arm_world', generation: state.generation, worldId: event.worldId }],
        };
      }
      return {
        state,
        effects: [
          { effect: 'contract_violation', code: 'world_ready_without_cover', state, event },
        ],
      };
    }
    case 'armed_acked': {
      if (state.phase !== 'arming' || state.armingWorldId !== event.worldId) {
        return {
          state,
          effects: [{ effect: 'contract_violation', code: 'ack_for_unknown_world', state, event }],
        };
      }
      return {
        state: {
          phase: 'revealing',
          presentedWorldId: state.presentedWorldId,
          generation: state.generation,
          revealingWorldId: state.armingWorldId,
        },
        effects: [
          { effect: 'open_joint', generation: state.generation, worldId: state.armingWorldId },
        ],
      };
    }
    case 'reveal_acked': {
      if (state.phase !== 'revealing' || state.revealingWorldId !== event.worldId) {
        return {
          state,
          effects: [
            { effect: 'contract_violation', code: 'reveal_ack_out_of_phase', state, event },
          ],
        };
      }
      return {
        state: { phase: 'idle', presentedWorldId: state.revealingWorldId },
        effects: [{ effect: 'commit_presented', worldId: state.revealingWorldId }],
      };
    }
  }
};
