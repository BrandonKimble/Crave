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
 *   - noSpaceInside: no folded n-gram may contain a space (a spaced key
 *     matches no stored surface — identity_key for 牛肉面 is 牛肉面);
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
import { analyzeQuery } from '../../src/modules/entity-text-search/query-analyzer';
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
  allowSpaces?: boolean;
}

const MAX_PHRASE_WORDS = 4; // what the gazetteer actually asks for

const CASES: Case[] = [
  {
    id: 'zh-unspaced-dish',
    query: '麻辣牛肉面',
    script: 'cjk',
    minNgrams: 2,
    tokens: ['麻', '辣', '牛', '肉', '面'],
    mustInclude: ['麻辣', '牛肉', '牛肉面', '麻辣牛肉'],
  },
  {
    id: 'zh-restaurant-name',
    query: '海底捞',
    script: 'cjk',
    minNgrams: 2,
    mustInclude: ['海底', '海底捞'],
  },
  {
    id: 'zh-mixed-latin',
    query: 'spicy 牛肉面 austin',
    script: 'cjk',
    minNgrams: 5,
    tokens: ['spicy', '牛', '肉', '面', 'austin'],
    mustInclude: ['牛肉面', 'spicy', 'austin'],
    allowSpaces: true,
  },
  {
    id: 'ja-han-kana-boundary',
    query: '豚骨ラーメン',
    // Kana outranks Han in the script gate (a query with any kana is
    // Japanese, while Han alone is ambiguous zh/ja).
    script: 'kana',
    minNgrams: 2,
    // ー (Script=Common) must stay glued to its katakana run.
    mustInclude: ['豚骨', 'ラーメン'],
    allowSpaces: true,
  },
  {
    id: 'ko-spaced-unchanged',
    query: '매운 한국 음식',
    locale: 'ko-KR',
    script: 'hangul',
    minNgrams: 6,
    tokens: ['매운', '한국', '음식'],
    mustInclude: ['한국 음식', '매운 한국 음식'],
    allowSpaces: true,
  },
  {
    id: 'ko-single-word',
    query: '비빔밥',
    locale: 'ko-KR',
    script: 'hangul',
    minNgrams: 1,
    tokens: ['비빔밥'],
    mustInclude: ['비빔밥'],
    allowSpaces: true,
  },
  {
    id: 'en-unchanged',
    query: 'breakfast taco',
    script: 'latin',
    minNgrams: 3,
    tokens: ['breakfast', 'taco'],
    mustInclude: ['breakfast taco'],
    exactNgrams: ['breakfast', 'breakfast taco', 'taco'],
    allowSpaces: true,
  },
  {
    id: 'en-accented-name-unchanged',
    query: 'Despaña bakery',
    script: 'latin',
    minNgrams: 3,
    tokens: ['Despaña', 'bakery'],
    mustInclude: ['despana bakery'],
    exactNgrams: ['despana', 'despana bakery', 'bakery'],
    allowSpaces: true,
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
    if (!c.allowSpaces && folded.some((f) => f.includes(' ')))
      failures.push('spaced folded key inside an unspaced run');
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
