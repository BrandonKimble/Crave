import type { InstrumentationMapQueryBudget } from './use-search-runtime-instrumentation-runtime-contract';

export const normalizeProfilerContributorId = (id: string): string => {
  const normalized = id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized.length > 0 ? normalized : 'unknown';
};

export const recordProfilerAttribution = ({
  shouldRecordProfilerAttribution,
  mapQueryBudget,
  contributorBase,
  actualDuration,
  commitSpanMs,
  minDurationMs,
}: {
  shouldRecordProfilerAttribution: boolean;
  mapQueryBudget: InstrumentationMapQueryBudget | null;
  contributorBase: string;
  actualDuration: number;
  commitSpanMs: number;
  minDurationMs: number;
}): void => {
  if (!shouldRecordProfilerAttribution) {
    return;
  }

  if (actualDuration >= minDurationMs) {
    mapQueryBudget?.recordRuntimeAttributionDurationMs(
      `profiler_render_${contributorBase}`,
      actualDuration
    );
  }

  if (commitSpanMs >= minDurationMs) {
    mapQueryBudget?.recordRuntimeAttributionDurationMs(
      `profiler_commit_span_${contributorBase}`,
      commitSpanMs
    );
  }
};
