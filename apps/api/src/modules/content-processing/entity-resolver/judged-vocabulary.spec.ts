import { readFileSync } from 'fs';
import { join } from 'path';
import { stripComments } from '../../../shared/testing/code-only';
import {
  judgedVocabularyDouble,
  LEGACY_CUE_SEED,
} from '../../../shared/testing/judged-vocabulary-double';
import {
  CARRIES_CONCEPT,
  GRAMMATICAL_WORK,
  NEGATES,
  WORD_GENERICNESS_LANE,
  WORD_GENERICNESS_PROMPT,
  WORD_GENERICNESS_RULE_FINGERPRINT,
  WORD_GENERICNESS_RULE_VERSION,
  WORD_NEGATION_LANE,
  WORD_NEGATION_PROMPT,
  WORD_NEGATION_RULE_FINGERPRINT,
  WORD_NEGATION_RULE_VERSION,
  normalizeClaimLocale,
  wordGenericnessLane,
  wordNegationLane,
} from './word-vocabulary-lanes';
import {
  DrainExceedsStandingCapError,
  hearingMeterFor,
} from './claim-rehearing-budget.service';
import { VOCABULARY_CLAIMS_PER_CALL } from './word-vocabulary-judge.service';

/**
 * THE JUDGED VOCABULARY, AND THE TWO HAND LISTS IT REPLACED.
 *
 * Every parity claim the cutover rests on is a case here, stated as the
 * BEHAVIOUR a user would notice rather than as an internal shape — because the
 * lists being retired were correct at the level of "the function returned the
 * right array" for months while being wrong about Spanish.
 */
describe('the claim unit: one word, one language, accents intact', () => {
  it('separates two Vietnamese words that differ only by a tone mark', () => {
    // THE WHOLE REASON THE NEGATION LIST COULD NOT GROW. On the recall fold
    // these are one string, and no single verdict is right for both: `chua`
    // is sourness a searcher wants, `chưa` is "not yet". A key that cannot
    // tell them apart cannot hold the answer to either.
    expect(
      wordNegationLane.canonicalClaimKey({ word: 'chưa', locale: 'vi' }),
    ).not.toBe(
      wordNegationLane.canonicalClaimKey({ word: 'chua', locale: 'vi' }),
    );
    expect(
      wordGenericnessLane.canonicalClaimKey({ word: 'ít', locale: 'vi' }),
    ).not.toBe(
      wordGenericnessLane.canonicalClaimKey({ word: 'it', locale: 'vi' }),
    );
  });

  it('folds case and punctuation — two spellings of one word are one claim', () => {
    expect(
      wordNegationLane.canonicalClaimKey({ word: 'Sin', locale: 'es' }),
    ).toBe(wordNegationLane.canonicalClaimKey({ word: 'sin', locale: 'es' }));
  });

  it('keeps the language in the key — `no` in English is a different question from `no` in Spanish', () => {
    expect(
      wordNegationLane.canonicalClaimKey({ word: 'no', locale: 'en' }),
    ).not.toBe(
      wordNegationLane.canonicalClaimKey({ word: 'no', locale: 'es' }),
    );
  });

  it('collapses a region to its language, and an absent tag to `und`', () => {
    expect(normalizeClaimLocale('es-MX')).toBe('es');
    expect(normalizeClaimLocale(null)).toBe('und');
    expect(normalizeClaimLocale('  ')).toBe('und');
    // `und` is a locale with its own verdicts, NOT a silent alias for English.
    expect(
      wordGenericnessLane.canonicalClaimKey({ word: 'top', locale: 'und' }),
    ).not.toBe(
      wordGenericnessLane.canonicalClaimKey({ word: 'top', locale: 'en' }),
    );
  });

  it('never collides two different lanes onto one answer', () => {
    expect(wordGenericnessLane.lane).not.toBe(wordNegationLane.lane);
  });
});

describe('the rule is versioned by its own text', () => {
  it('pins each prompt to the release its verdicts are stamped with', () => {
    // If this fails, the .md was edited without a release entry — which would
    // stamp new verdicts with the OLD version and make them indistinguishable
    // from verdicts a different rule decided. The fix is a release entry, not
    // a new expectation here.
    expect(WORD_GENERICNESS_RULE_FINGERPRINT).toBe('29ffa69caef9');
    expect(WORD_NEGATION_RULE_FINGERPRINT).toBe('15a7de03c4f3');
    expect(WORD_GENERICNESS_RULE_VERSION).toBe(2);
    expect(WORD_NEGATION_RULE_VERSION).toBe(2);
  });

  it('states its question as a principle and pins gold cases, per prompt canon', () => {
    for (const prompt of [WORD_GENERICNESS_PROMPT, WORD_NEGATION_PROMPT]) {
      expect(prompt).toMatch(/GOLD CASES/);
      // The owner's standing rule: a prompt argues from a principle; it does
      // not hand the model a list to memorise.
      expect(prompt).toMatch(/language is part of the question/i);
    }
    for (const [word, prompt] of [
      ['chưa', WORD_GENERICNESS_PROMPT],
      ['ít', WORD_GENERICNESS_PROMPT],
      ['birria', WORD_GENERICNESS_PROMPT],
      ['的', WORD_GENERICNESS_PROMPT],
      ['không', WORD_NEGATION_PROMPT],
      ['sin', WORD_NEGATION_PROMPT],
      ['不', WORD_NEGATION_PROMPT],
    ] as const) {
      expect(prompt).toContain(word);
    }
  });
});

describe('the meter and the batch size cannot disagree', () => {
  it('bills each lane to its own caller, at the size it actually batches', () => {
    // A lane metered against another lane's caller reads that lane's spend as
    // its own and prices itself off a rate no hearing of its own produced.
    for (const lane of [WORD_GENERICNESS_LANE, WORD_NEGATION_LANE]) {
      expect(hearingMeterFor(lane).claimsPerCall).toBe(
        VOCABULARY_CLAIMS_PER_CALL,
      );
    }
    expect(hearingMeterFor(WORD_GENERICNESS_LANE).caller).not.toBe(
      hearingMeterFor(WORD_NEGATION_LANE).caller,
    );
    expect(hearingMeterFor('word_claim').caller).toBe('aliases.claim_judge');
  });

  it('refuses to price a lane nobody declared a meter for', () => {
    expect(() => hearingMeterFor('word-politeness')).toThrow(
      /no entry in HEARING_METERS/,
    );
  });
});

describe('negation hygiene: what the dense embedder is allowed to read', () => {
  const vocab = judgedVocabularyDouble({ negators: LEGACY_CUE_SEED });

  it('withholds the Spanish negator — the sin-cerdo→vegan inversion stays fixed', () => {
    expect(vocab.strippedForEmbedding('sin cerdo', 'es')).toBe('cerdo');
  });

  it('withholds it for an en-US phone too — the fused locale is a soft prior', () => {
    // Cross-language on purpose: "ramen sin cerdo" typed on an English phone
    // fuses to en, and the old cue scan read EVERY pack for exactly this.
    expect(vocab.strippedForEmbedding('sin cerdo', 'en')).toBe('cerdo');
    expect(vocab.strippedForEmbedding('senza glutine', 'en')).toBe('glutine');
  });

  it('empties an all-negator run so the dense tier is skipped', () => {
    // "phở không thịt" grounds phở and thịt lexically, leaving the run
    // "không". Embedding a bare negator linked it as if it were a dish.
    expect(vocab.strippedForEmbedding('không', 'vi')).toBe('');
  });

  it('matches through accents — the folded compare that made vi hygiene a no-op', () => {
    expect(vocab.strippedForEmbedding('KHÔNG thịt', 'vi')).toBe('thịt');
  });

  it('strips a Mandarin negator out of an UNSPACED run — the case the cue list could not reach', () => {
    // The deleted cue-list comment said a zh pack "would either no-op or,
    // once someone fixed it, delete a whole run", because the strip split on
    // whitespace and 不要肉 has none. Segmenting is what makes it possible.
    const zh = judgedVocabularyDouble({ negators: [['不', 'zh']] });
    expect(zh.strippedForEmbedding('不要肉', 'zh')).toBe('要肉');
    expect(zh.strippedForEmbedding('珍珠奶茶', 'zh')).toBe('珍珠奶茶');
  });

  it('keeps a word nobody has heard, and queues it', () => {
    const fresh = judgedVocabularyDouble({ negators: LEGACY_CUE_SEED });
    expect(fresh.strippedForEmbedding('bulgogi', 'ko')).toBe('bulgogi');
    expect(fresh.pendingHearings().map((c) => c.word)).toContain('bulgogi');
  });

  it('does not queue a word it already has an answer for', () => {
    const fresh = judgedVocabularyDouble({ negators: [['sin', 'es']] });
    fresh.strippedForEmbedding('sin cerdo', 'es');
    expect(fresh.pendingHearings().map((c) => c.word)).not.toContain('sin');
  });
});

describe('verdicts never touch name matching ("No Name Burgers")', () => {
  const source = stripComments(
    readFileSync(
      join(__dirname, '../../search/search-query-interpretation.service.ts'),
      'utf8',
    ),
    'search-query-interpretation.service.ts',
  );

  it('feeds the stripped text to the dense tier and to nothing else', () => {
    // A negator inside a restaurant's NAME is a real word of that name. The
    // stripped string may reach the embedder and may gate the dense attempt;
    // if it ever reaches a lexical/gazetteer call, "No Name Burgers" starts
    // matching "Name Burgers" and a real restaurant becomes unfindable.
    const uses = [...source.matchAll(/denseCandidateText/g)];
    expect(uses.length).toBeGreaterThan(0);
    for (const line of source
      .split('\n')
      .filter((l) => l.includes('denseCandidateText'))) {
      expect(line).toMatch(
        /const denseCandidateText|denseCandidateText\.length > 0|const denseText = denseCandidateText/,
      );
    }
  });

  it('calls the judged vocabulary exactly once, on the dense path', () => {
    expect([...source.matchAll(/strippedForEmbedding/g)]).toHaveLength(1);
  });
});

describe('genericness: grammar comes out, content stays in', () => {
  it('drops Spanish function words from a demand candidate', () => {
    const vocab = judgedVocabularyDouble({
      grammatical: [
        ['de', 'es'],
        ['al', 'es'],
      ],
    });
    expect(
      vocab.stripGrammar('tacos al pastor', ['tacos', 'al', 'pastor'], 'es'),
    ).toEqual({ text: 'tacos pastor', isGenericOnly: false });
  });

  it('drops the Mandarin particle a demand signal must never carry', () => {
    // The zh wave item: 的 and a stranded 不 polluted demand signals because
    // no language pack existed for Mandarin at all.
    const vocab = judgedVocabularyDouble({
      grammatical: [
        ['的', 'zh'],
        ['不', 'zh'],
      ],
    });
    expect(vocab.stripGrammar('好吃的', ['好吃', '的'], 'zh').text).toBe(
      '好吃',
    );
    expect(vocab.stripGrammar('的', ['的'], 'zh')).toEqual({
      text: '',
      isGenericOnly: true,
    });
  });

  it('judges in the asked language and never in another one', () => {
    // `de` is Spanish glue and a legitimate word elsewhere; a verdict for one
    // language may not answer for another.
    const vocab = judgedVocabularyDouble({ grammatical: [['de', 'es']] });
    expect(vocab.stripGrammar('de kaas', ['de', 'kaas'], 'nl').text).toBe(
      'de kaas',
    );
  });

  it('keeps an unjudged word — an unstripped term is a worse query, a stripped one is a deleted ask', () => {
    const vocab = judgedVocabularyDouble();
    expect(vocab.stripGrammar('bún chả', ['bún', 'chả'], 'vi')).toEqual({
      text: 'bún chả',
      isGenericOnly: false,
    });
  });

  it('reads back the verdict in force for one word', () => {
    const vocab = judgedVocabularyDouble({
      grammatical: [['de', 'es']],
      negators: [['sin', 'es']],
    });
    expect(vocab.outcomeOf(WORD_GENERICNESS_LANE, 'de', 'es')).toBe(
      GRAMMATICAL_WORK,
    );
    expect(vocab.outcomeOf(WORD_NEGATION_LANE, 'sin', 'es')).toBe(NEGATES);
    expect(vocab.outcomeOf(WORD_GENERICNESS_LANE, 'birria', 'es')).toBeNull();
    expect(vocab.carriesConcept('birria', 'es')).toBe(false);
    expect(CARRIES_CONCEPT).not.toBe(GRAMMATICAL_WORK);
  });
});

describe('the write door hears before it writes', () => {
  it('asks the judge about every unheard token of the ask, in its own language', async () => {
    const vocab = judgedVocabularyDouble({ grammatical: [['de', 'es']] });
    const heard = (vocab as unknown as { heard: Array<{ words: string[] }> })
      .heard;
    await vocab.judgeThenStrip('tacos de birria', 'es-MX');
    // `de` already has a genericness verdict, so only the two unheard words
    // are bought on that lane — but the NEGATION lane has heard none of them.
    expect(heard.length).toBeGreaterThan(0);
    expect(heard[0].words.sort()).toEqual(['birria', 'tacos']);
  });

  it('reports an ask made entirely of grammar as no ask at all', async () => {
    const vocab = judgedVocabularyDouble({
      grammatical: [
        ['de', 'es'],
        ['al', 'es'],
      ],
    });
    await expect(vocab.judgeThenStrip('de al', 'es')).resolves.toEqual({
      text: '',
      isGenericOnly: true,
      heldUnjudged: false,
    });
  });

  it('HOLDS a term containing a word it has not heard, rather than recording a guess', async () => {
    // The demand-signal law: a durable record that steers future spend may
    // never be written about an unjudged word. The term is held, the word is
    // queued, and the next identical ask records normally.
    const vocab = judgedVocabularyDouble({ unjudged: ['feteer'] });
    const judged = await vocab.judgeThenStrip('feteer meshaltet', 'es');
    expect(judged.heldUnjudged).toBe(true);
    expect(vocab.holdsUnjudged('feteer meshaltet', 'es')).toBe(true);
    expect(vocab.holdsUnjudged('tacos al pastor', 'es')).toBe(false);
  });

  it('a deferred hearing is a backlog entry, never a thrown request', async () => {
    // The budget gate fires on an ordinary day once a large certification has
    // used the window. Letting it escape cost the caller its ENTIRE batch —
    // one unheard word lost a whole page of demand signals.
    const vocab = judgedVocabularyDouble();
    const judge = (vocab as unknown as { judge: { certify: unknown } }).judge;
    judge.certify = () => {
      throw new DrainExceedsStandingCapError(
        {
          lane: WORD_GENERICNESS_LANE,
          ruleVersion: WORD_GENERICNESS_RULE_VERSION,
          dueCount: 1,
          microUsdPerHearing: 96,
          estimateMicros: 96,
          estimateHash: 'deadbeef',
        },
        200,
        0,
      );
    };
    await expect(vocab.judgeThenStrip('bulgogi', 'ko')).resolves.toBeDefined();
    expect(vocab.pendingHearings().map((c) => c.word)).toContain('bulgogi');
  });
});
