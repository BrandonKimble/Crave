// REVEAL-COMMIT ATTRIBUTION (the release-lane JS ~164ms reveal stall, 2026-07-21):
// the JsFrameSampler window proves ONE long JS task at the reveal commit; this span
// decomposes it from the inside. Stage marks accumulate during the task and flush as
// ONE line after it ends (setTimeout(0) runs in the next task, so `taskEnd` bounds
// the stalled task's real length, React commit included). The line goes to the
// console (dev) AND the UIFrameSampler native os_log sink (release — console is
// stripped there), mirroring the samplers' own release-lane route.
//
// Inert unless a span is open: every mark call is a null check when idle, and only
// the episode-release read (once per reveal) opens one.
import { NativeModules } from 'react-native';

type RevealCommitStage = {
  label: string;
  atMs: number;
  durMs?: number;
};

let spanStartedAtMs: number | null = null;
let spanStages: RevealCommitStage[] = [];
let spanRowRenderCount = 0;
let spanFlushScheduled = false;

const resolveNowMs = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const emitRevealCommitLine = (line: string): void => {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(line);
  }
  const nativeSampler = (NativeModules as Record<string, unknown>).UIFrameSampler as
    | { logEvent?: (message: string) => void }
    | undefined;
  try {
    nativeSampler?.logEvent?.(line);
  } catch {
    // telemetry only — never throw into the render path
  }
};

const flushRevealCommitSpan = (): void => {
  spanFlushScheduled = false;
  const startedAtMs = spanStartedAtMs;
  spanStartedAtMs = null;
  if (startedAtMs == null) {
    return;
  }
  const taskEndRelMs = resolveNowMs() - startedAtMs;
  const stages = spanStages
    .map((stage) => {
      const rel = (stage.atMs - startedAtMs).toFixed(1);
      return stage.durMs != null ? `${stage.label}@${rel}(+${stage.durMs.toFixed(1)})` : `${stage.label}@${rel}`;
    })
    .join(' ');
  emitRevealCommitLine(
    `[RevealCommit] taskEnd=${taskEndRelMs.toFixed(1)} rows=${spanRowRenderCount} ${stages}`
  );
  spanStages = [];
  spanRowRenderCount = 0;
};

// Opens the span (idempotent within one task) and schedules the flush for the next
// task. Called from the episode-release snapshot read — the first work of the
// stalled task.
export const beginRevealCommitSpan = (label: string): void => {
  const nowMs = resolveNowMs();
  if (spanStartedAtMs == null) {
    spanStartedAtMs = nowMs;
    spanStages = [];
    spanRowRenderCount = 0;
  }
  spanStages.push({ label, atMs: nowMs });
  if (!spanFlushScheduled) {
    spanFlushScheduled = true;
    setTimeout(flushRevealCommitSpan, 0);
  }
};

export const markRevealCommitStage = (label: string, durMs?: number): void => {
  if (spanStartedAtMs == null) {
    return;
  }
  spanStages.push({ label, atMs: resolveNowMs(), durMs });
};

// Row renders are marked by entry timestamp only (a function component cannot cheaply
// observe its own exit) — the GAPS between consecutive row marks and the taskEnd
// carry the per-row cost.
export const markRevealCommitRowRender = (label: string): void => {
  if (spanStartedAtMs == null) {
    return;
  }
  spanRowRenderCount += 1;
  spanStages.push({ label: `row:${label}`, atMs: resolveNowMs() });
};
