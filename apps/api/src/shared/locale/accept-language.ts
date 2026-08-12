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
 * NORMALIZE A STORED LOCALE TAG at the write ingress — the ONE validator every
 * locale-bearing column (entity_surface.locale, entity_surface.locale (role<>'recall')) passes
 * through. `Intl.Locale` is the principled BCP-47 parser: it canonicalizes
 * casing (`ES`→`es`, `pt-br`→`pt-BR`) and THROWS on a malformed shape (`es_MX`,
 * a 100-char blob, `''`), so a typo can never land as free text that the match
 * filter then silently drops — a write that costs money and returns nothing.
 * A well-formed but unregistered tag (`xx-klingon`) is KEPT, not invented away:
 * it is honest input that simply matches only itself.
 *
 * `'und'` (RFC 5646 "undetermined") is the universal-alias sentinel and passes
 * through. Anything unparseable becomes `'und'` — the conservative floor, the
 * same choice `SurfaceInput` documents ("a FABRICATED tag is worse than none").
 */
export function normalizeLocaleTag(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed || trimmed.toLowerCase() === 'und') {
    return 'und';
  }
  try {
    return new Intl.Locale(trimmed).toString();
  } catch {
    return 'und';
  }
}

/**
 * THE LOCALE MATCH CHAIN — RFC 4647 Lookup expressed as the ORDERED list of
 * tags a request should match a stored row against, most-specific first,
 * always ending in the universal `'und'`. It is the same truncation +
 * macro-region walk `lookupSupported` runs, but instead of stopping at the
 * first supported tag it EMITS every step, so a data store can match with a
 * single `row.locale = ANY(chain)` (or `IN`) test.
 *
 * This exists so SQL grounding and TS display share ONE locale semantics.
 * The grounding path used to filter with `split_part(locale,'-',1) = base`
 * (symmetric first-subtag equality), while display used real Lookup — they
 * DISAGREE the moment a region or script subtag carries meaning: `pt-BR`
 * would ground a `pt-PT` row (both truncate to `pt`) but render its English
 * label, and `zh-Hant` would ground a `zh-Hans` alias. Routing both through
 * this chain makes them identical by construction:
 *   'es-MX' -> ['es-mx','es-419','es','und']   (macro-region before base)
 *   'es'    -> ['es','und']
 *   'zh-Hant' -> ['zh-hant','zh','und']         (a 'zh-hans' row is NOT in it)
 *   null/'*' -> ['und']                          (only universal rows match)
 * Lowercased throughout, because stored locale tags are matched
 * case-insensitively and 'und' is the one sentinel both sides agree on.
 */
export function localeLookupChain(range: string | null | undefined): string[] {
  const UNIVERSAL = 'und';
  const chain: string[] = [];
  const push = (tag: string) => {
    const lower = tag.toLowerCase();
    if (lower && !chain.includes(lower)) {
      chain.push(lower);
    }
  };
  if (range && range !== '*' && range.toLowerCase() !== UNIVERSAL) {
    const canonical = canonicalizeLocaleTag(range);
    push(canonical);
    for (const fallback of MACRO_REGION_FALLBACKS[canonical] ?? []) {
      push(fallback);
    }
    // Progressive truncation, singleton-dropping, exactly as lookupSupported.
    const subtags = canonical.split('-');
    while (subtags.length > 1) {
      subtags.pop();
      if (subtags[subtags.length - 1]?.length === 1) {
        subtags.pop();
      }
      push(subtags.join('-'));
    }
  }
  push(UNIVERSAL);
  return chain;
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

/**
 * THE DETECTED LOCALE OF AN ASK — normalized at the write ingress, and
 * SERVER-DERIVED BY LAW.
 *
 * `detectedLocale` answers "what language did this query turn out to be",
 * decided once per query by the analyzer. It is not a preference and not a
 * client fact: it rides onto the on-demand queue row, the paired
 * `on_demand_ask` signal, and the residue row, where it is later read as
 * EVIDENCE about which languages people ask in — evidence that steers
 * collection spend and vocabulary learning.
 *
 * Two things had to become true (red-team A0 R2, 2026-08-11):
 *
 *  1. A CLIENT MAY NOT SET IT. The structured `POST /search/run` DTO
 *     whitelisted the field, so any caller could post `detectedLocale: 'vi'`
 *     and mint Vietnamese demand evidence for an English query. The DTO now
 *     drops any inbound value (see search-query.dto.ts).
 *  2. WHAT THE SERVER SETS IS A REAL TAG. The old normalizer only trimmed and
 *     truncated to 35 chars, so a malformed tag would land as free text that
 *     the `locale = ANY(chain)` match filter silently never matches — a row
 *     that costs money to collect against and can never be found.
 *
 * `und` and anything unparseable become NULL, which is an honest answer: a
 * bare one-worder's language is genuinely undecidable, and a fabricated tag
 * on an evidence row is worse than no tag at all.
 */
export function normalizeDetectedLocaleTag(
  raw: string | null | undefined,
): string | null {
  const tag = normalizeLocaleTag(raw);
  return tag === 'und' ? null : tag;
}

/**
 * THE TAG A CLAIM ABOUT A WORD MAY BE BANKED UNDER: the base language, or
 * nothing.
 *
 * LANGUAGE ONLY, NEVER A REGION (red team F8b, generalized A0 R4). The
 * lookup chain is the only thing that ever reads a banked surface's locale:
 * `localeLookupChain('es-MX')` is `['es-mx','es','und']` while
 * `localeLookupChain('es')` is `['es','und']` — so a row banked as `es-MX`
 * is reachable ONLY by another es-MX caller, and a word we paid to learn (or
 * paid Google for) would be invisible to every other Spanish speaker and to
 * ingestion out of an `es` document. A region is real information about the
 * ASKER or the REQUEST; it is not information about the WORD, and these rows
 * are claims about words. `zh-TW` is the case that made this urgent: a
 * chain built from `zh` never reaches it.
 *
 * Normalization comes first, so a malformed tag becomes NOTHING rather than
 * a base language guessed off a string split — `und` and unparseable input
 * both return undefined, which banks as the universal `und` slice: the
 * honest answer when nobody can say what language a form was in.
 */
export function bankableLanguageTag(
  raw: string | null | undefined,
): string | undefined {
  const normalized = normalizeLocaleTag(raw);
  if (normalized === 'und') return undefined;
  const base = new Intl.Locale(normalized).language.toLowerCase();
  return base && base !== 'und' ? base : undefined;
}
