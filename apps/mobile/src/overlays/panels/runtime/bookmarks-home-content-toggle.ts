import { createToggleStripConsequenceSeam } from '../../../toggles/toggle-strip-consequence';

/**
 * THE BOOKMARKS HOME CONTENT-TOGGLE SEAM (leg 4 — audit D5; charter Part 3).
 *
 * Bookmarks' toggle slices (Restaurants/Dishes, Recent/Custom) are SYNCHRONOUS client
 * re-slices: the store write in the press handler re-renders the data surface with the
 * new slice in the same React batch — there is no fetch gap to choreograph. They still
 * ride the ONE content seam, with `settleMs: 0`, for the uniform declaration and the
 * press-up→ready instrumentation (charter: the transition decision is made from
 * measured gaps; bookmarks' measured gap is ~0, on the record rather than assumed).
 *
 * Mechanics of the degenerate case (the walkthrough is in
 * plans/toggle-strip-rebuild-ledger.md §Leg 4): `commit…Slice` runs
 * begin → quiet-window(0) → runner (no-op; the store write already re-sliced) →
 * finalize in ONE call stack, so the seam's 'awaiting' phase is set and cleared
 * before React renders — exit and enter collapse into the same frame by construction,
 * and no body gating is needed (nothing could ever observe 'awaiting').
 *
 * Module scope (house pattern, same lifetime as bookmarks-home-controls-store): the
 * press edge lives in header CHROME (BookmarksHomeStrip), which has no surface
 * runtime to own a hook-lifecycle seam.
 */
export type BookmarksHomeContentToggleKind = 'list_type' | 'sort_mode';

const bookmarksHomeContentToggleSeam =
  createToggleStripConsequenceSeam<BookmarksHomeContentToggleKind>({
    consequence: 'content',
    surfaceName: 'bookmarks-home',
    settleMs: 0,
  });

/** The press edge: call AFTER the store write (the write IS the re-slice). */
export const commitBookmarksHomeSliceToggle = (kind: BookmarksHomeContentToggleKind): void => {
  bookmarksHomeContentToggleSeam.scheduleCommit(() => undefined, { kind });
};
