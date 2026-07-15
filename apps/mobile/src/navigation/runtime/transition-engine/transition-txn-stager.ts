/**
 * T1a (§Q redo): stage/commit/settle TransitionTxns from the ONE real switch path —
 * observability-first (the residency strangler pattern): the transaction shadows the
 * old machinery, its [TXN-TRACE] is verified against the matrix, THEN consumers
 * convert one at a time (T1b+: join inputs, swap gate, freeze primitive).
 *
 * v0 plans are DEGENERATE (joinInputs: []) — every txn reveals at commit; the trace
 * skeleton lands without touching behavior. T1b derives real joinInputs from the
 * resolved plan's motion planes / readiness contract.
 */

import {
  commitTransitionTxn,
  getLiveTransitionTxn,
  sealTransitionTxnJoin,
  settleTransitionTxn,
  stageTransitionTxn,
  type TransitionMutation,
} from './transition-transaction';
import type { AppRouteSceneTransitionPlan } from '../app-route-scene-transition-policy-runtime';

const toMutationKind = (
  routeAction: AppRouteSceneTransitionPlan['committedRouteAction']
): TransitionMutation['kind'] => {
  switch (routeAction) {
    case 'push':
      return 'push';
    case 'closeActive':
      return 'closeActive';
    case 'popToEntry':
      return 'popToEntry';
    case 'popToRoot':
      return 'popToRoot';
    case 'setRoot':
      return 'setRoot';
    case 'updateActive':
    case 'preserve':
    default:
      return 'preserve';
  }
};

/** STAGE the transaction for a committing switch. Called BEFORE the route apply; the
 *  commit (commitStagedTransitionTxn) runs AFTER the state flush so the scene-stack
 *  host's arm-time amendment (the one place that knows cold-vs-warm) lands inside the
 *  'staged' window. */
export const stageTransitionTxnForCommittedSwitch = (
  transitionPlan: AppRouteSceneTransitionPlan
): void => {
  stageTransitionTxn(
    {
      kind: toMutationKind(transitionPlan.committedRouteAction),
      targetSceneKey: transitionPlan.targetSceneKey,
      sourceSceneKey: transitionPlan.sourceSceneKey ?? null,
      entryId: transitionPlan.committedRouteEntryId ?? null,
    },
    deriveTransitionTxnPlan(transitionPlan)
  );
};

/** Commit the staged transaction. The txn HOLDS at 'committed' (amendable) until a
 *  seal: the host's arm-time amendment seals it, or the settle boundary seals any
 *  un-armed switch (no roles change → the derived plan stands). */
export const commitStagedTransitionTxn = (): void => {
  const live = getLiveTransitionTxn();
  if (live != null && live.phase === 'staged') {
    commitTransitionTxn(live);
    // T1d: a freeze-dismiss's join is fully known at stage time (no host amendment
    // applies — its plan is the source of truth): seal immediately so the boundary
    // offer reveals AT the boundary edge, not at a later settle sweep.
    if (live.plan.content.kind === 'freezeUntilSnap') {
      sealTransitionTxnJoin(live);
    }
  }
};

/**
 * T1b: the transaction's plan DERIVES from the resolved switch plan — same facts,
 * one vocabulary. The reveal-join source is the CONTENT HANDOFF (the fact that
 * actually gates today's visible swap — O-11): preserveOutgoingUntilSettle means the
 * incoming reveals on the {paint, chrome} join (the child-transition primitive);
 * a search content-readiness link adds the native world frame (mapFrame).
 * swapImmediately (seeded scenes / zero-plane dismissals) = the degenerate class.
 */
const deriveTransitionTxnPlan = (
  transitionPlan: AppRouteSceneTransitionPlan
): Parameters<typeof stageTransitionTxn>[1] => {
  // T1d (design N-3/N-4, ledger P-14): the FREEZE-MODE DISMISS — the outgoing bundle
  // holds until the sheet reaches the boundary; the incoming is WARM, so the reveal
  // joins on 'boundary' (the snap crossing), NOT {paint, chrome}. This is the one
  // edge ALL owners (header host, leg lanes, surface bundle) gate on — the early
  // chrome flip / partial-bundle / bottom double-flip classes die here.
  const isFreezeDismiss =
    transitionPlan.sheetTransitionPlan.transitionKind === 'terminalDismiss' &&
    transitionPlan.sheetTransitionPlan.contentHandoff === 'preserveOutgoingUntilSettle';
  if (isFreezeDismiss) {
    return {
      content: { kind: 'freezeUntilSnap' },
      joinInputs: ['boundary'],
      movesSheet: true,
    };
  }
  const holdsOutgoing =
    transitionPlan.sheetTransitionPlan.contentHandoff === 'preserveOutgoingUntilSettle';
  const joinInputs: ('paint' | 'chrome' | 'mapFrame')[] = holdsOutgoing
    ? transitionPlan.contentReadinessTransactionId != null
      ? ['paint', 'chrome', 'mapFrame']
      : ['paint', 'chrome']
    : [];
  return {
    content: holdsOutgoing ? { kind: 'holdOutgoingUntilSettle' } : { kind: 'swapImmediately' },
    joinInputs,
    movesSheet: transitionPlan.sheetSnapTarget != null,
  };
};

/** Settle the live transaction at the switch's idle-commit boundary. A txn still
 *  'joining' at idle is NOT settled here — that is a real fact the trace should show
 *  (the join never completed), not one to paper over. */
export const settleLiveTransitionTxnAtIdle = (): void => {
  const live = getLiveTransitionTxn();
  if (live == null) {
    return;
  }
  if (live.phase === 'committed') {
    // Un-armed switch (no roles change reached the host): the derived plan stands.
    sealTransitionTxnJoin(live);
  }
  if (live.phase === 'revealed') {
    settleTransitionTxn(live);
  }
};
