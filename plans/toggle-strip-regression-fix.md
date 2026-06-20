# Toggle Strip Regressions — Archaeology + Restore (EXECUTION SPEC)

> Deep git archaeology (2026-06-20). The toggle strip has THREE entangled regressions, all from
> the `9fa642d7` "Finalize runtime and demand cutovers" mega-cutover (May 19, 600+ files) + the
> April chrome-freeze (`ff35c71d`) + the ongoing pin-residency map work. This is the grounded
> restore plan. Original toggle strip born in `b211db8f`.

## The three regressions (root-caused)

**#1 — Toggles don't change color on press-up (look stuck).** ✅ **FIXED (`70b8ac7b`).**
Originally press-up did a synchronous state flip → instant color. The chrome-freeze (`ff35c71d` +
`9fa642d7`) froze the whole `filtersHeaderRuntime` snapshot during `interaction_loading`, including
the toggle active states, so colors were stuck until results landed. Fix: the freeze still holds the
header heights + chip structure + handlers (layout stability), but the toggle ACTIVE STATES
(`activeTab`, `openNow`, `votesFilterActive`, `risingActive`, price active/label, `isPriceSelectorVisible`)
now flow LIVE from the runtime bus (confirmed immediate — handlers publish on press-up). File:
`search-root-search-scene-chrome-freeze-runtime.ts`. **Needs on-device confirm.**

**#2 — Pins/dots no longer fade out on press / fade in on load.** ⏸ **DEFERRED (touches in-flight work).**
Originally a toggle set `presentationTransitionLoadingMode = 'interaction_frost'` → drove the map's
`batchOpacity` (pins/dots fade 1→0, then 0→1 on settle). `9fa642d7` deleted that wiring.
**The mechanism STILL EXISTS in the resident model**: `SearchMapRenderController.swift` runs a
`PresentationOpacityAnimator` driving `nativePresentationOpacity`, which the Mapbox layers compose as
a global multiplier on top of LOD opacity — `iconOpacity = nativePresentationOpacity × nativeLodOpacity`,
`textOpacity = nativePresentationOpacity × nativeDotOpacity`. It's currently animated only for overlay
reveal/dismiss. **Restore = re-wire the toggle/search lifecycle to drive that same presentation-opacity**
(→0 on toggle start, swap promoted pins while invisible, →1 on settle — cleaner than old, no source
churn, composes WITH residency). **BLOCKED FOR NOW**: `SearchMapRenderController.swift` + the map render
controllers have UNCOMMITTED other-session residency edits — do NOT touch until that lands. Do #2 once
the residency work is committed/settled.

**#3 — Segment (dish/restaurant) toggle nukes the strip + collapses the sheet.** ⬜ **TODO (architectural).**
Originally the strip was FIXED independent chrome (`SearchResultsHeaderChromeAuthority`, 312 lines,
rendered above the sheet) + a simple data-driven tab swap. `9fa642d7` DELETED that authority and folded
the strip into a render-gated LIST HEADER:
`resultsToggleStripForRenderBase = (shouldShowInteractionLoadingState || shouldShowResultsSurface) ? listHeader : null`.
A segment toggle goes through `scheduleTabToggleCommit` → the dual-list dishes↔restaurants swap tears
down/rebuilds the list, and the strip (being the list header) dies with it + the surface transiently
collapses to a strip-nulling mode → strip vanishes, gap, sheet "goes haywire."
**Fix (architectural): render the strip as FIXED chrome OUTSIDE the list** (restore the
`SearchResultsHeaderChromeAuthority` pattern — recover via `git show 9fa642d7~1:apps/mobile/src/overlays/SearchResultsHeaderChromeAuthority.tsx`),
so it survives list teardown + tab swaps. Alternative (smaller, less robust): keep the list mounted
across the tab swap (swap data only, never the list) so the header isn't torn down. **Do as a focused
effort — not a point-patch.** A prior render-retention patch (reverted) did NOT fix it because the list
itself is rebuilt.

## Status

- ✅ #1 fixed (`70b8ac7b`).
- ✅ Baseline cleaned (`9e7f613b` reverted the cover-offset symptom patch `8ef25350`).
- ⏸ #2 deferred (caveat: touches uncommitted residency work; mechanism + re-wire documented above).
- ⬜ #3 TODO (fixed-chrome restore; architectural).

## Also still pending (separate from the regressions)

- **Rising → Sort modal** (Best · Rising, far-left, old global/local "Rank" modal pattern). ~7-file
  thread: `useSearchFilterModalOwner` (add sort visibility state), new `SearchSortSheet.tsx`, a sort
  modal-layer runtime (mirror `use-search-root-overlay-rank-and-score-modal-layer-runtime.ts`),
  contracts, `SearchFilters.tsx` (Sort button far-left + remove Rising pill), the list-header runtime,
  shell host. Selection → existing `toggleRising`/`scheduleToggleCommit`. Modal title "Sort"; button
  reads "Sort" (default Best) / "Rising" (active), accent only when Rising.

## Sequencing

1. Validate #1 on device. 2. #3 fixed-chrome restore (focused). 3. Rising→Sort modal. 4. #2 once the
   residency map work is committed. Each behind a maestro rapid-toggle flow.
