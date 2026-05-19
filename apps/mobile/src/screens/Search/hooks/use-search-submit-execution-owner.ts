import React from 'react';

import type { UseSearchRequestsResult } from '../../../hooks/useSearchRequests';
import type { MapBounds, NaturalSearchRequest, SearchResponse } from '../../../types';
import type { SearchRequestCacheStatus, StructuredSearchRequest } from '../../../services/search';
import { logPerfScenarioSearchRequestLifecycle } from '../../../perf/perf-scenario-attribution';
import {
  getPerfScenarioWorkNow,
  logPerfScenarioWorkSpan,
} from '../../../perf/perf-scenario-work-span';
import { useSystemStatusStore } from '../../../store/systemStatusStore';
import { logger } from '../../../utils';
import type { SearchSessionEventPayload } from '../runtime/controller/search-session-events';
import { createEntityResponseReceivedPayload } from '../runtime/adapters/entity-adapter';
import { createNaturalResponseReceivedPayload } from '../runtime/adapters/natural-adapter';
import { createShortcutResponseReceivedPayload } from '../runtime/adapters/shortcut-adapter';
import type { SegmentValue } from '../constants/search';
import type { SearchRequestRuntimeOwner } from './use-search-request-runtime-owner';
import type { SearchSubmitPresentationIntentKind } from './use-search-submit-entry-owner';
import type {
  SearchSubmitActiveOperationTuple,
  SearchSubmitInitialResultUiState,
  SearchSubmitResponseHandlerOptions,
} from './use-search-submit-response-owner';
import type { ShortcutCoverageSnapshot } from './use-search-submit-structured-helper-owner';

type StartStructuredResponseLifecycleOptions = {
  response: SearchResponse;
  requestId: number;
  runtimeTuple: SearchSubmitActiveOperationTuple;
  append: boolean;
  targetPage: number;
  initialUiState: SearchSubmitInitialResultUiState;
  submittedLabel: string;
  pushToHistory: boolean;
  requestBounds: MapBounds | null;
  replaceResultsInPlace: boolean;
  presentationIntentKind?: Extract<SearchSubmitPresentationIntentKind, 'search_this_area'>;
  responseLogLabel: string;
  responseReceivedPayload: SearchSessionEventPayload;
  submissionContext?: NaturalSearchRequest['submissionContext'];
  beforeHandleResponse?: (response: SearchResponse) => void;
  searchCacheStatus?: SearchRequestCacheStatus | null;
};

type StartNaturalResponseLifecycleOptions = {
  response: SearchResponse;
  requestId: number;
  runtimeTuple: SearchSubmitActiveOperationTuple;
  append: boolean;
  targetPage: number;
  targetTab: SegmentValue;
  submittedLabel?: string;
  submissionContext?: NaturalSearchRequest['submissionContext'];
  requestBounds: MapBounds | null;
  replaceResultsInPlace: boolean;
  presentationIntentKind?: Extract<SearchSubmitPresentationIntentKind, 'search_this_area'>;
  searchCacheStatus?: SearchRequestCacheStatus | null;
};

type StartEntityStructuredResponseLifecycleOptions = {
  response: SearchResponse;
  requestId: number;
  runtimeTuple: SearchSubmitActiveOperationTuple;
  submittedLabel: string;
  submissionContext?: NaturalSearchRequest['submissionContext'];
  requestBounds: MapBounds | null;
};

type StartShortcutStructuredResponseLifecycleOptions = {
  response: SearchResponse;
  requestId: number;
  runtimeTuple: SearchSubmitActiveOperationTuple;
  append: boolean;
  targetPage: number;
  initialUiState: SearchSubmitInitialResultUiState;
  submittedLabel: string;
  requestBounds: MapBounds | null;
  replaceResultsInPlace: boolean;
  presentationIntentKind?: Extract<SearchSubmitPresentationIntentKind, 'search_this_area'>;
  coverageSnapshot?: ShortcutCoverageSnapshot;
  searchCacheStatus?: SearchRequestCacheStatus | null;
};

type StartShortcutInitialResponseLifecycleOptions = {
  response: SearchResponse;
  requestId: number;
  runtimeTuple: SearchSubmitActiveOperationTuple;
  targetTab: SegmentValue;
  submittedLabel: string;
  requestBounds: MapBounds | null;
  replaceResultsInPlace: boolean;
  presentationIntentKind?: Extract<SearchSubmitPresentationIntentKind, 'search_this_area'>;
  coverageSnapshot?: ShortcutCoverageSnapshot;
  searchCacheStatus?: SearchRequestCacheStatus | null;
};

type StartShortcutAppendResponseLifecycleOptions = {
  response: SearchResponse;
  requestId: number;
  runtimeTuple: SearchSubmitActiveOperationTuple;
  targetPage: number;
  targetTab: SegmentValue;
  submittedLabel: string;
};

type ExecuteStructuredSearchAttemptOptions = {
  payload: StructuredSearchRequest;
  requestId: number;
  debugLabel: 'structured' | 'bestHere' | 'pagination';
  timingLabel: 'runSearch:structured' | 'runSearch:bestHere' | 'runSearch:pagination';
  responsePhaseLabel?: string;
  startLifecycle: (
    response: SearchResponse,
    cacheStatus: SearchRequestCacheStatus | null
  ) => boolean;
};

type ExecuteEntityStructuredSearchAttemptOptions = {
  payload: StructuredSearchRequest;
  requestId: number;
  startLifecycle: (
    response: SearchResponse,
    cacheStatus: SearchRequestCacheStatus | null
  ) => boolean;
};

type ExecuteShortcutStructuredSearchAttemptOptions = {
  payload: StructuredSearchRequest;
  requestId: number;
  append: boolean;
  startLifecycle: (
    response: SearchResponse,
    cacheStatus: SearchRequestCacheStatus | null
  ) => boolean;
};

type ExecuteNaturalSearchAttemptOptions = {
  payload: NaturalSearchRequest;
  requestId: number;
  responsePhaseLabel: string;
  startLifecycle: (
    response: SearchResponse,
    cacheStatus: SearchRequestCacheStatus | null
  ) => boolean;
};

type UseSearchSubmitExecutionOwnerArgs = {
  runSearch: UseSearchRequestsResult['runSearch'];
  shouldLogSearchResponsePayload?: boolean;
  shouldLogSearchResponseTimings?: boolean;
  searchResponseTimingMinMs?: number;
  activeSearchRequestRef: SearchRequestRuntimeOwner['activeSearchRequestRef'];
  createHandleSearchResponseRuntimeShadow: SearchRequestRuntimeOwner['createHandleSearchResponseRuntimeShadow'];
  handleSearchResponse: (
    response: SearchResponse,
    options: SearchSubmitResponseHandlerOptions
  ) => void;
  logSearchPhase?: (label: string, options?: { reset?: boolean }) => void;
  logSearchResponseTiming?: (label: string, durationMs: number) => void;
  publishShortcutCoverageForResponse: (
    response: SearchResponse,
    coverageSnapshot: ShortcutCoverageSnapshot
  ) => void;
};

const getPerfNow = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const logSearchResponsePayload = (label: string, response: SearchResponse, enabled: boolean) => {
  if (!enabled) {
    return;
  }
  logger.debug(`${label} payload`, response);
};

const getPayloadSearchRequestId = (
  payload: NaturalSearchRequest | StructuredSearchRequest
): string | null => {
  const record =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as unknown as Record<string, unknown>)
      : null;
  const value = record?.searchRequestId;
  return typeof value === 'string' && value.length > 0 ? value : null;
};

const getResponseSummary = (response: SearchResponse | null): Record<string, unknown> => ({
  responseSearchRequestId: response?.metadata?.searchRequestId ?? null,
  responsePage: response?.metadata?.page ?? null,
  responseDishCount: response?.dishes?.length ?? 0,
  responseRestaurantCount: response?.restaurants?.length ?? 0,
});

const logSearchResponseLifecycle = (payload: Record<string, unknown>): void => {
  logPerfScenarioSearchRequestLifecycle({
    source: 'useSearchSubmitExecutionOwner',
    ...payload,
  });
};

export const useSearchSubmitExecutionOwner = ({
  runSearch,
  shouldLogSearchResponsePayload = false,
  shouldLogSearchResponseTimings = false,
  searchResponseTimingMinMs = 0,
  activeSearchRequestRef,
  createHandleSearchResponseRuntimeShadow,
  handleSearchResponse,
  logSearchPhase = () => {},
  logSearchResponseTiming = () => {},
  publishShortcutCoverageForResponse,
}: UseSearchSubmitExecutionOwnerArgs) => {
  const startStructuredResponseLifecycle = React.useCallback(
    ({
      response,
      requestId,
      runtimeTuple,
      append,
      targetPage,
      initialUiState,
      submittedLabel,
      pushToHistory,
      requestBounds,
      replaceResultsInPlace,
      presentationIntentKind,
      responseLogLabel,
      responseReceivedPayload,
      submissionContext,
      beforeHandleResponse,
      searchCacheStatus,
    }: StartStructuredResponseLifecycleOptions) => {
      logSearchResponsePayload(responseLogLabel, response, shouldLogSearchResponsePayload);
      beforeHandleResponse?.(response);
      handleSearchResponse(response, {
        append,
        targetPage,
        initialUiState,
        submittedLabel,
        pushToHistory,
        submissionContext,
        requestBounds,
        replaceResultsInPlace,
        presentationIntentKind,
        responseReceivedPayload,
        responseCacheStatus: searchCacheStatus ?? null,
        runtimeShadow: createHandleSearchResponseRuntimeShadow(runtimeTuple),
      });
      return requestId === activeSearchRequestRef.current;
    },
    [
      activeSearchRequestRef,
      createHandleSearchResponseRuntimeShadow,
      handleSearchResponse,
      shouldLogSearchResponsePayload,
    ]
  );

  const startNaturalResponseLifecycle = React.useCallback(
    ({
      response,
      requestId,
      runtimeTuple,
      append,
      targetPage,
      targetTab,
      submittedLabel,
      submissionContext,
      requestBounds,
      replaceResultsInPlace,
      presentationIntentKind,
      searchCacheStatus,
    }: StartNaturalResponseLifecycleOptions) => {
      logSearchResponsePayload('Search response', response, shouldLogSearchResponsePayload);
      handleSearchResponse(response, {
        append,
        targetPage,
        initialUiState: {
          mode: 'natural',
          targetTab,
        },
        submittedLabel,
        pushToHistory: !append,
        submissionContext,
        requestBounds,
        replaceResultsInPlace,
        presentationIntentKind,
        responseCacheStatus: searchCacheStatus ?? null,
        responseReceivedPayload: createNaturalResponseReceivedPayload(response, targetPage),
        runtimeShadow: createHandleSearchResponseRuntimeShadow(runtimeTuple),
      });
      return requestId === activeSearchRequestRef.current;
    },
    [
      activeSearchRequestRef,
      createHandleSearchResponseRuntimeShadow,
      handleSearchResponse,
      shouldLogSearchResponsePayload,
    ]
  );

  const startEntityStructuredResponseLifecycle = React.useCallback(
    ({
      response,
      requestId,
      runtimeTuple,
      submittedLabel,
      submissionContext,
      requestBounds,
    }: StartEntityStructuredResponseLifecycleOptions) =>
      startStructuredResponseLifecycle({
        response,
        requestId,
        runtimeTuple,
        append: false,
        targetPage: 1,
        initialUiState: {
          mode: 'natural',
          targetTab: 'restaurants',
        },
        submittedLabel,
        pushToHistory: true,
        submissionContext,
        requestBounds,
        replaceResultsInPlace: false,
        responseLogLabel: 'Structured restaurant search response',
        responseReceivedPayload: createEntityResponseReceivedPayload(response),
      }),
    [startStructuredResponseLifecycle]
  );

  const startShortcutStructuredResponseLifecycle = React.useCallback(
    ({
      response,
      requestId,
      runtimeTuple,
      append,
      targetPage,
      initialUiState,
      submittedLabel,
      requestBounds,
      replaceResultsInPlace,
      presentationIntentKind,
      coverageSnapshot,
      searchCacheStatus,
    }: StartShortcutStructuredResponseLifecycleOptions) =>
      startStructuredResponseLifecycle({
        response,
        requestId,
        runtimeTuple,
        append,
        targetPage,
        initialUiState,
        submittedLabel,
        pushToHistory: false,
        requestBounds,
        replaceResultsInPlace,
        presentationIntentKind,
        searchCacheStatus,
        responseLogLabel: append ? 'Structured search pagination' : 'Structured search response',
        responseReceivedPayload: createShortcutResponseReceivedPayload(response),
        beforeHandleResponse:
          coverageSnapshot == null
            ? undefined
            : (nextResponse) => {
                publishShortcutCoverageForResponse(nextResponse, coverageSnapshot);
              },
      }),
    [publishShortcutCoverageForResponse, startStructuredResponseLifecycle]
  );

  const startShortcutInitialResponseLifecycle = React.useCallback(
    ({
      response,
      requestId,
      runtimeTuple,
      targetTab,
      submittedLabel,
      requestBounds,
      replaceResultsInPlace,
      presentationIntentKind,
      coverageSnapshot,
      searchCacheStatus,
    }: StartShortcutInitialResponseLifecycleOptions) =>
      startShortcutStructuredResponseLifecycle({
        response,
        requestId,
        runtimeTuple,
        append: false,
        targetPage: 1,
        initialUiState: {
          mode: 'shortcut',
          targetTab,
        },
        submittedLabel,
        requestBounds,
        replaceResultsInPlace,
        presentationIntentKind,
        coverageSnapshot,
        searchCacheStatus,
      }),
    [startShortcutStructuredResponseLifecycle]
  );

  const startShortcutAppendResponseLifecycle = React.useCallback(
    ({
      response,
      requestId,
      runtimeTuple,
      targetPage,
      targetTab,
      submittedLabel,
    }: StartShortcutAppendResponseLifecycleOptions) =>
      startShortcutStructuredResponseLifecycle({
        response,
        requestId,
        runtimeTuple,
        append: true,
        targetPage,
        initialUiState: {
          mode: 'shortcut',
          targetTab,
        },
        submittedLabel,
        requestBounds: null,
        replaceResultsInPlace: false,
      }),
    [startShortcutStructuredResponseLifecycle]
  );

  const executeStructuredSearchRequest = React.useCallback(
    async (params: {
      payload: StructuredSearchRequest;
      debugLabel: 'structured' | 'bestHere' | 'pagination';
      timingLabel: 'runSearch:structured' | 'runSearch:bestHere' | 'runSearch:pagination';
      onCacheStatus?: (status: SearchRequestCacheStatus) => void;
    }) => {
      const requestStart = shouldLogSearchResponseTimings ? getPerfNow() : 0;
      const response = await runSearch({
        kind: 'structured',
        payload: params.payload,
        debugParse: shouldLogSearchResponseTimings,
        debugLabel: params.debugLabel,
        debugMinMs: searchResponseTimingMinMs,
        onCacheStatus: params.onCacheStatus,
      });
      if (shouldLogSearchResponseTimings) {
        logSearchResponseTiming(params.timingLabel, getPerfNow() - requestStart);
      }
      return response;
    },
    [logSearchResponseTiming, runSearch, searchResponseTimingMinMs, shouldLogSearchResponseTimings]
  );

  const executeStructuredSearchAttempt = React.useCallback(
    async ({
      payload,
      requestId,
      debugLabel,
      timingLabel,
      responsePhaseLabel,
      startLifecycle,
    }: ExecuteStructuredSearchAttemptOptions) => {
      if (requestId !== activeSearchRequestRef.current) {
        logSearchResponseLifecycle({
          phase: 'response_lifecycle_skipped',
          reason: 'stale_before_run_search',
          kind: 'structured',
          requestId,
          activeRequestId: activeSearchRequestRef.current,
          debugLabel,
          payloadSearchRequestId: getPayloadSearchRequestId(payload),
        });
        return false;
      }
      logSearchResponseLifecycle({
        phase: 'run_search_enter',
        kind: 'structured',
        requestId,
        debugLabel,
        timingLabel,
        payloadSearchRequestId: getPayloadSearchRequestId(payload),
      });
      let searchCacheStatus: SearchRequestCacheStatus | null = null;
      const response = await executeStructuredSearchRequest({
        payload,
        debugLabel,
        timingLabel,
        onCacheStatus: (status) => {
          searchCacheStatus = status;
        },
      });
      if (responsePhaseLabel) {
        logSearchPhase(responsePhaseLabel);
      }
      if (!response) {
        logSearchResponseLifecycle({
          phase: 'response_lifecycle_skipped',
          reason: 'null_response',
          kind: 'structured',
          requestId,
          activeRequestId: activeSearchRequestRef.current,
          debugLabel,
          payloadSearchRequestId: getPayloadSearchRequestId(payload),
        });
        return false;
      }
      logSearchResponseLifecycle({
        phase: 'run_search_resolved',
        kind: 'structured',
        requestId,
        activeRequestId: activeSearchRequestRef.current,
        debugLabel,
        payloadSearchRequestId: getPayloadSearchRequestId(payload),
        ...getResponseSummary(response),
      });
      if (requestId !== activeSearchRequestRef.current) {
        logSearchResponseLifecycle({
          phase: 'response_lifecycle_skipped',
          reason: 'stale_after_response',
          kind: 'structured',
          requestId,
          activeRequestId: activeSearchRequestRef.current,
          debugLabel,
          payloadSearchRequestId: getPayloadSearchRequestId(payload),
          ...getResponseSummary(response),
        });
        return false;
      }
      logSearchResponseLifecycle({
        phase: 'response_lifecycle_start_requested',
        kind: 'structured',
        requestId,
        debugLabel,
        payloadSearchRequestId: getPayloadSearchRequestId(payload),
        ...getResponseSummary(response),
      });
      const lifecycleStartedAtMs = getPerfScenarioWorkNow();
      const didStartLifecycle = startLifecycle(response, searchCacheStatus);
      logPerfScenarioWorkSpan({
        owner: 'search_submit_execution_start_response_lifecycle',
        path: debugLabel,
        startedAtMs: lifecycleStartedAtMs,
        details: {
          requestId,
          activeRequestId: activeSearchRequestRef.current,
          didStartLifecycle,
          ...getResponseSummary(response),
        },
      });
      logSearchResponseLifecycle({
        phase: didStartLifecycle ? 'response_lifecycle_started' : 'response_lifecycle_skipped',
        reason: didStartLifecycle ? null : 'start_lifecycle_returned_false',
        kind: 'structured',
        requestId,
        activeRequestId: activeSearchRequestRef.current,
        debugLabel,
        payloadSearchRequestId: getPayloadSearchRequestId(payload),
        ...getResponseSummary(response),
      });
      return didStartLifecycle;
    },
    [activeSearchRequestRef, executeStructuredSearchRequest, logSearchPhase]
  );

  const executeEntityStructuredSearchAttempt = React.useCallback(
    ({ payload, requestId, startLifecycle }: ExecuteEntityStructuredSearchAttemptOptions) =>
      executeStructuredSearchAttempt({
        payload,
        requestId,
        debugLabel: 'structured',
        timingLabel: 'runSearch:structured',
        responsePhaseLabel: 'runRestaurantEntitySearch:response',
        startLifecycle,
      }),
    [executeStructuredSearchAttempt]
  );

  const executeShortcutStructuredSearchAttempt = React.useCallback(
    ({
      payload,
      requestId,
      append,
      startLifecycle,
    }: ExecuteShortcutStructuredSearchAttemptOptions) =>
      executeStructuredSearchAttempt({
        payload,
        requestId,
        debugLabel: append ? 'pagination' : 'bestHere',
        timingLabel: append ? 'runSearch:pagination' : 'runSearch:bestHere',
        responsePhaseLabel: append ? undefined : 'runBestHere:response',
        startLifecycle,
      }),
    [executeStructuredSearchAttempt]
  );

  const executeNaturalSearchAttempt = React.useCallback(
    async ({
      payload,
      requestId,
      responsePhaseLabel,
      startLifecycle,
    }: ExecuteNaturalSearchAttemptOptions) => {
      if (requestId !== activeSearchRequestRef.current) {
        logSearchResponseLifecycle({
          phase: 'response_lifecycle_skipped',
          reason: 'stale_before_run_search',
          kind: 'natural',
          requestId,
          activeRequestId: activeSearchRequestRef.current,
          payloadSearchRequestId: getPayloadSearchRequestId(payload),
        });
        return false;
      }
      logSearchResponseLifecycle({
        phase: 'run_search_enter',
        kind: 'natural',
        requestId,
        timingLabel: 'runSearch:natural',
        payloadSearchRequestId: getPayloadSearchRequestId(payload),
      });
      const requestStart = shouldLogSearchResponseTimings ? getPerfNow() : 0;
      let searchCacheStatus: SearchRequestCacheStatus | null = null;
      const response = await runSearch({
        kind: 'natural',
        payload,
        debugParse: shouldLogSearchResponseTimings,
        debugLabel: 'natural',
        debugMinMs: searchResponseTimingMinMs,
        onCacheStatus: (status) => {
          searchCacheStatus = status;
        },
      });
      if (shouldLogSearchResponseTimings) {
        logSearchResponseTiming('runSearch:natural', getPerfNow() - requestStart);
      }
      logSearchPhase(responsePhaseLabel);
      if (!response) {
        logSearchResponseLifecycle({
          phase: 'response_lifecycle_skipped',
          reason: 'null_response',
          kind: 'natural',
          requestId,
          activeRequestId: activeSearchRequestRef.current,
          payloadSearchRequestId: getPayloadSearchRequestId(payload),
        });
        return false;
      }
      logSearchResponseLifecycle({
        phase: 'run_search_resolved',
        kind: 'natural',
        requestId,
        activeRequestId: activeSearchRequestRef.current,
        payloadSearchRequestId: getPayloadSearchRequestId(payload),
        ...getResponseSummary(response),
      });
      if (requestId !== activeSearchRequestRef.current) {
        logSearchResponseLifecycle({
          phase: 'response_lifecycle_skipped',
          reason: 'stale_after_response',
          kind: 'natural',
          requestId,
          activeRequestId: activeSearchRequestRef.current,
          payloadSearchRequestId: getPayloadSearchRequestId(payload),
          ...getResponseSummary(response),
        });
        return false;
      }
      useSystemStatusStore.getState().clearServiceIssue('search');
      logSearchResponseLifecycle({
        phase: 'response_lifecycle_start_requested',
        kind: 'natural',
        requestId,
        payloadSearchRequestId: getPayloadSearchRequestId(payload),
        ...getResponseSummary(response),
      });
      const lifecycleStartedAtMs = getPerfScenarioWorkNow();
      const didStartLifecycle = startLifecycle(response, searchCacheStatus);
      logPerfScenarioWorkSpan({
        owner: 'search_submit_execution_start_response_lifecycle',
        path: 'natural',
        startedAtMs: lifecycleStartedAtMs,
        details: {
          requestId,
          activeRequestId: activeSearchRequestRef.current,
          didStartLifecycle,
          ...getResponseSummary(response),
        },
      });
      logSearchResponseLifecycle({
        phase: didStartLifecycle ? 'response_lifecycle_started' : 'response_lifecycle_skipped',
        reason: didStartLifecycle ? null : 'start_lifecycle_returned_false',
        kind: 'natural',
        requestId,
        activeRequestId: activeSearchRequestRef.current,
        payloadSearchRequestId: getPayloadSearchRequestId(payload),
        ...getResponseSummary(response),
      });
      return didStartLifecycle;
    },
    [
      activeSearchRequestRef,
      logSearchPhase,
      logSearchResponseTiming,
      runSearch,
      searchResponseTimingMinMs,
      shouldLogSearchResponseTimings,
    ]
  );

  return React.useMemo(
    () => ({
      startNaturalResponseLifecycle,
      startEntityStructuredResponseLifecycle,
      startShortcutInitialResponseLifecycle,
      startShortcutAppendResponseLifecycle,
      executeEntityStructuredSearchAttempt,
      executeShortcutStructuredSearchAttempt,
      executeNaturalSearchAttempt,
    }),
    [
      executeEntityStructuredSearchAttempt,
      executeNaturalSearchAttempt,
      executeShortcutStructuredSearchAttempt,
      startEntityStructuredResponseLifecycle,
      startNaturalResponseLifecycle,
      startShortcutAppendResponseLifecycle,
      startShortcutInitialResponseLifecycle,
    ]
  );
};
