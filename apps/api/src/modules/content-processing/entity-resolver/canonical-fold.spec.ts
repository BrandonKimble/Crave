import { EntityType } from '@prisma/client';
import {
  canonicalFold,
  diacriticFold,
  entityIdentityKey,
  isDisplayable,
  normalizeSurface,
} from './entity-identity';

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

describe('normalizeSurface — one display-preserving normal form for stored surfaces', () => {
  it('collapses NFD and NFC spellings of one surface to identical bytes', () => {
    expect(normalizeSurface('jalapeño'.normalize('NFD'))).toBe(
      normalizeSurface('jalapeño'.normalize('NFC')),
    );
  });
  it('deletes invisible format-controls but KEEPS case and accents', () => {
    expect(normalizeSurface('Ta\u200bco Crème')).toBe('Taco Crème');
  });
  it('trims and collapses whitespace', () => {
    expect(normalizeSurface('  taco   al   pastor ')).toBe('taco al pastor');
  });
});

describe('isDisplayable — the write-ingress "is this a real surface" authority', () => {
  it('accepts any script with a letter or digit', () => {
    for (const s of ['taco', 'ラーメン', 'पनीर', 'مطعم', '7up']) {
      expect(isDisplayable(s)).toBe(true);
    }
  });
  it('rejects blank / invisible surfaces JS trim and SQL btrim both miss', () => {
    for (const s of ['', '   ', '\u00a0', '\u2007', '\u200b', '!!!', '—']) {
      expect(isDisplayable(s)).toBe(false);
    }
  });
});

/**
 * THE ACCENT-PRESERVING TWIN. `diacriticFold` exists so the query path can ask
 * one question the folded key cannot answer: did the user's accents agree with
 * the stored spelling? Its contract is a DIFFERENCE, so the tests are all
 * about the difference.
 */
describe('diacriticFold — canonicalFold minus exactly the accent strip', () => {
  it('keeps accents that canonicalFold removes', () => {
    expect(diacriticFold('phở')).toBe('phở');
    expect(canonicalFold('phở')).toBe('pho');
  });

  it('separates the Vietnamese tone-distinct words the fold merges', () => {
    // Every pair here is one folded key and three different foods.
    expect(canonicalFold('bò')).toBe(canonicalFold('bơ'));
    expect(diacriticFold('bò')).not.toBe(diacriticFold('bơ'));
    expect(canonicalFold('cơm chay')).toBe(canonicalFold('cơm cháy'));
    expect(diacriticFold('cơm chay')).not.toBe(diacriticFold('cơm cháy'));
    expect(canonicalFold('mỹ')).toBe(canonicalFold('mỳ'));
    expect(diacriticFold('mỹ')).not.toBe(diacriticFold('mỳ'));
  });

  it('agrees with canonicalFold on everything that is NOT an accent', () => {
    // Case, apostrophes (straight and curly), punctuation, format controls,
    // NFD/NFC input and the non-decomposable table are all handled by the SAME
    // shared implementation — so the two keys are equal whenever the input
    // carries no accents. THIS is what makes `diacritic !== folded` a sound
    // test for "the user typed accents".
    for (const text of [
      'Phil’s Ice House',
      "Phil's ice house",
      'tex-mex',
      'ta​co',
      'Straße',
      '  BANH   MI  ',
      '牛肉面',
      'ผัดไทย',
    ]) {
      expect(diacriticFold(text)).toBe(canonicalFold(text));
    }
  });

  it('a LETTER is preserved; a SPELLING VARIANT is folded (A0 R3)', () => {
    // THE MEASURED DEFECT. Over the 55,737 banked surface forms the keyword
    // ledger draws from, the old table folded đ→d in BOTH folds, and exactly
    // four ledger keys merged genuinely different words. Three were the
    // Danish ø (smør/smor, TØRST/torst). The fourth was `Đầu` (head) and
    // `dầu` (oil) — one ledger row, last-writer-wins, so one dish's measured
    // harvest was recorded against the other. That is the bò/bơ defect this
    // fold exists to prevent, one store over.
    expect(canonicalFold('đầu')).toBe(canonicalFold('dầu'));
    expect(diacriticFold('đầu')).not.toBe(diacriticFold('dầu'));
    expect(diacriticFold('đá')).not.toBe(diacriticFold('da'));
    // Every letter whose ASCII lookalike is a DIFFERENT letter of its own
    // alphabet behaves the same way — nothing here knows what Vietnamese is.
    expect(diacriticFold('łaska')).not.toBe(diacriticFold('laska'));
    expect(diacriticFold('smør')).not.toBe(diacriticFold('smor'));
    expect(diacriticFold('kırmızı')).not.toBe(diacriticFold('kirmizi'));

    // ...while a true spelling variant of ONE word folds in BOTH directions:
    // Switzerland writes 'straße' as 'strasse', and 'œuf'/'oeuf' is one word.
    expect(diacriticFold('straße')).toBe(diacriticFold('strasse'));
    expect(diacriticFold('œuf')).toBe(diacriticFold('oeuf'));
    expect(diacriticFold('æble')).toBe(diacriticFold('aeble'));

    // The coarse identity key is UNMOVED — it folds every entry in both
    // tables exactly as before, which is why no stored identity_key migrates.
    for (const [a, b] of [
      ['đầu', 'dau'],
      ['łaska', 'laska'],
      ['smør', 'smor'],
      ['kırmızı', 'kirmizi'],
      ['straße', 'strasse'],
      ['œuf', 'oeuf'],
    ]) {
      expect(canonicalFold(a)).toBe(canonicalFold(b));
    }
  });

  it('is NFC/NFD-blind, like the fold it mirrors', () => {
    expect(diacriticFold('cà phê'.normalize('NFD'))).toBe(
      diacriticFold('cà phê'.normalize('NFC')),
    );
  });
});
