import type { SearchPresentationIntent } from './results-presentation-shell-contract';

export type ArmSearchCloseRestoreOptions = {
  allowFallback?: boolean;
  searchRootRestoreSnap?: 'expanded' | 'middle' | 'collapsed';
};

export type ResultsPresentationActions = {
  requestSearchPresentationIntent: (intent: SearchPresentationIntent) => string | null;
  beginCloseSearch: () => void;
  handleCloseResults: () => void;
  cancelCloseSearch: (intentId?: string) => void;
};

export type ResultsCloseTransitionActions = {
  markSearchSheetCloseMapExitSettled: (requestKey: string) => void;
  markSearchSheetCloseCollapsedReached: (
    snap: import('../../../../overlays/types').OverlaySheetSnap
  ) => void;
  markSearchSheetCloseSheetSettled: (
    snap: import('../../../../overlays/types').OverlaySheetSnap
  ) => void;
  cancelSearchSheetCloseTransition: (closeIntentId?: string) => void;
};
