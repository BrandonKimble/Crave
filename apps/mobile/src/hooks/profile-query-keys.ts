/**
 * A CACHE KEY IS A FUNCTION, NOT A LITERAL (F2950's ruling, applied to the profile
 * families by F4511).
 *
 * These two keys were minted as bare literals at eight sites across two files — in a
 * file that already imports `userListKeys` for a THIRD family and uses it correctly.
 * So the right pattern was not unknown, it was unapplied. The failure it invites is
 * the silent one: an optimistic write whose key is misspelled writes into a cache
 * nobody reads, the UI simply does not flip, and nothing errors anywhere. Routed
 * through here, a mint and its invalidation cannot disagree — they are the same call —
 * and a typo is a tsc error instead of a no-op.
 */
export const profileKeys = {
  /** The public profile page (profile + follow edge) for one user. */
  profile: (userId: string | null | undefined) => ['userProfile', userId] as const,
  /** That user's lists section. */
  lists: (userId: string | null | undefined) => ['userProfileLists', userId] as const,
};
