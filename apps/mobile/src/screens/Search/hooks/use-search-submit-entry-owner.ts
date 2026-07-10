import React from 'react';

import type { NaturalSearchRequest } from '../../../types';
import type { SegmentValue } from '../constants/search';
import {
  captureCommittedBounds,
  writeSearchDesiredTuple,
} from '../runtime/shared/search-desired-state-writer';
import type { ViewportBoundsService } from '../runtime/viewport/viewport-bounds-service';
import type { SearchRuntimeBus } from '../runtime/shared/search-runtime-bus';
import { publishSearchMountedResultsDataSnapshot } from '../runtime/shared/search-mounted-results-data-store';
export type { SearchSubmitEntrySurface } from '../runtime/shared/search-submit-entry-surface-contract';

export type SearchMode = 'natural' | 'shortcut' | null;

export type SearchSubmitPresentationIntentKind =
  | 'initial_search'
  | 'shortcut_rerun'
  | 'search_this_area'
  // TR5-N: an in-place chip rerun (open-now/rising/price/mid-pagination include-similar).
  // Rides the search-this-area DEFERRED staging lane: the toggle runner arms the pending
  // cover at commit; the enter transaction is staged at response commit, data-keyed.
  | 'variant_rerun';

// The in-place rerun kinds: the submit machinery must NOT clear results or stage a reveal
// for these — the reveal is staged at response time under the already-armed cover.
export type SearchSubmitInPlaceRerunIntentKind = Extract<
  SearchSubmitPresentationIntentKind,
  'search_this_area' | 'variant_rerun'
>;

// S-A (the great trigger deletion, 2026-07-10): the presentation flags are GONE from the
// submit options. preserveSheetState/entrySurface/presentationIntentKind/
// transitionFromDockedPolls were trigger-passed copies of facts the reconciler DERIVES
// from the tuple delta (classifySearchWorldTransition) — the enter foreground effects
// already ran on the derived intent, so the trigger copies fed nothing but a validation
// throw and the include-similar reset gate (now folded into the tuple write below). The
// filter overrides (openNow/priceLevels/…) fed the deleted request-build path; the
// fetcher builds requests from the tuple.
export type SubmitSearchOptions = {
  page?: number;
  append?: boolean;
  replaceResultsInPlace?: boolean;
  forceFreshBounds?: boolean;
  /** S-D.3 — TYPED selected-entity submission (the skip-LLM lane). ONE construction: the
   *  attempt config injects the wire fields (selectedEntityId/Type + matchType:'entity')
   *  into submissionContext, and the natural submit derives the entity IDENTITY from this —
   *  producers no longer hand-build stringly context records. */
  selectedEntity?: {
    entityId: string;
    entityType: 'food' | 'food_attribute' | 'restaurant_attribute';
  };
  submission?: {
    source: NaturalSearchRequest['submissionSource'];
    context?: NaturalSearchRequest['submissionContext'];
  };
};

// S-A: shrunk to the two fields anything reads — the decoration payload. Every other
// field (preRequestTab, the effective* filter set, the presentation flags) fed the
// deleted legacy request-build path.
export type ResolveNaturalSearchAttemptConfigResult = {
  submissionSource: NaturalSearchRequest['submissionSource'];
  submissionContext?: NaturalSearchRequest['submissionContext'];
};

type PrepareNaturalSearchEntryResult = {
  append: boolean;
  targetPage: number;
  trimmedQuery: string;
};

type UseSearchSubmitEntryOwnerArgs = {
  viewportBoundsService: ViewportBoundsService;
  query: string;
  isLoadingMore: boolean;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  searchRuntimeBus: SearchRuntimeBus;
  resetMapMoveFlag: () => void;
};

export const resolveSubmissionDefaultTab = (
  submissionContext: NaturalSearchRequest['submissionContext']
): SegmentValue | null => {
  const contextRecord =
    submissionContext && typeof submissionContext === 'object' && !Array.isArray(submissionContext)
      ? (submissionContext as Record<string, unknown>)
      : null;
  const selectedEntityType = contextRecord?.selectedEntityType;
  if (selectedEntityType === 'restaurant' || selectedEntityType === 'restaurant_attribute') {
    return 'restaurants';
  }
  if (selectedEntityType === 'food') {
    return 'dishes';
  }
  return null;
};

export const useSearchSubmitEntryOwner = ({
  viewportBoundsService,
  query,
  isLoadingMore,
  setError,
  searchRuntimeBus,
  resetMapMoveFlag,
}: UseSearchSubmitEntryOwnerArgs) => {
  const prepareNaturalSearchEntry = React.useCallback(
    (
      options?: SubmitSearchOptions,
      overrideQuery?: string,
      // S4b: selected-entity submissions write their entity identity in the SAME (one)
      // tuple write — a natural-then-entity double write would double-resolve now that
      // the reconciler acts on every write.
      identityOverride?: import('../runtime/shared/search-desired-state-contract').SearchQueryIdentity
    ): PrepareNaturalSearchEntryResult | null => {
      const append = Boolean(options?.append);
      if (append && isLoadingMore) {
        return null;
      }

      if (!append && !options?.replaceResultsInPlace) {
        resetMapMoveFlag();
      }

      const targetPage = options?.page && options.page > 0 ? options.page : 1;
      const baseQuery = overrideQuery ?? query;
      const trimmedQuery = baseQuery.trim();
      if (!trimmedQuery) {
        if (!append) {
          publishSearchMountedResultsDataSnapshot(null);
          searchRuntimeBus.publish({
            resultsRequestKey: null,
            resultsIdentityCandidateKey: null,
            resultsPage: null,
            resultsDishCount: 0,
            resultsRestaurantCount: 0,
            hasMoreFood: false,
            hasMoreRestaurants: false,
            currentPage: 1,
          });
          setError(null);
        }
        return null;
      }

      if (!append) {
        // S2: the natural submit writes the DESIRED TUPLE (identity + adopted viewport);
        // idempotent for variant reruns (identity unchanged → filter writes already landed
        // via their chip causes). Appends never rewrite desire.
        writeSearchDesiredTuple(
          searchRuntimeBus,
          {
            queryIdentity: identityOverride ?? { kind: 'natural', query: trimmedQuery },
            ...(options?.replaceResultsInPlace && !options?.forceFreshBounds
              ? {}
              : { committedBounds: captureCommittedBounds(viewportBoundsService) }),
            // S-A: a genuinely NEW natural search resets the session-scoped "Include
            // similar" toggle IN the identity write — the same pattern every structured
            // lane already uses. In-place re-presents (STA, retry) keep it: they pass
            // replaceResultsInPlace, exactly the fact the old entrySurface gate encoded.
            ...(options?.replaceResultsInPlace ? {} : { filterVariant: { includeSimilar: false } }),
          },
          'initial_submit'
        );
      }
      return {
        append,
        targetPage,
        trimmedQuery,
      };
    },
    [isLoadingMore, query, resetMapMoveFlag, searchRuntimeBus, setError, viewportBoundsService]
  );

  const resolveNaturalSearchAttemptConfig = React.useCallback(
    (options?: SubmitSearchOptions): ResolveNaturalSearchAttemptConfigResult => {
      const submissionSource = options?.submission?.source ?? 'manual';
      const submissionContext = options?.selectedEntity
        ? {
            ...(options.submission?.context as Record<string, unknown> | undefined),
            matchType: 'entity',
            selectedEntityId: options.selectedEntity.entityId,
            selectedEntityType: options.selectedEntity.entityType,
          }
        : options?.submission?.context;
      return {
        submissionSource,
        submissionContext,
      };
    },
    []
  );

  return React.useMemo(
    () => ({
      prepareNaturalSearchEntry,
      resolveNaturalSearchAttemptConfig,
    }),
    [prepareNaturalSearchEntry, resolveNaturalSearchAttemptConfig]
  );
};
