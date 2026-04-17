import React from 'react';

import type { NaturalSearchRequest, SearchResponse } from '../../../types';
import type { StructuredSearchRequest } from '../../../services/search';
import { logger } from '../../../utils';
import type { SegmentValue } from '../constants/search';
import type { SearchRequestRuntimeOwner } from './use-search-request-runtime-owner';
import { resolveLoadMoreRequestErrorMessage } from './search-submit-runtime-utils';
import type {
  StructuredAppendAttemptConfig,
  StructuredInitialAttemptConfig,
} from './use-search-submit-entry-owner';
import type { StructuredSearchFilters } from './use-search-request-preparation-owner';
import type { SearchSubmitActiveOperationTuple } from './use-search-submit-response-owner';
import type { ShortcutCoverageSnapshot } from './use-search-submit-structured-helper-owner';

type RunRestaurantEntitySearchParams = {
  restaurantId: string;
  restaurantName: string;
  submissionSource: NaturalSearchRequest['submissionSource'];
  typedPrefix?: string;
  preserveSheetState?: boolean;
};

type RunBestHereOptions = {
  preserveSheetState?: boolean;
  replaceResultsInPlace?: boolean;
  transitionFromDockedPolls?: boolean;
  filters?: StructuredSearchFilters;
  forceFreshBounds?: boolean;
};

type UseSearchStructuredSubmitOwnerArgs = {
  currentPage: number;
  canLoadMore: boolean;
  hasResults: boolean;
  isLoadingMore: boolean;
  isPaginationExhausted: boolean;
  preferredActiveTab: SegmentValue;
  submittedQuery: string;
  isSearchRequestInFlightRef: SearchRequestRuntimeOwner['isSearchRequestInFlightRef'];
  runManagedRequestAttempt: SearchRequestRuntimeOwner['runManagedRequestAttempt'];
  onPresentationIntentAbort?: () => void;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  logSearchPhase?: (label: string, options?: { reset?: boolean }) => void;
  resetMapMoveFlag: () => void;
  createRestaurantEntityInitialAttemptConfig: (params: {
    restaurantId: string;
    restaurantName: string;
    preserveSheetState: boolean;
  }) => StructuredInitialAttemptConfig;
  createShortcutStructuredInitialAttemptConfig: (params: {
    targetTab: SegmentValue;
    submittedLabel: string;
    preserveSheetState: boolean;
    transitionFromDockedPolls: boolean;
    replaceResultsInPlace: boolean;
  }) => StructuredInitialAttemptConfig;
  createShortcutStructuredAppendAttemptConfig: (params: {
    targetTab: SegmentValue;
    submittedQuery: string;
    targetPage: number;
  }) => StructuredAppendAttemptConfig;
  prepareSearchRequestForegroundUi: (
    options: StructuredInitialAttemptConfig['foregroundUi']
  ) => void;
  prepareStructuredInitialRequestPayload: (params: {
    tuple: SearchSubmitActiveOperationTuple;
    logLabel: string;
    loadingMoreLogLabel?: string;
    filters?: StructuredSearchFilters;
    forceFreshBounds: boolean;
  }) => Promise<StructuredSearchRequest | null>;
  prepareStructuredAppendRequestPayload: (params: {
    tuple: SearchSubmitActiveOperationTuple;
    targetPage: number;
  }) => Promise<StructuredSearchRequest | null>;
  applyRestaurantEntityStructuredRequest: (
    payload: StructuredSearchRequest,
    params: {
      restaurantId: string;
      restaurantName: string;
      submissionSource: NaturalSearchRequest['submissionSource'];
      typedPrefix?: string;
    }
  ) => NaturalSearchRequest['submissionContext'];
  primeShortcutStructuredRequest: (payload: StructuredSearchRequest) => ShortcutCoverageSnapshot;
  applyShortcutStructuredAppendRequestState: (payload: StructuredSearchRequest) => void;
  executeEntityStructuredSearchAttempt: (params: {
    payload: StructuredSearchRequest;
    requestId: number;
    startLifecycle: (response: SearchResponse) => boolean;
  }) => Promise<boolean>;
  executeShortcutStructuredSearchAttempt: (params: {
    payload: StructuredSearchRequest;
    requestId: number;
    append: boolean;
    startLifecycle: (response: SearchResponse) => boolean;
  }) => Promise<boolean>;
  startEntityStructuredResponseLifecycle: (params: {
    response: SearchResponse;
    requestId: number;
    runtimeTuple: SearchSubmitActiveOperationTuple;
    submittedLabel: string;
    submissionContext?: NaturalSearchRequest['submissionContext'];
    requestBounds: import('../../../types').MapBounds | null;
  }) => boolean;
  startShortcutInitialResponseLifecycle: (params: {
    response: SearchResponse;
    requestId: number;
    runtimeTuple: SearchSubmitActiveOperationTuple;
    targetTab: SegmentValue;
    submittedLabel: string;
    requestBounds: import('../../../types').MapBounds | null;
    replaceResultsInPlace: boolean;
    coverageSnapshot?: ShortcutCoverageSnapshot;
  }) => boolean;
  startShortcutAppendResponseLifecycle: (params: {
    response: SearchResponse;
    requestId: number;
    runtimeTuple: SearchSubmitActiveOperationTuple;
    targetPage: number;
    targetTab: SegmentValue;
    submittedLabel: string;
  }) => boolean;
};

export const useSearchStructuredSubmitOwner = ({
  currentPage,
  canLoadMore,
  hasResults,
  isLoadingMore,
  isPaginationExhausted,
  preferredActiveTab,
  submittedQuery,
  isSearchRequestInFlightRef,
  runManagedRequestAttempt,
  onPresentationIntentAbort,
  setError,
  logSearchPhase = () => {},
  resetMapMoveFlag,
  createRestaurantEntityInitialAttemptConfig,
  createShortcutStructuredInitialAttemptConfig,
  createShortcutStructuredAppendAttemptConfig,
  prepareSearchRequestForegroundUi,
  prepareStructuredInitialRequestPayload,
  prepareStructuredAppendRequestPayload,
  applyRestaurantEntityStructuredRequest,
  primeShortcutStructuredRequest,
  applyShortcutStructuredAppendRequestState,
  executeEntityStructuredSearchAttempt,
  executeShortcutStructuredSearchAttempt,
  startEntityStructuredResponseLifecycle,
  startShortcutInitialResponseLifecycle,
  startShortcutAppendResponseLifecycle,
}: UseSearchStructuredSubmitOwnerArgs) => {
  const executeRestaurantEntityInitialAttempt = React.useCallback(
    async ({
      requestId,
      tuple,
      restaurantId,
      restaurantName,
      submissionSource,
      typedPrefix,
    }: {
      requestId: number;
      tuple: SearchSubmitActiveOperationTuple;
      restaurantId: string;
      restaurantName: string;
      submissionSource: NaturalSearchRequest['submissionSource'];
      typedPrefix?: string;
    }) => {
      const payload = await prepareStructuredInitialRequestPayload({
        tuple,
        logLabel: 'runRestaurantEntitySearch:loading-state',
        filters: {
          openNow: false,
          priceLevels: [],
          minimumVotes: 0,
        },
        forceFreshBounds: false,
      });
      if (!payload) {
        return false;
      }
      const submissionContext = applyRestaurantEntityStructuredRequest(payload, {
        restaurantId,
        restaurantName,
        submissionSource,
        typedPrefix,
      });
      logSearchPhase('runRestaurantEntitySearch:runSearch');
      return executeEntityStructuredSearchAttempt({
        payload,
        requestId,
        startLifecycle: (response) =>
          startEntityStructuredResponseLifecycle({
            response,
            requestId,
            runtimeTuple: tuple,
            submittedLabel: restaurantName,
            submissionContext,
            requestBounds: payload.bounds ?? null,
          }),
      });
    },
    [
      applyRestaurantEntityStructuredRequest,
      executeEntityStructuredSearchAttempt,
      logSearchPhase,
      prepareStructuredInitialRequestPayload,
      startEntityStructuredResponseLifecycle,
    ]
  );

  const executeShortcutInitialAttempt = React.useCallback(
    async ({
      requestId,
      tuple,
      targetTab,
      submittedLabel,
      filters,
      forceFreshBounds,
      replaceResultsInPlace,
    }: {
      requestId: number;
      tuple: SearchSubmitActiveOperationTuple;
      targetTab: SegmentValue;
      submittedLabel: string;
      filters?: StructuredSearchFilters;
      forceFreshBounds: boolean;
      replaceResultsInPlace: boolean;
    }) => {
      const payload = await prepareStructuredInitialRequestPayload({
        tuple,
        logLabel: 'runBestHere:loading-state',
        loadingMoreLogLabel: 'runBestHere:loading-more',
        filters,
        forceFreshBounds,
      });
      if (!payload) {
        return false;
      }
      const shortcutCoverageSnapshot = primeShortcutStructuredRequest(payload);
      logSearchPhase('runBestHere:runSearch');
      return executeShortcutStructuredSearchAttempt({
        payload,
        requestId,
        append: false,
        startLifecycle: (response) =>
          startShortcutInitialResponseLifecycle({
            response,
            requestId,
            runtimeTuple: tuple,
            targetTab,
            submittedLabel,
            requestBounds: payload.bounds ?? null,
            replaceResultsInPlace,
            coverageSnapshot: shortcutCoverageSnapshot,
          }),
      });
    },
    [
      executeShortcutStructuredSearchAttempt,
      logSearchPhase,
      prepareStructuredInitialRequestPayload,
      primeShortcutStructuredRequest,
      startShortcutInitialResponseLifecycle,
    ]
  );

  const executeShortcutAppendAttempt = React.useCallback(
    async ({
      requestId,
      tuple,
      targetPage,
      targetTab,
      submittedLabel,
    }: {
      requestId: number;
      tuple: SearchSubmitActiveOperationTuple;
      targetPage: number;
      targetTab: SegmentValue;
      submittedLabel: string;
    }) => {
      const payload = await prepareStructuredAppendRequestPayload({
        tuple,
        targetPage,
      });
      if (!payload) {
        return false;
      }
      applyShortcutStructuredAppendRequestState(payload);
      return executeShortcutStructuredSearchAttempt({
        payload,
        requestId,
        append: true,
        startLifecycle: (response) =>
          startShortcutAppendResponseLifecycle({
            response,
            requestId,
            runtimeTuple: tuple,
            targetPage,
            targetTab,
            submittedLabel,
          }),
      });
    },
    [
      applyShortcutStructuredAppendRequestState,
      executeShortcutStructuredSearchAttempt,
      prepareStructuredAppendRequestPayload,
      startShortcutAppendResponseLifecycle,
    ]
  );

  const runRestaurantEntitySearch = React.useCallback(
    async (params: RunRestaurantEntitySearchParams) => {
      logSearchPhase('runRestaurantEntitySearch:start', { reset: true });
      const trimmedName = params.restaurantName.trim();
      if (!trimmedName) {
        return;
      }
      const preserveSheetState = Boolean(params.preserveSheetState);
      const initialAttemptConfig = createRestaurantEntityInitialAttemptConfig({
        restaurantId: params.restaurantId,
        restaurantName: trimmedName,
        preserveSheetState,
      });
      resetMapMoveFlag();
      prepareSearchRequestForegroundUi(initialAttemptConfig.foregroundUi);
      await runManagedRequestAttempt({
        mode: 'entity',
        submitPayload: initialAttemptConfig.submitPayload,
        finalizeReason: initialAttemptConfig.finalizeReason,
        shouldAbortPresentationIntent: true,
        abortPresentationIntent: onPresentationIntentAbort,
        setError,
        onError: (err) => {
          logger.error(initialAttemptConfig.errorLogLabel, {
            message: err instanceof Error ? err.message : 'unknown error',
          });
        },
        resolveFailure: () => ({
          idleStatePatch: {
            isMapActivationDeferred: false,
          },
          uiErrorMessage: null,
        }),
        executeAttempt: async ({ requestId, tuple }) =>
          executeRestaurantEntityInitialAttempt({
            requestId,
            tuple,
            restaurantId: params.restaurantId,
            restaurantName: trimmedName,
            submissionSource: params.submissionSource,
            typedPrefix: params.typedPrefix,
          }),
      });
    },
    [
      createRestaurantEntityInitialAttemptConfig,
      executeRestaurantEntityInitialAttempt,
      logSearchPhase,
      onPresentationIntentAbort,
      prepareSearchRequestForegroundUi,
      resetMapMoveFlag,
      runManagedRequestAttempt,
      setError,
    ]
  );

  const submitViewportShortcut = React.useCallback(
    async (targetTab: SegmentValue, submittedLabel: string, options?: RunBestHereOptions) => {
      logSearchPhase('runBestHere:start', { reset: true });
      const preserveSheetState = Boolean(options?.preserveSheetState);
      const transitionFromDockedPolls =
        !preserveSheetState && Boolean(options?.transitionFromDockedPolls);
      const shouldForceFreshBounds = Boolean(options?.forceFreshBounds);
      const shouldReplaceResultsInPlace = Boolean(options?.replaceResultsInPlace);
      const initialAttemptConfig = createShortcutStructuredInitialAttemptConfig({
        targetTab,
        submittedLabel,
        preserveSheetState,
        transitionFromDockedPolls,
        replaceResultsInPlace: shouldReplaceResultsInPlace,
      });

      resetMapMoveFlag();
      prepareSearchRequestForegroundUi(initialAttemptConfig.foregroundUi);
      await runManagedRequestAttempt({
        mode: 'shortcut',
        submitPayload: initialAttemptConfig.submitPayload,
        finalizeReason: initialAttemptConfig.finalizeReason,
        shouldAbortPresentationIntent: true,
        abortPresentationIntent: onPresentationIntentAbort,
        setError,
        onError: (err) => {
          logger.error(initialAttemptConfig.errorLogLabel, {
            message: err instanceof Error ? err.message : 'unknown error',
          });
        },
        resolveFailure: () => ({
          idleStatePatch: {
            isMapActivationDeferred: false,
          },
          uiErrorMessage: null,
        }),
        executeAttempt: async ({ requestId, tuple }) =>
          executeShortcutInitialAttempt({
            requestId,
            tuple,
            targetTab,
            submittedLabel,
            filters: options?.filters,
            forceFreshBounds: shouldForceFreshBounds,
            replaceResultsInPlace: shouldReplaceResultsInPlace,
          }),
      });
    },
    [
      createShortcutStructuredInitialAttemptConfig,
      executeShortcutInitialAttempt,
      logSearchPhase,
      onPresentationIntentAbort,
      prepareSearchRequestForegroundUi,
      resetMapMoveFlag,
      runManagedRequestAttempt,
      setError,
    ]
  );

  const loadMoreShortcutResults = React.useCallback(() => {
    if (
      isSearchRequestInFlightRef.current ||
      isLoadingMore ||
      !hasResults ||
      !canLoadMore ||
      isPaginationExhausted
    ) {
      return;
    }

    const nextPage = currentPage + 1;
    const appendAttemptConfig = createShortcutStructuredAppendAttemptConfig({
      targetTab: preferredActiveTab,
      submittedQuery,
      targetPage: nextPage,
    });
    void runManagedRequestAttempt({
      mode: 'shortcut',
      submitPayload: appendAttemptConfig.submitPayload,
      append: true,
      targetPage: nextPage,
      finalizeReason: 'append_finalized_without_response_lifecycle',
      setError,
      onError: (err) => {
        logger.error(appendAttemptConfig.errorLogLabel, {
          message: err instanceof Error ? err.message : 'unknown error',
        });
      },
      resolveFailure: (err) => ({
        uiErrorMessage: resolveLoadMoreRequestErrorMessage(err),
      }),
      executeAttempt: async ({ requestId, tuple }) =>
        executeShortcutAppendAttempt({
          requestId,
          tuple,
          targetPage: nextPage,
          targetTab: preferredActiveTab,
          submittedLabel: appendAttemptConfig.submittedLabel,
        }),
    });
  }, [
    canLoadMore,
    createShortcutStructuredAppendAttemptConfig,
    currentPage,
    executeShortcutAppendAttempt,
    hasResults,
    isLoadingMore,
    isPaginationExhausted,
    isSearchRequestInFlightRef,
    preferredActiveTab,
    resolveLoadMoreRequestErrorMessage,
    runManagedRequestAttempt,
    setError,
    submittedQuery,
  ]);

  return React.useMemo(
    () => ({
      runRestaurantEntitySearch,
      submitViewportShortcut,
      loadMoreShortcutResults,
    }),
    [loadMoreShortcutResults, submitViewportShortcut, runRestaurantEntitySearch]
  );
};
