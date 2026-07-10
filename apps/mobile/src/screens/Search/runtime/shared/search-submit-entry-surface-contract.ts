export type SearchSubmitEntrySurface = 'home' | 'search_mode' | 'results';

export type SearchSubmitEntryMotion =
  | 'animate_from_home'
  | 'instant_behind_search_mode'
  | 'preserve_sheet';

// S-A: the foreground entry-surface resolver is GONE — triggers no longer pass
// entrySurface; the reconciler derives it from the tuple identity. This contract keeps
// only the motion mapping the presentation side reads from the DERIVED intent.
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
