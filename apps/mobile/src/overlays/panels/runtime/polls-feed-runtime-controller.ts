import React from 'react';
import { InteractionManager } from 'react-native';
import { io, type Socket } from 'socket.io-client';

import { API_BASE_URL } from '../../../services/api';
import {
  fetchPolls,
  type Poll,
  type PollFeedPromise,
  type PollFeedSort,
  type PollFeedTime,
  type PollFeedType,
  type PollQueryPayload,
  type PollQueryResponse,
} from '../../../services/polls';
import type { MapBounds } from '../../../types';
import { useContentToggle } from '../../../toggles/use-content-toggle';
import {
  getPollsFeedControlsSnapshot,
  restorePollsFeedControls,
  subscribeToPollsFeedControlChanges,
  usePollsFeedControlsStore,
  POLL_FEED_PLACE_FILTER_ALL,
  type PollFeedPlaceOption,
} from './polls-feed-controls-store';
import { shouldRefetchPollsFeedForSettledBounds } from './polls-feed-refetch-edge';
import { subscribeToReconnect } from '../../../store/systemStatusStore';
import {
  getViewportSubjectState,
  subscribeViewportSubjectState,
} from '../../../store/viewport-subject-store';
import { logger } from '../../../utils';

type InteractionRef = React.MutableRefObject<{ isInteracting: boolean }>;

// §9.4 (page-switch-master-plan.md) startup-polls retry policy: this controller is the SINGLE
// owner of poll fetching. On a failed load, retry quietly with backoff, then give up to the
// skeleton / manual-refresh state. Any explicit refresh (pull, toggle, socket, bounds change)
// supersedes a pending retry and resets the ladder.
const POLL_FEED_RETRY_BACKOFF_MS = [2_000, 5_000, 10_000] as const;

// [pageswitch] P1-addendum bootstrap probe — same JSONL family as the coordinator's bootstrap
// lifecycle probe so the startup-polls fetch/retry story is greppable in /tmp/crave-metro.log.
const logBootstrap = (data: Record<string, unknown>): void => {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[pageswitch] bootstrap ${JSON.stringify(data)}`);
  }
};

/**
 * §6 slicer options: places present in the LOADED feed pages, ranked by content
 * contribution (count of polls contributed), name as the deterministic tiebreak.
 */
const derivePlaceOptions = (polls: readonly Poll[]): PollFeedPlaceOption[] => {
  const byPlaceId = new Map<string, PollFeedPlaceOption>();
  for (const poll of polls) {
    if (!poll.placeId || !poll.placeName) {
      continue;
    }
    const existing = byPlaceId.get(poll.placeId);
    if (existing) {
      existing.pollCount += 1;
    } else {
      byPlaceId.set(poll.placeId, {
        placeId: poll.placeId,
        placeName: poll.placeName,
        pollCount: 1,
      });
    }
  }
  return [...byPlaceId.values()].sort(
    (left, right) =>
      right.pollCount - left.pollCount || left.placeName.localeCompare(right.placeName)
  );
};

/**
 * The honest resolution of one refresh (leg 5 failure path): the content-toggle
 * runner must be able to FAIL when the slice it committed did not land — a runner
 * that swallows its own error makes the engine's 'failed' edge unreachable and
 * leaves the optimistically-flipped control lying over stale content.
 * - 'applied'     — fetched and published (latest).
 * - 'superseded'  — fetched but a newer refresh owns the feed; that one reads the
 *                   live control refs, so it carries the slice (not a failure).
 * - 'unavailable' — could not fetch at all (no bounds yet).
 * - 'failed'      — the fetch threw (the retry ladder may still be running).
 */
export type PollFeedRefreshOutcome = 'applied' | 'superseded' | 'unavailable' | 'failed';

type RefreshPollFeedOptions = {
  skipSpinner?: boolean;
  /** Internal (retry ladder only): which backoff attempt this call is. External callers omit it. */
  retryAttempt?: number;
};

type UsePollsFeedRuntimeControllerArgs = {
  visible: boolean;
  /** Live (`active`) vs Results (`closed`) feed split (§4/§6). */
  feedState: 'active' | 'closed';
  /** Selected sort, or null for the silent demand-ranked default. */
  feedSort: PollFeedSort;
  /** Type filter: all (no filter) | polls (ranked) | discussions (§6). */
  feedType: PollFeedType;
  /** Time filter: all_time (no filter) | this_week (§6). */
  feedTime: PollFeedTime;
  setPolls: React.Dispatch<React.SetStateAction<Poll[]>>;
  setHeaderPlaceName: React.Dispatch<React.SetStateAction<string | null>>;
  setPromise: React.Dispatch<React.SetStateAction<PollFeedPromise | null>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setPollFeedRefreshing: React.Dispatch<React.SetStateAction<boolean>>;
  setPollFeedLoadFailed: React.Dispatch<React.SetStateAction<boolean>>;
  isSystemUnavailable: boolean;
  pollIdParam?: string | null;
  interactionRef?: InteractionRef;
};

export type PollsFeedRuntimeController = {
  refreshPollFeed: (options?: RefreshPollFeedOptions) => Promise<PollFeedRefreshOutcome>;
  /**
   * Cursor pagination (§6 — CURSOR PAGINATION is a prerequisite; the take-25 is
   * dead): fetch the next keyset page when the list nears its end and APPEND it.
   * Single-flight; a refresh (toggle/bounds/socket) supersedes an in-flight page.
   */
  loadMorePolls: () => void;
  /**
   * The feed-query toggle commit (leg 4 — useContentToggle, audit D5): a control
   * write flips the strip optimistically and lands here; the content seam exits the
   * old cards on the SAME press edge, coalesces a tap burst into ONE quiet refresh
   * (~300ms after the last tap), and the refresh's resolution snaps the new slice in.
   */
  scheduleFeedQueryCommit: () => void;
  /**
   * 'awaiting' between press-up (old cards out) and content-ready (new slice in) —
   * the body renders NOTHING during it: bare white under the header strip, never a
   * skeleton, never a stale empty-state message.
   */
  isFeedSliceAwaiting: boolean;
};

export const usePollsFeedRuntimeController = ({
  visible,
  feedState,
  feedSort,
  feedType,
  feedTime,
  setPolls,
  setHeaderPlaceName,
  setPromise,
  setLoading,
  setPollFeedRefreshing,
  setPollFeedLoadFailed,
  isSystemUnavailable,
  pollIdParam,
  interactionRef,
}: UsePollsFeedRuntimeControllerArgs): PollsFeedRuntimeController => {
  const socketRef = React.useRef<Socket | null>(null);
  const refreshSeqRef = React.useRef(0);
  // §9.4 retry ladder: the pending backoff timer + a live ref to the latest refresh callback so
  // a scheduled retry always runs with fresh bounds inputs.
  const retryTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshPollFeedRef = React.useRef<
    ((options?: RefreshPollFeedOptions) => Promise<PollFeedRefreshOutcome>) | null
  >(null);
  // Cursor pagination state: the loaded pages + the next keyset cursor. Refs, not
  // state — the CONTROLLER owns append mechanics; the runtime's `polls` state is the
  // published composite.
  const loadedPollsRef = React.useRef<Poll[]>([]);
  const nextCursorRef = React.useRef<string | null>(null);
  const isLoadingMoreRef = React.useRef(false);
  const hasEverAppliedSliceRef = React.useRef(false);
  // Leg 3 refetch-edge state: the bounds of the last fetch this controller
  // REQUESTED (recorded at payload-build time — the retry ladder, not the
  // edge, owns failure recovery). Compared by exact value against the subject
  // store's settledBounds to decide a refetch.
  const lastRequestedBoundsRef = React.useRef<MapBounds | null>(null);
  const clearScheduledPollFeedRetry = React.useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);
  // Read inside refreshPollFeed so every fetch uses the live toggle values without
  // re-creating the callback (which would re-trigger the bounds effect).
  const feedStateRef = React.useRef(feedState);
  feedStateRef.current = feedState;
  const feedSortRef = React.useRef(feedSort);
  feedSortRef.current = feedSort;
  const feedTypeRef = React.useRef(feedType);
  feedTypeRef.current = feedType;
  const feedTimeRef = React.useRef(feedTime);
  feedTimeRef.current = feedTime;
  // Live visibility gate for commit-time / page-time re-checks (render-phase ref
  // write, same pattern as the feed*Refs above).
  const visibilityGateRef = React.useRef({ visible, isSystemUnavailable });
  visibilityGateRef.current = { visible, isSystemUnavailable };

  /**
   * Publish one settled slice composite: the list, the §2 header verdict, the §6
   * promise state, the "Live · N" count, and the slicer options (places present in
   * the loaded pages). Also reconciles a stale place filter — a selected place that
   * left the loaded set snaps the slicer back to All.
   */
  const publishFeedSlice = React.useCallback(
    (params: {
      polls: Poll[];
      headerPlaceName: string | null;
      promise: PollFeedPromise | null;
      nextCursor: string | null;
    }) => {
      loadedPollsRef.current = params.polls;
      nextCursorRef.current = params.nextCursor;
      hasEverAppliedSliceRef.current = true;
      setPolls(params.polls);
      setHeaderPlaceName(params.headerPlaceName);
      setPromise(params.promise);
      setPollFeedLoadFailed(false);
      // Wave-2 §3 "Live · N": the body owns the count; chrome reads it from the
      // controls store. Only an ACTIVE-state slice updates it (a Closed slice says
      // nothing about how many polls are live); the last-known count is retained
      // while browsing Closed.
      const controls = usePollsFeedControlsStore.getState();
      if (feedStateRef.current === 'active') {
        controls.setLiveCount(params.polls.length);
      }
      const placeOptions = derivePlaceOptions(params.polls);
      controls.setPlaceOptions(placeOptions);
      if (
        controls.placeFilter !== POLL_FEED_PLACE_FILTER_ALL &&
        !placeOptions.some((option) => option.placeId === controls.placeFilter)
      ) {
        controls.setPlaceFilter(POLL_FEED_PLACE_FILTER_ALL);
      }
    },
    [setHeaderPlaceName, setPollFeedLoadFailed, setPolls, setPromise]
  );

  const buildFeedQueryPayload = React.useCallback(
    (cursor?: string | null): PollQueryPayload | null => {
      // Leg 3: THE bounds source is the subject store's settled viewport — the
      // settle+dwell primitive's 240ms-quiescent bounds, updated globally on
      // every camera move regardless of which sheet is open. The old gated
      // pollBounds thread (map-idle + shouldShowPollsSheet + significance gate
      // + motion-pressure parking) is dead.
      const bounds = getViewportSubjectState().settledBounds;
      if (!bounds) {
        return null;
      }
      lastRequestedBoundsRef.current = bounds;
      // Wave-2 §3: sort is never null (New is the stated default, not an omission);
      // the time period is folded INTO Top — it is only sent when Top is the sort.
      return {
        bounds,
        state: feedStateRef.current,
        sort: feedSortRef.current,
        ...(feedTypeRef.current !== 'all' ? { type: feedTypeRef.current } : {}),
        ...(feedSortRef.current === 'top' && feedTimeRef.current !== 'all_time'
          ? { time: feedTimeRef.current }
          : {}),
        ...(cursor ? { cursor } : {}),
      };
    },
    []
  );

  const refreshPollFeed = React.useCallback(
    async (options?: RefreshPollFeedOptions): Promise<PollFeedRefreshOutcome> => {
      const refreshSeq = ++refreshSeqRef.current;
      const skipSpinner = options?.skipSpinner ?? false;
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

      setPollFeedLoadFailed(false);
      setPollFeedRefreshing(true);
      if (!skipSpinner) {
        setLoading(true);
      }

      // The §22 contract: bounds ALWAYS (the viewport IS the request); a refresh is
      // a first-page read, so no cursor.
      const payload = buildFeedQueryPayload(null);

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
        return 'unavailable';
      }

      // Only a refresh that ACTUALLY fetches supersedes a pending backoff retry.
      clearScheduledPollFeedRetry();

      try {
        const response: PollQueryResponse = await fetchPolls(payload);
        if (refreshSeq !== refreshSeqRef.current) {
          return 'superseded';
        }
        publishFeedSlice({
          polls: response.polls,
          headerPlaceName: response.header.placeName,
          promise: response.promise,
          nextCursor: response.nextCursor,
        });
        if (retryAttempt > 0) {
          logBootstrap({ phase: 'feed-retry-recovered', attempt: retryAttempt });
        }
        return 'applied';
      } catch (error) {
        // §9.4 retry ladder: only the LATEST refresh may schedule a retry; a superseded
        // request's failure is stale. While a retry is pending, hold the loading/refreshing
        // state (the skeleton stays up) and defer the failure verdict to the final give-up.
        const isLatestRefresh = refreshSeq === refreshSeqRef.current;
        if (isLatestRefresh && retryAttempt < POLL_FEED_RETRY_BACKOFF_MS.length) {
          scheduleRetry(retryAttempt + 1, 'fetch-failed');
        } else if (isLatestRefresh) {
          logBootstrap({ phase: 'feed-retry-give-up', attempts: retryAttempt });
          setPollFeedLoadFailed(true);
        }
        logger.error('Failed to load polls', error);
        return 'failed';
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
      buildFeedQueryPayload,
      clearScheduledPollFeedRetry,
      publishFeedSlice,
      setLoading,
      setPollFeedLoadFailed,
      setPollFeedRefreshing,
    ]
  );
  refreshPollFeedRef.current = refreshPollFeed;

  // §6 cursor pagination: append the next keyset page. Latest-wins against
  // refreshes — a refresh bumps refreshSeq, so a page that resolves after a
  // supersession is DROPPED (its cursor belongs to the replaced list).
  const loadMorePolls = React.useCallback(() => {
    const cursor = nextCursorRef.current;
    if (!cursor || isLoadingMoreRef.current) {
      return;
    }
    const gate = visibilityGateRef.current;
    if (!gate.visible || gate.isSystemUnavailable) {
      return;
    }
    const payload = buildFeedQueryPayload(cursor);
    if (!payload) {
      return;
    }
    const refreshSeqAtRequest = refreshSeqRef.current;
    isLoadingMoreRef.current = true;
    void (async () => {
      try {
        const response = await fetchPolls(payload);
        if (refreshSeqRef.current !== refreshSeqAtRequest) {
          return;
        }
        const loadedIds = new Set(loadedPollsRef.current.map((poll) => poll.pollId));
        const appended = [
          ...loadedPollsRef.current,
          ...response.polls.filter((poll) => !loadedIds.has(poll.pollId)),
        ];
        publishFeedSlice({
          polls: appended,
          headerPlaceName: response.header.placeName,
          // The promise is a FIRST-PAGE cold-start state; an append never creates one.
          promise: null,
          nextCursor: response.nextCursor,
        });
      } catch (error) {
        // A failed page is quiet: the loaded list stands, the cursor stands, the next
        // end-proximity pass retries. No ladder — pagination is user-re-triggerable.
        logger.warn('Failed to load more polls', {
          message: error instanceof Error ? error.message : 'unknown',
        });
      } finally {
        isLoadingMoreRef.current = false;
      }
    })();
  }, [buildFeedQueryPayload, publishFeedSlice]);

  // Never let a scheduled retry outlive the controller.
  React.useEffect(() => clearScheduledPollFeedRetry, [clearScheduledPollFeedRetry]);

  // OFFLINE RESUME (foundation-hardening §A): the owner's law is that the offline
  // hang is FINITE on every surface. Search resumes its paused desire on reconnect;
  // the feed's equivalent desire is "fresh polls", so the reconnect edge fires one
  // quiet in-place refresh (skipSpinner — the list never empties; the refresh's own
  // latest-wins seq guard + ladder supersede make a redundant refresh harmless).
  React.useEffect(
    () =>
      subscribeToReconnect(() => {
        const gate = visibilityGateRef.current;
        if (!gate.visible || gate.isSystemUnavailable) {
          return;
        }
        void refreshPollFeedRef.current?.({ skipSpinner: true });
      }),
    []
  );

  // Feed-query toggles ride the CONTENT-TOGGLE SEAM (leg 4 — audit D5; this replaced
  // the leg-3 bare-engine wiring). The runner reads the live toggle values via
  // refreshPollFeed's own refs and re-checks the visibility gate at commit time;
  // refreshPollFeed's internal latest-wins seq guard drops a stale landing the
  // engine's cancel can't abort. Failure UX stays with the controller's retry ladder
  // + deferred load-failed verdict (never the modal); the seam settles the phase on
  // the runner's resolution either way, so the surface can never park on bare white.
  const { seam: feedContentToggleSeam, phase: feedContentPhase } = useContentToggle<'feed_query'>({
    surfaceName: 'polls-feed',
    // Leg 5 failure path: the seam holds a restore to the last SETTLED control
    // snapshot and fires it on the 'failed' edge — the optimistic pill snaps back so
    // the control never lies over stale content. The restore write is suppressed
    // from the press-edge subscription (no revert→commit loop); the retry ladder
    // keeps running and reads the restored live refs, so it refreshes the OLD slice.
    captureControlBaseline: () => {
      const snapshot = getPollsFeedControlsSnapshot();
      return () => restorePollsFeedControls(snapshot);
    },
  });
  const scheduleFeedQueryCommit = React.useCallback(() => {
    feedContentToggleSeam.scheduleCommit(
      async () => {
        const gate = visibilityGateRef.current;
        if (!gate.visible || gate.isSystemUnavailable) {
          return;
        }
        // skipSpinner: no loading skeleton — the choreography's gap is the seam's
        // 'awaiting' phase (old cards already out; new rows snap in on this
        // resolution). The strip is header chrome since leg 3, so an empty body can
        // no longer scroll the strip away.
        const outcome = await refreshPollFeedRef.current?.({ skipSpinner: true });
        // Honest runner (leg 5): the slice did not land → reject → engine 'failed' →
        // the seam reverts the control baseline. 'superseded' is NOT a failure (the
        // newer refresh reads the live refs and carries the slice).
        if (outcome === 'failed' || outcome === 'unavailable') {
          throw new Error(`poll feed slice did not land (${outcome})`);
        }
      },
      { kind: 'feed_query' }
    );
  }, [feedContentToggleSeam]);
  // The strip (persistent-header chrome) writes the feed-controls STORE; the
  // consequence stays HERE, with its owner — a control-value change IS the press
  // edge, and zustand notifies synchronously inside the press handler's stack, so
  // the seam's 'awaiting' flip lands in the same React batch as the control's
  // optimistic flip: old cards exit on press-up, by construction.
  React.useEffect(
    () => subscribeToPollsFeedControlChanges(scheduleFeedQueryCommit),
    [scheduleFeedQueryCommit]
  );

  // THE VIEWPORT EDGE (§22 item 5, re-pointed by leg 3 of the header
  // subject-store design): the feed is bounds-scoped, so the SUBJECT STORE's
  // settle tick is the fetch trigger — the store subscribes to the viewport
  // stream globally (sheet open or closed) and its settledBounds reference
  // turns over exactly at settle. Two causes fire a refetch, both through the
  // same exact-inequality edge (shouldRefetchPollsFeedForSettledBounds):
  //   - 'settle-edge'      — the camera settled on different bounds while the
  //                          feed is active.
  //   - 'activation-diff'  — the feed just became active (sheet open / scene
  //                          activation / mount) and the world moved while it
  //                          was not: compare last-requested vs the store's
  //                          CURRENT settled bounds. This closes the owner's
  //                          repro: pan to San Antonio with the sheet closed →
  //                          open the sheet → fresh feed.
  // While the feed is INACTIVE (visible false) this effect is torn down — no
  // wasted network — but the store keeps settling underneath it.
  // First-ever slice shows the skeleton; every later refetch swaps in-place
  // (skipSpinner — the old slice stands until the new one lands).
  React.useEffect(() => {
    if (!visible || isSystemUnavailable) {
      return;
    }
    const refetchIfSettledBoundsDiffer = (cause: 'settle-edge' | 'activation-diff') => {
      const settledBounds = getViewportSubjectState().settledBounds;
      const shouldRefetch = shouldRefetchPollsFeedForSettledBounds({
        settledBounds,
        lastRequestedBounds: lastRequestedBoundsRef.current,
      });
      // [SUBJECT-STORE] marker: THE polls-feed refetch edge. A pan-then-open
      // repro must show an 'activation-diff' line; a pan with the feed active
      // must show 'settle-edge' lines. No line = the settle never reached the
      // store (look at the controller's 'settle' markers first).
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log(
          `[SUBJECT-STORE] polls-feed refetch ${JSON.stringify({
            cause,
            shouldRefetch,
            settledBounds,
          })}`
        );
      }
      if (!shouldRefetch) {
        return;
      }
      void refreshPollFeed({ skipSpinner: hasEverAppliedSliceRef.current });
    };
    refetchIfSettledBoundsDiffer('activation-diff');
    let lastSeenSettledBounds = getViewportSubjectState().settledBounds;
    return subscribeViewportSubjectState(() => {
      const settledBounds = getViewportSubjectState().settledBounds;
      if (settledBounds === lastSeenSettledBounds) {
        // A verdict/slice commit, not a settle tick — not this consumer's edge.
        return;
      }
      lastSeenSettledBounds = settledBounds;
      refetchIfSettledBoundsDiffer('settle-edge');
    });
  }, [isSystemUnavailable, refreshPollFeed, visible]);

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
      loadMorePolls,
      scheduleFeedQueryCommit,
      isFeedSliceAwaiting: feedContentPhase === 'awaiting',
    }),
    [feedContentPhase, loadMorePolls, refreshPollFeed, scheduleFeedQueryCommit]
  );
};
