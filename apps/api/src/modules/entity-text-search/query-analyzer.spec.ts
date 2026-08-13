import {
  analyzeQuery,
  denseQueryInput,
  detectorModelGaps,
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

    it('reaches a possessive name by its own name (N1)', () => {
      // Before N1 the tokenizer split "Harry’s" into "harry" + "s" AND
      // re-joined them with a space, so the restaurant could never be reached
      // by its own name. N1 fixed that by welding the apostrophe into the
      // token class; the F4/F5 gap classifier fixed it properly, by asking
      // `foldDeletesEntirely` — so the tokens DO split again and re-join with
      // nothing, which is what the fold does to the string. The property N1
      // protects is this assertion, not the token count.
      expect(
        analyzeQuery('Harry’s bagels', null)
          .ngrams(3)
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

    it('treats a typed space between Han characters as a SOFT separator', () => {
      // THE DEFECT (Mandarin battery, 2026-08-12): 珍珠奶茶 ground boba tea and
      // 珍珠 奶茶 ground only milk tea, because the re-join reproduced the
      // user's space inside the folded key and no stored surface has one.
      // Chinese is written unspaced, so that space is the typist or the IME,
      // never the language.
      const unspaced = analyzeQuery('珍珠奶茶', null);
      const spaced = analyzeQuery('珍珠 奶茶', null);
      // The run's own first token keeps ' ' (it joins to whatever precedes
      // the query); the space between 珠 and 奶 is absorbed.
      expect(spaced.tokens.map((t) => t.separator)).toEqual([' ', '', '', '']);
      const folds = (a: ReturnType<typeof analyzeQuery>) =>
        a.ngrams(4).map((n) => n.folded);
      expect(folds(spaced)).toEqual(folds(unspaced));
      expect(folds(spaced)).toContain('珍珠奶茶');
      // Offsets still slice the RAW string, space and all.
      for (const ngram of spaced.ngrams(4)) {
        expect(spaced.raw.slice(ngram.start, ngram.end)).toBe(ngram.raw);
      }
    });

    it('keeps a real word boundary hard — Latin neighbours and punctuation', () => {
      // 'pho 牛肉': Latin IS spaced by convention, so joining across that
      // space would fabricate a compound nobody typed.
      expect(
        analyzeQuery('pho 牛肉', null).tokens.map((t) => t.separator),
      ).toEqual([' ', ' ', '']);
      // Punctuation is a deliberate mark even between Han characters.
      expect(
        analyzeQuery('牛肉、面', null)
          .ngrams(4)
          .map((n) => n.folded),
      ).not.toContain('牛肉面');
    });

    it('classifies every gap by ONE rule — invisible, whitespace, visible (F4/F5)', () => {
      // THE DEFECT PAIR this pins, both directions, both executed:
      //   珍珠<ZWSP>奶茶 LOST the compound — a ZWSP is \p{Cf}, not \s, so the
      //     whitespace rule never saw it, even though the fold DELETES it.
      //   珍珠-奶茶 KEPT the compound — for no reason but that '-' happened to
      //     be welded into the old tokenizer's character class, so the run
      //     never split at all. A mark the typist chose read as nothing.
      // The ideographic comma answered correctly and identically to neither.
      const folds = (q: string) =>
        analyzeQuery(q, null)
          .ngrams(4)
          .map((n) => n.folded);

      // INVISIBLE ⇒ nothing between them, exactly as the fold will have it.
      expect(folds('珍珠​奶茶')).toContain('珍珠奶茶');
      expect(canonicalFold('珍珠​奶茶')).toBe('珍珠奶茶');
      // WHITESPACE between morphemic CJK ⇒ nothing (the one exception).
      expect(folds('珍珠 奶茶')).toContain('珍珠奶茶');
      // VISIBLE punctuation ⇒ hard, and the hyphen and the ideographic comma
      // now answer the SAME way, which is the whole point of one classifier.
      expect(folds('珍珠-奶茶')).not.toContain('珍珠奶茶');
      expect(folds('珍珠、奶茶')).not.toContain('珍珠奶茶');
      expect(folds('珍珠「」奶茶')).not.toContain('珍珠奶茶');
    });

    it('re-joins an apostrophe gap with nothing, from the fold’s own rule', () => {
      // "Harry's" used to survive because the apostrophe was inside the token
      // class; it survives now because `foldDeletesEntirely` says the fold
      // deletes it — the same statement, made once, in entity-identity.
      for (const q of ["Harry's", 'Harry’s']) {
        const analysis = analyzeQuery(q, null);
        expect(analysis.tokens.map((t) => t.separator)).toEqual([' ', '']);
        expect(analysis.ngrams(2).map((n) => n.folded)).toContain('harrys');
      }
    });

    it('keeps every n-gram fold equal to canonicalFold of its own raw slice', () => {
      // The invariant the classifier restores BY CONSTRUCTION: both sides now
      // ask the same function about the same characters. The documented
      // exception is whitespace inside a morphemic CJK run, which is why the
      // spaced boba case is not in this list.
      for (const q of [
        "Harry's",
        'tex-mex',
        'st. marks',
        'banh mi & pho',
        '珍珠​奶茶',
        '麻辣3号',
        '豚骨ラーメン',
        'phở bò',
      ]) {
        for (const ngram of analyzeQuery(q, null).ngrams(6)) {
          expect(ngram.folded).toBe(canonicalFold(ngram.raw));
        }
      }
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

    // THE MODEL MUST HAVE A PROFILE FOR EVERY LANGUAGE IT MAY NAME.
    // `tinyld/light` had 24 profiles and no `vie`; restricting it to
    // ['en','es','vi'] did not make it abstain on Vietnamese, it handed the
    // mass to the nearest profile it did have. Each of these came back
    // `es` at accuracy 1.00 — high enough to OVERRULE an explicit vi prior.
    it.each([
      'quán ramen gần đây',
      'quán có wifi',
      'tìm quán korean bbq',
      'quán coffee yên tĩnh',
      'quán sushi giá rẻ',
      'quán pho ngon',
    ])('never reads the Vietnamese sentence %p as Spanish', (query) => {
      expect(analyzeQuery(query, 'vi').detectedLocale?.tag).toBe('vi');
      expect(analyzeQuery(query, null).detectedLocale?.tag).toBe('vi');
      expect(analyzeQuery(query, 'es-MX').detectedLocale?.tag).toBe('vi');
    });

    // 'quán có wifi' and 'tìm quán korean bbq' carry ONLY acute accents, so
    // no Vietnamese-specific-code-point pin can reach them; the two below
    // carry the marks (đ, dot-below) a pin could see. Both classes are fixed
    // by the same thing — a model with a vi profile.
    it.each(['phở bò', 'bún đậu mắm tôm', 'cơm tấm', 'bánh mì'])(
      'names the Vietnamese dish %p vi with no registry help',
      (query) => {
        expect(analyzeQuery(query, null).detectedLocale?.tag).toBe('vi');
      },
    );

    it('keeps Spanish diacritics Spanish (the pin candidate did not)', () => {
      // The rejected fix — pin vi on any Latin diacritic — read every one of
      // these as Vietnamese. es gold disagreements went 2 -> 17.
      for (const query of [
        'café',
        'sandía',
        'camarón',
        'romántico',
        'cocina mediterránea',
        'sushi japonés',
        'café con terraza',
      ]) {
        expect(analyzeQuery(query, 'es-MX').detectedLocale?.tag).not.toBe('vi');
        expect(analyzeQuery(query, null).detectedLocale?.tag).not.toBe('vi');
      }
    });

    it('has a model profile for every supported locale', () => {
      // Derived from SUPPORTED_LOCALES, so a fourth launch language cannot
      // ship into the hole `vi` shipped into. Mutation: asking for a locale
      // the model has no profile for names it.
      expect(detectorModelGaps()).toEqual([]);
      expect(detectorModelGaps(['en', 'es', 'vi', 'haw'])).toEqual(['haw']);
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

    it('names vi on a query, and outranks the detector when they agree', () => {
      // RE-FOUNDED 2026-08-12: this used to assert the detector answers NULL
      // here, which was true only because `tinyld/light` had no Vietnamese
      // profile. With a model that does, the detector names vi unaided — the
      // oracle's job on this query is now to be the STRONGER source, not the
      // only one. The oracle's must-have property (naming a language nothing
      // else can) is pinned on 'camarones' and 'pan' below, which stay
      // undecidable to any detector.
      expect(analyzeQuery('bún đậu mắm tôm', null).detectedLocale?.tag).toBe(
        'vi',
      );
      expect(
        analyzeQuery('bún đậu mắm tôm', null, { surfaceLocales: oracle })
          .detectedLocale,
      ).toEqual({ tag: 'vi', confidence: 1, source: 'surface' });
    });

    it('overrules a detector answer that is simply wrong', () => {
      // 'cơm tấm' detected `pt` under the pre-derivation candidate list and
      // `es` under the profile-less light model. The registry holds it `vi`,
      // and outranks whatever the model of the day says.
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

    it('refuses a hit the fold only reached by deleting an INVISIBLE (A0 R7)', () => {
      // The dangerous half of the same defect: the fold DELETES format
      // controls outright, so each of these folds to exactly 'pan' — a
      // confidence-1.0 language claim for a string that is not the banked
      // word, with nothing on screen to explain it. Pasteboards and LLM
      // extraction inject these, and a crafted query can aim one at any
      // banked word.
      const invisibles: Array<[string, string]> = [
        ['zero-width space', '\u200B'],
        ['zero-width joiner', '\u200D'],
        ['zero-width non-joiner', '\u200C'],
        ['byte order mark', '\uFEFF'],
        ['soft hyphen', '\u00AD'],
        ['arabic letter mark', '\u061C'],
        ['left-to-right override', '\u202D'],
        ['private use', '\uE000'],
        ['control (NUL)', '\u0000'],
      ];
      for (const [label, ch] of invisibles) {
        const middle = analyzeQuery(`pa${ch}n`, null, {
          surfaceLocales: oracle,
        }).detectedLocale;
        const trailing = analyzeQuery(`pan${ch}`, null, {
          surfaceLocales: oracle,
        }).detectedLocale;
        expect([label, middle?.source]).not.toEqual([label, 'surface']);
        expect([label, trailing?.source]).not.toEqual([label, 'surface']);
      }
    });

    it('...but NBSP and fullwidth stay admitted, because they are spelling', () => {
      // NBSP is whitespace: the fold collapses it to a space exactly as it
      // collapses a plain one, so the folded key is what a normal space
      // would have produced. Fullwidth forms are LETTERS that NFKD maps to
      // their plain letter by design — refusing them would refuse a whole
      // legitimate input method.
      expect(
        analyzeQuery('camarones\u00A0fritos', null, { surfaceLocales: oracle })
          .detectedLocale?.source,
      ).toBe(
        analyzeQuery('camarones fritos', null, { surfaceLocales: oracle })
          .detectedLocale?.source,
      );
      expect(
        analyzeQuery('ｃａｍａｒｏｎｅｓ', null, { surfaceLocales: oracle })
          .detectedLocale,
      ).toEqual({ tag: 'es', confidence: 1, source: 'surface' });
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
