import React from 'react';

import type { UseSearchRequestsResult } from '../../../hooks/useSearchRequests';
import type { MapBounds, NaturalSearchRequest, SearchResponse } from '../../../types';
import type { StructuredSearchRequest } from '../../../services/search';
import { useSystemStatusStore } from '../../../store/systemStatusStore';
import { logger } from '../../../utils';
import type { SearchSessionEventPayload } from '../runtime/controller/search-session-events';
import { createEntityResponseReceivedPayload } from '../runtime/adapters/entity-adapter';
import { createNaturalResponseReceivedPayload } from '../runtime/adapters/natural-adapter';
import { createShortcutResponseReceivedPayload } from '../runtime/adapters/shortcut-adapter';
import type { SegmentValue } from '../constants/search';
import type { SearchRequestRuntimeOwner } from './use-search-request-runtime-owner';
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
  fallbackSearchRequestId?: string;
  submittedLabel: string;
  pushToHistory: boolean;
  requestBounds: MapBounds | null;
  replaceResultsInPlace: boolean;
  responseLogLabel: string;
  responseReceivedPayload: SearchSessionEventPayload;
  submissionContext?: NaturalSearchRequest['submissionContext'];
  beforeHandleResponse?: (response: SearchResponse) => void;
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
  fallbackSearchRequestId?: string;
  submittedLabel: string;
  requestBounds: MapBounds | null;
  replaceResultsInPlace: boolean;
  coverageSnapshot?: ShortcutCoverageSnapshot;
};

type StartShortcutInitialResponseLifecycleOptions = {
  response: SearchResponse;
  requestId: number;
  runtimeTuple: SearchSubmitActiveOperationTuple;
  targetTab: SegmentValue;
  submittedLabel: string;
  requestBounds: MapBounds | null;
  replaceResultsInPlace: boolean;
  coverageSnapshot?: ShortcutCoverageSnapshot;
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
  startLifecycle: (response: SearchResponse) => boolean;
};

type ExecuteEntityStructuredSearchAttemptOptions = {
  payload: StructuredSearchRequest;
  requestId: number;
  startLifecycle: (response: SearchResponse) => boolean;
};

type ExecuteShortcutStructuredSearchAttemptOptions = {
  payload: StructuredSearchRequest;
  requestId: number;
  append: boolean;
  startLifecycle: (response: SearchResponse) => boolean;
};

type ExecuteNaturalSearchAttemptOptions = {
  payload: NaturalSearchRequest;
  requestId: number;
  responsePhaseLabel: string;
  startLifecycle: (response: SearchResponse) => boolean;
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
      fallbackSearchRequestId,
      submittedLabel,
      pushToHistory,
      requestBounds,
      replaceResultsInPlace,
      responseLogLabel,
      responseReceivedPayload,
      submissionContext,
      beforeHandleResponse,
    }: StartStructuredResponseLifecycleOptions) => {
      logSearchResponsePayload(responseLogLabel, response, shouldLogSearchResponsePayload);
      beforeHandleResponse?.(response);
      handleSearchResponse(response, {
        append,
        targetPage,
        initialUiState,
        fallbackSearchRequestId,
        submittedLabel,
        pushToHistory,
        submissionContext,
        requestBounds,
        replaceResultsInPlace,
        responseReceivedPayload,
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
    }: StartNaturalResponseLifecycleOptions) => {
      logSearchResponsePayload('Search response', response, shouldLogSearchResponsePayload);
      handleSearchResponse(response, {
        append,
        targetPage,
        initialUiState: {
          mode: 'natural',
          targetTab,
        },
        fallbackSearchRequestId: append ? undefined : `natural:${requestId}`,
        submittedLabel,
        pushToHistory: !append,
        submissionContext,
        requestBounds,
        replaceResultsInPlace,
        responseReceivedPayload: createNaturalResponseReceivedPayload(response, targetPage),
        runtimeShadow: createHandleSearchResponseRuntimeShadow(runtimeTuple),
      });
      return true;
    },
    [createHandleSearchResponseRuntimeShadow, handleSearchResponse, shouldLogSearchResponsePayload]
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
        fallbackSearchRequestId: `restaurant-entity:${requestId}`,
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
      fallbackSearchRequestId,
      submittedLabel,
      requestBounds,
      replaceResultsInPlace,
      coverageSnapshot,
    }: StartShortcutStructuredResponseLifecycleOptions) =>
      startStructuredResponseLifecycle({
        response,
        requestId,
        runtimeTuple,
        append,
        targetPage,
        initialUiState,
        fallbackSearchRequestId,
        submittedLabel,
        pushToHistory: false,
        requestBounds,
        replaceResultsInPlace,
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
      coverageSnapshot,
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
        fallbackSearchRequestId: `shortcut:${requestId}`,
        submittedLabel,
        requestBounds,
        replaceResultsInPlace,
        coverageSnapshot,
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
        fallbackSearchRequestId: undefined,
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
    }) => {
      const requestStart = shouldLogSearchResponseTimings ? getPerfNow() : 0;
      const response = await runSearch({
        kind: 'structured',
        payload: params.payload,
        debugParse: shouldLogSearchResponseTimings,
        debugLabel: params.debugLabel,
        debugMinMs: searchResponseTimingMinMs,
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
      const response = await executeStructuredSearchRequest({
        payload,
        debugLabel,
        timingLabel,
      });
      if (responsePhaseLabel) {
        logSearchPhase(responsePhaseLabel);
      }
      if (!response || requestId !== activeSearchRequestRef.current) {
        return false;
      }
      return startLifecycle(response);
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
      const requestStart = shouldLogSearchResponseTimings ? getPerfNow() : 0;
      const response = await runSearch({
        kind: 'natural',
        payload,
        debugParse: shouldLogSearchResponseTimings,
        debugLabel: 'natural',
        debugMinMs: searchResponseTimingMinMs,
      });
      if (shouldLogSearchResponseTimings) {
        logSearchResponseTiming('runSearch:natural', getPerfNow() - requestStart);
      }
      logSearchPhase(responsePhaseLabel);
      if (!response || requestId !== activeSearchRequestRef.current) {
        return false;
      }
      useSystemStatusStore.getState().clearServiceIssue('search');
      return startLifecycle(response);
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
