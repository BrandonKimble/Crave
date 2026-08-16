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
  WORD_ROLE_LANE,
  normalizeClaimLocale,
  wordGenericnessLane,
  wordNegationLane,
} from './word-vocabulary-lanes';
import {
  DrainExceedsStandingCapError,
  hearingMeterFor,
} from './claim-rehearing-budget.service';
import { JudgedVocabularyService } from './judged-vocabulary.service';
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

  it('keeps the language in the GENERICNESS key — `no` in English is a different question from `no` in Spanish', () => {
    // Whether a word does grammatical work is a fact ABOUT a language, and
    // this lane's consumer strips in the ask's own language, so it reads it.
    expect(
      wordGenericnessLane.canonicalClaimKey({ word: 'no', locale: 'en' }),
    ).not.toBe(
      wordGenericnessLane.canonicalClaimKey({ word: 'no', locale: 'es' }),
    );
  });

  it('DROPS the language from the NEGATION key — its only consumer is locale-blind by ruling (B-key)', () => {
    // A form ruled a negator in ANY language is withheld from the embedder in
    // EVERY language ("ramen sin cerdo" typed on an en-US phone). So a
    // per-locale hearing bought an answer nothing could ever read — 38% of
    // this lane's spend, measured, and 12,177 of 32,379 keys on re-keying.
    // Two lanes, two claim kinds, two key shapes: that is why they are two.
    expect(
      wordNegationLane.canonicalClaimKey({ word: 'no', locale: 'en' }),
    ).toBe(wordNegationLane.canonicalClaimKey({ word: 'no', locale: 'es' }));
    expect(
      wordNegationLane.canonicalClaimKey({ word: 'no', locale: 'es' }),
    ).toBe('und|no');
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
    expect(WORD_NEGATION_RULE_FINGERPRINT).toBe('85df3b80a180');
    expect(WORD_GENERICNESS_RULE_VERSION).toBe(2);
    expect(WORD_NEGATION_RULE_VERSION).toBe(3);
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
    expect(vocab.strippedForEmbedding('sin cerdo')).toBe('cerdo');
  });

  it('withholds it for an en-US phone too — the fused locale is a soft prior', () => {
    // Cross-language on purpose: "ramen sin cerdo" typed on an English phone
    // fuses to en, and the old cue scan read EVERY pack for exactly this.
    expect(vocab.strippedForEmbedding('sin cerdo')).toBe('cerdo');
    expect(vocab.strippedForEmbedding('senza glutine')).toBe('glutine');
  });

  it('empties an all-negator run so the dense tier is skipped', () => {
    // "phở không thịt" grounds phở and thịt lexically, leaving the run
    // "không". Embedding a bare negator linked it as if it were a dish.
    expect(vocab.strippedForEmbedding('không')).toBe('');
  });

  it('matches through accents — the folded compare that made vi hygiene a no-op', () => {
    expect(vocab.strippedForEmbedding('KHÔNG thịt')).toBe('thịt');
  });

  /**
   * THE HAN WITNESS TABLE (A4, 2026-08-15) — the strip unit is the SEGMENT the
   * analyzer produced, never the character inside it.
   *
   * The deleted cue-list comment predicted that a zh pack "would either no-op
   * or, once someone fixed it, delete a whole run". Segmenting per character
   * fixed the no-op and walked straight into the second half: a Han character
   * is usually a BOUND MORPHEME, so a single-character verdict applied inside
   * a run amputates real names and — worse — inverts sealed compounds. 无糖奶茶
   * losing its 无 is the English negation-v3 defect ("boneless wings" minus
   * "boneless") recurring in Chinese purely by construction, which is why it
   * is pinned here rather than described.
   *
   * Every row below is seeded with 不/无/子 RULED — the verdicts that exist in
   * the corpus today — so each case proves the SEGMENT rule and not a missing
   * verdict.
   */
  it('never lets a single-character verdict cut into a multi-character Han segment', () => {
    const zh = judgedVocabularyDouble({
      negators: [
        ['不', 'zh'],
        ['无', 'zh'],
        ['没', 'zh'],
        ['子', 'zh'],
      ],
    });
    for (const intact of [
      '包子', // steamed bun — became 包, "bag"
      '饺子', // dumpling — became 饺, not a word
      '狮子头', // lion's head meatball — became 狮头
      '椰子鸡', // coconut chicken — became 椰鸡
      '无锡排骨', // Wuxi spare ribs, a PLACE NAME beginning 无
      '无糖奶茶', // sugar-FREE milk tea — became 糖奶茶, SUGAR milk tea
      '不辣的面', // not-spicy noodles — became 辣的面, SPICY noodles
      '不要肉', // no meat — became 要肉, "want meat"
      '珍珠奶茶', // never had a stripped character; stays the control
    ]) {
      expect(zh.strippedForEmbedding(intact)).toBe(intact);
    }
  });

  it('applies a single-character verdict when the segment IS that character', () => {
    const zh = judgedVocabularyDouble({ negators: [['不', 'zh']] });
    // A one-character run is a one-character segment, so the verdict is about
    // exactly the thing it deletes. Nothing about A4 disarms that.
    expect(zh.strippedForEmbedding('不')).toBe('');
    // ...and a sealed compound gets its OWN hearing at the level where the
    // question has a true answer, which is what makes 无糖 answerable at all.
    const sealed = judgedVocabularyDouble({ negators: [['无糖', 'zh']] });
    expect(sealed.strippedForEmbedding('无糖')).toBe('');
    expect(sealed.negates('无糖')).toBe(true);
  });

  it('queues the SEGMENT it would have to judge, not its characters', () => {
    const zh = judgedVocabularyDouble();
    zh.strippedForEmbedding('无糖奶茶');
    const queued = zh.pendingHearings().map((c) => c.word);
    expect(queued).toContain('无糖奶茶');
    expect(queued).not.toContain('无');
  });

  it('keeps a word nobody has heard, and queues it', () => {
    const fresh = judgedVocabularyDouble({ negators: LEGACY_CUE_SEED });
    expect(fresh.strippedForEmbedding('bulgogi')).toBe('bulgogi');
    expect(fresh.pendingHearings().map((c) => c.word)).toContain('bulgogi');
  });

  it('does not queue a word it already has an answer for', () => {
    const fresh = judgedVocabularyDouble({ negators: [['sin', 'es']] });
    fresh.strippedForEmbedding('sin cerdo');
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

  /**
   * A5 — THE LARGEST DEMAND INGRESS GOES THROUGH THE DOOR.
   *
   * Every unknown span of every search records demand here: an on_demand_ask
   * signal for short residue, a staged residue row for longer runs. Both wrote
   * RAW text. So a Spanish preposition the gazetteer failed to ground became a
   * durable instruction to go and collect `de` — the exact failure the write
   * door was built to make impossible, at the one ingress that never used it.
   */
  it('judges residue before recording it as demand', () => {
    expect(source).toContain('this.judgedVocabulary.demandTerm(');
    // The raw text may not reach either writer: both read the JUDGED term.
    const askBlock = source.slice(
      source.indexOf('const cappedResidues'),
      source.indexOf('const phaseTimings'),
    );
    expect(askBlock).toContain('if (!judged.recordable) continue;');
    expect(askBlock).toContain('const residueText = judged.text;');
    expect(askBlock).not.toMatch(/term:\s*rawResidueText/);
    expect(askBlock).not.toMatch(/residueText:\s*rawResidueText/);
  });

  /**
   * D2 — AND IT NEVER AWAITS A HEARING.
   *
   * `judgeThenStrip` is the same law with an LLM call inside it. On a path a
   * user is watching, that call is the product regressing to buy a chore:
   * `search.service` paid one per grounded entity. Neither search-path door
   * may await it — the synchronous `demandTerm` reads the in-memory table and
   * queues its misses for the maintenance drain.
   */
  it('never awaits a hearing on a search path', () => {
    for (const file of [
      'search-query-interpretation.service.ts',
      'search.service.ts',
    ]) {
      const text = stripComments(
        readFileSync(join(__dirname, '../../search/', file), 'utf8'),
        file,
      );
      expect(text).not.toContain('judgeThenStrip');
      expect(text).not.toMatch(/await\s+this\.judgedVocabulary\./);
    }
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

  it('judges a Mandarin run as the run it is, and a bare particle as itself', () => {
    // THE COST OF A4, STATED RATHER THAN HIDDEN. 好吃的 used to lose its
    // particle to 的's own verdict; it no longer does, because the same
    // mechanism was amputating 包子 into 包 and turning 无糖奶茶 (sugar-FREE
    // milk tea) into 糖奶茶 (SUGAR milk tea). A run is heard as itself and
    // kept unless the judge rules the whole run glue — the conservative
    // direction this door takes everywhere: an unstripped word costs one word
    // of context, a wrongly stripped one deletes the ask.
    const vocab = judgedVocabularyDouble({
      grammatical: [
        ['的', 'zh'],
        ['不', 'zh'],
      ],
    });
    expect(vocab.stripGrammar('好吃的', ['好吃的'], 'zh').text).toBe('好吃的');
    // A BARE particle is a one-character segment, so its verdict applies in
    // full — which is the case a demand signal actually meets (a residue run
    // that IS the particle).
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
    // NEGATION IS SPELLING-KEYED (B-key): the same answer whichever locale is
    // asked, because there is only one verdict and its key carries no locale.
    expect(vocab.outcomeOf(WORD_NEGATION_LANE, 'sin', 'es')).toBe(NEGATES);
    expect(vocab.outcomeOf(WORD_NEGATION_LANE, 'sin', 'en')).toBe(NEGATES);
    expect(vocab.outcomeOf(WORD_NEGATION_LANE, 'sin', null)).toBe(NEGATES);
    expect(vocab.outcomeOf(WORD_GENERICNESS_LANE, 'birria', 'es')).toBeNull();
    expect(vocab.carriesConcept('birria', 'es')).toBe(false);
    expect(CARRIES_CONCEPT).not.toBe(GRAMMATICAL_WORK);
  });
});

describe('the write door hears before it writes', () => {
  it('asks the judge about every unheard token of the ask, in its own language', async () => {
    const vocab = judgedVocabularyDouble({ grammatical: [['de', 'es']] });
    const heard = (
      vocab as unknown as { heard: Array<{ lane: string; words: string[] }> }
    ).heard;
    await vocab.judgeThenStrip('tacos de birria', 'es-MX');
    // CO-DUE (B-call, 2026-08-15): the door hands the judge the ask's SUBJECTS
    // and the judge decides dueness per facet, because the two facets disagree
    // about which words are owed — `de` has a genericness verdict and no
    // negation one. Sending each facet its own filtered list meant sending the
    // same words twice, which is the whole cost this removes. Nothing extra is
    // BOUGHT: `certifyFacets` records only the (word, facet) pairs that were
    // actually due.
    // THREE facets since word-role joined the co-due hearing (2026-08-15).
    expect(heard.length).toBe(3);
    expect(heard.map((h) => h.lane).sort()).toEqual([
      WORD_GENERICNESS_LANE,
      WORD_NEGATION_LANE,
      WORD_ROLE_LANE,
    ]);
    expect(heard[0].words.sort()).toEqual(['birria', 'de', 'tacos']);
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
    const judge = (vocab as unknown as { judge: { certifyFacets: unknown } })
      .judge;
    judge.certifyFacets = () => {
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

/**
 * REAL-CLASS cases (foundation red team #3 + #4, 2026-08-16): these exercise
 * the actual service internals the double overrides, because both findings
 * lived in private paths — the hold predicate and the queue's key spelling.
 */
describe('one hold law, one key spelling (real class)', () => {
  const bareService = () => {
    const service = Object.create(
      JudgedVocabularyService.prototype,
    ) as JudgedVocabularyService;
    const executeRaw = jest.fn().mockResolvedValue(0);
    const internals = service as unknown as {
      verdicts: Map<string, Map<string, string>>;
      negatingForms: Set<string>;
      pending: Map<string, unknown>;
      loaded: boolean;
      logger: { info: () => void; warn: () => void };
      judge: { certifyFacets: (...args: unknown[]) => Promise<unknown> };
      prisma: { $executeRaw: jest.Mock };
    };
    internals.verdicts = new Map([
      [WORD_GENERICNESS_LANE, new Map<string, string>()],
      [WORD_NEGATION_LANE, new Map<string, string>()],
      [WORD_ROLE_LANE, new Map<string, string>()],
    ]);
    internals.negatingForms = new Set();
    internals.pending = new Map();
    internals.loaded = true;
    internals.logger = { info: () => undefined, warn: () => undefined };
    internals.judge = { certifyFacets: () => Promise.resolve(new Map()) };
    internals.prisma = { $executeRaw: executeRaw };
    return { service, internals, executeRaw };
  };

  it('judgeThenStrip holds on the SAME predicate as the demand door — role counts, not genericness alone (#3)', async () => {
    const { service, internals } = bareService();
    // Genericness IS judged; the word-role facet is not. The old
    // genericness-only loop reported heldUnjudged=false here while
    // holdsUnjudged said true — two doors, two laws.
    internals.verdicts
      .get(WORD_GENERICNESS_LANE)!
      .set('es|best', CARRIES_CONCEPT);
    const judged = await service.judgeThenStrip('best', 'es');
    expect(judged.heldUnjudged).toBe(true);
    expect(service.holdsUnjudged('best', 'es')).toBe(true);
  });

  it('a budget-refused negation hearing queues EXACTLY ONE row, under und|form (#4)', async () => {
    const { service, internals, executeRaw } = bareService();
    internals.judge.certifyFacets = () => {
      throw new DrainExceedsStandingCapError(
        {
          lane: WORD_NEGATION_LANE,
          ruleVersion: WORD_NEGATION_RULE_VERSION,
          dueCount: 1,
          microUsdPerHearing: 96,
          estimateMicros: 96,
          estimateHash: 'deadbeef',
        },
        200,
        0,
      );
    };
    // The same spelling met under two locales is ONE negation claim: the
    // lane's canonical key is `und|form`. The old hand-built key queued
    // per-locale rows the drain's delete predicate could never match.
    await service.ensureJudged(
      [
        { word: 'nunca', locale: 'es' },
        { word: 'nunca', locale: 'en' },
      ],
      [WORD_NEGATION_LANE],
    );
    expect(service.pendingHearings()).toHaveLength(1);
    expect(executeRaw).toHaveBeenCalledTimes(1);
    // $executeRaw is a tagged template: values follow the strings array.
    expect(executeRaw.mock.calls[0]).toContain('und|nunca');
    expect(executeRaw.mock.calls[0]).not.toContain('es|nunca');
  });
});
