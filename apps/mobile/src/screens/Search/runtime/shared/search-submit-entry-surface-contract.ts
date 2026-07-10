export type SearchSubmitEntrySurface = 'home' | 'search_mode' | 'results';

export type SearchSubmitEntryMotion = 'animate_from_home' | 'preserve_sheet';

// S-A: the foreground entry-surface resolver is GONE — triggers no longer pass
// entrySurface; the reconciler derives it from the tuple identity. This contract keeps
// only the motion mapping the presentation side reads from the DERIVED intent.
//
// GLIDE MANDATE (red-team 2026-07-10, owner directive): the reveal sheet snap ALWAYS
// animates. The old 'instant_behind_search_mode' arm teleported the sheet collapsed→middle
// behind the search-edit cover ([GLIDEPRB] measured: a 3s sample hole ending at the target,
// zero intermediate positions) — the ONE transition that snapped instead of gliding. The
// sheet now springs to its snap while the content runs its usual transition, both directions
// symmetric with the (already-gliding) dismiss.
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
  return 'animate_from_home';
};
