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

const resolvePerfNow = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

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
    logEvent({
      event: 'hermes_sampling_profile_stop_skipped',
      reason,
      status: 'run_mismatch',
      activeRunId: session.runId,
      requestedRunId: config.runId,
      filePath: session.filePath,
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
    });
  } catch (error) {
    try {
      hermesInternal?.disableSamplingProfiler?.();
    } catch {
      // Best effort: keep the failure focused on the dump path.
    }
    activeSession = null;
    logEvent({
      event: 'hermes_sampling_profile_stop_failed',
      reason,
      filePath: session.filePath,
      durationMs,
      message: error instanceof Error ? error.message : String(error),
      availableKeys: resolveHermesKeys(hermesInternal),
    });
  }
};
