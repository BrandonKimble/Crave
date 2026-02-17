import React from 'react';
import { InteractionManager } from 'react-native';
import { io, type Socket } from 'socket.io-client';

import { API_BASE_URL } from '../../../services/api';
import { resolveCoverage } from '../../../services/coverage';
import { addPollOption, fetchPolls, voteOnPoll, type Poll } from '../../../services/polls';
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
  coverageOverride?: string | null;
  selectedPollId: string | null;
  setSelectedPollId: React.Dispatch<React.SetStateAction<string | null>>;
  setPolls: React.Dispatch<React.SetStateAction<Poll[]>>;
  setCoverageKey: React.Dispatch<React.SetStateAction<string | null>>;
  setCoverageName: React.Dispatch<React.SetStateAction<string | null>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
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
  coverageOverride,
  selectedPollId,
  setSelectedPollId,
  setPolls,
  setCoverageKey,
  setCoverageName,
  setLoading,
  setPersistedCity,
  isSystemUnavailable,
  pollIdParam,
  interactionRef,
}: UsePollsRuntimeControllerArgs): UsePollsRuntimeControllerResult => {
  const socketRef = React.useRef<Socket | null>(null);
  const pendingPollIdRef = React.useRef<string | null>(null);
  const lastResolvedCoverageKeyRef = React.useRef<string | null>(null);

  const refreshPollFeed = React.useCallback(
    async (options?: RefreshPollFeedOptions) => {
      const skipSpinner = options?.skipSpinner ?? false;
      const focusPollId = options?.focusPollId ?? null;
      const coverageKeyOverride = options?.coverageKeyOverride ?? null;

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
        if (!skipSpinner) {
          setLoading(false);
        }
        return;
      }

      try {
        const response = await fetchPolls(payload);
        const normalizedPolls = response.polls ?? [];
        const nextCoverageKey = response.coverageKey ?? resolvedCoverageKey ?? null;
        const normalizedKey =
          typeof nextCoverageKey === 'string' ? nextCoverageKey.trim().toLowerCase() : null;
        if (normalizedKey) {
          lastResolvedCoverageKeyRef.current = normalizedKey;
        }
        const nextCoverageName = response.coverageName ?? normalizedPolls[0]?.coverageName ?? null;

        setPolls(normalizedPolls);
        setCoverageKey(nextCoverageKey);
        setCoverageName(nextCoverageName);
        if (nextCoverageKey && !coverageOverride) {
          setPersistedCity(nextCoverageKey);
        }

        if (!normalizedPolls.length) {
          setSelectedPollId(null);
          return;
        }

        const hasCurrentSelection =
          selectedPollId && normalizedPolls.some((poll) => poll.pollId === selectedPollId);
        let nextSelection: string | null = null;

        if (focusPollId && normalizedPolls.some((poll) => poll.pollId === focusPollId)) {
          nextSelection = focusPollId;
        } else if (
          pendingPollIdRef.current &&
          normalizedPolls.some((poll) => poll.pollId === pendingPollIdRef.current)
        ) {
          nextSelection = pendingPollIdRef.current;
        } else if (hasCurrentSelection) {
          nextSelection = selectedPollId;
        } else {
          nextSelection = normalizedPolls[0].pollId;
        }

        if (nextSelection) {
          setSelectedPollId(nextSelection);
          if (pendingPollIdRef.current === nextSelection) {
            pendingPollIdRef.current = null;
          }
        } else {
          setSelectedPollId(null);
        }
      } catch (error) {
        logger.error('Failed to load polls', error);
      } finally {
        if (!skipSpinner) {
          setLoading(false);
        }
      }
    },
    [
      bounds,
      coverageOverride,
      selectedPollId,
      setCoverageKey,
      setCoverageName,
      setLoading,
      setPersistedCity,
      setPolls,
      setSelectedPollId,
    ]
  );

  React.useEffect(() => {
    if (!visible || isSystemUnavailable || !coverageOverride) {
      return;
    }
    void refreshPollFeed({ coverageKeyOverride: coverageOverride });
  }, [coverageOverride, isSystemUnavailable, refreshPollFeed, visible]);

  React.useEffect(() => {
    if (!visible || isSystemUnavailable || coverageOverride || !bounds) {
      return;
    }

    let isActive = true;
    resolveCoverage(bounds)
      .then((response) => {
        if (!isActive) {
          return;
        }
        const nextKey =
          typeof response.coverageKey === 'string' ? response.coverageKey.trim().toLowerCase() : '';
        const nextName =
          typeof response.coverageName === 'string' && response.coverageName.trim()
            ? response.coverageName.trim()
            : null;

        if (!nextKey) {
          setLoading(true);
          lastResolvedCoverageKeyRef.current = null;
          setCoverageName(null);
          setCoverageKey(null);
          setPolls([]);
          setSelectedPollId(null);
          void refreshPollFeed();
          return;
        }

        if (lastResolvedCoverageKeyRef.current === nextKey) {
          if (nextName) {
            setCoverageName(nextName);
          }
          return;
        }

        lastResolvedCoverageKeyRef.current = nextKey;
        setCoverageKey(nextKey);
        setCoverageName(nextName);
        void refreshPollFeed({ coverageKeyOverride: nextKey });
      })
      .catch((error) => {
        logger.warn('Coverage resolve failed', {
          message: error instanceof Error ? error.message : 'unknown',
        });
      });

    return () => {
      isActive = false;
    };
  }, [
    bounds,
    coverageOverride,
    isSystemUnavailable,
    refreshPollFeed,
    setCoverageKey,
    setCoverageName,
    setLoading,
    setPolls,
    setSelectedPollId,
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
