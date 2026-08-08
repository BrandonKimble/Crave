import React from 'react';

import { createFrameBudgetGovernor } from '../runtime/scheduler/frame-budget-governor';
import {
  createPhaseBMaterializer,
  type PhaseBMaterializer,
} from '../runtime/scheduler/phase-b-materializer';
import { RuntimeWorkScheduler } from '../runtime/scheduler/runtime-work-scheduler';

/** F1735: this hook used to also own the surface-redraw coordinator and republish its
 *  snapshot onto the runtime bus. That coordinator was a structural fossil — no writer ever
 *  assigned an operationId, so the phase machine could never leave 'idle' and every derived
 *  bus field was pinned at its idle value (the two boot-time `op=null` publishes F1732
 *  observed were its only output). The coordinator, its bus fields, and its permanently-true
 *  hydration-finalize publish are deleted. */
export type SearchRuntimeWorkCoordinationRuntime = {
  runtimeWorkSchedulerRef: React.MutableRefObject<RuntimeWorkScheduler>;
  phaseBMaterializerRef: React.MutableRefObject<PhaseBMaterializer>;
};

export const useSearchRuntimeWorkCoordinationRuntime = (): SearchRuntimeWorkCoordinationRuntime => {
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

  const phaseBMaterializerRef = React.useRef<PhaseBMaterializer | null>(null);
  if (!phaseBMaterializerRef.current) {
    phaseBMaterializerRef.current = createPhaseBMaterializer(runtimeWorkSchedulerRef.current);
  }

  React.useEffect(
    () => () => {
      phaseBMaterializerRef.current?.resetHydrationCommit();
      runtimeWorkSchedulerRef.current?.stopFrameLoop();
      runtimeWorkSchedulerRef.current?.clear();
    },
    []
  );

  return React.useMemo(
    () => ({
      runtimeWorkSchedulerRef:
        runtimeWorkSchedulerRef as React.MutableRefObject<RuntimeWorkScheduler>,
      phaseBMaterializerRef: phaseBMaterializerRef as React.MutableRefObject<PhaseBMaterializer>,
    }),
    [phaseBMaterializerRef, runtimeWorkSchedulerRef]
  );
};
