/**
 * BUSINESS IDENTITY RULES — the ONE home for "are two restaurants the same
 * operating business?" (2026-08-11 convergence audit, ranked change #2).
 *
 * The doctrine used to live in three places and had already drifted: the
 * same-name sweep's SQL domain lane carried one aggregator regex (with
 * facebook/instagram), its JS evidence hierarchy carried ANOTHER (without
 * them — so two entities that merely shared facebook.com counted as one
 * owned domain and merged), and the enrichment service held its own copies
 * of the brand-name rules. One source now renders BOTH the SQL and the JS
 * predicate, so a fork between them is impossible by construction —
 * business-identity-rules.spec.ts additionally proves the two rendered
 * predicates agree on a fixture set and would go RED if either renderer
 * were edited alone.
 *
 * The three rule families:
 *  1. AGGREGATOR DOMAINS — hosts shared by unrelated restaurants
 *     (ordering/link platforms and social sites). They never count as
 *     ownership evidence, in any lane.
 *  2. BRAND NAMES — normalization + word-boundary prefix agreement
 *     (chain branches: "joe's pizza" / "joe's pizza midtown"), and cluster
 *     purity (a domain is a chain key only when EVERY member agrees with
 *     the cluster's brand root).
 *  3. THE EVIDENCE HIERARCHY — the merge/hold verdict for a candidate pair
 *     (shared ground or shared owned domain → merge; two distinct owned
 *     domains → two businesses; else same dominant community → merge).
 */

/**
 * Regex FRAGMENTS (POSIX-and-JS-compatible), the single source. Note
 * `square\.site` is escaped: a bare dot would also match e.g.
 * "squareXsite.com" — the spec pins the escape.
 */
export const AGGREGATOR_DOMAIN_PATTERNS: readonly string[] = [
  'chowbus',
  'doordash',
  'ubereats',
  'grubhub',
  'toasttab',
  'squareup',
  'square\\.site',
  'clover',
  'linktr',
  'facebook',
  'instagram',
];

/** The bare alternation pattern — identical bytes feed the SQL literal and
 *  the JS RegExp, which is the whole point. */
export const AGGREGATOR_DOMAIN_PATTERN = `(${AGGREGATOR_DOMAIN_PATTERNS.join('|')})`;

const AGGREGATOR_DOMAIN_JS_REGEX = new RegExp(AGGREGATOR_DOMAIN_PATTERN);

/**
 * SQL predicate: `<ref> !~ '(…)'`. Caller wraps with Prisma.raw; the ref is
 * caller-owned SQL (e.g. `lower(a.canonical_domain)`), the pattern is a
 * code constant — nothing user-supplied reaches the literal.
 */
export function nonAggregatorDomainSql(domainRef: string): string {
  return `${domainRef} !~ '${AGGREGATOR_DOMAIN_PATTERN}'`;
}

export function isAggregatorDomain(domain: string | null | undefined): boolean {
  return Boolean(domain) && AGGREGATOR_DOMAIN_JS_REGEX.test(domain as string);
}

/** A domain that carries OWNERSHIP signal: lowercased, non-aggregator, else
 *  null. (The sweep's old `domainOf`, minus its facebook/instagram hole.) */
export function identityDomain(
  domain: string | null | undefined,
): string | null {
  if (!domain?.trim()) return null;
  const lowered = domain.trim().toLowerCase();
  return isAggregatorDomain(lowered) ? null : lowered;
}

/** Normalize a restaurant name to its comparable brand form (lowercase,
 *  punctuation stripped, leading "the" dropped). */
export function normalizeBrandName(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^the\s+/, '')
    .trim();
  return normalized.length ? normalized : null;
}

/** Two restaurants are the same brand iff their names match, or one is a
 *  word-boundary brand prefix of the other (chain branches, e.g.
 *  "joe's pizza" / "joe's pizza midtown"). */
export function restaurantNamesAgree(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeBrandName(a);
  const nb = normalizeBrandName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.startsWith(`${nb} `) || nb.startsWith(`${na} `);
}

/**
 * BRAND-PURITY (list-free): a domain is trusted as a chain key only when ALL
 * restaurants sharing it form a single brand cluster. Purity = every member
 * agrees with the cluster's brand ROOT (the shortest brand name, so branch
 * suffixes don't break a real chain). Generic hosts accumulate many distinct
 * brands and therefore self-evidently fail this — so they never merge, even
 * when two names coincide.
 */
export function brandClusterPurity(names: Array<string | null | undefined>): {
  pure: boolean;
  brandRoot: string | null;
} {
  const brandRoot = names.reduce<string | null>((shortest, name) => {
    const normalized = normalizeBrandName(name);
    if (!normalized) return shortest;
    const shortestNormalized = normalizeBrandName(shortest);
    return !shortestNormalized || normalized.length < shortestNormalized.length
      ? (name ?? shortest)
      : shortest;
  }, null);
  const pure =
    brandRoot !== null &&
    names.every((name) => restaurantNamesAgree(brandRoot, name));
  return { pure, brandRoot };
}

export interface BusinessEvidence {
  /** Grounded google_place_ids held by this entity's locations. */
  placeIds: string[];
  /** Raw canonical domain (aggregator filtering happens here, not upstream). */
  domain: string | null;
  /** ACTIVE-scope communities this entity's corpus lives in. */
  communities: string[];
  /** The DOMINANT community (final red team #1: any-overlap cross-metro-merged). */
  dominantCommunity: string | null;
}

/**
 * THE EVIDENCE HIERARCHY (Phase 3.3, extracted verbatim from the same-name
 * sweep — replaces the place-id-disjointness proxy, which is the EXPECTED
 * state for legitimate chain branches):
 *  1. shared place id, or same registrable owned domain = one operating
 *     business → merge;
 *  2. both sides carry their OWN distinct owned domains → two businesses →
 *     hold;
 *  3. otherwise (any ungrounded/domainless side): same DOMINANT community →
 *     pre-enrichment duplicate → merge; both evidence-free → merge; disjoint
 *     metros → hold for the enrichment-time resolver.
 */
export function sameBusinessVerdict(
  a: BusinessEvidence,
  b: BusinessEvidence,
): boolean {
  const domainA = identityDomain(a.domain);
  const domainB = identityDomain(b.domain);
  const sharedPlaceId = a.placeIds.some((p) => b.placeIds.includes(p));
  if (sharedPlaceId || (domainA && domainB && domainA === domainB)) {
    return true;
  }
  if (domainA && domainB) {
    return false; // two distinct owned domains = two businesses
  }
  const sharedDominantCommunity =
    a.dominantCommunity !== null && a.dominantCommunity === b.dominantCommunity;
  return (
    sharedDominantCommunity || (!a.communities.length && !b.communities.length)
  );
}
