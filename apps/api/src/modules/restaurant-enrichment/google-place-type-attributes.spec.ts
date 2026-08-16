import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GOOGLE_BOOLEAN_ATTRIBUTE_VOCAB,
  GOOGLE_PLACE_TYPE_ATTRIBUTE_MAP,
  GOOGLE_PLACE_TYPE_IGNORED_TYPES,
  RESTAURANT_ATTRIBUTE_ALIASES_BY_NAME,
  RESTAURANT_ATTRIBUTE_VOCAB,
} from './google-place-type-attributes';

/**
 * F363. This file DECLARES itself the single source of truth for the
 * code-owned attribute vocabulary, and it was one of two: the 20 Google
 * boolean attributes were declared a second time inside
 * restaurant-location-enrichment.service.ts with their own alias arrays, and
 * 7 of the 20 had already drifted — the service copy had lost the bare
 * single-word aliases (`dogs`, `pets`, `children`, `groups`, `sports`,
 * `outdoor`, `outside`, `vegetarian restaurant`), so which alias set an
 * attribute entity ended up with depended on which code path minted it.
 */
describe('the attribute vocabulary has ONE home', () => {
  it('every Google boolean attribute is an entry of the one vocabulary', () => {
    for (const entry of GOOGLE_BOOLEAN_ATTRIBUTE_VOCAB) {
      expect(RESTAURANT_ATTRIBUTE_VOCAB).toContain(entry);
      expect(
        RESTAURANT_ATTRIBUTE_ALIASES_BY_NAME.get(entry.canonicalName),
      ).toBe(entry.aliases);
    }
    // The 20 booleans Google reports on a place details response.
    expect(GOOGLE_BOOLEAN_ATTRIBUTE_VOCAB).toHaveLength(20);
  });

  it('the merge kept the UNION of both alias lists — no bare alias was lost', () => {
    const aliasesOf = (name: string) =>
      RESTAURANT_ATTRIBUTE_ALIASES_BY_NAME.get(name) ?? [];
    // The eight the service copy had dropped…
    expect(aliasesOf('allows dogs')).toEqual(
      expect.arrayContaining(['dogs', 'pets']),
    );
    expect(aliasesOf('good for children')).toContain('children');
    expect(aliasesOf('good for groups')).toContain('groups');
    expect(aliasesOf('good for watching sports')).toContain('sports');
    expect(aliasesOf('outdoor seating')).toEqual(
      expect.arrayContaining(['outdoor', 'outside']),
    );
    expect(aliasesOf('serves vegetarian food')).toContain(
      'vegetarian restaurant',
    );
    // …and the two only the SERVICE copy had. The union REFUSED to import
    // them onto 'serves coffee': 'cafe' is a canonical attribute of its own
    // in this table (Google's `cafe` place type), and an alias may never
    // outrank a canonical name. The accented spelling joins the canonical it
    // actually spells. This collision is what the drift was hiding.
    expect(aliasesOf('serves coffee')).not.toContain('cafe');
    expect(aliasesOf('cafe')).toEqual(expect.arrayContaining(['cafe', 'café']));
  });

  it('no canonical name is declared twice, and no alias is shared by two attributes', () => {
    const names = RESTAURANT_ATTRIBUTE_VOCAB.map((e) => e.canonicalName);
    expect(new Set(names).size).toBe(names.length);
    const owner = new Map<string, string>();
    for (const entry of RESTAURANT_ATTRIBUTE_VOCAB) {
      for (const alias of entry.aliases) {
        const previous = owner.get(alias);
        expect(previous ?? entry.canonicalName).toBe(entry.canonicalName);
        owner.set(alias, entry.canonicalName);
      }
    }
  });

  it('every mapped place type resolves to a vocabulary entry, and no type is both kind and noise (R11)', () => {
    const canonicals = new Set(
      RESTAURANT_ATTRIBUTE_VOCAB.map((e) => e.canonicalName),
    );
    for (const [type, canonical] of Object.entries(
      GOOGLE_PLACE_TYPE_ATTRIBUTE_MAP,
    )) {
      expect({ type, known: canonicals.has(canonical) }).toEqual({
        type,
        known: true,
      });
      expect(GOOGLE_PLACE_TYPE_IGNORED_TYPES.has(type)).toBe(false);
    }
    // R12: the trust-Google star of the audit — `restaurant` is a mapped
    // venue kind, and the owner-ruled ignores stay ignored.
    expect(GOOGLE_PLACE_TYPE_ATTRIBUTE_MAP['restaurant']).toBe('restaurant');
    for (const noise of ['establishment', 'point_of_interest', 'store']) {
      expect(GOOGLE_PLACE_TYPE_IGNORED_TYPES.has(noise)).toBe(true);
      expect(GOOGLE_PLACE_TYPE_ATTRIBUTE_MAP[noise]).toBeUndefined();
    }
  });

  it('the deleted second table does not come back', () => {
    const service = readFileSync(
      join(__dirname, 'restaurant-location-enrichment.service.ts'),
      'utf8',
    );
    expect(service).not.toContain('GOOGLE_RESTAURANT_ATTRIBUTE_DEFINITIONS');
  });
});
