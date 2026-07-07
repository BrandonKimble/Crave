import React from 'react';

import { logger } from '../../../utils';
import { writeSearchDesiredTuple } from '../runtime/shared/search-desired-state-writer';
import type { SegmentValue } from '../constants/search';
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
  onPresentationIntentAbort?: () => void;
  logSearchPhase?: (label: string, options?: { reset?: boolean }) => void;
};

export const useSearchNaturalSubmitOwner = ({
  searchRuntimeBus,
  resolveDesiredWorld,
  beginResolverSubmitForegroundUi,
  prepareNaturalSearchEntry,
  resolveNaturalSearchAttemptConfig,
  onPresentationIntentAbort,
  logSearchPhase = () => {},
}: UseSearchNaturalSubmitOwnerArgs) => {
  const submitSearch = React.useCallback(
    async (options?: SubmitSearchOptions, overrideQuery?: string) => {
      logSearchPhase('submitSearch:start', { reset: true });
      const naturalEntry = prepareNaturalSearchEntry(options, overrideQuery);
      if (!naturalEntry) {
        return;
      }
      const { append, trimmedQuery } = naturalEntry;
      const naturalAttemptConfig = resolveNaturalSearchAttemptConfig(options);
      // S3b-2/S3c: non-append submits are a tuple write + resolve. Context-free typed
      // searches keep the natural tuple prepareNaturalSearchEntry wrote; selected-entity
      // submissions (autocomplete taps, poll-comment entity taps) CONVERT the identity
      // to the 'entity' kind — the skip-LLM lane is an identity fact, not a payload
      // detail. Appends stay legacy until the pagination cutover.
      const contextRecord =
        naturalAttemptConfig.submissionContext != null &&
        typeof naturalAttemptConfig.submissionContext === 'object' &&
        !Array.isArray(naturalAttemptConfig.submissionContext)
          ? (naturalAttemptConfig.submissionContext as Record<string, unknown>)
          : null;
      const selectedEntityId =
        typeof contextRecord?.selectedEntityId === 'string' ? contextRecord.selectedEntityId : null;
      const selectedEntityType = contextRecord?.selectedEntityType;
      const entityIdentityType =
        selectedEntityType === 'restaurant' ||
        selectedEntityType === 'food' ||
        selectedEntityType === 'food_attribute' ||
        selectedEntityType === 'restaurant_attribute'
          ? selectedEntityType
          : null;
      const isEntitySubmission =
        contextRecord?.matchType === 'entity' &&
        selectedEntityId != null &&
        entityIdentityType != null;
      // ALL non-append submissions resolve. Non-entity contexts (matchType 'query' —
      // typedPrefix analytics) ride as request DECORATION: they never fragment the
      // cache key, and a cache hit legitimately owes no analytics request.
      if (!append) {
        if (isEntitySubmission && selectedEntityId != null && entityIdentityType != null) {
          writeSearchDesiredTuple(
            searchRuntimeBus,
            {
              queryIdentity: {
                kind: 'entity',
                entityType: entityIdentityType,
                entityId: selectedEntityId,
                displayName: trimmedQuery,
              },
            },
            'entity_tap'
          );
        }
        const busState = searchRuntimeBus.getState();
        await resolveDesiredWorld({
          tuple: busState.desiredTuple,
          generation: busState.desiredTupleGeneration,
          cause: busState.desiredTupleCause,
          presentationIntentKind: naturalAttemptConfig.presentationIntentKind,
          requestDecoration: {
            submissionSource: naturalAttemptConfig.submissionSource,
            submissionContext: contextRecord ?? undefined,
          },
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
      // Appends never reach submitSearch anymore (loadMore routes to
      // resolveNextPage); anything arriving here is a broken caller.
      throw new Error('submitSearch: append reached the deleted legacy lane');
    },
    [
      beginResolverSubmitForegroundUi,
      logSearchPhase,
      onPresentationIntentAbort,
      prepareNaturalSearchEntry,
      resolveDesiredWorld,
      resolveNaturalSearchAttemptConfig,
      searchRuntimeBus,
    ]
  );

  return React.useMemo(
    () => ({
      submitSearch,
    }),
    [submitSearch]
  );
};
