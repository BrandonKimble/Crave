/**
 * Unit laws for the two D5 venue-cuisine evidence lanes (pure parts).
 * The DB-level laws — projection outvoting incl. the Texas French Bread
 * homograph, lane idempotency, recombination — are proven against
 * Postgres in venue-cuisine-lanes.integration.spec.ts.
 */
import {
  buildCuisineNamePattern,
  escapeCuisineRegex,
  isFoodVenueTypeList,
  selectDishSetCuisines,
  DISH_SET_MIN_SUPPORT,
} from './venue-cuisine-evidence.service';
import {
  GOOGLE_PLACE_NON_CUISINE_TYPE_MAP,
  PRODUCT_VENUE_KIND_ATTRIBUTE_NAMES,
} from './google-place-type-attributes';

describe('escapeCuisineRegex', () => {
  it('escapes regex metacharacters so a vocab name can never break the pattern', () => {
    expect(escapeCuisineRegex('tex-mex')).toBe('tex-mex');
    expect(escapeCuisineRegex('a.b(c)')).toBe('a\\.b\\(c\\)');
  });
});

describe('buildCuisineNamePattern (the measured word-boundary matcher)', () => {
  const matches = (name: string, cuisine: string): boolean =>
    new RegExp(
      buildCuisineNamePattern(cuisine)
        .replace(/\\m/g, '\\b')
        .replace(/\\M/g, '\\b'),
    ).test(name.toLowerCase());

  it('matches a cuisine word at a word boundary', () => {
    expect(matches('Chaba Thai', 'thai')).toBe(true);
    expect(matches('Texas French Bread', 'french')).toBe(true);
    expect(matches('DAM-A Korean Hot Pot', 'korean')).toBe(true);
  });

  it('does not match inside another word', () => {
    expect(matches('Thaindependence Cafe', 'thai')).toBe(false);
    expect(matches('Frenchie', 'french')).toBe(false);
  });

  it('matches multi-word cuisine names', () => {
    expect(matches('KPOT Korean BBQ & Hot Pot', 'korean bbq')).toBe(true);
  });
});

describe('isFoodVenueTypeList (the museum gate)', () => {
  it('an ungrounded place (no types) may still claim through its name', () => {
    expect(isFoodVenueTypeList([])).toBe(true);
  });

  it('a grounded food venue passes', () => {
    expect(isFoodVenueTypeList(['bakery', 'point_of_interest'])).toBe(true);
    expect(isFoodVenueTypeList(['restaurant'])).toBe(true);
  });

  it('a grounded non-food venue makes no kitchen claim', () => {
    // the measured trap: "National Museum of African American History and
    // Culture" is an active place whose name matches two cuisine words.
    expect(
      isFoodVenueTypeList([
        'tourist_attraction',
        'history_museum',
        'museum',
        'point_of_interest',
        'establishment',
      ]),
    ).toBe(false);
  });
});

describe('selectDishSetCuisines (majority-of-attributed threshold)', () => {
  it('claims the majority cuisine with enough support', () => {
    const counts = new Map([
      ['thai', 3],
      ['mexican', 1],
    ]);
    expect(selectDishSetCuisines(counts, 4)).toEqual([
      { cuisineId: 'thai', support: 3 },
    ]);
  });

  it('an exact half is NOT a majority', () => {
    const counts = new Map([['thai', 2]]);
    expect(selectDishSetCuisines(counts, 4)).toEqual([]);
  });

  it('a single supporting dish never speaks for the venue', () => {
    expect(DISH_SET_MIN_SUPPORT).toBeGreaterThanOrEqual(2);
    const counts = new Map([['mexican', 1]]);
    expect(selectDishSetCuisines(counts, 1)).toEqual([]);
  });

  it('empty knowledge claims nothing', () => {
    expect(selectDishSetCuisines(new Map(), 0)).toEqual([]);
  });
});

describe('PRODUCT_VENUE_KIND_ATTRIBUTE_NAMES', () => {
  const canonicalKindNames = new Set(
    Object.values(GOOGLE_PLACE_NON_CUISINE_TYPE_MAP),
  );

  it('every entry is a real venue-kind attribute name from the one authority', () => {
    for (const name of PRODUCT_VENUE_KIND_ATTRIBUTE_NAMES) {
      expect(canonicalKindNames.has(name)).toBe(true);
    }
  });

  it('meal-service kinds stay out (the honest-name side of the vote)', () => {
    const products = new Set(PRODUCT_VENUE_KIND_ATTRIBUTE_NAMES);
    for (const honest of [
      'restaurant',
      'barbecue',
      'bistro',
      'diner',
      'cafe',
    ]) {
      expect(products.has(honest)).toBe(false);
    }
  });

  it('the measured homograph venues are all covered', () => {
    const products = new Set(PRODUCT_VENUE_KIND_ATTRIBUTE_NAMES);
    // Texas French Bread / Great American Cookies -> bakery;
    // Go Greek Yogurt / Culture Yogurt -> dessert shop, confectionery;
    // Jeremiah's Italian Ice -> ice cream shop; All American Bagel -> bagel shop.
    for (const kind of [
      'bakery',
      'dessert shop',
      'confectionery',
      'ice cream shop',
      'bagel shop',
    ]) {
      expect(products.has(kind)).toBe(true);
    }
  });
});
