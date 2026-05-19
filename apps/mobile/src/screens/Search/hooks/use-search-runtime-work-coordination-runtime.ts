import React from 'react';

import {
  createSearchSurfaceRedrawCoordinator,
  type SearchSurfaceRedrawCoordinator,
} from '../runtime/controller/search-surface-redraw-coordinator';
import {
  isSearchSurfaceRedrawDeferredChromePhase,
  isSearchSurfaceRedrawVisibleAdmissionPhase,
} from '../runtime/controller/search-surface-redraw-phase';
import { createFrameBudgetGovernor } from '../runtime/scheduler/frame-budget-governor';
import {
  createPhaseBMaterializer,
  type PhaseBMaterializer,
} from '../runtime/scheduler/phase-b-materializer';
import { RuntimeWorkScheduler } from '../runtime/scheduler/runtime-work-scheduler';
import type { ResultsPresentationSurfaceAuthority } from '../runtime/shared/results-presentation-surface-authority';
import type { SearchRuntimeBus } from '../runtime/shared/search-runtime-bus';

type UseSearchRuntimeWorkCoordinationRuntimeArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
};

export type SearchRuntimeWorkCoordinationRuntime = {
  runtimeWorkSchedulerRef: React.MutableRefObject<RuntimeWorkScheduler>;
  searchSurfaceRedrawCoordinatorRef: React.MutableRefObject<SearchSurfaceRedrawCoordinator>;
  phaseBMaterializerRef: React.MutableRefObject<PhaseBMaterializer>;
};

export const useSearchRuntimeWorkCoordinationRuntime = ({
  resultsPresentationSurfaceAuthority,
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

  const searchSurfaceRedrawCoordinatorRef = React.useRef<SearchSurfaceRedrawCoordinator | null>(
    null
  );
  if (!searchSurfaceRedrawCoordinatorRef.current) {
    searchSurfaceRedrawCoordinatorRef.current = createSearchSurfaceRedrawCoordinator();
  }

  const phaseBMaterializerRef = React.useRef<PhaseBMaterializer | null>(null);
  if (!phaseBMaterializerRef.current) {
    phaseBMaterializerRef.current = createPhaseBMaterializer(runtimeWorkSchedulerRef.current);
  }

  React.useEffect(() => {
    const coordinator = searchSurfaceRedrawCoordinatorRef.current;
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
      const allowHydrationFinalizeCommit = !isOperationInFlight || phase === 'chrome_ready';
      const isLeafOnlyVisualAdmission = isSearchSurfaceRedrawVisibleAdmissionPhase(phase);

      // Card/pin visual admission is owned by the leaf redraw store; publishing it here
      // wakes the route/sheet host tree on the transition-critical commit.
      if (!isLeafOnlyVisualAdmission) {
        searchRuntimeBus.batch(() => {
          searchRuntimeBus.publish({
            searchSurfaceRedrawPhase: phase,
            searchSurfaceRedrawOperationId: operationId,
            isSearchSurfaceRedrawActive: isActive,
            isSearchSurfaceRedrawPreflightFreezeActive: isOperationInFlight && phase === 'idle',
            isSearchSurfaceRedrawChromeFreezeActive: isActive && phase !== 'chrome_ready',
            isChromeDeferred: isSearchSurfaceRedrawDeferredChromePhase(phase),
            searchSurfaceRedrawCommitSpanPressureActive: isActive && commitSpanPressure,
            searchSurfaceRedrawSelectionFeedbackOperationId:
              isActive && operationId ? operationId : null,
          });
        });
      }
      resultsPresentationSurfaceAuthority.publish(
        { allowHydrationFinalizeCommit },
        'run_one_handoff_hydration_finalize_policy'
      );
    };

    publishDerivedState();
    return coordinator.subscribe(() => {
      publishDerivedState();
    });
  }, [resultsPresentationSurfaceAuthority, searchRuntimeBus]);

  React.useEffect(
    () => () => {
      phaseBMaterializerRef.current?.resetHydrationCommit();
      runtimeWorkSchedulerRef.current?.stopFrameLoop();
      runtimeWorkSchedulerRef.current?.clear();
      searchSurfaceRedrawCoordinatorRef.current?.reset();
    },
    []
  );

  return React.useMemo(
    () => ({
      runtimeWorkSchedulerRef:
        runtimeWorkSchedulerRef as React.MutableRefObject<RuntimeWorkScheduler>,
      searchSurfaceRedrawCoordinatorRef:
        searchSurfaceRedrawCoordinatorRef as React.MutableRefObject<SearchSurfaceRedrawCoordinator>,
      phaseBMaterializerRef: phaseBMaterializerRef as React.MutableRefObject<PhaseBMaterializer>,
    }),
    [phaseBMaterializerRef, searchSurfaceRedrawCoordinatorRef, runtimeWorkSchedulerRef]
  );
};
