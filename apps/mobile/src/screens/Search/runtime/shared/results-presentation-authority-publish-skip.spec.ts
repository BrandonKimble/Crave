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
 * F1300(a) — ATTRIBUTION SPEC, not a fix.
 *
 * `publishRuntimeState` has two early returns. The first (exit-started fanout absorb)
 * STORES the snapshot and bumps the version before returning. The second — the
 * `enter_mounted_hidden` + same-transactionId + same-snapshotKind skip — returns
 * WITHOUT storing, even though `syncVisualTargets(next.transport)` has ALREADY run
 * at the top of the method and pushed that transport to every registered target.
 *
 * The finding asked which half is redundant and said it needed runtime attribution.
 * It does not: the divergence is observable through the authority's own public API,
 * because `addVisualTarget` seeds a newly-registering target from `this.snapshot`.
 * So after a skipped publish, targets registered BEFORE it hold the new transport
 * and any target registered AFTER it is seeded with the stale one — two visual
 * targets, one authority, two different answers.
 *
 * These specs CHARACTERISE current behaviour (they pass as-is). They exist so the
 * fix can be chosen against evidence rather than a guess, and so whichever fix
 * lands has something that goes RED if it regresses. Read the assertions as "this
 * is what the code does today", not "this is what it should do".
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

describe('F1300(a) — the enter_mounted_hidden publish skip does not store what it synced', () => {
  it('pushes the skipped transport to live targets but does not record it', () => {
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
    // carrying a new cover state. The guard skips it.
    const skipped = makeTransport({
      transactionId: 'txn-1',
      snapshotKind: 'results_enter',
      executionStage: 'enter_mounted_hidden',
      coverState: 'initial_loading',
    });
    authority.publishRuntimeState(resolveResultsPresentationRuntimeState(skipped));

    // syncVisualTargets ran BEFORE the guard, so the live target already has it...
    expect(liveTarget.received.at(-1)?.coverState).toBe('initial_loading');

    // ...but the authority never recorded it.
    expect(authority.getSnapshot().resultsPresentationTransport.coverState).toBe('hidden');
  });

  it('seeds a late-registering target from the stale snapshot, so two targets disagree', () => {
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

    // THE DIVERGENCE, stated as an assertion: the same authority hands two targets
    // two different cover states, decided only by when each registered.
    expect(earlyTarget.received.at(-1)?.coverState).toBe('initial_loading');
    expect(lateTarget.received.at(-1)?.coverState).toBe('hidden');
  });
});
