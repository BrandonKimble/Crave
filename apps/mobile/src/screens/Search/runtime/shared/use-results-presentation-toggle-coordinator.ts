// THE SEARCH TOGGLE ADAPTER (toggle-system v2.1): the revise-protocol state machine
// now lives in the generic engine (src/toggles/toggle-interaction-engine.ts — seq +
// restarting quiet-window debounce + cancelable runner + visual-sync wait + lifecycle
// events, engine-spec'd with fake timers). This file is search's adapter: the engine
// wired to the search runtime bus (toggleInteraction mirror + the REACTIVE pending
// selector consumers need) and to the interaction-cover lifecycle handler, plus the
// search-rig concerns that deliberately stay OUT of the pure core (perf-scenario
// attribution, [T1DBG] commit timing). Public API unchanged from the pre-extraction
// coordinator. The U2 commit-phase semantics (commit-time mutation flush + D6c direct
// enter-start) land HERE via the runner search hands the engine — never in the core.
import React from 'react';

import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import { createToggleInteractionEngine } from '../../../../toggles/toggle-interaction-engine';
import type {
  ScheduleToggleCommit,
  ToggleInteractionKind,
  ToggleInteractionLifecycleEvent,
} from './results-toggle-interaction-contract';
import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';
import type { SearchRuntimeBus } from './search-runtime-bus';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';

type ToggleCommitRunner = Parameters<ScheduleToggleCommit>[0];
type ToggleCommitOptions = Parameters<ScheduleToggleCommit>[1];

export type ResultsPresentationToggleCoordinator = Pick<
  ResultsPresentationRuntimeOwner,
  'pendingTogglePresentationIntentId' | 'scheduleToggleCommit' | 'cancelToggleInteraction'
>;

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
  // Consumers need the REACTIVE pending intent id; the bus (fed by the engine's
  // interaction-state sink) stays its home.
  const pendingTogglePresentationIntentId = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => state.toggleInteraction.pendingPresentationIntentId,
    Object.is,
    ['toggleInteraction'] as const
  );

  const lifecycleRef = React.useRef(handleToggleInteractionLifecycle);
  lifecycleRef.current = handleToggleInteractionLifecycle;

  const engine = React.useMemo(
    () =>
      createToggleInteractionEngine<ToggleInteractionKind>({
        onInteractionState: (state) => {
          searchRuntimeBus.publish({ toggleInteraction: state });
        },
        onLifecycle: (event) => {
          if (event.type === 'started') {
            // Search-rig attribution rides the press-up edge (adapter concern).
            const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
            if (isPerfScenarioAttributionActive(scenarioConfig)) {
              logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
                event: 'results_toggle_press_up_contract',
                intentId: event.intentId,
                kind: event.kind,
                coverState: 'interaction_loading',
                preserveSheetState: true,
              });
            }
          }
          if (event.type === 'failed') {
            // Search consequences report failure through the resolution seam (the
            // failure level + uniform modal); the engine-level event is trace-only
            // here. Other surfaces may route it to the announcer.
            return;
          }
          lifecycleRef.current(event);
        },
      }),
    [searchRuntimeBus]
  );
  React.useEffect(() => engine.dispose, [engine]);

  const scheduleToggleCommit = React.useCallback(
    (runner: ToggleCommitRunner, options: ToggleCommitOptions) => {
      engine.begin(({ intentId }) => {
        // [T1DBG] commit timing (adapter concern — the search reveal rig reads it).
        const commitStart = performance.now();
        if (__DEV__) console.log(`[T1DBG] runner:start t=${commitStart.toFixed(1)}`);
        const outcome = runner({ intentId });
        if (__DEV__)
          console.log(
            `[T1DBG] runner:end t=${performance.now().toFixed(1)} dur=${(performance.now() - commitStart).toFixed(1)}`
          );
        return outcome ?? undefined;
      }, options);
    },
    [engine]
  );

  const cancelToggleInteraction = React.useCallback(() => {
    engine.cancel();
  }, [engine]);

  notifyIntentCompleteRef.current = engine.notifyIntentComplete;

  return React.useMemo(
    () => ({
      pendingTogglePresentationIntentId,
      scheduleToggleCommit,
      cancelToggleInteraction,
    }),
    [pendingTogglePresentationIntentId, scheduleToggleCommit, cancelToggleInteraction]
  );
};
