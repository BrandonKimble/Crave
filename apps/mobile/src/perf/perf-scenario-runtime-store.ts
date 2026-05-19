import { create } from 'zustand';

import type {
  PerfJsFrameSamplerConfig,
  PerfJsTaskLatencySamplerConfig,
  PerfUiFrameSamplerConfig,
} from './perf-sampler-types';

export type RuntimePerfScenarioConfig = {
  requestId: string;
  scenario: string;
  runId: string;
  durationMs: number;
  jsFrameSampler: PerfJsFrameSamplerConfig;
  jsTaskLatencySampler: PerfJsTaskLatencySamplerConfig;
  uiFrameSampler: PerfUiFrameSamplerConfig;
  signature: string;
};

type PerfScenarioRuntimeState = {
  activeConfig: RuntimePerfScenarioConfig | null;
  measuredRepeatLoopActive: boolean;
  setActiveConfig: (config: RuntimePerfScenarioConfig) => void;
  setMeasuredRepeatLoopActive: (active: boolean) => void;
  clearActiveConfig: (runId?: string | null) => void;
};

export const usePerfScenarioRuntimeStore = create<PerfScenarioRuntimeState>((set) => ({
  activeConfig: null,
  measuredRepeatLoopActive: false,
  setActiveConfig: (config) => set({ activeConfig: config, measuredRepeatLoopActive: false }),
  setMeasuredRepeatLoopActive: (active) => set({ measuredRepeatLoopActive: active }),
  clearActiveConfig: (runId) =>
    set((state) => {
      if (runId && state.activeConfig?.runId !== runId) {
        return state;
      }
      return { activeConfig: null, measuredRepeatLoopActive: false };
    }),
}));
