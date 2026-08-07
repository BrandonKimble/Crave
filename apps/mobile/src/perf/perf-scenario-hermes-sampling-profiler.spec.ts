import type { RuntimePerfScenarioConfig } from './perf-scenario-runtime-store';

/**
 * F3706 — THE PROFILER WAS ARMED ON ONE PATH AND DISARMED ON TWO, NEITHER A DEFAULT EXIT.
 *
 * The leak's worst property was not the wasted sampling: it LATCHED. `activeSession`
 * stayed non-null, so every later start took the `already_active` branch and no
 * subsequent run was ever profiled — an instrument that silently stops instrumenting
 * after the first run that ended the ordinary way. These specs pin the two module-level
 * halves of the fix; the coordinator half (the duration-elapsed timeout and the effect
 * cleanup both disarm) is a call-site fact, asserted by the second test's shape: a stop
 * for a DIFFERENT run must leave the module armless rather than wedged.
 */
const config = (runId: string): RuntimePerfScenarioConfig =>
  ({
    runId,
    scenario: 'spec',
    requestId: 'req',
    signature: 'sig',
  }) as unknown as RuntimePerfScenarioConfig;

type Logged = Record<string, unknown>;

const loadProfiler = (enabled: boolean) => {
  const events: Logged[] = [];
  let profilerEnabled = false;
  let dumped: string | null = null;

  process.env.EXPO_PUBLIC_PERF_SCENARIO_HERMES_PROFILE = enabled ? '1' : '0';
  (globalThis as Record<string, unknown>).HermesInternal = {
    enableSamplingProfiler: () => {
      profilerEnabled = true;
    },
    disableSamplingProfiler: () => {
      profilerEnabled = false;
    },
    dumpSampledTraceToFile: (filePath: string) => {
      dumped = filePath;
    },
  };

  let api!: typeof import('./perf-scenario-hermes-sampling-profiler');
  jest.isolateModules(() => {
    api = require('./perf-scenario-hermes-sampling-profiler');
  });

  const logEvent = (payload: Logged) => {
    events.push(payload);
  };
  return {
    api,
    events,
    logEvent,
    isSampling: () => profilerEnabled,
    dumpedPath: () => dumped,
  };
};

afterEach(() => {
  delete (globalThis as Record<string, unknown>).HermesInternal;
  delete process.env.EXPO_PUBLIC_PERF_SCENARIO_HERMES_PROFILE;
});

describe('perf-scenario hermes sampling profiler', () => {
  it('a stop for a DIFFERENT run disarms instead of latching the module forever', () => {
    const { api, events, logEvent, isSampling } = loadProfiler(true);

    api.startPerfScenarioHermesSamplingProfiler({
      config: config('run-1'),
      reason: 'start',
      logEvent,
    });
    expect(isSampling()).toBe(true);

    // The shape of a leak that then wedges: something ends run-2 while run-1's
    // session is still open.
    api.stopPerfScenarioHermesSamplingProfiler({
      config: config('run-2'),
      reason: 'scenario_sampling_duration_elapsed',
      logEvent,
    });
    const mismatch = events.find((e) => e.status === 'run_mismatch');
    expect(mismatch).toBeDefined();
    expect(mismatch?.disarmed).toBe(true);
    expect(isSampling()).toBe(false);

    // THE PROPERTY THAT MATTERS: the next run is still profilable. Before the fix
    // this logged `already_active` and produced nothing, forever.
    api.startPerfScenarioHermesSamplingProfiler({
      config: config('run-3'),
      reason: 'start',
      logEvent,
    });
    expect(events.some((e) => e.status === 'already_active')).toBe(false);
    expect(isSampling()).toBe(true);
  });

  it('reports hasDumpApi — the one API whose absence destroys the artifact', () => {
    const { api, events, logEvent, dumpedPath } = loadProfiler(true);

    api.startPerfScenarioHermesSamplingProfiler({
      config: config('run-1'),
      reason: 'start',
      logEvent,
    });
    api.stopPerfScenarioHermesSamplingProfiler({
      config: config('run-1'),
      reason: 'stop',
      logEvent,
    });

    const stopped = events.find((e) => e.event === 'hermes_sampling_profile_stopped');
    expect(stopped?.hasDumpApi).toBe(true);
    expect(stopped?.hasDisableApi).toBe(true);
    expect(dumpedPath()).toBe(stopped?.filePath);
  });

  it('says so when the env var did not enable it, instead of returning in silence', () => {
    const { api, events, logEvent, isSampling } = loadProfiler(false);

    api.startPerfScenarioHermesSamplingProfiler({
      config: config('run-1'),
      reason: 'start',
      logEvent,
    });

    expect(isSampling()).toBe(false);
    expect(events).toEqual([
      {
        event: 'hermes_sampling_profile_disabled',
        reason: 'start',
        status: 'env_disabled',
        envVar: 'EXPO_PUBLIC_PERF_SCENARIO_HERMES_PROFILE',
      },
    ]);
  });
});
