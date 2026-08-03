/**
 * THE OUTER DEADLINE ON THE DISMISS BOUNDARY COMMIT.
 *
 * The dismiss boundary commit is gated on poll-page readiness: when the sheet reaches
 * the collapsed boundary and the incoming poll page is not ready, the motion plane sets
 * a waiting flag and DEFERS the commit to the readiness reaction. That deferral is
 * correct (committing early flashes a blank page) — but a readiness gate with no
 * deadline is a wedge: if readiness never arrives, `notifyCloseCollapsedBoundaryReached`
 * / `notifyCloseSheetSettled` never fire and the sheet sits at the collapsed boundary
 * forever. The 420ms proof watchdog OBSERVED that hang and could not recover it (and in
 * a user session, with perf attribution off, did not even log).
 *
 * This module is the recovery decision, kept pure so it can be proven: at the deadline,
 * a live-but-uncommitted dismiss is FORCED to complete and the violation is reported.
 * Fail-open with a loud trace — the same policy as the fresh-bounds capture ("an
 * accuracy upgrade, never a blocker") and the join-liveness force-reveal.
 */

/**
 * Deliberately NOT the 420ms proof-stage constant (that number exists to bucket motion
 * proof samples, not to bound readiness). Real poll-readiness latency has never been
 * measured, so this is a conservative upper bound chosen to sit far above any plausible
 * honest readiness wait while still being well inside "the user thinks it's broken".
 * It is paired with an ungated violation report precisely so the frequency becomes
 * visible BEFORE anyone tunes it — do not lower it on intuition, lower it on the trace.
 */
export const SEARCH_DISMISS_BOUNDARY_RECOVERY_DEADLINE_MS = 1200;

export type SearchDismissBoundaryRecoveryInput = {
  /** The transaction the deadline was armed for. */
  armedTransactionId: string;
  /** The transaction the motion plane is currently driving, if any. */
  activeTransactionId: string | null;
  dismissMotionActive: boolean;
  boundaryReached: boolean;
  pollPageReadyForBoundary: boolean;
  waitingForPollPageAtBoundary: boolean;
};

export type SearchDismissBoundaryRecoveryOutcome =
  | { kind: 'superseded' }
  | { kind: 'already_committed' }
  | {
      kind: 'force_commit';
      reason: 'poll_page_never_ready' | 'boundary_never_reached';
    };

export const resolveSearchDismissBoundaryRecoveryOutcome = ({
  armedTransactionId,
  activeTransactionId,
  dismissMotionActive,
  boundaryReached,
  pollPageReadyForBoundary,
  waitingForPollPageAtBoundary,
}: SearchDismissBoundaryRecoveryInput): SearchDismissBoundaryRecoveryOutcome => {
  if (activeTransactionId !== armedTransactionId || !dismissMotionActive) {
    return { kind: 'superseded' };
  }
  if (boundaryReached) {
    return { kind: 'already_committed' };
  }
  return {
    kind: 'force_commit',
    reason:
      waitingForPollPageAtBoundary && !pollPageReadyForBoundary
        ? 'poll_page_never_ready'
        : 'boundary_never_reached',
  };
};

export const describeSearchDismissBoundaryRecovery = (
  transactionId: string,
  reason: 'poll_page_never_ready' | 'boundary_never_reached'
): string =>
  `[TXN-DEGRADE] search_dismiss_boundary_recovery ${transactionId}: ${reason} after ${SEARCH_DISMISS_BOUNDARY_RECOVERY_DEADLINE_MS}ms — boundary force-committed`;
