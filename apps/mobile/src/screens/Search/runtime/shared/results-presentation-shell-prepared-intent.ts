import type { OverlaySheetSnap } from '../../../../overlays/types';
import type {
  PreparedResultsPresentationSnapshot,
  ResultsPresentationEnterMutationKind,
} from './prepared-presentation-transaction';
import type { SearchBackdropTarget } from './results-presentation-shell-contract';

export const resolvePreparedResultsSheetTargetSnap = (
  kind: PreparedResultsPresentationSnapshot['kind'],
  preserveSheetState: boolean
): Exclude<OverlaySheetSnap, 'hidden'> | null =>
  kind === 'results_exit' ? 'collapsed' : preserveSheetState ? null : 'middle';

export const resolvePreparedResultsBackdropTarget = (
  snapshot: PreparedResultsPresentationSnapshot
): SearchBackdropTarget => (snapshot.kind === 'results_exit' ? 'default' : 'results');

export const resolvePreparedResultsEnterMutationKind = (
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
