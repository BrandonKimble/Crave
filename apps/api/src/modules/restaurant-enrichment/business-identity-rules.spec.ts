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
  placeNamesAgree,
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
  it('normalizes to the comparable brand form via THE canonical fold', () => {
    // Apostrophes STRIP (entity-identity fold law: Phil's == Phils) — the old
    // inline regex turned them into a space and forked from the identity
    // doctrine.
    expect(normalizeBrandName("The Joe's Pizza!")).toBe('joes pizza');
    expect(normalizeBrandName('   ')).toBeNull();
  });

  it('MULTILINGUAL: accented letters fold to base letters instead of vanishing', () => {
    // Old regex deleted ơ/ở entirely: "Bò Né" -> "b n". RED under the old
    // implementation.
    expect(normalizeBrandName('Phở Bò')).toBe('pho bo');
    // Two distinct tone-differing Vietnamese brands must NOT agree on an
    // accent-stripped residue of deleted letters.
    expect(placeNamesAgree('Bò Né', 'Bà Nà')).toBe(false);
  });

  it('MULTILINGUAL: CJK names carry brand identity (old regex nulled them)', () => {
    expect(normalizeBrandName('三峡人家')).toBe('三峡人家');
    expect(placeNamesAgree('三峡人家', '三峡人家')).toBe(true);
    expect(placeNamesAgree('三峡人家', '老四川')).toBe(false);
    // A CJK-named chain sharing an owned domain can now be brand-pure.
    expect(brandClusterPurity(['三峡人家', '三峡人家 Midtown']).pure).toBe(
      true,
    );
    // Mixed-script: the parenthetical form is a suffix-extension, not a clash.
    expect(
      placeNamesAgree(
        'House of Three Gorges',
        'House of Three Gorges (三峡人家)',
      ),
    ).toBe(true);
  });

  it('MULTILINGUAL (ruling R4): the ACCENT VETO — tone-differing vi brands never agree on the stripped fold', () => {
    // canonicalFold makes both "com chay": without the veto these two
    // different shops (vegetarian rice / scorched rice) are one brand.
    // Mutation proof: return `true` unconditionally after the folded
    // agreement check and this goes RED.
    expect(placeNamesAgree('Cơm Chay', 'Cơm Cháy')).toBe(false);
    // One accentless side asserts nothing — de-diacritized typing still
    // agrees (the same one-sided rule as the resolver tiers).
    expect(placeNamesAgree('bun dau', 'Bún Đậu')).toBe(true);
    expect(placeNamesAgree('Bún Đậu', 'Bún Đậu Midtown')).toBe(true);
    // Both accented and AGREEING accent forms: still one brand.
    expect(placeNamesAgree('Bún Đậu', 'bún đậu')).toBe(true);
  });

  it('MULTILINGUAL (ruling R4): đ, ß and æ fold to comparable forms in the ONE fold authority', () => {
    // đ is a base letter with a stroke — NFKD does not decompose it; the
    // fold maps it explicitly. A drift between the JS fold and any stored
    // key would surface here first.
    expect(normalizeBrandName('Bún Đậu')).toBe('bun dau');
    expect(normalizeBrandName('Straße')).toBe('strasse');
    expect(placeNamesAgree('Straße', 'strasse')).toBe(true);
    expect(normalizeBrandName('Café Æble')).toBe('cafe aeble');
    expect(placeNamesAgree('Café Æble', 'cafe aeble')).toBe(true);
  });

  it('agrees on identical brands and word-boundary chain prefixes only', () => {
    // Fold-law alignment: apostrophe spelling variants are ONE brand.
    expect(placeNamesAgree("Joe's Pizza", 'joes pizza')).toBe(true);
    expect(placeNamesAgree("Joe's Pizza", "Joe's Pizza Midtown")).toBe(true);
    // NON-boundary prefix must not agree ("valentinas" inside a joined name).
    expect(placeNamesAgree('Valentinas', 'Valentinastexmex')).toBe(false);
    expect(placeNamesAgree("Joe's Pizza", 'Franklin BBQ')).toBe(false);
    expect(placeNamesAgree(null, 'Franklin BBQ')).toBe(false);
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
      ).merge,
    ).toBe(true);
  });

  it('rule 1: same owned domain merges', () => {
    expect(
      sameBusinessVerdict(
        side({ domain: 'FranklinBBQ.com' }),
        side({ domain: 'franklinbbq.com' }),
      ).merge,
    ).toBe(true);
  });

  it('rule 2: two distinct owned domains are two businesses', () => {
    expect(
      sameBusinessVerdict(
        side({ domain: 'a.com', dominantCommunity: 'austinfood' }),
        side({ domain: 'b.com', dominantCommunity: 'austinfood' }),
      ).merge,
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
      ).merge,
    ).toBe(false);
  });

  it('rule 3: dominant-community identity merges; disjoint metros hold', () => {
    expect(
      sameBusinessVerdict(
        side({ dominantCommunity: 'austinfood', communities: ['austinfood'] }),
        side({ dominantCommunity: 'austinfood', communities: ['austinfood'] }),
      ).merge,
    ).toBe(true);
    expect(
      sameBusinessVerdict(
        side({ dominantCommunity: 'austinfood', communities: ['austinfood'] }),
        side({ dominantCommunity: 'foodnyc', communities: ['foodnyc'] }),
      ).merge,
    ).toBe(false);
  });

  it('rule 3: two evidence-free sides merge (pre-enrichment duplicates of the same stream)', () => {
    expect(sameBusinessVerdict(side({}), side({})).merge).toBe(true);
  });

  it('rule 3 (R2 widening): a side with NO community evidence cannot conflict — it merges into its evidenced fold twin', () => {
    // campaign red-team v3 R2: Vincents (shell, zero active mentions) beside
    // grounded Vincent's held forever under the old both-empty-only arm.
    expect(
      sameBusinessVerdict(
        side({ communities: ['austinfood'], dominantCommunity: 'austinfood' }),
        side({ communities: [] }),
      ).merge,
    ).toBe(true);
  });

  it('two sides that BOTH carry community evidence still need the same dominant metro', () => {
    expect(
      sameBusinessVerdict(
        side({ communities: ['austinfood'], dominantCommunity: 'austinfood' }),
        side({ communities: ['foodnyc'], dominantCommunity: 'foodnyc' }),
      ).merge,
    ).toBe(false);
  });
});
