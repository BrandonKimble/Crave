/**
 * On-demand keyword-collection trigger threshold, shared by the three
 * consumers that must agree on it (SearchService trigger, keyword-search
 * scheduler priority, keyword-slice low-result severity).
 *
 * §16 K1 (owner sentence — re-filed from K6, retro audit 2026-07-24:
 * this IS falsifiable product policy, not a definition — the owner could
 * later want thin-result (<3) triggering once collection is cheap):
 * "only genuine emptiness pulls the collection cord" — trigger exactly
 * when a food query returns ZERO restaurants. Any value > 1 today would
 * be an invented quality bar. §18 docket: awaiting batch ratification. (2026-07-11 fold-in:
 * formerly env SEARCH_ON_DEMAND_MIN_RESULTS; scattered 25/pageSize
 * fallbacks were never in effect.)
 */
export const ON_DEMAND_MIN_RESULTS = 1;

/**
 * §16 K1 (owner sentences): "a viewport must be at least ~neighborhood-
 * sized (2 miles) before its emptiness says anything about the area," and
 * "a hair under the floor must not flap the trigger" (0.85 hysteresis).
 * Falsifiable product sentences, not measurements — the eye/usage may
 * re-ratify them. Formerly duplicated verbatim in search.service.ts and
 * search-query-interpretation.service.ts — extracted 2026-07-11.
 */
export const ON_DEMAND_MIN_VIEWPORT_WIDTH_MILES = 2;
export const ON_DEMAND_VIEWPORT_TOLERANCE = 0.85;
export const ON_DEMAND_VIEWPORT_MIN_WIDTH_MILES =
  ON_DEMAND_MIN_VIEWPORT_WIDTH_MILES * ON_DEMAND_VIEWPORT_TOLERANCE;
