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

/** Stage + commit the transaction for a committed switch (both controller apply sites). */
export const stageTransitionTxnForCommittedSwitch = (
  transitionPlan: AppRouteSceneTransitionPlan
): void => {
  const txn = stageTransitionTxn(
    {
      kind: toMutationKind(transitionPlan.committedRouteAction),
      targetSceneKey: transitionPlan.targetSceneKey,
      sourceSceneKey: transitionPlan.sourceSceneKey ?? null,
      entryId: transitionPlan.committedRouteEntryId ?? null,
    },
    deriveTransitionTxnPlan(transitionPlan)
  );
  commitTransitionTxn(txn);
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
  if (live != null && live.phase === 'revealed') {
    settleTransitionTxn(live);
  }
};
