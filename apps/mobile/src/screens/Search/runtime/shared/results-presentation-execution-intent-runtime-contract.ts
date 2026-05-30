import type React from 'react';

import type { OverlayKey, OverlaySheetSnap } from '../../../../overlays/types';
import type { SearchSurfaceResultsTransaction } from './search-surface-results-transaction';
import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';
import type {
  SearchBackdropTarget,
  SearchInputMode,
  SearchPresentationIntent,
} from './results-presentation-shell-contract';
import type { SearchSubmitEntrySurface } from './search-submit-entry-surface-contract';

export type ResultsExecutionIntent = Exclude<
  SearchPresentationIntent,
  { kind: 'focus_editing' | 'exit_editing' }
>;

export type ResultsEnterPresentationIntent = Exclude<ResultsExecutionIntent, { kind: 'close' }>;

export type ResultsSurfaceTransactionExecutor = (args: {
  snapshot: SearchSurfaceResultsTransaction;
  displayQueryOverride?: string;
  preserveSheetState?: boolean;
  shouldPrepareShortcutSheetTransition?: boolean;
  entrySurface: SearchSubmitEntrySurface;
}) => string;

export type ResultsSurfaceTransactionExecutionBoundary = {
  resultsRuntimeOwner: Pick<
    ResultsPresentationRuntimeOwner,
    | 'cancelPresentationIntent'
    | 'commitSearchSurfaceResultsExitTransaction'
    | 'stageSearchSurfaceResultsTransaction'
  >;
  getCurrentSheetSnap?: () => OverlaySheetSnap | 'hidden';
  prepareSharedSheetForSearchPresentation?: () => boolean;
  setBackdropTarget: React.Dispatch<React.SetStateAction<SearchBackdropTarget>>;
  setInputMode: React.Dispatch<React.SetStateAction<SearchInputMode>>;
  setDisplayQueryOverride: React.Dispatch<React.SetStateAction<string>>;
  beginCloseTransition: (
    closeIntentId: string,
    options?: {
      terminalDismissSource?: 'results' | 'profile';
      outgoingSheetSceneKey?: OverlayKey | null;
    }
  ) => void;
  markSearchSheetCloseCollapsedReached?: (
    snap: Exclude<OverlaySheetSnap, 'hidden'>,
    source?: 'motion_plane'
  ) => void;
  markSearchSheetCloseSheetSettled?: (snap: Exclude<OverlaySheetSnap, 'hidden'>) => void;
  cancelSearchSheetCloseTransition: (closeIntentId?: string) => void;
};
