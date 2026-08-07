// F873: ONE clock for the whole perf directory (was six identical re-declarations).
import { perfNow as resolvePerfNow } from './perf-clock';

import type { RuntimePerfScenarioConfig } from './perf-scenario-runtime-store';

type HermesSamplingProfilerLike = {
  enableSamplingProfiler?: () => void;
  disableSamplingProfiler?: () => void;
  dumpSampledTraceToFile?: (path: string) => void;
};

type HermesSamplingSession = {
  filePath: string;
  runId: string;
  startedAtMs: number;
};

const HERMES_PROFILE_ENABLED = process.env.EXPO_PUBLIC_PERF_SCENARIO_HERMES_PROFILE === '1';

let activeSession: HermesSamplingSession | null = null;

const sanitizeFilePart = (value: string): string => value.replace(/[^A-Za-z0-9_.-]/g, '_');

const resolveHermesInternal = (): HermesSamplingProfilerLike | null => {
  const maybeGlobal = globalThis as unknown as {
    HermesInternal?: HermesSamplingProfilerLike | null;
  };
  return maybeGlobal.HermesInternal ?? null;
};

const resolveHermesKeys = (hermesInternal: HermesSamplingProfilerLike | null): string[] =>
  hermesInternal ? Object.keys(hermesInternal).sort() : [];

export const startPerfScenarioHermesSamplingProfiler = ({
  config,
  reason,
  logEvent,
}: {
  config: RuntimePerfScenarioConfig;
  reason: string;
  logEvent: (payload: Record<string, unknown>) => void;
}): void => {
  if (!HERMES_PROFILE_ENABLED) {
    // F3706: this used to return in silence, so an operator who mistyped
    // EXPO_PUBLIC_PERF_SCENARIO_HERMES_PROFILE got a run indistinguishable from
    // one that profiled — while every OTHER early return in this file logs a
    // named status. Absence of a profile is a fact worth stating.
    logEvent({
      event: 'hermes_sampling_profile_disabled',
      reason,
      status: 'env_disabled',
      envVar: 'EXPO_PUBLIC_PERF_SCENARIO_HERMES_PROFILE',
    });
    return;
  }
  if (activeSession != null) {
    logEvent({
      event: 'hermes_sampling_profile_start_skipped',
      reason,
      status: 'already_active',
      filePath: activeSession.filePath,
      activeRunId: activeSession.runId,
    });
    return;
  }

  const hermesInternal = resolveHermesInternal();
  if (
    typeof hermesInternal?.enableSamplingProfiler !== 'function' ||
    typeof hermesInternal?.dumpSampledTraceToFile !== 'function'
  ) {
    logEvent({
      event: 'hermes_sampling_profile_unavailable',
      reason,
      status: hermesInternal ? 'api_missing' : 'hermes_internal_missing',
      availableKeys: resolveHermesKeys(hermesInternal),
    });
    return;
  }

  const filePath = `/tmp/crave-hermes-${sanitizeFilePart(config.runId)}.cpuprofile`;
  const startedAtMs = resolvePerfNow();
  try {
    hermesInternal.enableSamplingProfiler();
    activeSession = {
      filePath,
      runId: config.runId,
      startedAtMs,
    };
    logEvent({
      event: 'hermes_sampling_profile_started',
      reason,
      filePath,
      availableKeys: resolveHermesKeys(hermesInternal),
    });
  } catch (error) {
    logEvent({
      event: 'hermes_sampling_profile_start_failed',
      reason,
      filePath,
      message: error instanceof Error ? error.message : String(error),
      availableKeys: resolveHermesKeys(hermesInternal),
    });
  }
};

export const stopPerfScenarioHermesSamplingProfiler = ({
  config,
  reason,
  logEvent,
}: {
  config: RuntimePerfScenarioConfig;
  reason: string;
  logEvent: (payload: Record<string, unknown>) => void;
}): void => {
  if (!HERMES_PROFILE_ENABLED) {
    // Symmetric with the start path (F3706): a named status, not silence.
    logEvent({
      event: 'hermes_sampling_profile_disabled',
      reason,
      status: 'env_disabled',
      envVar: 'EXPO_PUBLIC_PERF_SCENARIO_HERMES_PROFILE',
    });
    return;
  }
  const session = activeSession;
  if (session == null) {
    logEvent({
      event: 'hermes_sampling_profile_stop_skipped',
      reason,
      status: 'not_active',
    });
    return;
  }
  if (session.runId !== config.runId) {
    // F3706: this used to return with the profiler STILL SAMPLING and
    // `activeSession` still set — so every later start took the `already_active`
    // branch and no subsequent run was ever profiled. A stale session from
    // another run is not a reason to keep sampling for the process lifetime; it
    // is a reason to disarm and say so. A profiler is not a passive probe: left
    // on, it is a real cost paid by the thing being measured.
    const staleHermesInternal = resolveHermesInternal();
    let disarmError: string | null = null;
    try {
      staleHermesInternal?.disableSamplingProfiler?.();
    } catch (error) {
      disarmError = error instanceof Error ? error.message : String(error);
    }
    activeSession = null;
    logEvent({
      event: 'hermes_sampling_profile_stop_skipped',
      reason,
      status: 'run_mismatch',
      activeRunId: session.runId,
      requestedRunId: config.runId,
      filePath: session.filePath,
      disarmed: disarmError == null,
      disarmError,
    });
    return;
  }

  const hermesInternal = resolveHermesInternal();
  const durationMs = Number(Math.max(0, resolvePerfNow() - session.startedAtMs).toFixed(1));
  try {
    hermesInternal?.dumpSampledTraceToFile?.(session.filePath);
    hermesInternal?.disableSamplingProfiler?.();
    activeSession = null;
    logEvent({
      event: 'hermes_sampling_profile_stopped',
      reason,
      filePath: session.filePath,
      durationMs,
      hasDisableApi: typeof hermesInternal?.disableSamplingProfiler === 'function',
      // F3706: the dump is guarded by TWO optional chains, so a vanished API is a
      // silent no-op and this line then reports a `filePath` that does not exist.
      // The one API whose absence destroys the artifact was the one not reported.
      hasDumpApi: typeof hermesInternal?.dumpSampledTraceToFile === 'function',
    });
  } catch (error) {
    // F3706: this catch was EMPTY, so a throw here left the profiler ON and said
    // nothing — the failure that matters most, reported least.
    let disarmError: string | null = null;
    try {
      hermesInternal?.disableSamplingProfiler?.();
    } catch (disarmFailure) {
      disarmError = disarmFailure instanceof Error ? disarmFailure.message : String(disarmFailure);
    }
    activeSession = null;
    logEvent({
      event: 'hermes_sampling_profile_stop_failed',
      reason,
      filePath: session.filePath,
      durationMs,
      message: error instanceof Error ? error.message : String(error),
      disarmed: disarmError == null,
      disarmError,
      hasDumpApi: typeof hermesInternal?.dumpSampledTraceToFile === 'function',
      availableKeys: resolveHermesKeys(hermesInternal),
    });
  }
};
