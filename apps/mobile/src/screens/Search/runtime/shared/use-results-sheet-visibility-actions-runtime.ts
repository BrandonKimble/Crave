import React from 'react';

import type { OverlaySheetSnap } from '../../../../overlays/types';
import type { SheetPosition } from '../../../../overlays/sheetUtils';
import type { ResultsSheetRuntimeOwner } from './results-sheet-runtime-contract';
import type { ResultsSheetSharedValuesRuntime } from './use-results-sheet-shared-values-runtime';
import type { ResultsSheetVisibilityStateRuntime } from './use-results-sheet-visibility-state-runtime';

type UseResultsSheetVisibilityActionsRuntimeArgs = {
  isSearchOverlay: boolean;
  shouldShowDockedPollsTarget: boolean;
  pollsSheetSnap: OverlaySheetSnap;
  isDockedPollsDismissed: boolean;
  hasUserSharedSnap: boolean;
  sharedSnap: Exclude<OverlaySheetSnap, 'hidden'>;
  sheetLayoutRuntime: Pick<ResultsSheetRuntimeOwner, 'resultsSheetRuntimeModel'> &
    Pick<ResultsSheetSharedValuesRuntime, 'setSheetTranslateYTo'>;
  visibilityStateRuntime: Pick<
    ResultsSheetVisibilityStateRuntime,
    'panelVisibleRef' | 'sheetStateRef' | 'setPanelVisible' | 'setSheetState'
  >;
};

export type ResultsSheetVisibilityActionsRuntime = Pick<
  ResultsSheetRuntimeOwner,
  'animateSheetTo' | 'resetResultsSheetToHidden' | 'prepareShortcutSheetTransition'
> & {
  showPanelInstant: (position?: SheetPosition) => void;
};

export const useResultsSheetVisibilityActionsRuntime = ({
  isSearchOverlay,
  shouldShowDockedPollsTarget,
  pollsSheetSnap,
  isDockedPollsDismissed,
  hasUserSharedSnap,
  sharedSnap,
  sheetLayoutRuntime,
  visibilityStateRuntime,
}: UseResultsSheetVisibilityActionsRuntimeArgs): ResultsSheetVisibilityActionsRuntime => {
  const animateSheetTo = React.useCallback(
    (position: SheetPosition, velocity = 0) => {
      if (position !== 'hidden') {
        visibilityStateRuntime.panelVisibleRef.current = true;
        visibilityStateRuntime.setPanelVisible(true);
      }
      sheetLayoutRuntime.resultsSheetRuntimeModel.snapController.requestSnap(position, velocity);
    },
    [sheetLayoutRuntime, visibilityStateRuntime]
  );

  const resetResultsSheetToHidden = React.useCallback(() => {
    visibilityStateRuntime.panelVisibleRef.current = false;
    visibilityStateRuntime.sheetStateRef.current = 'hidden';
    visibilityStateRuntime.setPanelVisible(false);
    visibilityStateRuntime.setSheetState('hidden');
    sheetLayoutRuntime.resultsSheetRuntimeModel.snapController.clearCommand();
    if (isSearchOverlay) {
      sheetLayoutRuntime.setSheetTranslateYTo('hidden');
    }
  }, [isSearchOverlay, sheetLayoutRuntime, visibilityStateRuntime]);

  const showPanelInstant = React.useCallback(
    (position: SheetPosition = 'middle') => {
      visibilityStateRuntime.panelVisibleRef.current = true;
      visibilityStateRuntime.sheetStateRef.current = position;
      visibilityStateRuntime.setPanelVisible(true);
      visibilityStateRuntime.setSheetState(position);
      sheetLayoutRuntime.resultsSheetRuntimeModel.snapController.clearCommand();
      if (isSearchOverlay) {
        sheetLayoutRuntime.setSheetTranslateYTo(position);
      }
    },
    [isSearchOverlay, sheetLayoutRuntime, visibilityStateRuntime]
  );

  const prepareShortcutSheetTransition = React.useCallback(() => {
    if (!shouldShowDockedPollsTarget) {
      return false;
    }
    const transitionSnap: Exclude<OverlaySheetSnap, 'hidden'> =
      pollsSheetSnap !== 'hidden'
        ? pollsSheetSnap
        : isDockedPollsDismissed
          ? 'collapsed'
          : hasUserSharedSnap
            ? sharedSnap
            : 'expanded';
    showPanelInstant(transitionSnap);
    return true;
  }, [
    hasUserSharedSnap,
    isDockedPollsDismissed,
    pollsSheetSnap,
    sharedSnap,
    shouldShowDockedPollsTarget,
    showPanelInstant,
  ]);

  return React.useMemo(
    () => ({
      animateSheetTo,
      resetResultsSheetToHidden,
      prepareShortcutSheetTransition,
      showPanelInstant,
    }),
    [animateSheetTo, prepareShortcutSheetTransition, resetResultsSheetToHidden, showPanelInstant]
  );
};
