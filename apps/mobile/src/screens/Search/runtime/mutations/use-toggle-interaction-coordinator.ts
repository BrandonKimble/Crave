import React from 'react';

import { logger } from '../../../../utils';
import type { PresentationMutationKind } from '../controller/presentation-transition-controller';
import type { SearchRuntimeBus } from '../shared/search-runtime-bus';

export type ToggleCommitOutcome = {
  awaitVisualSync?: boolean;
  visualRequestKey?: string | null;
};

type ToggleCommitRunner = (context: { intentId: string }) => ToggleCommitOutcome | void;

export type ToggleInteractionKind = Extract<
  PresentationMutationKind,
  | 'tab_switch'
  | 'filter_open_now'
  | 'filter_votes'
  | 'filter_price'
  | 'filter_rank'
  | 'legacy_unspecified'
>;

export type ToggleCommitOptions = {
  kind?: ToggleInteractionKind;
};

export type ToggleInteractionLifecycleEvent =
  | {
      type: 'started';
      intentId: string;
      kind: ToggleInteractionKind;
      settleDeadlineMs: number;
    }
  | {
      type: 'settled';
      intentId: string;
      kind: ToggleInteractionKind;
    }
  | {
      type: 'finalized';
      intentId: string;
      kind: ToggleInteractionKind;
      awaitedVisualSync: boolean;
    }
  | {
      type: 'cancelled';
      intentId: string;
      kind: ToggleInteractionKind;
    };

type UseToggleInteractionCoordinatorArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  setIsFilterTogglePending: (next: boolean) => void;
  settleMs?: number;
  visualFallbackMs?: number;
  onLifecycleEvent?: (event: ToggleInteractionLifecycleEvent) => void;
};

type ToggleInteractionCoordinator = {
  scheduleToggleCommit: (runner: ToggleCommitRunner, options?: ToggleCommitOptions) => void;
  registerVisualCandidate: (requestKey: string | null) => void;
  resolveVisualReady: (requestKey: string | null) => boolean;
  cancelToggleInteraction: () => void;
};

const DEFAULT_TOGGLE_SETTLE_MS = 300;
const DEFAULT_VISUAL_FALLBACK_MS = 1600;
const DEFAULT_TOGGLE_KIND: ToggleInteractionKind = 'legacy_unspecified';
const TOGGLE_INTENT_PREFIX = 'toggle-intent:';

export const useToggleInteractionCoordinator = ({
  searchRuntimeBus,
  setIsFilterTogglePending,
  settleMs = DEFAULT_TOGGLE_SETTLE_MS,
  visualFallbackMs = DEFAULT_VISUAL_FALLBACK_MS,
  onLifecycleEvent,
}: UseToggleInteractionCoordinatorArgs): ToggleInteractionCoordinator => {
  const settleTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const visualFallbackTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionSeqRef = React.useRef(0);
  const waitingForVisualReadyRef = React.useRef(false);
  const waitingForVisualSeqRef = React.useRef<number | null>(null);
  const expectedVisualRequestKeyRef = React.useRef<string | null>(null);
  const baselineVisualRequestKeyRef = React.useRef<string | null>(null);
  const activeInteractionKindRef = React.useRef<ToggleInteractionKind | null>(null);
  const activeIntentIdRef = React.useRef<string | null>(null);

  const clearSettleTimeout = React.useCallback(() => {
    if (!settleTimeoutRef.current) {
      return;
    }
    clearTimeout(settleTimeoutRef.current);
    settleTimeoutRef.current = null;
  }, []);

  const clearVisualFallbackTimeout = React.useCallback(() => {
    if (!visualFallbackTimeoutRef.current) {
      return;
    }
    clearTimeout(visualFallbackTimeoutRef.current);
    visualFallbackTimeoutRef.current = null;
  }, []);

  const clearPendingState = React.useCallback(() => {
    waitingForVisualReadyRef.current = false;
    waitingForVisualSeqRef.current = null;
    expectedVisualRequestKeyRef.current = null;
    baselineVisualRequestKeyRef.current = null;
  }, []);

  const finalizeInteraction = React.useCallback(
    (seq: number) => {
      if (interactionSeqRef.current !== seq) {
        return false;
      }
      const intentId = activeIntentIdRef.current;
      const kind = activeInteractionKindRef.current;
      const awaitedVisualSync = waitingForVisualReadyRef.current;
      clearSettleTimeout();
      clearVisualFallbackTimeout();
      clearPendingState();
      activeInteractionKindRef.current = null;
      activeIntentIdRef.current = null;
      searchRuntimeBus.batch(() => {
        setIsFilterTogglePending(false);
        searchRuntimeBus.publish({
          toggleInteractionKind: null,
        });
      });
      if (intentId && kind) {
        onLifecycleEvent?.({
          type: 'finalized',
          intentId,
          kind,
          awaitedVisualSync,
        });
      }
      return true;
    },
    [
      clearPendingState,
      clearSettleTimeout,
      clearVisualFallbackTimeout,
      onLifecycleEvent,
      searchRuntimeBus,
      setIsFilterTogglePending,
    ]
  );

  const cancelToggleInteraction = React.useCallback(() => {
    const intentId = activeIntentIdRef.current;
    const kind = activeInteractionKindRef.current;
    interactionSeqRef.current += 1;
    clearSettleTimeout();
    clearVisualFallbackTimeout();
    clearPendingState();
    activeInteractionKindRef.current = null;
    activeIntentIdRef.current = null;
    searchRuntimeBus.batch(() => {
      setIsFilterTogglePending(false);
      searchRuntimeBus.publish({
        toggleInteractionKind: null,
      });
    });
    if (intentId && kind) {
      onLifecycleEvent?.({
        type: 'cancelled',
        intentId,
        kind,
      });
    }
  }, [
    clearPendingState,
    clearSettleTimeout,
    clearVisualFallbackTimeout,
    onLifecycleEvent,
    searchRuntimeBus,
    setIsFilterTogglePending,
  ]);

  const armVisualFallback = React.useCallback(
    (seq: number) => {
      clearVisualFallbackTimeout();
      visualFallbackTimeoutRef.current = setTimeout(() => {
        finalizeInteraction(seq);
      }, visualFallbackMs);
    },
    [clearVisualFallbackTimeout, finalizeInteraction, visualFallbackMs]
  );

  const registerVisualCandidate = React.useCallback(
    (requestKey: string | null) => {
      if (!waitingForVisualReadyRef.current || !requestKey) {
        return;
      }
      const awaitingSeq = waitingForVisualSeqRef.current;
      if (awaitingSeq == null) {
        return;
      }
      if (expectedVisualRequestKeyRef.current != null) {
        return;
      }
      expectedVisualRequestKeyRef.current = requestKey;
      if (searchRuntimeBus.getState().visualReadyRequestKey === requestKey) {
        finalizeInteraction(awaitingSeq);
      }
    },
    [finalizeInteraction, searchRuntimeBus]
  );

  const resolveVisualReady = React.useCallback(
    (requestKey: string | null): boolean => {
      if (!waitingForVisualReadyRef.current || !requestKey) {
        return false;
      }
      const expectedRequestKey = expectedVisualRequestKeyRef.current;
      if (expectedRequestKey && expectedRequestKey !== requestKey) {
        return false;
      }
      if (!expectedRequestKey && baselineVisualRequestKeyRef.current === requestKey) {
        return false;
      }
      const awaitingSeq = waitingForVisualSeqRef.current;
      if (awaitingSeq == null) {
        return false;
      }
      return finalizeInteraction(awaitingSeq);
    },
    [finalizeInteraction]
  );

  const scheduleToggleCommit = React.useCallback(
    (runner: ToggleCommitRunner, options?: ToggleCommitOptions) => {
      const seq = interactionSeqRef.current + 1;
      interactionSeqRef.current = seq;
      const interactionKind = options?.kind ?? DEFAULT_TOGGLE_KIND;
      const intentId = `${TOGGLE_INTENT_PREFIX}${seq}`;
      const settleDeadlineMs = Date.now() + settleMs;
      activeInteractionKindRef.current = interactionKind;
      activeIntentIdRef.current = intentId;
      const runtimeState = searchRuntimeBus.getState();
      baselineVisualRequestKeyRef.current = runtimeState.visualSyncCandidateRequestKey;
      waitingForVisualReadyRef.current = false;
      expectedVisualRequestKeyRef.current = null;
      clearSettleTimeout();
      clearVisualFallbackTimeout();
      onLifecycleEvent?.({
        type: 'started',
        intentId,
        kind: interactionKind,
        settleDeadlineMs,
      });
      searchRuntimeBus.batch(() => {
        setIsFilterTogglePending(true);
        searchRuntimeBus.publish({
          toggleInteractionKind: interactionKind,
        });
      });
      settleTimeoutRef.current = setTimeout(() => {
        settleTimeoutRef.current = null;
        if (interactionSeqRef.current !== seq) {
          return;
        }
        let outcome: ToggleCommitOutcome | void;
        onLifecycleEvent?.({
          type: 'settled',
          intentId,
          kind: interactionKind,
        });
        try {
          outcome = runner({ intentId });
        } catch (error) {
          logger.warn('Toggle interaction commit failed', {
            message: error instanceof Error ? error.message : 'unknown error',
          });
          finalizeInteraction(seq);
          return;
        }
        if (interactionSeqRef.current !== seq) {
          return;
        }
        const awaitVisualSync = outcome?.awaitVisualSync === true;
        if (!awaitVisualSync) {
          finalizeInteraction(seq);
          return;
        }
        waitingForVisualReadyRef.current = true;
        waitingForVisualSeqRef.current = seq;
        expectedVisualRequestKeyRef.current = outcome?.visualRequestKey ?? null;
        if (expectedVisualRequestKeyRef.current == null) {
          const nextRuntimeState = searchRuntimeBus.getState();
          const runtimeCandidate = nextRuntimeState.visualSyncCandidateRequestKey;
          if (
            runtimeCandidate != null &&
            runtimeCandidate !== baselineVisualRequestKeyRef.current
          ) {
            expectedVisualRequestKeyRef.current = runtimeCandidate;
          }
        }
        const currentRuntimeState = searchRuntimeBus.getState();
        if (
          expectedVisualRequestKeyRef.current != null &&
          currentRuntimeState.visualReadyRequestKey === expectedVisualRequestKeyRef.current
        ) {
          finalizeInteraction(seq);
          return;
        }
        armVisualFallback(seq);
      }, settleMs);
    },
    [
      armVisualFallback,
      clearSettleTimeout,
      clearVisualFallbackTimeout,
      finalizeInteraction,
      onLifecycleEvent,
      searchRuntimeBus,
      setIsFilterTogglePending,
      settleMs,
    ]
  );

  React.useEffect(
    () => () => {
      clearSettleTimeout();
      clearVisualFallbackTimeout();
    },
    [clearSettleTimeout, clearVisualFallbackTimeout]
  );

  return {
    scheduleToggleCommit,
    registerVisualCandidate,
    resolveVisualReady,
    cancelToggleInteraction,
  };
};
