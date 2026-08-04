/**
 * THE PUBLIC IDENTITY OF AN AUTHOR — one home, server-side.
 *
 * A deleted account keeps its content: hard-deleting a comment would tear a
 * hole in someone else's thread. So every read path that shows an author has
 * to answer "who wrote this?" for a person who no longer exists.
 *
 * Until now nobody answered it. The API returned `username: null,
 * displayName: null` and each client surface invented its own fallback — `'?'`
 * in one place, `'user'` in another, a seeded pseudo-name in a third, a blank
 * byline in the rest. NONE of them said "deleted". The presentation of a
 * deleted person was, in effect, whatever each component happened to do when
 * handed a null.
 *
 * That is a server question, not a rendering question. Whether an account
 * still exists is a fact the database holds and the client cannot re-derive;
 * shipping nulls and hoping is how five surfaces disagreed. So the server
 * answers it once, here, and every author-bearing response goes through this
 * function.
 *
 * WHY A LABEL AND NOT A REMOVAL. Attribution has to stay structurally present
 * or the thread stops making sense — "who am I replying to" needs an answer
 * even when the answer is "nobody, any more". Reddit shows `[deleted]`,
 * Discord shows `Deleted User`. We say `Deleted user`: plain words, no
 * brackets to read as markup, sentence case like the rest of our copy.
 *
 * WHY `isDeleted` IS ON THE WIRE. The client must be able to style the byline
 * and suppress affordances that make no sense — no profile link, no DM, no
 * follow, no block (there is nobody to block; the account is gone). Inferring
 * that from a magic display string would make the LABEL load-bearing, and
 * then translating or editing the copy would silently re-enable a broken
 * profile link.
 */

/** The shape any caller must select to build an author identity. */
export interface AuthorSource {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  deletedAt: Date | null;
}

export interface PublicAuthorIdentity {
  /** Retained for a deleted author: it keys the row and reveals nothing —
   *  the purge leaves a surrogate id behind precisely so content stays
   *  groupable without a person attached. */
  userId: string | null;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** TRUE when the account is gone. The client's signal to drop the profile
   *  link, the DM action and the block action. */
  isDeleted: boolean;
}

export const DELETED_AUTHOR_LABEL = 'Deleted user';

/**
 * Map a user row to what the world may see.
 *
 * A missing row (`null`/`undefined`) is treated as deleted rather than as an
 * error: a comment whose author row is gone is exactly the case this exists
 * for, and throwing would take down a whole thread over one absent byline.
 */
export function publicAuthorIdentity(
  user: Partial<AuthorSource> | null | undefined,
): PublicAuthorIdentity {
  if (!user || user.deletedAt) {
    return {
      userId: user?.userId ?? null,
      username: null,
      displayName: DELETED_AUTHOR_LABEL,
      avatarUrl: null,
      isDeleted: true,
    };
  }
  return {
    userId: user.userId ?? null,
    username: user.username ?? null,
    displayName: user.displayName ?? null,
    avatarUrl: user.avatarUrl ?? null,
    isDeleted: false,
  };
}

/** The Prisma `select` every author join needs. Exported so a caller cannot
 *  forget `deletedAt` — the field the whole decision turns on. */
export const AUTHOR_SELECT = {
  userId: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  deletedAt: true,
} as const;
