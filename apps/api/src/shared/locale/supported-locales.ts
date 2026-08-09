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
 */
export const SUPPORTED_LOCALES = ['en', 'es', 'vi'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * The unlabeled fallback (plan M2, explicit): English. A concept with no
 * label row for the negotiated locale displays its English `name` — never a
 * blank, never a slug the user cannot read.
 */
export const DEFAULT_LOCALE: SupportedLocale = 'en';

export function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
