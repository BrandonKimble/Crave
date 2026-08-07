/**
 * Shared log/error redaction primitive (F416, 2026-08-04).
 *
 * WHY: both the winston logger and the request logging interceptor used an
 * EXACT-key-match denylist (`password`, `token`, `secret`, `key`,
 * `authorization`, `cookie`, `session`) — so `apiKey`, `accessToken`,
 * `refreshToken`, `clientSecret`, `webhookSecret`, `sessionId` all passed
 * through verbatim, and the codebase spells its config with exactly those
 * shapes. Redaction by exact-key denylist fails open by construction: every
 * new field name is a leak until someone remembers to add it. A
 * case-insensitive SUBSTRING match on the same small vocabulary catches the
 * whole family for free.
 */
const SENSITIVE_KEY_SUBSTRINGS = [
  'password',
  'token',
  'secret',
  'key',
  'authorization',
  'cookie',
  'session',
  'creditcard',
  'ssn',
] as const;

/**
 * PII field-name vocabulary (F9315, 2026-08-07 — owner-ruled).
 *
 * THE RULING: scrub PII VALUES from log/error payloads, but KEEP the internal
 * userId — it is the debug handle, meaningless outside our DB, and the shell it
 * points at is anonymized on erasure. So `userId`/`user_id`/`actorId`/`entityId`
 * are deliberately absent from this list; ids identify a row, PII identifies a
 * person.
 *
 * Matching is done on a NORMALIZED key (lowercased, separators stripped), so
 * one needle covers `first_name`, `firstName`, `first-name` and `FIRSTNAME`.
 *
 * NOT included, deliberately:
 *  - latitude/longitude/lat/lng. In this app coordinates are overwhelmingly
 *    RESTAURANT coordinates — they are on search requests, map viewports,
 *    geocode results and Places payloads — so redacting them would blind the
 *    most-debugged surface in the product to protect a case (a person's own
 *    location) that does not travel under these key names. Revisit only if a
 *    person-scoped coordinate field is introduced, and add THAT key by name.
 *  - bare `name`. Far too broad here (restaurant name, dish name, city name,
 *    field name); the person-shaped spellings below are the ones that matter.
 */
const PII_KEY_SUBSTRINGS = [
  'email',
  'phone',
  'mobile',
  'address', // also covers homeAddress / mailingAddress / ipAddress
  'street',
  'dateofbirth',
  'birthdate',
  'birthday',
  'firstname',
  'lastname',
  'fullname',
  'realname',
  'displayname',
] as const;

/**
 * Short PII keys that are matched WHOLE, never as substrings: `ip` would
 * otherwise hit `description`, `recipe`, `zip`, `clip`, `multiplier`… and `dob`
 * is short enough to collide by accident.
 */
const PII_EXACT_KEYS = new Set([
  'dob',
  'ip',
  'ipv4',
  'ipv6',
  'clientip',
  'remoteip',
  'ipaddr',
  'peerip',
]);

/**
 * Already-hashed fields are NOT PII: `ip_hash`, `subnetHash`, `emailHmac` are
 * the equality-joinable audit fields the abuse/GDPR surfaces rely on, and
 * redacting them would destroy the only join key those logs have. The exclusion
 * is scoped to the PII vocabulary ONLY — a `passwordHash`/`tokenHash` still
 * redacts, because losing a credential-shaped value costs nothing.
 */
function isAlreadyHashedKey(normalized: string): boolean {
  return normalized.endsWith('hash') || normalized.endsWith('hmac');
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (SENSITIVE_KEY_SUBSTRINGS.some((needle) => lower.includes(needle))) {
    return true;
  }

  const normalized = normalizeKey(key);
  if (isAlreadyHashedKey(normalized)) {
    return false;
  }

  return (
    PII_EXACT_KEYS.has(normalized) ||
    PII_KEY_SUBSTRINGS.some((needle) => normalized.includes(needle))
  );
}

/**
 * Recursively redact any object/array whose keys match `isSensitiveKey`,
 * replacing the VALUE with '[REDACTED]'. Non-object values pass through
 * unchanged.
 *
 * TWO bounds, because logging must never be the reason a request hangs:
 *  - Depth-limited (32) against pathological nesting.
 *  - CYCLE-guarded (F2603): a `seen` set of the CURRENT ancestor path replaces
 *    a back-reference with '[Circular]'. The depth cap alone is not enough — it
 *    stops THIS function's recursion, but at the boundary it returned the raw
 *    cyclic node, so the OUTPUT still held the cycle and the downstream winston
 *    JSON serializer stack-overflowed instead. A self-referential object (a
 *    Fastify request/reply, a Prisma client, an Axios error passed as
 *    `{ context }`) reaches this and must survive. The set is backtracked
 *    (delete after recursing) so a legitimate DAG — the same object referenced
 *    by two sibling keys — is NOT mistaken for a cycle.
 */
export function redactSensitiveDeep(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet<object>(),
): unknown {
  if (depth > 32 || value === null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  let result: unknown;
  if (Array.isArray(value)) {
    result = value.map((item) => redactSensitiveDeep(item, depth + 1, seen));
  } else {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
      if (isSensitiveKey(key)) {
        out[key] = source[key] === undefined ? undefined : '[REDACTED]';
        continue;
      }
      out[key] = redactSensitiveDeep(source[key], depth + 1, seen);
    }
    result = out;
  }

  seen.delete(value);
  return result;
}
