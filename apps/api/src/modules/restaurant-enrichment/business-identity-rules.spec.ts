/**
 * BUSINESS IDENTITY RULES — the one-home doctrine, proven.
 *
 * The load-bearing assertion is the SQL/JS agreement suite: the sweep's SQL
 * domain lane and the JS evidence hierarchy used to carry two hand-written
 * aggregator regexes that HAD drifted (facebook/instagram present in SQL,
 * absent in JS — so two entities sharing facebook.com merged as one "owned"
 * domain). Both now render from AGGREGATOR_DOMAIN_PATTERNS; this spec
 * evaluates the RENDERED SQL pattern and the JS predicate against the same
 * fixture set and goes RED if either renderer is ever edited alone.
 */
import {
  AGGREGATOR_DOMAIN_PATTERN,
  brandClusterPurity,
  identityDomain,
  isAggregatorDomain,
  nonAggregatorDomainSql,
  normalizeBrandName,
  restaurantNamesAgree,
  sameBusinessVerdict,
  type BusinessEvidence,
} from './business-identity-rules';

const AGGREGATOR_FIXTURES = [
  'chowbus.com',
  'doordash.com',
  'ubereats.com',
  'grubhub.com',
  'toasttab.com',
  'squareup.com',
  'order.square.site',
  'clover.com',
  'linktr.ee',
  'facebook.com',
  'instagram.com',
];

const OWNED_FIXTURES = [
  'joespizza.com',
  'franklinbbq.com',
  'uchiko.com',
  // ESCAPE PIN: `square\.site` must match the literal dot only. A renderer
  // that drops the backslash classifies this owned domain as an aggregator
  // and this line goes RED.
  'squarexsite.com',
];

describe('aggregator domain doctrine — one source, two renderings', () => {
  it('classifies the fixture set in JS', () => {
    for (const domain of AGGREGATOR_FIXTURES) {
      expect(isAggregatorDomain(domain)).toBe(true);
    }
    for (const domain of OWNED_FIXTURES) {
      expect(isAggregatorDomain(domain)).toBe(false);
    }
  });

  it('renders a SQL predicate whose pattern agrees with the JS predicate on every fixture', () => {
    const sql = nonAggregatorDomainSql('lower(a.canonical_domain)');
    expect(sql.startsWith("lower(a.canonical_domain) !~ '")).toBe(true);
    // Extract the pattern the DATABASE would evaluate and evaluate it here
    // (the pattern uses only alternation + an escaped dot, semantics shared
    // by POSIX and JS regexes).
    const match = sql.match(/!~ '(.+)'$/);
    expect(match).not.toBeNull();
    const sqlPattern = new RegExp(match![1]);
    for (const domain of [...AGGREGATOR_FIXTURES, ...OWNED_FIXTURES]) {
      expect(sqlPattern.test(domain)).toBe(isAggregatorDomain(domain));
    }
  });

  it('the drift that motivated the extraction is closed: facebook/instagram are aggregators in BOTH renderings', () => {
    expect(AGGREGATOR_DOMAIN_PATTERN).toContain('facebook');
    expect(AGGREGATOR_DOMAIN_PATTERN).toContain('instagram');
    expect(identityDomain('facebook.com')).toBeNull();
    expect(identityDomain('Instagram.com')).toBeNull();
  });

  it('identityDomain lowercases owned domains and rejects blanks', () => {
    expect(identityDomain('JoesPizza.com')).toBe('joespizza.com');
    expect(identityDomain('  ')).toBeNull();
    expect(identityDomain(null)).toBeNull();
  });
});

describe('brand name doctrine', () => {
  it('normalizes to the comparable brand form', () => {
    expect(normalizeBrandName("The Joe's Pizza!")).toBe('joe s pizza');
    expect(normalizeBrandName('   ')).toBeNull();
  });

  it('agrees on identical brands and word-boundary chain prefixes only', () => {
    expect(restaurantNamesAgree("Joe's Pizza", 'joes pizza')).toBe(false);
    expect(restaurantNamesAgree("Joe's Pizza", "Joe's Pizza Midtown")).toBe(
      true,
    );
    // NON-boundary prefix must not agree ("valentinas" inside a joined name).
    expect(restaurantNamesAgree('Valentinas', 'Valentinastexmex')).toBe(false);
    expect(restaurantNamesAgree("Joe's Pizza", 'Franklin BBQ')).toBe(false);
    expect(restaurantNamesAgree(null, 'Franklin BBQ')).toBe(false);
  });

  it('brand purity: a real chain with branch suffixes is pure; mixed brands are not', () => {
    expect(
      brandClusterPurity(['7-Eleven', '7-Eleven Downtown', '7-Eleven #42'])
        .pure,
    ).toBe(true);
    expect(brandClusterPurity(["Joe's Pizza", 'Franklin BBQ']).pure).toBe(
      false,
    );
    expect(brandClusterPurity([null, undefined]).pure).toBe(false);
  });
});

describe('evidence hierarchy (sameBusinessVerdict)', () => {
  const side = (over: Partial<BusinessEvidence>): BusinessEvidence => ({
    placeIds: [],
    domain: null,
    communities: [],
    dominantCommunity: null,
    ...over,
  });

  it('rule 1: shared place id merges regardless of anything else', () => {
    expect(
      sameBusinessVerdict(
        side({ placeIds: ['p1'], domain: 'a.com' }),
        side({ placeIds: ['p1', 'p2'], domain: 'b.com' }),
      ),
    ).toBe(true);
  });

  it('rule 1: same owned domain merges', () => {
    expect(
      sameBusinessVerdict(
        side({ domain: 'FranklinBBQ.com' }),
        side({ domain: 'franklinbbq.com' }),
      ),
    ).toBe(true);
  });

  it('rule 2: two distinct owned domains are two businesses', () => {
    expect(
      sameBusinessVerdict(
        side({ domain: 'a.com', dominantCommunity: 'austinfood' }),
        side({ domain: 'b.com', dominantCommunity: 'austinfood' }),
      ),
    ).toBe(false);
  });

  it('REGRESSION (the closed drift): a shared AGGREGATOR domain is not identity — the verdict falls through to communities', () => {
    // Under the old inline JS regex (no facebook), this pair merged on
    // "same owned domain" despite living in different metros.
    expect(
      sameBusinessVerdict(
        side({
          domain: 'facebook.com',
          dominantCommunity: 'austinfood',
          communities: ['austinfood'],
        }),
        side({
          domain: 'facebook.com',
          dominantCommunity: 'foodnyc',
          communities: ['foodnyc'],
        }),
      ),
    ).toBe(false);
  });

  it('rule 3: dominant-community identity merges; disjoint metros hold', () => {
    expect(
      sameBusinessVerdict(
        side({ dominantCommunity: 'austinfood', communities: ['austinfood'] }),
        side({ dominantCommunity: 'austinfood', communities: ['austinfood'] }),
      ),
    ).toBe(true);
    expect(
      sameBusinessVerdict(
        side({ dominantCommunity: 'austinfood', communities: ['austinfood'] }),
        side({ dominantCommunity: 'foodnyc', communities: ['foodnyc'] }),
      ),
    ).toBe(false);
  });

  it('rule 3: two evidence-free sides merge (pre-enrichment duplicates of the same stream)', () => {
    expect(sameBusinessVerdict(side({}), side({}))).toBe(true);
  });

  it('null dominant communities never satisfy the community rule', () => {
    expect(
      sameBusinessVerdict(
        side({ communities: ['austinfood'] }),
        side({ communities: [] }),
      ),
    ).toBe(false);
  });
});
