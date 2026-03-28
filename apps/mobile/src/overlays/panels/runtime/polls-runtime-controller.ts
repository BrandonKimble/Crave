import React from 'react';
import { InteractionManager } from 'react-native';
import { io, type Socket } from 'socket.io-client';

import { API_BASE_URL } from '../../../services/api';
import { resolveCoverage } from '../../../services/coverage';
import {
  addPollOption,
  createNetworkPollBootstrapSnapshot,
  fetchPolls,
  readPollBootstrapSnapshotForCoverage,
  voteOnPoll,
  writePollBootstrapSnapshot,
  type Poll,
  type PollBootstrapSnapshot,
} from '../../../services/polls';
import type { MapBounds } from '../../../types';
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
  coverageKeyOverride?: string | null;
};

type UsePollsRuntimeControllerArgs = {
  visible: boolean;
  bounds?: MapBounds | null;
  bootstrapSnapshot?: PollBootstrapSnapshot | null;
  coverageOverride?: string | null;
  pollFeedRequiresFreshNetwork: boolean;
  setSelectedPollId: React.Dispatch<React.SetStateAction<string | null>>;
  setPolls: React.Dispatch<React.SetStateAction<Poll[]>>;
  setCoverageKey: React.Dispatch<React.SetStateAction<string | null>>;
  setCoverageName: React.Dispatch<React.SetStateAction<string | null>>;
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
  coverageOverride,
  pollFeedRequiresFreshNetwork,
  setSelectedPollId,
  setPolls,
  setCoverageKey,
  setCoverageName,
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
  const lastResolvedCoverageKeyRef = React.useRef<string | null>(null);
  const refreshSeqRef = React.useRef(0);
  const bootstrapCoverageKey =
    typeof bootstrapSnapshot?.coverageKey === 'string' && bootstrapSnapshot.coverageKey.trim()
      ? bootstrapSnapshot.coverageKey.trim().toLowerCase()
      : null;
  const hasBootstrapSnapshot = Boolean(
    bootstrapSnapshot &&
      (bootstrapSnapshot.polls.length > 0 || bootstrapSnapshot.coverageName || bootstrapCoverageKey)
  );

  const applyPollSnapshot = React.useCallback(
    (snapshot: PollBootstrapSnapshot, focusPollId?: string | null) => {
      const nextCoverageKey = snapshot.coverageKey;
      const normalizedKey =
        typeof nextCoverageKey === 'string' ? nextCoverageKey.trim().toLowerCase() : null;
      if (normalizedKey) {
        lastResolvedCoverageKeyRef.current = normalizedKey;
      }
      setPolls(snapshot.polls);
      setCoverageKey(nextCoverageKey);
      setCoverageName(snapshot.coverageName);
      setPollFeedRequiresFreshNetwork(snapshot.source !== 'network');
      setPollFeedFreshnessError(false);
      if (nextCoverageKey && !coverageOverride) {
        setPersistedCity(nextCoverageKey);
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
      coverageOverride,
      setCoverageKey,
      setCoverageName,
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
      const coverageKeyOverride = options?.coverageKeyOverride ?? null;

      setPollFeedFreshnessError(false);
      setPollFeedRefreshing(true);
      if (!skipSpinner) {
        setLoading(true);
      }

      const resolvedCoverageKey = coverageKeyOverride ?? coverageOverride ?? null;
      const payload = resolvedCoverageKey
        ? { coverageKey: resolvedCoverageKey }
        : bounds
        ? { bounds }
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
        const snapshot = createNetworkPollBootstrapSnapshot(response);
        applyPollSnapshot(snapshot, focusPollId);
        if (snapshot.coverageKey) {
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
      coverageOverride,
      pollFeedRequiresFreshNetwork,
      setLoading,
      setPollFeedFreshnessError,
      setPollFeedRefreshing,
    ]
  );

  React.useEffect(() => {
    if (!bootstrapCoverageKey) {
      return;
    }
    lastResolvedCoverageKeyRef.current = bootstrapCoverageKey;
  }, [bootstrapCoverageKey]);

  React.useEffect(() => {
    if (!visible || isSystemUnavailable || !coverageOverride) {
      return;
    }
    const normalizedOverride = coverageOverride.trim().toLowerCase();
    let cancelled = false;

    void (async () => {
      const activeCoverageKey = lastResolvedCoverageKeyRef.current ?? bootstrapCoverageKey;
      if (normalizedOverride !== activeCoverageKey) {
        const cachedSnapshot = await readPollBootstrapSnapshotForCoverage(normalizedOverride);
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
          coverageKeyOverride: coverageOverride,
          skipSpinner: hasBootstrapSnapshot && normalizedOverride === bootstrapCoverageKey,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    applyPollSnapshot,
    bootstrapCoverageKey,
    coverageOverride,
    hasBootstrapSnapshot,
    isSystemUnavailable,
    pollIdParam,
    refreshPollFeed,
    setPollFeedRefreshing,
    visible,
  ]);

  React.useEffect(() => {
    if (!visible || isSystemUnavailable || coverageOverride || !bounds) {
      return;
    }
    const activeCoverageKey = lastResolvedCoverageKeyRef.current ?? bootstrapCoverageKey;
    if (!activeCoverageKey || !hasBootstrapSnapshot) {
      void refreshPollFeed({ skipSpinner: hasBootstrapSnapshot });
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await resolveCoverage(bounds);
        if (cancelled) {
          return;
        }
        const nextKey =
          typeof response.coverageKey === 'string' ? response.coverageKey.trim().toLowerCase() : '';
        const nextName =
          typeof response.coverageName === 'string' && response.coverageName.trim()
            ? response.coverageName.trim()
            : null;

        if (nextKey && nextKey === activeCoverageKey) {
          if (nextName) {
            setCoverageName(nextName);
          }
          if (pollFeedRequiresFreshNetwork) {
            void refreshPollFeed({
              coverageKeyOverride: nextKey || null,
              skipSpinner: true,
            });
          }
          return;
        }

        if (nextKey) {
          const cachedSnapshot = await readPollBootstrapSnapshotForCoverage(nextKey);
          if (cancelled) {
            return;
          }
          if (cachedSnapshot) {
            applyPollSnapshot(cachedSnapshot);
            setPollFeedRefreshing(true);
          }
        }

        void refreshPollFeed({
          coverageKeyOverride: nextKey || null,
          skipSpinner: true,
        });
      } catch (error) {
        logger.warn('Coverage revalidation failed', {
          message: error instanceof Error ? error.message : 'unknown',
        });
        void refreshPollFeed({ skipSpinner: hasBootstrapSnapshot });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    bootstrapCoverageKey,
    bounds,
    coverageOverride,
    hasBootstrapSnapshot,
    isSystemUnavailable,
    pollFeedRequiresFreshNetwork,
    refreshPollFeed,
    applyPollSnapshot,
    setCoverageName,
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
