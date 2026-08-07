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

export function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_SUBSTRINGS.some((needle) => lower.includes(needle));
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
