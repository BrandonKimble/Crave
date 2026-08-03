import {
  SEARCH_DISMISS_BOUNDARY_RECOVERY_DEADLINE_MS,
  describeSearchDismissBoundaryRecovery,
  resolveSearchDismissBoundaryRecoveryOutcome,
  type SearchDismissBoundaryRecoveryInput,
} from './search-dismiss-boundary-recovery';

const liveDismiss = (
  overrides: Partial<SearchDismissBoundaryRecoveryInput> = {}
): SearchDismissBoundaryRecoveryInput => ({
  armedTransactionId: 'dismiss-1',
  activeTransactionId: 'dismiss-1',
  dismissMotionActive: true,
  boundaryReached: false,
  pollPageReadyForBoundary: false,
  waitingForPollPageAtBoundary: false,
  ...overrides,
});

describe('search dismiss boundary recovery', () => {
  it('THE WEDGE: sheet at the collapsed boundary, poll readiness never arrives → force commit', () => {
    // Reproduces the hang exactly: the boundary reaction saw the collapsed boundary,
    // found the poll page not ready, raised the waiting flag and returned 0 — so the
    // commit was deferred to a readiness edge that never comes. Without an outer
    // deadline this state persists forever and the dismiss never completes.
    const wedged = liveDismiss({
      waitingForPollPageAtBoundary: true,
      pollPageReadyForBoundary: false,
      boundaryReached: false,
    });

    expect(resolveSearchDismissBoundaryRecoveryOutcome(wedged)).toEqual({
      kind: 'force_commit',
      reason: 'poll_page_never_ready',
    });
  });

  it('recovers a dismiss whose motion never reached the collapsed boundary at all', () => {
    expect(
      resolveSearchDismissBoundaryRecoveryOutcome(
        liveDismiss({ waitingForPollPageAtBoundary: false })
      )
    ).toEqual({ kind: 'force_commit', reason: 'boundary_never_reached' });
  });

  it('does nothing when the boundary already committed', () => {
    expect(
      resolveSearchDismissBoundaryRecoveryOutcome(
        liveDismiss({ boundaryReached: true, waitingForPollPageAtBoundary: true })
      )
    ).toEqual({ kind: 'already_committed' });
  });

  it('does nothing once a newer dismiss transaction owns the motion plane', () => {
    expect(
      resolveSearchDismissBoundaryRecoveryOutcome(
        liveDismiss({ activeTransactionId: 'dismiss-2', waitingForPollPageAtBoundary: true })
      )
    ).toEqual({ kind: 'superseded' });
    expect(
      resolveSearchDismissBoundaryRecoveryOutcome(liveDismiss({ activeTransactionId: null }))
    ).toEqual({ kind: 'superseded' });
    expect(
      resolveSearchDismissBoundaryRecoveryOutcome(liveDismiss({ dismissMotionActive: false }))
    ).toEqual({ kind: 'superseded' });
  });

  it('reports the violation with the transaction, the reason and the deadline', () => {
    const message = describeSearchDismissBoundaryRecovery('dismiss-1', 'poll_page_never_ready');
    expect(message).toContain('dismiss-1');
    expect(message).toContain('poll_page_never_ready');
    expect(message).toContain(String(SEARCH_DISMISS_BOUNDARY_RECOVERY_DEADLINE_MS));
  });

  it('keeps the recovery deadline strictly outside the 420ms proof-stage watchdog', () => {
    expect(SEARCH_DISMISS_BOUNDARY_RECOVERY_DEADLINE_MS).toBeGreaterThan(420);
  });
});
