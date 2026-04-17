import React from 'react';

import { logger } from '../../../../utils';
import useSearchSubmitOwnerValue from '../../hooks/use-search-submit-owner';
import type { SearchRootSuggestionRuntime } from './search-root-core-runtime-contract';
import type { SearchRootRequestLaneRuntime } from './search-root-request-lane-runtime-contract';
import type { SearchRootPrimitivesRuntime } from './search-root-primitives-runtime-contract';
import type { SearchRootScaffoldRuntime } from './search-root-scaffold-runtime-contract';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';
import type {
  SearchRootPresentationStateRuntime,
  SearchRootResultsActionRuntime,
} from './use-search-root-action-lanes-runtime-contract';
import type { ResultsPresentationOwner } from './use-results-presentation-runtime-owner';
import type { ProfileOwner } from '../profile/profile-owner-runtime';
import type { OverlaySheetSnap } from '../../../../overlays/types';

type UseSearchRootResultsActionRuntimeArgs = {
  rootPrimitivesRuntime: Pick<SearchRootPrimitivesRuntime, 'searchState'>;
  rootSessionRuntime: Pick<SearchRootSessionRuntime, 'primitives'>;
  rootSuggestionRuntime: Pick<SearchRootSuggestionRuntime, 'isSuggestionPanelVisible'>;
  rootScaffoldRuntime: Pick<
    SearchRootScaffoldRuntime,
    'resultsSheetRuntimeOwner' | 'resultsSheetRuntimeLane' | 'instrumentationRuntime'
  >;
  requestLaneRuntime: Pick<SearchRootRequestLaneRuntime, 'resetResultsListScrollProgressRef'>;
  loadMoreResults: ReturnType<typeof useSearchSubmitOwnerValue>['loadMoreResults'];
  searchMode: 'natural' | 'shortcut' | null;
  isSearchLoading: boolean;
  isLoadingMore: boolean;
  canLoadMore: boolean;
  currentPage: number;
  resultsPresentationOwner: Pick<
    ResultsPresentationOwner,
    'closeTransitionActions' | 'preparedResultsSnapshotKey'
  >;
  profileOwner: Pick<ProfileOwner, 'profileViewState'>;
};

const isVisibleResultsSheetSnap = (
  snap: OverlaySheetSnap | 'hidden'
): snap is Exclude<OverlaySheetSnap, 'hidden'> => snap !== 'hidden';

export const useSearchRootResultsActionRuntime = ({
  rootPrimitivesRuntime,
  rootSessionRuntime,
  rootSuggestionRuntime,
  rootScaffoldRuntime,
  requestLaneRuntime,
  loadMoreResults,
  searchMode,
  isSearchLoading,
  isLoadingMore,
  canLoadMore,
  currentPage,
  resultsPresentationOwner,
  profileOwner,
}: UseSearchRootResultsActionRuntimeArgs): SearchRootResultsActionRuntime => {
  const { closeTransitionActions, preparedResultsSnapshotKey } = resultsPresentationOwner;
  const hasUserScrolledResultsRef = React.useRef(false);
  const allowLoadMoreForCurrentScrollRef = React.useRef(true);
  const lastLoadMorePageRef = React.useRef<number | null>(null);
  const loadMoreResultsRef = React.useRef(loadMoreResults);
  const searchModeRef = React.useRef(searchMode);
  const isSearchLoadingRef = React.useRef(isSearchLoading);
  const isLoadingMoreRef = React.useRef(isLoadingMore);
  const canLoadMoreRef = React.useRef(canLoadMore);
  const currentPageRef = React.useRef(currentPage);
  const resultsSheetDraggingRef = React.useRef(false);
  const resultsListScrollingRef = React.useRef(false);
  const resultsSheetSettlingRef = React.useRef(false);
  const pendingResultsSheetSnapRef = React.useRef<Exclude<OverlaySheetSnap, 'hidden'> | null>(null);
  const activeResultsSheetSnapRef = React.useRef<OverlaySheetSnap>('hidden');

  loadMoreResultsRef.current = loadMoreResults;
  searchModeRef.current = searchMode;
  isSearchLoadingRef.current = isSearchLoading;
  isLoadingMoreRef.current = isLoadingMore;
  canLoadMoreRef.current = canLoadMore;
  currentPageRef.current = currentPage;

  const markResultsListUserScrollStart = React.useCallback(() => {
    hasUserScrolledResultsRef.current = true;
    allowLoadMoreForCurrentScrollRef.current = true;
  }, []);

  const resetResultsListScrollProgress = React.useCallback(() => {
    hasUserScrolledResultsRef.current = false;
  }, []);

  const handleResultsEndReached = React.useCallback(() => {
    if (!hasUserScrolledResultsRef.current) {
      return;
    }
    if (!allowLoadMoreForCurrentScrollRef.current) {
      return;
    }
    if (!canLoadMoreRef.current || isSearchLoadingRef.current || isLoadingMoreRef.current) {
      return;
    }

    const nextPage = currentPageRef.current + 1;
    if (lastLoadMorePageRef.current === nextPage) {
      return;
    }

    allowLoadMoreForCurrentScrollRef.current = false;
    lastLoadMorePageRef.current = nextPage;
    if (rootScaffoldRuntime.instrumentationRuntime.shouldLogSearchStateChanges) {
      logger.debug(
        `[SearchPerf] endReached page=${currentPageRef.current} next=${nextPage} mode=${
          searchModeRef.current ?? 'none'
        }`
      );
    }
    loadMoreResultsRef.current(searchModeRef.current);
  }, [rootScaffoldRuntime.instrumentationRuntime.shouldLogSearchStateChanges]);

  const updateSearchInteractionRef = React.useCallback(
    (
      next: Partial<{
        isInteracting: boolean;
        isResultsSheetDragging: boolean;
        isResultsListScrolling: boolean;
        isResultsSheetSettling: boolean;
      }>
    ) => {
      const current = rootSessionRuntime.primitives.searchInteractionRef.current;
      const merged = { ...current, ...next };
      merged.isInteracting =
        merged.isResultsSheetDragging ||
        merged.isResultsListScrolling ||
        merged.isResultsSheetSettling;
      rootSessionRuntime.primitives.searchInteractionRef.current = merged;
      rootScaffoldRuntime.resultsSheetRuntimeLane.mapMotionPressureController.updateInteractionState(
        {
          isSearchInteracting: merged.isInteracting,
          isAnySheetDragging: rootSessionRuntime.primitives.anySheetDraggingRef.current,
        }
      );
    },
    [
      rootScaffoldRuntime.resultsSheetRuntimeLane.mapMotionPressureController,
      rootSessionRuntime.primitives.anySheetDraggingRef,
      rootSessionRuntime.primitives.searchInteractionRef,
    ]
  );

  const handleResultsSheetDragStateChange = React.useCallback(
    (isDragging: boolean) => {
      if (!isDragging && resultsSheetSettlingRef.current) {
        return;
      }
      if (resultsSheetDraggingRef.current === isDragging) {
        return;
      }

      resultsSheetDraggingRef.current = isDragging;
      rootSessionRuntime.primitives.anySheetDraggingRef.current = isDragging;
      updateSearchInteractionRef({ isResultsSheetDragging: isDragging });
      if (isDragging) {
        rootScaffoldRuntime.resultsSheetRuntimeLane.cancelPendingMapMovementUpdates();
        return;
      }
      rootScaffoldRuntime.resultsSheetRuntimeLane.flushDeferredMapMovementState();
    },
    [
      rootScaffoldRuntime.resultsSheetRuntimeLane,
      rootSessionRuntime.primitives.anySheetDraggingRef,
      updateSearchInteractionRef,
    ]
  );

  const setResultsListScrolling = React.useCallback(
    (isScrolling: boolean) => {
      if (resultsListScrollingRef.current === isScrolling) {
        return;
      }

      resultsListScrollingRef.current = isScrolling;
      updateSearchInteractionRef({ isResultsListScrolling: isScrolling });
      if (!isScrolling) {
        rootScaffoldRuntime.resultsSheetRuntimeLane.flushDeferredMapMovementState();
      }
    },
    [rootScaffoldRuntime.resultsSheetRuntimeLane, updateSearchInteractionRef]
  );

  const setResultsSheetSettlingState = React.useCallback(
    (isSettling: boolean) => {
      if (resultsSheetSettlingRef.current === isSettling) {
        return;
      }

      resultsSheetSettlingRef.current = isSettling;
      updateSearchInteractionRef({ isResultsSheetSettling: isSettling });
      if (isSettling) {
        rootScaffoldRuntime.resultsSheetRuntimeLane.cancelPendingMapMovementUpdates();
        return;
      }
      if (resultsSheetDraggingRef.current) {
        handleResultsSheetDragStateChange(false);
      }
      rootScaffoldRuntime.resultsSheetRuntimeLane.flushDeferredMapMovementState();
    },
    [
      handleResultsSheetDragStateChange,
      rootScaffoldRuntime.resultsSheetRuntimeLane,
      updateSearchInteractionRef,
    ]
  );

  const applyResultsSheetSnapChange = React.useCallback(
    (snap: Exclude<OverlaySheetSnap, 'hidden'>) => {
      activeResultsSheetSnapRef.current = snap;
      rootScaffoldRuntime.resultsSheetRuntimeOwner.handleSheetSnapChange(snap);
    },
    [rootScaffoldRuntime.resultsSheetRuntimeOwner]
  );

  const handleResultsSheetSnapStart = React.useCallback(
    (snap: OverlaySheetSnap | 'hidden') => {
      if (!isVisibleResultsSheetSnap(snap)) {
        return;
      }
      pendingResultsSheetSnapRef.current = null;
      applyResultsSheetSnapChange(snap);
    },
    [applyResultsSheetSnapChange]
  );

  const handleResultsSheetSnapChange = React.useCallback(
    (snap: OverlaySheetSnap) => {
      if (!isVisibleResultsSheetSnap(snap)) {
        return;
      }
      if (resultsSheetSettlingRef.current) {
        pendingResultsSheetSnapRef.current = snap;
        return;
      }
      applyResultsSheetSnapChange(snap);
      if (snap === 'collapsed') {
        closeTransitionActions.markSearchSheetCloseSheetSettled(snap);
      }
    },
    [applyResultsSheetSnapChange, closeTransitionActions]
  );

  const handleResultsSheetSettlingChange = React.useCallback(
    (isSettling: boolean) => {
      setResultsSheetSettlingState(isSettling);
      if (isSettling) {
        return;
      }

      let settledSnap = activeResultsSheetSnapRef.current;
      if (pendingResultsSheetSnapRef.current) {
        const pending = pendingResultsSheetSnapRef.current;
        pendingResultsSheetSnapRef.current = null;
        applyResultsSheetSnapChange(pending);
        settledSnap = pending;
      }
      if (settledSnap === 'collapsed') {
        closeTransitionActions.markSearchSheetCloseSheetSettled(settledSnap);
      }
      handleResultsSheetDragStateChange(false);
    },
    [
      applyResultsSheetSnapChange,
      closeTransitionActions,
      handleResultsSheetDragStateChange,
      setResultsSheetSettlingState,
    ]
  );

  const handleResultsListScrollBegin = React.useCallback(() => {
    markResultsListUserScrollStart();
    setResultsListScrolling(true);
  }, [markResultsListUserScrollStart, setResultsListScrolling]);

  const handleResultsListScrollEnd = React.useCallback(() => {
    if (rootScaffoldRuntime.resultsSheetRuntimeOwner.resultsMomentum.value) {
      return;
    }
    setResultsListScrolling(false);
  }, [rootScaffoldRuntime.resultsSheetRuntimeOwner.resultsMomentum, setResultsListScrolling]);

  const handleResultsListMomentumBegin = React.useCallback(() => {
    markResultsListUserScrollStart();
    setResultsListScrolling(true);
  }, [markResultsListUserScrollStart, setResultsListScrolling]);

  const handleResultsListMomentumEnd = React.useCallback(() => {
    setResultsListScrolling(false);
  }, [setResultsListScrolling]);

  const resultsSheetInteractionModel = React.useMemo(
    () => ({
      handleResultsSheetSnapStart,
      handleResultsListScrollBegin,
      handleResultsListScrollEnd,
      handleResultsListMomentumBegin,
      handleResultsListMomentumEnd,
      handleResultsSheetDragStateChange,
      handleResultsSheetSettlingChange,
      handleResultsEndReached,
      handleResultsSheetSnapChange,
      resetResultsListScrollProgress,
    }),
    [
      handleResultsEndReached,
      handleResultsListMomentumBegin,
      handleResultsListMomentumEnd,
      handleResultsListScrollBegin,
      handleResultsListScrollEnd,
      handleResultsSheetDragStateChange,
      handleResultsSheetSettlingChange,
      handleResultsSheetSnapChange,
      handleResultsSheetSnapStart,
      resetResultsListScrollProgress,
    ]
  );

  requestLaneRuntime.resetResultsListScrollProgressRef.current =
    resultsSheetInteractionModel.resetResultsListScrollProgress;

  const presentationState = React.useMemo<SearchRootPresentationStateRuntime>(() => {
    const isSuggestionPanelActive = rootPrimitivesRuntime.searchState.isSuggestionPanelActive;
    const shouldSuspendResultsSheet = profileOwner.profileViewState.presentation.isOverlayVisible;
    const shouldFreezeRestaurantPanelContent =
      profileOwner.profileViewState.presentation.isTransitionAnimating;
    const shouldDimResultsSheet =
      (isSuggestionPanelActive || rootSuggestionRuntime.isSuggestionPanelVisible) &&
      (rootScaffoldRuntime.resultsSheetRuntimeOwner.panelVisible ||
        rootScaffoldRuntime.resultsSheetRuntimeOwner.sheetState !== 'hidden');
    const shouldDisableResultsSheetInteraction =
      shouldSuspendResultsSheet ||
      (isSuggestionPanelActive &&
        (rootScaffoldRuntime.resultsSheetRuntimeOwner.panelVisible ||
          rootScaffoldRuntime.resultsSheetRuntimeOwner.sheetState !== 'hidden'));
    const shouldSuppressRestaurantOverlay =
      profileOwner.profileViewState.presentation.isOverlayVisible && isSuggestionPanelActive;

    return {
      shouldSuspendResultsSheet,
      shouldFreezeRestaurantPanelContent,
      shouldDimResultsSheet,
      shouldDisableResultsSheetInteraction,
      notifyCloseCollapsedBoundaryReached: () =>
        closeTransitionActions.markSearchSheetCloseCollapsedReached('collapsed'),
      shouldSuppressRestaurantOverlay,
      shouldEnableRestaurantOverlayInteraction: !shouldSuppressRestaurantOverlay,
    };
  }, [
    closeTransitionActions,
    profileOwner.profileViewState.presentation.isOverlayVisible,
    profileOwner.profileViewState.presentation.isTransitionAnimating,
    rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
    rootScaffoldRuntime.resultsSheetRuntimeOwner.panelVisible,
    rootScaffoldRuntime.resultsSheetRuntimeOwner.sheetState,
    rootSuggestionRuntime.isSuggestionPanelVisible,
  ]);

  return React.useMemo(
    () => ({
      resultsSheetInteractionModel,
      presentationState,
      closeTransitionActions,
      preparedResultsSnapshotKey,
    }),
    [
      closeTransitionActions,
      preparedResultsSnapshotKey,
      presentationState,
      resultsSheetInteractionModel,
    ]
  );
};
