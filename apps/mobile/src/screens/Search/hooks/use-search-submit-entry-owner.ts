import React from 'react';
import { Keyboard, unstable_batchedUpdates } from 'react-native';

import type { NaturalSearchRequest } from '../../../types';
import { DEFAULT_SEGMENT } from '../constants/search';
import type { SegmentValue } from '../constants/search';
import { createEntitySubmitIntentPayload } from '../runtime/adapters/entity-adapter';
import { createShortcutSubmitIntentPayload } from '../runtime/adapters/shortcut-adapter';
import type { SearchRuntimeBus, SearchRuntimeBusState } from '../runtime/shared/search-runtime-bus';
import { publishSearchMountedResultsDataSnapshot } from '../runtime/shared/search-mounted-results-data-store';
import type { SearchSubmitEntrySurface } from '../runtime/shared/search-submit-entry-surface-contract';
import type { SearchRequestRuntimeOwner } from './use-search-request-runtime-owner';

export type { SearchSubmitEntrySurface } from '../runtime/shared/search-submit-entry-surface-contract';

export type SearchMode = 'natural' | 'shortcut' | null;
export type SearchSubmitPresentationIntentKind =
  | 'initial_search'
  | 'shortcut_rerun'
  | 'search_this_area';

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
  presentationIntentKind?: Extract<SearchSubmitPresentationIntentKind, 'search_this_area'>;
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
  presentationIntentKind?: Extract<SearchSubmitPresentationIntentKind, 'search_this_area'>;
  effectiveOpenNow: boolean;
  effectivePriceLevels: number[];
  effectiveIncludeSimilar: boolean;
  effectiveRising: boolean;
  shouldForceFreshBounds: boolean;
  entrySurface: SearchSubmitEntrySurface;
};

export type StructuredInitialAttemptConfig = {
  submitPayload:
    | ReturnType<typeof createEntitySubmitIntentPayload>
    | ReturnType<typeof createShortcutSubmitIntentPayload>;
  foregroundUi: {
    kind: SearchSubmitPresentationIntentKind;
    mode: SearchMode;
    preserveSheetState: boolean;
    transitionFromDockedPolls: boolean;
    presentationIntentKind?: Extract<SearchSubmitPresentationIntentKind, 'search_this_area'>;
    targetTab: SegmentValue;
    submittedLabel: string;
    shouldResetPagination: boolean;
    logLabel: string;
    replaceResultsLabel?: string;
    entrySurface: SearchSubmitEntrySurface;
  };
  errorLogLabel: string;
  finalizeReason: string;
};

export type StructuredAppendAttemptConfig = {
  submitPayload: ReturnType<typeof createShortcutSubmitIntentPayload>;
  errorLogLabel: string;
  submittedLabel: string;
};

type PrepareNaturalSearchEntryResult = {
  append: boolean;
  targetPage: number;
  trimmedQuery: string;
};

type SubmitUiLanesOptions = {
  mode: SearchMode;
  targetTab: SegmentValue;
  shouldResetPagination: boolean;
  submittedLabel?: string;
};

type PrepareSearchRequestForegroundUiOptions = StructuredInitialAttemptConfig['foregroundUi'];

type PrepareNaturalSearchForegroundUiOptions = {
  preserveSheetState: boolean;
  transitionFromDockedPolls: boolean;
  targetTab: SegmentValue;
  submittedLabel: string;
  replaceResultsLabel?: string;
  presentationIntentKind?: Extract<SearchSubmitPresentationIntentKind, 'search_this_area'>;
  entrySurface: SearchSubmitEntrySurface;
};

type UseSearchSubmitEntryOwnerArgs = {
  query: string;
  submittedQuery: string;
  preferredActiveTab: SegmentValue;
  hasActiveTabPreference: boolean;
  isLoadingMore: boolean;
  openNow: boolean;
  priceLevels: number[];
  risingActive: boolean;
  setActiveTab: React.Dispatch<React.SetStateAction<SegmentValue>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  searchRuntimeBus: SearchRuntimeBus;
  clearMapHighlightedRestaurantId?: () => void;
  resetMapMoveFlag: () => void;
  activeOperationTupleRef: SearchRequestRuntimeOwner['activeOperationTupleRef'];
  activeLoadingMoreTokenRef: SearchRequestRuntimeOwner['activeLoadingMoreTokenRef'];
  isSearchRequestInFlightRef: SearchRequestRuntimeOwner['isSearchRequestInFlightRef'];
  publishRuntimeLaneState: SearchRequestRuntimeOwner['publishRuntimeLaneState'];
  setSearchRequestInFlight: SearchRequestRuntimeOwner['setSearchRequestInFlight'];
  lastAutoOpenKeyRef: React.MutableRefObject<string | null>;
  logSearchPhase?: (label: string) => void;
  onPresentationIntentStart?: (params: {
    kind: SearchSubmitPresentationIntentKind;
    mode: SearchMode;
    preserveSheetState: boolean;
    transitionFromDockedPolls: boolean;
    targetTab: SegmentValue;
    submittedLabel?: string;
    entrySurface: SearchSubmitEntrySurface;
  }) => void;
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
  presentationIntentKind?: Extract<SearchSubmitPresentationIntentKind, 'search_this_area'>;
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
  query,
  submittedQuery,
  preferredActiveTab,
  hasActiveTabPreference,
  isLoadingMore,
  openNow,
  priceLevels,
  risingActive,
  setActiveTab,
  setError,
  searchRuntimeBus,
  clearMapHighlightedRestaurantId,
  resetMapMoveFlag,
  activeOperationTupleRef,
  activeLoadingMoreTokenRef,
  isSearchRequestInFlightRef,
  publishRuntimeLaneState,
  setSearchRequestInFlight,
  lastAutoOpenKeyRef,
  logSearchPhase = () => {},
  onPresentationIntentStart,
}: UseSearchSubmitEntryOwnerArgs) => {
  const scheduleAfterTwoFrames = React.useCallback((run: () => void) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          run();
        });
      });
      return;
    }
    run();
  }, []);

  const runNonCriticalStateUpdate = React.useCallback((run: () => void) => {
    if (typeof React.startTransition === 'function') {
      React.startTransition(() => {
        run();
      });
      return;
    }
    run();
  }, []);

  const scheduleSubmitUiLanes = React.useCallback(
    ({ mode, targetTab, shouldResetPagination, submittedLabel }: SubmitUiLanesOptions) => {
      const activeTuple = activeOperationTupleRef.current;
      searchRuntimeBus.batch(() => {
        publishRuntimeLaneState(activeTuple, 'lane_a_ack', {
          isMapActivationDeferred: true,
        });
      });

      unstable_batchedUpdates(() => {
        lastAutoOpenKeyRef.current = null;
        activeLoadingMoreTokenRef.current = null;
      });
      searchRuntimeBus.batch(() => {
        const laneAStatePatch: Partial<SearchRuntimeBusState> = {
          activeTab: targetTab,
          pendingTabSwitchTab: null,
          searchMode: mode,
          isSearchSessionActive: mode != null,
          isLoadingMore: false,
          submittedQuery: submittedLabel ?? submittedQuery,
        };
        publishRuntimeLaneState(activeOperationTupleRef.current, 'lane_a_ack', laneAStatePatch);
      });
      setActiveTab(targetTab);

      if (shouldResetPagination) {
        scheduleAfterTwoFrames(() => {
          runNonCriticalStateUpdate(() => {
            searchRuntimeBus.publish({
              hasMoreFood: false,
              hasMoreRestaurants: false,
              isPaginationExhausted: false,
              currentPage: 1,
            });
          });
        });
      }
    },
    [
      activeLoadingMoreTokenRef,
      activeOperationTupleRef,
      lastAutoOpenKeyRef,
      publishRuntimeLaneState,
      runNonCriticalStateUpdate,
      scheduleAfterTwoFrames,
      searchRuntimeBus,
      setActiveTab,
      submittedQuery,
    ]
  );

  const clearResultsForReplacement = React.useCallback(
    (submittedQueryOverride?: string) => {
      clearMapHighlightedRestaurantId?.();
      publishSearchMountedResultsDataSnapshot(null);
      searchRuntimeBus.publish({
        resultsRequestKey: null,
        resultsIdentityCandidateKey: null,
        resultsPage: null,
        resultsDishCount: 0,
        resultsRestaurantCount: 0,
        currentPage: 1,
        hasMoreFood: false,
        hasMoreRestaurants: false,
        isPaginationExhausted: false,
        isLoadingMore: false,
        canLoadMore: false,
        submittedQuery: submittedQueryOverride ?? submittedQuery,
      });
    },
    [clearMapHighlightedRestaurantId, searchRuntimeBus, submittedQuery]
  );

  const prepareSearchRequestForegroundUi = React.useCallback(
    ({
      kind,
      mode,
      preserveSheetState,
      transitionFromDockedPolls,
      targetTab,
      submittedLabel,
      shouldResetPagination,
      logLabel,
      replaceResultsLabel,
      presentationIntentKind,
      entrySurface,
    }: PrepareSearchRequestForegroundUiOptions) => {
      // Same new-search reset as the natural path (see resolveNaturalSearchAttemptConfig):
      // structured launches (shortcut/entity/favorites) from outside the results surface
      // start with "Include similar" off; the payload build reads the bus afterwards.
      if (entrySurface !== 'results' && searchRuntimeBus.getState().includeSimilarActive) {
        searchRuntimeBus.publish({ includeSimilarActive: false });
      }
      setSearchRequestInFlight(true);
      onPresentationIntentStart?.({
        kind: presentationIntentKind ?? kind,
        mode,
        preserveSheetState,
        transitionFromDockedPolls,
        targetTab,
        submittedLabel,
        entrySurface,
      });
      scheduleSubmitUiLanes({
        mode,
        targetTab,
        shouldResetPagination,
        submittedLabel,
      });
      setError(null);
      Keyboard.dismiss();
      logSearchPhase(`${logLabel}:ui-lanes-scheduled`);
      if (replaceResultsLabel && presentationIntentKind !== 'search_this_area') {
        clearResultsForReplacement(replaceResultsLabel);
      }
    },
    [
      clearResultsForReplacement,
      logSearchPhase,
      onPresentationIntentStart,
      scheduleSubmitUiLanes,
      searchRuntimeBus,
      setError,
      setSearchRequestInFlight,
    ]
  );

  const prepareNaturalSearchForegroundUi = React.useCallback(
    ({
      preserveSheetState,
      transitionFromDockedPolls,
      targetTab,
      submittedLabel,
      replaceResultsLabel,
      presentationIntentKind,
      entrySurface,
    }: PrepareNaturalSearchForegroundUiOptions) => {
      setSearchRequestInFlight(true);
      onPresentationIntentStart?.({
        kind: presentationIntentKind ?? 'initial_search',
        mode: 'natural',
        preserveSheetState,
        transitionFromDockedPolls,
        targetTab,
        submittedLabel,
        entrySurface,
      });
      scheduleSubmitUiLanes({
        mode: 'natural',
        targetTab,
        shouldResetPagination: false,
      });
      activeLoadingMoreTokenRef.current = null;
      logSearchPhase('submitSearch:ui-lanes-scheduled');
      if (replaceResultsLabel && presentationIntentKind !== 'search_this_area') {
        clearResultsForReplacement(replaceResultsLabel);
      }
    },
    [
      activeLoadingMoreTokenRef,
      clearResultsForReplacement,
      logSearchPhase,
      onPresentationIntentStart,
      scheduleSubmitUiLanes,
      setSearchRequestInFlight,
    ]
  );

  const createRestaurantEntityInitialAttemptConfig = React.useCallback(
    ({
      restaurantId,
      restaurantName,
      preserveSheetState,
      entrySurface,
    }: {
      restaurantId: string;
      restaurantName: string;
      preserveSheetState: boolean;
      entrySurface: SearchSubmitEntrySurface;
    }): StructuredInitialAttemptConfig => ({
      submitPayload: createEntitySubmitIntentPayload({
        restaurantId,
        restaurantName,
        preserveSheetState,
      }),
      foregroundUi: {
        kind: 'initial_search',
        mode: 'natural',
        preserveSheetState,
        transitionFromDockedPolls: false,
        targetTab: 'restaurants',
        submittedLabel: restaurantName,
        shouldResetPagination: true,
        logLabel: 'runRestaurantEntitySearch',
        entrySurface,
      },
      errorLogLabel: 'Structured restaurant search failed',
      finalizeReason: 'entity_finalized_without_response_lifecycle',
    }),
    []
  );

  const createShortcutStructuredInitialAttemptConfig = React.useCallback(
    ({
      targetTab,
      submittedLabel,
      preserveSheetState,
      transitionFromDockedPolls,
      replaceResultsInPlace,
      presentationIntentKind,
      entrySurface,
    }: {
      targetTab: SegmentValue;
      submittedLabel: string;
      preserveSheetState: boolean;
      transitionFromDockedPolls: boolean;
      replaceResultsInPlace: boolean;
      presentationIntentKind?: Extract<SearchSubmitPresentationIntentKind, 'search_this_area'>;
      entrySurface: SearchSubmitEntrySurface;
    }): StructuredInitialAttemptConfig => ({
      submitPayload: createShortcutSubmitIntentPayload({
        targetTab,
        submittedLabel,
        preserveSheetState,
        targetPage: 1,
        append: false,
      }),
      foregroundUi: {
        kind: 'shortcut_rerun',
        mode: 'shortcut',
        preserveSheetState,
        transitionFromDockedPolls,
        presentationIntentKind,
        targetTab,
        submittedLabel,
        shouldResetPagination: true,
        logLabel: 'runBestHere',
        replaceResultsLabel: replaceResultsInPlace ? submittedLabel : undefined,
        entrySurface,
      },
      errorLogLabel: 'Best here request failed',
      finalizeReason: 'shortcut_finalized_without_response_lifecycle',
    }),
    []
  );

  const createShortcutStructuredAppendAttemptConfig = React.useCallback(
    ({
      targetTab,
      submittedQuery: nextSubmittedQuery,
      targetPage,
    }: {
      targetTab: SegmentValue;
      submittedQuery: string;
      targetPage: number;
    }): StructuredAppendAttemptConfig => {
      const submittedLabel = nextSubmittedQuery || 'Best dishes here';
      return {
        submitPayload: createShortcutSubmitIntentPayload({
          targetTab,
          submittedLabel,
          preserveSheetState: true,
          targetPage,
          append: true,
        }),
        errorLogLabel: 'Best dishes here pagination failed',
        submittedLabel,
      };
    },
    []
  );

  const prepareNaturalSearchEntry = React.useCallback(
    (
      options?: SubmitSearchOptions,
      overrideQuery?: string
    ): PrepareNaturalSearchEntryResult | null => {
      const append = Boolean(options?.append);
      if (append && (isSearchRequestInFlightRef.current || isLoadingMore)) {
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

      return {
        append,
        targetPage,
        trimmedQuery,
      };
    },
    [isLoadingMore, isSearchRequestInFlightRef, query, resetMapMoveFlag, searchRuntimeBus, setError]
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
        searchRuntimeBus.publish({ includeSimilarActive: false });
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
      prepareSearchRequestForegroundUi,
      prepareNaturalSearchForegroundUi,
      createRestaurantEntityInitialAttemptConfig,
      createShortcutStructuredInitialAttemptConfig,
      createShortcutStructuredAppendAttemptConfig,
      prepareNaturalSearchEntry,
      resolveNaturalSearchAttemptConfig,
    }),
    [
      createRestaurantEntityInitialAttemptConfig,
      createShortcutStructuredAppendAttemptConfig,
      createShortcutStructuredInitialAttemptConfig,
      prepareNaturalSearchEntry,
      prepareNaturalSearchForegroundUi,
      prepareSearchRequestForegroundUi,
      resolveNaturalSearchAttemptConfig,
    ]
  );
};
