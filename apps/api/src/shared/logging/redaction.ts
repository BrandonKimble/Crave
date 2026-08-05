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
 * unchanged. Depth-limited (32) as a cheap guard against pathological/cyclic
 * input — logging must never be the reason a request hangs.
 */
export function redactSensitiveDeep(value: unknown, depth = 0): unknown {
  if (depth > 32 || value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveDeep(item, depth + 1));
  }

  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    if (isSensitiveKey(key)) {
      result[key] = source[key] === undefined ? undefined : '[REDACTED]';
      continue;
    }
    result[key] = redactSensitiveDeep(source[key], depth + 1);
  }
  return result;
}
