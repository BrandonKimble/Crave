import React from 'react';

import type { ResultsPresentationSurfaceAuthority } from './results-presentation-surface-authority';
import {
  commitSearchMountedResultsHydrationRuntimeSnapshot,
  registerSearchMountedResultsMotionInteractionRef,
} from './search-mounted-results-data-store';
import type { SearchRootSearchSceneListHydrationPatch } from './use-search-root-search-scene-list-hydration-patch-runtime';
import type { RouteSceneSwitchAuthority } from './route-authority-contract';
import type { SearchRuntimeInteractionState } from './use-search-root-session-runtime-contract';

type HydrationPublicationPayload = {
  activeTab: 'dishes' | 'restaurants';
  searchSceneListHydrationPatch: SearchRootSearchSceneListHydrationPatch;
};

const isResultsMotionLaneBlocked = (
  searchInteractionRef: React.MutableRefObject<SearchRuntimeInteractionState>
): boolean => {
  const interactionState = searchInteractionRef.current;
  return (
    interactionState.isResultsSheetDragging === true ||
    interactionState.isResultsSheetSettling === true
  );
};

export const useResultsPresentationSurfaceHydrationPublicationRuntime = ({
  activeTab,
  resultsPresentationSurfaceAuthority,
  routeSceneSwitchAuthority,
  searchInteractionRef,
  searchSceneListHydrationPatch,
}: {
  activeTab: 'dishes' | 'restaurants';
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
  routeSceneSwitchAuthority: RouteSceneSwitchAuthority;
  searchInteractionRef: React.MutableRefObject<SearchRuntimeInteractionState>;
  searchSceneListHydrationPatch: SearchRootSearchSceneListHydrationPatch;
}) => {
  void routeSceneSwitchAuthority;
  const pendingPublicationRef = React.useRef<HydrationPublicationPayload | null>(null);
  const publicationFrameRef = React.useRef<number | null>(null);
  const publicationTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const commitPublication = React.useCallback(
    (payload: HydrationPublicationPayload) => {
      const currentSurfaceSnapshot = resultsPresentationSurfaceAuthority.getSnapshot();
      const nextListPreparedRowsReady =
        payload.searchSceneListHydrationPatch.resultsPreparedRowsKey != null &&
        currentSurfaceSnapshot.preparedRows.readyReadinessKey ===
          payload.searchSceneListHydrationPatch.resultsPreparedRowsKey;
      resultsPresentationSurfaceAuthority.publish(
        {
          resultsHydrationKey: payload.searchSceneListHydrationPatch.resultsHydrationKey,
          hydratedResultsKey: payload.searchSceneListHydrationPatch.hydratedResultsKey,
          resultsPreparedRowsKey: payload.searchSceneListHydrationPatch.resultsPreparedRowsKey,
          isResultsHydrationSettled:
            payload.searchSceneListHydrationPatch.isResultsHydrationSettled,
          listPreparedRowsReady: nextListPreparedRowsReady,
        },
        'search_scene_list_hydration'
      );
      commitSearchMountedResultsHydrationRuntimeSnapshot({
        activeTab: payload.activeTab,
        hydratedResultsKey: payload.searchSceneListHydrationPatch.hydratedResultsKey,
        isResultsHydrationSettled:
          payload.searchSceneListHydrationPatch.isResultsHydrationSettled,
        resultsHydrationKey: payload.searchSceneListHydrationPatch.resultsHydrationKey,
        shouldHydrateResultsForRender:
          payload.searchSceneListHydrationPatch.shouldHydrateResultsForRender,
      });
    },
    [resultsPresentationSurfaceAuthority]
  );

  const cancelDeferredPublication = React.useCallback(() => {
    if (publicationFrameRef.current != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(publicationFrameRef.current);
      publicationFrameRef.current = null;
    }
    if (publicationTimeoutRef.current != null) {
      clearTimeout(publicationTimeoutRef.current);
      publicationTimeoutRef.current = null;
    }
  }, []);

  const scheduleDeferredPublication = React.useCallback(() => {
    if (publicationFrameRef.current != null || publicationTimeoutRef.current != null) {
      return;
    }
    const flushDeferredPublication = () => {
      publicationFrameRef.current = null;
      publicationTimeoutRef.current = null;
      const payload = pendingPublicationRef.current;
      if (payload == null) {
        return;
      }
      if (isResultsMotionLaneBlocked(searchInteractionRef)) {
        scheduleDeferredPublication();
        return;
      }
      pendingPublicationRef.current = null;
      commitPublication(payload);
    };
    if (typeof requestAnimationFrame === 'function') {
      publicationFrameRef.current = requestAnimationFrame(flushDeferredPublication);
      return;
    }
    publicationTimeoutRef.current = setTimeout(flushDeferredPublication, 16);
  }, [commitPublication, searchInteractionRef]);

  React.useEffect(
    () => () => {
      pendingPublicationRef.current = null;
      cancelDeferredPublication();
    },
    [cancelDeferredPublication]
  );

  React.useEffect(
    () => registerSearchMountedResultsMotionInteractionRef(searchInteractionRef),
    [searchInteractionRef]
  );

  React.useEffect(() => {
    const payload: HydrationPublicationPayload = {
      activeTab,
      searchSceneListHydrationPatch,
    };
    if (isResultsMotionLaneBlocked(searchInteractionRef)) {
      pendingPublicationRef.current = payload;
      scheduleDeferredPublication();
      return;
    }
    pendingPublicationRef.current = null;
    cancelDeferredPublication();
    commitPublication(payload);
  }, [
    activeTab,
    cancelDeferredPublication,
    commitPublication,
    scheduleDeferredPublication,
    searchInteractionRef,
    searchSceneListHydrationPatch,
  ]);
};
