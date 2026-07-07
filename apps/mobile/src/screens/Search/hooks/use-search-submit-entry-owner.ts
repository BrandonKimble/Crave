import React from 'react';

import type { NaturalSearchRequest } from '../../../types';
import { DEFAULT_SEGMENT } from '../constants/search';
import type { SegmentValue } from '../constants/search';
import {
  captureCommittedBounds,
  writeSearchDesiredTuple,
} from '../runtime/shared/search-desired-state-writer';
import type { ViewportBoundsService } from '../runtime/viewport/viewport-bounds-service';
import type { SearchRuntimeBus } from '../runtime/shared/search-runtime-bus';
import { publishSearchMountedResultsDataSnapshot } from '../runtime/shared/search-mounted-results-data-store';
import type { SearchSubmitEntrySurface } from '../runtime/shared/search-submit-entry-surface-contract';

export type { SearchSubmitEntrySurface } from '../runtime/shared/search-submit-entry-surface-contract';

export type SearchMode = 'natural' | 'shortcut' | null;

/** The chip-filter override shape submit options carry (re-homed from the deleted
 *  request-preparation owner). */
export type StructuredSearchFilters = {
  openNow?: boolean;
  priceLevels?: number[] | null;
  includeSimilar?: boolean;
  rising?: boolean;
};
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
export const isSearchSubmitInPlaceRerunIntentKind = (
  kind: SearchSubmitPresentationIntentKind | undefined
): kind is SearchSubmitInPlaceRerunIntentKind =>
  kind === 'search_this_area' || kind === 'variant_rerun';

export type SubmitSearchOptions = {
  openNow?: boolean;
  priceLevels?: number[] | null;
  includeSimilar?: boolean;
  rising?: boolean;
  page?: number;
  append?: boolean;
  preserveSheetState?: boolean;
  replaceResultsInPlace?: boolean;
  transitionFromDockedPolls?: boolean;
  forceFreshBounds?: boolean;
  presentationIntentKind?: SearchSubmitInPlaceRerunIntentKind;
  entrySurface?: SearchSubmitEntrySurface;
  submission?: {
    source: NaturalSearchRequest['submissionSource'];
    context?: NaturalSearchRequest['submissionContext'];
  };
};

export type ResolveNaturalSearchAttemptConfigResult = {
  submissionSource: NaturalSearchRequest['submissionSource'];
  submissionContext?: NaturalSearchRequest['submissionContext'];
  preRequestTab: SegmentValue;
  preserveSheetState: boolean;
  transitionFromDockedPolls: boolean;
  shouldReplaceResultsInPlace: boolean;
  presentationIntentKind?: SearchSubmitInPlaceRerunIntentKind;
  effectiveOpenNow: boolean;
  effectivePriceLevels: number[];
  effectiveIncludeSimilar: boolean;
  effectiveRising: boolean;
  shouldForceFreshBounds: boolean;
  entrySurface: SearchSubmitEntrySurface;
};

type PrepareNaturalSearchEntryResult = {
  append: boolean;
  targetPage: number;
  trimmedQuery: string;
};

type UseSearchSubmitEntryOwnerArgs = {
  viewportBoundsService: ViewportBoundsService;
  query: string;
  preferredActiveTab: SegmentValue;
  hasActiveTabPreference: boolean;
  isLoadingMore: boolean;
  openNow: boolean;
  priceLevels: number[];
  risingActive: boolean;
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

const resolveSearchSubmitPresentationEntrySurface = ({
  append,
  preserveSheetState,
  presentationIntentKind,
  entrySurface,
  label,
}: {
  append?: boolean;
  preserveSheetState: boolean;
  presentationIntentKind?: SearchSubmitInPlaceRerunIntentKind;
  entrySurface?: SearchSubmitEntrySurface;
  label: string;
}): SearchSubmitEntrySurface => {
  if (append || preserveSheetState || presentationIntentKind === 'search_this_area') {
    return entrySurface ?? 'results';
  }
  if (entrySurface == null) {
    throw new Error(`[SEARCH-SUBMIT-INTENT] ${label} requires entrySurface.`);
  }
  return entrySurface;
};

export const useSearchSubmitEntryOwner = ({
  viewportBoundsService,
  query,
  preferredActiveTab,
  hasActiveTabPreference,
  isLoadingMore,
  openNow,
  priceLevels,
  risingActive,
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
            submittedQuery: '',
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
      const submissionContext = options?.submission?.context;
      const submissionContextTab = resolveSubmissionDefaultTab(submissionContext);
      const preRequestTab =
        submissionContextTab ?? (hasActiveTabPreference ? preferredActiveTab : DEFAULT_SEGMENT);
      const preserveSheetState = Boolean(options?.preserveSheetState);
      const transitionFromDockedPolls =
        !preserveSheetState && Boolean(options?.transitionFromDockedPolls);
      const shouldReplaceResultsInPlace = Boolean(options?.replaceResultsInPlace);
      const presentationIntentKind = options?.presentationIntentKind;
      const entrySurface = resolveSearchSubmitPresentationEntrySurface({
        append: options?.append,
        preserveSheetState,
        presentationIntentKind,
        entrySurface: options?.entrySurface,
        label: 'submitSearch',
      });
      // A genuinely NEW search (launched outside the results surface) resets the
      // session-scoped "Include similar" toggle to its default (off) BEFORE the
      // effective value is read for the request payload. Reruns/filter toggles
      // (entrySurface 'results') keep the current value.
      if (entrySurface !== 'results' && searchRuntimeBus.getState().includeSimilarActive) {
        // S2: routed through the ONE tuple writer (legacy key is a projection). The
        // desired-tuple reader ignores non-chip causes, so this reset never re-commits.
        writeSearchDesiredTuple(
          searchRuntimeBus,
          { filterVariant: { includeSimilar: false } },
          'initial_submit'
        );
      }
      const effectiveOpenNow = options?.openNow ?? openNow;
      const effectivePriceLevels =
        options?.priceLevels !== undefined ? (options.priceLevels ?? []) : priceLevels;
      // includeSimilar is SESSION-scoped bus state (not persisted); the toggle publishes
      // the optimistic value to the bus before the debounced rerun fires, so reading the
      // bus here always sees the effective value. An explicit option still overrides.
      const effectiveIncludeSimilar =
        options?.includeSimilar ?? searchRuntimeBus.getState().includeSimilarActive;
      const effectiveRising = options?.rising ?? risingActive;

      return {
        submissionSource,
        submissionContext,
        preRequestTab,
        preserveSheetState,
        transitionFromDockedPolls,
        shouldReplaceResultsInPlace,
        presentationIntentKind,
        entrySurface,
        effectiveOpenNow,
        effectivePriceLevels,
        effectiveIncludeSimilar,
        effectiveRising,
        shouldForceFreshBounds: Boolean(options?.forceFreshBounds),
      };
    },
    [
      hasActiveTabPreference,
      openNow,
      preferredActiveTab,
      priceLevels,
      risingActive,
      searchRuntimeBus,
    ]
  );

  return React.useMemo(
    () => ({
      prepareNaturalSearchEntry,
      resolveNaturalSearchAttemptConfig,
    }),
    [prepareNaturalSearchEntry, resolveNaturalSearchAttemptConfig]
  );
};
