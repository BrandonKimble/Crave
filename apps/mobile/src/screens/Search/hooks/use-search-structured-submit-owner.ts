import React from 'react';

import type { Coordinate, NaturalSearchRequest, SearchResponse } from '../../../types';
import type { SearchRequestCacheStatus, StructuredSearchRequest } from '../../../services/search';
import type { FavoriteListType } from '../../../services/favorite-lists';
import { logger } from '../../../utils';
import type { SearchRuntimeBus } from '../runtime/shared/search-runtime-bus';
import type { ViewportBoundsService } from '../runtime/viewport/viewport-bounds-service';
import {
  captureCommittedBounds,
  writeSearchDesiredTuple,
} from '../runtime/shared/search-desired-state-writer';
import type { SegmentValue } from '../constants/search';
import { createFavoritesSubmitIntentPayload } from '../runtime/adapters/favorites-adapter';
import type { SearchRequestRuntimeOwner } from './use-search-request-runtime-owner';
import { resolveLoadMoreRequestErrorMessage } from './search-submit-runtime-utils';
import type {
  SearchSubmitEntrySurface,
  StructuredAppendAttemptConfig,
  StructuredInitialAttemptConfig,
  SearchSubmitInPlaceRerunIntentKind,
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
  entrySurface: SearchSubmitEntrySurface;
};

type RunBestHereOptions = {
  preserveSheetState?: boolean;
  replaceResultsInPlace?: boolean;
  transitionFromDockedPolls?: boolean;
  filters?: StructuredSearchFilters;
  forceFreshBounds?: boolean;
  presentationIntentKind?: SearchSubmitInPlaceRerunIntentKind;
  entrySurface: SearchSubmitEntrySurface;
};

type UseSearchStructuredSubmitOwnerArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  viewportBoundsService: ViewportBoundsService;
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
  openNow: boolean;
  userLocationRef: React.MutableRefObject<Coordinate | null>;
  createRestaurantEntityInitialAttemptConfig: (params: {
    restaurantId: string;
    restaurantName: string;
    preserveSheetState: boolean;
    entrySurface: SearchSubmitEntrySurface;
  }) => StructuredInitialAttemptConfig;
  createShortcutStructuredInitialAttemptConfig: (params: {
    targetTab: SegmentValue;
    submittedLabel: string;
    preserveSheetState: boolean;
    transitionFromDockedPolls: boolean;
    replaceResultsInPlace: boolean;
    presentationIntentKind?: SearchSubmitInPlaceRerunIntentKind;
    entrySurface: SearchSubmitEntrySurface;
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
    startLifecycle: (
      response: SearchResponse,
      cacheStatus: SearchRequestCacheStatus | null
    ) => boolean;
  }) => Promise<boolean>;
  executeShortcutStructuredSearchAttempt: (params: {
    payload: StructuredSearchRequest;
    requestId: number;
    append: boolean;
    startLifecycle: (
      response: SearchResponse,
      cacheStatus: SearchRequestCacheStatus | null
    ) => boolean;
  }) => Promise<boolean>;
  startEntityStructuredResponseLifecycle: (params: {
    response: SearchResponse;
    requestId: number;
    runtimeTuple: SearchSubmitActiveOperationTuple;
    submittedLabel: string;
    submissionContext?: NaturalSearchRequest['submissionContext'];
    requestBounds: import('../../../types').MapBounds | null;
  }) => boolean;
  executeFavoritesHydrateAttempt: (params: {
    listId: string;
    listType: FavoriteListType;
    requestId: number;
    openNow?: boolean;
    userLocation?: Coordinate | null;
    startLifecycle: (response: SearchResponse) => boolean;
  }) => Promise<boolean>;
  startFavoritesResponseLifecycle: (params: {
    response: SearchResponse;
    requestId: number;
    runtimeTuple: SearchSubmitActiveOperationTuple;
    targetTab: SegmentValue;
    submittedLabel: string;
  }) => boolean;
  startShortcutInitialResponseLifecycle: (params: {
    response: SearchResponse;
    requestId: number;
    runtimeTuple: SearchSubmitActiveOperationTuple;
    targetTab: SegmentValue;
    submittedLabel: string;
    requestBounds: import('../../../types').MapBounds | null;
    replaceResultsInPlace: boolean;
    presentationIntentKind?: SearchSubmitInPlaceRerunIntentKind;
    coverageSnapshot?: ShortcutCoverageSnapshot;
    searchCacheStatus?: SearchRequestCacheStatus | null;
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
  searchRuntimeBus,
  viewportBoundsService,
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
  openNow,
  userLocationRef,
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
  executeFavoritesHydrateAttempt,
  startFavoritesResponseLifecycle,
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
        startLifecycle: (response, searchCacheStatus) =>
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
      presentationIntentKind,
    }: {
      requestId: number;
      tuple: SearchSubmitActiveOperationTuple;
      targetTab: SegmentValue;
      submittedLabel: string;
      filters?: StructuredSearchFilters;
      forceFreshBounds: boolean;
      replaceResultsInPlace: boolean;
      presentationIntentKind?: SearchSubmitInPlaceRerunIntentKind;
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
        startLifecycle: (response, searchCacheStatus) =>
          startShortcutInitialResponseLifecycle({
            response,
            requestId,
            runtimeTuple: tuple,
            targetTab,
            submittedLabel,
            requestBounds: payload.bounds ?? null,
            replaceResultsInPlace,
            presentationIntentKind,
            coverageSnapshot: shortcutCoverageSnapshot,
            searchCacheStatus,
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
        startLifecycle: (response, searchCacheStatus) =>
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
        entrySurface: params.entrySurface,
      });
      resetMapMoveFlag();
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
        executeAttempt: async ({ requestId, tuple }) => {
          prepareSearchRequestForegroundUi(initialAttemptConfig.foregroundUi);
          return executeRestaurantEntityInitialAttempt({
            requestId,
            tuple,
            restaurantId: params.restaurantId,
            restaurantName: trimmedName,
            submissionSource: params.submissionSource,
            typedPrefix: params.typedPrefix,
          });
        },
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
    async (targetTab: SegmentValue, submittedLabel: string, options: RunBestHereOptions) => {
      logSearchPhase('runBestHere:start', { reset: true });
      // S2: the trigger writes the DESIRED TUPLE first (identity + tab + adopted viewport);
      // the writer projects searchMode/submittedQuery/session in the same publish. The
      // submit machinery below still executes the resolution until S3's resolver.
      writeSearchDesiredTuple(
        searchRuntimeBus,
        {
          queryIdentity: {
            kind: 'shortcut',
            shortcutTab: targetTab === 'dishes' ? 'dishes' : 'restaurants',
          },
          tab: targetTab === 'dishes' ? 'dishes' : 'restaurants',
          filterVariant: { includeSimilar: false },
          committedBounds: captureCommittedBounds(viewportBoundsService),
        },
        options?.presentationIntentKind === 'search_this_area'
          ? 'search_this_area'
          : 'initial_submit'
      );
      const preserveSheetState = Boolean(options?.preserveSheetState);
      const transitionFromDockedPolls =
        !preserveSheetState && Boolean(options?.transitionFromDockedPolls);
      const shouldForceFreshBounds = Boolean(options?.forceFreshBounds);
      const shouldReplaceResultsInPlace = Boolean(options?.replaceResultsInPlace);
      const presentationIntentKind = options?.presentationIntentKind;
      const entrySurface = options.entrySurface;
      const initialAttemptConfig = createShortcutStructuredInitialAttemptConfig({
        targetTab,
        submittedLabel,
        preserveSheetState,
        transitionFromDockedPolls,
        replaceResultsInPlace: shouldReplaceResultsInPlace,
        presentationIntentKind,
        entrySurface,
      });

      if (presentationIntentKind !== 'search_this_area') {
        resetMapMoveFlag();
      }
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
        executeAttempt: async ({ requestId, tuple }) => {
          prepareSearchRequestForegroundUi(initialAttemptConfig.foregroundUi);
          return executeShortcutInitialAttempt({
            requestId,
            tuple,
            targetTab,
            submittedLabel,
            filters: options?.filters,
            forceFreshBounds: shouldForceFreshBounds,
            replaceResultsInPlace: shouldReplaceResultsInPlace,
            presentationIntentKind,
          });
        },
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

  // A favorites launch is "a natural search whose data SOURCE is the favorites
  // endpoint instead of /search". It runs through the SAME managed request +
  // structured response lifecycle as the shortcut/natural paths (marker pipeline,
  // staged reveal lanes, readiness gates all fire identically) — it just fetches
  // the SearchResponse from favoriteListsService.getListResults rather than runSearch.
  const launchFavoritesListResults = React.useCallback(
    async (params: { listId: string; listType: FavoriteListType; submittedLabel: string }) => {
      logSearchPhase('launchFavorites:start', { reset: true });
      const targetTab: SegmentValue = params.listType === 'dish' ? 'dishes' : 'restaurants';
      resetMapMoveFlag();
      // S2: favorites-as-search writes the tuple (entities kind; id sets arrive with the
      // response until S3's resolver — the listId path stays lane-owned). No viewport adopt:
      // the results define the camera.
      writeSearchDesiredTuple(
        searchRuntimeBus,
        {
          queryIdentity: {
            kind: 'entities',
            restaurantIds: [],
            foodIds: [],
            displayTitle: params.submittedLabel,
          },
          tab: targetTab === 'dishes' ? 'dishes' : 'restaurants',
          filterVariant: { includeSimilar: false },
        },
        'favorites_launch'
      );
      await runManagedRequestAttempt({
        mode: 'favorites',
        submitPayload: createFavoritesSubmitIntentPayload({
          listId: params.listId,
          listType: params.listType,
          submittedLabel: params.submittedLabel,
        }),
        finalizeReason: 'favorites_finalized_without_response_lifecycle',
        shouldAbortPresentationIntent: true,
        abortPresentationIntent: onPresentationIntentAbort,
        setError,
        onError: (err) => {
          logger.error('Favorites list results request failed', {
            message: err instanceof Error ? err.message : 'unknown error',
            listId: params.listId,
          });
        },
        resolveFailure: () => ({
          idleStatePatch: {
            isMapActivationDeferred: false,
          },
          uiErrorMessage: null,
        }),
        executeAttempt: async ({ requestId, tuple }) => {
          prepareSearchRequestForegroundUi({
            kind: 'initial_search',
            mode: 'natural',
            preserveSheetState: false,
            transitionFromDockedPolls: false,
            targetTab,
            submittedLabel: params.submittedLabel,
            shouldResetPagination: true,
            logLabel: 'launchFavorites',
            entrySurface: 'home',
          });
          logSearchPhase('launchFavorites:runRequest');
          return executeFavoritesHydrateAttempt({
            listId: params.listId,
            listType: params.listType,
            requestId,
            openNow,
            userLocation: userLocationRef.current,
            startLifecycle: (response) =>
              startFavoritesResponseLifecycle({
                response,
                requestId,
                runtimeTuple: tuple,
                targetTab,
                submittedLabel: params.submittedLabel,
              }),
          });
        },
      });
    },
    [
      executeFavoritesHydrateAttempt,
      logSearchPhase,
      onPresentationIntentAbort,
      openNow,
      prepareSearchRequestForegroundUi,
      resetMapMoveFlag,
      runManagedRequestAttempt,
      setError,
      startFavoritesResponseLifecycle,
      userLocationRef,
    ]
  );

  return React.useMemo(
    () => ({
      runRestaurantEntitySearch,
      submitViewportShortcut,
      loadMoreShortcutResults,
      launchFavoritesListResults,
    }),
    [
      launchFavoritesListResults,
      loadMoreShortcutResults,
      submitViewportShortcut,
      runRestaurantEntitySearch,
    ]
  );
};
