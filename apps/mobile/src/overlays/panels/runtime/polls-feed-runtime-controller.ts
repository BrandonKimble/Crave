import React from 'react';
import { InteractionManager } from 'react-native';
import { io, type Socket } from 'socket.io-client';

import { API_BASE_URL } from '../../../services/api';
import { resolveMarket } from '../../../services/markets';
import {
  createNetworkPollBootstrapSnapshot,
  fetchPolls,
  readPollBootstrapSnapshotForMarket,
  writePollBootstrapSnapshot,
  type Poll,
  type PollBootstrapSnapshot,
  type PollFeedSort,
  type PollFeedTime,
  type PollFeedType,
} from '../../../services/polls';
import type { Coordinate, MapBounds } from '../../../types';
import { logger } from '../../../utils';

type InteractionRef = React.MutableRefObject<{ isInteracting: boolean }>;

// §9.4 (page-switch-master-plan.md) startup-polls retry policy: this controller is the SINGLE
// owner of poll fetching (the startup coordinator only seeds a cached snapshot — it never
// fetches). On a failed load, retry quietly with backoff, then give up to the skeleton /
// manual-refresh state. Any explicit refresh (pull, toggle, socket, market change) supersedes a
// pending retry and resets the ladder.
const POLL_FEED_RETRY_BACKOFF_MS = [2_000, 5_000, 10_000] as const;

// [pageswitch] P1-addendum bootstrap probe — same JSONL family as the coordinator's bootstrap
// lifecycle probe so the startup-polls fetch/retry story is greppable in /tmp/crave-metro.log.
const logBootstrap = (data: Record<string, unknown>): void => {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[pageswitch] bootstrap ${JSON.stringify(data)}`);
  }
};

type RefreshPollFeedOptions = {
  skipSpinner?: boolean;
  marketKeyOverride?: string | null;
  marketNameFallback?: string | null;
  /** Internal (retry ladder only): which backoff attempt this call is. External callers omit it. */
  retryAttempt?: number;
};

type UsePollsFeedRuntimeControllerArgs = {
  visible: boolean;
  bounds?: MapBounds | null;
  bootstrapSnapshot?: PollBootstrapSnapshot | null;
  userLocation?: Coordinate | null;
  marketOverride?: string | null;
  pollFeedRequiresFreshNetwork: boolean;
  /** Live (`active`) vs Results (`closed`) feed split (§4/§6). */
  feedState: 'active' | 'closed';
  /** Selected sort, or null for the silent demand-ranked default. */
  feedSort: PollFeedSort | null;
  /** Type filter: all (no filter) | polls (ranked) | discussions (§6). */
  feedType: PollFeedType;
  /** Time filter: all_time (no filter) | this_week (§6). */
  feedTime: PollFeedTime;
  setPolls: React.Dispatch<React.SetStateAction<Poll[]>>;
  setMarketKey: React.Dispatch<React.SetStateAction<string | null>>;
  setMarketName: React.Dispatch<React.SetStateAction<string | null>>;
  setMarketStatus: React.Dispatch<
    React.SetStateAction<'resolved' | 'multi_market' | 'no_market' | 'error' | null>
  >;
  setCandidateLocalityName: React.Dispatch<React.SetStateAction<string | null>>;
  setCreatePollPrompt: React.Dispatch<React.SetStateAction<string | null>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setPollFeedRefreshing: React.Dispatch<React.SetStateAction<boolean>>;
  setPollFeedRequiresFreshNetwork: React.Dispatch<React.SetStateAction<boolean>>;
  setPollFeedFreshnessError: React.Dispatch<React.SetStateAction<boolean>>;
  setPersistedCity: (city: string) => void;
  isSystemUnavailable: boolean;
  pollIdParam?: string | null;
  interactionRef?: InteractionRef;
};

export type PollsFeedRuntimeController = {
  refreshPollFeed: (options?: RefreshPollFeedOptions) => Promise<void>;
};

export const usePollsFeedRuntimeController = ({
  visible,
  bounds,
  bootstrapSnapshot,
  userLocation,
  marketOverride,
  pollFeedRequiresFreshNetwork,
  feedState,
  feedSort,
  feedType,
  feedTime,
  setPolls,
  setMarketKey,
  setMarketName,
  setMarketStatus,
  setCandidateLocalityName,
  setCreatePollPrompt,
  setLoading,
  setPollFeedRefreshing,
  setPollFeedRequiresFreshNetwork,
  setPollFeedFreshnessError,
  setPersistedCity,
  isSystemUnavailable,
  pollIdParam,
  interactionRef,
}: UsePollsFeedRuntimeControllerArgs): PollsFeedRuntimeController => {
  const socketRef = React.useRef<Socket | null>(null);
  const lastResolvedMarketKeyRef = React.useRef<string | null>(null);
  const refreshSeqRef = React.useRef(0);
  // §9.4 retry ladder: the pending backoff timer + a live ref to the latest refresh callback so
  // a scheduled retry always runs with fresh bounds/market inputs.
  const retryTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshPollFeedRef = React.useRef<
    ((options?: RefreshPollFeedOptions) => Promise<void>) | null
  >(null);
  const clearScheduledPollFeedRetry = React.useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);
  // Read inside refreshPollFeed so every fetch uses the live toggle values without
  // re-creating the callback (which would re-trigger the market/bounds effects).
  const feedStateRef = React.useRef(feedState);
  feedStateRef.current = feedState;
  const feedSortRef = React.useRef(feedSort);
  feedSortRef.current = feedSort;
  const feedTypeRef = React.useRef(feedType);
  feedTypeRef.current = feedType;
  const feedTimeRef = React.useRef(feedTime);
  feedTimeRef.current = feedTime;
  const bootstrapMarketKey =
    typeof bootstrapSnapshot?.marketKey === 'string' && bootstrapSnapshot.marketKey.trim()
      ? bootstrapSnapshot.marketKey.trim().toLowerCase()
      : null;
  const hasBootstrapSnapshot = Boolean(
    bootstrapSnapshot &&
      (bootstrapSnapshot.polls.length > 0 || bootstrapSnapshot.marketName || bootstrapMarketKey)
  );

  const applyPollSnapshot = React.useCallback(
    (snapshot: PollBootstrapSnapshot, marketNameFallback?: string | null) => {
      const nextMarketKey = snapshot.marketKey;
      const normalizedKey =
        typeof nextMarketKey === 'string' ? nextMarketKey.trim().toLowerCase() : null;
      const resolvedMarketName =
        typeof snapshot.marketName === 'string' && snapshot.marketName.trim()
          ? snapshot.marketName.trim()
          : typeof marketNameFallback === 'string' && marketNameFallback.trim()
            ? marketNameFallback.trim()
            : null;
      if (normalizedKey) {
        lastResolvedMarketKeyRef.current = normalizedKey;
      }
      setPolls(snapshot.polls);
      setMarketKey(nextMarketKey);
      setMarketName(resolvedMarketName);
      setMarketStatus(
        snapshot.marketStatus === 'resolved' ||
          snapshot.marketStatus === 'multi_market' ||
          snapshot.marketStatus === 'no_market' ||
          snapshot.marketStatus === 'error'
          ? snapshot.marketStatus
          : nextMarketKey
            ? 'resolved'
            : null
      );
      setCandidateLocalityName(snapshot.candidateLocalityName ?? null);
      setCreatePollPrompt(snapshot.cta?.prompt ?? snapshot.cta?.label ?? null);
      setPollFeedRequiresFreshNetwork(snapshot.source !== 'network');
      setPollFeedFreshnessError(false);
      if (nextMarketKey && !marketOverride) {
        setPersistedCity(nextMarketKey);
      }
    },
    [
      marketOverride,
      setCandidateLocalityName,
      setCreatePollPrompt,
      setMarketKey,
      setMarketName,
      setMarketStatus,
      setPersistedCity,
      setPollFeedFreshnessError,
      setPollFeedRequiresFreshNetwork,
      setPolls,
    ]
  );

  const refreshPollFeed = React.useCallback(
    async (options?: RefreshPollFeedOptions) => {
      const refreshSeq = ++refreshSeqRef.current;
      const skipSpinner = options?.skipSpinner ?? false;
      const marketKeyOverride = options?.marketKeyOverride ?? null;
      const marketNameFallback = options?.marketNameFallback ?? null;
      const retryAttempt = options?.retryAttempt ?? 0;
      let retryScheduled = false;
      const scheduleRetry = (nextAttempt: number, reason: string) => {
        // One pending retry at a time: REPLACE any pending handle before assigning, never
        // overwrite it — an overwritten (orphaned) timer outlives the unmount cleanup.
        clearScheduledPollFeedRetry();
        retryScheduled = true;
        logBootstrap({
          phase: 'feed-retry-scheduled',
          attempt: nextAttempt,
          maxAttempts: POLL_FEED_RETRY_BACKOFF_MS.length,
          delayMs: POLL_FEED_RETRY_BACKOFF_MS[nextAttempt - 1],
          reason,
        });
        retryTimeoutRef.current = setTimeout(
          () => {
            retryTimeoutRef.current = null;
            void refreshPollFeedRef.current?.({
              ...(options ?? {}),
              retryAttempt: nextAttempt,
            });
          },
          POLL_FEED_RETRY_BACKOFF_MS[nextAttempt - 1]
        );
      };

      setPollFeedFreshnessError(false);
      setPollFeedRefreshing(true);
      if (!skipSpinner) {
        setLoading(true);
      }

      const resolvedMarketKey = marketKeyOverride ?? marketOverride ?? null;
      const feedQuery = {
        state: feedStateRef.current,
        ...(feedSortRef.current ? { sort: feedSortRef.current } : {}),
        ...(feedTypeRef.current !== 'all' ? { type: feedTypeRef.current } : {}),
        ...(feedTimeRef.current !== 'all_time' ? { time: feedTimeRef.current } : {}),
      };
      const payload = resolvedMarketKey
        ? { marketKey: resolvedMarketKey, ...feedQuery }
        : bounds
          ? {
              bounds,
              ...(userLocation ? { userLocation } : {}),
              ...feedQuery,
            }
          : null;

      if (!payload) {
        // §9.4: a call that CANNOT fetch must never silently kill a live recovery ladder (this
        // exact silent-cancel killed attempt 2 on-device: bounds flapped null during startup
        // churn, the no-payload call entered, and the pending timer died with no log). If this
        // call IS the ladder, keep it alive; any pending timer from another caller is untouched
        // because a refresh only clears it when it actually fetches (below) — scheduleRetry
        // clears too, but only to REPLACE the handle with the rung it schedules in the same call.
        logBootstrap({ phase: 'feed-refresh-no-payload', retryAttempt });
        if (retryAttempt > 0 && retryAttempt < POLL_FEED_RETRY_BACKOFF_MS.length) {
          scheduleRetry(retryAttempt + 1, 'no-payload');
        }
        if (!retryScheduled) {
          if (refreshSeq === refreshSeqRef.current) {
            setPollFeedRefreshing(false);
          }
          if (!skipSpinner) {
            setLoading(false);
          }
        }
        return;
      }

      // Only a refresh that ACTUALLY fetches supersedes a pending backoff retry.
      clearScheduledPollFeedRetry();

      try {
        const response = await fetchPolls(payload);
        if (refreshSeq !== refreshSeqRef.current) {
          return;
        }
        const snapshot = createNetworkPollBootstrapSnapshot(response);
        applyPollSnapshot(snapshot, marketNameFallback);
        if (retryAttempt > 0) {
          logBootstrap({ phase: 'feed-retry-recovered', attempt: retryAttempt });
        }
        // Only the Live feed seeds the bootstrap cache; Results (closed) must not
        // overwrite the Live snapshot read on next launch.
        if (snapshot.marketKey && feedStateRef.current === 'active') {
          void writePollBootstrapSnapshot(snapshot);
        }
      } catch (error) {
        // §9.4 retry ladder: only the LATEST refresh may schedule a retry; a superseded
        // request's failure is stale. While a retry is pending, hold the loading/refreshing
        // state (the skeleton stays up) and defer the freshness error to the final give-up.
        const isLatestRefresh = refreshSeq === refreshSeqRef.current;
        if (isLatestRefresh && retryAttempt < POLL_FEED_RETRY_BACKOFF_MS.length) {
          scheduleRetry(retryAttempt + 1, 'fetch-failed');
        } else {
          if (isLatestRefresh && retryAttempt >= POLL_FEED_RETRY_BACKOFF_MS.length) {
            logBootstrap({ phase: 'feed-retry-give-up', attempts: retryAttempt });
          }
          if (pollFeedRequiresFreshNetwork) {
            setPollFeedFreshnessError(true);
          }
        }
        logger.error('Failed to load polls', error);
      } finally {
        if (!retryScheduled) {
          if (refreshSeq === refreshSeqRef.current) {
            setPollFeedRefreshing(false);
          }
          if (!skipSpinner) {
            setLoading(false);
          }
        }
      }
    },
    [
      applyPollSnapshot,
      bounds,
      clearScheduledPollFeedRetry,
      marketOverride,
      pollFeedRequiresFreshNetwork,
      setLoading,
      setPollFeedFreshnessError,
      setPollFeedRefreshing,
      userLocation,
    ]
  );
  refreshPollFeedRef.current = refreshPollFeed;

  // Never let a scheduled retry outlive the controller.
  React.useEffect(() => clearScheduledPollFeedRetry, [clearScheduledPollFeedRetry]);

  // Refetch when the Live/Results split or sort changes — but not on the initial
  // mount (the market/bounds effects below own the first load). `refreshPollFeed`
  // reads the toggle values via refs, so its identity stays stable here.
  const feedQueryHydratedRef = React.useRef(false);
  React.useEffect(() => {
    if (!feedQueryHydratedRef.current) {
      feedQueryHydratedRef.current = true;
      return;
    }
    if (!visible || isSystemUnavailable) {
      return;
    }
    // Quiet background refresh: never empty the list (which would collapse the
    // FlashList and scroll the filter strip out of view); the toggle/sort just
    // swaps the rows in place when the new query resolves.
    void refreshPollFeed({ skipSpinner: true });
  }, [feedState, feedSort, feedType, feedTime, visible, isSystemUnavailable, refreshPollFeed]);

  React.useEffect(() => {
    if (!bootstrapMarketKey) {
      return;
    }
    lastResolvedMarketKeyRef.current = bootstrapMarketKey;
  }, [bootstrapMarketKey]);

  React.useEffect(() => {
    if (!visible || isSystemUnavailable || !marketOverride) {
      return;
    }
    const normalizedOverride = marketOverride.trim().toLowerCase();
    let cancelled = false;

    void (async () => {
      const activeMarketKey = lastResolvedMarketKeyRef.current ?? bootstrapMarketKey;
      if (normalizedOverride !== activeMarketKey) {
        const cachedSnapshot = await readPollBootstrapSnapshotForMarket(normalizedOverride);
        if (cancelled) {
          return;
        }
        if (cachedSnapshot) {
          applyPollSnapshot(cachedSnapshot);
          setPollFeedRefreshing(true);
        }
      }

      if (!cancelled) {
        void refreshPollFeed({
          marketKeyOverride: marketOverride,
          skipSpinner: hasBootstrapSnapshot && normalizedOverride === bootstrapMarketKey,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    applyPollSnapshot,
    bootstrapMarketKey,
    hasBootstrapSnapshot,
    isSystemUnavailable,
    marketOverride,
    refreshPollFeed,
    setPollFeedRefreshing,
    visible,
  ]);

  React.useEffect(() => {
    if (!visible || isSystemUnavailable || marketOverride || !bounds) {
      return;
    }
    const activeMarketKey = lastResolvedMarketKeyRef.current ?? bootstrapMarketKey;
    if (!activeMarketKey || !hasBootstrapSnapshot) {
      void refreshPollFeed({ skipSpinner: hasBootstrapSnapshot });
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await resolveMarket(bounds, userLocation ?? null);
        if (cancelled) {
          return;
        }
        const nextKey =
          typeof response.market?.marketKey === 'string'
            ? response.market.marketKey.trim().toLowerCase()
            : '';
        const nextName =
          typeof response.market?.marketShortName === 'string' &&
          response.market.marketShortName.trim()
            ? response.market.marketShortName.trim()
            : typeof response.market?.marketName === 'string' && response.market.marketName.trim()
              ? response.market.marketName.trim()
              : null;
        const nextStatus =
          response.status === 'resolved' ||
          response.status === 'multi_market' ||
          response.status === 'no_market' ||
          response.status === 'error'
            ? response.status
            : null;
        const nextCandidateLocalityName =
          typeof response.resolution?.candidateLocalityName === 'string' &&
          response.resolution.candidateLocalityName.trim()
            ? response.resolution.candidateLocalityName.trim()
            : null;
        const nextPrompt =
          typeof response.cta?.prompt === 'string' && response.cta.prompt.trim()
            ? response.cta.prompt.trim()
            : typeof response.cta?.label === 'string' && response.cta.label.trim()
              ? response.cta.label.trim()
              : null;

        if (nextKey && nextKey === activeMarketKey) {
          if (nextName) {
            setMarketName(nextName);
          }
          setMarketStatus(nextStatus);
          setCandidateLocalityName(nextCandidateLocalityName);
          setCreatePollPrompt(nextPrompt);
          if (pollFeedRequiresFreshNetwork) {
            void refreshPollFeed({
              marketKeyOverride: nextKey || null,
              marketNameFallback: nextName,
              skipSpinner: true,
            });
          }
          return;
        }

        setMarketKey(nextKey || null);
        setMarketName(nextName);
        setMarketStatus(nextStatus);
        setCandidateLocalityName(nextCandidateLocalityName);
        setCreatePollPrompt(nextPrompt);

        if (nextKey) {
          const cachedSnapshot = await readPollBootstrapSnapshotForMarket(nextKey);
          if (cancelled) {
            return;
          }
          if (cachedSnapshot) {
            applyPollSnapshot(cachedSnapshot, nextName);
            setPollFeedRefreshing(true);
          }
        }

        void refreshPollFeed({
          marketKeyOverride: nextKey || null,
          marketNameFallback: nextName,
          skipSpinner: true,
        });
      } catch (error) {
        logger.warn('Market revalidation failed', {
          message: error instanceof Error ? error.message : 'unknown',
        });
        void refreshPollFeed({ skipSpinner: hasBootstrapSnapshot });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    applyPollSnapshot,
    bootstrapMarketKey,
    bounds,
    hasBootstrapSnapshot,
    isSystemUnavailable,
    marketOverride,
    pollFeedRequiresFreshNetwork,
    refreshPollFeed,
    setCandidateLocalityName,
    setCreatePollPrompt,
    setMarketKey,
    setMarketName,
    setMarketStatus,
    setPollFeedRefreshing,
    userLocation,
    visible,
  ]);

  React.useEffect(() => {
    if (!pollIdParam) {
      return;
    }
    if (!visible || isSystemUnavailable) {
      return;
    }
    // Deep-linking to a poll refreshes the feed so the target is present.
    void refreshPollFeed();
  }, [isSystemUnavailable, pollIdParam, refreshPollFeed, visible]);

  React.useEffect(() => {
    if (!visible) {
      return;
    }

    const baseUrl = typeof API_BASE_URL === 'string' ? API_BASE_URL : '';
    if (!baseUrl) {
      return;
    }
    const base = baseUrl.replace(/\/api(?:\/v\d+)?$/, '');
    socketRef.current = io(`${base}/polls`, {
      transports: ['websocket'],
    });
    const socketTaskRef: {
      current: ReturnType<typeof InteractionManager.runAfterInteractions> | null;
    } = { current: null };

    const handleSocketUpdate = () => {
      if (interactionRef?.current.isInteracting) {
        if (socketTaskRef.current) {
          return;
        }
        socketTaskRef.current = InteractionManager.runAfterInteractions(() => {
          socketTaskRef.current = null;
          if (!visible) {
            return;
          }
          void refreshPollFeed({ skipSpinner: true });
        });
        return;
      }

      void refreshPollFeed({ skipSpinner: true });
    };

    socketRef.current.on('poll:update', handleSocketUpdate);

    return () => {
      socketRef.current?.disconnect();
      socketTaskRef.current?.cancel();
    };
  }, [interactionRef, refreshPollFeed, visible]);

  return React.useMemo(
    () => ({
      refreshPollFeed,
    }),
    [refreshPollFeed]
  );
};
