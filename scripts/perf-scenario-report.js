#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const usage = () => {
  console.log('Usage: scripts/perf-scenario-report.js <log_path> [output_json_path]');
};

if (process.argv.includes('-h') || process.argv.includes('--help')) {
  usage();
  process.exit(0);
}

const logPath = process.argv[2];
const outputPath = process.argv[3];

if (!logPath) {
  usage();
  process.exit(2);
}

const linePattern = /\[SearchPerf\]\[([^\]]+)\]\s+({.*})/;
const SUMMARY_LIMIT = 40;
const WORST_LIMIT = 20;

const readJsonPayloads = (content) => {
  const events = [];
  content.split(/\r?\n/).forEach((line, index) => {
    const match = line.match(linePattern);
    if (!match) {
      return;
    }
    try {
      events.push({
        line: index + 1,
        channel: match[1],
        rawLineLength: line.length,
        payloadLength: match[2].length,
        payload: JSON.parse(match[2]),
      });
    } catch {
      events.push({
        line: index + 1,
        channel: match[1],
        rawLineLength: line.length,
        payloadLength: match[2].length,
        payload: { event: 'unparseable_payload', raw: match[2] },
      });
    }
  });
  return events;
};

const maxBy = (items, score) => {
  let winner = null;
  let winnerScore = Number.NEGATIVE_INFINITY;
  items.forEach((item) => {
    const value = score(item);
    if (Number.isFinite(value) && value > winnerScore) {
      winner = item;
      winnerScore = value;
    }
  });
  return winner;
};

const topBy = (items, score, limit) =>
  [...items]
    .sort((left, right) => {
      const rightScore = score(right);
      const leftScore = score(left);
      return (
        (Number.isFinite(rightScore) ? rightScore : Number.NEGATIVE_INFINITY) -
        (Number.isFinite(leftScore) ? leftScore : Number.NEGATIVE_INFINITY)
      );
    })
    .slice(0, limit)
    .map((event) => ({
      line: event.line,
      ...event.payload,
    }));

const summarizeSampler = (events, channel, metricName) => {
  const channelEvents = events.filter((event) => event.channel === channel);
  const windows = channelEvents.filter((event) => {
    const eventName = event.payload.event;
    return eventName === 'window' || eventName === 'task_window';
  });
  const stalls = channelEvents.filter((event) => {
    const eventName = event.payload.event;
    return eventName === 'stall' || eventName === 'task_stall';
  });
  const worstWindow = maxBy(windows, (event) => Number(event.payload[metricName] ?? 0));
  return {
    eventCount: channelEvents.length,
    windowCount: windows.length,
    stallCount: stalls.length,
    worstWindows: topBy(windows, (event) => Number(event.payload[metricName] ?? 0), 5),
    worstWindow: worstWindow
      ? {
          line: worstWindow.line,
          ...worstWindow.payload,
        }
      : null,
  };
};

const summarizeChannels = (events) =>
  events.reduce((counts, event) => {
    counts[event.channel] = (counts[event.channel] ?? 0) + 1;
    return counts;
  }, {});

const scenarioRunIdPattern =
  /(?:^|[^A-Za-z0-9_])(scenario-[A-Za-z0-9_]+-\d{8}T\d{6}Z-[A-Za-z0-9]+)(?=$|[^A-Za-z0-9_])/g;

const deriveScenarioRunIdFromPath = (filePath) => {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return null;
  }
  const basename = path.basename(filePath, path.extname(filePath));
  const matches = [...basename.matchAll(scenarioRunIdPattern)].map((match) => match[1]);
  return matches.length > 0 ? matches[matches.length - 1] : null;
};

const deriveScenarioNameFromRunId = (runId) => {
  const match = String(runId ?? '').match(/^scenario-(.+)-\d{8}T\d{6}Z-[A-Za-z0-9]+$/);
  return match ? match[1] : null;
};

const summarizeLogBytes = (events, keyResolver) => {
  const groups = new Map();
  events.forEach((event) => {
    const key = keyResolver(event) ?? '<unknown>';
    const current = groups.get(key) ?? {
      key,
      count: 0,
      totalRawLineBytes: 0,
      totalPayloadBytes: 0,
      maxPayloadBytes: 0,
      sampleLines: [],
    };
    const rawLineLength = Number(event.rawLineLength ?? 0);
    const payloadLength = Number(event.payloadLength ?? 0);
    current.count += 1;
    current.totalRawLineBytes += Number.isFinite(rawLineLength) ? rawLineLength : 0;
    current.totalPayloadBytes += Number.isFinite(payloadLength) ? payloadLength : 0;
    current.maxPayloadBytes = Math.max(
      current.maxPayloadBytes,
      Number.isFinite(payloadLength) ? payloadLength : 0
    );
    if (current.sampleLines.length < 8) {
      current.sampleLines.push(event.line);
    }
    groups.set(key, current);
  });
  return [...groups.values()]
    .sort((left, right) => right.totalPayloadBytes - left.totalPayloadBytes)
    .slice(0, SUMMARY_LIMIT);
};

const summarizeEventLogBytes = (events) =>
  summarizeLogBytes(events, (event) =>
    event.payload?.event ? `${event.channel}:${event.payload.event}` : event.channel
  );

const scenarioEvents = (events) =>
  events
    .filter((event) => event.channel === 'Scenario')
    .map((event) => ({
      line: event.line,
      ...event.payload,
    }));

const searchRequestEvents = (events) =>
  events
    .filter((event) => event.channel === 'SearchRequest')
    .map((event) => ({
      line: event.line,
      ...event.payload,
    }));

const hermesSamplingProfileEvents = (events) =>
  events
    .filter(
      (event) =>
        event.channel === 'Scenario' &&
        typeof event.payload?.event === 'string' &&
        event.payload.event.startsWith('hermes_sampling_profile_')
    )
    .map((event) => ({
      line: event.line,
      ...event.payload,
    }));

const summarizeHermesSamplingProfile = (events) => {
  const profileEvents = hermesSamplingProfileEvents(events);
  const stopped = [...profileEvents]
    .reverse()
    .find((event) => event.event === 'hermes_sampling_profile_stopped');
  const unavailable = [...profileEvents]
    .reverse()
    .find((event) => event.event === 'hermes_sampling_profile_unavailable');
  const failed = [...profileEvents]
    .reverse()
    .find(
      (event) =>
        event.event === 'hermes_sampling_profile_start_failed' ||
        event.event === 'hermes_sampling_profile_stop_failed'
    );
  return {
    eventCount: profileEvents.length,
    filePath: stopped?.filePath ?? failed?.filePath ?? null,
    status: stopped
      ? 'captured'
      : failed
      ? failed.event
      : unavailable
      ? unavailable.status ?? 'unavailable'
      : profileEvents.length > 0
      ? 'unknown'
      : 'not_requested',
    availableKeys: unavailable?.availableKeys ?? failed?.availableKeys ?? null,
    events: profileEvents.slice(-WORST_LIMIT),
  };
};

const profilerEvents = (events) =>
  events
    .filter(
      (event) =>
        event.channel === 'Profiler' &&
        (event.payload.event === 'scenario_profiler_span' ||
          event.payload.event === 'profiler_span' ||
          (event.payload.event === 'quiet_measured_loop_attribution_aggregate' &&
            event.payload.sourceEvent === 'scenario_profiler_span'))
    )
    .map((event) => {
      if (event.payload.event === 'quiet_measured_loop_attribution_aggregate') {
        const sample = Array.isArray(event.payload.samples) ? event.payload.samples[0] ?? {} : {};
        return {
          line: event.line,
          event: 'scenario_profiler_span',
          id: sample.id ?? '<quiet_aggregate>',
          phase: sample.phase,
          stageHint: sample.stageHint,
          actualDurationMs: event.payload.maxActualDurationMs,
          commitSpanMs: event.payload.maxCommitSpanMs,
          totalActualDurationMs: event.payload.totalActualDurationMs,
          count: event.payload.count,
          aggregateKey: event.payload.aggregateKey,
          handoffPhase: sample.handoffPhase,
          handoffOperationId: sample.handoffOperationId,
          quietAggregate: true,
          samples: event.payload.samples,
        };
      }
      return {
        line: event.line,
        ...event.payload,
      };
    });

const stallProbeEvents = (events) =>
  events
    .filter(
      (event) =>
        event.channel === 'StallProbe' &&
        (event.payload.event === 'scenario_js_stall_probe' ||
          event.payload.event === 'js_stall_probe')
    )
    .map((event) => ({
      line: event.line,
      ...event.payload,
    }));

const workSpanEvents = (events) =>
  events
    .filter(
      (event) =>
        event.channel === 'WorkSpan' &&
        (event.payload.event === 'scenario_work_span' ||
          (event.payload.event === 'quiet_measured_loop_attribution_aggregate' &&
            event.payload.sourceEvent === 'scenario_work_span'))
    )
    .map((event) => {
      if (event.payload.event === 'quiet_measured_loop_attribution_aggregate') {
        const sample = Array.isArray(event.payload.samples) ? event.payload.samples[0] ?? {} : {};
        return {
          line: event.line,
          event: 'scenario_work_span',
          owner: sample.owner ?? '<quiet_aggregate>',
          path: sample.path ?? event.payload.aggregateKey,
          durationMs: event.payload.maxDurationMs,
          totalDurationMs: event.payload.totalDurationMs,
          count: event.payload.count,
          aggregateKey: event.payload.aggregateKey,
          quietAggregate: true,
          samples: event.payload.samples,
        };
      }
      return {
        line: event.line,
        ...event.payload,
      };
    });

const renderEvents = (events) =>
  events
    .filter(
      (event) =>
        event.channel === 'Render' &&
        (event.payload.event === 'scenario_render' ||
          (event.payload.event === 'quiet_measured_loop_attribution_aggregate' &&
            event.payload.sourceEvent === 'scenario_render'))
    )
    .map((event) => {
      if (event.payload.event === 'quiet_measured_loop_attribution_aggregate') {
        const sample = Array.isArray(event.payload.samples) ? event.payload.samples[0] ?? {} : {};
        return {
          line: event.line,
          event: 'scenario_render',
          owner: sample.owner ?? '<quiet_aggregate>',
          phase: sample.phase ?? 'render',
          count: event.payload.count,
          aggregateKey: event.payload.aggregateKey,
          quietAggregate: true,
          samples: event.payload.samples,
        };
      }
      return {
        line: event.line,
        ...event.payload,
      };
    });

const round = (value) => (Number.isFinite(value) ? Math.round(value * 10) / 10 : value);
const percentile = (values, p) => {
  const finiteValues = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (finiteValues.length === 0) {
    return null;
  }
  const index = Math.min(
    finiteValues.length - 1,
    Math.max(0, Math.ceil((p / 100) * finiteValues.length) - 1)
  );
  return round(finiteValues[index]);
};

const summarizeProfilerGroups = (spans, key) => {
  const groups = new Map();
  spans.forEach((span) => {
    const groupKey = span[key] ?? '<unknown>';
    const spanCount = Number(span.count ?? 1);
    const current = groups.get(groupKey) ?? {
      key: groupKey,
      count: 0,
      totalCommitSpanMs: 0,
      maxCommitSpanMs: 0,
      totalActualDurationMs: 0,
      maxActualDurationMs: 0,
      sampleIds: [],
    };
    const commitSpanMs = Number(span.commitSpanMs ?? 0);
    const actualDurationMs = Number(span.actualDurationMs ?? 0);
    current.count += Number.isFinite(spanCount) ? spanCount : 1;
    current.totalCommitSpanMs += Number.isFinite(commitSpanMs) ? commitSpanMs : 0;
    current.maxCommitSpanMs = Math.max(
      current.maxCommitSpanMs,
      Number.isFinite(commitSpanMs) ? commitSpanMs : 0
    );
    current.totalActualDurationMs += Number.isFinite(actualDurationMs) ? actualDurationMs : 0;
    current.maxActualDurationMs = Math.max(
      current.maxActualDurationMs,
      Number.isFinite(actualDurationMs) ? actualDurationMs : 0
    );
    if (typeof span.id === 'string' && !current.sampleIds.includes(span.id)) {
      current.sampleIds.push(span.id);
    }
    groups.set(groupKey, current);
  });
  return [...groups.values()]
    .map((group) => ({
      ...group,
      totalCommitSpanMs: round(group.totalCommitSpanMs),
      maxCommitSpanMs: round(group.maxCommitSpanMs),
      totalActualDurationMs: round(group.totalActualDurationMs),
      maxActualDurationMs: round(group.maxActualDurationMs),
      sampleIds: group.sampleIds.slice(0, 8),
    }))
    .sort((left, right) => right.totalCommitSpanMs - left.totalCommitSpanMs)
    .slice(0, SUMMARY_LIMIT);
};

const summarizeProfiler = (spans) => ({
  eventCount: spans.length,
  worstByCommitSpan: [...spans]
    .sort((left, right) => Number(right.commitSpanMs ?? 0) - Number(left.commitSpanMs ?? 0))
    .slice(0, WORST_LIMIT),
  worstByActualDuration: [...spans]
    .sort((left, right) => Number(right.actualDurationMs ?? 0) - Number(left.actualDurationMs ?? 0))
    .slice(0, WORST_LIMIT),
  byStage: summarizeProfilerGroups(spans, 'stageHint'),
  byOwner: summarizeProfilerGroups(spans, 'id'),
  byHandoffPhase: summarizeProfilerGroups(spans, 'handoffPhase'),
});

const summarizeStallProbes = (probes) => ({
  eventCount: probes.length,
  worstByDrift: [...probes]
    .sort((left, right) => Number(right.maxDriftMs ?? 0) - Number(left.maxDriftMs ?? 0))
    .slice(0, WORST_LIMIT),
  byStage: summarizeProfilerGroups(
    probes.map((probe) => ({
      ...probe,
      id: probe.stageHint ?? '<unknown>',
      commitSpanMs: probe.maxDriftMs,
      actualDurationMs: probe.maxDriftMs,
    })),
    'stageHint'
  ),
});

const summarizeWorkSpanGroups = (spans, key) => {
  const groups = new Map();
  spans.forEach((span) => {
    const groupKey = span[key] ?? '<unknown>';
    const spanCount = Number(span.count ?? 1);
    const current = groups.get(groupKey) ?? {
      key: groupKey,
      count: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
      samplePaths: [],
    };
    const durationMs = Number(span.durationMs ?? 0);
    current.count += Number.isFinite(spanCount) ? spanCount : 1;
    current.totalDurationMs += Number.isFinite(durationMs) ? durationMs : 0;
    current.maxDurationMs = Math.max(
      current.maxDurationMs,
      Number.isFinite(durationMs) ? durationMs : 0
    );
    if (typeof span.path === 'string' && !current.samplePaths.includes(span.path)) {
      current.samplePaths.push(span.path);
    }
    groups.set(groupKey, current);
  });
  return [...groups.values()]
    .map((group) => ({
      ...group,
      totalDurationMs: round(group.totalDurationMs),
      maxDurationMs: round(group.maxDurationMs),
      samplePaths: group.samplePaths.slice(0, 8),
    }))
    .sort((left, right) => right.totalDurationMs - left.totalDurationMs)
    .slice(0, SUMMARY_LIMIT);
};

const summarizeWorkSpans = (spans) => ({
  eventCount: spans.length,
  worstByDuration: [...spans]
    .sort((left, right) => Number(right.durationMs ?? 0) - Number(left.durationMs ?? 0))
    .slice(0, WORST_LIMIT),
  byOwner: summarizeWorkSpanGroups(spans, 'owner'),
  byHandoffPhase: summarizeWorkSpanGroups(spans, 'handoffPhase'),
});

const summarizeRenderGroups = (renders, key) => {
  const groups = new Map();
  renders.forEach((render) => {
    const groupKey = render[key] ?? '<unknown>';
    const renderCount = Number(render.count ?? 1);
    const current = groups.get(groupKey) ?? {
      key: groupKey,
      count: 0,
      sampleLines: [],
    };
    current.count += Number.isFinite(renderCount) ? renderCount : 1;
    current.sampleLines.push(render.line);
    groups.set(groupKey, current);
  });
  return [...groups.values()]
    .map((group) => ({
      ...group,
      sampleLines: group.sampleLines.slice(0, 8),
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, SUMMARY_LIMIT);
};

const summarizeRenders = (renders) => ({
  eventCount: renders.length,
  byOwner: summarizeRenderGroups(renders, 'owner'),
  byPhase: summarizeRenderGroups(renders, 'phase'),
});

const windowTimeRange = (window) => {
  const nowMs = Number(window.nowMs);
  const windowMs = Number(window.windowMs ?? 0);
  const maxLagStartedAtMs = Number(window.maxLagStartedAtMs);
  const maxLagEndedAtMs = Number(window.maxLagEndedAtMs);
  if (Number.isFinite(maxLagStartedAtMs) && Number.isFinite(maxLagEndedAtMs)) {
    return {
      startMs: maxLagStartedAtMs,
      endMs: maxLagEndedAtMs,
    };
  }
  if (Number.isFinite(nowMs) && Number.isFinite(windowMs)) {
    return {
      startMs: Math.max(0, nowMs - windowMs),
      endMs: nowMs,
    };
  }
  return null;
};

const eventTimeMs = (event) => {
  const payload = event.payload ?? event;
  if (event.channel === 'UiFrameSampler') {
    const emittedAtMs = Number(payload.emittedAtMs);
    if (Number.isFinite(emittedAtMs)) {
      return emittedAtMs;
    }
  }
  const candidates = [
    payload.nowMs,
    payload.emittedAtMs,
    payload.commitTimeMs,
    payload.startTimeMs,
    payload.startedAtMs,
    payload.readyAtMs,
    payload.settledAtMs,
    payload.releasedAtMs,
  ];
  const value = candidates.map(Number).find(Number.isFinite);
  return Number.isFinite(value) ? value : null;
};

const windowAnchorMs = (window) => {
  const range = windowTimeRange(window);
  if (range) {
    return range.endMs;
  }
  const nowMs = Number(window.nowMs);
  return Number.isFinite(nowMs) ? nowMs : null;
};

const spanOverlapsRange = (span, range, paddingMs = 80) => {
  const spanStartMs = Number(span.startTimeMs ?? span.nowMs);
  const spanEndMs = Number(span.commitTimeMs ?? span.nowMs);
  if (!Number.isFinite(spanStartMs) || !Number.isFinite(spanEndMs)) {
    return false;
  }
  return spanStartMs <= range.endMs + paddingMs && spanEndMs >= range.startMs - paddingMs;
};

const summarizeNearbyEvents = (window, sourceEvents, radiusMs = 250) => {
  const anchorMs = windowAnchorMs(window);
  const line = Number(window.line);
  const timedEvents =
    anchorMs == null
      ? []
      : sourceEvents
          .map((event) => ({
            line: event.line,
            channel: event.channel,
            event: event.payload?.event,
            owner: event.payload?.owner,
            id: event.payload?.id,
            stageHint: event.payload?.stageHint,
            path: event.payload?.path,
            durationMs: event.payload?.durationMs,
            actualDurationMs: event.payload?.actualDurationMs,
            commitSpanMs: event.payload?.commitSpanMs,
            maxDriftMs: event.payload?.maxDriftMs,
            metricMs:
              event.payload?.maxFrameMs ??
              event.payload?.maxLagMs ??
              event.payload?.frameMs ??
              event.payload?.lagMs,
            distanceMs: eventTimeMs(event) == null ? null : round(eventTimeMs(event) - anchorMs),
          }))
          .filter((event) => event.distanceMs != null && Math.abs(event.distanceMs) <= radiusMs);
  const timedSourceEvents =
    anchorMs == null
      ? []
      : sourceEvents.filter((event) => {
          const timeMs = eventTimeMs(event);
          return timeMs != null && Math.abs(timeMs - anchorMs) <= radiusMs;
        });
  const timedCounts = timedEvents.reduce((counts, event) => {
    counts[event.channel] = (counts[event.channel] ?? 0) + 1;
    return counts;
  }, {});
  const lineWindowEvents = Number.isFinite(line)
    ? sourceEvents.filter((event) => Math.abs(event.line - line) <= 40)
    : [];
  const lineWindowPayloadBytes = lineWindowEvents.reduce(
    (total, event) => total + Number(event.payloadLength ?? 0),
    0
  );
  return {
    radiusMs,
    timedEventCount: timedEvents.length,
    timedCounts,
    timedPayloadBytes: timedSourceEvents.reduce(
      (total, event) => total + Number(event.payloadLength ?? 0),
      0
    ),
    timedBytesByChannel: summarizeLogBytes(timedSourceEvents, (event) => event.channel).slice(0, 8),
    timedBytesByEvent: summarizeEventLogBytes(timedSourceEvents).slice(0, 12),
    lineWindowEventCount: lineWindowEvents.length,
    lineWindowCounts: summarizeChannels(lineWindowEvents),
    lineWindowPayloadBytes,
    lineWindowBytesByChannel: summarizeLogBytes(lineWindowEvents, (event) => event.channel).slice(
      0,
      8
    ),
    lineWindowBytesByEvent: summarizeEventLogBytes(lineWindowEvents).slice(0, 12),
    nearestLineEvents: lineWindowEvents
      .map((event) => ({
        line: event.line,
        channel: event.channel,
        event: event.payload?.event,
        owner: event.payload?.owner,
        id: event.payload?.id,
        stageHint: event.payload?.stageHint,
        payloadBytes: event.payloadLength,
        lineDistance: event.line - line,
        metricMs:
          event.payload?.maxFrameMs ??
          event.payload?.maxLagMs ??
          event.payload?.frameMs ??
          event.payload?.lagMs,
      }))
      .sort((left, right) => Math.abs(left.lineDistance) - Math.abs(right.lineDistance))
      .slice(0, 20),
    nearestTimedEvents: timedEvents
      .sort((left, right) => Math.abs(left.distanceMs) - Math.abs(right.distanceMs))
      .slice(0, 12),
  };
};

const attachRuntimeEvidenceToWindows = (windows, spans, sourceEvents, metricName) =>
  windows.map((window) => {
    const range = windowTimeRange(window);
    const overlappingSpans = range ? spans.filter((span) => spanOverlapsRange(span, range)) : [];
    return {
      line: window.line,
      metricValue: window[metricName],
      range,
      window,
      profilerOwners: overlappingSpans
        .sort((left, right) => Number(right.commitSpanMs ?? 0) - Number(left.commitSpanMs ?? 0))
        .slice(0, 8)
        .map((span) => ({
          line: span.line,
          id: span.id,
          phase: span.phase,
          stageHint: span.stageHint,
          actualDurationMs: span.actualDurationMs,
          commitSpanMs: span.commitSpanMs,
          startTimeMs: span.startTimeMs,
          commitTimeMs: span.commitTimeMs,
          handoffPhase: span.handoffPhase,
          handoffOperationId: span.handoffOperationId,
        })),
      nearby: summarizeNearbyEvents(window, sourceEvents),
    };
  });

const resolveMeasuredRepeatLoopRange = (scenarios) => {
  const end = [...scenarios]
    .reverse()
    .find(
      (event) => event.event === 'scenario_phase_mark' && event.phase === 'measured_repeat_loop_end'
    );
  const start = [...scenarios]
    .reverse()
    .find(
      (event) =>
        event.event === 'scenario_phase_mark' &&
        event.phase === 'measured_repeat_loop_start' &&
        (!end || event.line < end.line)
    );
  if (!start || !end) {
    return null;
  }
  const startMs = Number(start.nowMs);
  const endMs = Number(end.nowMs);
  return {
    startLine: start.line,
    endLine: end.line,
    startMs: Number.isFinite(startMs) ? startMs : null,
    endMs: Number.isFinite(endMs) ? endMs : null,
  };
};

const eventIsInsideMeasuredRange = (event, range) => {
  if (!range) {
    return false;
  }
  if (event.channel === 'UiFrameSampler') {
    const timeMs = eventTimeMs(event);
    if (timeMs != null && range.startMs != null && range.endMs != null) {
      return timeMs >= range.startMs && timeMs <= range.endMs;
    }
    return event.line >= range.startLine && event.line <= range.endLine;
  }
  if (event.channel === 'JsFrameSampler') {
    const eventRange = windowTimeRange(event.payload);
    if (eventRange && range.startMs != null && range.endMs != null) {
      return eventRange.startMs >= range.startMs && eventRange.endMs <= range.endMs;
    }
  }
  if (event.channel === 'JsTaskLatencySampler') {
    const eventRange = windowTimeRange(event.payload);
    if (eventRange && range.startMs != null && range.endMs != null) {
      return eventRange.startMs >= range.startMs && eventRange.endMs <= range.endMs;
    }
  }
  if (event.channel === 'Profiler') {
    const startMs = Number(event.payload.startTimeMs ?? event.payload.nowMs);
    const endMs = Number(event.payload.commitTimeMs ?? event.payload.nowMs);
    if (
      Number.isFinite(startMs) &&
      Number.isFinite(endMs) &&
      range.startMs != null &&
      range.endMs != null
    ) {
      return startMs >= range.startMs && endMs <= range.endMs;
    }
  }
  const timeMs = eventTimeMs(event);
  if (timeMs != null && range.startMs != null && range.endMs != null) {
    return timeMs >= range.startMs && timeMs <= range.endMs;
  }
  return event.line >= range.startLine && event.line <= range.endLine;
};

const eventRunId = (event) => {
  const payload = event.payload ?? event;
  return payload.scenarioRunId ?? null;
};

const eventBelongsToRun = (event, scenarioRunId) => {
  if (!scenarioRunId) {
    return true;
  }
  const runId = eventRunId(event);
  return runId == null || runId === scenarioRunId;
};

const earliestByLine = (events) =>
  events
    .filter(Boolean)
    .sort((left, right) => Number(left.line ?? 0) - Number(right.line ?? 0))[0] ?? null;

const resolveActiveScenarioRun = ({ events, scenarios, logPath, outputPath }) => {
  const expectedRunId =
    deriveScenarioRunIdFromPath(outputPath) ?? deriveScenarioRunIdFromPath(logPath);
  const expectedScenarioName = deriveScenarioNameFromRunId(expectedRunId);
  const configs = scenarios.filter((event) => event.event === 'scenario_config_received');
  const matchingConfigs = expectedRunId
    ? configs.filter((event) => event.scenarioRunId === expectedRunId)
    : [];
  const matchingNameConfigs =
    matchingConfigs.length === 0 && expectedScenarioName
      ? configs.filter((event) => event.scenarioName === expectedScenarioName)
      : [];
  const activeConfig =
    matchingConfigs[matchingConfigs.length - 1] ??
    matchingNameConfigs[matchingNameConfigs.length - 1] ??
    configs[configs.length - 1] ??
    null;
  const scenarioRunId = activeConfig?.scenarioRunId ?? expectedRunId ?? null;
  const scenarioName =
    activeConfig?.scenarioName ??
    expectedScenarioName ??
    deriveScenarioNameFromRunId(scenarioRunId);
  const configLine = activeConfig?.line ?? 1;
  const samplingStarted = scenarios.find(
    (event) =>
      event.line > configLine &&
      event.event === 'scenario_sampling_started' &&
      eventBelongsToRun(event, scenarioRunId)
  );
  const startLine = samplingStarted?.line ?? configLine;
  const nextConfig = activeConfig ? configs.find((event) => event.line > activeConfig.line) : null;
  const cleared = scenarios.find(
    (event) =>
      event.line > startLine &&
      event.event === 'scenario_config_cleared' &&
      (scenarioRunId == null ||
        event.scenarioRunId == null ||
        event.scenarioRunId === scenarioRunId)
  );
  const samplingStopped = scenarios.find(
    (event) =>
      event.line > startLine &&
      event.event === 'scenario_sampling_stopped' &&
      eventBelongsToRun(event, scenarioRunId)
  );
  const endEvent = earliestByLine([cleared, nextConfig]) ?? samplingStopped;
  const endLine = endEvent?.line ?? Number.MAX_SAFE_INTEGER;
  const sourceEvents = events.filter(
    (event) =>
      event.line >= startLine && event.line <= endLine && eventBelongsToRun(event, scenarioRunId)
  );
  const staleConfigCount =
    activeConfig == null ? 0 : configs.filter((event) => event.line < activeConfig.line).length;
  return {
    scenarioName: scenarioName ?? null,
    scenarioRunId,
    requestId: activeConfig?.requestId ?? null,
    selection: {
      expectedRunId,
      expectedScenarioName,
      activeConfigLine: activeConfig?.line ?? null,
      endLine: endEvent?.line ?? null,
      endEvent: endEvent?.event ?? null,
      staleConfigCount,
      reason:
        matchingConfigs.length > 0
          ? 'filename_run_id_match'
          : matchingNameConfigs.length > 0
          ? 'latest_matching_scenario_name'
          : activeConfig
          ? 'latest_scenario_config'
          : 'no_scenario_config',
    },
    window: {
      startLine,
      endLine: endEvent?.line ?? null,
      startMs: activeConfig ? eventTimeMs(activeConfig) : null,
      endMs: endEvent ? eventTimeMs(endEvent) : null,
    },
    events: sourceEvents,
  };
};

const resolveFirstMeasuredSubmitExclusionRange = (events, measuredRange) => {
  if (!measuredRange) {
    return null;
  }
  const measuredEvents = events.filter((event) => eventIsInsideMeasuredRange(event, measuredRange));
  const visualEvents = visualReadinessEvents(measuredEvents);
  const firstSubmit = visualEvents.find(
    (event) =>
      event.event === 'shortcut_submit_press_up_contract' &&
      (event.transactionId === 'search-surface-results-transaction:1' ||
        event.transactionId == null)
  );
  if (!firstSubmit) {
    return null;
  }
  const firstTransactionId = firstSubmit.transactionId ?? 'search-surface-results-transaction:1';
  const handoffEnd = visualEvents.find(
    (event) =>
      event.line > firstSubmit.line &&
      event.event === 'results_dismiss_bottom_snap_handoff_contract' &&
      event.transactionId === firstTransactionId
  );
  const nextSubmit = visualEvents.find(
    (event) =>
      event.line > firstSubmit.line &&
      event.event === 'shortcut_submit_press_up_contract' &&
      event.transactionId !== firstTransactionId
  );
  const end = handoffEnd ?? nextSubmit;
  const startMs = eventTimeMs(firstSubmit);
  const endMs = end ? eventTimeMs(end) : null;
  return {
    reason: 'exclude_first_measured_submit',
    transactionId: firstTransactionId,
    startLine: firstSubmit.line,
    endLine: end?.line ?? measuredRange.endLine,
    startMs,
    endMs,
  };
};

const eventOverlapsLineRange = (event, range) =>
  event.line >= range.startLine && event.line <= range.endLine;

const eventIsOutsideTrimRange = (event, trimRange) => {
  if (!trimRange) {
    return true;
  }
  if (event.channel === 'UiFrameSampler') {
    const timeMs = eventTimeMs(event);
    if (
      timeMs != null &&
      trimRange.startMs != null &&
      trimRange.endMs != null &&
      timeMs >= trimRange.startMs &&
      timeMs <= trimRange.endMs
    ) {
      return false;
    }
    return !eventOverlapsLineRange(event, trimRange);
  }
  const eventRange = windowTimeRange(event.payload);
  if (
    eventRange &&
    trimRange.startMs != null &&
    trimRange.endMs != null &&
    eventRange.startMs <= trimRange.endMs &&
    eventRange.endMs >= trimRange.startMs
  ) {
    return false;
  }
  const timeMs = eventTimeMs(event);
  if (
    timeMs != null &&
    trimRange.startMs != null &&
    trimRange.endMs != null &&
    timeMs >= trimRange.startMs &&
    timeMs <= trimRange.endMs
  ) {
    return false;
  }
  return !eventOverlapsLineRange(event, trimRange);
};

const visualReadinessEvents = (events) =>
  events
    .filter((event) => event.channel === 'VisualReadiness')
    .map((event) => ({
      line: event.line,
      ...event.payload,
    }));

const nativeMapApplySummaryEvents = (events) =>
  events
    .filter(
      (event) =>
        event.channel === 'NativeMapApplySummary' &&
        event.payload.event === 'native_map_apply_summary'
    )
    .map((event) => ({
      line: event.line,
      ...event.payload,
    }));

const summarizeNativeMapApplySummaries = (events) => {
  const summaries = nativeMapApplySummaryEvents(events);
  const buckets = summaries.flatMap((event) =>
    Array.isArray(event.summary?.topBuckets)
      ? event.summary.topBuckets.map((bucket) => ({
          line: event.line,
          reason: event.reason,
          ...bucket,
        }))
      : []
  );
  const contextBuckets = summaries.flatMap((event) =>
    Array.isArray(event.summary?.topContextBuckets)
      ? event.summary.topContextBuckets.map((bucket) => ({
          line: event.line,
          reason: event.reason,
          ...bucket,
        }))
      : []
  );
  return {
    eventCount: summaries.length,
    events: summaries.slice(-WORST_LIMIT),
    topBucketsByTotalMs: [...buckets]
      .sort((left, right) => Number(right.totalMs ?? 0) - Number(left.totalMs ?? 0))
      .slice(0, WORST_LIMIT),
    topBucketsByMaxMs: [...buckets]
      .sort((left, right) => Number(right.maxMs ?? 0) - Number(left.maxMs ?? 0))
      .slice(0, WORST_LIMIT),
    topContextBucketsByTotalMs: [...contextBuckets]
      .sort((left, right) => Number(right.totalMs ?? 0) - Number(left.totalMs ?? 0))
      .slice(0, WORST_LIMIT),
    topContextBucketsByMaxMs: [...contextBuckets]
      .sort((left, right) => Number(right.maxMs ?? 0) - Number(left.maxMs ?? 0))
      .slice(0, WORST_LIMIT),
  };
};

const nativeMapApplySummaryEventsForReason = (events, reason) =>
  events.filter(
    (event) =>
      event.channel === 'NativeMapApplySummary' &&
      event.payload.event === 'native_map_apply_summary' &&
      event.payload.reason === reason
  );

const quietAttributionAggregateEventsForReason = (events, reason) =>
  events.filter(
    (event) =>
      event.payload.event === 'quiet_measured_loop_attribution_aggregate' &&
      event.payload.flushReason === reason
  );

const firstVisualEventAfterLine = (visualEvents, eventName, line, predicate = () => true) =>
  visualEvents.find((event) => event.event === eventName && event.line > line && predicate(event));

const summarizeNativeBridgeTransactionSlices = (sourceEvents) => {
  const visualEvents = visualReadinessEvents(sourceEvents);
  const submitEvents = visualEvents.filter(
    (event) => event.event === 'shortcut_submit_press_up_contract'
  );
  const dismissEvents = visualEvents.filter(
    (event) => event.event === 'results_dismiss_press_up_contract'
  );
  const slices = submitEvents.map((submitEvent) => {
    const transactionId = submitEvent.transactionId ?? null;
    const endLine =
      dismissEvents.find((event) => event.line > submitEvent.line)?.line ??
      Number.POSITIVE_INFINITY;
    const inTransaction = (event) =>
      event.line > submitEvent.line &&
      event.line < endLine &&
      (transactionId == null ||
        event.transactionId === transactionId ||
        event.requestKey === transactionId);
    const mapSurfaceResults = firstVisualEventAfterLine(
      visualEvents,
      'map_surface_results_source_frame_ready_contract',
      submitEvent.line,
      (event) =>
        inTransaction(event) &&
        event.mapSearchSurfaceResultsSourcesReady === true &&
        (event.pinCount ?? 0) > 0 &&
        (event.dotCount ?? 0) > 0 &&
        (event.labelCount ?? 0) > 0
    );
    const mountedHidden = firstVisualEventAfterLine(
      visualEvents,
      'native_execution_batch_mounted_hidden_ready',
      submitEvent.line,
      inTransaction
    );
    const enterStarted = firstVisualEventAfterLine(
      visualEvents,
      'native_marker_enter_started',
      submitEvent.line,
      inTransaction
    );
    const enterSettled = firstVisualEventAfterLine(
      visualEvents,
      'native_marker_enter_settled',
      submitEvent.line,
      inTransaction
    );
    const coverReveal = firstVisualEventAfterLine(
      visualEvents,
      'cards_pins_cover_reveal_started',
      submitEvent.line,
      inTransaction
    );
    const cardRevealStarted = firstVisualEventAfterLine(
      visualEvents,
      'result_cards_reveal_started',
      submitEvent.line,
      inTransaction
    );
    const cardRevealSettled = firstVisualEventAfterLine(
      visualEvents,
      'result_cards_reveal_settled',
      submitEvent.line,
      inTransaction
    );
    const at = (event) => (event ? eventTimeMs(event) : null);
    const delta = (left, right) => {
      const leftMs = at(left);
      const rightMs = at(right);
      return leftMs == null || rightMs == null ? null : round(rightMs - leftMs);
    };
    return {
      transactionId,
      submitLine: submitEvent.line,
      mapSurfaceResultsLine: mapSurfaceResults?.line ?? null,
      mountedHiddenLine: mountedHidden?.line ?? null,
      enterStartedLine: enterStarted?.line ?? null,
      enterSettledLine: enterSettled?.line ?? null,
      coverRevealLine: coverReveal?.line ?? null,
      submitToMapSurfaceResultsMs: delta(submitEvent, mapSurfaceResults),
      mapSurfaceResultsToMountedHiddenMs: delta(mapSurfaceResults, mountedHidden),
      mountedHiddenToCoverRevealMs: delta(mountedHidden, coverReveal),
      coverRevealToEnterStartedMs: delta(coverReveal, enterStarted),
      enterStartedToEnterSettledMs: delta(enterStarted, enterSettled),
      cardRevealStartedToSettledMs: delta(cardRevealStarted, cardRevealSettled),
      mapSurfaceResultsPinCount: mapSurfaceResults?.pinCount ?? null,
      mapSurfaceResultsDotCount: mapSurfaceResults?.dotCount ?? null,
      mapSurfaceResultsLabelCount: mapSurfaceResults?.labelCount ?? null,
      enterStartedFrameGenerationId: enterStarted?.frameGenerationId ?? null,
      enterStartedExecutionBatchId: enterStarted?.executionBatchId ?? null,
      coverRevealFrameGenerationId: coverReveal?.frameGenerationId ?? null,
      coverRevealExecutionBatchId: coverReveal?.executionBatchId ?? null,
    };
  });
  const labelObservationAggregates = sourceEvents
    .filter(
      (event) =>
        event.channel === 'VisualReadiness' &&
        event.payload.event === 'quiet_measured_loop_attribution_aggregate' &&
        event.payload.sourceEvent === 'native_label_observation_config_apply_contract'
    )
    .map((event) => ({
      line: event.line,
      count: event.payload.count,
      aggregateKey: event.payload.aggregateKey,
      samples: event.payload.samples,
    }));
  return {
    transactionCount: slices.length,
    slices,
    labelObservationAggregates,
  };
};

const nativeRenderFrameBridgeSliceEvents = (sourceEvents) => {
  const directSlices = visualReadinessEvents(sourceEvents).filter(
    (event) => event.event === 'native_set_render_frame_bridge_slice'
  );
  const aggregateSlices = sourceEvents
    .filter(
      (event) =>
        event.channel === 'VisualReadiness' &&
        event.payload.event === 'quiet_measured_loop_attribution_aggregate' &&
        event.payload.sourceEvent === 'native_set_render_frame_bridge_slice'
    )
    .map((event) => {
      const sample =
        event.payload.maxDurationSample ??
        (Array.isArray(event.payload.samples) ? event.payload.samples[0] : null) ??
        {};
      return {
        line: event.line,
        ...sample,
        event: 'native_set_render_frame_bridge_slice',
        quietAggregate: true,
        aggregateKey: event.payload.aggregateKey,
        aggregateCount: event.payload.count,
        aggregateMaxDurationMs: event.payload.maxDurationMs,
        aggregateTotalDurationMs: event.payload.totalDurationMs,
        durationMs: event.payload.maxDurationMs ?? sample.durationMs,
      };
    });
  return [...directSlices, ...aggregateSlices];
};

const numberOrZero = (value) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const numberOrNull = (value) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const nativeRenderFrameBridgeSliceTiming = (slice) => {
  const sourceTransportBuildDurationMs = numberOrZero(slice.sourceTransportBuildDurationMs);
  const nativePayloadBuildDurationMs = numberOrZero(slice.nativePayloadBuildDurationMs);
  const nativeModuleQueueWaitDurationMs = numberOrZero(slice.nativeModuleQueueWaitDurationMs);
  const nativeMainExecutionDurationMs = numberOrZero(slice.nativeMainExecutionDurationMs);
  const nativeSetFrameActionDurationMs = numberOrZero(slice.nativeSetFrameActionDurationMs);
  const promiseSettleDurationMs = numberOrZero(slice.nativeModuleDurationMs ?? slice.durationMs);
  const nativeAckDurationMs = nativeModuleQueueWaitDurationMs + nativeMainExecutionDurationMs;
  const nativeEnqueueToAckDurationMs = nativePayloadBuildDurationMs + nativeAckDurationMs;
  const sourceToNativeAckDurationMs =
    sourceTransportBuildDurationMs + nativePayloadBuildDurationMs + nativeAckDurationMs;
  const promiseSettleGapMs =
    slice.nativeBridgeUnattributedDurationMs == null
      ? Math.max(0, promiseSettleDurationMs - nativeAckDurationMs)
      : numberOrZero(slice.nativeBridgeUnattributedDurationMs);
  const promiseDeliveryWallClockGapMs = numberOrNull(
    slice.nativeResolveToJsPromiseObservedWallClockMs
  );
  const promiseSettleGapClassification =
    promiseSettleGapMs >= Math.max(16, nativeAckDurationMs * 1.5)
      ? 'unexplained_bridge_promise_scheduling_gap'
      : 'native_ack_aligned';
  const promiseDeliveryAttribution =
    promiseDeliveryWallClockGapMs == null
      ? 'missing_wall_clock_trace'
      : Math.abs(promiseDeliveryWallClockGapMs - promiseSettleGapMs) <= 12
      ? 'rn_hermes_promise_delivery_gap_best_effort'
      : 'wall_clock_trace_mismatch';
  return {
    hotOwnerDurationMs: round(sourceToNativeAckDurationMs),
    sourceTransportBuildDurationMs: round(sourceTransportBuildDurationMs),
    nativePayloadBuildDurationMs: round(nativePayloadBuildDurationMs),
    nativeAckDurationMs: round(nativeAckDurationMs),
    nativeEnqueueToAckDurationMs: round(nativeEnqueueToAckDurationMs),
    nativeModuleQueueWaitDurationMs: round(nativeModuleQueueWaitDurationMs),
    nativeMainExecutionDurationMs: round(nativeMainExecutionDurationMs),
    nativeSetFrameActionDurationMs: round(nativeSetFrameActionDurationMs),
    promiseSettleDurationMs: round(promiseSettleDurationMs),
    promiseSettleGapMs: round(promiseSettleGapMs),
    promiseDeliveryWallClockGapMs:
      promiseDeliveryWallClockGapMs == null ? null : round(promiseDeliveryWallClockGapMs),
    promiseDeliveryAttribution,
    promiseDeliveryTraceConfidence:
      slice.nativeResolveToJsPromiseObservedWallClockConfidence ?? null,
    promiseSettleGapClassification,
  };
};

const nativeRenderFrameBridgeSliceSummary = (slice) => {
  const timing = nativeRenderFrameBridgeSliceTiming(slice);
  return {
    line: slice.line,
    status: slice.status ?? null,
    batchPhase: slice.batchPhase ?? null,
    laneKind: slice.laneKind ?? null,
    requestKey: slice.requestKey ?? null,
    frameGenerationId: slice.frameGenerationId ?? null,
    executionBatchId: slice.executionBatchId ?? null,
    durationMs: timing.hotOwnerDurationMs,
    hotOwnerDurationMs: timing.hotOwnerDurationMs,
    promiseSettleDurationMs: timing.promiseSettleDurationMs,
    promiseSettleGapMs: timing.promiseSettleGapMs,
    promiseSettleGapClassification: timing.promiseSettleGapClassification,
    promiseDeliveryWallClockGapMs: timing.promiseDeliveryWallClockGapMs,
    promiseDeliveryAttribution: timing.promiseDeliveryAttribution,
    promiseDeliveryTraceConfidence: timing.promiseDeliveryTraceConfidence,
    startTimeMs: slice.startTimeMs ?? null,
    endTimeMs: slice.endTimeMs ?? null,
    jsPromiseObservedAtEpochMs: slice.jsPromiseObservedAtEpochMs ?? null,
    nativeModuleReceivedAtEpochMs: slice.nativeModuleReceivedAtEpochMs ?? null,
    nativeMainStartedAtEpochMs: slice.nativeMainStartedAtEpochMs ?? null,
    nativeResolveStartedAtEpochMs: slice.nativeResolveStartedAtEpochMs ?? null,
    effectiveChangedSourceIds: slice.effectiveChangedSourceIds ?? [],
    sourceDeltaCount: slice.sourceDeltaCount ?? null,
    markerRoleFrameMode: slice.markerRoleFrameMode ?? null,
    markerRoleDirtyCount: slice.markerRoleDirtyCount ?? null,
    markerRoleRemovedCount: slice.markerRoleRemovedCount ?? null,
    markerRoleUpsertCount: slice.markerRoleUpsertCount ?? null,
    markerRolePinnedCount: slice.markerRolePinnedCount ?? null,
    markerRoleNormalPinnedCount: slice.markerRoleNormalPinnedCount ?? null,
    markerRoleSelectedPinnedCount: slice.markerRoleSelectedPinnedCount ?? null,
    markerRoleDotCount: slice.markerRoleDotCount ?? null,
    upsertFeatureCount: slice.upsertFeatureCount ?? null,
    removeFeatureCount: slice.removeFeatureCount ?? null,
    nextFeatureCount: slice.nextFeatureCount ?? null,
    residentSourceReuse: slice.residentSourceReuse ?? null,
    dirtyGroupCount: slice.dirtyGroupCount ?? null,
    orderChangedGroupCount: slice.orderChangedGroupCount ?? null,
    removedGroupCount: slice.removedGroupCount ?? null,
    visualFrameTransactionKind: slice.visualFrameTransactionKind ?? null,
    visualFrameSourceSnapshotKind: slice.visualFrameSourceSnapshotKind ?? null,
    frameAdmissionDecision: slice.frameAdmissionDecision ?? null,
    normalWorkEffect: slice.normalWorkEffect ?? null,
    sourceBaselineKind: slice.sourceBaselineKind ?? null,
    snapshotChanged: slice.snapshotChanged ?? null,
    viewportBoundsChanged: slice.viewportBoundsChanged ?? null,
    gestureStateChanged: slice.gestureStateChanged ?? null,
    movingStateChanged: slice.movingStateChanged ?? null,
    presentationChanged: slice.presentationChanged ?? null,
    controlStateChanged: slice.controlStateChanged ?? null,
    isMoving: slice.isMoving ?? null,
    isGestureActive: slice.isGestureActive ?? null,
    shouldQueueNativeEnterMountAckFrame: slice.shouldQueueNativeEnterMountAckFrame ?? null,
    nominalChangedSourceIds: slice.nominalChangedSourceIds ?? [],
    sourceModeSignature: slice.sourceModeSignature ?? null,
    sourceOperationSignature: slice.sourceOperationSignature ?? null,
    sourceDeltaShapeSignature: slice.sourceDeltaShapeSignature ?? null,
    sourceDeltaSummaries: slice.sourceDeltaSummaries ?? [],
    sourceTransportBuildDurationMs: timing.sourceTransportBuildDurationMs,
    nativePayloadBuildDurationMs: timing.nativePayloadBuildDurationMs,
    nativePayloadSourceDeltaMapDurationMs: slice.nativePayloadSourceDeltaMapDurationMs ?? null,
    nativeAckDurationMs: timing.nativeAckDurationMs,
    nativeEnqueueToAckDurationMs: timing.nativeEnqueueToAckDurationMs,
    nativeModuleDurationMs: slice.nativeModuleDurationMs ?? null,
    nativePayloadTotalDurationMs: slice.nativePayloadTotalDurationMs ?? null,
    nativeModuleQueueWaitDurationMs: timing.nativeModuleQueueWaitDurationMs,
    nativeMainExecutionDurationMs: timing.nativeMainExecutionDurationMs,
    nativeSetFrameActionDurationMs: timing.nativeSetFrameActionDurationMs,
    nativeBridgeUnattributedDurationMs: slice.nativeBridgeUnattributedDurationMs ?? null,
    nativeSetFramePhase: slice.nativeSetFramePhase ?? null,
    nativeDidSyncResidentFrame: slice.nativeDidSyncResidentFrame ?? null,
    pinCount: slice.pinCount ?? null,
    dotCount: slice.dotCount ?? null,
    labelCount: slice.labelCount ?? null,
    quietAggregate: slice.quietAggregate === true,
    aggregateCount: slice.aggregateCount ?? null,
    aggregateMaxDurationMs: slice.aggregateMaxDurationMs ?? null,
    aggregateTotalDurationMs: slice.aggregateTotalDurationMs ?? null,
  };
};

const frameBridgeSliceRange = (event) => {
  const startMs = Number(event.startTimeMs);
  const endMs = Number(event.endTimeMs ?? event.nowMs);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return null;
  }
  return {
    startMs,
    endMs,
  };
};

const frameBridgeSliceOverlapsRange = (event, range, paddingMs = 40) => {
  const eventRange = frameBridgeSliceRange(event);
  if (eventRange == null) {
    return false;
  }
  return (
    eventRange.startMs <= range.endMs + paddingMs && eventRange.endMs >= range.startMs - paddingMs
  );
};

const samplerWindowCorrelationRange = (window) => {
  const isUiSamplerWindow = window.displayHz != null;
  const emittedAtMs = Number(window.emittedAtMs);
  const windowMs = Number(window.windowMs ?? 0);
  if (isUiSamplerWindow && Number.isFinite(emittedAtMs) && Number.isFinite(windowMs)) {
    return {
      startMs: Math.max(0, emittedAtMs - windowMs),
      endMs: emittedAtMs,
    };
  }
  return windowTimeRange(window);
};

const summarizeNativeRenderFrameBridgeSlices = (sourceEvents) => {
  const slices = nativeRenderFrameBridgeSliceEvents(sourceEvents);
  const observedSliceCount = slices.reduce(
    (sum, slice) => sum + Number(slice.aggregateCount ?? 1),
    0
  );
  const unexplainedGapSlices = slices.filter(
    (slice) =>
      nativeRenderFrameBridgeSliceTiming(slice).promiseSettleGapClassification ===
      'unexplained_bridge_promise_scheduling_gap'
  );
  const grouped = new Map();
  slices.forEach((slice) => {
    const timing = nativeRenderFrameBridgeSliceTiming(slice);
    const key = [
      slice.status ?? '<status>',
      slice.batchPhase ?? '<phase>',
      slice.frameAdmissionDecision ?? '<admission>',
      slice.sourceModeSignature ?? '<mode>',
      slice.sourceOperationSignature ?? '<operations>',
      Array.isArray(slice.effectiveChangedSourceIds)
        ? slice.effectiveChangedSourceIds.join(',')
        : '<sources>',
    ].join('|');
    const current = grouped.get(key) ?? {
      key,
      status: slice.status ?? null,
      batchPhase: slice.batchPhase ?? null,
      frameAdmissionDecision: slice.frameAdmissionDecision ?? null,
      normalWorkEffect: slice.normalWorkEffect ?? null,
      sourceBaselineKind: slice.sourceBaselineKind ?? null,
      sourceModeSignature: slice.sourceModeSignature ?? null,
      sourceOperationSignature: slice.sourceOperationSignature ?? null,
      effectiveChangedSourceIds: Array.isArray(slice.effectiveChangedSourceIds)
        ? slice.effectiveChangedSourceIds
        : [],
      count: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
      totalPromiseSettleDurationMs: 0,
      maxPromiseSettleDurationMs: 0,
      totalPromiseSettleGapMs: 0,
      maxPromiseSettleGapMs: 0,
      totalSourceDeltaCount: 0,
      totalMarkerRoleDirtyCount: 0,
      totalMarkerRoleUpsertCount: 0,
      markerRoleModeCounts: {},
      totalUpsertFeatureCount: 0,
      totalRemoveFeatureCount: 0,
      totalNextFeatureCount: 0,
      residentSourceReuseCount: 0,
      totalDirtyGroupCount: 0,
      totalOrderChangedGroupCount: 0,
      totalRemovedGroupCount: 0,
      transactionKindCounts: {},
      sourceSnapshotKindCounts: {},
      changeReasonCounts: {},
      maxSourceTransportBuildDurationMs: 0,
      maxNativePayloadBuildDurationMs: 0,
      maxNativeAckDurationMs: 0,
      maxNativeEnqueueToAckDurationMs: 0,
      maxNativeModuleDurationMs: 0,
      maxNativeModuleQueueWaitDurationMs: 0,
      maxNativeMainExecutionDurationMs: 0,
      maxNativeSetFrameActionDurationMs: 0,
      maxNativeBridgeUnattributedDurationMs: 0,
      maxPromiseDeliveryWallClockGapMs: 0,
      promiseDeliveryAttribution: {},
      sampleLines: [],
    };
    current.count += 1;
    current.totalDurationMs = round(current.totalDurationMs + timing.hotOwnerDurationMs);
    current.maxDurationMs = Math.max(current.maxDurationMs, timing.hotOwnerDurationMs);
    current.totalPromiseSettleDurationMs = round(
      current.totalPromiseSettleDurationMs + timing.promiseSettleDurationMs
    );
    current.maxPromiseSettleDurationMs = Math.max(
      current.maxPromiseSettleDurationMs,
      timing.promiseSettleDurationMs
    );
    current.totalPromiseSettleGapMs = round(
      current.totalPromiseSettleGapMs + timing.promiseSettleGapMs
    );
    current.maxPromiseSettleGapMs = Math.max(
      current.maxPromiseSettleGapMs,
      timing.promiseSettleGapMs
    );
    current.totalSourceDeltaCount += Number(slice.sourceDeltaCount ?? 0);
    current.totalMarkerRoleDirtyCount += Number(slice.markerRoleDirtyCount ?? 0);
    current.totalMarkerRoleUpsertCount += Number(slice.markerRoleUpsertCount ?? 0);
    const markerRoleMode = slice.markerRoleFrameMode ?? 'none';
    current.markerRoleModeCounts[markerRoleMode] =
      (current.markerRoleModeCounts[markerRoleMode] ?? 0) + 1;
    current.totalUpsertFeatureCount += Number(slice.upsertFeatureCount ?? 0);
    current.totalRemoveFeatureCount += Number(slice.removeFeatureCount ?? 0);
    current.totalNextFeatureCount += Number(slice.nextFeatureCount ?? 0);
    current.residentSourceReuseCount += slice.residentSourceReuse === true ? 1 : 0;
    current.totalDirtyGroupCount += Number(slice.dirtyGroupCount ?? 0);
    current.totalOrderChangedGroupCount += Number(slice.orderChangedGroupCount ?? 0);
    current.totalRemovedGroupCount += Number(slice.removedGroupCount ?? 0);
    const transactionKind = slice.visualFrameTransactionKind ?? 'unknown';
    current.transactionKindCounts[transactionKind] =
      (current.transactionKindCounts[transactionKind] ?? 0) + 1;
    const sourceSnapshotKind = slice.visualFrameSourceSnapshotKind ?? 'unknown';
    current.sourceSnapshotKindCounts[sourceSnapshotKind] =
      (current.sourceSnapshotKindCounts[sourceSnapshotKind] ?? 0) + 1;
    [
      slice.snapshotChanged ? 'snapshot' : null,
      slice.viewportBoundsChanged ? 'viewport_bounds' : null,
      slice.gestureStateChanged ? 'gesture' : null,
      slice.movingStateChanged ? 'moving' : null,
      slice.presentationChanged ? 'presentation' : null,
      slice.controlStateChanged ? 'control' : null,
    ]
      .filter(Boolean)
      .forEach((reason) => {
        current.changeReasonCounts[reason] = (current.changeReasonCounts[reason] ?? 0) + 1;
      });
    current.maxSourceTransportBuildDurationMs = Math.max(
      current.maxSourceTransportBuildDurationMs,
      timing.sourceTransportBuildDurationMs
    );
    current.maxNativePayloadBuildDurationMs = Math.max(
      current.maxNativePayloadBuildDurationMs,
      timing.nativePayloadBuildDurationMs
    );
    current.maxNativeAckDurationMs = Math.max(
      current.maxNativeAckDurationMs,
      timing.nativeAckDurationMs
    );
    current.maxNativeEnqueueToAckDurationMs = Math.max(
      current.maxNativeEnqueueToAckDurationMs,
      timing.nativeEnqueueToAckDurationMs
    );
    current.maxNativeModuleDurationMs = Math.max(
      current.maxNativeModuleDurationMs,
      timing.promiseSettleDurationMs
    );
    current.maxNativeModuleQueueWaitDurationMs = Math.max(
      current.maxNativeModuleQueueWaitDurationMs,
      timing.nativeModuleQueueWaitDurationMs
    );
    current.maxNativeMainExecutionDurationMs = Math.max(
      current.maxNativeMainExecutionDurationMs,
      timing.nativeMainExecutionDurationMs
    );
    current.maxNativeSetFrameActionDurationMs = Math.max(
      current.maxNativeSetFrameActionDurationMs,
      timing.nativeSetFrameActionDurationMs
    );
    current.maxNativeBridgeUnattributedDurationMs = Math.max(
      current.maxNativeBridgeUnattributedDurationMs,
      timing.promiseSettleGapMs
    );
    current.maxPromiseDeliveryWallClockGapMs = Math.max(
      current.maxPromiseDeliveryWallClockGapMs,
      timing.promiseDeliveryWallClockGapMs ?? 0
    );
    current.promiseDeliveryAttribution[timing.promiseDeliveryAttribution] =
      (current.promiseDeliveryAttribution[timing.promiseDeliveryAttribution] ?? 0) + 1;
    if (current.sampleLines.length < 8) {
      current.sampleLines.push(slice.line);
    }
    grouped.set(key, current);
  });
  const promiseDeliveryAttribution = slices.reduce((summary, slice) => {
    const timing = nativeRenderFrameBridgeSliceTiming(slice);
    const current = summary[timing.promiseDeliveryAttribution] ?? {
      count: 0,
      maxPromiseDeliveryWallClockGapMs: 0,
      maxPromiseSettleGapMs: 0,
    };
    current.count += 1;
    current.maxPromiseDeliveryWallClockGapMs = Math.max(
      current.maxPromiseDeliveryWallClockGapMs,
      timing.promiseDeliveryWallClockGapMs ?? 0
    );
    current.maxPromiseSettleGapMs = Math.max(
      current.maxPromiseSettleGapMs,
      timing.promiseSettleGapMs
    );
    summary[timing.promiseDeliveryAttribution] = current;
    return summary;
  }, {});
  return {
    measurementMode: 'native_ack_hot_owner',
    durationMetric: 'hotOwnerDurationMs',
    promiseSettleMetric: 'promiseSettleDurationMs',
    eventCount: slices.length,
    observedSliceCount,
    aggregateEventCount: slices.filter((slice) => slice.quietAggregate === true).length,
    promiseSettleGapClassification: {
      unexplainedBridgePromiseSchedulingGapCount: unexplainedGapSlices.length,
      maxUnexplainedBridgePromiseSchedulingGapMs: round(
        Math.max(
          0,
          ...unexplainedGapSlices.map(
            (slice) => nativeRenderFrameBridgeSliceTiming(slice).promiseSettleGapMs
          )
        )
      ),
      note: 'Gap is measured after native queue/main execution and before JS promise observation; React, native event delivery, promise callback body, and sampler callback delay are tracked separately.',
    },
    promiseDeliveryAttribution,
    promiseDeliveryTraceNote:
      'nativeResolveStartedAtEpochMs and jsPromiseObservedAtEpochMs use best-effort same-wall-clock Date/NSDate timestamps; use for attribution direction, not sub-millisecond precision.',
    topByDuration: [...slices]
      .sort(
        (left, right) =>
          nativeRenderFrameBridgeSliceTiming(right).hotOwnerDurationMs -
          nativeRenderFrameBridgeSliceTiming(left).hotOwnerDurationMs
      )
      .slice(0, WORST_LIMIT)
      .map(nativeRenderFrameBridgeSliceSummary),
    topByPromiseSettleGap: [...slices]
      .sort(
        (left, right) =>
          nativeRenderFrameBridgeSliceTiming(right).promiseSettleGapMs -
          nativeRenderFrameBridgeSliceTiming(left).promiseSettleGapMs
      )
      .slice(0, WORST_LIMIT)
      .map(nativeRenderFrameBridgeSliceSummary),
    byStatusPhaseSources: [...grouped.values()]
      .sort((left, right) => right.totalDurationMs - left.totalDurationMs)
      .slice(0, WORST_LIMIT),
  };
};

const attachNativeFrameBridgeEvidenceToWindows = (windows, sourceEvents, metricName) => {
  const bridgeSlices = nativeRenderFrameBridgeSliceEvents(sourceEvents);
  return windows.map((window) => {
    const range = samplerWindowCorrelationRange(window);
    const overlapping =
      range == null
        ? []
        : bridgeSlices
            .filter((slice) => frameBridgeSliceOverlapsRange(slice, range))
            .sort(
              (left, right) =>
                nativeRenderFrameBridgeSliceTiming(right).hotOwnerDurationMs -
                nativeRenderFrameBridgeSliceTiming(left).hotOwnerDurationMs
            );
    return {
      line: window.line,
      metricValue: window[metricName],
      range,
      overlappingSliceCount: overlapping.length,
      overlappingSlices: overlapping.slice(0, 10).map(nativeRenderFrameBridgeSliceSummary),
    };
  });
};

const buildReportSections = (sourceEvents) => {
  const sourceProfilers = profilerEvents(sourceEvents);
  const sourceStallProbes = stallProbeEvents(sourceEvents);
  const sourceWorkSpans = workSpanEvents(sourceEvents);
  const sourceRenders = renderEvents(sourceEvents);
  const sourceSamplers = {
    jsFrame: summarizeSampler(sourceEvents, 'JsFrameSampler', 'maxFrameMs'),
    uiFrame: summarizeSampler(sourceEvents, 'UiFrameSampler', 'maxFrameMs'),
    jsTaskLatency: summarizeSampler(sourceEvents, 'JsTaskLatencySampler', 'maxLagMs'),
  };
  return {
    channels: summarizeChannels(sourceEvents),
    logBytes: {
      totalPayloadBytes: sourceEvents.reduce(
        (total, event) => total + Number(event.payloadLength ?? 0),
        0
      ),
      byChannel: summarizeLogBytes(sourceEvents, (event) => event.channel),
      byEvent: summarizeEventLogBytes(sourceEvents),
    },
    samplers: sourceSamplers,
    profiler: summarizeProfiler(sourceProfilers),
    stallProbes: summarizeStallProbes(sourceStallProbes),
    workSpans: summarizeWorkSpans(sourceWorkSpans),
    renders: summarizeRenders(sourceRenders),
    hermesSamplingProfile: summarizeHermesSamplingProfile(sourceEvents),
    scenarioEvents: scenarioEvents(sourceEvents),
    searchRequests: searchRequestEvents(sourceEvents),
    visualReadiness: {
      eventCount: visualReadinessEvents(sourceEvents).length,
      events: visualReadinessEvents(sourceEvents).slice(-WORST_LIMIT),
    },
    nativeBridgeSlices: summarizeNativeBridgeTransactionSlices(sourceEvents),
    nativeRenderFrameBridgeSlices: summarizeNativeRenderFrameBridgeSlices(sourceEvents),
    nativeMapApplySummary: summarizeNativeMapApplySummaries(sourceEvents),
    correlations: {
      worstJsFrameWindows: attachRuntimeEvidenceToWindows(
        sourceSamplers.jsFrame.worstWindows,
        sourceProfilers,
        sourceEvents,
        'maxFrameMs'
      ),
      worstTaskWindows: attachRuntimeEvidenceToWindows(
        sourceSamplers.jsTaskLatency.worstWindows,
        sourceProfilers,
        sourceEvents,
        'maxLagMs'
      ),
      nativeFrameBridgeForWorstJsFrameWindows: attachNativeFrameBridgeEvidenceToWindows(
        sourceSamplers.jsFrame.worstWindows,
        sourceEvents,
        'maxFrameMs'
      ),
      nativeFrameBridgeForWorstTaskWindows: attachNativeFrameBridgeEvidenceToWindows(
        sourceSamplers.jsTaskLatency.worstWindows,
        sourceEvents,
        'maxLagMs'
      ),
      nativeFrameBridgeForWorstUiFrameWindows: attachNativeFrameBridgeEvidenceToWindows(
        sourceSamplers.uiFrame.worstWindows,
        sourceEvents,
        'maxFrameMs'
      ),
    },
  };
};

const buildTrimmedSamplerSummary = (sourceEvents) => {
  const jsFrameWindows = sourceEvents
    .filter((event) => event.channel === 'JsFrameSampler' && event.payload.event === 'window')
    .map((event) => ({ line: event.line, ...event.payload }));
  const jsTaskWindows = sourceEvents
    .filter(
      (event) => event.channel === 'JsTaskLatencySampler' && event.payload.event === 'task_window'
    )
    .map((event) => ({ line: event.line, ...event.payload }));
  const uiFrameWindows = sourceEvents
    .filter((event) => event.channel === 'UiFrameSampler' && event.payload.event === 'window')
    .map((event) => ({ line: event.line, ...event.payload }));
  const metricSummary = (windows, metricName) => {
    const values = windows.map((window) => Number(window[metricName]));
    const worstWindow = maxBy(windows, (window) => Number(window[metricName] ?? 0));
    return {
      windowCount: windows.length,
      p95: percentile(values, 95),
      max: round(Math.max(...values.filter(Number.isFinite))),
      worstWindow: worstWindow ?? null,
    };
  };
  return {
    jsFrameMaxFrameMs: metricSummary(jsFrameWindows, 'maxFrameMs'),
    jsTaskMaxLagMs: metricSummary(jsTaskWindows, 'maxLagMs'),
    uiFrameMaxFrameMs: metricSummary(uiFrameWindows, 'maxFrameMs'),
  };
};

const content = fs.readFileSync(logPath, 'utf8');
const events = readJsonPayloads(content);
const scenarios = scenarioEvents(events);
const activeRun = resolveActiveScenarioRun({ events, scenarios, logPath, outputPath });
const currentRunEvents = activeRun.events;
const currentRunScenarios = scenarioEvents(currentRunEvents);
const measuredRepeatLoopRange = resolveMeasuredRepeatLoopRange(currentRunScenarios);
const fullRunSections = buildReportSections(currentRunEvents);
const measuredRepeatLoopEvents = measuredRepeatLoopRange
  ? currentRunEvents.filter((event) => eventIsInsideMeasuredRange(event, measuredRepeatLoopRange))
  : [];
const measuredRepeatLoopAttributionEvents = measuredRepeatLoopRange
  ? quietAttributionAggregateEventsForReason(currentRunEvents, 'measured_repeat_loop_end')
  : [];
const measuredRepeatLoopNativeMapApplySummaryEvents = measuredRepeatLoopRange
  ? nativeMapApplySummaryEventsForReason(currentRunEvents, 'measured_repeat_loop_end')
  : [];
const measuredRepeatLoopReportEvents = measuredRepeatLoopRange
  ? [
      ...measuredRepeatLoopEvents,
      ...measuredRepeatLoopAttributionEvents,
      ...measuredRepeatLoopNativeMapApplySummaryEvents,
    ]
  : [];

const report = {
  schema: 'perf-scenario-report.v1',
  generatedAt: new Date().toISOString(),
  logPath,
  screenshotDirectory: process.env.PERF_SCENARIO_SCREENSHOT_DIR || null,
  videoFile: process.env.PERF_SCENARIO_VIDEO_FILE || null,
  scenarioName: activeRun.scenarioName,
  scenarioRunId: activeRun.scenarioRunId,
  requestId: activeRun.requestId,
  activeRun: {
    scenarioName: activeRun.scenarioName,
    scenarioRunId: activeRun.scenarioRunId,
    requestId: activeRun.requestId,
    selection: activeRun.selection,
    window: activeRun.window,
    eventCount: currentRunEvents.length,
  },
  ...fullRunSections,
};

report.measuredRepeatLoop = measuredRepeatLoopRange
  ? {
      range: measuredRepeatLoopRange,
      ...buildReportSections(measuredRepeatLoopReportEvents),
    }
  : null;

if (measuredRepeatLoopRange) {
  const firstSubmitTrimRange = resolveFirstMeasuredSubmitExclusionRange(
    currentRunEvents,
    measuredRepeatLoopRange
  );
  const trimmedEvents = firstSubmitTrimRange
    ? measuredRepeatLoopEvents.filter((event) =>
        eventIsOutsideTrimRange(event, firstSubmitTrimRange)
      )
    : [];
  const trimmedReportEvents = firstSubmitTrimRange
    ? [
        ...trimmedEvents,
        ...measuredRepeatLoopAttributionEvents,
        ...measuredRepeatLoopNativeMapApplySummaryEvents,
      ]
    : [];
  report.measuredRepeatLoopTrimmed = firstSubmitTrimRange
    ? {
        range: measuredRepeatLoopRange,
        trimRange: firstSubmitTrimRange,
        ...buildReportSections(trimmedReportEvents),
        trimmedSamplerSummary: buildTrimmedSamplerSummary(trimmedEvents),
      }
    : null;
}

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized);
}

console.log(
  `[perf-scenario-report] scenario=${report.scenarioName ?? '<unknown>'} scenarioRunId=${
    report.scenarioRunId ?? '<unknown>'
  } jsWindows=${report.samplers.jsFrame.windowCount} uiWindows=${
    report.samplers.uiFrame.windowCount
  } taskWindows=${report.samplers.jsTaskLatency.windowCount} profilerSpans=${
    report.profiler.eventCount
  } stallProbes=${report.stallProbes.eventCount} workSpans=${report.workSpans.eventCount}` +
    (report.measuredRepeatLoop
      ? ` measuredTaskWindows=${report.measuredRepeatLoop.samplers.jsTaskLatency.windowCount} measuredProfilerSpans=${report.measuredRepeatLoop.profiler.eventCount}`
      : ' measuredRepeatLoop=<missing>')
);
if (outputPath) {
  console.log(`[perf-scenario-report] wrote ${outputPath}`);
}
