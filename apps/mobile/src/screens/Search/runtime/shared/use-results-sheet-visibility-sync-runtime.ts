import React from 'react';

import type { ResultsSheetVisibilityActionsRuntime } from './use-results-sheet-visibility-actions-runtime';
import type { ResultsSheetSharedValuesRuntime } from './use-results-sheet-shared-values-runtime';
import type { ResultsSheetVisibilityStateRuntime } from './use-results-sheet-visibility-state-runtime';

type UseResultsSheetVisibilitySyncRuntimeArgs = {
  isSearchOverlay: boolean;
  shouldShowDockedPollsTarget: boolean;
  lastVisibleSheetStateRef: React.MutableRefObject<'expanded' | 'middle' | 'collapsed'>;
  navBarTopForSnaps: number;
  sheetLayoutRuntime: Pick<ResultsSheetSharedValuesRuntime, 'setSheetTranslateYTo'>;
  visibilityStateRuntime: Pick<ResultsSheetVisibilityStateRuntime, 'panelVisible' | 'sheetState'>;
  visibilityActionsRuntime: Pick<ResultsSheetVisibilityActionsRuntime, 'showPanelInstant'>;
};

export const useResultsSheetVisibilitySyncRuntime = ({
  isSearchOverlay,
  shouldShowDockedPollsTarget,
  lastVisibleSheetStateRef,
  navBarTopForSnaps,
  sheetLayoutRuntime,
  visibilityStateRuntime,
  visibilityActionsRuntime,
}: UseResultsSheetVisibilitySyncRuntimeArgs): void => {
  React.useEffect(() => {
    if (!isSearchOverlay) {
      return;
    }
    if (shouldShowDockedPollsTarget) {
      return;
    }
    if (visibilityStateRuntime.panelVisible) {
      return;
    }
    sheetLayoutRuntime.setSheetTranslateYTo('hidden');
  }, [
    isSearchOverlay,
    sheetLayoutRuntime,
    shouldShowDockedPollsTarget,
    visibilityStateRuntime.panelVisible,
  ]);

  const lastNavBarTopForSnapsRef = React.useRef(navBarTopForSnaps);
  React.useEffect(() => {
    const previous = lastNavBarTopForSnapsRef.current;
    if (previous === navBarTopForSnaps) {
      return;
    }
    lastNavBarTopForSnapsRef.current = navBarTopForSnaps;
    if (visibilityStateRuntime.sheetState !== 'collapsed') {
      return;
    }
    if (!Number.isFinite(navBarTopForSnaps)) {
      return;
    }
    if (Number.isFinite(previous) && Math.abs(navBarTopForSnaps - previous) < 1) {
      return;
    }
    visibilityActionsRuntime.showPanelInstant('collapsed');
  }, [navBarTopForSnaps, visibilityActionsRuntime, visibilityStateRuntime.sheetState]);

  React.useEffect(() => {
    if (visibilityStateRuntime.sheetState !== 'hidden') {
      lastVisibleSheetStateRef.current = visibilityStateRuntime.sheetState;
    }
  }, [lastVisibleSheetStateRef, visibilityStateRuntime.sheetState]);
};
