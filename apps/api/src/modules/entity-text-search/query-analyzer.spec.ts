import {
  analyzeQuery,
  denseQueryInput,
  detectScript,
  NGRAM_MAX_PHRASE_WORDS_CEILING,
  type SurfaceLocaleEvidence,
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

  describe('the detector can name every language the server can serve', () => {
    // The candidate set is DERIVED from SUPPORTED_LOCALES. These are the
    // audit's exact failing cases, kept verbatim so a re-narrowing of the
    // candidate list cannot pass.
    it('does not answer with a language this server cannot serve', () => {
      // 'phils ice house' read as `fr` before the candidate set was derived
      // (F4: 15% of plain-English queries went non-English this way).
      const analysis = analyzeQuery('phils ice house', null);
      expect(analysis.detectedLocale?.tag).not.toBe('fr');
      expect(analysis.isNonEnglish).toBe(false);
    });

    it('pins Han to zh the way kana pins ja and hangul pins ko', () => {
      expect(analyzeQuery('麻辣牛肉面', null).detectedLocale).toEqual({
        tag: 'zh',
        confidence: 1,
        source: 'script',
      });
    });

    it('NEVER echoes a request prior a Han query contradicts', () => {
      // Measured before the fix: this returned {tag:'es-MX', source:
      // 'request-prior'} — the system asserting a Chinese noun phrase is
      // Mexican Spanish, then embedding it with an [es-MX] prefix.
      const analysis = analyzeQuery('麻辣牛肉面', 'es-MX');
      expect(analysis.detectedLocale?.tag).toBe('zh');
      expect(analysis.detectedLocale?.source).toBe('script');
    });

    it('refuses the prior echo for a non-Latin script it cannot pin', () => {
      // Every SUPPORTED_LOCALE is Latin-script, so Cyrillic text is not in
      // the requester's locale whatever the phone says. Null is the honest
      // answer; 'es-MX' was the previous one.
      expect(analyzeQuery('привет', 'es-MX').detectedLocale).toBeNull();
    });
  });

  describe('the registry-surface oracle is the short-string signal', () => {
    // A fake index standing in for SurfaceLocaleIndexService: folded form →
    // the per-language evidence the concept graph holds. Every entry is real
    // — the languages AND the entity counts are what the live corpus holds
    // for these words (measured 2026-08-11).
    const oracle = (folded: string): SurfaceLocaleEvidence[] =>
      ({
        'bun dau mam tom': [{ language: 'vi', entities: 2 }],
        'com tam': [{ language: 'vi', entities: 3 }],
        camarones: [{ language: 'es', entities: 2 }],
        // A word banked under BOTH launch languages — the ambiguous case.
        tostada: [
          { language: 'es', entities: 2 },
          { language: 'vi', entities: 1 },
        ],
        // ONE entity, one language: real evidence, but not enough to
        // contradict someone who stated what language they are searching in.
        // These three are the live corpus's own junk words (F3).
        cat: [{ language: 'vi', entities: 1 }],
        pan: [{ language: 'es', entities: 1 }],
        crema: [{ language: 'vi', entities: 1 }],
      })[folded] ?? [];

    it('names vi on the exact query the detector answers null for', () => {
      expect(analyzeQuery('bún đậu mắm tôm', null).detectedLocale).toBeNull();
      expect(
        analyzeQuery('bún đậu mắm tôm', null, { surfaceLocales: oracle })
          .detectedLocale,
      ).toEqual({ tag: 'vi', confidence: 1, source: 'surface' });
    });

    it('overrules a detector answer that is simply wrong', () => {
      // 'cơm tấm' detects `pt` unaided. The registry holds it as `vi`.
      expect(
        analyzeQuery('cơm tấm', null, { surfaceLocales: oracle })
          .detectedLocale,
      ).toEqual({ tag: 'vi', confidence: 1, source: 'surface' });
    });

    it('overrules a request prior — the words beat the phone setting', () => {
      expect(
        analyzeQuery('camarones', 'en-US', { surfaceLocales: oracle })
          .detectedLocale,
      ).toEqual({ tag: 'es', confidence: 1, source: 'surface' });
    });

    it('abstains when a word is banked under two languages', () => {
      // Ambiguity is honest silence, not a coin flip: the prior gets its
      // normal turn instead of the oracle inventing a winner.
      const analysis = analyzeQuery('tostada', 'en-US', {
        surfaceLocales: oracle,
      });
      expect(analysis.detectedLocale?.source).not.toBe('surface');
    });

    it('is inert for callers that pass no oracle', () => {
      expect(analyzeQuery('camarones', null).detectedLocale).toBeNull();
    });

    // ── A0 red team F3: one row is one opinion ──────────────────────────
    it('lets a LONE entity name the language when nobody stated one', () => {
      // With no prior there is nothing better than one writer's answer, and
      // the honest alternative (null) is strictly worse information.
      expect(
        analyzeQuery('pan', null, { surfaceLocales: oracle }).detectedLocale,
      ).toEqual({ tag: 'es', confidence: 1, source: 'surface' });
    });

    it('does NOT let a lone entity overrule a STATED request prior', () => {
      // Measured before this rule: 'cat' -> vi@1.00, 'pan' -> es@1.00,
      // 'crema' -> vi@1.00, each from ONE generator row, each against an
      // explicit en-US phone. All three are ordinary English words.
      for (const word of ['cat', 'pan', 'crema']) {
        const detected = analyzeQuery(word, 'en-US', {
          surfaceLocales: oracle,
        }).detectedLocale;
        expect(detected?.source).not.toBe('surface');
        expect(detected?.tag).toBe('en-US');
      }
    });

    it('DOES overrule a stated prior when more than one entity says so', () => {
      // The leg that must not move: this is the whole reason the oracle
      // exists (a Spanish word typed on an English phone is still Spanish).
      expect(
        analyzeQuery('camarones', 'en-US', { surfaceLocales: oracle })
          .detectedLocale,
      ).toEqual({ tag: 'es', confidence: 1, source: 'surface' });
    });

    it('refuses a hit the fold only reached by deleting an emoji', () => {
      // canonicalFold('pan 🌮') === 'pan', so the index answers — but the
      // user did not type the banked word, and an EXACT lookup is the whole
      // basis of the oracle's authority.
      const decorated = analyzeQuery('pan 🌮', null, {
        surfaceLocales: oracle,
      }).detectedLocale;
      expect(decorated?.source).not.toBe('surface');
      // Punctuation is SPELLING, not content, and still folds through.
      expect(
        analyzeQuery('pan.', null, { surfaceLocales: oracle }).detectedLocale
          ?.source,
      ).toBe('surface');
    });
  });

  // ── A0 red team F9/F13: the script gate binds the detector too ─────────
  describe('the detector may not answer for a script it cannot name', () => {
    it('returns null for Cyrillic even when the model is decisive', () => {
      // Measured: tinyld ranks 'тако tacos' es@0.11 with en/es/vi as the
      // candidate set. The script gate blocked the request-prior echo and
      // the verdict fell through to the bare decisive arm anyway.
      expect(analyzeQuery('тако tacos', 'es-MX').detectedLocale).toBeNull();
      expect(analyzeQuery('тако tacos', null).detectedLocale).toBeNull();
    });

    it('still pins the scripts that DO name a language', () => {
      expect(analyzeQuery('麻辣牛肉面', 'es-MX').detectedLocale).toEqual({
        tag: 'zh',
        confidence: 1,
        source: 'script',
      });
    });

    it('leaves Latin-script detection exactly as it was', () => {
      expect(analyzeQuery('tacos with cheese', null).detectedLocale?.tag).toBe(
        'en',
      );
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
