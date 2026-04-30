import type { SearchFiltersProps } from '../../components/SearchFilters';

export type SearchHiddenFiltersWarmupStateInputs = Pick<
  SearchFiltersProps,
  | 'activeTab'
  | 'openNow'
  | 'votesFilterActive'
  | 'priceButtonLabel'
  | 'priceButtonActive'
> | null;

export const EMPTY_SEARCH_HIDDEN_FILTERS_WARMUP_STATE_INPUTS: SearchHiddenFiltersWarmupStateInputs =
  null;
