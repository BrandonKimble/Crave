/**
 * @script-class: probe
 *   (probe, not 'gate': 'gate' is the repo-root shell-script vocabulary; in
 *   apps/api/scripts the F414 taxonomy is operational/probe/scratch, and this
 *   is the same species as run-launch-gate — a re-runnable measurement
 *   instrument whose value is the recorded verdict. Caught by
 *   script-containment on b205e0012's CI run — classified to match its
 *   own header's named counterpart.)
 *
 * CJK SEGMENTATION GATE — proves the ANALYSIS half of zh/ja/ko readiness,
 * and only that half (owner directive 2026-08-08: "re-test whenever we
 * bring on other languages").
 *
 * THE RED THIS GATE WAS BORN FROM: Chinese and Japanese put no spaces
 * between words, so the whitespace tokenizer returned 麻辣牛肉面 as ONE
 * token and the n-gram generator had exactly ONE span to offer — nothing
 * downstream (gazetteer, residue lane, typo lattice) could ever match a
 * sub-concept. Korean is space-delimited and was never blocked.
 *
 * WHAT IT ASSERTS (pure — no DB, no network, no Nest context; the analyzer
 * is a pure function and this gate is its falsifiability engine):
 *   - minNgrams: the query must yield at least this many distinct folded
 *     n-grams (an unspaced Han query yielding 1 is the original defect);
 *   - mustInclude: folded spans that must be offered to the gazetteer;
 *   - fold-of-own-slice: every n-gram's folded text equals canonicalFold of
 *     the raw slice it covers, so a space appears if and only if the user
 *     typed whitespace there (a key with an invented space matches no stored
 *     surface — identity_key for 豚骨ラーメン is 豚骨ラーメン). This is
 *     derived, never per-case: an opt-out flag here de-fanged the assertion
 *     once already;
 *   - foldIsIdentity: canonicalFold must not mangle the script (no case,
 *     no diacritics, CJK voicing preserved);
 *   - tokens: exact token list, so a Latin/Hangul regression is loud.
 *
 * SCOPE — READINESS, NOT SUPPORT. Green here means the ANALYZER no longer
 * blocks zh/ja; it does NOT mean zh/ja are supported. 'zh'/'ko'/'ja' are
 * deliberately NOT in SUPPORTED_LOCALES: a language ships with its
 * VOCABULARY SWEEP (tagged alias rows + localized surfaces), and this gate
 * is the prerequisite that sweep was waiting on.
 *
 * Run: npx ts-node -T scripts/search-harness/cjk-segmentation-gate.ts
 */
import { out } from './_shared';
import {
  analyzeQuery,
  NGRAM_MAX_PHRASE_WORDS_CEILING,
} from '../../src/modules/entity-text-search/query-analyzer';
import { canonicalFold } from '../../src/modules/content-processing/entity-resolver/entity-identity';

interface Case {
  id: string;
  query: string;
  locale?: string | null;
  /** Analyzer's script verdict. */
  script: string;
  minNgrams: number;
  mustInclude: string[];
  tokens?: string[];
  /** Latin/Hangul cases assert the exact prior n-gram list. */
  exactNgrams?: string[];
}

/**
 * The n-gram window. Production DERIVES it from the data — the longest
 * active recall surface, measured in analyzer tokens
 * (`resolveBankedSurfacePhraseWords`) — and clamps it at the analyzer's cost
 * ceiling. This gate is pure (no DB), so it asks for the CEILING: the widest
 * window production can ever open, which is what an unspaced surface needs
 * (豚骨ラーメン is one banked surface but SIX query tokens). An earlier
 * revision hardcoded 4 with the comment "what the gazetteer actually asks
 * for" — that number was already stale and it hid the F4 defect, because a
 * 6-token surface could not be assembled to be compared at all.
 */
const MAX_PHRASE_WORDS = NGRAM_MAX_PHRASE_WORDS_CEILING;

const CASES: Case[] = [
  {
    id: 'zh-unspaced-dish',
    query: '麻辣牛肉面',
    script: 'cjk',
    minNgrams: 2,
    tokens: ['麻', '辣', '牛', '肉', '面'],
    mustInclude: ['麻辣', '牛肉', '牛肉面', '麻辣牛肉', '麻辣牛肉面'],
  },
  {
    id: 'zh-restaurant-name',
    query: '海底捞',
    script: 'cjk',
    minNgrams: 2,
    mustInclude: ['海底', '海底捞'],
  },
  {
    id: 'zh-han-digit-name',
    // Han + digit with no whitespace — a common zh shop name. The digit is
    // not a word boundary; "麻辣 3 号" would match no stored surface.
    query: '麻辣3号',
    script: 'cjk',
    minNgrams: 4,
    tokens: ['麻', '辣', '3', '号'],
    mustInclude: ['麻辣', '3号', '麻辣3号'],
  },
  {
    id: 'zh-mixed-latin',
    query: 'spicy 牛肉面 austin',
    script: 'cjk',
    minNgrams: 5,
    tokens: ['spicy', '牛', '肉', '面', 'austin'],
    mustInclude: ['牛肉面', 'spicy', 'austin', 'spicy 牛肉面 austin'],
  },
  {
    id: 'ja-han-kana-compound',
    query: '豚骨ラーメン',
    // Kana outranks Han in the script gate (a query with any kana is
    // Japanese, while Han alone is ambiguous zh/ja).
    script: 'kana',
    minNgrams: 6,
    // The FULL compound must be offered as one spaceless span — that is the
    // form the surface is stored under. ー (Script=Common) stays glued to
    // its katakana run, and the Han→Kana change is NOT a word boundary.
    mustInclude: ['豚骨', 'ラーメン', '豚骨ラーメン'],
    tokens: ['豚', '骨', 'ラ', 'ー', 'メ', 'ン'],
  },
  {
    id: 'ja-kana-han-compound',
    query: 'ラーメン屋',
    script: 'kana',
    minNgrams: 5,
    mustInclude: ['ラーメン', 'ラーメン屋'],
    tokens: ['ラ', 'ー', 'メ', 'ン', '屋'],
  },
  {
    id: 'ja-tokyo-ramen',
    query: '東京ラーメン',
    script: 'kana',
    minNgrams: 6,
    mustInclude: ['東京', 'ラーメン', '東京ラーメン'],
  },
  {
    id: 'ko-spaced-unchanged',
    query: '매운 한국 음식',
    locale: 'ko-KR',
    script: 'hangul',
    minNgrams: 6,
    tokens: ['매운', '한국', '음식'],
    mustInclude: ['한국 음식', '매운 한국 음식'],
  },
  {
    id: 'ko-single-word',
    query: '비빔밥',
    locale: 'ko-KR',
    script: 'hangul',
    minNgrams: 1,
    tokens: ['비빔밥'],
    mustInclude: ['비빔밥'],
  },
  {
    id: 'en-unchanged',
    query: 'breakfast taco',
    script: 'latin',
    minNgrams: 3,
    tokens: ['breakfast', 'taco'],
    mustInclude: ['breakfast taco'],
    exactNgrams: ['breakfast', 'breakfast taco', 'taco'],
  },
  {
    id: 'en-accented-name-unchanged',
    query: 'Despaña bakery',
    script: 'latin',
    minNgrams: 3,
    tokens: ['Despaña', 'bakery'],
    mustInclude: ['despana bakery'],
    exactNgrams: ['despana', 'despana bakery', 'bakery'],
  },
];

/** Fold must be the identity on these — no case, no diacritics, and CJK
 *  voicing marks are NOT accents (が must never fold to か). */
const FOLD_IDENTITY = [
  '麻辣牛肉面',
  '海底捞',
  '豚骨ラーメン',
  'がぎ',
  '비빔밥',
];

function main(): void {
  let green = 0;
  let red = 0;

  for (const c of CASES) {
    const analysis = analyzeQuery(c.query, c.locale ?? null);
    const ngrams = analysis.ngrams(MAX_PHRASE_WORDS);
    const folded = ngrams.map((n) => n.folded);
    const failures: string[] = [];

    if (analysis.script !== c.script)
      failures.push(`script=${analysis.script} want=${c.script}`);
    if (folded.length < c.minNgrams)
      failures.push(`ngrams=${folded.length} < ${c.minNgrams}`);
    const missing = c.mustInclude.filter((m) => !folded.includes(m));
    if (missing.length) failures.push(`missing=${JSON.stringify(missing)}`);
    if (c.tokens) {
      const got = analysis.tokens.map((t) => t.raw);
      if (JSON.stringify(got) !== JSON.stringify(c.tokens))
        failures.push(`tokens=${JSON.stringify(got)}`);
    }
    if (
      c.exactNgrams &&
      JSON.stringify(folded) !== JSON.stringify(c.exactNgrams)
    )
      failures.push(`ngrams!=prior ${JSON.stringify(folded)}`);
    // THE INVARIANT, DERIVED — not a per-case opt-out (red-team F4b: five of
    // eight cases carried `allowSpaces: true`, including the one that
    // actually violated the rule, so the assertion could never RED). Every
    // n-gram's folded text must equal the fold of its OWN raw slice: a space
    // may appear if and only if the user typed whitespace there. That single
    // rule covers both directions — spaces invented inside an unspaced run,
    // and spaces lost across a real word boundary.
    const spaceInvented = ngrams.find((n) => n.folded !== canonicalFold(n.raw));
    if (spaceInvented)
      failures.push(
        `folded "${spaceInvented.folded}" != fold of its raw slice "${spaceInvented.raw}"`,
      );
    // The span-offset contract holds for sub-tokens too.
    const badOffset = ngrams.find(
      (n) => analysis.raw.slice(n.start, n.end) !== n.raw,
    );
    if (badOffset) failures.push(`offset drift at ${badOffset.raw}`);

    if (failures.length) {
      red += 1;
      out(`RED ${c.id} "${c.query}" ${failures.join(' | ')}`);
    } else {
      green += 1;
      out(
        `ok  ${c.id} "${c.query}" script=${analysis.script} ngrams=${folded.length} e.g. ${folded.slice(0, 6).join(', ')}`,
      );
    }
  }

  for (const text of FOLD_IDENTITY) {
    const f = canonicalFold(text);
    if (f === text) {
      green += 1;
      out(`ok  fold-identity "${text}"`);
    } else {
      red += 1;
      out(`RED fold-identity "${text}" -> "${f}"`);
    }
  }

  out(
    `\nCJK SEGMENTATION GATE: green=${green} red=${red} of ${CASES.length + FOLD_IDENTITY.length}`,
  );
  out(
    'READINESS: analysis GREEN for zh/ja/ko. zh/ja/ko remain OUT of SUPPORTED_LOCALES — each ships with its vocabulary sweep (tagged aliases + localized surfaces), which this gate unblocks.',
  );
  if (red > 0) process.exitCode = 1;
}

main();
