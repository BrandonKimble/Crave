import React from 'react';
import type { RunOneHandoffCoordinator } from '../controller/run-one-handoff-coordinator';
import { isRunOneHandoffDeferredChromePhase } from '../controller/run-one-handoff-phase';
import type { SearchRuntimeBus } from './search-runtime-bus';

/**
 * Bridges RunOneHandoffCoordinator phase transitions directly to the
 * SearchRuntimeBus, bypassing SearchScreen's useState. This eliminates
 * the primary coupling that forces SearchScreen to re-render on every
 * phase transition, which was cascading to all child trees and causing
 * 130–410ms JS stalls from commit overlap.
 */
export const useHandoffBusBridge = (
  coordinatorRef: React.MutableRefObject<RunOneHandoffCoordinator>,
  bus: SearchRuntimeBus
): void => {
  React.useEffect(() => {
    const coordinator = coordinatorRef.current;

    const publishDerivedState = () => {
      const snapshot = coordinator.getSnapshot();
      const phase = snapshot.phase;
      const operationId = snapshot.operationId;
      const isOperationInFlight = operationId != null;
      const isActive = phase !== 'idle';
      const commitSpanPressure = snapshot.metadata.commitSpanPressure === true;

      bus.batch(() => {
        bus.publish({
          runOneHandoffPhase: phase,
          runOneHandoffOperationId: operationId,
          isRun1HandoffActive: isActive,
          isRunOnePreflightFreezeActive: isOperationInFlight && phase === 'idle',
          isRunOneChromeFreezeActive: isActive && phase !== 'h4_chrome_resume',
          isChromeDeferred: isRunOneHandoffDeferredChromePhase(phase),
          runOneCommitSpanPressureActive: isActive && commitSpanPressure,
          allowHydrationFinalizeCommit: !isOperationInFlight || phase === 'h4_chrome_resume',
          runOneSelectionFeedbackOperationId: isActive && operationId ? operationId : null,
        });
      });
    };

    // Publish initial state
    publishDerivedState();

    // Subscribe to all future transitions
    return coordinator.subscribe(() => {
      publishDerivedState();
    });
  }, [coordinatorRef, bus]);
};
