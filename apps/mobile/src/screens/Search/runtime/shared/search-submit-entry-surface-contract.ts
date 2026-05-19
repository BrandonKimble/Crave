export type SearchSubmitEntrySurface = 'home' | 'search_mode' | 'results';

export type SearchSubmitEntryMotion =
  | 'animate_from_home'
  | 'instant_behind_search_mode'
  | 'preserve_sheet';

export const resolveForegroundSearchSubmitEntrySurface = ({
  isSuggestionPanelActive,
}: {
  isSuggestionPanelActive: boolean;
}): Extract<SearchSubmitEntrySurface, 'home' | 'search_mode'> =>
  isSuggestionPanelActive ? 'search_mode' : 'home';

export const resolveSearchSubmitEntryMotion = ({
  entrySurface,
  preserveSheetState,
}: {
  entrySurface: SearchSubmitEntrySurface;
  preserveSheetState: boolean;
}): SearchSubmitEntryMotion => {
  if (preserveSheetState || entrySurface === 'results') {
    return 'preserve_sheet';
  }
  return entrySurface === 'search_mode' ? 'instant_behind_search_mode' : 'animate_from_home';
};
