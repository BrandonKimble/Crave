// THE SEARCH TOGGLE ADAPTER (leg 2 — plans/toggle-strip-rebuild-ledger.md): search
// declares its consequence class through the strip package's DECLARATION SEAM
// (`createToggleStripConsequenceSeam`) instead of constructing the interaction engine
// itself — pages never touch the engine directly. Search is consequence:'world' (every
// toggle swaps the presented map world), so every commit is floor-gated: quiet window
// elapsed AND the presentation fade-out acked at ~0. The floor signal is the existing
// native-fed module singleton (`search-presentation-floor-signal`). What stays HERE is
// genuinely search's: the runtime-bus interaction-state mirror, the perf-scenario
// attribution on press-up, the [T1DBG] commit timing, and the failure-routing choice
// (search reports failures through its resolution seam, not the engine lifecycle).
import React from 'react';

import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import { createToggleStripConsequenceSeam } from '../../../../toggles/toggle-strip-consequence';
import {
  isSearchPresentationAtFloor,
  subscribeSearchPresentationFloor,
} from '../map/search-presentation-floor-signal';
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
  // Consumers need the REACTIVE pending intent id; the bus (fed by the seam's
  // interaction-state sink) stays its home.
  const pendingTogglePresentationIntentId = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => state.toggleInteraction.pendingPresentationIntentId,
    Object.is,
    ['toggleInteraction'] as const
  );

  const lifecycleRef = React.useRef(handleToggleInteractionLifecycle);
  lifecycleRef.current = handleToggleInteractionLifecycle;

  const seam = React.useMemo(
    () =>
      createToggleStripConsequenceSeam<ToggleInteractionKind>({
        // T3 (plans/toggle-strip-primitive.md): every search toggle consequence swaps
        // the presented map world → 'world' gates each commit on the presentation
        // fade-out floor; the signal covers the already-covered case (no ramp → no ack).
        consequence: 'world',
        floorSignal: {
          isAtFloor: isSearchPresentationAtFloor,
          subscribeFloorAck: subscribeSearchPresentationFloor,
        },
        surfaceName: 'results',
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
  React.useEffect(() => seam.dispose, [seam]);

  const scheduleToggleCommit = React.useCallback(
    (runner: ToggleCommitRunner, options: ToggleCommitOptions) => {
      seam.scheduleCommit(
        ({ intentId }) => {
          // [T1DBG] commit timing (adapter concern — the search reveal rig reads it).
          const commitStart = performance.now();
          if (__DEV__) console.log(`[T1DBG] runner:start t=${commitStart.toFixed(1)}`);
          const outcome = runner({ intentId });
          if (__DEV__)
            console.log(
              `[T1DBG] runner:end t=${performance.now().toFixed(1)} dur=${(performance.now() - commitStart).toFixed(1)}`
            );
          return outcome ?? undefined;
        },
        { kind: options.kind }
      );
    },
    [seam]
  );

  const cancelToggleInteraction = React.useCallback(() => {
    seam.cancel();
  }, [seam]);

  notifyIntentCompleteRef.current = seam.notifyIntentComplete;

  return React.useMemo(
    () => ({
      pendingTogglePresentationIntentId,
      scheduleToggleCommit,
      cancelToggleInteraction,
    }),
    [pendingTogglePresentationIntentId, scheduleToggleCommit, cancelToggleInteraction]
  );
};
