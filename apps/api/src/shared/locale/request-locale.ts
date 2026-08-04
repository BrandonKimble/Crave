/**
 * M1 — the request-scoped locale, resolved ONCE and cached on the request.
 *
 * WHY NOT MIDDLEWARE: Nest middleware runs BEFORE guards, so `request.user`
 * does not exist yet — a middleware could only ever see the header half of
 * D4 and would silently ignore every profile override. The resolution
 * therefore happens at or after the guard boundary (interceptor + param
 * decorator), and is memoised on the request object so the two entry points
 * can never disagree with each other.
 */
import type { FastifyRequest } from 'fastify';
import type { User } from '@prisma/client';
import { negotiateLocale } from './accept-language';
import type { SupportedLocale } from './supported-locales';

export const REQUEST_LOCALE_KEY = 'craveLocale';

export type LocaleAwareRequest = FastifyRequest & {
  user?: User;
  [REQUEST_LOCALE_KEY]?: SupportedLocale;
};

/**
 * Resolve-and-cache. Idempotent: the interceptor primes it for services that
 * read the raw request, and `@RequestLocale()` returns the same value even on
 * routes the interceptor never touched (a controller must never depend on
 * global wiring being present to get a correct locale).
 */
export function resolveRequestLocale(
  request: LocaleAwareRequest,
): SupportedLocale {
  const cached = request[REQUEST_LOCALE_KEY];
  if (cached) {
    return cached;
  }
  const headers = (request.headers ?? {}) as Record<
    string,
    string | string[] | undefined
  >;
  const raw = headers['accept-language'];
  const acceptLanguage = Array.isArray(raw) ? raw.join(',') : raw;
  const locale = negotiateLocale({
    acceptLanguage,
    profileLocale: request.user?.locale ?? null,
  });
  request[REQUEST_LOCALE_KEY] = locale;
  return locale;
}
