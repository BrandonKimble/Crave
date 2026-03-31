import React from 'react';

import { logger } from '../../../../utils';
import type { PresentationMutationKind } from '../controller/presentation-transition-controller';
import type { SearchRuntimeBus } from '../shared/search-runtime-bus';

export type ToggleCommitOutcome = {
  awaitVisualSync?: boolean;
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
  onLifecycleEvent?: (event: ToggleInteractionLifecycleEvent) => void;
};

type ToggleInteractionCoordinator = {
  scheduleToggleCommit: (runner: ToggleCommitRunner, options?: ToggleCommitOptions) => void;
  notifyIntentComplete: (intentId: string) => void;
  cancelToggleInteraction: () => void;
};

const DEFAULT_TOGGLE_SETTLE_MS = 300;
const DEFAULT_TOGGLE_KIND: ToggleInteractionKind = 'legacy_unspecified';
const TOGGLE_INTENT_PREFIX = 'toggle-intent:';

export const useToggleInteractionCoordinator = ({
  searchRuntimeBus,
  setIsFilterTogglePending,
  settleMs = DEFAULT_TOGGLE_SETTLE_MS,
  onLifecycleEvent,
}: UseToggleInteractionCoordinatorArgs): ToggleInteractionCoordinator => {
  const settleTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionSeqRef = React.useRef(0);
  const activeInteractionKindRef = React.useRef<ToggleInteractionKind | null>(null);
  const activeIntentIdRef = React.useRef<string | null>(null);
  const awaitingVisualSyncRef = React.useRef(false);

  const clearSettleTimeout = React.useCallback(() => {
    if (!settleTimeoutRef.current) {
      return;
    }
    clearTimeout(settleTimeoutRef.current);
    settleTimeoutRef.current = null;
  }, []);

  const finalizeInteraction = React.useCallback(
    (seq: number, awaitedVisualSync: boolean) => {
      if (interactionSeqRef.current !== seq) {
        return false;
      }
      const intentId = activeIntentIdRef.current;
      const kind = activeInteractionKindRef.current;
      logger.info('[TOGGLE] finalize', { intentId, kind, awaitedVisualSync });
      clearSettleTimeout();
      activeInteractionKindRef.current = null;
      activeIntentIdRef.current = null;
      awaitingVisualSyncRef.current = false;
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
    [clearSettleTimeout, onLifecycleEvent, searchRuntimeBus, setIsFilterTogglePending]
  );

  const cancelToggleInteraction = React.useCallback(() => {
    const intentId = activeIntentIdRef.current;
    const kind = activeInteractionKindRef.current;
    interactionSeqRef.current += 1;
    clearSettleTimeout();
    activeInteractionKindRef.current = null;
    activeIntentIdRef.current = null;
    awaitingVisualSyncRef.current = false;
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
  }, [clearSettleTimeout, onLifecycleEvent, searchRuntimeBus, setIsFilterTogglePending]);

  const notifyIntentComplete = React.useCallback(
    (intentId: string) => {
      if (activeIntentIdRef.current !== intentId) {
        return;
      }
      finalizeInteraction(interactionSeqRef.current, true);
    },
    [finalizeInteraction]
  );

  const scheduleToggleCommit = React.useCallback(
    (runner: ToggleCommitRunner, options?: ToggleCommitOptions) => {
      const seq = interactionSeqRef.current + 1;
      interactionSeqRef.current = seq;
      const interactionKind = options?.kind ?? DEFAULT_TOGGLE_KIND;
      const intentId = `${TOGGLE_INTENT_PREFIX}${seq}`;
      activeInteractionKindRef.current = interactionKind;
      activeIntentIdRef.current = intentId;
      awaitingVisualSyncRef.current = false;
      clearSettleTimeout();
      onLifecycleEvent?.({
        type: 'started',
        intentId,
        kind: interactionKind,
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
          logger.info('[TOGGLE] settle:superseded', {
            intentId,
            seq,
            currentSeq: interactionSeqRef.current,
          });
          return;
        }
        logger.info('[TOGGLE] settle:commit', { intentId, kind: interactionKind });
        onLifecycleEvent?.({
          type: 'settled',
          intentId,
          kind: interactionKind,
        });
        let outcome: ToggleCommitOutcome | void;
        try {
          outcome = runner({ intentId });
        } catch (error) {
          logger.warn('Toggle interaction commit failed', {
            message: error instanceof Error ? error.message : 'unknown error',
          });
          finalizeInteraction(seq, false);
          return;
        }
        if (interactionSeqRef.current !== seq) {
          return;
        }
        const awaitVisualSync = outcome?.awaitVisualSync === true;
        if (!awaitVisualSync) {
          finalizeInteraction(seq, false);
          return;
        }
        // Controller's onIntentComplete will call notifyIntentComplete
        // when the reveal chain completes.
        awaitingVisualSyncRef.current = true;
      }, settleMs);
    },
    [
      clearSettleTimeout,
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
    },
    [clearSettleTimeout]
  );

  return {
    scheduleToggleCommit,
    notifyIntentComplete,
    cancelToggleInteraction,
  };
};
