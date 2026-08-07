process.env.SIGNAL_AUDIT_HMAC_KEY ??= 'test-reserved-username-key';

import { AccountDeletionService } from './account-deletion.service';
import { reservedUsernameHash } from './reserved-username-hash';
import { UsernameService } from './username.service';
import { moderationAllowed } from '../moderation/moderation-verdict';

/**
 * THE MUTATION PROOF FOR THE BURNED-HANDLE HASH (owner ruling 2026-08-07).
 *
 * Hashing a column that exists to make an equality check fail-closed has
 * exactly one way to go wrong, and it is SILENT: the write and the lookup
 * derive different digests, the reservation stops matching, and a departed
 * person's handle quietly becomes claimable again. Nothing errors. Nothing
 * logs. The only thing that would ever notice is a person typing the handle.
 *
 * So the property under test is not "the value is hashed" — that is the easy
 * half and it is checked below in one line. It is "the COLLISION SURVIVED
 * hashing": reserve a handle, ask about the same handle, still blocked.
 *
 * The RED recipe: change either call site to store/read the plaintext (or to
 * skip the lowercase normalization) and the collision assertions fail while
 * the it-is-hashed assertion still passes. That asymmetry is the point — a
 * spec that only checked "not plaintext" would go green on a broken burn.
 */
describe('reservedUsernameHash — the burn stays a collision', () => {
  it('THE MUTATION PROOF: reserving a handle and re-checking it still collides', () => {
    // The write side (account-deletion purge) and the read side
    // (UsernameService availability check) both go through this function.
    // Same handle in, same key in the table out.
    const stored = reservedUsernameHash('brandon');
    const lookedUp = reservedUsernameHash('brandon');
    expect(lookedUp).toBe(stored);
  });

  it('the stored value is NOT the plaintext handle', () => {
    const stored = reservedUsernameHash('brandon');
    expect(stored).not.toBe('brandon');
    expect(stored).not.toContain('brandon');
    // A keyed SHA-256, hex — nothing about the handle's length or shape leaks
    // through, which a truncation or an encoding would have.
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
  });

  it('CITEXT SEMANTICS SURVIVE: case and surrounding space still collide', () => {
    // The column is `citext`, so `Brandon` and `brandon` collided for free in
    // the database. A hash is byte-exact and would have silently STOPPED
    // colliding — turning a capital letter into a re-claimable handle. The
    // normalization inside the helper is that guarantee, not a nicety.
    const base = reservedUsernameHash('brandon');
    expect(reservedUsernameHash('Brandon')).toBe(base);
    expect(reservedUsernameHash('BRANDON')).toBe(base);
    expect(reservedUsernameHash('  brandon  ')).toBe(base);
  });

  it('different handles do not collide (the burn is not a bucket)', () => {
    expect(reservedUsernameHash('brandon')).not.toBe(
      reservedUsernameHash('brandon2'),
    );
  });

  it('END-TO-END: the value the PURGE burns is the value the AVAILABILITY CHECK asks for', async () => {
    // The proof above shows the function is deterministic. This one shows the
    // two real call sites actually go through it — a helper both sides ignore
    // proves nothing. The purge's write is captured and fed to the lookup's
    // fake table, so a drift in either direction (one plaintext, one hashed;
    // one normalized, one not) makes the handle come back AVAILABLE.
    const burned: string[] = [];

    const deletionPrisma = {
      user: { update: jest.fn().mockResolvedValue({}) },
      usernameHistory: {
        findMany: jest.fn().mockResolvedValue([{ username: 'Brandon' }]),
      },
      reservedUsername: {
        upsert: jest.fn().mockImplementation((args: never) => {
          burned.push(
            (args as { create: { username: string } }).create.username,
          );
          return Promise.resolve({});
        }),
      },
    };
    const noop = jest.fn().mockResolvedValue(undefined);
    const logger = {
      setContext: () => logger,
      info: noop,
      warn: noop,
      error: noop,
      debug: noop,
    };
    const deletion = new AccountDeletionService(
      deletionPrisma as never,
      { deleteClerkUser: noop, revokeAllSessions: noop } as never,
      { revokeAllForUser: noop } as never,
      { cancelSubscription: noop, deleteRevenueCatSubscriber: noop } as never,
      { isConfigured: false } as never,
      {
        erase: jest.fn().mockResolvedValue({ applied: {}, skipped: [] }),
      } as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
      logger as never,
    );
    await deletion.purgeAccount({
      userId: '00000000-0000-0000-0000-0000000000aa',
      email: 'someone@example.com',
      username: null,
      authProviderUserId: null,
      revenueCatAppUserId: null,
    } as never);

    expect(burned).toHaveLength(1);
    expect(burned[0]).not.toBe('Brandon');

    // The lookup side, over a table containing exactly what the purge wrote.
    const usernamePrisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null), findFirst: noop },
      reservedUsername: {
        findUnique: jest.fn().mockImplementation((args: never) => {
          const key = (args as { where: { username: string } }).where.username;
          return Promise.resolve(
            burned.includes(key) ? { username: key } : null,
          );
        }),
      },
      usernameHistory: { findFirst: noop },
    };
    const usernames = new UsernameService(
      usernamePrisma as never,
      logger as never,
      {
        moderateText: jest.fn().mockResolvedValue(moderationAllowed()),
      } as never,
    );

    // The SAME handle the purge burned — and the case variant, because citext
    // used to make that collide for free.
    expect((await usernames.checkAvailability('brandon')).reason).toBe(
      'reserved',
    );
    expect((await usernames.checkAvailability('Brandon')).reason).toBe(
      'reserved',
    );
    // ...and an unrelated handle is untouched, so the check is not just
    // answering "reserved" to everything.
    expect((await usernames.checkAvailability('someoneelse')).reason).not.toBe(
      'reserved',
    );
  });

  it('REFUSES without a key rather than emitting an enumerable digest', () => {
    // An unkeyed digest of a handle is reversed by hashing every plausible
    // handle — minutes of work over a small, public, enumerable space. So a
    // missing key must be a throw, never a fallback to plain SHA.
    const saved = process.env.SIGNAL_AUDIT_HMAC_KEY;
    delete process.env.SIGNAL_AUDIT_HMAC_KEY;
    try {
      expect(() => reservedUsernameHash('brandon')).toThrow(
        /SIGNAL_AUDIT_HMAC_KEY/,
      );
    } finally {
      process.env.SIGNAL_AUDIT_HMAC_KEY = saved;
    }
  });
});
