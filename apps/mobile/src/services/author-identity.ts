/**
 * A PERSON AS THE SERVER SHOWS THEM — the client mirror of the API's
 * `publicAuthorIdentity`.
 *
 * Seven near-identical interfaces described this same payload across the
 * client (`PollCommentUser`, `PollCreator`, `RestaurantMentionUser`,
 * `FollowListUser`, `UserListPerson`, `NotificationFeedActor`,
 * `ConversationPeer`), each free to disagree — and they did: every surface
 * invented its own fallback for a missing name (`'?'`, `'user'`, a seeded
 * pseudo-name, a blank), and none of them said "deleted".
 *
 * WHY `isDeleted` IS A FIELD AND NOT AN INFERENCE FROM THE NAME. Whether an
 * account still exists is a server fact the client cannot re-derive. Sniffing
 * for the string "Deleted user" would make the LABEL load-bearing — then
 * editing that copy, or translating it, would silently re-enable a profile
 * link to an account that 404s.
 *
 * WHAT THE FLAG GOVERNS: the AFFORDANCES. A deleted person's byline must not
 * be tappable and must not offer Message, Follow, Block or Report — every one
 * of those targets an account that is gone (the API's public profile read
 * filters `deletedAt: null`, so the tap leads to a 404). The content itself
 * stays: removing a deleted person's comment would tear a hole in someone
 * else's thread, which is the whole reason the account is a ghost rather than
 * a cascade.
 */
export interface AuthorIdentity {
  /** Present even for a ghost — it keys the row and identifies nobody. */
  userId: string | null;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** TRUE when the account is gone. The one signal for every affordance. */
  isDeleted?: boolean;
}

/**
 * Can this person be opened, messaged, followed, blocked or reported?
 *
 * One predicate rather than `!author.isDeleted` scattered across a dozen
 * components: the question is always the same, and a single home means a
 * future reason to withhold a profile (suspended, shadow-banned) lands in one
 * place instead of being forgotten at nine call sites.
 *
 * Defensive on `userId` too — an author with no id cannot be navigated to
 * regardless of why.
 */
export function isInteractableAuthor(
  author: Pick<AuthorIdentity, 'isDeleted' | 'userId'> | null | undefined
): boolean {
  return Boolean(author && !author.isDeleted && author.userId);
}

// WHAT TO CALL THEM lives in utils/user-display-name (resolveUserDisplayName),
// which already existed and already carried the one-answer reasoning — it now
// handles `isDeleted` too. A second name-resolver here would have re-created
// exactly the six-way drift that file was written to end.
