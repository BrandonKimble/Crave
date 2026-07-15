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
    {
      // T1a: degenerate everywhere (shadow mode). T1b derives content/joinInputs from
      // the resolved plan (motion planes → paint/chrome; readiness link → mapFrame).
      content: { kind: 'swapImmediately' },
      joinInputs: [],
      movesSheet: transitionPlan.sheetSnapTarget != null,
    }
  );
  commitTransitionTxn(txn);
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
