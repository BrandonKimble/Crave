/**
 * M1 — THE ACTIVE LOCALE SET.
 *
 * R5-5 is the law here: locale keys are FULL BCP 47 tags. `es-MX`, `es-AR`
 * and `es-ES` diverge on exactly food vocabulary (torta; palta vs aguacate),
 * and `zh-Hans`/`zh-Hant` is unrecoverable from a bare `zh` — so the key
 * space is the full tag from day one, even while the SET is two entries.
 * Widening a key space later in an append-only store is the A10 failure mode.
 *
 * SUPPORTED_LOCALES is the RFC 4647 "language priority list" the server can
 * actually serve — every entry must have (a) a UI string bundle or (b) label
 * rows, and today `es` has label rows for the spine. Adding a locale is a
 * DATA change (a locale file + ~60 spine words + sweep rows), not a code
 * change; this array is the one place that fact is declared.
 *
 * `zh` IS BARE ON PURPOSE, and it is not a contradiction of the R5-8 tag law
 * above (2026-08-12). The law governs the KEY SPACE — what a row may be
 * banked under — and that space is the full tag; it does not oblige the
 * SERVE list to name a script it cannot observe. Nothing upstream produces a
 * script subtag: the script gate reads Unicode ranges and pins Han to `zh`
 * (SCRIPT_PINNED_LANGUAGE), the detector's profile is `cmn`, and
 * `bankableLanguageTag` bases every write to its language subtag. A
 * `zh-Hans` entry here would be a tag no request, no detection and no write
 * ever produces, so the lookup chain from `zh` would reach none of its rows
 * — the exact `zh-TW` failure that function's comment already warns about.
 * Simplified/traditional is a RENDERING question for the day the corpus
 * carries both; the key space is ready for it and this list is not the place
 * to assert it early.
 */
export const SUPPORTED_LOCALES = ['en', 'es', 'vi', 'zh'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * EVERY LOCALE A SURFACE MAY BE BANKED AT — the WRITE-side vocabulary, which
 * is NOT the serve-side list above.
 *
 * `SUPPORTED_LOCALES` answers "what can the server serve?", and every reader
 * that negotiates a request is right to use it. A claim docket asks a
 * different question — "what locales do rows in `entity_surface` actually
 * carry?" — and the answer has always had one more entry: `und`, the honest
 * tag for a form nobody can assign a language to, which the write door banks
 * deliberately.
 *
 * Reading the serve list where the write vocabulary was meant is not a
 * cosmetic mix-up; it silently orphans a whole docket. The word-claim
 * adjudicator's due-scan is per-locale by law (locale is part of the claim
 * key, and the v3 hearing asks a question about a speaker of that locale), so
 * a drain that iterates `SUPPORTED_LOCALES` opens four dockets and never the
 * fifth. Measured on the live corpus the day this was added: 321 inference-
 * sourced `und` rows, every one of them a claim no scan could ever offer and
 * no rule bump could ever re-open — permanently unheard, not by a verdict but
 * by an enumeration.
 *
 * So the docket vocabulary is declared HERE, once, beside the list it is
 * forever going to be confused with, and the drain iterates this one.
 */
export const CLAIMABLE_LOCALES = [...SUPPORTED_LOCALES, 'und'] as const;

export type ClaimableLocale = (typeof CLAIMABLE_LOCALES)[number];

/**
 * The unlabeled fallback (plan M2, explicit): English. A concept with no
 * label row for the negotiated locale displays its English `name` — never a
 * blank, never a slug the user cannot read.
 */
export const DEFAULT_LOCALE: SupportedLocale = 'en';

export function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
