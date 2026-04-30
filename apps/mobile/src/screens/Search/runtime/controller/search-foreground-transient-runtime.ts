import type { SearchForegroundInteractionTransientHandlersRuntime } from '../shared/use-search-foreground-interaction-runtime-contract';

export const createSearchForegroundTransientHandlersRuntimeValue = ({
  handleClear,
  handleSearchFocus,
  handleSearchBlur,
  handleSearchBack,
  handleRecentViewMorePress,
  handleRecentlyViewedMorePress,
  handleOverlaySelect,
  handleProfilePress,
}: SearchForegroundInteractionTransientHandlersRuntime): SearchForegroundInteractionTransientHandlersRuntime => ({
  handleClear,
  handleSearchFocus,
  handleSearchBlur,
  handleSearchBack,
  handleRecentViewMorePress,
  handleRecentlyViewedMorePress,
  handleOverlaySelect,
  handleProfilePress,
});
