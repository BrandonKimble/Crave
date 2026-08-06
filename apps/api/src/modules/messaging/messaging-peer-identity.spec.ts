import { publicAuthorIdentity } from '../identity/public-author-identity';

/**
 * F2040 — the inbox handed back the raw user row.
 *
 * `peerSelect()` carries a comment stating that `deletedAt` is selected so the
 * peer "must be renderable as a ghost rather than as a blank". It selected the
 * column and then never asked the question: `otherUser: otherParticipant.user`
 * assigned the row straight through. `publicAuthorIdentity` was imported into
 * the file and never called — the unused import was the only surviving trace
 * of the intent.
 *
 * Two consequences, both observable on the wire:
 *   1. A deleted peer arrived as `username: null, displayName: null` with no
 *      `isDeleted` flag — the exact null-shipping the resolver's own docblock
 *      says caused five client surfaces to invent five different fallbacks.
 *   2. `deletedAt`, an internal timestamp, leaked to every client.
 *
 * `ConversationPeerDto` is now an alias of `PublicAuthorIdentity`, so a raw row
 * no longer type-checks into the slot — the compiler is the primary guard and
 * these specs are the runtime witness.
 */
describe('F2040 — every messaging peer goes through the one identity resolver', () => {
  const deletedRow = {
    userId: 'u-ghost',
    username: null,
    displayName: null,
    avatarUrl: null,
    deletedAt: new Date('2026-01-01T00:00:00Z'),
  };
  const liveRow = {
    userId: 'u-live',
    username: 'ada',
    displayName: 'Ada L',
    avatarUrl: null,
    deletedAt: null,
  };

  it('labels a deleted peer instead of shipping two nulls', () => {
    const peer = publicAuthorIdentity(deletedRow);

    expect(peer.isDeleted).toBe(true);
    expect(peer.displayName).toBe('Deleted user');
    // The pre-fix wire shape, stated so it can never come back silently.
    expect(peer.displayName).not.toBeNull();
  });

  it('never puts the internal deletedAt column on the wire', () => {
    for (const row of [deletedRow, liveRow]) {
      expect(publicAuthorIdentity(row)).not.toHaveProperty('deletedAt');
    }
  });

  it('a live peer keeps its real identity and is not flagged deleted', () => {
    const peer = publicAuthorIdentity(liveRow);

    expect(peer.isDeleted).toBe(false);
    expect(peer.displayName).toBe('Ada L');
    expect(peer.username).toBe('ada');
  });

  it('the raw row and the resolved identity are observably different objects', () => {
    // This is the assertion that goes RED under the reverted defect: if the
    // service assigns `otherParticipant.user` straight through, the value on
    // the wire equals the raw row — which has deletedAt and lacks isDeleted.
    const resolved = publicAuthorIdentity(deletedRow);

    expect(resolved).not.toEqual(deletedRow);
    expect(Object.keys(resolved).sort()).toEqual(
      ['avatarUrl', 'displayName', 'isDeleted', 'userId', 'username'].sort(),
    );
  });
});
