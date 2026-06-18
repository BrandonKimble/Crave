import {
  getActiveSearchNavSwitchPerfProbe,
  getSearchNavSwitchNowMs,
  shouldRecordSearchNavSwitchRuntimeAttribution,
} from './search-nav-switch-perf-probe';

type SearchNavSwitchRuntimeAttributionSpan = {
  probeSeq: number;
  from: string;
  to: string;
  owner: string;
  operation: string;
  startedAtMs: number;
  endedAtMs: number;
  durationMs: number;
};

export type SearchNavSwitchRuntimeAttributionOwner = {
  ownerId: string;
  owner: string;
  operation: string;
  overlapMs: number;
  totalDurationMs: number;
  maxDurationMs: number;
  spanCount: number;
};

const RUNTIME_ATTRIBUTION_BUFFER_LIMIT = 5000;

const runtimeAttributionSpans: SearchNavSwitchRuntimeAttributionSpan[] = [];

const roundAttributionValue = (value: number): number => Number(value.toFixed(1));

export const recordSearchNavSwitchRuntimeAttributionSpan = ({
  owner,
  operation,
  startedAtMs,
  endedAtMs,
}: {
  owner: string;
  operation: string;
  startedAtMs: number;
  endedAtMs: number;
}): void => {
  if (!shouldRecordSearchNavSwitchRuntimeAttribution()) {
    return;
  }
  const probe = getActiveSearchNavSwitchPerfProbe();
  if (!probe) {
    return;
  }
  const durationMs = Math.max(0, endedAtMs - startedAtMs);
  runtimeAttributionSpans.push({
    probeSeq: probe.seq,
    from: probe.from,
    to: probe.to,
    owner,
    operation,
    startedAtMs,
    endedAtMs,
    durationMs,
  });
  if (runtimeAttributionSpans.length > RUNTIME_ATTRIBUTION_BUFFER_LIMIT) {
    runtimeAttributionSpans.splice(
      0,
      runtimeAttributionSpans.length - RUNTIME_ATTRIBUTION_BUFFER_LIMIT
    );
  }
};

export const withSearchNavSwitchRuntimeAttribution = <T>(
  owner: string,
  operation: string,
  fn: () => T
): T => {
  if (!shouldRecordSearchNavSwitchRuntimeAttribution()) {
    return fn();
  }
  const probe = getActiveSearchNavSwitchPerfProbe();
  if (!probe) {
    return fn();
  }
  const startedAtMs = getSearchNavSwitchNowMs();
  try {
    return fn();
  } finally {
    recordSearchNavSwitchRuntimeAttributionSpan({
      owner,
      operation,
      startedAtMs,
      endedAtMs: getSearchNavSwitchNowMs(),
    });
  }
};

export const startSearchNavSwitchRuntimeAttributionSpan = (): number | null => {
  if (!shouldRecordSearchNavSwitchRuntimeAttribution()) {
    return null;
  }
  if (!getActiveSearchNavSwitchPerfProbe()) {
    return null;
  }
  return getSearchNavSwitchNowMs();
};

export const finishSearchNavSwitchRuntimeAttributionSpan = ({
  owner,
  operation,
  startedAtMs,
}: {
  owner: string;
  operation: string;
  startedAtMs: number | null;
}): void => {
  if (startedAtMs == null) {
    return;
  }
  recordSearchNavSwitchRuntimeAttributionSpan({
    owner,
    operation,
    startedAtMs,
    endedAtMs: getSearchNavSwitchNowMs(),
  });
};

export const markSearchNavSwitchRuntimeAttribution = (owner: string, operation: string): void => {
  const startedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
  finishSearchNavSwitchRuntimeAttributionSpan({
    owner,
    operation,
    startedAtMs,
  });
};

export const resolveSearchNavSwitchRuntimeAttributionOwners = ({
  windowStartMs,
  windowEndMs,
  limit = 10,
}: {
  windowStartMs: number;
  windowEndMs: number;
  limit?: number;
}): SearchNavSwitchRuntimeAttributionOwner[] => {
  if (!shouldRecordSearchNavSwitchRuntimeAttribution()) {
    return [];
  }
  const ownerMap = new Map<string, SearchNavSwitchRuntimeAttributionOwner>();
  runtimeAttributionSpans.forEach((span) => {
    if (span.endedAtMs < windowStartMs || span.startedAtMs > windowEndMs) {
      return;
    }
    const overlapMs = Math.max(
      0,
      Math.min(windowEndMs, span.endedAtMs) - Math.max(windowStartMs, span.startedAtMs)
    );
    if (overlapMs <= 0 && span.durationMs > 0) {
      return;
    }
    const ownerId = `${span.owner}:${span.operation}`;
    const existing = ownerMap.get(ownerId) ?? {
      ownerId,
      owner: span.owner,
      operation: span.operation,
      overlapMs: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
      spanCount: 0,
    };
    existing.overlapMs += overlapMs;
    existing.totalDurationMs += span.durationMs;
    existing.maxDurationMs = Math.max(existing.maxDurationMs, span.durationMs);
    existing.spanCount += 1;
    ownerMap.set(ownerId, existing);
  });

  return Array.from(ownerMap.values())
    .sort((left, right) => {
      if (right.totalDurationMs !== left.totalDurationMs) {
        return right.totalDurationMs - left.totalDurationMs;
      }
      if (right.maxDurationMs !== left.maxDurationMs) {
        return right.maxDurationMs - left.maxDurationMs;
      }
      if (right.spanCount !== left.spanCount) {
        return right.spanCount - left.spanCount;
      }
      return left.ownerId.localeCompare(right.ownerId);
    })
    .slice(0, limit)
    .map((owner) => ({
      ...owner,
      overlapMs: roundAttributionValue(owner.overlapMs),
      totalDurationMs: roundAttributionValue(owner.totalDurationMs),
      maxDurationMs: roundAttributionValue(owner.maxDurationMs),
    }));
};

export const pruneSearchNavSwitchRuntimeAttributionBefore = (beforeMs: number): void => {
  const firstRetainedIndex = runtimeAttributionSpans.findIndex(
    (span) => span.endedAtMs >= beforeMs
  );
  if (firstRetainedIndex <= 0) {
    return;
  }
  runtimeAttributionSpans.splice(0, firstRetainedIndex);
};
