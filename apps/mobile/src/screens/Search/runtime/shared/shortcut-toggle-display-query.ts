// The home-screen shortcut buttons submit with these canonical display labels. When a
// SHORTCUT-originated search is toggled between tabs, the visible title + search-bar text flip
// to the sibling label ON PRESS-UP (with the pill) — toggling a "Best restaurants" shortcut to
// the dishes tab IS the "Best dishes" shortcut, and the chrome should say so. DISPLAY-ONLY by
// design: the bus `submittedQuery` is data-bearing (prewarm fingerprints, identity keys, replay)
// and must never be mutated by a zero-network toggle. Typed/natural searches are untouched
// (searchMode gate), and a shortcut whose label was replaced by a typed query falls through the
// label match unchanged.
// R2 (2026-08-16, owner-ratified): the two "Best …" shortcuts collapsed into ONE
// "All" browse button, so both tabs share the single display label. The tab-flip
// machinery below is retained (it degrades to a no-op while both labels match) for
// the future horizontal-scroll shortcut overhaul.
export const SHORTCUT_QUERY_LABEL_BY_TAB = {
  restaurants: 'All',
  dishes: 'All',
} as const;

const SHORTCUT_QUERY_LABELS: ReadonlySet<string> = new Set(
  Object.values(SHORTCUT_QUERY_LABEL_BY_TAB)
);

export const resolveShortcutToggleDisplayQuery = ({
  displayQuery,
  searchMode,
  optimisticActiveTab,
}: {
  displayQuery: string;
  searchMode: string | null;
  optimisticActiveTab: 'dishes' | 'restaurants';
}): string =>
  searchMode === 'shortcut' && SHORTCUT_QUERY_LABELS.has(displayQuery)
    ? SHORTCUT_QUERY_LABEL_BY_TAB[optimisticActiveTab]
    : displayQuery;
