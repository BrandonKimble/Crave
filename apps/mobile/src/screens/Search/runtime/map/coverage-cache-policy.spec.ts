/**
 * Contract spec for the shortcut-coverage cache decision policy (the TR5 contract test —
 * the pure core of the [tclur FIX] / red-team M1 work in
 * use-direct-search-map-source-controller.ts).
 *
 * The T4-lesson contract trio this locks:
 *   1. SUCCESS-ONLY CACHING — only 'completed'/'empty' terminals short-circuit/restore;
 *      'aborted'/'superseded'/'failed' are NOT results and must re-fetch (the T4 bug: an
 *      aborted terminal short-circuited like a success → the toggled-back tab could never
 *      re-fetch and stayed empty forever, promoted=0).
 *   2. LOCKSTEP DELETE — when a stale non-success terminal occupies a requestKey, the
 *      decision demands deleteStaleCacheEntries: the caller deletes BOTH the terminal cache
 *      entry AND the sibling features cache entry before fetching, so the pair can never
 *      diverge (a stale features entry paired with a fresher terminal = the
 *      "state-correct-but-screen-wrong" class).
 *   3. RESTORE-BEFORE-PROJECT — comment-level contract, lives at the SUBSCRIBER (not here):
 *      in use-direct-search-map-source-controller's publishAndFetch effect,
 *      maybeFetchShortcutCoverage() runs BEFORE the trailing publishSourcesRef.current(), so
 *      a synchronous cache-hit restore lands in the refs before the projection reads them.
 *      Otherwise the projection reads the PRIOR tab's coverage for one frame (the
 *      rapid-toggle 1-frame wrong-count flash). It cannot be specced from this pure module —
 *      it is an ordering property of the subscriber — so it is documented here and enforced
 *      by the call-site comment ([tclur FIX] at the publishAndFetch definition).
 */
import {
  isCoverageSuccessTerminalStatus,
  resolveCoverageCacheDecision,
  type CoverageCacheDecisionInput,
  type CoverageRequestStatus,
} from './coverage-cache-policy';

const SUCCESS_STATUSES: CoverageRequestStatus[] = ['completed', 'empty'];
const NON_SUCCESS_TERMINAL_STATUSES: CoverageRequestStatus[] = ['aborted', 'superseded', 'failed'];
const ALL_STATUSES: CoverageRequestStatus[] = [
  'idle',
  'loading',
  'completed',
  'empty',
  'failed',
  'aborted',
  'superseded',
];

const decide = (input: Partial<CoverageCacheDecisionInput>) =>
  resolveCoverageCacheDecision({
    requestKeyMatchesActive: false,
    activeStatus: null,
    cachedTerminalStatus: null,
    canRefetch: true,
    ...input,
  });

describe('isCoverageSuccessTerminalStatus', () => {
  it("treats ONLY 'completed' and 'empty' as success", () => {
    SUCCESS_STATUSES.forEach((status) => {
      expect(isCoverageSuccessTerminalStatus(status)).toBe(true);
    });
    NON_SUCCESS_TERMINAL_STATUSES.forEach((status) => {
      expect(isCoverageSuccessTerminalStatus(status)).toBe(false);
    });
    expect(isCoverageSuccessTerminalStatus('idle')).toBe(false);
    expect(isCoverageSuccessTerminalStatus('loading')).toBe(false);
    expect(isCoverageSuccessTerminalStatus(null)).toBe(false);
    expect(isCoverageSuccessTerminalStatus(undefined)).toBe(false);
  });
});

describe('resolveCoverageCacheDecision — main path (canRefetch: true)', () => {
  // Invariant (a): an in-flight fetch for the SAME requestKey waits.
  it('(a) waits when the SAME requestKey is already in flight', () => {
    expect(decide({ requestKeyMatchesActive: true, activeStatus: 'loading' })).toEqual({
      action: 'waitForInFlight',
    });
    // ...even when a cached terminal exists for the key — the in-flight fetch wins.
    expect(
      decide({
        requestKeyMatchesActive: true,
        activeStatus: 'loading',
        cachedTerminalStatus: 'completed',
      })
    ).toEqual({ action: 'waitForInFlight' });
  });

  it('(a) does NOT wait on an in-flight fetch for a DIFFERENT requestKey (it gets superseded)', () => {
    expect(decide({ requestKeyMatchesActive: false, activeStatus: 'loading' })).toEqual({
      action: 'refetch',
      deleteStaleCacheEntries: false,
    });
  });

  // Invariant (b): ONLY 'completed'/'empty' terminals short-circuit/restore.
  it('(b) restores from the ACTIVE resource when it already holds a SUCCESS terminal for the key', () => {
    SUCCESS_STATUSES.forEach((status) => {
      expect(decide({ requestKeyMatchesActive: true, activeStatus: status })).toEqual({
        action: 'restoreFromCache',
        restoreSource: 'activeResource',
        restoreFeatures: true,
      });
    });
  });

  it('(b) restores from the TERMINAL CACHE on a SUCCESS terminal hit', () => {
    SUCCESS_STATUSES.forEach((status) => {
      expect(decide({ cachedTerminalStatus: status })).toEqual({
        action: 'restoreFromCache',
        restoreSource: 'terminalCache',
        restoreFeatures: true,
      });
    });
  });

  it('(b) an \'empty\' terminal is a SUCCESS (the server answered "no coverage"), not a retryable failure', () => {
    expect(decide({ cachedTerminalStatus: 'empty' }).action).toBe('restoreFromCache');
  });

  it('(b) prefers the same-key ACTIVE success over the terminal cache (it is already authoritative)', () => {
    const decision = decide({
      requestKeyMatchesActive: true,
      activeStatus: 'completed',
      cachedTerminalStatus: 'completed',
    });
    expect(decision).toEqual({
      action: 'restoreFromCache',
      restoreSource: 'activeResource',
      restoreFeatures: true,
    });
  });

  it('(b) falls back to a cached SUCCESS when the same-key active resource is non-success', () => {
    expect(
      decide({
        requestKeyMatchesActive: true,
        activeStatus: 'aborted',
        cachedTerminalStatus: 'completed',
      })
    ).toEqual({
      action: 'restoreFromCache',
      restoreSource: 'terminalCache',
      restoreFeatures: true,
    });
  });

  // Invariant (c): non-success terminals are NOT results → refetch + LOCKSTEP delete.
  it("(c) EACH of 'aborted'/'superseded'/'failed' → refetch AND demands the lockstep delete", () => {
    NON_SUCCESS_TERMINAL_STATUSES.forEach((status) => {
      expect(decide({ cachedTerminalStatus: status })).toEqual({
        action: 'refetch',
        deleteStaleCacheEntries: true,
      });
      // Same when the ACTIVE resource also holds the stale non-success terminal for the key
      // (the .catch writes both the resource ref and the terminal cache together).
      expect(
        decide({
          requestKeyMatchesActive: true,
          activeStatus: status,
          cachedTerminalStatus: status,
        })
      ).toEqual({ action: 'refetch', deleteStaleCacheEntries: true });
    });
  });

  it('(c) a cache MISS refetches WITHOUT demanding a delete (nothing stale to drop)', () => {
    expect(decide({})).toEqual({ action: 'refetch', deleteStaleCacheEntries: false });
    expect(decide({ requestKeyMatchesActive: true, activeStatus: 'aborted' })).toEqual({
      action: 'refetch',
      deleteStaleCacheEntries: false,
    });
  });

  it('(b/c) T4 regression shape: a same-key aborted active + aborted cached terminal MUST re-fetch, never restore', () => {
    // This is the exact pre-fix bug: rapid tab toggling supersedes the in-flight coverage
    // fetch, the .catch caches an 'aborted' terminal, and the OLD code early-returned on ANY
    // cached terminal → that tab could never re-fetch and stayed empty (promoted=0).
    const decision = decide({
      requestKeyMatchesActive: true,
      activeStatus: 'aborted',
      cachedTerminalStatus: 'aborted',
    });
    expect(decision.action).toBe('refetch');
  });
});

describe('resolveCoverageCacheDecision — bounds-unavailable path (canRefetch: false)', () => {
  it('no-ops when the same key is already settled on the active resource (incl. its own synthetic failed terminal)', () => {
    (['completed', 'empty', 'failed', 'aborted', 'superseded', 'idle'] as const).forEach(
      (status) => {
        expect(
          decide({ canRefetch: false, requestKeyMatchesActive: true, activeStatus: status })
        ).toEqual({ action: 'alreadySettled' });
      }
    );
  });

  it('restores the RESOURCE for ANY cached terminal (there is no fetch to fall through to)…', () => {
    ALL_STATUSES.forEach((status) => {
      expect(decide({ canRefetch: false, cachedTerminalStatus: status }).action).toBe(
        'restoreFromCache'
      );
    });
  });

  it('(d) …but NEVER restores features for a non-success terminal', () => {
    NON_SUCCESS_TERMINAL_STATUSES.forEach((status) => {
      expect(decide({ canRefetch: false, cachedTerminalStatus: status })).toEqual({
        action: 'restoreFromCache',
        restoreSource: 'terminalCache',
        restoreFeatures: false,
      });
    });
    SUCCESS_STATUSES.forEach((status) => {
      expect(decide({ canRefetch: false, cachedTerminalStatus: status })).toEqual({
        action: 'restoreFromCache',
        restoreSource: 'terminalCache',
        restoreFeatures: true,
      });
    });
  });

  it('falls through to the synthetic no-bounds failed terminal when nothing is cached or settled', () => {
    expect(decide({ canRefetch: false })).toEqual({
      action: 'refetch',
      deleteStaleCacheEntries: false,
    });
  });
});

describe('resolveCoverageCacheDecision — whole-domain property sweep', () => {
  // Exhaustive sweep over every reachable input combination. These properties are the
  // invariants stated once, checked everywhere — a mutation that lets any non-success status
  // masquerade as a success fails here regardless of which branch it hides in.
  const statusDomain: Array<CoverageRequestStatus | null> = [null, ...ALL_STATUSES];

  const forEveryInput = (assertion: (input: CoverageCacheDecisionInput) => void) => {
    [true, false].forEach((requestKeyMatchesActive) => {
      statusDomain.forEach((activeStatus) => {
        statusDomain.forEach((cachedTerminalStatus) => {
          [true, false].forEach((canRefetch) => {
            assertion({ requestKeyMatchesActive, activeStatus, cachedTerminalStatus, canRefetch });
          });
        });
      });
    });
  };

  it('(d) restoreFeatures is ONLY ever true when the restore source is a SUCCESS terminal', () => {
    forEveryInput((input) => {
      const decision = resolveCoverageCacheDecision(input);
      if (decision.action === 'restoreFromCache' && decision.restoreFeatures) {
        const sourceStatus =
          decision.restoreSource === 'activeResource'
            ? input.activeStatus
            : input.cachedTerminalStatus;
        expect(isCoverageSuccessTerminalStatus(sourceStatus)).toBe(true);
      }
    });
  });

  it('(b) a SUCCESS restore never comes from a non-existent source', () => {
    forEveryInput((input) => {
      const decision = resolveCoverageCacheDecision(input);
      if (decision.action === 'restoreFromCache') {
        if (decision.restoreSource === 'activeResource') {
          expect(input.requestKeyMatchesActive).toBe(true);
          expect(input.activeStatus).not.toBeNull();
        } else {
          expect(input.cachedTerminalStatus).not.toBeNull();
        }
      }
    });
  });

  it('(a) waitForInFlight ONLY when the SAME key is loading (and only where a fetch could exist)', () => {
    forEveryInput((input) => {
      const decision = resolveCoverageCacheDecision(input);
      if (decision.action === 'waitForInFlight') {
        expect(input.requestKeyMatchesActive).toBe(true);
        expect(input.activeStatus).toBe('loading');
        expect(input.canRefetch).toBe(true);
      }
    });
  });

  it('(c) the lockstep delete is demanded exactly when a stale NON-SUCCESS terminal occupies the key', () => {
    forEveryInput((input) => {
      const decision = resolveCoverageCacheDecision(input);
      if (decision.action === 'refetch') {
        expect(decision.deleteStaleCacheEntries).toBe(
          input.cachedTerminalStatus != null &&
            !isCoverageSuccessTerminalStatus(input.cachedTerminalStatus)
        );
      }
    });
  });

  it('a cached SUCCESS terminal is never deleted/refetched over (canRefetch: true)', () => {
    forEveryInput((input) => {
      if (!input.canRefetch) {
        return;
      }
      const decision = resolveCoverageCacheDecision(input);
      if (
        isCoverageSuccessTerminalStatus(input.cachedTerminalStatus) &&
        decision.action === 'refetch'
      ) {
        throw new Error(
          `success terminal '${input.cachedTerminalStatus}' must short-circuit, got refetch for ${JSON.stringify(input)}`
        );
      }
    });
  });
});
