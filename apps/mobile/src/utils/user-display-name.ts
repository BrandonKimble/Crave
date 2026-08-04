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
};

export const DEFAULT_USER_DISPLAY_NAME_FALLBACK = 'Crave member';

export const resolveUserDisplayName = (
  user: NamedUserLike | null | undefined,
  fallback: string = DEFAULT_USER_DISPLAY_NAME_FALLBACK
): string => user?.displayName?.trim() || user?.username?.trim() || fallback;
