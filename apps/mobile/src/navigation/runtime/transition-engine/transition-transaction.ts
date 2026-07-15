/**
 * THE TRANSITION TRANSACTION (§Q redo, T0 — plans/search-lifecycle-phase0-requirements.md §Q,
 * phase-1 design §4).
 *
 * One reified object that IS a transition. Every stack mutation stages exactly one; every
 * lifecycle fact a transition has — its plan, its phase, its readiness join, its content
 * swap moment, its supersession — lives HERE and nowhere else. The six §Q smells this
 * kills by construction:
 *
 *  Q-1 no-reified-transition → this object.
 *  Q-2 search's parallel transaction family → dissolves into plans (T2-T5).
 *  Q-3 clock proliferation → ONE join with declared inputs; consumers read the txn.
 *  Q-4 golden-paths-as-exceptions → the zero-plane home dismiss is the DEGENERATE PLAN
 *      (empty join, immediate content, no motion hold) resolved like any other.
 *  Q-5 keyless singletons → the live transaction is keyed by txnId; stale writes are
 *      identifiable and barked, not silently absorbed.
 *  Q-6 choreography-as-implicit-time → phases are explicit edges with trace marks;
 *      ordering is data, not scheduling coincidence.
 *
 * Gate-reset-by-construction: a gate is a FIELD of the transaction. A new transaction is
 * a new object — there is no reset to forget, and a superseded transaction's gates are
 * unreachable (its id no longer matches).
 *
 * Pure core: no React, no Reanimated. The runtime holder at the bottom is the ONE
 * mutable slot (the live transaction), with subscribe semantics for consumers and a
 * single-line JSON trace on every edge ([TXN-TRACE], the harness's composite log).
 */

import type { OverlayKey } from '../../../overlays/types';

// ── Plan vocabulary (design §4.1; grows toward the full TransitionPlan as T1-T4 land) ──

export type TransitionContentPolicy =
  | { kind: 'swapImmediately' }
  | { kind: 'skeleton' }
  | { kind: 'holdOutgoingUntilSettle' }
  | { kind: 'freezeUntilSnap' };

export type TransitionJoinInput = 'paint' | 'chrome' | 'mapFrame' | 'camera' | 'boundary';

export type TransitionMutation = {
  kind: 'push' | 'closeActive' | 'popToEntry' | 'popToRoot' | 'setRoot' | 'preserve' | 'revise';
  targetSceneKey: OverlayKey;
  sourceSceneKey: OverlayKey | null;
  entryId: string | null;
};

export type TransitionTxnPlan = {
  content: TransitionContentPolicy;
  /** Declared readiness inputs the reveal JOIN waits for. EMPTY = degenerate (the
   *  zero-plane class): content commits with the mutation, no join phase runs. */
  joinInputs: readonly TransitionJoinInput[];
  /** Whether this transition moves the sheet (data for consumers; the snap runtime
   *  stays the sole physical motion source — O-9). */
  movesSheet: boolean;
};

export type TransitionTxnPhase =
  | 'staged' // minted; route mutation not yet committed
  | 'committed' // route mutation committed (press-up commit)
  | 'joining' // waiting on declared readiness inputs
  | 'revealed' // join complete — content visible-commit fired
  | 'settled' // motion + landing complete; terminal
  | 'superseded'; // replaced by a newer transaction; terminal

export type TransitionTxn = {
  readonly txnId: string;
  readonly mutation: TransitionMutation;
  readonly plan: TransitionTxnPlan;
  phase: TransitionTxnPhase;
  /** Pending join inputs (subset of plan.joinInputs; empties as marks land). */
  pendingJoinInputs: ReadonlySet<TransitionJoinInput>;
  /** Trace marks (performance.now ms) — the composite event log (ledger D5/L-1). */
  readonly marks: Partial<Record<`${TransitionTxnPhase}At` | 'stagedAt', number>>;
};

const TERMINAL_PHASES: ReadonlySet<TransitionTxnPhase> = new Set(['settled', 'superseded']);

// Legal phase edges. 'committed' holds until the join is SEALED (the arm point — the
// host's amendment window closes there); sealing a degenerate plan (no inputs)
// advances straight to 'revealed'.
const LEGAL_EDGES: Readonly<Record<TransitionTxnPhase, readonly TransitionTxnPhase[]>> = {
  staged: ['committed', 'superseded'],
  committed: ['joining', 'revealed', 'superseded'],
  joining: ['revealed', 'superseded'],
  revealed: ['settled', 'superseded'],
  settled: [],
  superseded: [],
};

const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

let nextTxnSeq = 1;

export type TransitionTxnContractViolation = {
  reason: 'illegal_phase_edge' | 'stale_txn_mark' | 'unknown_join_input' | 'duplicate_join_input';
  txnId: string;
  detail: string;
};

type ViolationSink = (violation: TransitionTxnContractViolation) => void;

let violationSink: ViolationSink | null = null;

/** Tests/dev wiring: capture contract violations (LOUD console.error by default). */
export const setTransitionTxnViolationSink = (sink: ViolationSink | null): void => {
  violationSink = sink;
};

const reportViolation = (violation: TransitionTxnContractViolation): void => {
  if (violationSink != null) {
    violationSink(violation);
    return;
  }
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.error(`[TXN-CONTRACT] ${violation.reason} ${violation.txnId}: ${violation.detail}`);
  }
};

const emitTrace = (txn: TransitionTxn, edge: string): void => {
  if (__DEV__) {
    // Single-line JSON — the composite trace the harness greps ([TXN-TRACE]).
    // eslint-disable-next-line no-console
    console.log(
      `[TXN-TRACE] ${JSON.stringify({
        t: Number(now().toFixed(1)),
        txnId: txn.txnId,
        edge,
        phase: txn.phase,
        kind: txn.mutation.kind,
        target: txn.mutation.targetSceneKey,
        pendingJoin: [...txn.pendingJoinInputs],
      })}`
    );
  }
};

// ── Pure constructors / transitions ────────────────────────────────────────────

export const createTransitionTxn = (
  mutation: TransitionMutation,
  plan: TransitionTxnPlan
): TransitionTxn => {
  const txn: TransitionTxn = {
    txnId: `txn-${nextTxnSeq++}`,
    mutation,
    plan,
    phase: 'staged',
    pendingJoinInputs: new Set(plan.joinInputs),
    marks: { stagedAt: now() },
  };
  return txn;
};

const advance = (txn: TransitionTxn, nextPhase: TransitionTxnPhase): boolean => {
  if (!LEGAL_EDGES[txn.phase].includes(nextPhase)) {
    reportViolation({
      reason: 'illegal_phase_edge',
      txnId: txn.txnId,
      detail: `${txn.phase} -> ${nextPhase}`,
    });
    return false;
  }
  txn.phase = nextPhase;
  (txn.marks as Record<string, number>)[`${nextPhase}At`] = now();
  emitTrace(txn, nextPhase);
  return true;
};

/** The press-up commit: the route mutation landed. The txn HOLDS at 'committed' until
 *  sealed — the PF dispatch (and with it the host's arm-time amendment) is deferred
 *  past the controller's tail, so the join set is not authoritative yet. */
export const commitTransitionTxn = (txn: TransitionTxn): void => {
  advance(txn, 'committed');
};

/** THE SEAL (the arm point): the amendment window closes; the authoritative join set
 *  decides the path — degenerate (no inputs) reveals immediately (Q-4: the zero-plane
 *  class as an output), else the join opens. Idempotent per txn (a second seal no-ops
 *  once past 'committed'). */
export const sealTransitionTxnJoin = (txn: TransitionTxn): void => {
  if (txn.phase !== 'committed') {
    return;
  }
  if (txn.pendingJoinInputs.size === 0) {
    advance(txn, 'revealed');
    return;
  }
  advance(txn, 'joining');
};

/** A declared readiness input landed. Reveal fires when the LAST one lands. */
export const markTransitionJoinInput = (txn: TransitionTxn, input: TransitionJoinInput): void => {
  if (TERMINAL_PHASES.has(txn.phase)) {
    reportViolation({
      reason: 'stale_txn_mark',
      txnId: txn.txnId,
      detail: `join input '${input}' after ${txn.phase}`,
    });
    return;
  }
  if (!txn.plan.joinInputs.includes(input)) {
    reportViolation({
      reason: 'unknown_join_input',
      txnId: txn.txnId,
      detail: `'${input}' not in declared [${txn.plan.joinInputs.join(',')}]`,
    });
    return;
  }
  if (!txn.pendingJoinInputs.has(input)) {
    reportViolation({
      reason: 'duplicate_join_input',
      txnId: txn.txnId,
      detail: `'${input}' already marked`,
    });
    return;
  }
  const nextPending = new Set(txn.pendingJoinInputs);
  nextPending.delete(input);
  txn.pendingJoinInputs = nextPending;
  emitTrace(txn, `join:${input}`);
  if (txn.phase === 'joining' && nextPending.size === 0) {
    advance(txn, 'revealed');
  }
};

export const settleTransitionTxn = (txn: TransitionTxn): void => {
  advance(txn, 'settled');
};

const supersedeTransitionTxn = (txn: TransitionTxn): void => {
  if (!TERMINAL_PHASES.has(txn.phase)) {
    txn.phase = 'superseded';
    (txn.marks as Record<string, number>).supersededAt = now();
    emitTrace(txn, 'superseded');
  }
};

// ── The runtime holder: ONE live transaction (Q-5: keyed, not ambient) ─────────

type Listener = () => void;
const listeners = new Set<Listener>();
let liveTxn: TransitionTxn | null = null;

/** Stage a new transaction. SUPERSEDES the live one (the single arbitration point —
 *  design §4.6): its gates become unreachable, its late marks bark as stale. */
export const stageTransitionTxn = (
  mutation: TransitionMutation,
  plan: TransitionTxnPlan
): TransitionTxn => {
  if (liveTxn != null) {
    supersedeTransitionTxn(liveTxn);
  }
  liveTxn = createTransitionTxn(mutation, plan);
  emitTrace(liveTxn, 'staged');
  listeners.forEach((listener) => listener());
  return liveTxn;
};

export const getLiveTransitionTxn = (): TransitionTxn | null => liveTxn;

/** Mark helpers addressed BY ID — a stale id is a loud no-op, never a silent write
 *  onto the wrong transaction (the boundaryGate leak class, structurally dead). */
export const withLiveTransitionTxn = (
  txnId: string,
  apply: (txn: TransitionTxn) => void
): boolean => {
  if (liveTxn == null || liveTxn.txnId !== txnId) {
    reportViolation({
      reason: 'stale_txn_mark',
      txnId,
      detail: `live is ${liveTxn?.txnId ?? 'none'}`,
    });
    return false;
  }
  apply(liveTxn);
  listeners.forEach((listener) => listener());
  return true;
};

/**
 * T1c: THE ARM-TIME AMENDMENT (the K-2 re-plan class, sanctioned and singular): the
 * scene-stack host — the one place that knows cold-vs-warm and hold-vs-flip — declares
 * the AUTHORITATIVE join set when it arms the transition's presentation. Legal only
 * before any input has landed (staged/committed/joining with a full pending set);
 * later amendment is a loud violation. mapFrame declared at stage time survives
 * (only the controller knows the readiness link).
 */
export const amendTransitionTxnJoinInputs = (inputs: readonly TransitionJoinInput[]): boolean => {
  const live = liveTxn;
  if (live == null) {
    return false;
  }
  if (live.phase !== 'staged' && live.phase !== 'committed') {
    reportViolation({
      reason: 'illegal_phase_edge',
      txnId: live.txnId,
      detail: `amend in ${live.phase} (amendment window = staged|committed, pre-seal)`,
    });
    return false;
  }
  const preserved = live.plan.joinInputs.includes('mapFrame') ? (['mapFrame'] as const) : [];
  const nextInputs = [...new Set([...inputs, ...preserved])];
  (live.plan as { joinInputs: readonly TransitionJoinInput[] }).joinInputs = nextInputs;
  live.pendingJoinInputs = new Set(nextInputs);
  emitTrace(live, 'amended');
  listeners.forEach((listener) => listener());
  return true;
};

/**
 * T1b: ambient readiness sources OFFER inputs; the live transaction consumes the ones
 * its plan DECLARED and ignores the rest (a paint ack during a no-join transition is
 * normal life, not a violation). Returns true when the offer was consumed.
 */
export const offerTransitionJoinInput = (input: TransitionJoinInput): boolean => {
  const live = liveTxn;
  if (
    live == null ||
    (live.phase !== 'joining' && live.phase !== 'committed') ||
    !live.plan.joinInputs.includes(input) ||
    !live.pendingJoinInputs.has(input)
  ) {
    return false;
  }
  markTransitionJoinInput(live, input);
  listeners.forEach((listener) => listener());
  return true;
};

/** Holder-level seal for the ARMING consumer (the scene-stack host). */
export const sealLiveTransitionTxnJoin = (): void => {
  if (liveTxn != null) {
    sealTransitionTxnJoin(liveTxn);
    listeners.forEach((listener) => listener());
  }
};

export const subscribeTransitionTxn = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Test-only: reset the holder between specs. */
export const resetTransitionTxnHolderForTest = (): void => {
  liveTxn = null;
  listeners.clear();
};
