import React from 'react';
import { Keyboard, unstable_batchedUpdates } from 'react-native';

import type { NaturalSearchRequest } from '../../../types';
import { DEFAULT_SEGMENT, MINIMUM_VOTES_FILTER } from '../constants/search';
import type { SegmentValue } from '../constants/search';
import { createEntitySubmitIntentPayload } from '../runtime/adapters/entity-adapter';
import { createShortcutSubmitIntentPayload } from '../runtime/adapters/shortcut-adapter';
import type { SearchRuntimeBus, SearchRuntimeBusState } from '../runtime/shared/search-runtime-bus';
import type { SearchRequestRuntimeOwner } from './use-search-request-runtime-owner';

export type SearchMode = 'natural' | 'shortcut' | null;

export type SubmitSearchOptions = {
  openNow?: boolean;
  priceLevels?: number[] | null;
  minimumVotes?: number | null;
  page?: number;
  append?: boolean;
  preserveSheetState?: boolean;
  replaceResultsInPlace?: boolean;
  transitionFromDockedPolls?: boolean;
  forceFreshBounds?: boolean;
  scoreMode?: NaturalSearchRequest['scoreMode'];
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
  effectiveOpenNow: boolean;
  effectivePriceLevels: number[];
  effectiveMinimumVotes: number | null;
  shouldForceFreshBounds: boolean;
};

export type StructuredInitialAttemptConfig = {
  submitPayload:
    | ReturnType<typeof createEntitySubmitIntentPayload>
    | ReturnType<typeof createShortcutSubmitIntentPayload>;
  foregroundUi: {
    kind: 'initial_search' | 'shortcut_rerun';
    mode: SearchMode;
    preserveSheetState: boolean;
    transitionFromDockedPolls: boolean;
    targetTab: SegmentValue;
    submittedLabel: string;
    shouldResetPagination: boolean;
    logLabel: string;
    replaceResultsLabel?: string;
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
};

type UseSearchSubmitEntryOwnerArgs = {
  query: string;
  submittedQuery: string;
  preferredActiveTab: SegmentValue;
  hasActiveTabPreference: boolean;
  isLoadingMore: boolean;
  openNow: boolean;
  priceLevels: number[];
  votes100Plus: boolean;
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
    kind: 'initial_search' | 'shortcut_rerun';
    mode: SearchMode;
    preserveSheetState: boolean;
    transitionFromDockedPolls: boolean;
    targetTab: SegmentValue;
    submittedLabel?: string;
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

export const useSearchSubmitEntryOwner = ({
  query,
  submittedQuery,
  preferredActiveTab,
  hasActiveTabPreference,
  isLoadingMore,
  openNow,
  priceLevels,
  votes100Plus,
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
    ({ targetTab, shouldResetPagination, submittedLabel }: SubmitUiLanesOptions) => {
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
      searchRuntimeBus.publish({
        results: null,
        resultsRequestKey: null,
        currentPage: 1,
        hasMoreFood: false,
        hasMoreRestaurants: false,
        isPaginationExhausted: false,
        isLoadingMore: false,
        canLoadMore: false,
        precomputedMarkerCatalog: null,
        precomputedMarkerPrimaryCount: 0,
        precomputedCanonicalRestaurantRankById: null,
        precomputedRestaurantsById: null,
        precomputedMarkerResultsKey: null,
        precomputedMarkerActiveTab: null,
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
    }: PrepareSearchRequestForegroundUiOptions) => {
      setSearchRequestInFlight(true);
      onPresentationIntentStart?.({
        kind,
        mode,
        preserveSheetState,
        transitionFromDockedPolls,
        targetTab,
        submittedLabel,
      });
      scheduleSubmitUiLanes({
        targetTab,
        shouldResetPagination,
        submittedLabel,
      });
      setError(null);
      Keyboard.dismiss();
      logSearchPhase(`${logLabel}:ui-lanes-scheduled`);
      if (replaceResultsLabel) {
        clearResultsForReplacement(replaceResultsLabel);
      }
    },
    [
      clearResultsForReplacement,
      logSearchPhase,
      onPresentationIntentStart,
      scheduleSubmitUiLanes,
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
    }: PrepareNaturalSearchForegroundUiOptions) => {
      setSearchRequestInFlight(true);
      onPresentationIntentStart?.({
        kind: 'initial_search',
        mode: 'natural',
        preserveSheetState,
        transitionFromDockedPolls,
        targetTab,
        submittedLabel,
      });
      scheduleSubmitUiLanes({
        targetTab,
        shouldResetPagination: false,
      });
      activeLoadingMoreTokenRef.current = null;
      logSearchPhase('submitSearch:ui-lanes-scheduled');
      if (replaceResultsLabel) {
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
    }: {
      restaurantId: string;
      restaurantName: string;
      preserveSheetState: boolean;
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
    }: {
      targetTab: SegmentValue;
      submittedLabel: string;
      preserveSheetState: boolean;
      transitionFromDockedPolls: boolean;
      replaceResultsInPlace: boolean;
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
        targetTab,
        submittedLabel,
        shouldResetPagination: true,
        logLabel: 'runBestHere',
        replaceResultsLabel: replaceResultsInPlace ? submittedLabel : undefined,
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
          searchRuntimeBus.publish({
            results: null,
            resultsRequestKey: null,
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
      const effectiveOpenNow = options?.openNow ?? openNow;
      const effectivePriceLevels =
        options?.priceLevels !== undefined ? options.priceLevels : priceLevels;
      const effectiveMinimumVotes =
        options?.minimumVotes !== undefined
          ? options.minimumVotes
          : votes100Plus
          ? MINIMUM_VOTES_FILTER
          : null;

      return {
        submissionSource,
        submissionContext,
        preRequestTab,
        preserveSheetState,
        transitionFromDockedPolls,
        shouldReplaceResultsInPlace,
        effectiveOpenNow,
        effectivePriceLevels,
        effectiveMinimumVotes,
        shouldForceFreshBounds: Boolean(options?.forceFreshBounds),
      };
    },
    [hasActiveTabPreference, openNow, preferredActiveTab, priceLevels, votes100Plus]
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
