import type React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import type SearchOverlayHeaderChrome from '../../components/SearchOverlayHeaderChrome';
import type SearchSuggestionSurface from '../../components/SearchSuggestionSurface';
import type SearchFilters from '../../components/SearchFilters';
import type { SearchFiltersLayoutCache } from '../../components/SearchFilters';

type SuggestionSurfaceProps = React.ComponentProps<typeof SearchSuggestionSurface>;
type HeaderChromeProps = React.ComponentProps<typeof SearchOverlayHeaderChrome>;
type HiddenSearchFiltersWarmupProps = React.ComponentProps<typeof SearchFilters>;

export type SearchOverlayChromeModel = {
  overlayContainerStyle: StyleProp<ViewStyle>;
  isSuggestionOverlayVisible: boolean;
  shouldHideBottomNavForRender: boolean;
  suggestionSurfaceProps: SuggestionSurfaceProps;
  headerChromeProps: HeaderChromeProps;
  hiddenSearchFiltersWarmupProps: HiddenSearchFiltersWarmupProps | null;
};

export type SearchForegroundChromeSuggestionInputs = Omit<
  SuggestionSurfaceProps,
  'pointerEvents' | 'shouldHideBottomNav'
>;

export type SearchForegroundChromeHeaderInputs = Omit<HeaderChromeProps, 'headerVisualModel'>;

export type SearchForegroundChromeFiltersWarmupInputs = {
  isSearchFiltersLayoutWarm: boolean;
  activeTab: 'restaurants' | 'dishes';
  rankButtonLabelText: string;
  rankButtonIsActive: boolean;
  openNow: boolean;
  votesFilterActive: boolean;
  priceButtonLabelText: string;
  priceButtonIsActive: boolean;
  searchFiltersLayoutCacheRef: React.MutableRefObject<SearchFiltersLayoutCache | null>;
  handleSearchFiltersLayoutCache: (next: SearchFiltersLayoutCache) => void;
};
