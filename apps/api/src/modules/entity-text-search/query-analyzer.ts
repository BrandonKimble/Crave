import { detectAll } from 'tinyld/light';
import {
  canonicalFold,
  diacriticFold,
} from '../content-processing/entity-resolver/entity-identity';

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
  source: 'detector' | 'request-prior' | 'script';
}

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
export interface LanguagePack {
  /** Base language subtag. */
  language: string;
  /** Closed negation-cue list, folded. */
  negationCues: ReadonlySet<string>;
}

const pack = (language: string, cues: string[]): LanguagePack => ({
  language,
  negationCues: new Set(cues.map((c) => canonicalFold(c))),
});

/** R5-3 tier 1: closed ~10-word lists. Deliberately NOT extended with
 *  "hold the", "free of", "-less" — every addition must be measured on the
 *  gold corpus, and a false cue FAILS CLOSED (drops a span) so the cost of
 *  over-listing is real. */
export const LANGUAGE_PACKS: ReadonlyMap<string, LanguagePack> = new Map(
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
  ].map((p) => [p.language, p]),
);

/** Languages the detector is allowed to answer with. Restricting the
 *  candidate set is what makes a short-text n-gram detector usable at all
 *  (measured: unrestricted tinyld answers "ga"/"la" for Spanish food
 *  queries; restricted it answers "es"). */
const DETECTOR_CANDIDATES = ['en', 'es', 'fr', 'it', 'de', 'pt'];
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
 * SOFT prior fusion. Order:
 *  1. non-Latin script that pins a language 1:1 → that language (hard).
 *  2. a STRONG detector answer → the detector.
 *  3. the request locale, when the detector is weak or agrees → prior.
 *  4. nothing (null) — the honest answer, not a guess.
 * Detected tag and request locale are recorded SEPARATELY (R5-5/A10): a
 * Spanish-locale phone types English constantly, and a fabricated tag
 * would poison both languages' retrieval with no rollback.
 */
export function fuseLocale(
  text: string,
  script: QueryScript,
  requestLocale: string | null,
): DetectedLocale | null {
  const scriptPinned: Partial<Record<QueryScript, string>> = {
    hangul: 'ko',
    kana: 'ja',
    thai: 'th',
    greek: 'el',
    hebrew: 'he',
  };
  const pinned = scriptPinned[script];
  if (pinned) return { tag: pinned, confidence: 1, source: 'script' };

  const requestBase = baseLanguage(requestLocale);
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
  const overrulesPrior =
    decisive &&
    top.accuracy >= DETECTOR_STRONG_ACCURACY &&
    (requestBase == null ||
      top.lang === requestBase ||
      top.accuracy >= DETECTOR_OVERRULE_PRIOR);
  if (overrulesPrior) {
    return { tag: top.lang, confidence: top.accuracy, source: 'detector' };
  }
  if (requestBase) {
    // The prior wins over a weak detector — including when the detector's
    // weak answer disagrees. This is the documented resolution for
    // near-undecidable Latin-script input, NOT a detector failure.
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
export function segmentToken(raw: string, start: number): QueryToken[] {
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
}

export const QUERY_ANALYZER_MAX_TOKENS = 48;

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
    ? fuseLocale(raw, script, requestLocale)
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
