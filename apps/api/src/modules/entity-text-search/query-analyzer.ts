import { detectAll } from 'tinyld/light';
import { canonicalFold } from '../content-processing/entity-resolver/entity-identity';

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
  start: number;
  end: number;
}

export interface QueryNgram {
  /** Folded phrase text (tokens joined by a single space). */
  folded: string;
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

  if (decisive && top.accuracy >= DETECTOR_STRONG_ACCURACY) {
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
    const folded = canonicalFold(match[0]);
    tokens.push({
      raw: match[0],
      folded,
      start: match.index,
      end: match.index + match[0].length,
    });
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
      const maxN = Math.max(1, Math.min(maxPhraseWords, 5));
      const out: QueryNgram[] = [];
      for (let i = 0; i < tokens.length; i++) {
        for (let n = 1; n <= maxN && i + n <= tokens.length; n++) {
          const slice = tokens.slice(i, i + n);
          const folded = slice
            .map((t) => t.folded)
            .filter(Boolean)
            .join(' ');
          if (!folded) continue;
          const start = slice[0].start;
          const end = slice[n - 1].end;
          out.push({
            folded,
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

/** R5-3: a cue that IMMEDIATELY precedes a span negates it. Adjacency is
 *  token-level (the cue is the token just before the span's first token) —
 *  a cue anywhere in the query is NOT a licence to drop every span
 *  ("tacos without cheese, with salsa"). */
export function negatedSpan(
  analysis: QueryAnalysis,
  span: { start: number; end: number },
): NegationCue | null {
  const firstTokenIndex = analysis.tokens.findIndex(
    (t) => t.start >= span.start && t.end <= span.end,
  );
  if (firstTokenIndex <= 0) return null;
  return (
    analysis.negationCues.find((cue) => cue.index === firstTokenIndex - 1) ??
    null
  );
}
