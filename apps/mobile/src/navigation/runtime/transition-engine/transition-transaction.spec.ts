import {
  amendTransitionTxnJoinInputs,
  commitTransitionTxn,
  createTransitionTxn,
  getLiveTransitionTxn,
  markTransitionJoinInput,
  offerTransitionJoinInput,
  resetTransitionTxnHolderForTest,
  sealTransitionTxnJoin,
  setTransitionTxnViolationSink,
  settleTransitionTxn,
  stageTransitionTxn,
  withLiveTransitionTxn,
  type TransitionTxnContractViolation,
} from './transition-transaction';

const MUTATION = {
  kind: 'push' as const,
  targetSceneKey: 'listDetail' as const,
  sourceSceneKey: 'lists' as const,
  entryId: null,
};

const JOINED_PLAN = {
  content: { kind: 'skeleton' as const },
  joinInputs: ['paint', 'chrome', 'mapFrame'] as const,
  movesSheet: true,
};

const DEGENERATE_PLAN = {
  content: { kind: 'swapImmediately' as const },
  joinInputs: [] as const,
  movesSheet: false,
};

describe('TransitionTransaction (§Q redo, T0)', () => {
  let violations: TransitionTxnContractViolation[];

  beforeEach(() => {
    violations = [];
    setTransitionTxnViolationSink((violation) => violations.push(violation));
    resetTransitionTxnHolderForTest();
  });

  afterEach(() => {
    // Disarm anything this test left mid-'joining' BEFORE teardown (F830) —
    // a watchdog firing afterwards logs into a dead console and, in a worker,
    // used to be swallowed entirely while the run reported green.
    resetTransitionTxnHolderForTest();
    setTransitionTxnViolationSink(null);
  });

  it('runs the full joined lifecycle: staged → committed → (seal) → joining → revealed → settled', () => {
    const txn = createTransitionTxn(MUTATION, JOINED_PLAN);
    expect(txn.phase).toBe('staged');
    commitTransitionTxn(txn);
    expect(txn.phase).toBe('committed'); // holds for the arm-time amendment window
    sealTransitionTxnJoin(txn);
    expect(txn.phase).toBe('joining');
    markTransitionJoinInput(txn, 'paint');
    markTransitionJoinInput(txn, 'chrome');
    expect(txn.phase).toBe('joining'); // reveal waits for the LAST input
    markTransitionJoinInput(txn, 'mapFrame');
    expect(txn.phase).toBe('revealed');
    settleTransitionTxn(txn);
    expect(txn.phase).toBe('settled');
    expect(violations).toHaveLength(0);
  });

  it('Q-4: the DEGENERATE plan (no join inputs) reveals at SEAL — the zero-plane class is an output, not an exception', () => {
    const txn = createTransitionTxn(MUTATION, DEGENERATE_PLAN);
    commitTransitionTxn(txn);
    expect(txn.phase).toBe('committed');
    sealTransitionTxnJoin(txn);
    expect(txn.phase).toBe('revealed');
    expect(violations).toHaveLength(0);
  });

  it('barks on an undeclared join input and does NOT advance', () => {
    const txn = createTransitionTxn(MUTATION, DEGENERATE_PLAN);
    commitTransitionTxn(txn);
    sealTransitionTxnJoin(txn);
    markTransitionJoinInput(txn, 'camera');
    expect(violations.map((violation) => violation.reason)).toContain('unknown_join_input');
    expect(txn.phase).toBe('revealed');
  });

  it('barks on a duplicate join input (each input lands exactly once)', () => {
    const txn = createTransitionTxn(MUTATION, JOINED_PLAN);
    commitTransitionTxn(txn);
    sealTransitionTxnJoin(txn);
    markTransitionJoinInput(txn, 'paint');
    markTransitionJoinInput(txn, 'paint');
    expect(violations.map((violation) => violation.reason)).toContain('duplicate_join_input');
    expect(txn.phase).toBe('joining');
  });

  it('barks on an illegal phase edge (settle before reveal) and refuses it', () => {
    const txn = createTransitionTxn(MUTATION, JOINED_PLAN);
    commitTransitionTxn(txn);
    sealTransitionTxnJoin(txn);
    settleTransitionTxn(txn);
    expect(violations.map((violation) => violation.reason)).toContain('illegal_phase_edge');
    expect(txn.phase).toBe('joining');
  });

  it('SUPERSESSION: staging a new txn supersedes the live one; its late marks bark as stale (the boundaryGate leak class, structurally dead)', () => {
    const first = stageTransitionTxn(MUTATION, JOINED_PLAN);
    commitTransitionTxn(first);
    const second = stageTransitionTxn(MUTATION, DEGENERATE_PLAN);
    expect(first.phase).toBe('superseded');
    expect(getLiveTransitionTxn()?.txnId).toBe(second.txnId);
    // A consumer still holding the FIRST txn's id cannot write through the holder:
    const applied = withLiveTransitionTxn(first.txnId, () => {
      throw new Error('must not run');
    });
    expect(applied).toBe(false);
    expect(violations.map((violation) => violation.reason)).toContain('stale_txn_mark');
    // Nor can direct marks on the superseded object advance it:
    markTransitionJoinInput(first, 'paint');
    expect(first.phase).toBe('superseded');
  });

  it('a settled txn is terminal — no further edges', () => {
    const txn = createTransitionTxn(MUTATION, DEGENERATE_PLAN);
    commitTransitionTxn(txn);
    sealTransitionTxnJoin(txn);
    settleTransitionTxn(txn);
    commitTransitionTxn(txn);
    expect(txn.phase).toBe('settled');
    expect(violations.map((violation) => violation.reason)).toContain('illegal_phase_edge');
  });

  // RED backstop (testing methodology): a lifecycle WITHOUT supersession-by-staging —
  // the old world's shape — provably leaks the prior transaction's state.
  it('T5 join liveness: a joining txn whose offers never arrive force-reveals after the degrade window WITH the loud violation', () => {
    jest.useFakeTimers();
    const txn = createTransitionTxn(MUTATION, JOINED_PLAN);
    commitTransitionTxn(txn);
    sealTransitionTxnJoin(txn);
    expect(txn.phase).toBe('joining');
    jest.advanceTimersByTime(700);
    expect(txn.phase).toBe('revealed');
    expect(violations.map((v) => v.reason)).toContain('join_liveness_degrade');
    expect(violations.find((v) => v.reason === 'join_liveness_degrade')?.detail).toContain(
      'mapFrame'
    );
    jest.useRealTimers();
  });

  it('T5 join liveness: a healthy join never fires the watchdog; a freeze plan (user-paced boundary) is exempt', () => {
    jest.useFakeTimers();
    const healthy = createTransitionTxn(MUTATION, JOINED_PLAN);
    commitTransitionTxn(healthy);
    sealTransitionTxnJoin(healthy);
    markTransitionJoinInput(healthy, 'paint');
    markTransitionJoinInput(healthy, 'chrome');
    markTransitionJoinInput(healthy, 'mapFrame');
    expect(healthy.phase).toBe('revealed');
    const freeze = createTransitionTxn(MUTATION, {
      content: { kind: 'freezeUntilSnap' as const },
      joinInputs: ['boundary'] as const,
      movesSheet: true,
    });
    commitTransitionTxn(freeze);
    sealTransitionTxnJoin(freeze);
    expect(freeze.phase).toBe('joining');
    jest.advanceTimersByTime(5000);
    expect(freeze.phase).toBe('joining'); // a held drag may outlast any timeout
    expect(violations).toHaveLength(0);
    jest.useRealTimers();
  });

  it('RED backstop: without staging-supersession, two "live" transitions coexist (the old disease)', () => {
    const first = createTransitionTxn(MUTATION, JOINED_PLAN);
    const second = createTransitionTxn(MUTATION, JOINED_PLAN);
    commitTransitionTxn(first);
    sealTransitionTxnJoin(first);
    commitTransitionTxn(second);
    sealTransitionTxnJoin(second);
    // Both accept marks — the ambiguity the HOLDER exists to kill:
    markTransitionJoinInput(first, 'paint');
    markTransitionJoinInput(second, 'paint');
    expect(first.phase).toBe('joining');
    expect(second.phase).toBe('joining'); // two clocks, no owner — the §Q-1 smell
  });
  // ── F901/F902: THE ARM WINDOW ────────────────────────────────────────────────
  //
  // The scene-stack host arms every page switch from BottomSheetSceneStackHost's
  // presentation-frame subscription: amend({paint,chrome}) -> seal -> (warm legs only)
  // offer('paint'). The stager mints the txn BEFORE the route apply and commits it AFTER
  // the state flush, so that whole arm runs while the txn is still 'staged'.
  //
  // RED RECIPE (proven against the pre-fix engine): revert any one of the three changes in
  // transition-transaction.ts — (a) sealTransitionTxnJoin's `if (phase === 'staged')`
  // remembering branch, (b) commitTransitionTxn's replay of joinSealRequested, or
  // (c) offerTransitionJoinInput accepting 'staged' — and the warm-arm test below fails
  // with phase 'committed' (join never opened) or a still-pending 'paint'. On the old
  // engine ALL THREE were absent: seal returned silently, the offer returned false, and the
  // txn sat with a pending 'paint' that a warm leg never re-fires until the 600ms
  // join-liveness watchdog force-revealed it. Every warm switch, silently, forever.
  describe('the arm window (F901/F902)', () => {
    const armFromHost = ({ warm }: { warm: boolean }) => {
      const txn = stageTransitionTxn(MUTATION, {
        content: { kind: 'holdOutgoingUntilSettle' as const },
        joinInputs: ['paint', 'chrome'] as const,
        movesSheet: true,
      });
      amendTransitionTxnJoinInputs(['paint', 'chrome']);
      sealTransitionTxnJoin(txn);
      if (warm) {
        offerTransitionJoinInput('paint');
      }
      return txn;
    };

    it('a seal that arrives while staged is REMEMBERED and applied at commit — never dropped', () => {
      const txn = armFromHost({ warm: false });
      expect(txn.phase).toBe('staged'); // 'joining' is unreachable from 'staged'
      commitTransitionTxn(txn);
      expect(txn.phase).toBe('joining'); // the arm took effect the instant the commit landed
      expect(violations).toHaveLength(0);
    });

    it('warm-evidence paint offered at the arm point is CONSUMED, so the join needs no watchdog', () => {
      const txn = armFromHost({ warm: true });
      expect([...txn.pendingJoinInputs]).toEqual(['chrome']); // paint landed while staged
      commitTransitionTxn(txn);
      expect(txn.phase).toBe('joining');
      offerTransitionJoinInput('chrome');
      expect(txn.phase).toBe('revealed'); // revealed on real evidence, not a 600ms degrade
      expect(violations).toHaveLength(0);
    });

    it('an amendment NEVER resurrects a landed input, and barks when it arrives late', () => {
      const txn = stageTransitionTxn(MUTATION, {
        content: { kind: 'holdOutgoingUntilSettle' as const },
        joinInputs: ['paint', 'chrome'] as const,
        movesSheet: true,
      });
      commitTransitionTxn(txn);
      expect(offerTransitionJoinInput('paint')).toBe(true);
      expect([...txn.pendingJoinInputs]).toEqual(['chrome']);

      // The old engine did `pendingJoinInputs = new Set(nextInputs)` unconditionally here,
      // un-landing 'paint'. A warm leg never re-fires it -> guaranteed watchdog degrade.
      amendTransitionTxnJoinInputs(['paint', 'chrome']);
      expect([...txn.pendingJoinInputs]).toEqual(['chrome']);
      expect(violations.map((violation) => violation.reason)).toEqual(['late_join_amendment']);
      expect(violations[0]!.detail).toContain('landed [paint]');

      sealTransitionTxnJoin(txn);
      offerTransitionJoinInput('chrome');
      expect(txn.phase).toBe('revealed');
    });

    it('a SECOND amendment of the same txn barks (the arm is legal exactly once)', () => {
      stageTransitionTxn(MUTATION, {
        content: { kind: 'holdOutgoingUntilSettle' as const },
        joinInputs: ['paint', 'chrome'] as const,
        movesSheet: true,
      });
      amendTransitionTxnJoinInputs(['paint', 'chrome']);
      expect(violations).toHaveLength(0);
      amendTransitionTxnJoinInputs(['paint', 'chrome']);
      expect(violations.map((violation) => violation.reason)).toEqual(['late_join_amendment']);
      expect(violations[0]!.detail).toContain('re-amend');
    });

    it('an offer the plan is still waiting on BARKS when the phase cannot consume it', () => {
      const txn = stageTransitionTxn(MUTATION, {
        content: { kind: 'holdOutgoingUntilSettle' as const },
        joinInputs: ['paint', 'chrome'] as const,
        movesSheet: true,
      });
      commitTransitionTxn(txn);
      sealTransitionTxnJoin(txn);
      offerTransitionJoinInput('paint');
      offerTransitionJoinInput('chrome');
      expect(txn.phase).toBe('revealed');
      settleTransitionTxn(txn);

      // 'chrome' is no longer pending, so this is normal life, not a violation:
      expect(offerTransitionJoinInput('chrome')).toBe(false);
      expect(violations).toHaveLength(0);
    });

    it('a degenerate plan armed from staged still reveals at commit, with no join', () => {
      const txn = stageTransitionTxn(MUTATION, DEGENERATE_PLAN);
      sealTransitionTxnJoin(txn);
      expect(txn.phase).toBe('staged');
      commitTransitionTxn(txn);
      expect(txn.phase).toBe('revealed');
      expect(violations).toHaveLength(0);
    });
  });
});
