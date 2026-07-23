import { create } from 'zustand';

import type { PollFeedSort, PollFeedTime, PollFeedType } from '../../../services/polls';

/**
 * THE POLLS FEED CONTROL STATE (leg 3 — plans/toggle-strip-rebuild-ledger.md §5).
 *
 * The feed toggles (Live/Results, Type, Sort, Time) used to be useState inside the
 * polls scene-body hook — reachable only from the list tree, which is exactly why the
 * strip was trapped as a snap-gated ListHeaderComponent. With the strip migrated to
 * the persistent-header mount the controls are CHROME: chrome (the header strip) and
 * body (the feed query) must both reach the state, so it lives here, module-scope,
 * house zustand pattern (systemStatusStore).
 *
 * WRITE PROTOCOL: a control press writes the store — that write IS the optimistic
 * flip (the pill/chip moves instantly). The network consequence stays with its owner:
 * the feed runtime controller SUBSCRIBES to these four keys and hands the refresh to
 * the shared toggle engine (quiet-window coalescing, skipSpinner in-place swap) —
 * exactly the pre-migration wiring, minus the setter-wrapper indirection. Leg 4
 * replaces that seam with useContentToggle; the store is the stable half.
 *
 * Lifetime: module scope ≈ the old behavior (the polls scene body is retain-mounted,
 * so its useState already lived for the app session).
 */
/** One §6 slicer option: a place present in the loaded feed pages, ranked by contribution. */
export type PollFeedPlaceOption = {
  placeId: string;
  placeName: string;
  /** Content contribution: how many loaded polls this place contributed. */
  pollCount: number;
};

/** The place slicer's rest value — no slice applied. */
export const POLL_FEED_PLACE_FILTER_ALL = 'all';

export type PollsFeedControlsState = {
  feedState: 'active' | 'closed';
  /**
   * Master sort (wave-2 §3): New (default) | Trending | Top. Never null — "Default"
   * was a vocabulary lie: the client omitted `sort` and the API applied
   * `PollListSort.new` anyway (polls.service.ts `query.sort ?? PollListSort.new`);
   * there was never a demand-ranked default order. New IS the default, said plainly.
   */
  feedSort: PollFeedSort;
  feedType: PollFeedType;
  /** Time period — folded INTO the Top sort (§3): only consulted when feedSort = top. */
  feedTime: PollFeedTime;
  /**
   * Live-poll count for the "Live · N" segment (§3) — NOT a control: the BODY (feed
   * controller) writes it when an active-state slice lands; the chrome reads it.
   * Writes here never fire the press-edge subscription.
   */
  liveCount: number | null;
  /**
   * §6 place slicer (SelectorChip): 'all' or a placeId from `placeOptions`.
   * CLIENT-SIDE slice this leg — selecting filters the LOADED pages in the feed
   * runtime, so this key is deliberately EXCLUDED from the press-edge
   * subscription's control diff (no network refresh). Server-side slicing is a
   * later leg; when it lands, placeFilter joins the control diff (and the seam's
   * baseline snapshot) and the client filter dies.
   */
  placeFilter: string;
  /**
   * Slicer options — NOT a control: the BODY (feed controller) writes them when a
   * slice lands/appends (places present in the loaded pages, ranked by content
   * contribution); the chrome reads them. Writes never fire the press edge.
   */
  placeOptions: PollFeedPlaceOption[];
  setFeedState: (value: 'active' | 'closed') => void;
  setFeedSort: (value: PollFeedSort) => void;
  setFeedType: (value: PollFeedType) => void;
  setFeedTime: (value: PollFeedTime) => void;
  setLiveCount: (value: number | null) => void;
  setPlaceFilter: (value: string) => void;
  setPlaceOptions: (value: PollFeedPlaceOption[]) => void;
};

export const usePollsFeedControlsStore = create<PollsFeedControlsState>((set) => ({
  feedState: 'active',
  feedSort: 'new',
  feedType: 'all',
  feedTime: 'all_time',
  liveCount: null,
  placeFilter: POLL_FEED_PLACE_FILTER_ALL,
  placeOptions: [],
  setFeedState: (value) => set({ feedState: value }),
  setFeedSort: (value) => set({ feedSort: value }),
  setFeedType: (value) => set({ feedType: value }),
  setFeedTime: (value) => set({ feedTime: value }),
  setLiveCount: (value) => set({ liveCount: value }),
  setPlaceFilter: (value) => set({ placeFilter: value }),
  setPlaceOptions: (value) => set({ placeOptions: value }),
}));

/** Snapshot selector for non-React readers (the feed controller's commit runner). */
export const getPollsFeedControlsSnapshot = () => {
  const { feedState, feedSort, feedType, feedTime } = usePollsFeedControlsStore.getState();
  return { feedState, feedSort, feedType, feedTime };
};

export type PollsFeedControlsSnapshot = ReturnType<typeof getPollsFeedControlsSnapshot>;

// Leg 5 failure path: a control-baseline RESTORE (the seam reverting an optimistic
// flip whose consequence failed) must not read as a user press — the press-edge
// subscription below is suppressed for the restore write, or the revert would
// schedule a fresh commit (revert → commit → fail → revert loop, and engine
// reentrancy inside the 'failed' lifecycle).
let isRestoringControls = false;

/** Seam-only: write a snapshot back WITHOUT firing the press-edge subscription. */
export const restorePollsFeedControls = (snapshot: PollsFeedControlsSnapshot): void => {
  isRestoringControls = true;
  try {
    usePollsFeedControlsStore.setState(snapshot);
  } finally {
    isRestoringControls = false;
  }
};

/**
 * The press edge for the content-toggle seam (leg 4): fire `listener` whenever a
 * CONTROL VALUE changes — the feed controller wires this to scheduleFeedQueryCommit
 * (useContentToggle), so a press burst coalesces into one quiet refresh and the
 * 'awaiting' exit lands in the same React batch as the control's optimistic flip.
 */
export const subscribeToPollsFeedControlChanges = (listener: () => void): (() => void) =>
  usePollsFeedControlsStore.subscribe((state, previous) => {
    if (isRestoringControls) {
      return;
    }
    // placeFilter is deliberately absent: it slices the loaded pages client-side
    // (§6 slicer, this leg) and must not schedule a network commit.
    if (
      state.feedState !== previous.feedState ||
      state.feedSort !== previous.feedSort ||
      state.feedType !== previous.feedType ||
      state.feedTime !== previous.feedTime
    ) {
      listener();
    }
  });
