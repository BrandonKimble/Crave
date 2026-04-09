import type React from 'react';

import type { OverlaySheetSnap } from '../../../../overlays/types';
import type { PreparedResultsPresentationSnapshot } from './prepared-presentation-transaction';
import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';
import type {
  SearchBackdropTarget,
  SearchInputMode,
  SearchPresentationIntent,
} from './results-presentation-shell-contract';

export type ResultsExecutionIntent = Exclude<
  SearchPresentationIntent,
  { kind: 'focus_editing' | 'exit_editing' }
>;

export type ResultsEnterPresentationIntent = Exclude<ResultsExecutionIntent, { kind: 'close' }>;

export type ResultsPreparedSnapshotExecutor = (args: {
  snapshot: PreparedResultsPresentationSnapshot;
  displayQueryOverride?: string;
  preserveSheetState?: boolean;
  shouldPrepareShortcutSheetTransition?: boolean;
}) => string;

export type ResultsPreparedSnapshotExecutionBoundary = {
  resultsRuntimeOwner: Pick<
    ResultsPresentationRuntimeOwner,
    'commitPreparedResultsSnapshot' | 'stagePreparedResultsSnapshot'
  >;
  animateSheetTo: (snap: Exclude<OverlaySheetSnap, 'hidden'>, velocity?: number) => void;
  prepareShortcutSheetTransition?: () => boolean;
  setBackdropTarget: React.Dispatch<React.SetStateAction<SearchBackdropTarget>>;
  setInputMode: React.Dispatch<React.SetStateAction<SearchInputMode>>;
  setDisplayQueryOverride: React.Dispatch<React.SetStateAction<string>>;
  beginCloseTransition: (closeIntentId: string) => void;
  cancelSearchSheetCloseTransition: (closeIntentId?: string) => void;
};
