import {
  commitTransitionTxn,
  createTransitionTxn,
  getLiveTransitionTxn,
  markTransitionJoinInput,
  resetTransitionTxnHolderForTest,
  setTransitionTxnViolationSink,
  settleTransitionTxn,
  stageTransitionTxn,
  withLiveTransitionTxn,
  type TransitionTxnContractViolation,
} from './transition-transaction';

const MUTATION = {
  kind: 'push' as const,
  targetSceneKey: 'listDetail' as const,
  sourceSceneKey: 'bookmarks' as const,
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
    setTransitionTxnViolationSink(null);
  });

  it('runs the full joined lifecycle: staged → committed → joining → revealed → settled', () => {
    const txn = createTransitionTxn(MUTATION, JOINED_PLAN);
    expect(txn.phase).toBe('staged');
    commitTransitionTxn(txn);
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

  it('Q-4: the DEGENERATE plan (no join inputs) reveals at commit — the zero-plane class is an output, not an exception', () => {
    const txn = createTransitionTxn(MUTATION, DEGENERATE_PLAN);
    commitTransitionTxn(txn);
    expect(txn.phase).toBe('revealed');
    expect(violations).toHaveLength(0);
  });

  it('barks on an undeclared join input and does NOT advance', () => {
    const txn = createTransitionTxn(MUTATION, DEGENERATE_PLAN);
    commitTransitionTxn(txn);
    markTransitionJoinInput(txn, 'camera');
    expect(violations.map((violation) => violation.reason)).toContain('unknown_join_input');
    expect(txn.phase).toBe('revealed');
  });

  it('barks on a duplicate join input (each input lands exactly once)', () => {
    const txn = createTransitionTxn(MUTATION, JOINED_PLAN);
    commitTransitionTxn(txn);
    markTransitionJoinInput(txn, 'paint');
    markTransitionJoinInput(txn, 'paint');
    expect(violations.map((violation) => violation.reason)).toContain('duplicate_join_input');
    expect(txn.phase).toBe('joining');
  });

  it('barks on an illegal phase edge (settle before reveal) and refuses it', () => {
    const txn = createTransitionTxn(MUTATION, JOINED_PLAN);
    commitTransitionTxn(txn);
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
    settleTransitionTxn(txn);
    commitTransitionTxn(txn);
    expect(txn.phase).toBe('settled');
    expect(violations.map((violation) => violation.reason)).toContain('illegal_phase_edge');
  });

  // RED backstop (testing methodology): a lifecycle WITHOUT supersession-by-staging —
  // the old world's shape — provably leaks the prior transaction's state.
  it('RED backstop: without staging-supersession, two "live" transitions coexist (the old disease)', () => {
    const first = createTransitionTxn(MUTATION, JOINED_PLAN);
    const second = createTransitionTxn(MUTATION, JOINED_PLAN);
    commitTransitionTxn(first);
    commitTransitionTxn(second);
    // Both accept marks — the ambiguity the HOLDER exists to kill:
    markTransitionJoinInput(first, 'paint');
    markTransitionJoinInput(second, 'paint');
    expect(first.phase).toBe('joining');
    expect(second.phase).toBe('joining'); // two clocks, no owner — the §Q-1 smell
  });
});
