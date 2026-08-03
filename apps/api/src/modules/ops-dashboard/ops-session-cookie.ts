import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * THE CREDENTIAL A BROWSER CAN ACTUALLY SUPPLY (audit 2026-08-02, F200).
 *
 * The ops console was unreachable by the owner. The page is served by a route
 * under a HEADER-only guard, and a browser cannot attach a custom header to a
 * top-level navigation — so `GET /ops` was a 401 in every case, including from
 * the documented `?token=` bookmark. The page's own localStorage bootstrap and
 * its token-prompt gate were the fallback for a visit that could never happen.
 *
 * That was the shipped consequence of a CORRECT fix applied at one level only:
 * red team #7 deleted the `?token=` branch because a query-string secret is
 * recorded by the logging interceptor, the exception filter, Sentry, browser
 * history and proxy logs. True, and it must not come back. But the PAGE's
 * delivery was never rederived to match, and the surface was hardened into
 * inaccessibility.
 *
 * The two resources are genuinely different. The JSON routes carry DATA and
 * are called by a header-capable client, so a header is the right credential.
 * The PAGE carries no data at all and is fetched by a NAVIGATION, whose only
 * credential a browser supplies automatically is a cookie. One credential
 * mechanism cannot serve both without either leaking the secret or refusing
 * the browser — which is exactly the fork the code was stuck on.
 *
 * So: a one-time bootstrap (`GET /ops/enter?token=…`) validates the secret and
 * 302s to `/ops` WITHOUT the query string, setting an HttpOnly + Secure +
 * SameSite=Strict cookie. The secret reaches a logged URL ONCE, on that single
 * bootstrap request, instead of riding on every subsequent fetch — and it
 * never reaches JavaScript at all.
 *
 * THE COOKIE IS NOT THE SECRET. Its value is `<expiry>.<hmac(secret, expiry)>`,
 * so a leaked cookie is a short-lived capability, not the OPS_DASH_TOKEN.
 * It expires on its own; rotating OPS_DASH_TOKEN invalidates every outstanding
 * session immediately, because the key IS the secret.
 *
 * CSRF: SameSite=Strict means the browser never attaches this cookie to a
 * cross-site request, so the one POST (alert ack) cannot be driven from
 * another origin. That is the posture check F200 asked for; it is the reason
 * Strict — not Lax — is load-bearing here.
 */

export const OPS_SESSION_COOKIE = 'ops_session';

/** Short-lived by law: the bootstrap URL is logged once, so the capability it
 *  mints must not outlive the incident you opened the console for. */
export const OPS_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** Scoped to the ops surface so it is never attached to any other route. */
function cookiePath(mountPath: string): string {
  return mountPath || '/ops';
}

export function mintOpsSessionCookieValue(
  secret: string,
  expiresAtMs: number,
): string {
  const expiry = String(expiresAtMs);
  const signature = createHmac('sha256', secret).update(expiry).digest('hex');
  return `${expiry}.${signature}`;
}

export function serializeOpsSessionCookie(
  secret: string,
  mountPath: string,
  now: number = Date.now(),
): string {
  const expiresAt = now + OPS_SESSION_TTL_MS;
  const value = mintOpsSessionCookieValue(secret, expiresAt);
  return [
    `${OPS_SESSION_COOKIE}=${value}`,
    `Path=${cookiePath(mountPath)}`,
    `Max-Age=${Math.floor(OPS_SESSION_TTL_MS / 1000)}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
  ].join('; ');
}

/** Verifies a presented cookie value against the secret and the clock. */
export function isValidOpsSessionCookie(
  value: string | undefined,
  secret: string,
  now: number = Date.now(),
): boolean {
  if (!value) {
    return false;
  }
  const separator = value.indexOf('.');
  if (separator <= 0) {
    return false;
  }
  const expiry = value.slice(0, separator);
  const expiresAtMs = Number(expiry);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) {
    return false;
  }
  const expected = mintOpsSessionCookieValue(secret, expiresAtMs);
  const presented = Buffer.from(value);
  const expectedBuf = Buffer.from(expected);
  return (
    presented.length === expectedBuf.length &&
    timingSafeEqual(presented, expectedBuf)
  );
}

/**
 * Minimal Cookie-header parse. Deliberately NOT a new dependency: the ops
 * surface needs one name, and @fastify/cookie would register a plugin on every
 * route in the app to serve one route here.
 */
export function readCookie(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      return part.slice(eq + 1).trim();
    }
  }
  return undefined;
}
