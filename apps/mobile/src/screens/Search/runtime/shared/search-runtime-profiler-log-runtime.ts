import { logger } from '../../../../utils';
import { shouldLogSearchNavSwitchProfilerSpanLogs } from './search-nav-switch-perf-probe';

const JS_FLOOR_PROBE_PROFILER_SPAN_LOG_MIN_MS = 12;
const NAV_SWITCH_PROFILER_LOG_MIN_MS = 4;
const SHOULD_LOG_PROFILER = false;
const PROFILER_MIN_MS = Number.POSITIVE_INFINITY;

export const logSearchProfilerSpan = ({
  id,
  phase,
  actualDuration,
  baseDuration,
  commitSpanMs,
  stageHint,
  nowMs,
  runNumber,
  scenarioRunId,
  shouldEmitProfilerSpanLog,
  shouldEmitNavSwitchProfilerLog,
  activeNavSwitchProbe,
}: {
  id: string;
  phase: string;
  actualDuration: number;
  baseDuration: number;
  commitSpanMs: number;
  stageHint: string;
  nowMs: number;
  runNumber: number;
  scenarioRunId: string | null;
  shouldEmitProfilerSpanLog: boolean;
  shouldEmitNavSwitchProfilerLog: boolean;
  activeNavSwitchProbe: {
    seq: number;
    from: string;
    to: string;
    startedAtMs: number;
  } | null;
}): void => {
  if (SHOULD_LOG_PROFILER && actualDuration >= PROFILER_MIN_MS) {
    logger.debug(
      `[SearchPerf] Profiler ${id} ${phase} actual=${actualDuration.toFixed(
        1
      )}ms base=${baseDuration.toFixed(1)}ms`
    );
  }

  if (
    shouldEmitProfilerSpanLog &&
    (actualDuration >= JS_FLOOR_PROBE_PROFILER_SPAN_LOG_MIN_MS ||
      commitSpanMs >= JS_FLOOR_PROBE_PROFILER_SPAN_LOG_MIN_MS)
  ) {
    logger.debug('[SearchPerf][Profiler]', {
      event: 'profiler_span',
      id,
      phase,
      stageHint,
      actualDurationMs: Number(actualDuration.toFixed(1)),
      commitSpanMs: Number(commitSpanMs.toFixed(1)),
      nowMs: Number(nowMs.toFixed(1)),
      runNumber,
      scenarioRunId,
    });
  }

  if (
    shouldEmitNavSwitchProfilerLog &&
    shouldLogSearchNavSwitchProfilerSpanLogs() &&
    activeNavSwitchProbe &&
    (actualDuration >= NAV_SWITCH_PROFILER_LOG_MIN_MS ||
      commitSpanMs >= NAV_SWITCH_PROFILER_LOG_MIN_MS)
  ) {
    logger.debug('[NAV-SWITCH-PERF] profilerSpan', {
      seq: activeNavSwitchProbe.seq,
      from: activeNavSwitchProbe.from,
      to: activeNavSwitchProbe.to,
      id,
      phase,
      actualDurationMs: Number(actualDuration.toFixed(1)),
      baseDurationMs: Number(baseDuration.toFixed(1)),
      commitSpanMs: Number(commitSpanMs.toFixed(1)),
      ageMs: Number((nowMs - activeNavSwitchProbe.startedAtMs).toFixed(1)),
    });
  }
};
