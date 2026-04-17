import React from 'react';
import { InteractionManager } from 'react-native';
import { io, type Socket } from 'socket.io-client';

import { API_BASE_URL } from '../../../services/api';
import { resolveMarket } from '../../../services/markets';
import {
  addPollOption,
  createNetworkPollBootstrapSnapshot,
  fetchPolls,
  readPollBootstrapSnapshotForMarket,
  voteOnPoll,
  writePollBootstrapSnapshot,
  type Poll,
  type PollBootstrapSnapshot,
} from '../../../services/polls';
import type { Coordinate, MapBounds } from '../../../types';
import { logger } from '../../../utils';

type InteractionRef = React.MutableRefObject<{ isInteracting: boolean }>;

type PollOptionPayload = {
  label: string;
  restaurantId?: string;
  dishEntityId?: string;
  restaurantName?: string;
  dishName?: string;
};

type RefreshPollFeedOptions = {
  focusPollId?: string | null;
  skipSpinner?: boolean;
  marketKeyOverride?: string | null;
  marketNameFallback?: string | null;
};

type UsePollsRuntimeControllerArgs = {
  visible: boolean;
  bounds?: MapBounds | null;
  bootstrapSnapshot?: PollBootstrapSnapshot | null;
  userLocation?: Coordinate | null;
  marketOverride?: string | null;
  pollFeedRequiresFreshNetwork: boolean;
  setSelectedPollId: React.Dispatch<React.SetStateAction<string | null>>;
  setPolls: React.Dispatch<React.SetStateAction<Poll[]>>;
  setMarketKey: React.Dispatch<React.SetStateAction<string | null>>;
  setMarketName: React.Dispatch<React.SetStateAction<string | null>>;
  setMarketStatus: React.Dispatch<React.SetStateAction<'resolved' | 'no_market' | 'error' | null>>;
  setCandidatePlaceName: React.Dispatch<React.SetStateAction<string | null>>;
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

type UsePollsRuntimeControllerResult = {
  refreshPollFeed: (options?: RefreshPollFeedOptions) => Promise<void>;
  castVote: (pollId: string, optionId: string) => Promise<void>;
  submitPollOption: (pollId: string, payload: PollOptionPayload) => Promise<void>;
};

export const usePollsRuntimeController = ({
  visible,
  bounds,
  bootstrapSnapshot,
  userLocation,
  marketOverride,
  pollFeedRequiresFreshNetwork,
  setSelectedPollId,
  setPolls,
  setMarketKey,
  setMarketName,
  setMarketStatus,
  setCandidatePlaceName,
  setCreatePollPrompt,
  setLoading,
  setPollFeedRefreshing,
  setPollFeedRequiresFreshNetwork,
  setPollFeedFreshnessError,
  setPersistedCity,
  isSystemUnavailable,
  pollIdParam,
  interactionRef,
}: UsePollsRuntimeControllerArgs): UsePollsRuntimeControllerResult => {
  const socketRef = React.useRef<Socket | null>(null);
  const pendingPollIdRef = React.useRef<string | null>(null);
  const lastResolvedMarketKeyRef = React.useRef<string | null>(null);
  const refreshSeqRef = React.useRef(0);
  const bootstrapMarketKey =
    typeof bootstrapSnapshot?.marketKey === 'string' && bootstrapSnapshot.marketKey.trim()
      ? bootstrapSnapshot.marketKey.trim().toLowerCase()
      : null;
  const hasBootstrapSnapshot = Boolean(
    bootstrapSnapshot &&
      (bootstrapSnapshot.polls.length > 0 || bootstrapSnapshot.marketName || bootstrapMarketKey)
  );

  const applyPollSnapshot = React.useCallback(
    (
      snapshot: PollBootstrapSnapshot,
      focusPollId?: string | null,
      marketNameFallback?: string | null
    ) => {
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
          snapshot.marketStatus === 'no_market' ||
          snapshot.marketStatus === 'error'
          ? snapshot.marketStatus
          : nextMarketKey
            ? 'resolved'
            : null
      );
      setCandidatePlaceName(snapshot.candidatePlaceName ?? null);
      setCreatePollPrompt(snapshot.cta?.prompt ?? snapshot.cta?.label ?? null);
      setPollFeedRequiresFreshNetwork(snapshot.source !== 'network');
      setPollFeedFreshnessError(false);
      if (nextMarketKey && !marketOverride) {
        setPersistedCity(nextMarketKey);
      }

      setSelectedPollId((current) => {
        const normalizedPolls = snapshot.polls;
        if (!normalizedPolls.length) {
          return null;
        }
        if (focusPollId && normalizedPolls.some((poll) => poll.pollId === focusPollId)) {
          return focusPollId;
        }
        if (
          pendingPollIdRef.current &&
          normalizedPolls.some((poll) => poll.pollId === pendingPollIdRef.current)
        ) {
          const nextSelection = pendingPollIdRef.current;
          pendingPollIdRef.current = null;
          return nextSelection;
        }
        if (current && normalizedPolls.some((poll) => poll.pollId === current)) {
          return current;
        }
        return normalizedPolls[0].pollId;
      });
    },
    [
      marketOverride,
      setMarketKey,
      setMarketName,
      setCandidatePlaceName,
      setCreatePollPrompt,
      setMarketStatus,
      setPersistedCity,
      setPollFeedRequiresFreshNetwork,
      setPollFeedFreshnessError,
      setPolls,
      setSelectedPollId,
    ]
  );

  const refreshPollFeed = React.useCallback(
    async (options?: RefreshPollFeedOptions) => {
      const refreshSeq = ++refreshSeqRef.current;
      const skipSpinner = options?.skipSpinner ?? false;
      const focusPollId = options?.focusPollId ?? null;
      const marketKeyOverride = options?.marketKeyOverride ?? null;
      const marketNameFallback = options?.marketNameFallback ?? null;

      setPollFeedFreshnessError(false);
      setPollFeedRefreshing(true);
      if (!skipSpinner) {
        setLoading(true);
      }

      const resolvedMarketKey = marketKeyOverride ?? marketOverride ?? null;
      const payload = resolvedMarketKey
        ? { marketKey: resolvedMarketKey }
        : bounds
          ? {
              bounds,
              ...(userLocation ? { userLocation } : {}),
            }
          : null;

      if (!payload) {
        if (refreshSeq === refreshSeqRef.current) {
          setPollFeedRefreshing(false);
        }
        if (!skipSpinner) {
          setLoading(false);
        }
        return;
      }

      try {
        const response = await fetchPolls(payload);
        if (refreshSeq !== refreshSeqRef.current) {
          return;
        }
        const snapshot = createNetworkPollBootstrapSnapshot(response);
        applyPollSnapshot(snapshot, focusPollId, marketNameFallback);
        if (snapshot.marketKey) {
          void writePollBootstrapSnapshot(snapshot);
        }
      } catch (error) {
        if (pollFeedRequiresFreshNetwork) {
          setPollFeedFreshnessError(true);
        }
        logger.error('Failed to load polls', error);
      } finally {
        if (refreshSeq === refreshSeqRef.current) {
          setPollFeedRefreshing(false);
        }
        if (!skipSpinner) {
          setLoading(false);
        }
      }
    },
    [
      applyPollSnapshot,
      bounds,
      userLocation,
      marketOverride,
      pollFeedRequiresFreshNetwork,
      setLoading,
      setPollFeedFreshnessError,
      setPollFeedRefreshing,
    ]
  );

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
          applyPollSnapshot(cachedSnapshot, pollIdParam);
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
    marketOverride,
    hasBootstrapSnapshot,
    isSystemUnavailable,
    pollIdParam,
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
          response.status === 'no_market' ||
          response.status === 'error'
            ? response.status
            : null;
        const nextCandidatePlaceName =
          typeof response.resolution?.candidatePlaceName === 'string' &&
          response.resolution.candidatePlaceName.trim()
            ? response.resolution.candidatePlaceName.trim()
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
          setCandidatePlaceName(nextCandidatePlaceName);
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
        setCandidatePlaceName(nextCandidatePlaceName);
        setCreatePollPrompt(nextPrompt);

        if (nextKey) {
          const cachedSnapshot = await readPollBootstrapSnapshotForMarket(nextKey);
          if (cancelled) {
            return;
          }
          if (cachedSnapshot) {
            applyPollSnapshot(cachedSnapshot, null, nextName);
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
    bootstrapMarketKey,
    bounds,
    userLocation,
    marketOverride,
    hasBootstrapSnapshot,
    isSystemUnavailable,
    pollFeedRequiresFreshNetwork,
    refreshPollFeed,
    applyPollSnapshot,
    setMarketKey,
    setMarketName,
    setCandidatePlaceName,
    setCreatePollPrompt,
    setMarketStatus,
    setPollFeedRefreshing,
    visible,
  ]);

  React.useEffect(() => {
    if (!pollIdParam) {
      return;
    }
    pendingPollIdRef.current = pollIdParam;
    if (!visible || isSystemUnavailable) {
      return;
    }
    void refreshPollFeed({ focusPollId: pollIdParam });
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

  const castVote = React.useCallback(
    async (pollId: string, optionId: string) => {
      try {
        await voteOnPoll(pollId, { optionId });
        await refreshPollFeed();
      } catch (error) {
        logger.error('Vote failed', error);
      }
    },
    [refreshPollFeed]
  );

  const submitPollOption = React.useCallback(
    async (pollId: string, payload: PollOptionPayload) => {
      try {
        await addPollOption(pollId, payload);
        await refreshPollFeed({ focusPollId: pollId });
      } catch (error) {
        logger.error('Failed to add poll option', error);
      }
    },
    [refreshPollFeed]
  );

  return {
    refreshPollFeed,
    castVote,
    submitPollOption,
  };
};
