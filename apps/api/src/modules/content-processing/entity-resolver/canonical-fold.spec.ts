import { EntityType } from '@prisma/client';
import { canonicalFold, entityIdentityKey } from './entity-identity';

/**
 * The canonical fold's job is to give two names that denote the same thing the
 * SAME key, so the advisory lock and the unique index can see a twin. Every
 * case here is a twin the PREVIOUS hand-maintained accent-map fold got WRONG
 * (proven live in the i18n red team) and the Unicode-decomposition primitive
 * gets right. This file IS the red team, frozen as a standing guard — an
 * always-green identity test is a lie, so each block asserts a real collapse
 * the old implementation could not make.
 */
describe('canonicalFold — twin classes the hand list could not fold', () => {
  const foldsSame = (a: string, b: string) =>
    expect(canonicalFold(a)).toBe(canonicalFold(b));

  it('collapses DECOMPOSED (NFD) input to the same key as PRECOMPOSED (NFC)', () => {
    // iOS pasteboards and the macOS filesystem deliver NFD; the old accent map
    // only matched precomposed single codepoints, so the same visible name
    // typed two ways minted two identities.
    for (const name of [
      'jalapeño',
      'Málaga',
      'piñata',
      'crème brûlée',
      'Phở',
    ]) {
      foldsSame(name.normalize('NFC'), name.normalize('NFD'));
    }
  });

  it('folds accented letters that were never in the hand list', () => {
    foldsSame('nǐ hǎo', 'ni hao'); // pinyin carons ǐ/ǎ
    foldsSame('ď', 'd'); // Czech d-caron
    foldsSame('ǎ', 'a');
    foldsSame('Ǧ', 'g');
  });

  it('folds fullwidth and compatibility forms (NFKD)', () => {
    foldsSame('ｒａｍｅｎ', 'ramen'); // fullwidth Latin
    foldsSame('Ⅷ', 'viii'); // roman numeral
  });

  it('folds the non-decomposable Latin letters consistently', () => {
    foldsSame('straße', 'strasse'); // ß → ss
    foldsSame('smørrebrød', 'smorrebrod'); // ø → o
    foldsSame('piña æble', 'pina aeble'); // æ → ae
  });

  it('folds the Turkish dotted-İ to plain i (no stray combining dot)', () => {
    foldsSame('İstanbul', 'istanbul');
    expect(canonicalFold('İ')).toBe('i');
  });
});

describe('canonicalFold — collapses it must NOT make (over-folding guards)', () => {
  it('PRESERVES Japanese voicing marks — パ (pa) ≠ ハ (ha), ガ (ga) ≠ カ (ka)', () => {
    // The whole reason the fold names the diacritic blocks instead of \p{M}:
    // dakuten/handakuten are phonemic. A blanket combining-mark strip (or naive
    // NFKD + \p{M}) would merge these distinct restaurants.
    expect(canonicalFold('パ')).not.toBe(canonicalFold('ハ'));
    expect(canonicalFold('ガ')).not.toBe(canonicalFold('カ'));
    expect(canonicalFold('日系スーパー')).toBe(
      canonicalFold('日系スーパー'.normalize('NFD')),
    );
  });

  it('deletes format-control characters (they carry no word boundary)', () => {
    // ZWSP / ZWJ / soft hyphen injected mid-word must not split it into a twin.
    expect(canonicalFold('ta​co')).toBe(canonicalFold('taco'));
    expect(canonicalFold('ta‍co')).toBe(canonicalFold('taco'));
    expect(canonicalFold('ta­co')).toBe(canonicalFold('taco'));
  });

  it('PRESERVES non-Latin vowel signs instead of shredding them to spaces', () => {
    // Thai/Devanagari/Arabic marks are \p{M} and semantic — the separator step
    // must keep them attached, not turn them into word breaks.
    expect(canonicalFold('ผัดไทย')).toBe('ผัดไทย');
    expect(canonicalFold('पनीर')).toBe('पनीर');
    expect(canonicalFold('ผัดไทย'.normalize('NFD'))).toBe(
      canonicalFold('ผัดไทย'),
    );
  });

  it('keeps genuinely different scripts distinct', () => {
    expect(canonicalFold('Пельменная')).not.toBe(canonicalFold('pelmennaya'));
    expect(canonicalFold('食べ放題')).not.toBe(canonicalFold('tabehoudai'));
  });

  it('folds letterless names to the empty string (NULL identity)', () => {
    expect(canonicalFold('🍕')).toBe('');
    expect(canonicalFold('!!!')).toBe('');
  });
});

describe('entityIdentityKey — order/plural invariance still holds on the new fold', () => {
  it('word-order twins converge for foods', () => {
    expect(entityIdentityKey('pizza square', EntityType.food)).toBe(
      entityIdentityKey('square pizza', EntityType.food),
    );
  });

  it('restaurant word order is preserved (branding), so it does NOT sort', () => {
    expect(canonicalFold("Phil's")).toBe(canonicalFold('Phils'));
  });
});
