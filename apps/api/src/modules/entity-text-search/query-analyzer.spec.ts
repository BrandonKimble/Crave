import { analyzeQuery, denseQueryInput, detectScript } from './query-analyzer';
import { canonicalFold } from '../content-processing/entity-resolver/entity-identity';

describe('query analyzer (A2 seam)', () => {
  describe('the span-offset contract', () => {
    it('folds tokens while preserving RAW offsets', () => {
      const analysis = analyzeQuery('Phở Hoài', null);
      expect(analysis.tokens.map((t) => t.folded)).toEqual(['pho', 'hoai']);
      const [first] = analysis.tokens;
      expect(analysis.raw.slice(first.start, first.end)).toBe('Phở');
    });

    it('n-grams map back to the raw slice they came from', () => {
      const analysis = analyzeQuery('Despaña bakery', null);
      const bigram = analysis.ngrams(2).find((n) => n.tokenCount === 2)!;
      expect(bigram.folded).toBe('despana bakery');
      expect(analysis.raw.slice(bigram.start, bigram.end)).toBe(
        'Despaña bakery',
      );
    });

    it('keeps the CURLY apostrophe inside one token (N1)', () => {
      // Before N1 the tokenizer split "Harry’s" into "harry" + "s", so the
      // restaurant could never be reached by its own name.
      expect(
        analyzeQuery('Harry’s bagels', null).tokens.map((t) => t.raw),
      ).toEqual(['Harry’s', 'bagels']);
      expect(
        analyzeQuery('Harry’s bagels', null)
          .ngrams(2)
          .map((n) => n.folded),
      ).toContain('harrys bagels');
    });

    it('folds the straight and curly forms to the SAME key', () => {
      expect(analyzeQuery("Harry's", null).tokens[0].folded).toBe(
        analyzeQuery('Harry’s', null).tokens[0].folded,
      );
    });
  });

  describe('script detection (hard gate, zero ML)', () => {
    it.each([
      ['tacos', 'latin'],
      ['тако', 'cyrillic'],
      ['章魚', 'cjk'],
      ['たこ', 'kana'],
      ['비빔밥', 'hangul'],
    ])('%s → %s', (text, script) => {
      expect(detectScript(text)).toBe(script);
    });

    it('flags non-Latin script on the analysis', () => {
      expect(analyzeQuery('тако', null).isNonLatinScript).toBe(true);
      expect(analyzeQuery('taco', null).isNonLatinScript).toBe(false);
    });
  });

  describe('unspaced CJK segmentation (M6)', () => {
    it('cuts an unspaced Han query into character sub-tokens', () => {
      const analysis = analyzeQuery('麻辣牛肉面', null);
      expect(analysis.tokens.map((t) => t.raw)).toEqual([
        '麻',
        '辣',
        '牛',
        '肉',
        '面',
      ]);
      // Every sub-token after the first of the run re-joins with NO space.
      expect(analysis.tokens.map((t) => t.separator)).toEqual([
        ' ',
        '',
        '',
        '',
        '',
      ]);
    });

    it('yields matchable multi-character n-grams (the RED that motivated this)', () => {
      const folded = analyzeQuery('麻辣牛肉面', null)
        .ngrams(4)
        .map((n) => n.folded);
      // Before segmentation this query produced ONE n-gram and nothing
      // could match a sub-concept.
      expect(folded.length).toBeGreaterThan(1);
      expect(folded).toContain('麻辣'); // bigram, the cjk_bigram baseline
      expect(folded).toContain('牛肉');
      expect(folded).toContain('牛肉面'); // the actual dish surface
      expect(folded.some((f) => f.includes(' '))).toBe(false);
    });

    it('keeps n-gram offsets pointing at the RAW slice', () => {
      const analysis = analyzeQuery('麻辣牛肉面', null);
      for (const ngram of analysis.ngrams(4)) {
        expect(analysis.raw.slice(ngram.start, ngram.end)).toBe(ngram.raw);
        expect(ngram.raw).toBe(ngram.folded);
      }
    });

    it('handles mixed Latin + Han, cutting only the Han run', () => {
      const analysis = analyzeQuery('spicy 牛肉面 austin', null);
      expect(analysis.tokens.map((t) => t.raw)).toEqual([
        'spicy',
        '牛',
        '肉',
        '面',
        'austin',
      ]);
      const folded = analysis.ngrams(4).map((n) => n.folded);
      expect(folded).toContain('牛肉面');
      // The Han run joins to its Latin neighbours as a WORD boundary.
      expect(folded).toContain('spicy 牛');
      expect(folded).toContain('面 austin');
    });

    it('splits a Han run from an adjacent Kana run at the script boundary', () => {
      const analysis = analyzeQuery('豚骨ラーメン', null);
      const folded = analysis.ngrams(4).map((n) => n.folded);
      expect(folded).toContain('豚骨');
      expect(folded).toContain('ラーメン');
      // The run boundary is a WORD boundary (spaced), the inside is not.
      // ー (formally Script=Common) stays glued to its katakana run.
      expect(folded).toContain('豚骨 ラー');
      expect(analysis.tokens.map((t) => t.separator)).toEqual([
        ' ',
        '',
        ' ',
        '',
        '',
        '',
      ]);
    });

    it('leaves HANGUL alone — Korean is space-delimited already', () => {
      const analysis = analyzeQuery('매운 한국 음식', null);
      expect(analysis.tokens.map((t) => t.raw)).toEqual([
        '매운',
        '한국',
        '음식',
      ]);
      expect(analysis.tokens.every((t) => t.separator === ' ')).toBe(true);
      expect(analysis.ngrams(3).map((n) => n.folded)).toContain('한국 음식');
    });

    it('leaves LATIN byte-identical to its prior output', () => {
      const analysis = analyzeQuery('breakfast taco', null);
      expect(analysis.tokens.map((t) => t.raw)).toEqual(['breakfast', 'taco']);
      expect(analysis.ngrams(4).map((n) => n.folded)).toEqual([
        'breakfast',
        'breakfast taco',
        'taco',
      ]);
      expect(
        analyzeQuery('Despaña bakery & cafe', null)
          .ngrams(3)
          .map((n) => n.folded),
      ).toEqual([
        'despana',
        'despana bakery',
        'despana bakery cafe',
        'bakery',
        'bakery cafe',
        'cafe',
      ]);
    });

    it('canonicalFold is the IDENTITY on CJK (no case, no diacritics)', () => {
      for (const text of ['麻辣牛肉面', '豚骨ラーメン', '牛肉', 'がぎ']) {
        expect(canonicalFold(text)).toBe(text);
      }
    });
  });

  describe('language detection is a SOFT prior (R5-2)', () => {
    it('lets the request locale win over a weak detector answer', () => {
      const analysis = analyzeQuery('ice house', 'en-US');
      expect(analysis.detectedLocale?.tag).toBe('en-US');
      expect(analysis.detectedLocale?.source).toBe('request-prior');
      expect(analysis.isNonEnglish).toBe(false);
    });

    it('pins the language from the script when the script pins it', () => {
      const analysis = analyzeQuery('비빔밥', 'en-US');
      expect(analysis.detectedLocale).toEqual({
        tag: 'ko',
        confidence: 1,
        source: 'script',
      });
    });

    it('answers null rather than guessing on an undecidable one-worder', () => {
      expect(analyzeQuery('pulpo', null).detectedLocale).toBeNull();
    });
  });

  describe('negation cues (R5-3 tier 1)', () => {
    it('finds cues from every installed pack, tagged by locale', () => {
      expect(
        analyzeQuery('ramen sin cerdo', null).negationCues.map((c) => [
          c.cue,
          c.locale,
        ]),
      ).toEqual([['sin', 'es']]);
      expect(
        analyzeQuery('pizza senza glutine', null).negationCues[0].locale,
      ).toBe('it');
    });
  });

  describe('the dense query input (R5-7)', () => {
    it('prefixes the FULL BCP 47 tag', () => {
      expect(denseQueryInput('pan', 'es-MX')).toBe('[es-MX] pan');
    });

    it('is a NO-OP without a locale — existing callers embed exactly as before', () => {
      expect(denseQueryInput('pan', null)).toBe('pan');
    });
  });
});
