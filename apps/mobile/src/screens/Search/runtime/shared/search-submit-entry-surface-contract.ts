export type SearchSubmitEntrySurface = 'home' | 'search_mode' | 'results';

// GLIDE MANDATE (red-team 2026-07-10): the entry-MOTION half of this contract is DELETED —
// the reveal sheet snap always animates (the old 'instant_behind_search_mode' arm teleported
// the sheet behind the search-edit cover; measured and killed). Only the entry-surface fact
// remains, consumed by the presentation shell contracts.
