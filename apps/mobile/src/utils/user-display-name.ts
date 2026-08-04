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
