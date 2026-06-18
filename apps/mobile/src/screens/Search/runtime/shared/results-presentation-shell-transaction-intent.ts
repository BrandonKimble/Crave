import type { OverlaySheetSnap } from '../../../../overlays/types';
import type {
  SearchSurfaceResultsTransaction,
  ResultsPresentationEnterMutationKind,
} from './search-surface-results-transaction';
import type { SearchBackdropTarget } from './results-presentation-shell-contract';

export const resolveSearchSurfaceResultsSheetTargetSnap = (
  kind: SearchSurfaceResultsTransaction['kind'],
  preserveSheetState: boolean
): Exclude<OverlaySheetSnap, 'hidden'> | null =>
  kind === 'results_exit' ? 'collapsed' : preserveSheetState ? null : 'middle';

export const resolveSearchSurfaceResultsBackdropTarget = (
  snapshot: SearchSurfaceResultsTransaction
): SearchBackdropTarget => (snapshot.kind === 'results_exit' ? 'default' : 'results');

export const resolveSearchSurfaceResultsEnterMutationKind = (
  intentKind:
    | 'shortcut_submit'
    | 'manual_submit'
    | 'autocomplete_submit'
    | 'recent_submit'
    | 'search_this_area'
): ResultsPresentationEnterMutationKind =>
  intentKind === 'shortcut_submit'
    ? 'shortcut_rerun'
    : intentKind === 'search_this_area'
      ? 'search_this_area'
      : 'initial_search';
