import React from 'react';

import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../perf/perf-scenario-runtime-store';
import type { NaturalSearchRequest, SearchResponse } from '../../../types';
import type { SearchRequestCacheStatus } from '../../../services/search';
import { logger } from '../../../utils';
import { createNaturalSubmitIntentPayload } from '../runtime/adapters/natural-adapter';
import type { SegmentValue } from '../constants/search';
import type { SearchRequestRuntimeOwner } from './use-search-request-runtime-owner';
import { resolveLoadMoreRequestErrorMessage } from './search-submit-runtime-utils';
import type {
  ResolveNaturalSearchAttemptConfigResult,
  SearchSubmitEntrySurface,
  SubmitSearchOptions,
  SearchSubmitInPlaceRerunIntentKind,
} from './use-search-submit-entry-owner';

type UseSearchNaturalSubmitOwnerArgs = {
  searchRuntimeBus: import('../runtime/shared/search-runtime-bus').SearchRuntimeBus;
  /** S3b-2: context-free non-append natural submits resolve through the world resolver. */
  resolveDesiredWorld: (
    args: import('../runtime/resolver/search-world-resolver').SearchWorldResolveArgs
  ) => Promise<void>;
  beginResolverSubmitForegroundUi: (options: {
    mode: 'natural' | 'shortcut' | null;
    targetTab: SegmentValue;
    submittedLabel: string;
    preserveSheetState: boolean;
    transitionFromDockedPolls: boolean;
    presentationIntentKind?: SearchSubmitInPlaceRerunIntentKind;
    entrySurface: SearchSubmitEntrySurface;
  }) => void;
  prepareNaturalSearchEntry: (
    options?: SubmitSearchOptions,
    overrideQuery?: string
  ) => {
    append: boolean;
    targetPage: number;
    trimmedQuery: string;
  } | null;
  resolveNaturalSearchAttemptConfig: (
    options?: SubmitSearchOptions
  ) => ResolveNaturalSearchAttemptConfigResult;
  prepareNaturalSearchForegroundUi: (options: {
    preserveSheetState: boolean;
    transitionFromDockedPolls: boolean;
    targetTab: SegmentValue;
    submittedLabel: string;
    replaceResultsLabel?: string;
    presentationIntentKind?: SearchSubmitInPlaceRerunIntentKind;
    entrySurface: SearchSubmitEntrySurface;
  }) => void;
  prepareNaturalSearchAttemptPayload: (options: {
    tuple: {
      mode: 'entity' | 'natural' | 'shortcut' | 'favorites';
      sessionId: string;
      operationId: string;
      requestId: number;
      seq: number;
    };
    append: boolean;
    targetPage: number;
    trimmedQuery: string;
    submissionSource?: NaturalSearchRequest['submissionSource'];
    submissionContext?: NaturalSearchRequest['submissionContext'];
    openNow?: boolean;
    priceLevels?: number[] | null;
    includeSimilar?: boolean;
    rising?: boolean;
    forceFreshBounds?: boolean;
  }) => Promise<{
    payload: NaturalSearchRequest;
    requestBounds: import('../../../types').MapBounds | null;
  } | null>;
  executeNaturalSearchAttempt: (options: {
    payload: NaturalSearchRequest;
    requestId: number;
    responsePhaseLabel: string;
    startLifecycle: (
      response: SearchResponse,
      cacheStatus: SearchRequestCacheStatus | null
    ) => boolean;
  }) => Promise<boolean>;
  startNaturalResponseLifecycle: (options: {
    response: SearchResponse;
    requestId: number;
    runtimeTuple: {
      mode: 'entity' | 'natural' | 'shortcut' | 'favorites';
      sessionId: string;
      operationId: string;
      requestId: number;
      seq: number;
    };
    append: boolean;
    targetPage: number;
    targetTab: SegmentValue;
    submittedLabel?: string;
    submissionContext?: NaturalSearchRequest['submissionContext'];
    requestBounds: import('../../../types').MapBounds | null;
    replaceResultsInPlace: boolean;
    presentationIntentKind?: SearchSubmitInPlaceRerunIntentKind;
    searchCacheStatus?: SearchRequestCacheStatus | null;
  }) => boolean;
  runManagedRequestAttempt: SearchRequestRuntimeOwner['runManagedRequestAttempt'];
  onPresentationIntentAbort?: () => void;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  logSearchPhase?: (label: string, options?: { reset?: boolean }) => void;
};

export const useSearchNaturalSubmitOwner = ({
  searchRuntimeBus,
  resolveDesiredWorld,
  beginResolverSubmitForegroundUi,
  prepareNaturalSearchEntry,
  resolveNaturalSearchAttemptConfig,
  prepareNaturalSearchForegroundUi,
  prepareNaturalSearchAttemptPayload,
  executeNaturalSearchAttempt,
  startNaturalResponseLifecycle,
  runManagedRequestAttempt,
  onPresentationIntentAbort,
  setError,
  logSearchPhase = () => {},
}: UseSearchNaturalSubmitOwnerArgs) => {
  const executeActivatedNaturalSearchAttempt = React.useCallback(
    async ({
      append,
      targetPage,
      trimmedQuery,
      naturalAttemptConfig,
    }: {
      append: boolean;
      targetPage: number;
      trimmedQuery: string;
      naturalAttemptConfig: ResolveNaturalSearchAttemptConfigResult;
    }) => {
      const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
      if (isPerfScenarioAttributionActive(scenarioConfig)) {
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'natural_submit_attempt_contract',
          append,
          targetPage,
          targetTab: naturalAttemptConfig.preRequestTab,
          trimmedQueryLength: trimmedQuery.length,
          submissionSource: naturalAttemptConfig.submissionSource,
          submissionContext: naturalAttemptConfig.submissionContext,
          preserveSheetState: naturalAttemptConfig.preserveSheetState,
          transitionFromDockedPolls: naturalAttemptConfig.transitionFromDockedPolls,
          forceFreshBounds: naturalAttemptConfig.shouldForceFreshBounds,
          replaceResultsInPlace: naturalAttemptConfig.shouldReplaceResultsInPlace,
        });
      }
      if (!append) {
        prepareNaturalSearchForegroundUi({
          preserveSheetState: naturalAttemptConfig.preserveSheetState,
          transitionFromDockedPolls: naturalAttemptConfig.transitionFromDockedPolls,
          targetTab: naturalAttemptConfig.preRequestTab,
          submittedLabel: trimmedQuery,
          replaceResultsLabel: naturalAttemptConfig.shouldReplaceResultsInPlace
            ? trimmedQuery
            : undefined,
          presentationIntentKind: naturalAttemptConfig.presentationIntentKind,
          entrySurface: naturalAttemptConfig.entrySurface,
        });
      }
      await runManagedRequestAttempt({
        mode: 'natural',
        submitPayload: createNaturalSubmitIntentPayload({
          query: trimmedQuery,
          targetPage,
          append,
          submissionSource: naturalAttemptConfig.submissionSource,
        }),
        append,
        targetPage,
        finalizeReason: 'natural_finalized_without_response_lifecycle',
        shouldAbortPresentationIntent: !append,
        abortPresentationIntent: onPresentationIntentAbort,
        setError,
        onError: (err) => {
          logger.error('Search request failed', { message: (err as Error).message });
        },
        resolveFailure: (err) => ({
          idleStatePatch: {
            isMapActivationDeferred: false,
          },
          uiErrorMessage: append ? resolveLoadMoreRequestErrorMessage(err) : null,
        }),
        executeAttempt: async ({ requestId, tuple }) => {
          const preparedPayload = await prepareNaturalSearchAttemptPayload({
            tuple,
            append,
            targetPage,
            trimmedQuery,
            submissionSource: naturalAttemptConfig.submissionSource,
            submissionContext: naturalAttemptConfig.submissionContext,
            openNow: naturalAttemptConfig.effectiveOpenNow,
            priceLevels: naturalAttemptConfig.effectivePriceLevels,
            includeSimilar: naturalAttemptConfig.effectiveIncludeSimilar,
            rising: naturalAttemptConfig.effectiveRising,
            forceFreshBounds: naturalAttemptConfig.shouldForceFreshBounds,
          });
          if (!preparedPayload) {
            return false;
          }
          const { payload, requestBounds } = preparedPayload;

          logSearchPhase('submitSearch:runSearch');
          return executeNaturalSearchAttempt({
            payload,
            requestId,
            responsePhaseLabel: 'submitSearch:response',
            startLifecycle: (response, searchCacheStatus) =>
              startNaturalResponseLifecycle({
                response,
                requestId,
                runtimeTuple: tuple,
                append,
                targetPage,
                targetTab: naturalAttemptConfig.preRequestTab,
                submittedLabel: append ? undefined : trimmedQuery,
                submissionContext: naturalAttemptConfig.submissionContext,
                requestBounds,
                replaceResultsInPlace: naturalAttemptConfig.shouldReplaceResultsInPlace,
                presentationIntentKind: naturalAttemptConfig.presentationIntentKind,
                searchCacheStatus,
              }),
          });
        },
      });
    },
    [
      executeNaturalSearchAttempt,
      logSearchPhase,
      onPresentationIntentAbort,
      prepareNaturalSearchAttemptPayload,
      prepareNaturalSearchForegroundUi,
      resolveLoadMoreRequestErrorMessage,
      runManagedRequestAttempt,
      setError,
      startNaturalResponseLifecycle,
    ]
  );

  const submitSearch = React.useCallback(
    async (options?: SubmitSearchOptions, overrideQuery?: string) => {
      logSearchPhase('submitSearch:start', { reset: true });
      const naturalEntry = prepareNaturalSearchEntry(options, overrideQuery);
      if (!naturalEntry) {
        return;
      }
      const { append, targetPage, trimmedQuery } = naturalEntry;
      const naturalAttemptConfig = resolveNaturalSearchAttemptConfig(options);
      // S3b-2: context-free non-append natural submits are a tuple write (already done
      // by prepareNaturalSearchEntry) + resolve. Context-carrying submissions (entity
      // taps) stay on the legacy chain until S3c folds them into the 'entity' kind;
      // appends stay until the pagination cutover.
      if (!append && naturalAttemptConfig.submissionContext == null) {
        const busState = searchRuntimeBus.getState();
        await resolveDesiredWorld({
          tuple: busState.desiredTuple,
          generation: busState.desiredTupleGeneration,
          cause: busState.desiredTupleCause,
          presentationIntentKind: naturalAttemptConfig.presentationIntentKind,
          onResolutionBegan: () => {
            beginResolverSubmitForegroundUi({
              mode: 'natural',
              targetTab: naturalAttemptConfig.preRequestTab,
              submittedLabel: trimmedQuery,
              preserveSheetState: naturalAttemptConfig.preserveSheetState,
              transitionFromDockedPolls: naturalAttemptConfig.transitionFromDockedPolls,
              presentationIntentKind: naturalAttemptConfig.presentationIntentKind,
              entrySurface: naturalAttemptConfig.entrySurface,
            });
            logSearchPhase('submitSearch:ui-lanes-scheduled');
          },
          onResolutionFailed: (reason) => {
            logger.error('Search request failed', { message: reason });
            searchRuntimeBus.publish({ isMapActivationDeferred: false });
            onPresentationIntentAbort?.();
          },
        });
        return;
      }
      await executeActivatedNaturalSearchAttempt({
        append,
        targetPage,
        trimmedQuery,
        naturalAttemptConfig,
      });
    },
    [
      executeActivatedNaturalSearchAttempt,
      logSearchPhase,
      prepareNaturalSearchEntry,
      resolveNaturalSearchAttemptConfig,
    ]
  );

  return React.useMemo(
    () => ({
      submitSearch,
    }),
    [submitSearch]
  );
};
