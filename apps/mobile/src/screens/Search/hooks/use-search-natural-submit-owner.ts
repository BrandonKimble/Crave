import React from 'react';

import {
  clearPendingSearchRequestDecoration,
  registerPendingSearchRequestDecoration,
} from '../runtime/reconciler/search-request-decoration-registry';
import type {
  ResolveNaturalSearchAttemptConfigResult,
  SubmitSearchOptions,
} from './use-search-submit-entry-owner';

type UseSearchNaturalSubmitOwnerArgs = {
  prepareNaturalSearchEntry: (
    options?: SubmitSearchOptions,
    overrideQuery?: string,
    identityOverride?: import('../runtime/shared/search-desired-state-contract').SearchQueryIdentity
  ) => {
    append: boolean;
    targetPage: number;
    trimmedQuery: string;
  } | null;
  resolveNaturalSearchAttemptConfig: (
    options?: SubmitSearchOptions
  ) => ResolveNaturalSearchAttemptConfigResult;
  logSearchPhase?: (label: string, options?: { reset?: boolean }) => void;
};

export const useSearchNaturalSubmitOwner = ({
  prepareNaturalSearchEntry,
  resolveNaturalSearchAttemptConfig,
  logSearchPhase = () => {},
}: UseSearchNaturalSubmitOwnerArgs) => {
  const submitSearch = React.useCallback(
    async (options?: SubmitSearchOptions, overrideQuery?: string) => {
      logSearchPhase('submitSearch:start', { reset: true });
      const naturalAttemptConfig = resolveNaturalSearchAttemptConfig(options);
      const contextRecord =
        naturalAttemptConfig.submissionContext != null &&
        typeof naturalAttemptConfig.submissionContext === 'object' &&
        !Array.isArray(naturalAttemptConfig.submissionContext)
          ? (naturalAttemptConfig.submissionContext as Record<string, unknown>)
          : null;
      // S-D.3: the entity identity derives from the TYPED option — the stringly
      // context-record parse is gone (the wire fields are injected by the attempt config
      // from the same typed source, so wire and identity can no longer diverge).
      const trimmedForIdentity = (overrideQuery ?? '').trim();
      const entityIdentity = options?.selectedEntity
        ? ({
            kind: 'entity',
            entityType: options.selectedEntity.entityType,
            entityId: options.selectedEntity.entityId,
            displayName: trimmedForIdentity,
          } as const)
        : undefined;
      // S4b: the submit IS the tuple write — the reconciler (which fires SYNCHRONOUSLY
      // inside the write) classifies the transition and drives resolution. Decoration
      // pre-registers so the kick can take it.
      registerPendingSearchRequestDecoration({
        submissionSource: naturalAttemptConfig.submissionSource,
        submissionContext: contextRecord ?? undefined,
      });
      const naturalEntry = prepareNaturalSearchEntry(options, overrideQuery, entityIdentity);
      if (!naturalEntry) {
        clearPendingSearchRequestDecoration();
        return;
      }
      if (naturalEntry.append) {
        clearPendingSearchRequestDecoration();
        // Appends never reach submitSearch anymore (loadMore routes to resolveNextPage).
        throw new Error('submitSearch: append reached the deleted legacy lane');
      }
    },
    [logSearchPhase, prepareNaturalSearchEntry, resolveNaturalSearchAttemptConfig]
  );

  return React.useMemo(
    () => ({
      submitSearch,
    }),
    [submitSearch]
  );
};
