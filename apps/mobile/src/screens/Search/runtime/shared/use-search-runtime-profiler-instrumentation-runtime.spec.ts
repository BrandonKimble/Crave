import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';

import { SEARCH_SUBMIT_NATURAL_SCENARIO } from '../../../../perf/perf-scenario-attribution';
import type { RuntimePerfScenarioConfig } from '../../../../perf/perf-scenario-runtime-store';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import { useSearchRuntimeProfilerInstrumentationRuntime } from './use-search-runtime-profiler-instrumentation-runtime';

/**
 * F6601 — THE OFF-SWITCH MUST HAVE AN OFF STATE.
 *
 * The hook's declared return type is `React.ProfilerOnRenderCallback | null`,
 * and ~45 branch sites across 18 overlay hosts take a "no profiler" arm on
 * null. Every one of them was unreachable, because the hook computed its three
 * emit-reasons inside the callback and returned that callback unconditionally:
 * `React.Profiler` was permanently mounted over the whole overlay tree with no
 * way to turn it off.
 *
 * WHY THIS ASSERTS AT THE HOOK BOUNDARY, NOT ON A RENDERED TREE. The default
 * mobile jest project is hermetic node and matches `*.spec.ts` only — no
 * `.tsx`, no React Native — and the one render lane in the repo
 * (jest.tracksheet-render.config.js) is scoped to tracksheet and is a
 * different session's dirty tree. Mounting a real overlay host here is not
 * available. Re-implementing a host's ternary inside this spec would assert
 * against a hand-written copy of the thing under test, which is the defect
 * this audit keeps finding, not a proof. So the spec asserts the ONE fact the
 * hosts all derive from — the hook yields null when nothing is being measured
 * — and the ternaries' `content` arm follows from it by construction and by
 * tsc.
 *
 * PROVING MUTATION (run and confirmed): restore the unconditional
 * `return profilerRender;` and the first case goes RED.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const renderProfilerCallback = (
  searchMode: 'natural' | 'shortcut' | null
): React.ProfilerOnRenderCallback | null => {
  let observed: React.ProfilerOnRenderCallback | null = null;

  const Probe = (): null => {
    observed = useSearchRuntimeProfilerInstrumentationRuntime({
      getPerfNow: () => 0,
      getActiveScenarioRunNumber: () => null,
      resolveProfilerStageHint: () => 'idle',
      searchMode,
      scenarioRunId: null,
    });
    return null;
  };

  let tree: ReactTestRenderer | null = null;
  act(() => {
    tree = TestRenderer.create(React.createElement(Probe));
  });
  act(() => {
    tree?.unmount();
  });
  return observed;
};

const activeScenarioConfig = (scenario: string): RuntimePerfScenarioConfig => ({
  requestId: 'req',
  scenario,
  runId: 'run',
  durationMs: 1000,
  jsFrameSampler: { enabled: false } as RuntimePerfScenarioConfig['jsFrameSampler'],
  jsTaskLatencySampler: { enabled: false } as RuntimePerfScenarioConfig['jsTaskLatencySampler'],
  uiFrameSampler: { enabled: false } as RuntimePerfScenarioConfig['uiFrameSampler'],
  signature: 'sig',
});

describe('useSearchRuntimeProfilerInstrumentationRuntime', () => {
  afterEach(() => {
    act(() => {
      usePerfScenarioRuntimeStore.getState().clearActiveConfig();
    });
  });

  it('returns null when no emit-reason holds, so the hosts unmount React.Profiler', () => {
    // No perf scenario, natural mode (the shortcut-probe env flag is off in the
    // hermetic lane), nav-switch attribution flag off. This is the app's
    // ordinary state — the state that could not previously produce null.
    expect(renderProfilerCallback('natural')).toBeNull();
  });

  it('returns a callback while a perf scenario is attributing', () => {
    act(() => {
      usePerfScenarioRuntimeStore
        .getState()
        .setActiveConfig(activeScenarioConfig(SEARCH_SUBMIT_NATURAL_SCENARIO));
    });
    expect(typeof renderProfilerCallback('natural')).toBe('function');
  });

  it('stays off for a scenario the attribution predicate does not claim', () => {
    act(() => {
      usePerfScenarioRuntimeStore.getState().setActiveConfig(activeScenarioConfig('unrelated'));
    });
    expect(renderProfilerCallback('natural')).toBeNull();
  });
});
