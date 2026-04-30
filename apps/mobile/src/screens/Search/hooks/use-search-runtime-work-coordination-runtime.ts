import React from 'react';

import {
  createRunOneHandoffCoordinator,
  type RunOneHandoffCoordinator,
} from '../runtime/controller/run-one-handoff-coordinator';
import { createFrameBudgetGovernor } from '../runtime/scheduler/frame-budget-governor';
import {
  createPhaseBMaterializer,
  type PhaseBMaterializer,
} from '../runtime/scheduler/phase-b-materializer';
import { RuntimeWorkScheduler } from '../runtime/scheduler/runtime-work-scheduler';
import type { SearchRuntimeBus } from '../runtime/shared/search-runtime-bus';

type UseSearchRuntimeWorkCoordinationRuntimeArgs = {
  searchRuntimeBus: SearchRuntimeBus;
};

export type SearchRuntimeWorkCoordinationRuntime = {
  runtimeWorkSchedulerRef: React.MutableRefObject<RuntimeWorkScheduler>;
  runOneHandoffCoordinatorRef: React.MutableRefObject<RunOneHandoffCoordinator>;
  phaseBMaterializerRef: React.MutableRefObject<PhaseBMaterializer>;
};

export const useSearchRuntimeWorkCoordinationRuntime = ({
  searchRuntimeBus,
}: UseSearchRuntimeWorkCoordinationRuntimeArgs): SearchRuntimeWorkCoordinationRuntime => {
  const frameBudgetGovernorRef = React.useRef<ReturnType<typeof createFrameBudgetGovernor> | null>(
    null
  );
  if (!frameBudgetGovernorRef.current) {
    frameBudgetGovernorRef.current = createFrameBudgetGovernor();
  }

  const runtimeWorkSchedulerRef = React.useRef<RuntimeWorkScheduler | null>(null);
  if (!runtimeWorkSchedulerRef.current) {
    runtimeWorkSchedulerRef.current = new RuntimeWorkScheduler(frameBudgetGovernorRef.current);
  }

  const runOneHandoffCoordinatorRef = React.useRef<RunOneHandoffCoordinator | null>(null);
  if (!runOneHandoffCoordinatorRef.current) {
    runOneHandoffCoordinatorRef.current = createRunOneHandoffCoordinator();
  }

  const phaseBMaterializerRef = React.useRef<PhaseBMaterializer | null>(null);
  if (!phaseBMaterializerRef.current) {
    phaseBMaterializerRef.current = createPhaseBMaterializer(runtimeWorkSchedulerRef.current);
  }

  React.useEffect(() => {
    const coordinator = runOneHandoffCoordinatorRef.current;
    if (!coordinator) {
      return;
    }

    const publishDerivedState = () => {
      const snapshot = coordinator.getSnapshot();
      const phase = snapshot.phase;
      const operationId = snapshot.operationId;
      const isOperationInFlight = operationId != null;
      const isActive = phase !== 'idle';
      const commitSpanPressure = snapshot.metadata.commitSpanPressure === true;

      searchRuntimeBus.batch(() => {
        searchRuntimeBus.publish({
          runOneHandoffPhase: phase,
          runOneHandoffOperationId: operationId,
          isRun1HandoffActive: isActive,
          isRunOnePreflightFreezeActive: isOperationInFlight && phase === 'idle',
          isRunOneChromeFreezeActive: isActive && phase !== 'h4_chrome_resume',
          isChromeDeferred: phase === 'h2_marker_enter' || phase === 'h3_hydration_ramp',
          runOneCommitSpanPressureActive: isActive && commitSpanPressure,
          allowHydrationFinalizeCommit: !isOperationInFlight || phase === 'h4_chrome_resume',
          runOneSelectionFeedbackOperationId: isActive && operationId ? operationId : null,
        });
      });
    };

    publishDerivedState();
    return coordinator.subscribe(() => {
      publishDerivedState();
    });
  }, [searchRuntimeBus]);

  React.useEffect(
    () => () => {
      phaseBMaterializerRef.current?.resetHydrationCommit();
      runtimeWorkSchedulerRef.current?.stopFrameLoop();
      runtimeWorkSchedulerRef.current?.clear();
      runOneHandoffCoordinatorRef.current?.reset();
    },
    []
  );

  return React.useMemo(
    () => ({
      runtimeWorkSchedulerRef:
        runtimeWorkSchedulerRef as React.MutableRefObject<RuntimeWorkScheduler>,
      runOneHandoffCoordinatorRef:
        runOneHandoffCoordinatorRef as React.MutableRefObject<RunOneHandoffCoordinator>,
      phaseBMaterializerRef:
        phaseBMaterializerRef as React.MutableRefObject<PhaseBMaterializer>,
    }),
    [phaseBMaterializerRef, runOneHandoffCoordinatorRef, runtimeWorkSchedulerRef]
  );
};
