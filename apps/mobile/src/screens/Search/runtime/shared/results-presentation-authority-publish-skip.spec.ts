import {
  ResultsPresentationAuthority,
  type ResultsPresentationVisualTarget,
} from './results-presentation-authority';
import {
  IDLE_RESULTS_PRESENTATION_TRANSPORT_STATE,
  type ResultsPresentationTransportState,
} from './results-presentation-runtime-contract';
import { resolveResultsPresentationRuntimeState } from './results-presentation-runtime-machine-state';

/**
 * F1300(a) — FIXED.
 *
 * `publishRuntimeState` has two early returns. The first (exit-started fanout absorb)
 * STORES the snapshot and bumps the version before returning. The second — the
 * `enter_mounted_hidden` + same-transactionId + same-snapshotKind skip — used to
 * return WITHOUT storing, even though `syncVisualTargets(next.transport)` had
 * ALREADY run at the top of the method and pushed that transport to every
 * registered target.
 *
 * The divergence was observable through the authority's own public API, because
 * `addVisualTarget` seeds a newly-registering target from `this.snapshot`. So after
 * a skipped publish, targets registered BEFORE it held the new transport and any
 * target registered AFTER it was seeded with the stale one — two visual targets,
 * one authority, two different answers, decided only by registration order.
 *
 * The fix: store the snapshot (and bump version) on this early return too, so the
 * authority's own record always agrees with what it already pushed to live
 * targets; only the subscriber NOTIFY is skipped, which was the guard's original
 * intent (suppress churn during mounted-hidden re-publishes).
 *
 * These specs now assert the CORRECTED behaviour and go RED if it regresses.
 */

const makeTransport = (
  overrides: Partial<ResultsPresentationTransportState>
): ResultsPresentationTransportState => ({
  ...IDLE_RESULTS_PRESENTATION_TRANSPORT_STATE,
  ...overrides,
});

const makeTarget = (): ResultsPresentationVisualTarget & {
  received: ResultsPresentationTransportState[];
} => {
  const received: ResultsPresentationTransportState[] = [];
  return {
    received,
    updateResultsPresentationTransport: (transport) => {
      received.push(transport);
    },
  };
};

describe('F1300(a) — the enter_mounted_hidden publish skip stores what it synced', () => {
  it('pushes the skipped transport to live targets and records it', () => {
    const authority = new ResultsPresentationAuthority();

    // Land a first state so the stored snapshot carries the transaction the skip
    // guard compares against.
    const mountedHidden = makeTransport({
      transactionId: 'txn-1',
      snapshotKind: 'results_enter',
      executionStage: 'enter_mounted_hidden',
    });
    authority.publishRuntimeState(resolveResultsPresentationRuntimeState(mountedHidden));
    expect(authority.getSnapshot().resultsPresentationTransport.transactionId).toBe('txn-1');

    const liveTarget = makeTarget();
    authority.addVisualTarget(liveTarget);
    liveTarget.received.length = 0;

    // A second publish on the SAME transaction and kind, still mounted-hidden, but
    // carrying a new cover state. The guard skips the NOTIFY, not the store.
    const skipped = makeTransport({
      transactionId: 'txn-1',
      snapshotKind: 'results_enter',
      executionStage: 'enter_mounted_hidden',
      coverState: 'initial_loading',
    });
    authority.publishRuntimeState(resolveResultsPresentationRuntimeState(skipped));

    // syncVisualTargets ran BEFORE the guard, so the live target already has it...
    expect(liveTarget.received.at(-1)?.coverState).toBe('initial_loading');

    // ...and now the authority's own record agrees with what it already pushed.
    expect(authority.getSnapshot().resultsPresentationTransport.coverState).toBe('initial_loading');
  });

  it('seeds a late-registering target from the same transport live targets already hold', () => {
    const authority = new ResultsPresentationAuthority();

    authority.publishRuntimeState(
      resolveResultsPresentationRuntimeState(
        makeTransport({
          transactionId: 'txn-1',
          snapshotKind: 'results_enter',
          executionStage: 'enter_mounted_hidden',
        })
      )
    );

    const earlyTarget = makeTarget();
    authority.addVisualTarget(earlyTarget);

    authority.publishRuntimeState(
      resolveResultsPresentationRuntimeState(
        makeTransport({
          transactionId: 'txn-1',
          snapshotKind: 'results_enter',
          executionStage: 'enter_mounted_hidden',
          coverState: 'initial_loading',
        })
      )
    );

    const lateTarget = makeTarget();
    authority.addVisualTarget(lateTarget);

    // THE FIX, stated as an assertion: the same authority now hands every target
    // — early-registered or late-registered — the same cover state, regardless of
    // when each registered.
    expect(earlyTarget.received.at(-1)?.coverState).toBe('initial_loading');
    expect(lateTarget.received.at(-1)?.coverState).toBe('initial_loading');
  });
});
