import type { SearchFiltersProps } from '../../components/SearchFilters';

export type SearchHiddenFiltersWarmupLayoutInputs = Pick<
  SearchFiltersProps,
  'initialLayoutCache' | 'onLayoutCacheChange'
> | null;

export const EMPTY_SEARCH_HIDDEN_FILTERS_WARMUP_LAYOUT_INPUTS: SearchHiddenFiltersWarmupLayoutInputs =
  null;
