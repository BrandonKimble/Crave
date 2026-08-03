/**
 * Vendor price tables for non-Gemini spend — TomTom + Google Places (New).
 * Same K4-vendor-fact discipline as gemini-pricing.ts: this file is priced
 * from vendor-published (or owner-ratified) $-per-request rates, never
 * derived from usage. What changes this file: the vendor repricing, never
 * tuning.
 */

/**
 * EUR→USD conversion for TomTom (which prices in EUR) into the table's
 * micro-USD unit. K4-shaped market fact fetched 2026-07-25 (~1.08);
 * refreshed when the price table is next touched or the invoice-vs-table
 * reconciliation shows drift. Slight staleness only skews estimates a few
 * percent — the envelope tolerance absorbs it.
 */
const EUR_TO_USD = 1.08;

/**
 * TomTom rates — VENDOR-VERIFIED 2026-07-25 (docs.tomtom.com/pricing,
 * per-API pricing modals; per 1,000 requests at OUR volume tier):
 *  - Search API (legacy family: /search/2/search, additionalData polygon
 *    fetches — the SCARCE draws): free ≤2.5K/mo, then €3.00/1k
 *    (2.5K–100K tier). The previously owner-ratified $2.50/1k
 *    UNDERESTIMATED this (~$3.24 at the conversion above).
 *  - Geocoding + Reverse Geocoding (/search/2/geocode,
 *    /search/2/reverseGeocode — the CHEAP draws): free ≤20K/mo EACH, then
 *    €1.00/1k. Our cheap pool's 20k monthly backstop sits exactly at the
 *    free boundary, so cheap draws are effectively FREE at our volume —
 *    we still price them at the paid rate (conservative over-estimate;
 *    estimates may only err safe).
 */
export const tomtomScarceCostMicrosPerDraw = Math.round(
  (3.0 * EUR_TO_USD * 1_000_000) / 1_000,
); // €3.00/1k → 3,240 micro-USD/draw

/** Honest UNSPLITTABLE-LEDGER blended rate: the usage ledger records TomTom
 *  draws without distinguishing cheap (geocode) from scarce (polygon) kinds,
 *  so ledger-derived cost readers price EVERY draw at the scarce (higher)
 *  rate — over-meter, never vanish. */
export const tomtomBlendedCostMicrosPerDraw = tomtomScarceCostMicrosPerDraw;

/**
 * Google Places API (New), entry-tier per-1,000-requests pricing (K4,
 * fetched 2026-07-25 from developers.google.com/maps/billing-and-pricing/
 * pricing — tiered pricing; we price at the entry tier). SKU strings match
 * UsageLedgerService.classifyPlacesSku outputs.
 */
// OPERATION-AWARE (red team R3, 2026-07-29): Google prices per
// operation x SKU, not per SKU — textSearch:pro is $0.032/call while
// placeDetails:pro is $0.017. The old per-SKU table silently applied the
// placeDetails rate to every operation, under-metering textSearch ~1.9x in
// the GOVERNOR while the standalone cost-report kept its own correct table
// (two tables, the wrong one governing money — the exact drift class the
// gemini rate-table unification killed). Rates: Cloud Billing catalog,
/**
 * THE name of a paid Google Places operation. One vocabulary for all three
 * systems that reference it: the rate-limit scope, the usage ledger, and the
 * config `operationLimits` keys.
 *
 * WHY (red team 2026-08-02). There used to be three. The rate limiter called
 * text search `findPlaceFromText`, the ledger and this pricing table call it
 * `textSearch`, and config had no key for it at all. So an owner reacting to a
 * Places bill by adding `textSearch: { requestsPerMinute: 10 }` to
 * operationLimits got NO EFFECT — the scope lookup missed and silently fell
 * back to the 600/min service default. The cap you would most want to set was
 * the one you could not set, on the most expensive Places call ($0.032/call
 * versus placeDetails' $0.017), and nothing warned.
 */
export type PlacesOperation = 'placeDetails' | 'autocomplete' | 'textSearch';

export const PLACES_OPERATIONS: readonly PlacesOperation[] = [
  'placeDetails',
  'autocomplete',
  'textSearch',
];

// verified 2026-07-08; cost-report's table folded in here.
const PLACES_RATES_MICRO_USD_PER_CALL: Record<string, number> = {
  'placeDetails:essentials': 5_000,
  'placeDetails:pro': 17_000,
  'placeDetails:enterprise': 20_000,
  'placeDetails:enterprise_atmosphere': 25_000,
  'textSearch:pro': 32_000,
  'textSearch:enterprise': 35_000,
  'textSearch:enterprise_atmosphere': 40_000,
  'autocomplete:essentials': 2_800,
};

/** Per-SKU ceiling across operations — used when the caller has no
 *  operation dimension. Over-meter, never vanish. */
const SKU_MAX_MICRO_USD: Record<string, number> = {
  essentials: 5_000,
  pro: 32_000,
  enterprise: 35_000,
  enterprise_atmosphere: 40_000,
};

/** Unknown/null fallback: highest known rate — over-meter, never vanish. */
const UNKNOWN_PLACES_SKU_RATE_MICRO_USD = 40_000;

/** Micro-USD cost of one Google Places (New) call. Pass the ledger's
 *  operation for the exact rate; without it the SKU ceiling applies. */
export function placesCostMicrosPerCall(
  skuTier: string | null,
  operation?: string | null,
): number {
  if (skuTier === null) {
    return UNKNOWN_PLACES_SKU_RATE_MICRO_USD;
  }
  if (operation) {
    const exact = PLACES_RATES_MICRO_USD_PER_CALL[`${operation}:${skuTier}`];
    if (exact !== undefined) {
      return exact;
    }
  }
  return SKU_MAX_MICRO_USD[skuTier] ?? UNKNOWN_PLACES_SKU_RATE_MICRO_USD;
}

/**
 * Identity function whose only job is to make `googlePlaces.operationLimits`
 * exhaustive over PlacesOperation at COMPILE time: a stray key and a missing
 * key are both errors. A limit you cannot set is indistinguishable from a
 * limit you forgot to set — that is exactly how textSearch ran uncapped on
 * the most expensive Places call.
 */
export function placesOperationLimits<
  T extends Record<
    PlacesOperation,
    { requestsPerMinute: number; requestsPerDay: number }
  >,
>(limits: T & Record<Exclude<keyof T, PlacesOperation>, never>): T {
  return limits;
}
