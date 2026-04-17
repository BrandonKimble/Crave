import React from 'react';

import type { NaturalSearchRequest, SearchResponse } from '../../../types';
import { logger } from '../../../utils';
import { createNaturalSubmitIntentPayload } from '../runtime/adapters/natural-adapter';
import type { SegmentValue } from '../constants/search';
import type { SearchRequestRuntimeOwner } from './use-search-request-runtime-owner';
import { resolveLoadMoreRequestErrorMessage } from './search-submit-runtime-utils';
import type {
  ResolveNaturalSearchAttemptConfigResult,
  SubmitSearchOptions,
} from './use-search-submit-entry-owner';

type UseSearchNaturalSubmitOwnerArgs = {
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
  }) => void;
  prepareNaturalSearchAttemptPayload: (options: {
    tuple: {
      mode: 'entity' | 'natural' | 'shortcut';
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
    minimumVotes?: number | null;
    forceFreshBounds?: boolean;
  }) => Promise<{
    payload: NaturalSearchRequest;
    requestBounds: import('../../../types').MapBounds | null;
  } | null>;
  executeNaturalSearchAttempt: (options: {
    payload: NaturalSearchRequest;
    requestId: number;
    responsePhaseLabel: string;
    startLifecycle: (response: SearchResponse) => boolean;
  }) => Promise<boolean>;
  startNaturalResponseLifecycle: (options: {
    response: SearchResponse;
    requestId: number;
    runtimeTuple: {
      mode: 'entity' | 'natural' | 'shortcut';
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
  }) => boolean;
  runManagedRequestAttempt: SearchRequestRuntimeOwner['runManagedRequestAttempt'];
  onPresentationIntentAbort?: () => void;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  logSearchPhase?: (label: string, options?: { reset?: boolean }) => void;
};

export const useSearchNaturalSubmitOwner = ({
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
      if (!append) {
        prepareNaturalSearchForegroundUi({
          preserveSheetState: naturalAttemptConfig.preserveSheetState,
          transitionFromDockedPolls: naturalAttemptConfig.transitionFromDockedPolls,
          targetTab: naturalAttemptConfig.preRequestTab,
          submittedLabel: trimmedQuery,
          replaceResultsLabel: naturalAttemptConfig.shouldReplaceResultsInPlace
            ? trimmedQuery
            : undefined,
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
            minimumVotes: naturalAttemptConfig.effectiveMinimumVotes,
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
            startLifecycle: (response) =>
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
