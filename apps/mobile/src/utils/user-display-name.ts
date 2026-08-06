// ─── WHAT DO I CALL THIS USER — ONE ANSWER (F934(a)) ─────────────────────────────────
//
// This derivation was re-implemented SIX times across the overlay panels, each with its own
// fallback: 'Crave member' (FollowListPanel), 'Someone' (NotificationsPanel), 'Crave member'
// (MessagingPanels), 'Member' (PollDetailPanel), '?' (UserProfilePanel) and 'User'
// (ChildScenePanels). Six copies of one rule is six chances to drift, and they HAD drifted —
// the same missing-name user was called four different things depending on which surface the
// reader happened to be looking at, and half the copies used `??` (which keeps an empty
// string) where the other half used `||` (which does not).
//
// The rule, stated once: prefer the display name, else the username, else a fallback. Blank
// and whitespace-only values do NOT count as a name — that is why this trims and uses `||`.
//
// THE FALLBACK IS A CALLER CHOICE, not a default, because the surfaces genuinely differ:
// a notification row reads "Someone followed you", a profile header reads "Crave member".
// Callers pass the word their sentence needs; what they no longer get to re-invent is the
// PRECEDENCE and the blank-handling.

type NamedUserLike = {
  displayName?: string | null;
  username?: string | null;
  /** Server fact (publicAuthorIdentity): the account is gone. */
  isDeleted?: boolean;
};

// A DELETED ACCOUNT OUTRANKS THE CALLER'S FALLBACK. Deletion nulls the name
// columns, so without this branch a ghost would inherit whichever word the
// surface happened to pass — "Member" here, "Someone" there, "Crave member"
// elsewhere — and the reader would never learn the account is gone. It is also
// why `isDeleted` is a FIELD and not a sniff for the string below: editing or
// translating this copy must not change what the app believes about an
// account's existence.
export const DELETED_USER_DISPLAY_NAME = 'Deleted user';

export const DEFAULT_USER_DISPLAY_NAME_FALLBACK = 'Crave member';

export const resolveUserDisplayName = (
  user: NamedUserLike | null | undefined,
  fallback: string = DEFAULT_USER_DISPLAY_NAME_FALLBACK
): string =>
  user?.isDeleted
    ? DELETED_USER_DISPLAY_NAME
    : user?.displayName?.trim() || user?.username?.trim() || fallback;

// ─── THE HANDLE PRECEDENCE (F2051) ───────────────────────────────────────────────────
//
// A few surfaces read as a BYLINE rather than a name — the list-detail meta line renders
// "@ada · 12 dishes", where the handle is the point and the display name is only a
// stand-in when the account has no username. That is a genuinely different PRECEDENCE
// (username first), and it is why ListDetailPanel had re-derived the chain by hand — the
// display-name resolver above could not express it, so the caller wrote three lines and,
// exactly as F1960 predicted, skipped the isDeleted branch. A list owned by a deleted
// account rendered that account's stale @handle in the meta line, on data that already
// carried `isDeleted` (AuthorIdentity: "the one signal for every affordance").
//
// So the second precedence lives HERE, next to the first, sharing the one deletion guard.
// What a caller no longer gets to re-invent is the deleted-account branch — only which of
// the two orderings their sentence needs.
export const resolveUserHandleLabel = (
  user: NamedUserLike | null | undefined,
  fallback: string | null = null
): string | null => {
  if (user == null) {
    return fallback;
  }
  if (user.isDeleted) {
    return DELETED_USER_DISPLAY_NAME;
  }
  return user.username?.trim() || user.displayName?.trim() || fallback;
};
