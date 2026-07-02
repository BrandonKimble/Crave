// Shortcut-coverage cache DECISION policy — the pure core of the [tclur FIX] / red-team M1
// contract, lifted out of use-direct-search-map-source-controller so it is spec-locked
// (coverage-cache-policy.spec.ts) and can never silently regress to the pre-fix shape
// (the T4 "toggle-back tab stays empty forever" bug: an 'aborted'/'superseded'/'failed'
// terminal short-circuited like a success and the tab could never re-fetch).
//
// The policy decides, for one coverage requestKey, from three cache facts:
//   - requestKeyMatchesActive: the active resource ref already holds THIS requestKey;
//   - activeStatus:            that active resource's status (null = no active resource);
//   - cachedTerminalStatus:    the per-requestKey terminal cache entry's status (null = miss).
//
// Invariants (each one is specced):
//   (a) an in-flight fetch for the SAME requestKey waits — never duplicated, never stomped;
//   (b) ONLY a SUCCESS terminal ('completed'/'empty') short-circuits/restores;
//   (c) a non-success terminal ('aborted'/'superseded'/'failed') is NOT a result → refetch,
//       and the caller must delete the stale terminal AND features cache entries in LOCKSTEP
//       (deleteStaleCacheEntries) so the sibling caches can never diverge;
//   (d) features are NEVER restored for a non-success terminal (restoreFeatures is only ever
//       true for a success terminal — a non-success restore clears coverage to null).

export type CoverageRequestStatus =
  | 'idle'
  | 'loading'
  | 'completed'
  | 'empty'
  | 'failed'
  | 'aborted'
  | 'superseded';

// (b)'s definition of success: a definitive coverage result for the requestKey. 'empty' is a
// SUCCESS — the server answered "no coverage here" — distinct from a cancelled/errored fetch.
export const isCoverageSuccessTerminalStatus = (
  status: CoverageRequestStatus | null | undefined
): boolean => status === 'completed' || status === 'empty';

export type CoverageCacheDecisionInput = {
  /** The active resource ref holds THIS requestKey (whatever its status). */
  requestKeyMatchesActive: boolean;
  /** Status of the active resource ref, or null when there is no active resource. */
  activeStatus: CoverageRequestStatus | null;
  /** Status of the per-requestKey cached terminal, or null when the cache has no entry. */
  cachedTerminalStatus: CoverageRequestStatus | null;
  /**
   * Whether this call site can actually start a network fetch. The main coverage path can
   * (true). The viewport-bounds-unavailable branch cannot (no bounds → no query), so for it:
   * 'refetch' means "fall through and synthesize the no-bounds 'failed' terminal", a settled
   * same-key active resource is simply 'alreadySettled' (re-fetching is meaningless), and ANY
   * cached terminal restores the RESOURCE — but invariant (d) still holds: features are only
   * restored for a success terminal.
   */
  canRefetch: boolean;
};

export type CoverageCacheDecision =
  | { action: 'waitForInFlight' }
  /**
   * Refetch-incapable context only: the active resource already reflects this requestKey and
   * is settled — nothing to restore, nothing to fetch.
   */
  | { action: 'alreadySettled' }
  | {
      action: 'restoreFromCache';
      /** Which object the caller writes back into the active resource ref. */
      restoreSource: 'activeResource' | 'terminalCache';
      /**
       * (d) True ONLY for a success terminal. When false the caller must CLEAR the coverage
       * features ref (null) — never surface a features entry alongside a non-success terminal.
       */
      restoreFeatures: boolean;
    }
  | {
      action: 'refetch';
      /**
       * (c) True when a stale NON-SUCCESS terminal occupies this requestKey: before fetching,
       * the caller MUST delete BOTH the terminal cache entry AND the features cache entry for
       * the key (lockstep) so a later hit can never pair a stale features entry with a fresher
       * terminal (the "state-correct-but-screen-wrong" class).
       */
      deleteStaleCacheEntries: boolean;
    };

export const resolveCoverageCacheDecision = (
  input: CoverageCacheDecisionInput
): CoverageCacheDecision => {
  const { requestKeyMatchesActive, activeStatus, cachedTerminalStatus, canRefetch } = input;
  if (canRefetch) {
    // (a) A fetch for THIS exact requestKey is already in flight — let it land.
    if (requestKeyMatchesActive && activeStatus === 'loading') {
      return { action: 'waitForInFlight' };
    }
    // (b) Success-only short-circuit. The success terminal may come from the active resource
    // (checked first — it is already authoritative for this key) or the per-key terminal cache.
    if (requestKeyMatchesActive && isCoverageSuccessTerminalStatus(activeStatus)) {
      return { action: 'restoreFromCache', restoreSource: 'activeResource', restoreFeatures: true };
    }
    if (isCoverageSuccessTerminalStatus(cachedTerminalStatus)) {
      return { action: 'restoreFromCache', restoreSource: 'terminalCache', restoreFeatures: true };
    }
    // (c) No success terminal for this key: none at all, or a cancelled/errored one
    // ('aborted'/'superseded'/'failed') — which is NOT a result. Refetch; a stale non-success
    // terminal must be deleted (terminal + features, lockstep) so it can't block the re-fetch.
    return { action: 'refetch', deleteStaleCacheEntries: cachedTerminalStatus != null };
  }
  // Refetch-incapable context (viewport bounds unavailable — no bounds, no query).
  if (requestKeyMatchesActive && activeStatus != null && activeStatus !== 'loading') {
    return { action: 'alreadySettled' };
  }
  if (cachedTerminalStatus != null) {
    // The RESOURCE is restored for any cached terminal (there is no fetch to fall through to —
    // the cached terminal, success or not, is the authoritative answer for this key), but (d)
    // features only for a success.
    return {
      action: 'restoreFromCache',
      restoreSource: 'terminalCache',
      restoreFeatures: isCoverageSuccessTerminalStatus(cachedTerminalStatus),
    };
  }
  // Nothing cached and nothing settled for this key → the caller synthesizes its no-bounds
  // 'failed' terminal (this context's stand-in for a fresh fetch).
  return { action: 'refetch', deleteStaleCacheEntries: false };
};
