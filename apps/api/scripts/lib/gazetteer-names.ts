/**
 * Census gazetteer → provider-facing name normalization, shared by the seed
 * scripts (seed-us-places.ts municipalities, seed-coarse-polygons.ts
 * counties). One idiom, one home — the identity law (§1) is name-based, so a
 * normalization drift between seeds would fork the catalog.
 */

/** Strip the trailing LSAD descriptor: the run of tokens that are entirely
 *  lowercase (optionally parenthesized). "Abbeville city" → "Abbeville";
 *  "Nashville-Davidson metropolitan government (balance)" →
 *  "Nashville-Davidson"; "Carson City" and "Village of the Branch" untouched
 *  (trailing token capitalized). Self-deriving rule on purpose: no hardcoded
 *  LSAD table to rot. */
export function stripLsadDescriptor(name: string): string {
  const tokens = name.trim().split(/\s+/);
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1];
    const bare = last.replace(/^\(|\)$/g, '');
    if (bare.length > 0 && bare === bare.toLowerCase()) {
      tokens.pop();
    } else {
      break;
    }
  }
  return tokens.join(' ');
}

/** Census county name → the provider-facing county-axis form. TomTom's
 *  countrySecondarySubdivision is the BARE name (live-probed 2026-07-19:
 *  "Tarrant", "San Patricio"); Census appends a designator ("Tarrant
 *  County", "Richmond city"). Reuse the self-deriving lowercase-run strip
 *  (LSAD descriptors are lowercase: "city", "municipio"), then strip one
 *  trailing CAPITALIZED designator token from the two dominant families
 *  (County ~3,000 of ~3,143; Parish = Louisiana). Alaska/PR oddballs
 *  ("Juneau City and Borough") keep their full form — if TomTom names them
 *  differently, the merge law's overlap rule absorbs the disagreement
 *  (logged, no fork), so this stays a best-effort normalization, not a
 *  correctness gate. */
export function countyAxisName(censusCountyName: string): string {
  const stripped = stripLsadDescriptor(censusCountyName);
  const withoutDesignator = stripped.replace(/\s+(County|Parish)$/, '');
  return withoutDesignator.length > 0 ? withoutDesignator : stripped;
}
