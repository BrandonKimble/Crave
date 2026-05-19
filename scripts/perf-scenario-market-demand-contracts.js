#!/usr/bin/env node
const fs = require('fs');

const usage = () => {
  console.log(
    'Usage: scripts/perf-scenario-market-demand-contracts.js <perf_report.json> [--output <path>]'
  );
};

const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
  usage();
  process.exit(0);
}

const reportPath = args[0];
if (!reportPath) {
  usage();
  process.exit(2);
}

const outputIndex = args.indexOf('--output');
const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : null;

const linePattern = /\[SearchPerf\]\[([^\]]+)\]\s+({.*})/;

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));

const readEventsFromLog = (logPath) => {
  if (!logPath || !fs.existsSync(logPath)) {
    return [];
  }
  return fs
    .readFileSync(logPath, 'utf8')
    .split(/\r?\n/)
    .flatMap((line, index) => {
      const match = line.match(linePattern);
      if (!match) {
        return [];
      }
      try {
        return [
          {
            line: index + 1,
            channel: match[1],
            payload: JSON.parse(match[2]),
          },
        ];
      } catch {
        return [];
      }
    });
};

const report = readJson(reportPath);
const events = readEventsFromLog(report.logPath);
const scenarioName = report.scenarioName ?? report.activeRun?.scenarioName ?? null;
const scenarioRunId = report.scenarioRunId ?? report.activeRun?.scenarioRunId ?? null;

const sameRun = (event) => !scenarioRunId || event.payload?.scenarioRunId === scenarioRunId;

const eventsByChannel = (channel) =>
  events.filter((event) => event.channel === channel && sameRun(event));

const scenarioEvents = eventsByChannel('Scenario').map((event) => ({
  line: event.line,
  ...event.payload,
}));

const searchRequestEvents = eventsByChannel('SearchRequest').map((event) => ({
  line: event.line,
  ...event.payload,
}));

const visualReadinessEvents = eventsByChannel('VisualReadiness').map((event) => ({
  line: event.line,
  ...event.payload,
}));

const failures = [];
const warnings = [];
const evidence = {};

const fail = (message, details = {}) => {
  failures.push({ message, ...details });
};

const warn = (message, details = {}) => {
  warnings.push({ message, ...details });
};

const apiFailures = scenarioEvents.filter((event) => event.event === 'api_request_failed_contract');
if (apiFailures.length > 0) {
  fail('API request failed during scenario.', { apiFailures });
}

const commandFailures = scenarioEvents.filter(
  (event) => event.event === 'perf_scenario_command_failed'
);
if (commandFailures.length > 0) {
  fail('Perf scenario command failed.', { commandFailures });
}

const searchResponses = searchRequestEvents.filter(
  (event) => event.source === 'useSearchRequests.runSearch' && event.phase === 'response'
);
const autocompleteResponses = searchRequestEvents.filter(
  (event) =>
    event.source === 'useSearchRequests.runAutocomplete' && event.phase === 'autocomplete_response'
);
const marketResolveResponses = searchRequestEvents.filter(
  (event) => event.source === 'markets.resolveMarket' && event.phase === 'market_resolve_response'
);
const pollHeaderModels = searchRequestEvents.filter(
  (event) => event.source === 'polls.headerModel' && event.phase === 'poll_header_model'
);
const renderedPollHeaderEvents = searchRequestEvents.filter(
  (event) => event.source === 'polls.mountedHeader' && event.phase === 'poll_header_rendered'
);
const renderedAutocompleteEvents = searchRequestEvents.filter(
  (event) =>
    event.source === 'SearchSuggestions' && event.phase === 'autocomplete_rendered_suggestions'
);

const last = (items) => items[items.length - 1] ?? null;
const lastSearchResponse = last(searchResponses);
const lastAutocompleteResponse = last(autocompleteResponses);
const lastMarketResolveResponse = last(marketResolveResponses);
const lastPollHeaderModel = last(pollHeaderModels);
const lastRenderedPollHeaderEvent = last(renderedPollHeaderEvents);
const lastRenderedAutocompleteEvent = last(renderedAutocompleteEvents);

const startsWith = (value, prefix) => typeof value === 'string' && value.startsWith(prefix);
const asArray = (value) => (Array.isArray(value) ? value : []);
const includes = (value, expected) => asArray(value).includes(expected);
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object ?? {}, key);
const hasLegacyCbsaKey = (value) =>
  typeof value === 'string' ? value.includes('cbsa') || /^us-cbsa-/.test(value) : false;
const hasAnyLegacyCbsaKey = (values) => asArray(values).some(hasLegacyCbsaKey);
const eventName = (name) => (event) => event.event === name;
const visualEvents = (name) => visualReadinessEvents.filter(eventName(name));
const scenarioCommandEvents = (action) =>
  scenarioEvents.filter((event) => event.action === action || event.commandAction === action);
const scenarioCommandEvent = (action, name) =>
  scenarioCommandEvents(action).find((event) => event.event === name) ?? null;
const searchVisualSourceFrames = visualEvents('map_surface_results_source_frame_ready_contract');
const sourceFramesReady = searchVisualSourceFrames.filter(
  (event) => event.mapSearchSurfaceResultsSourcesReady === true
);
const sourceFramesWithVisuals = searchVisualSourceFrames.filter(
  (event) =>
    event.mapSearchSurfaceResultsSourcesReady === true &&
    (Number(event.pinCount ?? 0) > 0 ||
      Number(event.dotCount ?? 0) > 0 ||
      Number(event.labelCount ?? 0) > 0)
);
const sourceFramesWithCollision = sourceFramesWithVisuals.filter(
  (event) =>
    event.hasLabelCollisionSource === true ||
    Number(event.labelCollisionCount ?? 0) > 0 ||
    event.nativeMapLabelCollisionPreserved === true
);
const nativeMountedHiddenEvents = visualEvents('native_execution_batch_mounted_hidden_ready');
const commitGateEvents = visualEvents('cards_pins_transaction_commit_gate');
const resultCardsReadyEvents = visualEvents('result_cards_ready');
const pendingRevealEvents = [...visualEvents('results_reveal_watchdog_pending')];
const unresolvedPendingRevealEvents = pendingRevealEvents.filter((pending) => {
  const transactionId = pending.transactionId ?? pending.activeRedrawTransactionId ?? null;
  if (!transactionId) {
    return true;
  }
  return !commitGateEvents.some(
    (event) => event.transactionId === transactionId && event.line > pending.line
  );
});
const repeatedPendingRevealEvents = pendingRevealEvents.filter(
  (event) => Number(event.attempt ?? 0) >= 2
);
const committedCoverPendingEvents = visualEvents('committed_results_cover_watchdog_pending');
const unresolvedCommittedCoverPendingEvents = committedCoverPendingEvents.filter((pending) => {
  const transactionId = pending.transactionId ?? pending.requestKey ?? null;
  if (!transactionId) {
    return true;
  }
  return !visualReadinessEvents.some(
    (event) =>
      event.line > pending.line &&
      (event.requestKey === transactionId || event.transactionId === transactionId) &&
      ['native_marker_enter_settled', 'native_marker_exit_settled'].includes(event.event)
  );
});
const repeatedCommittedCoverPendingEvents = committedCoverPendingEvents.filter(
  (event) => Number(event.attempt ?? 0) >= 2
);
const topMatches = (response) => asArray(response?.autocompleteTopMatches);
const renderedTopMatches = (event) => asArray(event?.renderedAutocompleteTopMatches);
const attributeMatches = (response) =>
  topMatches(response).filter((match) => String(match?.entityType ?? '').includes('attribute'));
const countAutocompleteSource = (response, source) =>
  Number(response?.autocompleteByQuerySuggestionSource?.[source] ?? 0);
const countRenderedAutocompleteSource = (event, source) =>
  Number(event?.renderedAutocompleteByQuerySuggestionSource?.[source] ?? 0);
const normalizedMatchNames = (response) =>
  topMatches(response).map((match) =>
    String(match?.name ?? '')
      .trim()
      .toLowerCase()
  );
const normalizedRenderedMatchNames = (event) =>
  renderedTopMatches(event).map((match) =>
    String(match?.name ?? '')
      .trim()
      .toLowerCase()
  );
const groupByTransaction = (items) =>
  items.reduce((groups, item) => {
    const transactionId = item.transactionId ?? item.readinessKey ?? 'unknown';
    const existing = groups.get(transactionId) ?? [];
    existing.push(item);
    groups.set(transactionId, existing);
    return groups;
  }, new Map());
const txKey = (event) => event.transactionId ?? event.readinessKey ?? event.requestKey ?? null;
const sourceFramesWithCollisionForTransaction = (transactionId) =>
  sourceFramesWithCollision.filter((event) => txKey(event) === transactionId);
const nativeMountedHiddenForTransaction = (transactionId) =>
  nativeMountedHiddenEvents.filter((event) => txKey(event) === transactionId);
const commitGatesForTransaction = (transactionId) =>
  commitGateEvents.filter((event) => txKey(event) === transactionId);
const firstCommitAfterLine = (line) => commitGateEvents.find((event) => event.line > line) ?? null;
const assertVisualRevealForTransaction = (label, transactionId) => {
  if (!transactionId) {
    fail(`${label} did not expose a reveal transaction id.`);
    return;
  }
  if (commitGatesForTransaction(transactionId).length === 0) {
    fail(`${label} did not commit the expected reveal transaction.`, { transactionId });
  }
  if (nativeMountedHiddenForTransaction(transactionId).length === 0) {
    fail(`${label} did not receive native mounted-hidden ACK for the expected transaction.`, {
      transactionId,
    });
  }
  if (sourceFramesWithCollisionForTransaction(transactionId).length === 0) {
    fail(
      `${label} did not publish collision-preserving source frames for the expected transaction.`,
      {
        transactionId,
      }
    );
  }
};
const numberOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const responseBoundsChanged = (left, right) => {
  const fields = [
    'payloadBoundsNorthEastLat',
    'payloadBoundsNorthEastLng',
    'payloadBoundsSouthWestLat',
    'payloadBoundsSouthWestLng',
    'payloadBoundsCenterLat',
    'payloadBoundsCenterLng',
  ];
  return fields.some((field) => {
    const leftValue = numberOrNull(left?.[field]);
    const rightValue = numberOrNull(right?.[field]);
    return leftValue != null && rightValue != null && Math.abs(leftValue - rightValue) > 0.0001;
  });
};

evidence.searchResponseCount = searchResponses.length;
evidence.autocompleteResponseCount = autocompleteResponses.length;
evidence.renderedAutocompleteEventCount = renderedAutocompleteEvents.length;
evidence.marketResolveResponseCount = marketResolveResponses.length;
evidence.pollHeaderModelCount = pollHeaderModels.length;
evidence.renderedPollHeaderEventCount = renderedPollHeaderEvents.length;
evidence.lastSearchResponse = lastSearchResponse;
evidence.lastAutocompleteResponse = lastAutocompleteResponse;
evidence.lastRenderedAutocompleteEvent = lastRenderedAutocompleteEvent;
evidence.lastMarketResolveResponse = lastMarketResolveResponse;
evidence.lastPollHeaderModel = lastPollHeaderModel;
evidence.lastRenderedPollHeaderEvent = lastRenderedPollHeaderEvent;
evidence.visualSourceFrameCount = searchVisualSourceFrames.length;
evidence.visualSourceFrameReadyCount = sourceFramesReady.length;
evidence.visualSourceFrameWithVisualsCount = sourceFramesWithVisuals.length;
evidence.visualSourceFrameWithCollisionCount = sourceFramesWithCollision.length;
evidence.nativeMountedHiddenCount = nativeMountedHiddenEvents.length;
evidence.commitGateCount = commitGateEvents.length;
evidence.resultCardsReadyCount = resultCardsReadyEvents.length;
evidence.pendingRevealCount = pendingRevealEvents.length;
evidence.repeatedPendingRevealCount = repeatedPendingRevealEvents.length;
evidence.committedCoverPendingCount = committedCoverPendingEvents.length;
evidence.unresolvedCommittedCoverPendingCount = unresolvedCommittedCoverPendingEvents.length;

if (unresolvedPendingRevealEvents.length > 0) {
  fail('Reveal watchdog reported a pending transaction that never committed.', {
    unresolvedPendingRevealEvents,
  });
}

if (repeatedPendingRevealEvents.length > 0) {
  warn('Reveal watchdog needed repeated checks before completion.', {
    repeatedPendingRevealEvents,
  });
}

if (committedCoverPendingEvents.length > 0) {
  warn('Committed cover watchdog observed a delayed native settle.', {
    committedCoverPendingEvents,
    unresolvedCommittedCoverPendingEvents,
  });
}

if (repeatedCommittedCoverPendingEvents.length > 0) {
  fail('Committed cover watchdog needed repeated checks after reveal commit.', {
    repeatedCommittedCoverPendingEvents,
  });
}

const assertAustinCollectableScope = (response, label) => {
  if (!includes(response.responseCollectableMarketKeys, 'region-us-tx-austin')) {
    fail(`${label} did not preserve Austin as collectable scope.`, {
      responseCollectableMarketKeys: response.responseCollectableMarketKeys,
    });
  }
  if (hasLegacyCbsaKey(response.responseMarketKey)) {
    fail(`${label} used a legacy CBSA market key.`, {
      responseMarketKey: response.responseMarketKey,
    });
  }
  if (hasAnyLegacyCbsaKey(response.responseAttributionMarketKeys)) {
    fail(`${label} attribution included a legacy CBSA market key.`, {
      responseAttributionMarketKeys: response.responseAttributionMarketKeys,
    });
  }
  if (hasAnyLegacyCbsaKey(response.responseCollectableMarketKeys)) {
    fail(`${label} collectable scope included a legacy CBSA market key.`, {
      responseCollectableMarketKeys: response.responseCollectableMarketKeys,
    });
  }
};
const assertPollHeaderMarket = (label, expectedMarketKey, expectedNameFragment) => {
  const matchingHeaders = pollHeaderModels.filter(
    (event) => event.pollHeaderMarketKey === expectedMarketKey
  );
  if (matchingHeaders.length === 0) {
    fail(`${label} did not publish the expected poll header market.`, {
      expectedMarketKey,
      lastPollHeaderModel,
      pollHeaderModels: pollHeaderModels.slice(-8),
    });
    return;
  }
  if (expectedNameFragment) {
    const normalizedName = expectedNameFragment.toLowerCase();
    const hasName = matchingHeaders.some((event) =>
      String(event.pollHeaderMarketName ?? event.pollHeaderTitle ?? '')
        .toLowerCase()
        .includes(normalizedName)
    );
    if (!hasName) {
      fail(`${label} poll header did not expose the expected market name.`, {
        expectedNameFragment,
        matchingHeaders,
      });
    }
  }
};

const assertPollHeaderMarketAfterLine = (
  label,
  expectedMarketKey,
  expectedNameFragment,
  afterLine
) => {
  const matchingHeaders = pollHeaderModels.filter(
    (event) => event.line > afterLine && event.pollHeaderMarketKey === expectedMarketKey
  );
  if (matchingHeaders.length === 0) {
    fail(`${label} did not publish the expected poll header market after the triggering event.`, {
      expectedMarketKey,
      afterLine,
      lastPollHeaderModel,
      pollHeaderModels: pollHeaderModels.slice(-8),
    });
    return;
  }
  if (expectedNameFragment) {
    const normalizedName = expectedNameFragment.toLowerCase();
    const hasName = matchingHeaders.some((event) =>
      String(event.pollHeaderMarketName ?? event.pollHeaderTitle ?? '')
        .toLowerCase()
        .includes(normalizedName)
    );
    if (!hasName) {
      fail(
        `${label} poll header did not expose the expected market name after the triggering event.`,
        {
          expectedNameFragment,
          matchingHeaders,
        }
      );
    }
  }
};

const assertRenderedPollHeaderMarketAfterLine = (
  label,
  expectedMarketKey,
  expectedNameFragment,
  afterLine
) => {
  const matchingHeaders = renderedPollHeaderEvents.filter(
    (event) => event.line > afterLine && event.renderedPollHeaderMarketKey === expectedMarketKey
  );
  if (matchingHeaders.length === 0) {
    fail(`${label} did not render the expected poll header market after the triggering event.`, {
      expectedMarketKey,
      afterLine,
      lastRenderedPollHeaderEvent,
      renderedPollHeaderEvents: renderedPollHeaderEvents.slice(-8),
    });
    return;
  }
  if (expectedNameFragment) {
    const normalizedName = expectedNameFragment.toLowerCase();
    const hasName = matchingHeaders.some((event) =>
      String(event.renderedPollHeaderMarketName ?? event.renderedPollHeaderTitle ?? '')
        .toLowerCase()
        .includes(normalizedName)
    );
    if (!hasName) {
      fail(
        `${label} rendered poll header did not expose the expected market name after the triggering event.`,
        {
          expectedNameFragment,
          matchingHeaders,
        }
      );
    }
  }
};

const autocompleteRenderAfterResponse = (response) => {
  if (!response) {
    return null;
  }
  return renderedAutocompleteEvents.find((event) => event.line > response.line) ?? null;
};

const assertRenderedAutocompleteEchoesResponse = (label, response) => {
  const renderedEvent = autocompleteRenderAfterResponse(response);
  if (!renderedEvent) {
    fail(`${label} did not render autocomplete suggestions after the autocomplete response.`, {
      lastRenderedAutocompleteEvent,
      responseLine: response?.line ?? null,
    });
    return null;
  }
  const responseTopMatches = topMatches(response);
  const renderedMatches = renderedTopMatches(renderedEvent);
  if (Number(renderedEvent.renderedAutocompleteCount ?? 0) <= 0 && responseTopMatches.length > 0) {
    fail(`${label} rendered no autocomplete suggestions.`, { renderedEvent });
  }
  if (Number(renderedEvent.renderedAutocompleteCount ?? 0) > 7) {
    fail(`${label} rendered more than the visible suggestion limit.`, { renderedEvent });
  }
  if (JSON.stringify(renderedMatches) !== JSON.stringify(responseTopMatches)) {
    fail(`${label} rendered suggestions did not match the response top slice.`, {
      responseTopMatches,
      renderedMatches,
    });
  }
  return renderedEvent;
};

const assertNativeRevealForSearch = (label) => {
  if (sourceFramesWithVisuals.length === 0) {
    fail(`${label} did not publish a full source frame with visual data.`);
  }
  if (nativeMountedHiddenEvents.length === 0) {
    fail(`${label} did not receive a native mounted-hidden ACK.`);
  }
  if (commitGateEvents.length === 0) {
    fail(`${label} did not commit through the cards/pins reveal gate.`);
  }
};

const isNoResultsSearchResponse = (response) =>
  Number(response?.responseDishCount ?? 0) === 0 &&
  Number(response?.responseRestaurantCount ?? 0) === 0;

const assertNoResultsRevealForSearch = (label) => {
  if (sourceFramesReady.length === 0) {
    fail(`${label} did not publish a ready empty source frame.`);
  }
  if (!commitGateEvents.some((event) => event.hasNoRenderableResults === true)) {
    fail(`${label} did not commit through the no-renderable-results reveal gate.`, {
      commitGateEvents,
    });
  }
  if (!resultCardsReadyEvents.some((event) => event.hasNoRenderableResults === true)) {
    fail(`${label} did not mark result cards ready for a no-results reveal.`, {
      resultCardsReadyEvents,
    });
  }
  if (nativeMountedHiddenEvents.length === 0) {
    fail(`${label} did not receive a native mounted-hidden ACK for the empty frame.`);
  }
};

const assertRevealForSearchResponse = (label, response) => {
  if (isNoResultsSearchResponse(response)) {
    assertNoResultsRevealForSearch(label);
    return;
  }
  assertNativeRevealForSearch(label);
};

switch (scenarioName) {
  case 'market_demand_austin_search': {
    if (!lastSearchResponse) {
      fail('Austin market scenario did not produce a search response.');
      break;
    }
    if (!startsWith(lastSearchResponse.responseMarketKey, 'region-')) {
      fail('Austin search did not resolve to a regional market.', {
        responseMarketKey: lastSearchResponse.responseMarketKey,
      });
    }
    if (startsWith(lastSearchResponse.responseMarketKey, 'locality-')) {
      fail('Austin search was narrowed to a bootstrapped locality market.', {
        responseMarketKey: lastSearchResponse.responseMarketKey,
      });
    }
    if (!includes(lastSearchResponse.responseAttributionMarketKeys, 'region-us-tx-austin')) {
      fail('Austin search did not attribute regional demand.', {
        responseAttributionMarketKeys: lastSearchResponse.responseAttributionMarketKeys,
      });
    }
    if (!includes(lastSearchResponse.responseAttributionMarketKeys, 'locality-us-tx-austin')) {
      fail('Austin search did not preserve Austin locality attribution.', {
        responseAttributionMarketKeys: lastSearchResponse.responseAttributionMarketKeys,
      });
    }
    assertAustinCollectableScope(lastSearchResponse, 'Austin search');
    assertNativeRevealForSearch('Austin search');
    if (sourceFramesWithCollision.length === 0) {
      fail('Austin search did not preserve label-collision visual sources.');
    }
    break;
  }
  case 'market_demand_spicewood_rollup_search': {
    if (!lastSearchResponse) {
      fail('Spicewood roll-up scenario did not produce a search response.');
      break;
    }
    if (!includes(lastSearchResponse.responseAttributionMarketKeys, 'region-us-tx-austin')) {
      fail('Spicewood roll-up did not include Austin regional attribution.', {
        responseAttributionMarketKeys: lastSearchResponse.responseAttributionMarketKeys,
      });
    }
    if (!includes(lastSearchResponse.responseAttributionMarketKeys, 'locality-us-tx-spicewood')) {
      fail('Spicewood roll-up did not include Spicewood locality attribution.', {
        responseAttributionMarketKeys: lastSearchResponse.responseAttributionMarketKeys,
      });
    }
    assertAustinCollectableScope(lastSearchResponse, 'Spicewood roll-up search');
    assertRevealForSearchResponse('Spicewood roll-up search', lastSearchResponse);
    break;
  }
  case 'market_demand_off_region_active_search': {
    if (!lastSearchResponse) {
      fail('Off-region active scenario did not produce a search response.');
      break;
    }
    if (!startsWith(lastSearchResponse.responseMarketKey, 'locality-')) {
      fail('Off-region active search did not resolve to a locality market.', {
        responseMarketKey: lastSearchResponse.responseMarketKey,
      });
    }
    if (
      Array.isArray(lastSearchResponse.responseCollectableMarketKeys) &&
      lastSearchResponse.responseCollectableMarketKeys.length > 0
    ) {
      fail('Off-region active search should not imply a collectable Reddit market.', {
        responseCollectableMarketKeys: lastSearchResponse.responseCollectableMarketKeys,
      });
    }
    if (!includes(lastSearchResponse.responseAttributionMarketKeys, 'locality-us-mn-duluth')) {
      fail('Off-region active search did not preserve Duluth locality attribution.', {
        responseAttributionMarketKeys: lastSearchResponse.responseAttributionMarketKeys,
      });
    }
    assertPollHeaderMarket('Off-region active search', 'locality-us-mn-duluth', 'Duluth');
    assertRevealForSearchResponse('Off-region active search', lastSearchResponse);
    break;
  }
  case 'market_demand_passive_off_region': {
    if (!lastMarketResolveResponse) {
      fail('Passive off-region scenario did not emit a market resolve response.');
      break;
    }
    const cameraResolveCommandReceived = scenarioCommandEvent(
      'set_map_camera_and_resolve_market',
      'perf_scenario_command_received'
    );
    const headerTriggerLine = cameraResolveCommandReceived?.line ?? lastMarketResolveResponse.line;
    if (searchResponses.length > 0) {
      fail('Passive off-region scenario unexpectedly submitted a search.', {
        searchResponseCount: searchResponses.length,
      });
    }
    if (lastMarketResolveResponse.marketResolveMode !== 'polls_read') {
      fail('Passive off-region scenario did not use passive polls_read market resolution.', {
        marketResolveMode: lastMarketResolveResponse.marketResolveMode,
      });
    }
    if (lastMarketResolveResponse.marketKey !== 'locality-us-mn-duluth') {
      fail('Passive off-region scenario did not resolve the stored Duluth locality.', {
        marketKey: lastMarketResolveResponse.marketKey,
      });
    }
    assertPollHeaderMarketAfterLine(
      'Passive off-region scenario',
      'locality-us-mn-duluth',
      'Duluth',
      headerTriggerLine
    );
    assertRenderedPollHeaderMarketAfterLine(
      'Passive off-region scenario',
      'locality-us-mn-duluth',
      'Duluth',
      headerTriggerLine
    );
    if (!hasOwn(lastMarketResolveResponse, 'marketIsCollectable')) {
      fail('Passive off-region scenario did not expose collectable-market observability.', {
        lastMarketResolveResponse,
      });
    } else if (lastMarketResolveResponse.marketIsCollectable !== false) {
      fail('Passive off-region scenario resolved an executable collectable market unexpectedly.', {
        marketIsCollectable: lastMarketResolveResponse.marketIsCollectable,
      });
    }
    for (const key of [
      'candidateBoundaryProvider',
      'candidateBoundaryId',
      'candidateBoundaryType',
    ]) {
      if (!hasOwn(lastMarketResolveResponse, key)) {
        fail('Passive off-region scenario did not expose candidate-boundary observability.', {
          missingKey: key,
          lastMarketResolveResponse,
        });
      }
    }
    if (
      lastMarketResolveResponse.candidateBoundaryProvider != null ||
      lastMarketResolveResponse.candidateBoundaryId != null ||
      lastMarketResolveResponse.candidateBoundaryType != null
    ) {
      fail(
        'Passive off-region scenario exposed a provider candidate boundary, which would indicate bootstrap-oriented resolution.',
        {
          candidateBoundaryProvider: lastMarketResolveResponse.candidateBoundaryProvider,
          candidateBoundaryId: lastMarketResolveResponse.candidateBoundaryId,
          candidateBoundaryType: lastMarketResolveResponse.candidateBoundaryType,
        }
      );
    }
    break;
  }
  case 'market_demand_autocomplete_first_letter': {
    if (!lastAutocompleteResponse) {
      fail('Autocomplete first-letter scenario did not produce an autocomplete response.');
      break;
    }
    if (lastAutocompleteResponse.queryLength !== 1) {
      fail('Autocomplete first-letter scenario did not exercise a one-character query.', {
        queryLength: lastAutocompleteResponse.queryLength,
      });
    }
    if (Number(lastAutocompleteResponse.autocompleteMatchCount ?? 0) <= 0) {
      fail('Autocomplete first-letter scenario returned no suggestions.');
    }
    if (Number(lastAutocompleteResponse.autocompleteMatchCount ?? 0) > 7) {
      fail('Autocomplete first-letter scenario exceeded the visible suggestion limit.', {
        autocompleteMatchCount: lastAutocompleteResponse.autocompleteMatchCount,
      });
    }
    if (Number(lastAutocompleteResponse.autocompleteAttributeCount ?? 0) > 1) {
      fail('Autocomplete first-letter scenario returned more than one attribute candidate.', {
        autocompleteAttributeCount: lastAutocompleteResponse.autocompleteAttributeCount,
        autocompleteTopMatches: lastAutocompleteResponse.autocompleteTopMatches,
      });
    }
    const renderedEvent = assertRenderedAutocompleteEchoesResponse(
      'Autocomplete first-letter scenario',
      lastAutocompleteResponse
    );
    if (Number(renderedEvent?.renderedAutocompleteAttributeCount ?? 0) > 1) {
      fail('Autocomplete first-letter scenario rendered more than one attribute candidate.', {
        renderedEvent,
      });
    }
    break;
  }
  case 'market_demand_autocomplete_attribute_gate': {
    if (!lastAutocompleteResponse) {
      fail('Autocomplete attribute gate scenario did not produce an autocomplete response.');
      break;
    }
    if (Number(lastAutocompleteResponse.queryLength ?? 0) < 4) {
      fail('Autocomplete attribute gate scenario did not exercise a long-enough query.', {
        queryLength: lastAutocompleteResponse.queryLength,
      });
    }
    if (Number(lastAutocompleteResponse.autocompleteMatchCount ?? 0) <= 0) {
      fail('Autocomplete attribute gate scenario returned no suggestions.');
    }
    if (Number(lastAutocompleteResponse.autocompleteAttributeCount ?? 0) !== 1) {
      fail('Autocomplete attribute gate scenario should expose exactly one strong attribute.', {
        autocompleteAttributeCount: lastAutocompleteResponse.autocompleteAttributeCount,
        autocompleteTopMatches: lastAutocompleteResponse.autocompleteTopMatches,
      });
    }
    if (!normalizedMatchNames(lastAutocompleteResponse).includes('happy hour')) {
      fail(
        'Autocomplete attribute gate scenario did not expose the fixture-backed happy hour attribute.',
        {
          autocompleteTopMatches: lastAutocompleteResponse.autocompleteTopMatches,
        }
      );
    }
    const renderedEvent = assertRenderedAutocompleteEchoesResponse(
      'Autocomplete attribute gate scenario',
      lastAutocompleteResponse
    );
    if (Number(renderedEvent?.renderedAutocompleteAttributeCount ?? 0) !== 1) {
      fail('Autocomplete attribute gate scenario should render exactly one strong attribute.', {
        renderedEvent,
      });
    }
    if (!normalizedRenderedMatchNames(renderedEvent).includes('happy hour')) {
      fail(
        'Autocomplete attribute gate scenario did not render the fixture-backed happy hour attribute.',
        {
          renderedEvent,
        }
      );
    }
    break;
  }
  case 'market_demand_autocomplete_noisy_attribute_gate': {
    if (!lastAutocompleteResponse) {
      fail('Autocomplete noisy-attribute scenario did not produce an autocomplete response.');
      break;
    }
    if (Number(lastAutocompleteResponse.autocompleteAttributeCount ?? 0) !== 0) {
      fail(
        'Autocomplete noisy-attribute scenario returned attribute candidates despite weak support.',
        {
          autocompleteAttributeCount: lastAutocompleteResponse.autocompleteAttributeCount,
          attributeMatches: attributeMatches(lastAutocompleteResponse),
          autocompleteTopMatches: lastAutocompleteResponse.autocompleteTopMatches,
        }
      );
    }
    const renderedEvent = assertRenderedAutocompleteEchoesResponse(
      'Autocomplete noisy-attribute scenario',
      lastAutocompleteResponse
    );
    if (Number(renderedEvent?.renderedAutocompleteAttributeCount ?? 0) !== 0) {
      fail(
        'Autocomplete noisy-attribute scenario rendered attribute candidates despite weak support.',
        {
          renderedEvent,
        }
      );
    }
    break;
  }
  case 'market_demand_autocomplete_query_lanes': {
    if (!lastAutocompleteResponse) {
      fail('Autocomplete query-lane scenario did not produce an autocomplete response.');
      break;
    }
    if (countAutocompleteSource(lastAutocompleteResponse, 'personal') <= 0) {
      fail('Autocomplete query-lane scenario did not preserve personal query suggestions.', {
        autocompleteByQuerySuggestionSource:
          lastAutocompleteResponse.autocompleteByQuerySuggestionSource,
        autocompleteTopMatches: lastAutocompleteResponse.autocompleteTopMatches,
      });
    }
    if (countAutocompleteSource(lastAutocompleteResponse, 'global') <= 0) {
      fail('Autocomplete query-lane scenario did not preserve global query suggestions.', {
        autocompleteByQuerySuggestionSource:
          lastAutocompleteResponse.autocompleteByQuerySuggestionSource,
        autocompleteTopMatches: lastAutocompleteResponse.autocompleteTopMatches,
      });
    }
    if (Number(lastAutocompleteResponse.autocompleteMatchCount ?? 0) > 7) {
      fail('Autocomplete query-lane scenario exceeded the visible suggestion limit.', {
        autocompleteMatchCount: lastAutocompleteResponse.autocompleteMatchCount,
      });
    }
    const queryLaneTopMatches = topMatches(lastAutocompleteResponse);
    if (
      !queryLaneTopMatches.some(
        (match) => match.matchType === 'query' && match.querySuggestionSource === 'personal'
      )
    ) {
      fail(
        'Autocomplete query-lane scenario did not include a personal query in the visible top slice.',
        {
          autocompleteTopMatches: lastAutocompleteResponse.autocompleteTopMatches,
        }
      );
    }
    if (
      !queryLaneTopMatches.some(
        (match) => match.matchType === 'query' && match.querySuggestionSource === 'global'
      )
    ) {
      fail(
        'Autocomplete query-lane scenario did not include a global query in the visible top slice.',
        {
          autocompleteTopMatches: lastAutocompleteResponse.autocompleteTopMatches,
        }
      );
    }
    const queryLaneNames = normalizedMatchNames(lastAutocompleteResponse);
    if (!queryLaneNames.includes('supper club')) {
      fail('Autocomplete query-lane scenario did not include the fixture global query.', {
        autocompleteTopMatches: lastAutocompleteResponse.autocompleteTopMatches,
      });
    }
    if (
      !queryLaneNames.includes('saffron noodles') &&
      !queryLaneNames.includes('soba noodles') &&
      !queryLaneNames.includes('salmon brunch')
    ) {
      fail('Autocomplete query-lane scenario did not include any fixture personal query.', {
        autocompleteTopMatches: lastAutocompleteResponse.autocompleteTopMatches,
      });
    }
    const renderedEvent = assertRenderedAutocompleteEchoesResponse(
      'Autocomplete query-lane scenario',
      lastAutocompleteResponse
    );
    if (countRenderedAutocompleteSource(renderedEvent, 'personal') <= 0) {
      fail('Autocomplete query-lane scenario did not render personal query suggestions.', {
        renderedEvent,
      });
    }
    if (countRenderedAutocompleteSource(renderedEvent, 'global') <= 0) {
      fail('Autocomplete query-lane scenario did not render global query suggestions.', {
        renderedEvent,
      });
    }
    const renderedQueryLaneNames = normalizedRenderedMatchNames(renderedEvent);
    if (!renderedQueryLaneNames.includes('supper club')) {
      fail('Autocomplete query-lane scenario did not render the fixture global query.', {
        renderedEvent,
      });
    }
    if (
      !renderedQueryLaneNames.includes('saffron noodles') &&
      !renderedQueryLaneNames.includes('soba noodles') &&
      !renderedQueryLaneNames.includes('salmon brunch')
    ) {
      fail('Autocomplete query-lane scenario did not render any fixture personal query.', {
        renderedEvent,
      });
    }
    break;
  }
  case 'market_demand_cache_repeat': {
    if (searchResponses.length < 2) {
      fail('Cache repeat scenario needs at least two search responses.', {
        searchResponseCount: searchResponses.length,
      });
      break;
    }
    const cacheResponses = searchResponses.filter(
      (event) => event.responseDataReadyFrom === 'cache'
    );
    if (cacheResponses.length === 0) {
      fail('Cache repeat scenario did not observe a cache reveal response.', {
        dataReadyFromValues: searchResponses.map((event) => event.responseDataReadyFrom),
      });
    }
    const [firstResponse, secondResponse] = searchResponses;
    if (secondResponse?.responseDataReadyFrom !== 'cache') {
      fail('Cache repeat second response was not a cache reveal.', {
        secondResponseDataReadyFrom: secondResponse?.responseDataReadyFrom ?? null,
      });
    }
    if (
      firstResponse?.responseSearchRequestId &&
      secondResponse?.responseSearchRequestId &&
      firstResponse.responseSearchRequestId === secondResponse.responseSearchRequestId
    ) {
      fail('Cache repeat scenario reused the backend search request id for the reveal.', {
        responseSearchRequestIds: searchResponses.map((event) => event.responseSearchRequestId),
      });
    }
    if (
      secondResponse?.responseDataReadyFrom === 'cache' &&
      !secondResponse.responseOriginalBackendSearchRequestId
    ) {
      fail('Cache repeat scenario did not preserve the original backend request id.', {
        secondResponse,
      });
    }
    const cacheRevealCommit = firstCommitAfterLine(
      secondResponse?.line ?? Number.POSITIVE_INFINITY
    );
    const cacheRevealTransactionId = cacheRevealCommit?.transactionId ?? null;
    evidence.cacheRevealTransactionId = cacheRevealTransactionId;
    assertVisualRevealForTransaction('Cache repeat second/cache reveal', cacheRevealTransactionId);
    if (nativeMountedHiddenEvents.length < 2) {
      fail('Cache repeat scenario did not mount a fresh hidden native frame for each reveal.', {
        nativeMountedHiddenCount: nativeMountedHiddenEvents.length,
      });
    }
    const sourceFrameTransactionsWithCollision = new Set(
      sourceFramesWithCollision.map((event) => event.transactionId ?? event.readinessKey)
    );
    if (sourceFrameTransactionsWithCollision.size < 2) {
      fail(
        'Cache repeat scenario did not publish label-collision source frames for both reveals.',
        {
          sourceFrameTransactionsWithCollision: Array.from(sourceFrameTransactionsWithCollision),
          visualSourceFrameWithCollisionCount: sourceFramesWithCollision.length,
        }
      );
    }
    const reusedSourceFrames = visualEvents('map_source_frame_data_reuse_contract').filter(
      (event) => event.sourceFrameDataReused === true
    );
    if (reusedSourceFrames.length > 0) {
      const sourceReadyOnlyReplays = reusedSourceFrames.filter(
        (event) => event.didPublishReadinessState === true
      );
      if (sourceReadyOnlyReplays.length > 0) {
        fail(
          'Cache repeat reused source data by publishing readiness without a full source frame.',
          {
            sourceReadyOnlyReplays,
          }
        );
      }
      const reusedByTransaction = groupByTransaction(reusedSourceFrames);
      const reusedTransactionsWithoutFullPublish = Array.from(reusedByTransaction.entries())
        .filter(
          ([transactionId]) =>
            !searchVisualSourceFrames.some(
              (event) =>
                (event.transactionId ?? event.readinessKey) === transactionId &&
                event.didPublishSourceFrame === true &&
                event.mapSearchSurfaceResultsSourcesReady === true &&
                (event.hasLabelCollisionSource === true ||
                  Number(event.labelCollisionCount ?? 0) > 0 ||
                  event.nativeMapLabelCollisionPreserved === true)
            )
        )
        .map(([transactionId, events]) => ({
          transactionId,
          events,
        }));
      if (reusedTransactionsWithoutFullPublish.length > 0) {
        fail(
          'Cache repeat reused source data without a full source-frame publish for the transaction.',
          {
            reusedTransactionsWithoutFullPublish,
          }
        );
      }
    }
    break;
  }
  case 'market_demand_search_this_area': {
    if (searchResponses.length < 2) {
      fail('Search This Area scenario needs initial and post-pan search responses.', {
        searchResponseCount: searchResponses.length,
      });
      break;
    }
    const searchThisAreaPress = visualReadinessEvents.find(
      (event) => event.event === 'search_this_area_submit_press_up_contract'
    );
    if (!searchThisAreaPress) {
      fail('Search This Area scenario did not emit the press-up contract event.');
    }
    const [initialSearchResponse, postPanSearchResponse] = searchResponses;
    if (
      searchThisAreaPress &&
      postPanSearchResponse &&
      postPanSearchResponse.line <= searchThisAreaPress.line
    ) {
      fail('Search This Area final search response did not happen after the press-up event.', {
        pressLine: searchThisAreaPress.line,
        finalResponseLine: postPanSearchResponse.line,
      });
    }
    if (
      initialSearchResponse &&
      postPanSearchResponse &&
      !responseBoundsChanged(initialSearchResponse, postPanSearchResponse)
    ) {
      fail('Search This Area final search response did not use moved map bounds.', {
        initialSearchResponse,
        postPanSearchResponse,
      });
    }
    if (!lastSearchResponse) {
      fail('Search This Area scenario did not produce a final search response.');
      break;
    }
    if (!includes(lastSearchResponse.responseCollectableMarketKeys, 'region-us-tx-austin')) {
      fail('Search This Area did not preserve Austin collectable scope.', {
        responseCollectableMarketKeys: lastSearchResponse.responseCollectableMarketKeys,
      });
    }
    assertNativeRevealForSearch('Search This Area');
    break;
  }
  default:
    fail('Unknown market-demand scenario.', { scenarioName });
}

const result = {
  schema: 'market-demand-scenario-contracts.v1',
  reportPath,
  scenarioName,
  scenarioRunId,
  passed: failures.length === 0,
  failures,
  warnings,
  evidence,
};

const text = `${JSON.stringify(result, null, 2)}\n`;
if (outputPath) {
  fs.writeFileSync(outputPath, text);
}
process.stdout.write(text);
process.exit(result.passed ? 0 : 1);
