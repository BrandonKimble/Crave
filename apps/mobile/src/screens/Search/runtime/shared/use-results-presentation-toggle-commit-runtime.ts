import React from 'react';

import { logger } from '../../../../utils';
import type { ToggleInteractionLifecycleEvent } from './results-toggle-interaction-contract';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { ResultsPresentationToggleStateRuntime } from './use-results-presentation-toggle-state-runtime';

type ToggleCommitRunner = Parameters<
  ResultsPresentationToggleStateRuntime['scheduleToggleCommit']
>[0];
type ToggleCommitOutcome = ReturnType<ToggleCommitRunner>;

type UseResultsPresentationToggleCommitRuntimeArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  handleToggleInteractionLifecycle: (event: ToggleInteractionLifecycleEvent) => void;
  notifyIntentCompleteRef: React.MutableRefObject<((intentId: string) => void) | null>;
  toggleStateRuntime: ResultsPresentationToggleStateRuntime;
};

export const useResultsPresentationToggleCommitRuntime = ({
  searchRuntimeBus,
  handleToggleInteractionLifecycle,
  notifyIntentCompleteRef,
  toggleStateRuntime,
}: UseResultsPresentationToggleCommitRuntimeArgs) => {
  const commitActiveInteraction = React.useCallback(
    (intentId: string) => {
      if (toggleStateRuntime.activeIntentIdRef.current !== intentId) {
        return;
      }

      const seq = toggleStateRuntime.interactionSeqRef.current;
      const runner = toggleStateRuntime.activeRunnerRef.current;
      const interactionKind = toggleStateRuntime.activeInteractionKindRef.current;

      if (!runner || !interactionKind || toggleStateRuntime.awaitingVisualSyncRef.current) {
        return;
      }

      toggleStateRuntime.activeRunnerRef.current = null;
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
        toggleStateRuntime.finalizeInteraction(seq, false);
        return;
      }

      if (toggleStateRuntime.interactionSeqRef.current !== seq) {
        return;
      }

      if (outcome?.awaitVisualSync !== true) {
        toggleStateRuntime.finalizeInteraction(seq, false);
        return;
      }

      toggleStateRuntime.awaitingVisualSyncRef.current = true;
    },
    [handleToggleInteractionLifecycle, searchRuntimeBus, toggleStateRuntime]
  );

  const notifyFrostReady = React.useCallback(
    (intentId: string) => {
      commitActiveInteraction(intentId);
    },
    [commitActiveInteraction]
  );

  const notifyIntentComplete = React.useCallback(
    (intentId: string) => {
      if (toggleStateRuntime.activeIntentIdRef.current !== intentId) {
        return;
      }

      toggleStateRuntime.finalizeInteraction(toggleStateRuntime.interactionSeqRef.current, true);
    },
    [toggleStateRuntime]
  );

  notifyIntentCompleteRef.current = notifyIntentComplete;

  return React.useMemo(
    () => ({
      notifyFrostReady,
    }),
    [notifyFrostReady]
  );
};
