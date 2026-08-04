/**
 * M1 — ACCEPT-LANGUAGE NEGOTIATION (RFC 9110 §12.5.4 + RFC 4647 Lookup).
 *
 * Two standards, one job:
 *   - RFC 9110 parses the header into (tag, q) pairs and orders them by
 *     preference. q=0 is an explicit REFUSAL, not a low preference.
 *   - RFC 4647 §3.4 "Lookup" matches one requested tag against the supported
 *     set by progressively truncating subtags at '-' — `es-MX` → `es-419` (a
 *     declared macro-region fallback) → `es`. Lookup returns exactly ONE
 *     result, which is what a display surface needs; Filtering (§3.3) returns
 *     a set and is the wrong algorithm here.
 *
 * Everything in this file is PURE. The negotiated locale is a function of the
 * header text and the supported set, so it is testable without a request, a
 * database, or Nest.
 */
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from './supported-locales';

interface RangeWithQuality {
  range: string;
  quality: number;
}

/**
 * DECLARED MACRO-REGION FALLBACKS. RFC 4647 truncation alone takes `es-MX` to
 * `es`, which is right; this table exists so that when `es-419` (Latin
 * American Spanish) becomes a supported locale, `es-MX` reaches it BEFORE
 * falling all the way to `es`. Truncation cannot discover a macro-region on
 * its own — the relationship is data, not string surgery.
 */
const MACRO_REGION_FALLBACKS: Readonly<Record<string, readonly string[]>> = {
  'es-MX': ['es-419'],
  'es-AR': ['es-419'],
  'es-CO': ['es-419'],
  'es-CL': ['es-419'],
  'es-PE': ['es-419'],
  'pt-BR': [],
};

/**
 * Parse an Accept-Language header into ranges ordered by descending quality.
 * Malformed elements are skipped rather than throwing: a header is
 * client-controlled input on every request, and a 400 for a stray semicolon
 * would be a self-inflicted outage.
 */
export function parseAcceptLanguage(header: string | undefined): string[] {
  if (!header) {
    return [];
  }
  const parsed: RangeWithQuality[] = [];
  for (const rawPart of header.split(',')) {
    const part = rawPart.trim();
    if (!part) {
      continue;
    }
    const [rawRange, ...paramChunks] = part.split(';');
    const range = rawRange.trim();
    // A language range is ALPHANUM subtags joined by '-', or the wildcard.
    if (!/^(\*|[A-Za-z]{1,8}(-[A-Za-z0-9]{1,8})*)$/.test(range)) {
      continue;
    }
    let quality = 1;
    for (const chunk of paramChunks) {
      const match = /^\s*q\s*=\s*([0-9]+(?:\.[0-9]+)?)\s*$/i.exec(chunk);
      if (match) {
        const value = Number.parseFloat(match[1]);
        quality = Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 1;
      }
    }
    // q=0 means "explicitly not acceptable" — it must not be treated as a
    // weak preference, so it never enters the priority list at all.
    if (quality <= 0) {
      continue;
    }
    parsed.push({ range, quality });
  }
  // Stable sort by descending q — equal q keeps header order, which the RFC
  // treats as the client's own tie-break.
  return parsed
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map((entry) => entry.range);
}

/** Canonical BCP 47 casing: `es-mx` → `es-MX`, `zh-hans` → `zh-Hans`. */
export function canonicalizeLocaleTag(tag: string): string {
  const subtags = tag.split('-');
  return subtags
    .map((subtag, index) => {
      if (index === 0) {
        return subtag.toLowerCase();
      }
      if (subtag.length === 2) {
        return subtag.toUpperCase(); // region
      }
      if (subtag.length === 4) {
        return subtag[0].toUpperCase() + subtag.slice(1).toLowerCase(); // script
      }
      return subtag.toLowerCase();
    })
    .join('-');
}

/**
 * RFC 4647 §3.4 Lookup for ONE range against the supported set. Returns the
 * matched supported locale, or null when nothing matches (the caller decides
 * the default — this function never invents one).
 */
export function lookupSupported(
  range: string,
  supported: readonly string[] = SUPPORTED_LOCALES,
): string | null {
  if (range === '*') {
    return supported[0] ?? null;
  }
  const canonical = canonicalizeLocaleTag(range);
  const byLower = new Map(supported.map((tag) => [tag.toLowerCase(), tag]));

  const exact = byLower.get(canonical.toLowerCase());
  if (exact) {
    return exact;
  }
  for (const fallback of MACRO_REGION_FALLBACKS[canonical] ?? []) {
    const hit = byLower.get(fallback.toLowerCase());
    if (hit) {
      return hit;
    }
  }
  // Progressive truncation. Singleton subtags (`x`, `u`) are dropped with the
  // subtag that follows them, per §3.4 step 3.
  const subtags = canonical.split('-');
  while (subtags.length > 1) {
    subtags.pop();
    if (subtags[subtags.length - 1]?.length === 1) {
      subtags.pop();
    }
    const truncated = subtags.join('-').toLowerCase();
    const hit = byLower.get(truncated);
    if (hit) {
      return hit;
    }
  }
  return null;
}

/**
 * THE NEGOTIATION. Priority, highest first:
 *   1. the user's explicit profile locale (D4's override half),
 *   2. the request's Accept-Language priority list (D4's per-request half),
 *   3. DEFAULT_LOCALE.
 *
 * The profile override still goes through Lookup: a stored `es-MX` on a
 * server that supports only `es` must resolve to `es`, not fail.
 */
export function negotiateLocale(input: {
  acceptLanguage?: string | undefined;
  profileLocale?: string | null | undefined;
  supported?: readonly string[];
}): SupportedLocale {
  const supported = input.supported ?? SUPPORTED_LOCALES;
  if (input.profileLocale) {
    const chosen = lookupSupported(input.profileLocale, supported);
    if (chosen) {
      return chosen as SupportedLocale;
    }
  }
  for (const range of parseAcceptLanguage(input.acceptLanguage)) {
    const chosen = lookupSupported(range, supported);
    if (chosen) {
      return chosen as SupportedLocale;
    }
  }
  return DEFAULT_LOCALE;
}
