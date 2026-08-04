/**
 * Locale resolution — the ONE place that turns "what the device says" into
 * "the tag this app runs in" (plan: multilingual.md M1/M7, ratified D4).
 *
 * Pure and dependency-free ON PURPOSE: this is the half of the locale story a
 * unit test can pin, and both i18next and the API client read their answer from
 * here rather than each re-deriving one (two derivations is how a UI in Spanish
 * ends up asking the API in English).
 */

/**
 * Locales this build ships UI strings for, in preference order. `en` is the
 * source language and the terminal fallback — it must stay last.
 *
 * ADDING A LOCALE is three edits and no code: this list, a
 * `locales/<tag>.json`, and the matching `@formatjs/intl-pluralrules`
 * locale-data import in polyfills.ts. That is the plan's "each additional
 * language afterward is DATA, not code" made literal.
 */
export const SUPPORTED_LOCALES = ['en', 'es'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'en';

/**
 * RTL scripts, for the I18nManager wiring point in index.ts. Kept here (not in
 * the RN-importing module) so the layout-direction question stays answerable in
 * a plain node test.
 */
const RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur', 'yi', 'ps', 'sd', 'ug', 'dv']);

const isSupported = (tag: string): tag is SupportedLocale =>
  (SUPPORTED_LOCALES as readonly string[]).includes(tag);

/**
 * Normalize a BCP 47 tag to the casing the rest of the system compares on:
 * lowercase language, uppercase region, title-case script (`es-mx` → `es-MX`,
 * `zh-hant-tw` → `zh-Hant-TW`). Case is not semantic in BCP 47, so comparing
 * raw device output against our tables is a bug waiting for the one device that
 * reports `ES-mx`.
 */
export const normalizeBcp47 = (tag: string): string => {
  const trimmed = tag.trim().replace(/_/g, '-');
  if (!trimmed) {
    return '';
  }
  return trimmed
    .split('-')
    .map((part, index) => {
      if (index === 0) {
        return part.toLowerCase();
      }
      if (part.length === 2) {
        return part.toUpperCase();
      }
      if (part.length === 4) {
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      }
      return part.toLowerCase();
    })
    .join('-');
};

/**
 * RFC 4647 §3.4 "Lookup": progressively truncate the requested tag at each
 * subtag boundary until something matches, skipping the singleton/private-use
 * truncations the RFC calls out. `es-MX` → `es-MX`, then `es`, then the
 * default. Returns `null` when nothing in the range matches.
 *
 * This is deliberately Lookup and not "Filtering": a UI needs exactly ONE
 * answer, and the RFC's own guidance is that Lookup is the algorithm for that.
 */
export const lookupBestMatch = (
  requested: string,
  available: readonly string[] = SUPPORTED_LOCALES
): string | null => {
  const normalizedAvailable = available.map((tag) => normalizeBcp47(tag));
  let candidate = normalizeBcp47(requested);

  while (candidate.length > 0) {
    const hit = normalizedAvailable.find((tag) => tag.toLowerCase() === candidate.toLowerCase());
    if (hit) {
      return hit;
    }
    const lastDash = candidate.lastIndexOf('-');
    if (lastDash < 0) {
      return null;
    }
    candidate = candidate.slice(0, lastDash);
    // RFC 4647: a truncation that leaves a single-character (singleton) subtag
    // trailing is dropped along with it — `de-DE-u-co-phonebk` must not become
    // the meaningless `de-DE-u`.
    if (/-[a-zA-Z0-9]$/.test(candidate)) {
      const next = candidate.lastIndexOf('-');
      candidate = next < 0 ? '' : candidate.slice(0, next);
    }
  }
  return null;
};

/**
 * Pick the app locale from the device's ORDERED preference list (iOS/Android
 * both expose more than one). First device preference that lookup-matches a
 * supported locale wins; otherwise the default.
 */
export const resolveSupportedLocale = (devicePreferences: readonly string[]): SupportedLocale => {
  for (const preference of devicePreferences) {
    if (!preference) {
      continue;
    }
    const match = lookupBestMatch(preference);
    if (match && isSupported(match)) {
      return match;
    }
  }
  return DEFAULT_LOCALE;
};

/**
 * The tag we SEND and FORMAT with — not the same thing as the tag we look
 * strings up under.
 *
 * A Mexican user on `es-MX` reads the `es` string bundle (we do not ship a
 * per-region bundle) but must still see `$1,234` grouped and dated the Mexican
 * way, and the API must know the region so IT can negotiate regionally. So:
 * strings key on the SUPPORTED locale, `Intl` and `Accept-Language` carry the
 * FULL device tag whenever its language matches what we resolved. When the
 * device asks for something we do not ship (`de-DE`), the full tag is dropped —
 * formatting German numbers around English words is worse than plain English.
 */
export const resolveFormattingLocale = (
  devicePreferences: readonly string[],
  supported: SupportedLocale
): string => {
  for (const preference of devicePreferences) {
    const normalized = normalizeBcp47(preference ?? '');
    if (!normalized) {
      continue;
    }
    if (normalized.split('-')[0].toLowerCase() === supported) {
      return normalized;
    }
  }
  return supported;
};

export const isRtlLocale = (tag: string): boolean =>
  RTL_LANGUAGES.has(normalizeBcp47(tag).split('-')[0].toLowerCase());
