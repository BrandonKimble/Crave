import React from 'react';

import { logger } from '../../../../utils';
import type { SearchRuntimeBus } from './search-runtime-bus';
import {
  IDLE_TOGGLE_INTERACTION_STATE,
  type ScheduleToggleCommit,
  type ToggleInteractionKind,
  type ToggleInteractionLifecycleEvent,
} from './results-toggle-interaction-contract';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';
import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';

const TOGGLE_INTENT_PREFIX = 'toggle-intent:';

type ToggleCommitRunner = Parameters<ScheduleToggleCommit>[0];
type ToggleCommitOptions = Parameters<ScheduleToggleCommit>[1];
type ToggleCommitOutcome = ReturnType<ToggleCommitRunner>;

type ResultsPresentationToggleRuntime = Pick<
  ResultsPresentationRuntimeOwner,
  | 'pendingTogglePresentationIntentId'
  | 'scheduleToggleCommit'
  | 'notifyFrostReady'
  | 'cancelToggleInteraction'
>;

export type UseResultsPresentationToggleRuntimeArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  handleToggleInteractionLifecycle: (event: ToggleInteractionLifecycleEvent) => void;
  notifyIntentCompleteRef: React.MutableRefObject<((intentId: string) => void) | null>;
};

export const useResultsPresentationToggleRuntime = ({
  searchRuntimeBus,
  handleToggleInteractionLifecycle,
  notifyIntentCompleteRef,
}: UseResultsPresentationToggleRuntimeArgs): ResultsPresentationToggleRuntime => {
  const pendingTogglePresentationIntentId = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => state.toggleInteraction.pendingPresentationIntentId,
    Object.is,
    ['toggleInteraction'] as const
  );

  const interactionSeqRef = React.useRef(0);
  const activeInteractionKindRef = React.useRef<ToggleInteractionKind | null>(null);
  const activeIntentIdRef = React.useRef<string | null>(null);
  const activeRunnerRef = React.useRef<ToggleCommitRunner | null>(null);
  const awaitingVisualSyncRef = React.useRef(false);

  const finalizeInteraction = React.useCallback(
    (seq: number, awaitedVisualSync: boolean) => {
      if (interactionSeqRef.current !== seq) {
        return false;
      }
      const intentId = activeIntentIdRef.current;
      const kind = activeInteractionKindRef.current;
      logger.info('[TOGGLE] finalize', { intentId, kind, awaitedVisualSync });
      activeInteractionKindRef.current = null;
      activeIntentIdRef.current = null;
      activeRunnerRef.current = null;
      awaitingVisualSyncRef.current = false;
      searchRuntimeBus.batch(() => {
        searchRuntimeBus.publish({
          toggleInteraction: IDLE_TOGGLE_INTERACTION_STATE,
        });
      });
      if (intentId && kind) {
        handleToggleInteractionLifecycle({
          type: 'finalized',
          intentId,
          kind,
          awaitedVisualSync,
        });
      }
      return true;
    },
    [handleToggleInteractionLifecycle, searchRuntimeBus]
  );

  const cancelToggleInteraction = React.useCallback(() => {
    const intentId = activeIntentIdRef.current;
    const kind = activeInteractionKindRef.current;
    interactionSeqRef.current += 1;
    activeInteractionKindRef.current = null;
    activeIntentIdRef.current = null;
    activeRunnerRef.current = null;
    awaitingVisualSyncRef.current = false;
    searchRuntimeBus.publish({
      toggleInteraction: IDLE_TOGGLE_INTERACTION_STATE,
    });
    if (intentId && kind) {
      handleToggleInteractionLifecycle({
        type: 'cancelled',
        intentId,
        kind,
      });
    }
  }, [handleToggleInteractionLifecycle, searchRuntimeBus]);

  const scheduleToggleCommit = React.useCallback(
    (runner: ToggleCommitRunner, options: ToggleCommitOptions) => {
      const seq = interactionSeqRef.current + 1;
      interactionSeqRef.current = seq;
      const interactionKind = options.kind;
      const intentId = `${TOGGLE_INTENT_PREFIX}${seq}`;
      activeInteractionKindRef.current = interactionKind;
      activeIntentIdRef.current = intentId;
      activeRunnerRef.current = runner;
      awaitingVisualSyncRef.current = false;
      handleToggleInteractionLifecycle({
        type: 'started',
        intentId,
        kind: interactionKind,
      });
      searchRuntimeBus.publish({
        toggleInteraction: {
          kind: interactionKind,
          pendingPresentationIntentId: intentId,
        },
      });
    },
    [handleToggleInteractionLifecycle, searchRuntimeBus]
  );

  const commitActiveInteraction = React.useCallback(
    (intentId: string) => {
      if (activeIntentIdRef.current !== intentId) {
        return;
      }
      const seq = interactionSeqRef.current;
      const runner = activeRunnerRef.current;
      const interactionKind = activeInteractionKindRef.current;
      if (!runner || !interactionKind || awaitingVisualSyncRef.current) {
        return;
      }
      activeRunnerRef.current = null;
      logger.info('[TOGGLE] settle:commit', {
        intentId,
        kind: interactionKind,
        source: 'frost_ready',
      });
      searchRuntimeBus.publish({
        toggleInteraction: {
          kind: interactionKind,
          pendingPresentationIntentId: null,
        },
      });
      handleToggleInteractionLifecycle({
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
      if (outcome?.awaitVisualSync !== true) {
        finalizeInteraction(seq, false);
        return;
      }
      awaitingVisualSyncRef.current = true;
    },
    [finalizeInteraction, handleToggleInteractionLifecycle, searchRuntimeBus]
  );

  const notifyFrostReady = React.useCallback(
    (intentId: string) => {
      commitActiveInteraction(intentId);
    },
    [commitActiveInteraction]
  );

  const notifyIntentComplete = React.useCallback(
    (intentId: string) => {
      if (activeIntentIdRef.current !== intentId) {
        return;
      }
      finalizeInteraction(interactionSeqRef.current, true);
    },
    [finalizeInteraction]
  );

  notifyIntentCompleteRef.current = notifyIntentComplete;

  return React.useMemo(
    () => ({
      pendingTogglePresentationIntentId,
      scheduleToggleCommit,
      notifyFrostReady,
      cancelToggleInteraction,
    }),
    [
      cancelToggleInteraction,
      notifyFrostReady,
      pendingTogglePresentationIntentId,
      scheduleToggleCommit,
    ]
  );
};
