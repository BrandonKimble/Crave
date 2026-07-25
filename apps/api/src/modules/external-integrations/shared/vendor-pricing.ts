/**
 * Vendor price tables for non-Gemini spend — TomTom + Google Places (New).
 * Same K4-vendor-fact discipline as gemini-pricing.ts: this file is priced
 * from vendor-published (or owner-ratified) $-per-request rates, never
 * derived from usage. What changes this file: the vendor repricing, never
 * tuning.
 */

/**
 * TomTom Search-family draws (cheapGeocode + scarcePolygons): $2.50 per
 * 1,000 requests. NOT vendor-published-verified — this is the
 * OWNER-RATIFIED price-tag already living in governance.service.ts's
 * scarcePolygons comment (K1-sourced), applied here as the per-draw $
 * rate. VERIFY AGAINST FIRST TOMTOM INVOICE.
 */
export const tomtomCostMicrosPerDraw = 2_500;

/**
 * Google Places API (New), entry-tier per-1,000-requests pricing (K4,
 * fetched 2026-07-25 from developers.google.com/maps/billing-and-pricing/
 * pricing — tiered pricing; we price at the entry tier). SKU strings match
 * UsageLedgerService.classifyPlacesSku outputs.
 */
const PLACES_RATES_MICRO_USD_PER_CALL: Record<string, number> = {
  essentials: 5_000,
  pro: 17_000,
  enterprise: 20_000,
  enterprise_atmosphere: 25_000,
};

/** Unknown/null SKU fallback: the highest known entry-tier rate — the same
 *  over-meter-never-vanish principle as gemini-pricing's unknown model. */
const UNKNOWN_PLACES_SKU_RATE_MICRO_USD = 25_000;

/** Micro-USD cost of one Google Places (New) call, priced by SKU tier. */
export function placesCostMicrosPerCall(skuTier: string | null): number {
  if (skuTier === null) {
    return UNKNOWN_PLACES_SKU_RATE_MICRO_USD;
  }
  return (
    PLACES_RATES_MICRO_USD_PER_CALL[skuTier] ??
    UNKNOWN_PLACES_SKU_RATE_MICRO_USD
  );
}
