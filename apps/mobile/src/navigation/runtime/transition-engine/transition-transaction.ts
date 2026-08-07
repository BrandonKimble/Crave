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

export type TransitionJoinInput =
  | 'paint'
  | 'chrome'
  | 'mapFrame'
  | 'boundary'
  // Q-2: the sheet-motion readiness axis (the redraw family's sheetReady — "the sheet is
  // not physically moving for this transition"). Declared by in-place world revises whose
  // arm expects a reveal slide.
  | 'sheet';

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
  /** Join-liveness degrade window override (ms). PLAN DATA: a fade-paced world revise
   *  legitimately joins at native-ramp pace (~2s measured); the default fits
   *  machine-paced switch joins. The watchdog is a safety net either way. */
  joinLivenessMs?: number;
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
  /** Handle for the join-liveness watchdog (armed only while 'joining'), so
   *  leaving 'joining' DISARMS it instead of leaving a live timer behind. */
  joinLivenessTimer?: ReturnType<typeof setTimeout> | null;
  /** F902: a seal that arrived while still 'staged' (the host arms inside the staged
   *  window — see stageTransitionTxnForCommittedSwitch). 'joining' is not reachable
   *  from 'staged', so the seal is REMEMBERED here and applied the instant the commit
   *  lands, instead of being silently dropped. */
  joinSealRequested?: boolean;
  /** F901: the arm-time amendment is legal exactly ONCE. */
  joinAmended?: boolean;
};

/** The watchdog is a safety net for a stuck join; once the join is over it has
 *  nothing to watch. Leaving it armed kept a timer (and the whole txn) alive for
 *  its full window after every single transition — invisible in the app, and the
 *  reason the jest run force-killed a worker (F830).
 *
 *  F5405: the timer field is the ONE ledger of "is this txn's watchdog armed". A
 *  module-global `Set<TransitionTxn>` used to be maintained alongside it — two ledgers
 *  for one fact, kept in step by hand at four sites — and it existed for exactly one
 *  reason, stated in its own comment: the test reset had to disarm txns "the spec created
 *  directly", which "were never in the holder to begin with". Those txns existed because
 *  `createTransitionTxn` was exported. It is not, now: every transaction is minted through
 *  the holder, so every armed txn is either LIVE or superseded-and-disarmed, and the
 *  second ledger (with its desynchronisation hazard) is gone. */
const disarmJoinLivenessWatchdog = (txn: TransitionTxn): void => {
  if (txn.joinLivenessTimer != null) {
    clearTimeout(txn.joinLivenessTimer);
    txn.joinLivenessTimer = null;
  }
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
  reason:
    | 'illegal_phase_edge'
    | 'stale_txn_mark'
    | 'unknown_join_input'
    | 'duplicate_join_input'
    // F901: an arm-time amendment that arrived after an input had already landed, or a
    // SECOND amendment of the same txn. The amendment still applies (preserving the
    // landed marks) — the bark exists so the anomaly is attributable instead of silent.
    | 'late_join_amendment'
    // F902: a readiness offer for an input the live plan DECLARED and is still waiting
    // on, dropped because the txn's phase could not consume it. This used to be a silent
    // `return false` — the exact path that guaranteed a watchdog degrade.
    | 'dropped_join_offer'
    | 'join_liveness_degrade';
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
    // SEVERITY (owner-reported 2026-07-15: the LogBox overlay fired on every slow-API
    // run): join_liveness_degrade is a DEGRADE — expected, self-healing behavior on a
    // slow network (the dev API ran >10s repeatedly; the forced reveal is the designed
    // UX fallback), not a broken contract. It logs grep-ably but never throws a LogBox.
    // The structural violations (illegal edges, stale marks, unknown/duplicate inputs)
    // stay console.error — those are bugs to attribute.
    if (violation.reason === 'join_liveness_degrade') {
      // eslint-disable-next-line no-console
      console.log(`[TXN-DEGRADE] ${violation.txnId}: ${violation.detail}`);
      return;
    }
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

/** MODULE-PRIVATE BY DESIGN (F5405). The holder is the arbitration point (design §4.6):
 *  every guarantee it provides — "its gates become unreachable", "stale writes are
 *  identifiable", "ONE live transaction (Q-5: keyed, not ambient)" — is conditional on
 *  nobody being able to mint a transaction outside it. This used to be exported for the
 *  spec's convenience, and the spec used it 14 times, against the architecture the same
 *  file's header declares. Stage through `stageTransitionTxn`. */
const createTransitionTxn = (
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
  if (nextPhase !== 'joining') {
    disarmJoinLivenessWatchdog(txn);
  }
  txn.phase = nextPhase;
  (txn.marks as Record<string, number>)[`${nextPhase}At`] = now();
  emitTrace(txn, nextPhase);
  if (__DEV__ && nextPhase === 'revealed') {
    // [L4STAMP] — THE STAMP INSTRUMENT (L4 Law 1): how long the reveal waited on its
    // join after the switch committed. joinWait ≈ the size of the press-up commit
    // (the chrome ack fires at that commit's end) — the number the one-batch stamp
    // law exists to shrink. One line per txn, greppable next to [TXN-TRACE].
    const committedAt = (txn.marks as Record<string, number>).committedAt;
    const revealedAt = (txn.marks as Record<string, number>).revealedAt;
    if (committedAt != null && revealedAt != null) {
      // F905: the line also carries the window THIS txn was judged against and the
      // headroom fraction (joinWait / window). That is the missing half of the
      // derivation: JOIN_LIVENESS_MS is currently unattributed, and the number that
      // would attribute it is the p99 of `joinWaitMs` over machine-paced joins —
      // greppable straight out of this line, per-kind, with the override visible so
      // the 10000ms search plans do not pollute the default's distribution.
      const windowMs = txn.plan.joinLivenessMs ?? JOIN_LIVENESS_MS;
      const joinWaitMs = revealedAt - committedAt;
      // eslint-disable-next-line no-console
      console.log(
        `[L4STAMP] target=${txn.mutation.targetSceneKey ?? 'none'} kind=${txn.mutation.kind} joinWaitMs=${joinWaitMs.toFixed(1)} windowMs=${windowMs} windowOverridden=${txn.plan.joinLivenessMs != null} headroom=${(joinWaitMs / windowMs).toFixed(3)}`
      );
    }
  }
  // EVERY edge of the LIVE transaction notifies subscribers — the pure advance fns
  // (commit/seal/settle) are called directly by stagers, and a subscriber waiting on a
  // phase (the Q-2 deferred revise waits for the route txn to terminate) must hear
  // them, not only staged/offer edges.
  if (txn === liveTxn) {
    notifySubscribers();
  }
  return true;
};

/** The press-up commit: the route mutation landed. The txn HOLDS at 'committed' until
 *  sealed — the PF dispatch (and with it the host's arm-time amendment) is deferred
 *  past the controller's tail, so the join set is not authoritative yet. */
export const commitTransitionTxn = (txn: TransitionTxn): void => {
  if (!advance(txn, 'committed')) {
    return;
  }
  // F902: apply a seal that was requested during the 'staged' arm window. Without this
  // the arm was dropped and the join only opened at the idle settle sweep.
  if (txn.joinSealRequested === true) {
    sealTransitionTxnJoin(txn);
  }
};

/** THE SEAL (the arm point): the amendment window closes; the authoritative join set
 *  decides the path — degenerate (no inputs) reveals immediately (Q-4: the zero-plane
 *  class as an output), else the join opens. Idempotent per txn (a second seal no-ops
 *  once past 'committed'). */
export const sealTransitionTxnJoin = (txn: TransitionTxn): void => {
  if (txn.phase === 'staged') {
    // F902: the scene-stack host arms (amend + seal) while the txn is still 'staged' —
    // that ordering is DESIGNED (stageTransitionTxnForCommittedSwitch's own comment says
    // the amendment "lands inside the 'staged' window"). But 'joining' is not reachable
    // from 'staged', so this used to `return` silently: the arm evaporated, the join
    // opened only at the idle settle sweep, and the warm-evidence 'paint' offer the host
    // makes two lines later was dropped too — a GUARANTEED 600ms watchdog degrade on
    // every warm switch, with nothing barking. The seal is now remembered and applied at
    // commit (commitTransitionTxn), so an arm always takes effect.
    txn.joinSealRequested = true;
    return;
  }
  if (txn.phase !== 'committed') {
    return;
  }
  if (txn.pendingJoinInputs.size === 0) {
    advance(txn, 'revealed');
    return;
  }
  advance(txn, 'joining');
  armJoinLivenessWatchdog(txn);
};

// ── Join liveness (T5): the ENGINE owns the degrade clock, not any host ceremony ──
//
// A joining transaction whose machine-paced offers (paint/chrome/mapFrame) never
// arrive would park the visible-commit gate forever — the app sticks on the outgoing
// content with no bark. The engine force-reveals after JOIN_LIVENESS_MS with a LOUD
// violation naming the missing inputs: a fire means a source is broken (a header that
// never committed the presented scene, a suppressed paint ack) — a bug to attribute,
// never a mechanism to rely on. Provably RED: suppress any declared offer and every
// such switch barks. freezeUntilSnap plans are EXEMPT — their 'boundary' join is
// USER-paced (a held drag legitimately outlasts any timeout); a canceled dismissal
// supersedes the txn instead.
//
// F905 — 600 IS UNATTRIBUTED. It is not a measurement, not a frame budget, and not a
// dated owner choice: it is the number that decides whether a slow-but-correct switch
// is "broken" or "fine", and the per-plan `joinLivenessMs` override is itself the
// evidence the default is wrong somewhere (search's fade-paced revises measured ~2s and
// were given 10000). Do NOT change the value by feel. The instrument that derives it is
// live above: the [L4STAMP] line now emits joinWaitMs + windowMs + headroom per txn, so
// the p99 of machine-paced (windowOverridden=false) joins is a grep away. When that
// measurement exists, replace this number with it and state the sample inline.
const JOIN_LIVENESS_MS = 600;

const armJoinLivenessWatchdog = (txn: TransitionTxn): void => {
  if (txn.plan.content.kind === 'freezeUntilSnap') {
    return;
  }
  const windowMs = txn.plan.joinLivenessMs ?? JOIN_LIVENESS_MS;
  txn.joinLivenessTimer = setTimeout(() => {
    txn.joinLivenessTimer = null;
    if (txn.phase !== 'joining') {
      return;
    }
    reportViolation({
      reason: 'join_liveness_degrade',
      txnId: txn.txnId,
      detail: `forced reveal after ${windowMs}ms; missing [${[...txn.pendingJoinInputs].join(',')}]`,
    });
    // F903: `advance` to a phase of the LIVE txn already notified — the trailing
    // forEach that used to sit here was the second of two.
    advance(txn, 'revealed');
  }, windowMs);
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

/** F904: SUPERSEDE IS A TERMINAL EDGE AND IT NOTIFIES. It used to notify nothing —
 *  only its caller `stageTransitionTxn` did, AFTER minting the replacement — so a
 *  subscriber waiting for "the txn I armed for has terminated" was woken holding a
 *  brand-new live txn in phase 'staged', matched none of its terminal conditions, and
 *  neither unsubscribed nor flushed. (It self-healed on the new txn's revealed edge,
 *  which is exactly the un-keyed-singleton smell the engine's header claims to have
 *  killed: the subscriber was watching WHICHEVER txn is live, not the one it armed
 *  for.) Both halves are fixed: this edge notifies, and `subscribeTransitionTxn`
 *  hands the listener the transaction it subscribed FOR so it never has to re-read a
 *  global to find out what happened to its own txn. The single notification per
 *  operation is preserved by `inOneNotification` — a stage that supersedes still
 *  wakes subscribers exactly once, with both facts already true. */
const supersedeTransitionTxn = (txn: TransitionTxn): void => {
  if (!TERMINAL_PHASES.has(txn.phase)) {
    disarmJoinLivenessWatchdog(txn);
    txn.phase = 'superseded';
    (txn.marks as Record<string, number>).supersededAt = now();
    emitTrace(txn, 'superseded');
    notifySubscribers();
  }
};

// ── The runtime holder: ONE live transaction (Q-5: keyed, not ambient) ─────────

/** Listeners receive the transaction they SUBSCRIBED FOR (F904) — the txn that was
 *  live at subscribe time, or null if there was none. A subscriber that armed for a
 *  specific transaction can therefore read its OWN txn's phase instead of re-reading
 *  the global holder and being told about somebody else's. */
type Listener = (subscribedTxn: TransitionTxn | null) => void;
const listeners = new Map<Listener, TransitionTxn | null>();
let liveTxn: TransitionTxn | null = null;

// ── ONE NOTIFICATION PER OPERATION (F903) ─────────────────────────────────────────
// `advance()` already notifies every listener when the txn is live, and five call
// sites ALSO ran a trailing `listeners.forEach(...)` right after an advance-bearing
// call — so every phase-changing path notified TWICE. Harmless while every listener
// is an idempotent reader, and precisely the "who notifies" ambiguity that makes the
// first non-idempotent subscriber fire twice.
//
// The rule now: notification is a property of the OPERATION, not of any step inside
// it. Every notify goes through `notifySubscribers`, and each public entry point that
// can produce more than one notify wraps its body in `inOneNotification`, which
// suppresses inner notifications and emits exactly one at the end. Nothing is dropped
// (the non-phase-changing mutations — amend, an intermediate join offer, a seal
// remembered in the 'staged' window — still wake subscribers), and nothing fires
// twice.
let notifyDepth = 0;
let notifyPending = false;

const notifySubscribers = (): void => {
  if (notifyDepth > 0) {
    notifyPending = true;
    return;
  }
  listeners.forEach((subscribedTxn, listener) => listener(subscribedTxn));
};

const inOneNotification = <T>(run: () => T): T => {
  notifyDepth += 1;
  let didNotify = false;
  try {
    return run();
  } finally {
    notifyDepth -= 1;
    if (notifyDepth === 0) {
      didNotify = notifyPending;
      notifyPending = false;
      if (didNotify) {
        listeners.forEach((subscribedTxn, listener) => listener(subscribedTxn));
      }
    }
  }
};

/** Stage a new transaction. SUPERSEDES the live one (the single arbitration point —
 *  design §4.6): its gates become unreachable, its late marks bark as stale. */
export const stageTransitionTxn = (
  mutation: TransitionMutation,
  plan: TransitionTxnPlan
): TransitionTxn => {
  return inOneNotification(() => {
    if (liveTxn != null) {
      supersedeTransitionTxn(liveTxn);
    }
    liveTxn = createTransitionTxn(mutation, plan);
    emitTrace(liveTxn, 'staged');
    notifySubscribers();
    return liveTxn;
  });
};

export const getLiveTransitionTxn = (): TransitionTxn | null => liveTxn;

// F903 (banked re-grep, repo-wide: zero hits outside this file): `withLiveTransitionTxn`
// — "mark helpers addressed BY ID" — is DELETED. It was one of the five duplicate
// notifiers, and it had no callers anywhere: an id-addressed write path with nothing
// writing through it. The stale-id protection it advertised is not lost, because
// `markTransitionJoinInput` and `offerTransitionJoinInput` already report
// `stale_txn_mark` / `dropped_join_offer` on the same class of mistake.

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
  // F901: the doc above promised a FULL-PENDING-SET guard the code never implemented, and
  // then rebuilt pendingJoinInputs UNCONDITIONALLY — RESURRECTING inputs that had already
  // landed. A 'paint' that landed in the committed window (the host's own warm-evidence
  // offer, on a prior frame) was un-landed by the next amend, and a warm leg never re-fires
  // paint -> the join waited forever -> 600ms watchdog degrade. Two fixes, both here:
  //   (1) the guard is now real and LOUD — a late amendment (an input already landed) or a
  //       SECOND amendment of the same txn barks with the offending inputs named;
  //   (2) the amendment PRESERVES landed marks instead of resurrecting them, so a bark can
  //       never also mean silent corruption. The host is the sole owner of the {paint,
  //       chrome} declaration, so refusing outright would just trade one silent drop for
  //       another: the amendment applies, correctly, and the anomaly is attributable.
  const landedInputs = live.plan.joinInputs.filter((input) => !live.pendingJoinInputs.has(input));
  if (landedInputs.length > 0 || live.joinAmended === true) {
    reportViolation({
      reason: 'late_join_amendment',
      txnId: live.txnId,
      detail: `${live.joinAmended === true ? 're-amend' : 'amend'} in ${live.phase} with landed [${landedInputs.join(',')}]; pending [${[...live.pendingJoinInputs].join(',')}] of declared [${live.plan.joinInputs.join(',')}]`,
    });
  }
  const preserved = live.plan.joinInputs.includes('mapFrame') ? (['mapFrame'] as const) : [];
  const nextInputs = [...new Set([...inputs, ...preserved])];
  const landedSet = new Set<TransitionJoinInput>(landedInputs);
  (live.plan as { joinInputs: readonly TransitionJoinInput[] }).joinInputs = nextInputs;
  live.pendingJoinInputs = new Set(nextInputs.filter((input) => !landedSet.has(input)));
  live.joinAmended = true;
  emitTrace(live, 'amended');
  // NOT a phase edge, so `advance` never ran — this is the operation's ONE notify.
  notifySubscribers();
  return true;
};

/**
 * T1b: ambient readiness sources OFFER inputs; the live transaction consumes the ones
 * its plan DECLARED and ignores the rest (a paint ack during a no-join transition is
 * normal life, not a violation). Returns true when the offer was consumed.
 */
export const offerTransitionJoinInput = (input: TransitionJoinInput): boolean => {
  const live = liveTxn;
  if (live == null || !live.plan.joinInputs.includes(input) || !live.pendingJoinInputs.has(input)) {
    // Not declared, or already landed: normal life (a paint ack during a no-join
    // transition is not a violation).
    return false;
  }
  // F902: 'staged' is a CONSUMING phase now. The host offers warm 'paint' evidence at the
  // arm point, which happens inside the staged window — that offer used to be dropped in
  // silence, and a warm leg never re-fires paint, so the input could never land.
  if (live.phase !== 'joining' && live.phase !== 'committed' && live.phase !== 'staged') {
    // The plan DECLARED this input and is still waiting on it, but the phase cannot
    // consume it. That is evidence going in the bin — bark, never drop quietly.
    reportViolation({
      reason: 'dropped_join_offer',
      txnId: live.txnId,
      detail: `'${input}' offered in ${live.phase}; still pending [${[...live.pendingJoinInputs].join(',')}]`,
    });
    return false;
  }
  return inOneNotification(() => {
    // markTransitionJoinInput advances (and notifies) only when the LAST input lands;
    // an intermediate landing still has to wake subscribers, and neither case may
    // notify twice.
    markTransitionJoinInput(live, input);
    notifySubscribers();
    return true;
  });
};

/** Holder-level seal for the ARMING consumer (the scene-stack host). */
export const sealLiveTransitionTxnJoin = (): void => {
  if (liveTxn == null) {
    return;
  }
  inOneNotification(() => {
    // Seals from 'committed' advance (and notify); a seal REMEMBERED in the 'staged'
    // window does not, and still has to wake subscribers.
    sealTransitionTxnJoin(liveTxn as TransitionTxn);
    notifySubscribers();
  });
};

export const subscribeTransitionTxn = (listener: Listener): (() => void) => {
  // The txn that is live AT SUBSCRIBE TIME is the one this listener is watching (F904).
  listeners.set(listener, liveTxn);
  return () => {
    listeners.delete(listener);
  };
};

/** Test-only: reset the holder between specs.
 *
 *  Also DISARMS the live transaction's join-liveness watchdog. A txn left mid-'joining'
 *  at the end of a spec used to fire its 600ms degrade AFTER teardown, logging into a
 *  torn-down console — the leak class that let the run print green while a worker was
 *  force-killed (F830). The LIVE txn is the only one that can still hold a timer:
 *  supersession disarms whatever it replaces, and nothing can mint a transaction outside
 *  the holder (F5405). */
export const resetTransitionTxnHolderForTest = (): void => {
  if (liveTxn != null) {
    disarmJoinLivenessWatchdog(liveTxn);
  }
  liveTxn = null;
  listeners.clear();
};
