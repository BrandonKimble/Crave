import type { SearchForegroundInteractionSubmitHandlers } from '../shared/use-search-foreground-interaction-runtime-contract';

export const createSearchForegroundSubmitHandlersRuntimeValue = ({
  handleSubmit,
  handleBestDishesHere,
  handleBestRestaurantsHere,
  handleSearchThisArea,
  handleSuggestionPress,
  handleRecentSearchPress,
  handleRecentlyViewedRestaurantPress,
  handleRecentlyViewedFoodPress,
}: SearchForegroundInteractionSubmitHandlers): SearchForegroundInteractionSubmitHandlers => ({
  handleSubmit,
  handleBestDishesHere,
  handleBestRestaurantsHere,
  handleSearchThisArea,
  handleSuggestionPress,
  handleRecentSearchPress,
  handleRecentlyViewedRestaurantPress,
  handleRecentlyViewedFoodPress,
});
