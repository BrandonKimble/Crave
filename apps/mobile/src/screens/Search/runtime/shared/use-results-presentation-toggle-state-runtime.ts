import React from 'react';

import { logger } from '../../../../utils';
import type {
  ScheduleToggleCommit,
  ToggleInteractionKind,
  ToggleInteractionLifecycleEvent,
} from './results-toggle-interaction-contract';
import { IDLE_TOGGLE_INTERACTION_STATE } from './results-toggle-interaction-contract';
import type { SearchRuntimeBus, SearchRuntimeBusState } from './search-runtime-bus';

const TOGGLE_INTENT_PREFIX = 'toggle-intent:';

type ToggleCommitRunner = Parameters<ScheduleToggleCommit>[0];
type ToggleCommitOptions = Parameters<ScheduleToggleCommit>[1];

export type ResultsPresentationToggleStateRuntime = {
  interactionSeqRef: React.MutableRefObject<number>;
  activeInteractionKindRef: React.MutableRefObject<ToggleInteractionKind | null>;
  activeIntentIdRef: React.MutableRefObject<string | null>;
  activeRunnerRef: React.MutableRefObject<ToggleCommitRunner | null>;
  awaitingVisualSyncRef: React.MutableRefObject<boolean>;
  finalizeInteraction: (seq: number, awaitedVisualSync: boolean) => boolean;
  cancelToggleInteraction: () => void;
  beginToggleInteraction: (
    runner: ToggleCommitRunner,
    options: ToggleCommitOptions,
    startPatch?: Partial<SearchRuntimeBusState>
  ) => void;
  scheduleToggleCommit: (
    runner: ToggleCommitRunner,
    options: ToggleCommitOptions
  ) => void;
};

type UseResultsPresentationToggleStateRuntimeArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  handleToggleInteractionLifecycle: (event: ToggleInteractionLifecycleEvent) => void;
};

export const useResultsPresentationToggleStateRuntime = ({
  searchRuntimeBus,
  handleToggleInteractionLifecycle,
}: UseResultsPresentationToggleStateRuntimeArgs): ResultsPresentationToggleStateRuntime => {
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
      searchRuntimeBus.publish({
        toggleInteraction: IDLE_TOGGLE_INTERACTION_STATE,
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

  const beginToggleInteraction = React.useCallback(
    (
      runner: ToggleCommitRunner,
      options: ToggleCommitOptions,
      startPatch?: Partial<SearchRuntimeBusState>
    ) => {
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
      searchRuntimeBus.batch(() => {
        if (startPatch != null) {
          searchRuntimeBus.publish(startPatch);
        }
        searchRuntimeBus.publish({
          toggleInteraction: {
            kind: interactionKind,
            pendingPresentationIntentId: intentId,
          },
        });
      });
    },
    [handleToggleInteractionLifecycle, searchRuntimeBus]
  );

  const scheduleToggleCommit = React.useCallback(
    (runner: ToggleCommitRunner, options: ToggleCommitOptions) => {
      beginToggleInteraction(runner, options);
    },
    [beginToggleInteraction]
  );

  return React.useMemo(
    () => ({
      interactionSeqRef,
      activeInteractionKindRef,
      activeIntentIdRef,
      activeRunnerRef,
      awaitingVisualSyncRef,
      finalizeInteraction,
      cancelToggleInteraction,
      beginToggleInteraction,
      scheduleToggleCommit,
    }),
    [
      beginToggleInteraction,
      cancelToggleInteraction,
      finalizeInteraction,
      scheduleToggleCommit,
    ]
  );
};
