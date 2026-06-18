import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import type { ResultsPresentationAuthority } from './results-presentation-authority';
import { resolvePresentationLanePolicy } from './presentation-lane-policy';

/**
 * Cluster 6 (plans/search-map-reveal-dismiss-smooth-cutover-plan.md, Gate E): the
 * results-sheet snap is the chrome lane. The presentation lane policy forbids sheet snap
 * during the visible reveal / dismiss opacity windows (`enter_executing`, `exit_requested`,
 * `exit_executing`) so the spring physics never steal time from the opacity animation.
 *
 * This is the single consumer of `PresentationLanePolicy.allowSheetSnap`. It gates a
 * reveal-coupled sheet snap request: if the policy allows it (settled / idle / covered),
 * the snap fires immediately; if not, the snap is DEFERRED — held and replayed the instant
 * the presentation phase transitions to an allowed stage — instead of co-firing inside the
 * visible window.
 *
 * Only clearly reveal/dismiss-coupled snaps go through this gate. User-drag-driven snapping
 * (gesture lane) and the dismiss collapse (which IS the visible dismiss motion) are left
 * untouched.
 */

const SNAP_STAGE_GATE_OBSERVED_KEYS = ['resultsPresentationTransport'] as const;

type ResultsSheetSnapStageGateReason = 'allowed_immediate' | 'deferred' | 'replayed_on_allow';

const logSnapStageGateEvent = (
  reason: ResultsSheetSnapStageGateReason,
  details: {
    executionStage: string;
    allowSheetSnap: boolean;
    transactionId: string | null;
    snapStageGateLabel: string;
  }
): void => {
  const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
  if (!isPerfScenarioAttributionActive(scenarioConfig)) {
    return;
  }
  logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
    event: 'results_sheet_snap_stage_gate_contract',
    authority: 'ResultsSheetSnapStageGate',
    lane: 'chrome',
    reason,
    deferred: reason !== 'allowed_immediate',
    overlapAvoided: reason === 'deferred' || reason === 'replayed_on_allow',
    allowSheetSnap: details.allowSheetSnap,
    executionStage: details.executionStage,
    snapStageGateLabel: details.snapStageGateLabel,
    transactionId: details.transactionId,
  });
};

/**
 * Run `applySnap` (the reveal-coupled sheet snap request) only when the presentation lane
 * policy allows sheet snap. If the current phase forbids it, defer until the phase becomes
 * allowed.
 *
 * Returns a disposer that cancels a pending (deferred) snap. If the snap fired immediately
 * the disposer is a no-op.
 */
export const runResultsSheetSnapWhenLaneAllows = (
  resultsPresentationAuthority: ResultsPresentationAuthority,
  applySnap: () => void,
  snapStageGateLabel: string
): (() => void) => {
  const readPolicy = () => {
    const transport = resultsPresentationAuthority.getSnapshot().resultsPresentationTransport;
    return {
      executionStage: transport.executionStage,
      transactionId: transport.transactionId,
      allowSheetSnap: resolvePresentationLanePolicy(transport.executionStage).allowSheetSnap,
    };
  };

  const initial = readPolicy();
  if (initial.allowSheetSnap) {
    logSnapStageGateEvent('allowed_immediate', {
      ...initial,
      snapStageGateLabel,
    });
    applySnap();
    return () => {};
  }

  logSnapStageGateEvent('deferred', {
    ...initial,
    snapStageGateLabel,
  });

  let hasFired = false;
  let unsubscribe: (() => void) | null = null;
  const dispose = (): void => {
    if (unsubscribe != null) {
      unsubscribe();
      unsubscribe = null;
    }
  };

  unsubscribe = resultsPresentationAuthority.subscribe(
    () => {
      if (hasFired) {
        return;
      }
      const next = readPolicy();
      if (!next.allowSheetSnap) {
        return;
      }
      hasFired = true;
      dispose();
      logSnapStageGateEvent('replayed_on_allow', {
        ...next,
        snapStageGateLabel,
      });
      applySnap();
    },
    SNAP_STAGE_GATE_OBSERVED_KEYS,
    `results-sheet-snap-stage-gate:${snapStageGateLabel}`
  );

  return dispose;
};
