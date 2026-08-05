import { logger } from '../../../../utils';
import { shouldLogSearchNavSwitchProfilerSpanLogs } from './search-nav-switch-perf-probe';

const JS_FLOOR_PROBE_PROFILER_SPAN_LOG_MIN_MS = 12;
const NAV_SWITCH_PROFILER_LOG_MIN_MS = 4;

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
  // F1042(2): a dead `SHOULD_LOG_PROFILER = false` / `PROFILER_MIN_MS = Infinity`
  // branch used to sit here — two independent, undocumented kill switches with no
  // caller and no way to enable them (unlike the blessed dormant map/stall
  // instruments, which have a real threshold waiting behind their flag and are
  // documented as intentionally dormant). This block was pure dead code duplicating
  // the two live, param-driven branches below it. Deleted rather than repaired.

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
