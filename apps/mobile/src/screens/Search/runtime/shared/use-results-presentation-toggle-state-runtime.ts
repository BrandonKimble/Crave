import React from 'react';

import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import { logger } from '../../../../utils';
import type {
  ScheduleToggleCommit,
  ToggleInteractionKind,
  ToggleInteractionLifecycleEvent,
} from './results-toggle-interaction-contract';
import { IDLE_TOGGLE_INTERACTION_STATE } from './results-toggle-interaction-contract';
import type { SearchRuntimeBus, SearchRuntimeBusState } from './search-runtime-bus';

const TOGGLE_INTENT_PREFIX = 'toggle-intent:';
// Restored from 2ca844dd: a single RESTARTING quiet-window debounce is the SOLE commit
// clock. Rapid taps keep re-arming it, so the heavy consequence (the runner) fires exactly
// once, ~300ms after the LAST tap — never mid-burst. The pill switches optimistically on
// press-up, so the toggle still feels instant; only the map update waits for the pause.
const DEFAULT_TOGGLE_SETTLE_MS = 300;

type ToggleCommitRunner = Parameters<ScheduleToggleCommit>[0];
type ToggleCommitOptions = Parameters<ScheduleToggleCommit>[1];

export type ResultsPresentationToggleStateRuntime = {
  interactionSeqRef: React.MutableRefObject<number>;
  activeInteractionKindRef: React.MutableRefObject<ToggleInteractionKind | null>;
  activeIntentIdRef: React.MutableRefObject<string | null>;
  activeRunnerRef: React.MutableRefObject<ToggleCommitRunner | null>;
  awaitingVisualSyncRef: React.MutableRefObject<boolean>;
  commitActiveInteractionRef: React.MutableRefObject<((intentId: string) => void) | null>;
  finalizeInteraction: (seq: number, awaitedVisualSync: boolean) => boolean;
  cancelToggleInteraction: () => void;
  beginToggleInteraction: (
    runner: ToggleCommitRunner,
    options: ToggleCommitOptions,
    startPatch?: Partial<SearchRuntimeBusState>
  ) => void;
  scheduleToggleCommit: (runner: ToggleCommitRunner, options: ToggleCommitOptions) => void;
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
  const settleTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Populated by the commit runtime (mirrors notifyIntentCompleteRef) so the debounce timer,
  // which lives here, can fire the commit without a circular hook dependency.
  const commitActiveInteractionRef = React.useRef<((intentId: string) => void) | null>(null);

  const clearSettleTimeout = React.useCallback(() => {
    if (settleTimeoutRef.current) {
      clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = null;
    }
  }, []);

  const finalizeInteraction = React.useCallback(
    (seq: number, awaitedVisualSync: boolean) => {
      if (interactionSeqRef.current !== seq) {
        return false;
      }
      clearSettleTimeout();

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
    [clearSettleTimeout, handleToggleInteractionLifecycle, searchRuntimeBus]
  );

  const cancelToggleInteraction = React.useCallback(() => {
    const intentId = activeIntentIdRef.current;
    const kind = activeInteractionKindRef.current;
    interactionSeqRef.current += 1;
    clearSettleTimeout();
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
  }, [clearSettleTimeout, handleToggleInteractionLifecycle, searchRuntimeBus]);

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
      logger.info('[TGLDBG-v2] begin', { seq, intentId, kind: interactionKind });
      handleToggleInteractionLifecycle({
        type: 'started',
        intentId,
        kind: interactionKind,
      });
      const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
      if (isPerfScenarioAttributionActive(scenarioConfig)) {
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'results_toggle_press_up_contract',
          intentId,
          kind: interactionKind,
          coverState: 'interaction_loading',
          preserveSheetState: true,
        });
      }
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

      // RESTARTING quiet-window debounce: each tap re-arms the timer, so the heavy commit
      // fires exactly once after the user pauses ~300ms. The seq guard drops a stale timer
      // if a newer tap superseded this one before it fired.
      clearSettleTimeout();
      settleTimeoutRef.current = setTimeout(() => {
        settleTimeoutRef.current = null;
        const superseded = interactionSeqRef.current !== seq;
        logger.info('[TGLDBG-v2] settle:fire', {
          intentId,
          seq,
          currentSeq: interactionSeqRef.current,
          superseded,
        });
        if (superseded) {
          return;
        }
        commitActiveInteractionRef.current?.(intentId);
      }, DEFAULT_TOGGLE_SETTLE_MS);
    },
    [clearSettleTimeout, handleToggleInteractionLifecycle, searchRuntimeBus]
  );

  const scheduleToggleCommit = React.useCallback(
    (runner: ToggleCommitRunner, options: ToggleCommitOptions) => {
      beginToggleInteraction(runner, options);
    },
    [beginToggleInteraction]
  );

  React.useEffect(() => clearSettleTimeout, [clearSettleTimeout]);

  return React.useMemo(
    () => ({
      interactionSeqRef,
      activeInteractionKindRef,
      activeIntentIdRef,
      activeRunnerRef,
      awaitingVisualSyncRef,
      commitActiveInteractionRef,
      finalizeInteraction,
      cancelToggleInteraction,
      beginToggleInteraction,
      scheduleToggleCommit,
    }),
    [beginToggleInteraction, cancelToggleInteraction, finalizeInteraction, scheduleToggleCommit]
  );
};
