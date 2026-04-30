import type { StyleProp, ViewStyle } from 'react-native';

export type SearchSuggestionOverlayContainerInputs = {
  overlayContainerStyle: StyleProp<ViewStyle>;
  isSuggestionOverlayVisible: boolean;
  shouldHideBottomNavForRender: boolean;
} | null;

export const EMPTY_SEARCH_SUGGESTION_OVERLAY_CONTAINER_INPUTS: SearchSuggestionOverlayContainerInputs =
  null;
