import {
  analyzeQuery,
  denseQueryInput,
  detectScript,
  negatedSpan,
} from './query-analyzer';

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

    it('negates only the span IMMEDIATELY after the cue', () => {
      const analysis = analyzeQuery('tacos without cheese', null);
      const tacos = { start: 0, end: 5 };
      const cheese = { start: 14, end: 20 };
      expect(negatedSpan(analysis, tacos)).toBeNull();
      expect(negatedSpan(analysis, cheese)?.cue).toBe('without');
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
