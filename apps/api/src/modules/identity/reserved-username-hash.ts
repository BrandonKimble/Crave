import { createHmac } from 'crypto';

/**
 * THE BURNED HANDLE IS STORED AS A KEYED HMAC, NEVER AS PLAINTEXT.
 *
 * `user_reserved_usernames` exists to stop a departed person's handle being
 * re-claimed. It deliberately outlives the person and carries no user column,
 * which made it look person-free — but a handle IS an identity for a large
 * share of people (`@firstlast`, real names), so a table of every handle ever
 * abandoned is a durable roster of who used to be here. Owner ruling
 * 2026-08-07: "the burned username becomes a hash."
 *
 * WHY A HASH IS SUFFICIENT AND NOT A COMPROMISE. The reservation is only ever
 * asked ONE question — "is this exact handle burned?" — which is an equality
 * test, and equality is the one thing a deterministic keyed hash preserves
 * perfectly. Nothing reads the column back to display it, sort it, or match it
 * by prefix. So hashing costs the table nothing it actually does.
 *
 * WHY KEYED, NOT PLAIN SHA. The handle space is small, public and enumerable —
 * an unkeyed digest of `@brandon` is reversed by generating the digest of
 * every plausible handle, which is minutes of work. The HMAC key is the thing
 * an attacker with a database dump does not have. This is the identical
 * argument, and the identical key, as the ban-evasion email hash in
 * account-deletion.service.ts (SIGNAL_AUDIT_HMAC_KEY, the codebase's one HMAC
 * key, present in every environment).
 *
 * NORMALIZE BEFORE HASHING — the column is `citext`, so `Brandon` and
 * `brandon` used to collide for free. A hash is byte-exact and would silently
 * stop colliding, turning a case difference into a re-claimable handle. The
 * lowercase+trim here IS the citext semantics, moved from the database into
 * the one function both the writer and the reader go through.
 */

/**
 * ONE KEY SOURCE, read straight from the environment — not a parameter, and
 * not a ConfigService lookup on one side and an env read on the other. The
 * write and the lookup MUST produce the same digest or the reservation
 * silently stops colliding (a burned handle becomes claimable, with nothing
 * failing), so the key resolution is deliberately not something a caller can
 * vary. `validate-env.ts` already asserts SIGNAL_AUDIT_HMAC_KEY is set at
 * boot; the throw here is the second line, for the paths that bypass boot.
 */
function reservationKey(): string {
  const key = process.env.SIGNAL_AUDIT_HMAC_KEY ?? '';
  if (!key) {
    throw new Error(
      'Username reservation cannot run: SIGNAL_AUDIT_HMAC_KEY is unset, and an unkeyed hash of a username is trivially reversible by enumeration.',
    );
  }
  return key;
}

/**
 * The stored form of a burned handle. Hash at write AND at lookup — the two
 * call sites must agree by construction, which is why they share this
 * function rather than each spelling out `createHmac`.
 */
export function reservedUsernameHash(username: string): string {
  return createHmac('sha256', reservationKey())
    .update(username.trim().toLowerCase())
    .digest('hex');
}
