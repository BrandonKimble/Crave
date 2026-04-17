import { create } from 'zustand';

import type {
  PerfHarnessScenario,
  PerfJsFrameSamplerConfig,
  PerfNavSwitchLoopConfig,
  PerfUiFrameSamplerConfig,
} from './perf-harness-runtime-types';

export type RuntimePerfHarnessConfig = {
  requestId: string;
  scenario: PerfHarnessScenario;
  runId: string;
  runs: number;
  startDelayMs: number;
  cooldownMs: number;
  navSwitchLoop: PerfNavSwitchLoopConfig;
  jsFrameSampler: PerfJsFrameSamplerConfig;
  uiFrameSampler: PerfUiFrameSamplerConfig;
  signature: string;
};

type PerfHarnessRuntimeState = {
  activeConfig: RuntimePerfHarnessConfig | null;
  setActiveConfig: (config: RuntimePerfHarnessConfig) => void;
  clearActiveConfig: () => void;
};

export const usePerfHarnessRuntimeStore = create<PerfHarnessRuntimeState>((set) => ({
  activeConfig: null,
  setActiveConfig: (config) => set({ activeConfig: config }),
  clearActiveConfig: () => set({ activeConfig: null }),
}));
