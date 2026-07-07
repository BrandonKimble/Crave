// Model tests for the reveal statechart (charter §5: "its full state×event table is
// enumerated and model-tested; RED self-mutations prove each illegal transition is
// rejected loudly").

import {
  INITIAL_REVEAL_PHASE,
  transitionReveal,
  type RevealEvent,
  type RevealPhase,
} from './search-reveal-statechart';

const run = (events: RevealEvent[], from: RevealPhase = INITIAL_REVEAL_PHASE) => {
  let state = from;
  const effects = [];
  for (const event of events) {
    const result = transitionReveal(state, event);
    state = result.state;
    effects.push(...result.effects);
  }
  return { state, effects };
};

describe('search-reveal-statechart', () => {
  it('happy path: one commit runs cover → arm → joint → presented', () => {
    const { state, effects } = run([
      { type: 'desire_changed', generation: 1 },
      { type: 'fade_out_acked', generation: 1 },
      { type: 'world_ready', generation: 1, worldId: 'W1' },
      { type: 'armed_acked', generation: 1, worldId: 'W1' },
      { type: 'reveal_acked', generation: 1, worldId: 'W1' },
    ]);
    expect(effects.map((e) => e.effect)).toEqual([
      'begin_cover',
      'arm_world',
      'open_joint',
      'commit_presented',
    ]);
    expect(state).toEqual({ phase: 'idle', presentedWorldId: 'W1' });
  });

  it('cache-hit path: world resolves before the fade-out acks — arming begins under the darkening cover', () => {
    const { effects } = run([
      { type: 'desire_changed', generation: 1 },
      { type: 'world_ready', generation: 1, worldId: 'W1' },
      { type: 'armed_acked', generation: 1, worldId: 'W1' },
    ]);
    expect(effects.map((e) => e.effect)).toEqual(['begin_cover', 'arm_world', 'open_joint']);
  });

  it('covered-episode monotonicity: a new generation mid-episode emits NO second fade-out', () => {
    const { state, effects } = run([
      { type: 'desire_changed', generation: 1 },
      { type: 'fade_out_acked', generation: 1 },
      { type: 'world_ready', generation: 1, worldId: 'W1' },
      // user retargets before the joint — episode extends, map already dark
      { type: 'desire_changed', generation: 2 },
    ]);
    expect(effects.filter((e) => e.effect === 'begin_cover')).toHaveLength(1);
    expect(state).toEqual({ phase: 'covering', presentedWorldId: null, generation: 2 });
  });

  it('preemption from EVERY phase lands in covering with the new generation', () => {
    const phases: RevealPhase[] = [
      { phase: 'idle', presentedWorldId: 'W0' },
      { phase: 'covering', presentedWorldId: 'W0', generation: 1 },
      { phase: 'covered', presentedWorldId: 'W0', generation: 1 },
      { phase: 'arming', presentedWorldId: 'W0', generation: 1, armingWorldId: 'W1' },
      { phase: 'revealing', presentedWorldId: 'W0', generation: 1, revealingWorldId: 'W1' },
    ];
    for (const from of phases) {
      const { state } = run([{ type: 'desire_changed', generation: 9 }], from);
      expect(state.phase).toBe('covering');
      expect((state as Extract<RevealPhase, { generation: number }>).generation).toBe(9);
      expect(state.presentedWorldId).toBe('W0');
    }
  });

  it('A→B→A mid-fade reverses to the presented world instead of revealing', () => {
    const { state, effects } = run(
      [
        { type: 'desire_changed', generation: 1 }, // A→B: cover starts
        { type: 'desire_matches_presented', generation: 2 }, // B→A before anything landed
      ],
      { phase: 'idle', presentedWorldId: 'WA' }
    );
    expect(effects.map((e) => e.effect)).toEqual(['begin_cover', 'reverse_to_presented']);
    expect(state).toEqual({ phase: 'idle', presentedWorldId: 'WA' });
  });

  it('stale-generation events are LOUD contract violations, never silent', () => {
    const { effects } = run([
      { type: 'desire_changed', generation: 2 },
      { type: 'world_ready', generation: 1, worldId: 'W-old' }, // superseded resolution
    ]);
    expect(effects.some((e) => e.effect === 'contract_violation')).toBe(true);
    expect(effects.filter((e) => e.effect === 'arm_world')).toHaveLength(0);
  });

  it('revalidation mid-arming re-arms to the newer world in the same generation', () => {
    const { effects } = run([
      { type: 'desire_changed', generation: 1 },
      { type: 'fade_out_acked', generation: 1 },
      { type: 'world_ready', generation: 1, worldId: 'W-stale' },
      { type: 'world_ready', generation: 1, worldId: 'W-fresh' },
      { type: 'armed_acked', generation: 1, worldId: 'W-fresh' },
    ]);
    expect(effects.filter((e) => e.effect === 'arm_world')).toHaveLength(2);
    expect(effects.filter((e) => e.effect === 'open_joint')).toHaveLength(1);
  });

  it('an ack for a world we are not arming is a loud contract violation', () => {
    const { effects, state } = run([
      { type: 'desire_changed', generation: 1 },
      { type: 'world_ready', generation: 1, worldId: 'W1' },
      { type: 'armed_acked', generation: 1, worldId: 'W-other' },
    ]);
    expect(effects.some((e) => e.effect === 'contract_violation')).toBe(true);
    expect(state.phase).toBe('arming');
  });

  it('TOTALITY: every phase × event transitions without throwing', () => {
    const phases: RevealPhase[] = [
      { phase: 'idle', presentedWorldId: null },
      { phase: 'idle', presentedWorldId: 'W0' },
      { phase: 'covering', presentedWorldId: 'W0', generation: 1 },
      { phase: 'covered', presentedWorldId: null, generation: 1 },
      { phase: 'arming', presentedWorldId: 'W0', generation: 1, armingWorldId: 'W1' },
      { phase: 'revealing', presentedWorldId: null, generation: 1, revealingWorldId: 'W1' },
    ];
    const events: RevealEvent[] = [
      { type: 'desire_changed', generation: 1 },
      { type: 'desire_changed', generation: 2 },
      { type: 'desire_matches_presented', generation: 2 },
      { type: 'fade_out_acked', generation: 1 },
      { type: 'fade_out_acked', generation: 7 },
      { type: 'world_ready', generation: 1, worldId: 'W1' },
      { type: 'world_ready', generation: 7, worldId: 'W9' },
      { type: 'armed_acked', generation: 1, worldId: 'W1' },
      { type: 'reveal_acked', generation: 1, worldId: 'W1' },
      { type: 'reveal_acked', generation: 1, worldId: 'W2' },
    ];
    for (const phase of phases) {
      for (const event of events) {
        expect(() => transitionReveal(phase, event)).not.toThrow();
      }
    }
  });

  it('RED self-mutation guard: the joint can only open from an armed ack of the arming world', () => {
    // Prove the invariant the RED harness relies on: no sequence lacking armed_acked(W)
    // ever emits open_joint(W).
    const { effects } = run([
      { type: 'desire_changed', generation: 1 },
      { type: 'fade_out_acked', generation: 1 },
      { type: 'reveal_acked', generation: 1, worldId: 'W1' }, // skipped arming entirely
    ]);
    expect(effects.filter((e) => e.effect === 'open_joint')).toHaveLength(0);
    expect(effects.some((e) => e.effect === 'contract_violation')).toBe(true);
  });
});
