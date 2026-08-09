import {
  analyzeQuery,
  denseQueryInput,
  detectScript,
  NGRAM_MAX_PHRASE_WORDS_CEILING,
} from './query-analyzer';
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

    it('never puts a space inside an unspaced run — Han+Kana, Han+digit (F4)', () => {
      // A script change is NOT a word boundary: 豚骨ラーメン and 麻辣3号 are
      // each typed as one word, and the FULL-length n-gram has to equal the
      // stored identity_key (the spaceless fold of the surface) or the span
      // that actually names the dish/shop can never ground.
      for (const [query, expected] of [
        ['豚骨ラーメン', ['豚', '骨', 'ラ', 'ー', 'メ', 'ン']],
        ['ラーメン屋', ['ラ', 'ー', 'メ', 'ン', '屋']],
        ['麻辣3号', ['麻', '辣', '3', '号']],
      ] as const) {
        const analysis = analyzeQuery(query, null);
        expect(analysis.tokens.map((t) => t.raw)).toEqual(expected);
        expect(analysis.tokens.map((t) => t.separator)).toEqual([
          ' ',
          ...expected.slice(1).map(() => ''),
        ]);
        const ngrams = analysis.ngrams(NGRAM_MAX_PHRASE_WORDS_CEILING);
        const folded = ngrams.map((n) => n.folded);
        expect(folded.some((f) => f.includes(' '))).toBe(false);
        // The whole surface is offered, and every n-gram's folded text is
        // the fold of its OWN raw slice.
        expect(folded).toContain(canonicalFold(query));
        for (const ngram of ngrams) {
          expect(ngram.folded).toBe(canonicalFold(ngram.raw));
          expect(analysis.raw.slice(ngram.start, ngram.end)).toBe(ngram.raw);
        }
      }
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

/**
 * PHRASE LENGTH. The gazetteer is an EQUALITY probe against banked surfaces,
 * so an n-gram window shorter than the longest banked surface does not make
 * the query park — it SHREDS it. 'ẩm thực Địa Trung Hải' (five tokens, banked
 * whole on `mediterranean`) ground 'Địa'→plate and 'Trung'→egg instead, at
 * confidence 1.0. The window is data-derived now; the analyzer's job is to be
 * able to ASSEMBLE what the data asks for.
 */
describe('ngrams — phrase length reaches the longest banked surface', () => {
  const query = 'ẩm thực Địa Trung Hải';

  it('assembles the whole 5-token phrase when asked for 5', () => {
    const analysis = analyzeQuery(query, 'vi-VN');
    expect(analysis.ngrams(5).map((n) => n.folded)).toContain(
      'am thuc dia trung hai',
    );
  });

  it('could NOT assemble it at the old window of 4 (the defect, pinned)', () => {
    const analysis = analyzeQuery(query, 'vi-VN');
    expect(analysis.ngrams(4).map((n) => n.folded)).not.toContain(
      'am thuc dia trung hai',
    );
  });

  it('honours a window past the old hard-coded internal cap of 5', () => {
    const long = 'one two three four five six seven';
    expect(
      analyzeQuery(long, 'en')
        .ngrams(7)
        .map((n) => n.folded),
    ).toContain('one two three four five six seven');
  });

  it('clamps at the cost ceiling however much a caller asks for', () => {
    const tokens = Array.from({ length: 20 }, (_, i) => `w${i}`);
    const analysis = analyzeQuery(tokens.join(' '), 'en');
    const longest = Math.max(...analysis.ngrams(999).map((n) => n.tokenCount));
    expect(longest).toBe(NGRAM_MAX_PHRASE_WORDS_CEILING);
  });

  it('carries an accent-preserving key alongside the folded one', () => {
    const analysis = analyzeQuery('cơm chay', 'vi-VN');
    const bigram = analysis.ngrams(2).find((n) => n.tokenCount === 2)!;
    expect(bigram.folded).toBe('com chay');
    expect(bigram.diacritic).toBe('cơm chay');
  });
});
