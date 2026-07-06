// TR5 portable-toggle-primitive seed: this coordinator is the single linear toggle
// pipeline (press-up fade + optimistic publish → restarting quiet-window debounce →
// commit runner → optional visual-sync wait → finalize) that page-registry §1b
// consumers (favorites strips next) will adopt. Its commit phase gains the D6c
// semantics in U2 (commit-time mutation flush + direct enter-start) — see the
// `// U2:` markers at the exact insertion points below.
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
import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';
import type { SearchRuntimeBus, SearchRuntimeBusState } from './search-runtime-bus';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';
import { searchMapRenderController } from '../map/search-map-render-controller';

const TOGGLE_INTENT_PREFIX = 'toggle-intent:';
// Restored from 2ca844dd: a single RESTARTING quiet-window debounce is the SOLE commit
// clock. Rapid taps keep re-arming it, so the heavy consequence (the runner) fires exactly
// once, ~300ms after the LAST tap — never mid-burst. The pill switches optimistically on
// press-up, so the toggle still feels instant; only the map update waits for the pause.
const DEFAULT_TOGGLE_SETTLE_MS = 300;

type ToggleCommitRunner = Parameters<ScheduleToggleCommit>[0];
type ToggleCommitOptions = Parameters<ScheduleToggleCommit>[1];
type ToggleCommitOutcome = ReturnType<ToggleCommitRunner>;

export type ResultsPresentationToggleCoordinator = Pick<
  ResultsPresentationRuntimeOwner,
  'pendingTogglePresentationIntentId' | 'scheduleToggleCommit' | 'cancelToggleInteraction'
> & {
  beginToggleInteraction: (
    runner: ToggleCommitRunner,
    options: ToggleCommitOptions,
    startPatch?: Partial<SearchRuntimeBusState>
  ) => void;
};

type UseResultsPresentationToggleCoordinatorArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  handleToggleInteractionLifecycle: (event: ToggleInteractionLifecycleEvent) => void;
  notifyIntentCompleteRef: React.MutableRefObject<((intentId: string) => void) | null>;
};

export const useResultsPresentationToggleCoordinator = ({
  searchRuntimeBus,
  handleToggleInteractionLifecycle,
  notifyIntentCompleteRef,
}: UseResultsPresentationToggleCoordinatorArgs): ResultsPresentationToggleCoordinator => {
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
  const settleTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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
        const __t1dbgRunnerStart = performance.now();
        if (__DEV__) console.log(`[T1DBG] runner:start t=${__t1dbgRunnerStart.toFixed(1)}`);
        outcome = runner({ intentId });
        if (__DEV__)
          console.log(
            `[T1DBG] runner:end t=${performance.now().toFixed(1)} dur=${(performance.now() - __t1dbgRunnerStart).toFixed(1)}`
          );
      } catch (error) {
        logger.warn('Toggle interaction commit failed', {
          message: error instanceof Error ? error.message : 'unknown error',
        });
        finalizeInteraction(seq, false);
        return;
      }
      // U2: commit-time mutation flush + direct enter-start land here (after the runner's
      // variant commit, before the visual-sync branch).

      if (interactionSeqRef.current !== seq) {
        return;
      }

      if (outcome?.awaitVisualSync !== true) {
        finalizeInteraction(seq, false);
        return;
      }

      // U2: the visual-sync wait gains the D6c direct enter-start handoff here.
      awaitingVisualSyncRef.current = true;
    },
    [finalizeInteraction, handleToggleInteractionLifecycle, searchRuntimeBus]
  );

  const beginToggleInteraction = React.useCallback(
    (
      runner: ToggleCommitRunner,
      options: ToggleCommitOptions,
      startPatch?: Partial<SearchRuntimeBusState>
    ) => {
      // Press-up map fade-out — SHARED by every trigger that runs through the coordinator (tab toggle,
      // filter chips, deferredApply dropdowns). Fires the instant the control is pressed, decoupled from the
      // debounced commit, so pins/dots/labels fade out together immediately; the settle re-reveals them.
      // Idempotent + fire-and-forget (native guards inactive/already-faded). Previously only the tab toggle
      // armed this, so filter chips swapped the map with no fade — this makes ALL toggles behave identically.
      void searchMapRenderController.beginInteractionFadeOut();
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
        commitActiveInteraction(intentId);
      }, DEFAULT_TOGGLE_SETTLE_MS);
    },
    [
      clearSettleTimeout,
      commitActiveInteraction,
      handleToggleInteractionLifecycle,
      searchRuntimeBus,
    ]
  );

  const scheduleToggleCommit = React.useCallback(
    (runner: ToggleCommitRunner, options: ToggleCommitOptions) => {
      beginToggleInteraction(runner, options);
    },
    [beginToggleInteraction]
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

  React.useEffect(() => clearSettleTimeout, [clearSettleTimeout]);

  return React.useMemo(
    () => ({
      pendingTogglePresentationIntentId,
      scheduleToggleCommit,
      cancelToggleInteraction,
      beginToggleInteraction,
    }),
    [
      pendingTogglePresentationIntentId,
      scheduleToggleCommit,
      cancelToggleInteraction,
      beginToggleInteraction,
    ]
  );
};
