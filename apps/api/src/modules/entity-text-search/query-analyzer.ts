import { detectAll, supportedLanguages, toISO3 } from 'tinyld';
import {
  canonicalFold,
  diacriticFold,
} from '../content-processing/entity-resolver/entity-identity';
import { SUPPORTED_LOCALES } from '../../shared/locale/supported-locales';

/**
 * THE ANALYZER SEAM (multilingual plan A2 + M4b/R5-2 + R5-3).
 *
 * ONE pipeline object — normalize → segment → fold → detect → cue-scan —
 * with exactly ONE implementation today (English/Latin). Before this, the
 * gazetteer inlined its own tokenizer and NOTHING else in the query path
 * knew about script, language, or negation; M6 (CJK segmentation), M4b
 * (per-language decomposition) and M8 (morphology packs) would each have
 * been an independent surgery on that same 70-line block. They are now
 * PACKS plugged in here.
 *
 * THE SPAN-OFFSET CONTRACT: every token and every n-gram carries the RAW
 * start/end offsets of the text it came from. Folding is lossy (accents
 * stripped, apostrophes deleted) so the folded string can NEVER be used to
 * slice the query — downstream span consumers (gazetteer groups, residue
 * runs, highlighting) read offsets and slice the RAW string.
 *
 * NOT A LANGUAGE ROUTER (R5-2): script detection is a HARD gate (Unicode
 * ranges, zero ML); language detection is a SOFT PRIOR fused with the
 * request locale. Latin-script 1–3-word food queries are near-undecidable
 * by design — "pulpo" carries no detectable language and "phils ice house"
 * reads as French to every n-gram detector on earth. That is a property of
 * the input, not a bug in the detector; the fusion below resolves it with
 * the request locale, and tagged rows resolve the rest.
 */

export type QueryScript =
  | 'latin'
  | 'cyrillic'
  | 'greek'
  | 'hebrew'
  | 'arabic'
  | 'devanagari'
  | 'thai'
  | 'hangul'
  | 'cjk'
  | 'kana'
  | 'other';

export interface QueryToken {
  /** Raw substring, exactly as typed. */
  raw: string;
  /** canonicalFold(raw) — the ONE fold, imported, never re-implemented. */
  folded: string;
  /** diacriticFold(raw) — the SAME fold with the accent strip skipped. It is
   *  the ACCENT EVIDENCE of what the user typed: `diacritic !== folded` says
   *  "this token was typed with accents", and the gazetteer uses that to
   *  refuse a stored surface that disagrees on them (bò is not bơ). */
  diacritic: string;
  start: number;
  end: number;
  /**
   * HOW THIS TOKEN JOINS TO THE ONE BEFORE IT when tokens are re-assembled
   * into a phrase (n-grams, residue runs). ' ' for word-delimited scripts —
   * the shape every Latin/Hangul/Cyrillic query has always had. '' for the
   * 2nd..nth character of an UNSPACED CJK run: 麻辣牛肉面 is one typed word,
   * so its sub-tokens must re-assemble as 麻辣牛 and never as "麻 辣 牛"
   * (a folded key with spaces matches no stored surface — identity_key for
   * 牛肉面 is 牛肉面). The first token of a run keeps ' ': it joins to the
   * PREVIOUS word, which is a word boundary.
   */
  separator: ' ' | '';
}

/**
 * The longest phrase `ngrams()` will ever assemble, however large a
 * `maxPhraseWords` a caller asks for. This is a COST CEILING (candidates are
 * O(tokens x maxN) and feed a `= ANY(text[])` probe), not a statement about
 * vocabulary — callers name the phrase length their data actually needs.
 *
 * It was 5 and the gazetteer asked for 4, which silently made the exact-alias
 * scan blind to every banked surface longer than four words: 5,947 of 57,652
 * active recall surfaces (10.3%), including the whole Vietnamese cuisine
 * vocabulary ('ẩm thực Địa Trung Hải' → mediterranean, five tokens). Those
 * queries did not park — they SHREDDED into their parts and ground nonsense
 * ('Địa'→plate, 'Trung'→egg).
 *
 * 12 CLAMPED THE REAL DATA (red-team F5, re-measured 2026-08-09 against the
 * dev mirror): the longest active recall surface is 15 tokens ('banh bagel
 * thap cam voi kem pho mai hanh la va ca hoi xong khoi'), the only row above
 * 12 of 57,657 — so the ceiling, not the vocabulary, was the reason it could
 * never be assembled. 16 covers every banked surface measured with headroom
 * and still bounds the worst case (48 tokens x 16 = 768 candidates in one
 * `= ANY(text[])` probe; a 12-token scan measured ~1.4ms, and the ceiling is
 * only ever reached by queries that are themselves that long).
 */
export const NGRAM_MAX_PHRASE_WORDS_CEILING = 16;

export interface QueryNgram {
  /** Folded phrase text (tokens joined by a single space). */
  folded: string;
  /** The same phrase under the accent-preserving fold, assembled from the
   *  tokens by the identical join so the two keys differ ONLY by accents. */
  diacritic: string;
  /** Raw slice of the query this n-gram covers. */
  raw: string;
  start: number;
  end: number;
  /** Index of the first token and how many tokens the n-gram spans. */
  tokenIndex: number;
  tokenCount: number;
}

export interface DetectedLocale {
  /** BCP 47 (R5-5: full tags are the key shape; the detector emits base
   *  languages, so a region is only ever inherited from the request). */
  tag: string;
  /** 0..1, the detector's own accuracy, or 1 for a hard script gate. */
  confidence: number;
  /** Where the tag came from — recorded, never inferred back (A10). */
  source: 'detector' | 'request-prior' | 'script' | 'surface';
}

/**
 * ONE LANGUAGE, AND HOW MUCH OF THE REGISTRY SAYS SO.
 *
 * `entities` is the count of DISTINCT entities that bank this exact folded
 * text in that language — not the row count. Two rows on one entity (a label
 * and its search surface) are ONE writer answering ONE question; two
 * different entities are two independent assertions, and the difference is
 * exactly what "how sure is the registry" means here.
 */
export interface SurfaceLocaleEvidence {
  /** Base language subtag. Never 'und' — see the index. */
  language: string;
  /** Distinct entities banking this fold in `language`. Always ≥ 1. */
  entities: number;
}

/**
 * THE REGISTRY-SURFACE ORACLE — the primary short-string language signal.
 *
 * A sentence-trained n-gram detector is the WRONG instrument for a 1–3 word
 * food query, and no amount of threshold tuning fixes that: 'camarones' and
 * 'lengua' carry no sentence statistics at all (measured: both detect null),
 * and 'cơm tấm' detects `pt`. But we are not guessing in the dark — the
 * concept graph already HOLDS those words, each stamped with the locale it
 * was banked under. 'camarones' is an `es` surface of shrimp; 'cơm tấm' is a
 * `vi` surface of broken rice. That is DIRECT EVIDENCE about the language of
 * the text, from our own registry, and it beats every statistical prior.
 *
 * WHICH ROWS MAY SPEAK (2026-08-11, A0 red team F3/F4). Only rows written by
 * a producer of language-KNOWLEDGE: the vocabulary GENERATOR, which was asked
 * a per-language question ("what is this called in Spanish?"), and the JUDGE,
 * which settled a word claim. Rows written by a producer that merely OBSERVED
 * a string — extraction, and the demand-banking lane that banks a search term
 * under whatever language the search was detected in — carry no knowledge
 * about language and must never reach this index. The second one is the
 * dangerous one: it closes a loop where a mis-detection banks a row, and the
 * row then becomes the ground truth that justifies the same mis-detection
 * forever. Enforced at the index (SurfaceLocaleIndexService), which is the
 * only place that can see a row's provenance.
 *
 * The oracle answers ONE question — "which language is this exact folded text
 * banked under, and by how many entities?" — and is SYNCHRONOUS by contract,
 * because analyzeQuery runs once per query on the hot path and must not
 * become async. Its implementation is a warm in-memory index
 * (SurfaceLocaleIndexService); a caller with no index simply passes nothing
 * and the detector behaves as before.
 *
 * It is SELF-LIMITING to short strings without needing a token threshold: the
 * lookup is an EXACT match on the whole text, and a whole sentence is not a
 * banked surface. No arbitrary "≤ N words" constant is required or wanted.
 */
export type SurfaceLocaleOracle = (
  foldedText: string,
) => readonly SurfaceLocaleEvidence[];

export interface NegationCue {
  /** The folded cue word. */
  cue: string;
  /** Token index of the cue within `tokens`. */
  index: number;
  start: number;
  end: number;
  /** The locale pack that owns this cue. */
  locale: string;
}

export interface QueryAnalysis {
  raw: string;
  /** Locale the request asked for (BCP 47), or null. */
  requestLocale: string | null;
  tokens: QueryToken[];
  script: QueryScript;
  /** Soft prior. null = undecidable (the honest answer for 1–2 words). */
  detectedLocale: DetectedLocale | null;
  negationCues: NegationCue[];
  /** True when the query is NOT written in Latin script (M4's hard gate). */
  isNonLatinScript: boolean;
  /** True when the fused language is confidently not English. */
  isNonEnglish: boolean;
  /** n-grams over FOLDED tokens, offsets preserved. */
  ngrams(maxPhraseWords: number): QueryNgram[];
}

/**
 * A LANGUAGE PACK is the plug point (N7/A2). Today exactly one pack is
 * INSTALLED as the analyzer's behavior (English/Latin); the negation cue
 * lists for the other launch languages ride here because R5-3's gate is a
 * closed word list, not morphology — a pack with only cues is honest data,
 * not speculative machinery.
 */
interface LanguagePack {
  /** Base language subtag. */
  language: string;
  /** Closed negation-cue list, folded. */
  negationCues: ReadonlySet<string>;
}

const pack = (language: string, cues: string[]): LanguagePack => ({
  language,
  negationCues: new Set(cues.map((c) => canonicalFold(c))),
});

/** Closed ~10-word lists. Under negation v2 (LITERAL IGNORE) these lists
 *  drive EXACTLY ONE thing: stripping cue tokens from the text handed to
 *  the DENSE EMBEDDER. They no longer touch lexical grounding, residue
 *  runs, staging or the on-demand ask, so a false cue costs one word of
 *  embedded context rather than a dropped span — the old "FAILS CLOSED
 *  (drops a span)" cost died with the cue machinery. Still kept small and
 *  high-precision: not extended with "hold the", "free of", "-less". */
const LANGUAGE_PACKS: ReadonlyMap<string, LanguagePack> = new Map(
  [
    pack('en', ['no', 'without', 'not', 'non']),
    pack('es', ['sin', 'no']),
    pack('it', ['senza', 'non']),
    pack('de', ['ohne', 'kein', 'keine', 'nicht']),
    pack('fr', ['sans', 'pas']),
    pack('pt', ['sem']),
    // vi is a SHIPPED locale (F4): without this pack "phở không thịt"
    // embedded whole and the dense tier — the one component that can
    // UNDERSTAND negation — could invert it (the sin cerdo → vegan class)
    // in the third launch language. Standard high-frequency negators only;
    // `khong`/`chang` are the plain negations, `dung` the prohibitive,
    // `mien` the "hold the / free of" sense. Deliberately NOT listed:
    // `chua` ("not yet") and `it` ("little"), which are degree words and
    // appear inside dish text. Cue lists affect ONLY dense-input
    // stripping, never lexical grounding, so a false positive costs one
    // word of embedded context and nothing else.
    pack('vi', ['không', 'chẳng', 'đừng', 'miễn']),
    // NO zh/ko/ja pack, deliberately. Neither is a SUPPORTED_LOCALE, and the
    // one consumer (dense-input stripping) removes WHITESPACE-DELIMITED
    // words: an unspaced 不要肉 carries no whitespace to split on, so a zh
    // pack would either no-op or, once someone "fixed" it, delete a whole
    // run. CJK negation hygiene is real work (strip at the segmented-token
    // level), not a list entry — adding the list now would be machinery
    // that cannot do its job.
  ].map((p) => [p.language, p]),
);

/**
 * Languages the detector is allowed to answer with. Restricting the candidate
 * set is what makes a short-text n-gram detector usable at all (measured:
 * unrestricted tinyld answers "ga"/"la" for Spanish food queries; restricted
 * it answers "es").
 *
 * DERIVED FROM `SUPPORTED_LOCALES`, never enumerated beside it. The hand-kept
 * list was `['en','es','fr','it','de','pt']` — it had drifted into being both
 * TOO NARROW and TOO WIDE at once, in the same six entries:
 *
 *  - too narrow: `vi` shipped as a SUPPORTED_LOCALE and was never added, so
 *    the detector could not name it. Measured before this change,
 *    'bún đậu mắm tôm' — unambiguously Vietnamese, four accented words —
 *    detected NULL, and 'cơm tấm' detected `pt`. The third launch language
 *    was invisible to the one component whose job is naming languages.
 *  - too wide: `fr`/`it`/`de`/`pt` are not locales this server can serve.
 *    Answering with one buys nothing downstream (no label rows, no surfaces,
 *    no lookup chain) and costs real damage — F4 measured 15% of plain
 *    English queries classified non-English, mostly as `fr`
 *    ('phils ice house'), each buying an embedding call.
 *
 * A detector that can only answer with languages the system can actually
 * serve is the honest instrument, and deriving it here means adding a locale
 * stays what supported-locales.ts promises it is: a DATA change in one place.
 */
const DETECTOR_CANDIDATES: string[] = [...SUPPORTED_LOCALES];

/**
 * NAMING A LANGUAGE THE MODEL WAS NEVER TRAINED ON IS NOT A DETECTION, IT IS
 * A MISS SCORED AGAINST THE WRONG ALPHABET (2026-08-12).
 *
 * `DETECTOR_CANDIDATES` above restricts what the detector MAY answer. It said
 * nothing about what the detector CAN answer, and the two had silently come
 * apart: the import was `tinyld/light`, whose profile set is 24 languages and
 * does not include `vie`. Restricting a model to a candidate it has no
 * profile for does not make it abstain — the scorer simply hands the
 * probability mass to the nearest profile it does have, at full confidence.
 * Measured on the vi gold corpus, six plainly Vietnamese sentences came back
 * `es` at accuracy 1.00 — above DETECTOR_OVERRULE_PRIOR, so they OVERRULED an
 * explicit `vi` request prior and the system asserted that 'quán có wifi' is
 * Spanish. It was the single largest source of wrong-language verdicts left.
 *
 * WHY THE FULL MODEL AND NOT A VIETNAMESE SCRIPT PIN. A diacritic pin was the
 * attractive candidate — deterministic, list-free, the same shape as the
 * Han/kana pins — and it was MEASURED against this, both ways:
 *   - restricted to the marks only Vietnamese uses (hook above, dot below,
 *     horn, đ) it fixed 2 of the 6: 'quán có wifi' and 'tìm quán korean bbq'
 *     carry nothing but acute accents, which Spanish carries too. vi
 *     disagreements 7 -> 5.
 *   - widened to any Latin diacritic it fixed all 6 and DESTROYED Spanish:
 *     es gold disagreements 2 -> 17 ('café', 'sandía', 'romántico',
 *     'cocina mediterránea' all pinned `vi`).
 * Vietnamese's diacritic density is distinctive in the aggregate and NOT in
 * the individual code point, so no threshold-free character rule separates it
 * from Spanish. The honest fix is the one that removes the cause: give the
 * detector a model that has a profile for every language it is allowed to
 * name. Measured with it: vi disagreements 7 -> 0, es 2 -> 3 (the one
 * addition is 'brunch en downtown' -> `en`, a genuine reading of a query
 * whose two content words are English), launch gates unmoved (es 89.3%,
 * vi 90.4%), junk-word battery still 0 red, and detection is FASTER
 * (14µs/call vs 21µs) because the restricted scorer has fewer near-ties to
 * break. The cost is ~520KB of profile data loaded once at boot.
 *
 * THE COUPLING IS ASSERTED, NOT REMEMBERED. `assertDetectorModelCovers`
 * derives the requirement from SUPPORTED_LOCALES — the same set
 * DETECTOR_CANDIDATES comes from — so adding a fourth locale to
 * supported-locales.ts fails loudly here if the model has no profile for it,
 * instead of silently detecting it as its nearest neighbour at confidence 1.
 */
export function detectorModelGaps(
  locales: readonly string[] = SUPPORTED_LOCALES,
): string[] {
  const profiles = new Set(supportedLanguages);
  return locales.filter((locale) => !profiles.has(toISO3(locale)));
}

const MODEL_GAPS = detectorModelGaps();
if (MODEL_GAPS.length > 0) {
  throw new Error(
    `Language detector has no profile for supported locale(s): ${MODEL_GAPS.join(
      ', ',
    )}. A restricted candidate set does not make an unprofiled language ` +
      `abstain — it is scored as its nearest neighbour at full confidence.`,
  );
}
/** Below this the detector has said nothing worth hearing. Its accuracies
 *  are small by construction on 1–3 words; this floor + the margin below
 *  were chosen to keep English queries English and are PLACEHOLDERS until
 *  the D3 gold corpus sweeps them. */
const DETECTOR_MIN_ACCURACY = 0.1;
const DETECTOR_MIN_MARGIN = 1.25;
/** Above this the detector overrules the request-locale prior. */
const DETECTOR_STRONG_ACCURACY = 0.14;
/** PLACEHOLDER (D3 sweep calibrates): how sure the detector must be to
 *  overrule an explicit request-locale prior. */
const DETECTOR_OVERRULE_PRIOR = 0.5;

const SCRIPT_RANGES: Array<[QueryScript, RegExp]> = [
  ['cyrillic', /\p{Script=Cyrillic}/u],
  ['greek', /\p{Script=Greek}/u],
  ['hebrew', /\p{Script=Hebrew}/u],
  ['arabic', /\p{Script=Arabic}/u],
  ['devanagari', /\p{Script=Devanagari}/u],
  ['thai', /\p{Script=Thai}/u],
  ['hangul', /\p{Script=Hangul}/u],
  ['kana', /\p{Script=Hiragana}|\p{Script=Katakana}/u],
  ['cjk', /\p{Script=Han}/u],
  ['latin', /\p{Script=Latin}/u],
];

/**
 * THE SCRIPTS WHOSE ATOMIC UNIT IS NOT A LETTER.
 *
 * Han, kana and hangul all write one *sound-or-sense* per character rather
 * than one phoneme: 牛肉面 is three morphemes, ラーメン is four moras, 비빔밥
 * is three syllable blocks. Every Latin-calibrated character-edit heuristic
 * in this codebase assumes the opposite — that one character is a fraction of
 * a word, so removing one leaves a misspelling of the same word. Here
 * removing one leaves a DIFFERENT WORD: 牛肉面 (beef noodle soup) minus a
 * character is 牛肉 (beef) or 肉面 (meat noodles), both real and both other
 * dishes. So anything that spends an "edit" on these scripts is not
 * recovering a typo, it is silently substituting a neighbouring concept.
 *
 * Declared HERE because SCRIPT_RANGES is the one script table in the
 * codebase, and a second copy of "which scripts are these" is exactly the
 * drift this table exists to prevent. Membership-tested rather than
 * `detectScript(...) === 'cjk'`: detectScript returns the FIRST match and a
 * mixed token ("тако 牛肉面") must still be recognised as carrying a morphemic
 * script, not shadowed by whichever script sorts earlier.
 */
const MORPHEMIC_SCRIPTS: ReadonlySet<QueryScript> = new Set<QueryScript>([
  'cjk',
  'kana',
  'hangul',
]);

/** True when ANY character of `text` belongs to a script whose unit is a
 *  morpheme or syllable rather than a letter. */
export function hasMorphemicScript(text: string): boolean {
  return SCRIPT_RANGES.some(
    ([script, re]) => MORPHEMIC_SCRIPTS.has(script) && re.test(text),
  );
}

/** HARD GATE: Unicode ranges, ~100% reliable, zero ML. The first
 *  non-Latin script present wins (a code-switched "тако tacos" is treated
 *  as Cyrillic — the non-Latin evidence is the actionable half). */
export function detectScript(text: string): QueryScript {
  for (const [script, re] of SCRIPT_RANGES) {
    if (re.test(text)) return script;
  }
  return /\p{L}/u.test(text) ? 'other' : 'latin';
}

function baseLanguage(tag: string | null | undefined): string | null {
  if (!tag) return null;
  const base = tag.trim().toLowerCase().split(/[-_]/)[0];
  return base || null;
}

/**
 * THE SCRIPT PIN TABLE — scripts whose presence NAMES a language outright.
 *
 * `cjk` (Han) is pinned to `zh`, which it was not before. The omission was
 * not caution, it was a hole: Han was the one script the table could name and
 * didn't, so a Han query fell all the way through to the request-prior echo
 * below and came back wearing whatever the phone's locale was. Measured
 * before this change: 麻辣牛肉面 from an `es-MX` phone fused to `es-MX`,
 * confidence 0.5 — the system asserting that a Chinese noun phrase is Mexican
 * Spanish, and then embedding it with an `[es-MX]` prefix.
 *
 * Han does not distinguish zh from ja on its own, but KANA IS CHECKED FIRST
 * (SCRIPT_RANGES order) and any real Japanese text carries kana — okurigana,
 * particles, or the katakana half of a loanword. Han with NO kana anywhere is
 * Chinese in every practical case, and `zh` is a far better answer than the
 * caller's phone setting. It is a HARD gate like its siblings: Unicode
 * ranges, no ML, confidence 1.
 */
const SCRIPT_PINNED_LANGUAGE: Partial<Record<QueryScript, string>> = {
  hangul: 'ko',
  kana: 'ja',
  thai: 'th',
  greek: 'el',
  hebrew: 'he',
  cjk: 'zh',
};

/**
 * MAY ANYTHING BUT THE SCRIPT TABLE NAME THIS TEXT'S LANGUAGE?
 *
 * Only for Latin script — and since `zh` joined SUPPORTED_LOCALES
 * (2026-08-12) that is a claim about WHO ASKS THE QUESTION, not about the
 * locale set. This gate is only ever reached when the script table declined
 * to pin: `fuseLocale` consults SCRIPT_PINNED_LANGUAGE FIRST and returns
 * outright, so every script a supported locale is written in is already
 * answered before control gets here. Han is the live proof — it pins to `zh`
 * at confidence 1 and never reaches this line.
 *
 * What remains below the pin is text in a script NO supported locale uses.
 * For that text neither the requester's locale nor the n-gram detector (whose
 * candidate set IS SUPPORTED_LOCALES) can name an answer that could be right;
 * both would be fabricating a tag.
 *
 * This used to be `scriptAdmitsRequestPrior`, applied inside two of the
 * detector arms and not the third — which is how a Cyrillic query came back
 * `es` at accuracy 0.11 (F9). It is ONE gate now, spent once, before the
 * detector runs at all.
 *
 * `other` (letters of a script the table does not enumerate) is non-Latin for
 * the same reason: it is definitionally NOT Latin. Text with no letters at
 * all reports 'latin' from detectScript and is unaffected — the detector
 * simply finds nothing decisive in it.
 */
function scriptAdmitsLatinLanguage(script: QueryScript): boolean {
  return script === 'latin';
}

/**
 * SYMBOLS AND PICTOGRAPHS ARE CONTENT THE FOLD THROWS AWAY (red team F3).
 *
 * The surface oracle is an EXACT WHOLE-TEXT lookup, and that is the entire
 * source of its authority: someone banked this exact word under this exact
 * language. But the lookup key is `canonicalFold`, which turns every
 * non-letter/digit run into a space — so 'pan 🌮' folds to 'pan' and comes
 * back as a confidence-1.0 claim about a string nobody ever banked. The user
 * typed something more than the word; the match is not exact, and dressing it
 * up as direct evidence is the same error as the write flip, one layer over.
 *
 * PUNCTUATION IS NOT CONTENT, and is deliberately still admitted. "Phil's",
 * "tex-mex", "St. Marks", "banh mi & pho" are SPELLINGS of the words they
 * contain, and folding them is the fold doing its job (that is why the
 * apostrophe strip and the separator collapse exist at all). Symbols and
 * emoji are not spelling — they are things the user added — so the line is
 * drawn at `\p{S}` plus the pictographic extension, not at `\p{P}`.
 *
 * INVISIBLES ARE CONTENT TOO, and they are the dangerous half (A0 R7,
 * 2026-08-11). The fold DELETES every format control outright — ZWSP, ZWJ,
 * ZWNJ, the BOM, the soft hyphen, U+061C — so `ta<ZWSP>co` folds to exactly
 * `taco` and the oracle returns a confidence-1.0 language claim for a string
 * the user did not type. Worse than the emoji case, because there is nothing
 * on screen to explain it: LLM extraction and pasteboards inject these, and a
 * hand-crafted query could aim one at any banked word. `\p{C}` covers the
 * whole family (Cc control, Cf format, Cn unassigned, Co private-use, Cs
 * surrogate) in one primitive rather than a codepoint list that rots.
 *
 * WHAT STAYS ADMITTED, AND WHY. NBSP (U+00A0) and the other Zs spaces are
 * WHITESPACE — the fold collapses them to a space exactly as it collapses a
 * plain one, so the folded key is the same string a normal space would give:
 * that is spelling, not added content. Fullwidth and other compatibility
 * forms are LETTERS, and NFKD maps them to their plain letter by design
 * (fullwidth ramen IS ramen); refusing them would refuse a whole legitimate
 * input method. Punctuation stays admitted for the reason stated above.
 *
 * The empty fold needs no special case: '🌮' folds to '' and matches nothing.
 */
const FOLD_DISCARDS_CONTENT = /\p{S}|\p{Extended_Pictographic}|\p{C}/u;

function foldPreservesContent(text: string): boolean {
  return !FOLD_DISCARDS_CONTENT.test(text);
}

/**
 * SOFT prior fusion. Order:
 *  1. non-Latin script that pins a language 1:1 → that language (hard).
 *  2. an EXACT registry-surface hit, from rows that KNOW a language and with
 *     enough weight to contradict a stated prior → that language.
 *  3. a STRONG detector answer, and only for Latin-script text → the detector.
 *  4. the request locale, when the detector is weak or agrees → prior.
 *  5. nothing (null) — the honest answer, not a guess.
 * Detected tag and request locale are recorded SEPARATELY (R5-5/A10): a
 * Spanish-locale phone types English constantly, and a fabricated tag
 * would poison both languages' retrieval with no rollback.
 */
function fuseLocale(
  text: string,
  script: QueryScript,
  requestLocale: string | null,
  surfaceLocales?: SurfaceLocaleOracle,
): DetectedLocale | null {
  const pinned = SCRIPT_PINNED_LANGUAGE[script];
  if (pinned) return { tag: pinned, confidence: 1, source: 'script' };

  // THE REGISTRY BEFORE THE MODEL. An exact whole-text hit on a locale-tagged
  // surface is evidence, not inference: someone banked this exact word under
  // that locale. It outranks both the n-gram detector (which is blind on the
  // 1–3 word food queries this fires on) and the request prior (a Spanish
  // phone typing 'cơm tấm' is typing Vietnamese, whatever the phone says).
  //
  // AMBIGUITY IS HONEST SILENCE, not a coin flip: a word banked under two
  // different languages — Latin-script food vocabulary is full of them —
  // proves nothing about which one was meant, so the oracle abstains and the
  // detector and prior below get their normal turn. `und` is universal, not a
  // language, and never votes.
  if (surfaceLocales && foldPreservesContent(text)) {
    const folded = canonicalFold(text);
    const byLanguage = new Map<string, number>();
    if (folded) {
      for (const evidence of surfaceLocales(folded)) {
        const base = baseLanguage(evidence.language);
        if (base && base !== 'und') {
          byLanguage.set(
            base,
            (byLanguage.get(base) ?? 0) + Math.max(1, evidence.entities),
          );
        }
      }
    }
    // ONE ROW IS ONE OPINION, NOT GROUND TRUTH (red team F3, measured).
    // A single entity banking this fold in one language is one writer's
    // answer to one question. That is ample evidence when nobody has said
    // anything better — but it is NOT enough to contradict a person who
    // STATED what language they are searching in. Measured on the live
    // corpus, every one of these is a lone generator row overruling an
    // explicit en-US prior at confidence 1.0:
    //   'cat'   -> vi   (cắt/cát, one Vietnamese label)
    //   'pan'   -> es   (bread, one Spanish label)
    //   'crema' -> vi   (one Vietnamese label)
    //   'pie'   -> en   (one English label; it flipped an es-corpus query)
    // Each is also a perfectly ordinary word in the requester's language,
    // which is precisely why one row on the other side cannot settle it.
    // The words that SHOULD beat the phone setting are unaffected because
    // the registry says them more than once: 'camarones' (2 entities),
    // 'lengua' (3), 'phở bò' (2). 'cơm tấm' is banked in both es and vi and
    // abstains on ambiguity, as it already did.
    const requestBaseForSurface = baseLanguage(requestLocale);
    if (byLanguage.size === 1) {
      const [[only, entities]] = [...byLanguage];
      const contradictsStatedPrior =
        requestBaseForSurface != null && requestBaseForSurface !== only;
      if (contradictsStatedPrior && entities < 2) {
        // Fall through: the detector and the prior get their normal turn.
        // Deliberately not a weakened 'surface' verdict — the DetectedLocale
        // contract says a source names WHERE the tag came from, and half of
        // one row is not where anything came from.
        return fuseWithoutSurface(text, script, requestLocale);
      }
      // REGION IS INHERITED FROM THE REQUEST, NEVER INVENTED (R5-5, and the
      // DetectedLocale contract). A surface row is tagged with a base
      // language; when that language is the requester's, their FULL tag is
      // the strictly better answer — 'es-MX' and 'es-ES' diverge on exactly
      // food vocabulary, and the region is real information the registry
      // cannot supply but the request already did.
      const requestBase = baseLanguage(requestLocale);
      if (requestBase === only && requestLocale) {
        return { tag: requestLocale, confidence: 1, source: 'surface' };
      }
      return { tag: only, confidence: 1, source: 'surface' };
    }
  }

  return fuseWithoutSurface(text, script, requestLocale);
}

/**
 * The detector + request-prior half, with no registry evidence in play. Its
 * own function because the surface branch above has two exits into it: no
 * usable hit, and a hit too thin to contradict a stated prior.
 */
function fuseWithoutSurface(
  text: string,
  script: QueryScript,
  requestLocale: string | null,
): DetectedLocale | null {
  const requestBase = baseLanguage(requestLocale);

  // THE DETECTOR MAY ONLY SPEAK ABOUT TEXT IT COULD BE RIGHT ABOUT (F9/F13).
  // `DETECTOR_CANDIDATES` is `SUPPORTED_LOCALES`, and every locale in that set
  // is written in LATIN SCRIPT — the same fact `scriptAdmitsLatinLanguage`
  // states. So for text in any other script, no candidate the detector is
  // allowed to name can possibly be the answer, and whatever it returns is an
  // artefact of scoring the wrong alphabet. Measured: 'тако tacos' from an
  // es-MX phone came back `es` at accuracy 0.11 — the script gate correctly
  // BLOCKED the request-prior echo, and then the verdict fell through to the
  // bare `decisive` arm at the bottom and was returned anyway. A gate that
  // stops the prior and not the model is not a gate; a script we cannot name
  // a language for is `null`, full stop.
  //
  // Pinned scripts never reach here (fuseLocale returns their language as a
  // hard gate), and letterless text reports 'latin' from detectScript, where
  // the detector simply finds nothing decisive.
  if (!scriptAdmitsLatinLanguage(script)) {
    return null;
  }

  let ranked: Array<{ lang: string; accuracy: number }> = [];
  try {
    ranked = detectAll(text, { only: DETECTOR_CANDIDATES }) as Array<{
      lang: string;
      accuracy: number;
    }>;
  } catch {
    ranked = [];
  }
  const top = ranked[0];
  const runner = ranked[1];
  const decisive =
    top != null &&
    top.accuracy >= DETECTOR_MIN_ACCURACY &&
    (runner == null || top.accuracy >= DETECTOR_MIN_MARGIN * runner.accuracy);

  // F4 (wave-3 red team, measured): a "strong" detector verdict overruled
  // an EXPLICIT request prior — 15% of plain-English queries classified
  // non-English (phils ice house→fr), each buying an embedding call and
  // exposure to placeholder dense floors. The detector may only overrule a
  // stated prior above OVERRULE_PRIOR (a placeholder the D3 gold-corpus
  // sweep calibrates); with no prior, STRONG suffices as before.
  // "OVERRULE" MEANS DISAGREE. When the detector AGREES with the prior there
  // is nothing to overrule, and returning the detector's answer would throw
  // away the region subtag the request already stated ('en-US' → 'en') for no
  // gain — the agreement instead RAISES THE CONFIDENCE of the prior, which is
  // what the prior branch below already records. Region is inherited from the
  // request, never invented (R5-5).
  // The per-arm script test both of these used to carry is GONE, not
  // dropped: the script gate at the top of this function is the same test,
  // applied once and to the detector as well. Everything below runs only for
  // Latin-script text, where the prior is admissible by construction.
  const overrulesPrior =
    decisive &&
    top.accuracy >= DETECTOR_STRONG_ACCURACY &&
    (requestBase == null ||
      (top.lang !== requestBase && top.accuracy >= DETECTOR_OVERRULE_PRIOR));
  if (overrulesPrior) {
    return { tag: top.lang, confidence: top.accuracy, source: 'detector' };
  }
  if (requestBase) {
    // The prior wins over a weak detector — including when the detector's
    // weak answer disagrees. This is the documented resolution for
    // near-undecidable LATIN-SCRIPT input, NOT a detector failure.
    return {
      tag: requestLocale ?? requestBase,
      confidence: decisive && top.lang === requestBase ? top.accuracy : 0.5,
      source: 'request-prior',
    };
  }
  if (decisive) {
    return { tag: top.lang, confidence: top.accuracy, source: 'detector' };
  }
  return null;
}

/** Tokenizer char class — CURLY APOSTROPHE ADDED (N1): "Harry’s" tokenized
 *  as "harry" + "s" before this, so its own name could never match. */
const TOKEN_RE = /[\p{L}\p{N}][\p{L}\p{N}'’‘ʼ&.-]*/gu;

/**
 * UNSPACED-SCRIPT SEGMENTATION (M6, near-term shape).
 *
 * Chinese and Japanese put no spaces between words, so TOKEN_RE — a
 * whitespace/punctuation tokenizer — returns 麻辣牛肉面 as ONE token and the
 * n-gram generator then has exactly one span to offer. Nothing can match a
 * sub-concept: not the gazetteer (which probes folded n-grams against
 * identity_key), not the residue lane, not the typo lattice.
 *
 * THE IDEAL SHAPE, and why it is character-level: the long-term home for
 * segmentation is the tokenized surface store (plan §11 item 7), which
 * indexes the STORED side the same way. Until that store exists the query
 * side must produce spans that match surfaces stored whole, and the
 * language-neutral way every search engine does that is the character
 * n-gram (Lucene/Elasticsearch `cjk_bigram`, Postgres pg_bigm). We emit the
 * CHARACTERS of each CJK run as sub-tokens with separator '' — the existing
 * n-gram generator then derives the bigrams, trigrams and 4-grams for free,
 * with correct RAW offsets, and cjk_bigram's behaviour is a subset of what
 * comes out. No dictionary, no model, no per-language table: pure, and the
 * same code path for zh and ja.
 *
 * HANGUL IS DELIBERATELY EXCLUDED. Korean IS space-delimited ('매운 한국
 * 음식' already tokenizes into three words); character-splitting it would
 * shred real words into syllable blocks. Latin, Cyrillic, Thai, Arabic and
 * every other script are untouched — this function returns the input token
 * unchanged unless it actually contains Han or Kana.
 */
// SCRIPT_EXTENSIONS, not Script: the characters that GLUE a CJK run together
// are formally Script=Common and would otherwise cut it. The prolonged sound
// mark ー (U+30FC) sits inside every katakana loanword — ラーメン — and the
// iteration marks 々ゝゞ inside Japanese compounds; scx assigns them to the
// scripts they actually belong to. Kana is ONE class (hiragana + katakana):
// they interleave inside a single word, and ー carries scx={Hira,Kana}.
const CJK_RUN_SCRIPT = (ch: string): 'han' | 'kana' | null =>
  /\p{Script_Extensions=Hiragana}|\p{Script_Extensions=Katakana}/u.test(ch)
    ? 'kana'
    : /\p{Script_Extensions=Han}/u.test(ch)
      ? 'han'
      : null;

/** Splits ONE raw token into the tokens the analyzer emits for it. A token
 *  with no Han/Kana yields exactly itself (byte-identical, one allocation
 *  more than before). A token containing them is cut into per-character CJK
 *  sub-tokens plus the non-CJK stretches between them.
 *
 *  WHAT DECIDES THE SEPARATOR (red-team F4, executed): raw ADJACENCY, never
 *  script identity. TOKEN_RE already cut the query at every real word
 *  boundary — whitespace and punctuation — so everything inside ONE matched
 *  token was typed with nothing between it, and re-assembling it must
 *  reproduce exactly that. Only the FIRST sub-token carries ' ' (it joins to
 *  the previous WORD); every later one carries ''. Deriving the separator
 *  from a Han→Kana or CJK→digit script change instead put a space inside
 *  words that have none: 豚骨ラーメン rendered "豚骨 ラーメン" and 麻辣3号
 *  rendered "麻辣 3 号", so the full-length n-gram could never equal the
 *  stored identity_key (which is the fold of the surface, spaceless) and a
 *  kanji+kana compound — most Japanese dish and shop names — was unmatchable
 *  at exactly the span that identifies it. The invariant this restores:
 *  every n-gram's folded text equals canonicalFold of its own raw slice. */
function segmentToken(raw: string, start: number): QueryToken[] {
  const chars = Array.from(raw);
  if (!chars.some((ch) => CJK_RUN_SCRIPT(ch) !== null)) {
    return [
      {
        raw,
        folded: canonicalFold(raw),
        diacritic: diacriticFold(raw),
        start,
        end: start + raw.length,
        separator: ' ',
      },
    ];
  }
  /** [rawPiece, startOffset] in order: one per CJK character, one per
   *  non-CJK stretch. */
  const pieces: Array<[string, number]> = [];
  let offset = start;
  let plain = '';
  let plainStart = start;
  const flushPlain = () => {
    if (!plain) return;
    pieces.push([plain, plainStart]);
    plain = '';
  };
  for (const ch of chars) {
    if (CJK_RUN_SCRIPT(ch) !== null) {
      flushPlain();
      pieces.push([ch, offset]);
    } else {
      if (!plain) plainStart = offset;
      plain += ch;
    }
    offset += ch.length;
  }
  flushPlain();
  return pieces.map(([piece, pieceStart], index) => ({
    raw: piece,
    folded: canonicalFold(piece),
    diacritic: diacriticFold(piece),
    start: pieceStart,
    end: pieceStart + piece.length,
    separator: index === 0 ? ' ' : '',
  }));
}

export interface AnalyzeOptions {
  /** Query-shape guard, mirrors the gazetteer's DoS cap. */
  maxTokens?: number;
  /** The registry-surface language oracle (see SurfaceLocaleOracle). Absent
   *  ⇒ detection falls back to the n-gram detector + request prior exactly as
   *  before, so every existing caller is unchanged by construction. */
  surfaceLocales?: SurfaceLocaleOracle;
}

const QUERY_ANALYZER_MAX_TOKENS = 48;

/** THE pipeline. One call per query (A5): language detection must never
 *  run per residue probe — the probe budget is 24 and per-probe detection
 *  would 24x a cost the plan prices as ~free. */
export function analyzeQuery(
  rawQuery: string,
  requestLocale: string | null = null,
  options: AnalyzeOptions = {},
): QueryAnalysis {
  const raw = rawQuery ?? '';
  const maxTokens = options.maxTokens ?? QUERY_ANALYZER_MAX_TOKENS;

  const tokens: QueryToken[] = [];
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(raw)) !== null) {
    // Whitespace/punctuation gives the WORDS of a spaced script and the
    // whole unspaced run of a CJK one; segmentToken cuts the latter down to
    // matchable sub-tokens and returns the former untouched.
    for (const token of segmentToken(match[0], match.index)) {
      tokens.push(token);
      if (tokens.length >= maxTokens) break;
    }
    if (tokens.length >= maxTokens) break;
  }

  const script = detectScript(raw);
  const detectedLocale = raw.trim()
    ? fuseLocale(raw, script, requestLocale, options.surfaceLocales)
    : null;

  // Cue scan reads EVERY installed pack, not just the fused locale: the
  // fused locale is a soft prior and "ramen sin cerdo" from an en-US phone
  // must still fail closed. Cues are closed lists, so cross-pack scanning
  // costs nothing but the English "no" ambiguity, which fails closed by
  // design (wrong-and-confident is the thing being prevented).
  const negationCues: NegationCue[] = [];
  tokens.forEach((token, index) => {
    for (const [language, languagePack] of LANGUAGE_PACKS) {
      if (languagePack.negationCues.has(token.folded)) {
        negationCues.push({
          cue: token.folded,
          index,
          start: token.start,
          end: token.end,
          locale: language,
        });
        break;
      }
    }
  });

  const fusedBase = baseLanguage(detectedLocale?.tag ?? null);
  const analysis: QueryAnalysis = {
    raw,
    requestLocale,
    tokens,
    script,
    detectedLocale,
    negationCues,
    isNonLatinScript: script !== 'latin' && script !== 'other',
    isNonEnglish: fusedBase != null && fusedBase !== 'en',
    ngrams(maxPhraseWords: number): QueryNgram[] {
      const maxN = Math.max(
        1,
        Math.min(maxPhraseWords, NGRAM_MAX_PHRASE_WORDS_CEILING),
      );
      const out: QueryNgram[] = [];
      for (let i = 0; i < tokens.length; i++) {
        for (let n = 1; n <= maxN && i + n <= tokens.length; n++) {
          const slice = tokens.slice(i, i + n);
          // Each token states how it joins to the one before it (' ' for a
          // spaced script, '' inside an unspaced CJK run). For Latin/Hangul
          // every separator is ' ', so this is the old `.join(' ')` exactly.
          let folded = '';
          let diacritic = '';
          for (const t of slice) {
            if (!t.folded) continue;
            folded = folded ? folded + t.separator + t.folded : t.folded;
            diacritic = diacritic
              ? diacritic + t.separator + t.diacritic
              : t.diacritic;
          }
          if (!folded) continue;
          const start = slice[0].start;
          const end = slice[n - 1].end;
          out.push({
            folded,
            diacritic,
            raw: raw.slice(start, end),
            start,
            end,
            tokenIndex: i,
            tokenCount: n,
          });
        }
      }
      return out;
    },
  };
  return analysis;
}

/**
 * R5-7: THE DENSE QUERY INPUT FORMAT — `[<bcp47>] <span>`.
 *
 * Uber Eats' 2026 multilingual-search paper ships an explicit
 * search-language field for exactly our failure ("'pan' in Spanish vs
 * English"); a multilingual embedder reads the bracketed tag as context
 * and moves the vector toward that language's sense. Chosen over a
 * natural-language prefix ("Spanish: pan") because a bracketed tag is
 * language-neutral, one token, and cannot be mistaken for query content;
 * chosen over a separate structured field because embedQuery takes one
 * string. NO LOCALE ⇒ NO PREFIX — an unprefixed English corpus query must
 * keep embedding exactly as it does today (this is what makes the change
 * a no-op for every existing caller).
 *
 * The tag is the FULL BCP 47 request locale (R5-5): es-MX and es-ES
 * genuinely diverge on food vocabulary, and the embedder can use that.
 */
export function denseQueryInput(term: string, locale: string | null): string {
  const tag = locale?.trim();
  return tag ? `[${tag}] ${term}` : term;
}

/** NEGATION V2 (plan §12b): the folded cue tokens present in THIS query —
 *  used ONLY as dense-input hygiene (strip before embedding). Lexical
 *  matching never consults cues anymore: a cue inside a name is a real
 *  word ("No Name Burgers"). */
export function negationCueTexts(analysis: {
  negationCues: NegationCue[];
}): ReadonlySet<string> {
  return new Set(analysis.negationCues.map((cue) => cue.cue));
}
