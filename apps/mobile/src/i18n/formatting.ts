/**
 * Locale-driven `Intl` formatting (plan: multilingual.md M7 "locale-driven Intl
 * formatting", M8).
 *
 * WHY THIS FILE EXISTS: Onboarding pinned `new Intl.NumberFormat('en-US', {
 * currency: 'USD' })` at module scope. The pin is two mistakes wearing one coat:
 *
 *   1. The LOCALE was hardcoded. The SAME USD amount that `Intl.NumberFormat`
 *      renders `$1,234` under `en-US` comes out `USD 1,234` under `es-MX` —
 *      the currency gets spelled out because a bare `$` reads as PESOS in
 *      Mexico, so the symbol must be disambiguated. (Region also drives the
 *      grouping/decimal separators; `es-ES` would group `1.234`.) Pinning the
 *      locale to `en-US` erased that distinction. Locale must follow the user.
 *   2. The CURRENCY was hardcoded — and that one is CORRECT, so it stays.
 *      Crave is live in Austin and NYC; the money in these graphs is literally
 *      US dollars spent in US cities. It is a FACT about the market, not a
 *      preference of the reader. The plan says as much: "market-bound terms
 *      like `under $100` localize CURRENCY FORMATTING, not the money."
 *
 * The happy consequence of splitting them: `Intl` renders USD-in-es-MX as
 * `US$25`, which is not a cosmetic difference — it is the app telling a
 * Spanish-speaking reader that the number is dollars and not pesos. The old pin
 * could not have said that.
 *
 * Formatters are memoized per (locale, shape) because constructing an
 * `Intl.NumberFormat` is the expensive part and these run inside render.
 */
import { getCurrentLocale } from './current-locale';

/** The market's currency. See the header: a fact, not a preference. */
export const MARKET_CURRENCY = 'USD';

const numberFormatterCache = new Map<string, Intl.NumberFormat>();

const getNumberFormatter = (locale: string, options: Intl.NumberFormatOptions) => {
  const cacheKey = `${locale}|${JSON.stringify(options)}`;
  let formatter = numberFormatterCache.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options);
    numberFormatterCache.set(cacheKey, formatter);
  }
  return formatter;
};

/**
 * Whole-dollar currency, in the reader's locale. Non-finite input renders as
 * zero rather than `NaN` — these are motivational graphs, and a `$NaN` in an
 * onboarding flow is worse than a `$0`.
 */
export const formatCurrency = (value: number, locale: string = getCurrentLocale()): string => {
  const safe = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  return getNumberFormatter(locale, {
    style: 'currency',
    currency: MARKET_CURRENCY,
    maximumFractionDigits: 0,
  }).format(safe);
};

/** Plain grouped number (`1,234` / `1.234`), in the reader's locale. */
export const formatNumber = (
  value: number,
  locale: string = getCurrentLocale(),
  options: Intl.NumberFormatOptions = {}
): string => getNumberFormatter(locale, options).format(Number.isFinite(value) ? value : 0);

/** Whole-percent (`35%`), in the reader's locale. Input is a RATIO (0.35). */
export const formatPercent = (ratio: number, locale: string = getCurrentLocale()): string =>
  getNumberFormatter(locale, { style: 'percent', maximumFractionDigits: 0 }).format(
    Number.isFinite(ratio) ? ratio : 0
  );

/**
 * Join a list the way the reader's language joins lists — `a, b y c` in
 * Spanish, `a, b, and c` in English — instead of the `', '` every call site
 * used to hardcode.
 *
 * `Intl.ListFormat` is NOT in Hermes and is not polyfilled (R5-9 keeps the
 * polyfill set minimal), so this degrades to the locale's comma. That is a
 * conscious, bounded loss: the surfaces using it are chip summaries, not prose.
 */
export const formatList = (
  items: readonly string[],
  locale: string = getCurrentLocale()
): string => {
  const parts = items.filter((item) => item && item.trim().length > 0);
  const ListFormat = (Intl as { ListFormat?: typeof Intl.ListFormat }).ListFormat;
  if (ListFormat) {
    try {
      return new ListFormat(locale, { style: 'long', type: 'conjunction' }).format(parts);
    } catch {
      // Fall through to the separator join.
    }
  }
  return parts.join(', ');
};
