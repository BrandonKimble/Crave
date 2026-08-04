import { createToggleStripConsequenceSeam } from '../../../toggles/toggle-strip-consequence';
import { useListsHomeControlsStore } from './lists-home-controls-store';

/**
 * THE LISTS HOME CONTENT-TOGGLE SEAM (leg 4 — audit D5; charter Part 3).
 *
 * Lists' toggle slices (Restaurants/Dishes, Recent/Custom) are SYNCHRONOUS client
 * re-slices: the store write in the press handler re-renders the data surface with the
 * new slice in the same React batch — there is no fetch gap to choreograph. They still
 * ride the ONE content seam, with `settleMs: 0`, for the uniform declaration and the
 * press-up→ready instrumentation (charter: the transition decision is made from
 * measured gaps; lists' measured gap is ~0, on the record rather than assumed).
 *
 * Mechanics of the degenerate case (the walkthrough is in
 * plans/toggle-strip-rebuild-ledger.md §Leg 4): `commit…Slice` runs
 * begin → quiet-window(0) → runner (no-op; the store write already re-sliced) →
 * finalize in ONE call stack, so the seam's 'awaiting' phase is set and cleared
 * before React renders — exit and enter collapse into the same frame by construction,
 * and no body gating is needed (nothing could ever observe 'awaiting').
 *
 * Module scope (house pattern, same lifetime as lists-home-controls-store): the
 * press edge lives in header CHROME (ListsHomeStrip), which has no surface
 * runtime to own a hook-lifecycle seam.
 */
export type ListsHomeContentToggleKind = 'list_type' | 'sort_mode';

const listsHomeContentToggleSeam = createToggleStripConsequenceSeam<ListsHomeContentToggleKind>({
  consequence: 'content',
  surfaceName: 'lists-home',
  settleMs: 0,
});

/**
 * THE PRESS EDGE IS THE STORE WRITE (F933a).
 *
 * This used to be an exported `commitListsHomeSliceToggle(kind)` documented as "call
 * AFTER the store write (the write IS the re-slice)" — an ordering that NOTHING
 * enforced and that both call sites had to remember, on a seam whose whole point is a
 * uniform declaration. The correct shape already existed one directory over: the polls
 * store fires its press edge from a store SUBSCRIPTION
 * (`subscribeToPollsFeedControlChanges`), so a control write cannot happen without its
 * seam commit. Lists does the same now.
 *
 * Consequences that fall out, both wanted: the two ListsPanel call sites stop carrying
 * a rule, and control writes from OTHER paths (the reorder save flipping sortMode to
 * 'custom') now declare themselves too — they are the same synchronous re-slice, and
 * were silently missing from the instrumentation before.
 *
 * Module scope, like the seam itself: this subscription lives for the app's lifetime
 * because the store does, and there is no runtime here to own a hook lifecycle.
 */
useListsHomeControlsStore.subscribe((state, previous) => {
  if (state.listType !== previous.listType) {
    listsHomeContentToggleSeam.scheduleCommit(() => undefined, { kind: 'list_type' });
  }
  if (state.sortMode !== previous.sortMode) {
    listsHomeContentToggleSeam.scheduleCommit(() => undefined, { kind: 'sort_mode' });
  }
  // editSeat is EDIT-MODE state, not a content control — it re-slices nothing.
});
