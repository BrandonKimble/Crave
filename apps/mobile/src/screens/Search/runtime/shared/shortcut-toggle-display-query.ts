// The home-screen shortcut buttons submit with these canonical display labels. When a
// SHORTCUT-originated search is toggled between tabs, the visible title + search-bar text flip
// to the sibling label ON PRESS-UP (with the pill) — toggling a "Best restaurants" shortcut to
// the dishes tab IS the "Best dishes" shortcut, and the chrome should say so. DISPLAY-ONLY by
// design: the bus `submittedQuery` is data-bearing (prewarm fingerprints, identity keys, replay)
// and must never be mutated by a zero-network toggle. Typed/natural searches are untouched
// (searchMode gate), and a shortcut whose label was replaced by a typed query falls through the
// label match unchanged.
export const SHORTCUT_QUERY_LABEL_BY_TAB = {
  restaurants: 'Best restaurants',
  dishes: 'Best dishes',
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
