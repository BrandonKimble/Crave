// ─── THE VIEWER IDENTITY, RESOLVED ONCE PER LEG (touch-latency rung, 2026-08-05)
//
// THE MEASURED DEFECT. A poll card costs ~17ms all-in (~7ms JS + ~10ms native),
// and a collapsed tab switch builds 11 of them. The bare/full A/B priced the
// whole card: an empty-cell list switches in 48ms with TWICE the rows, so the
// cards ARE the remaining cost of the switch — and the same per-card cost is
// paid on every scroll frame, which is why this is a card fix and not a
// transition fix.
//
// WHAT THIS ONE REMOVES. PollCandidateBars used to open, PER CARD:
//
//   const { isSignedIn } = useAuthController();
//   const { data: viewerProfile } = useQuery({ ...createProfileQueryOptions(), … });
//
// Eleven cards meant eleven react-query subscriptions to the SAME cache entry
// plus eleven auth-controller subscriptions — all of it consumed for exactly two
// values: a boolean, and one string used to draw a 16pt dot on the bar the
// viewer picked. Every one of those subscriptions also became a re-render
// subscriber, so any write to the profile cache re-rendered every visible card
// regardless of which field changed.
//
// WHY A STORE AND NOT THE PUBLISHED SPEC. The obvious alternative — put
// viewerAvatarUrl on the leg's published list spec — RELOCATES the re-render
// instead of removing it: the spec is an input to the legs memo, so a profile
// write would invalidate the whole list body rather than eleven cards. That is
// a worse shape than the one it replaces. The value is viewer state, not list
// state, and it must reach the rows without passing through the thing that
// decides what the rows ARE.
//
// WHY A STORE AND NOT A PROP THROUGH renderItem. Same reason: renderItem is
// captured in the spec, so making it close over the avatar url couples the list
// identity to the profile. And threading it through a ref instead would mean a
// profile change never repaints the dot at all — correctness traded for speed,
// which is not the trade on offer.
//
// WHAT REMAINS, STATED HONESTLY. Cards still subscribe to THIS store, so the
// count of subscriptions-per-card is 1, not 0. That is not an oversight: the
// dot is per-row rendered state, so a row must re-render when it changes, and
// only a subscription can do that. What changed is the WEIGHT (a two-field
// module store read instead of a react-query cache subscription + an auth
// controller) and the BLAST RADIUS (only these two fields can invalidate a row;
// every other profile field is now inert).

type PollViewerIdentity = {
  isSignedIn: boolean;
  /** The viewer's avatar, for the "your pick" dot. Null when signed out or unset. */
  avatarUrl: string | null;
};

const EMPTY: PollViewerIdentity = { isSignedIn: false, avatarUrl: null };

let state: PollViewerIdentity = EMPTY;
const listeners = new Set<() => void>();

/**
 * THE ONE WRITER (usePollViewerIdentityPublication, mounted once per leg).
 *
 * NARROW BY CONSTRUCTION: the store holds the two values the rows render from
 * and nothing else, and a write that changes neither is dropped before any
 * listener runs. This is what makes "an unrelated profile field changed" a
 * no-op for every row rather than a re-render of all of them — the selector
 * cannot be widened by accident later, because there is nothing wider here to
 * select.
 */
export const setPollViewerIdentity = (next: PollViewerIdentity): void => {
  if (next.isSignedIn === state.isSignedIn && next.avatarUrl === state.avatarUrl) {
    return;
  }
  state = next;
  listeners.forEach((listener) => listener());
};

export const getPollViewerIdentity = (): PollViewerIdentity => state;

export const subscribePollViewerIdentity = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Test seam only: specs share the module singleton. */
export const resetPollViewerIdentity = (): void => {
  state = EMPTY;
  listeners.clear();
};

export type { PollViewerIdentity };
