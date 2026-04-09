import type { OverlaySheetSnap } from '../../../../overlays/types';
import type { SearchCloseTransitionState } from './results-presentation-shell-contract';

export const createSearchCloseTransitionState = (
  closeIntentId: string
): Exclude<SearchCloseTransitionState, null> => ({
  closeIntentId,
  mapExitSettled: false,
  sheetCollapsedReached: false,
  sheetCollapsedSettled: false,
});

export const applySearchCloseMapExitSettled = ({
  current,
  closeIntentId,
}: {
  current: SearchCloseTransitionState;
  closeIntentId: string;
}): {
  nextState: SearchCloseTransitionState;
  shouldFinalize: boolean;
} => {
  if (!current || current.closeIntentId !== closeIntentId || current.mapExitSettled) {
    return {
      nextState: current,
      shouldFinalize: false,
    };
  }
  const nextState = {
    ...current,
    mapExitSettled: true,
  };
  return {
    nextState,
    shouldFinalize: nextState.mapExitSettled && nextState.sheetCollapsedSettled,
  };
};

export const applySearchCloseCollapsedReached = ({
  current,
  closeIntentId,
  snap,
}: {
  current: SearchCloseTransitionState;
  closeIntentId: string | null;
  snap: OverlaySheetSnap;
}): SearchCloseTransitionState => {
  if (snap !== 'collapsed' || !closeIntentId) {
    return current;
  }
  if (!current || current.closeIntentId !== closeIntentId || current.sheetCollapsedReached) {
    return current;
  }
  return {
    ...current,
    sheetCollapsedReached: true,
  };
};

export const applySearchCloseSheetSettled = ({
  current,
  closeIntentId,
  snap,
}: {
  current: SearchCloseTransitionState;
  closeIntentId: string | null;
  snap: OverlaySheetSnap;
}): {
  nextState: SearchCloseTransitionState;
  shouldFinalize: boolean;
} => {
  if (snap !== 'collapsed' || !closeIntentId) {
    return {
      nextState: current,
      shouldFinalize: false,
    };
  }
  if (!current || current.closeIntentId !== closeIntentId || current.sheetCollapsedSettled) {
    return {
      nextState: current,
      shouldFinalize: false,
    };
  }
  const nextState = {
    ...current,
    sheetCollapsedReached: true,
    sheetCollapsedSettled: true,
  };
  return {
    nextState,
    shouldFinalize: nextState.mapExitSettled && nextState.sheetCollapsedSettled,
  };
};
