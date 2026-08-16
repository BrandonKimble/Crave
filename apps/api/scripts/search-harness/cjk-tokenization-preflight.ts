/**
 * @script-class: probe
 *
 * CJK / VI TOKENIZATION PRE-FLIGHT (concept-graph §9.8).
 *
 * Before spending sweep money on zh/ko/vi, answer one question with data:
 * CAN THE GAZETTEER MATCH WHAT THE SWEEP WOULD BANK? The scanner builds
 * candidate spans from `analysis.ngrams(maxPhraseWords)`, and ngrams are
 * built from TOKENS. Chinese is unspaced, so if the tokenizer emits one
 * token per run of Han characters, then:
 *   - a banked alias equal to the WHOLE query still matches (1 ngram), but
 *   - a concept INSIDE a longer query ("我想吃珍珠奶茶") never matches,
 *     because no ngram boundary exists at the concept edge.
 * That would make a zh sweep buy vocabulary the scanner cannot reach — the
 * "measure before building" law.
 *
 * Prints, per query: the tokens, the ngram surface set, and (for the real
 * corpus) whether any active alias/name folds equal to one of those ngrams.
 *
 * Run: npx ts-node -T scripts/search-harness/cjk-tokenization-preflight.ts
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { bootstrap, out } from './_shared';
import { analyzeQuery } from '../../src/modules/entity-text-search/query-analyzer';
import { PrismaService } from '../../src/prisma/prisma.service';

const CASES: Array<{ q: string; locale: string; note: string }> = [
  // zh — unspaced Han. The whole point of the pre-flight.
  { q: '珍珠奶茶', locale: 'zh-CN', note: 'bubble tea, bare concept' },
  { q: '我想吃珍珠奶茶', locale: 'zh-CN', note: 'concept INSIDE a sentence' },
  { q: '麻婆豆腐', locale: 'zh-CN', note: 'mapo tofu, 4 Han chars' },
  { q: '珍珠 奶茶', locale: 'zh-CN', note: 'segmenter-style spacing' },
  { q: '辣的面条', locale: 'zh-CN', note: 'spicy noodles (modifier+head)' },
  // ko — spaced between eojeol, agglutinative suffixes.
  { q: '김치찌개', locale: 'ko-KR', note: 'kimchi jjigae, one eojeol' },
  { q: '매운 라면', locale: 'ko-KR', note: 'spicy ramen, spaced' },
  { q: '김치찌개 맛집', locale: 'ko-KR', note: 'concept + "good restaurant"' },
  // vi — Latin + tone marks, SPACE-SEPARATED SYLLABLES (a 2-syllable word
  // is two tokens), which is the mirror image of the zh problem.
  { q: 'phở bò', locale: 'vi-VN', note: 'beef pho — 2 tokens, 1 concept' },
  { q: 'bún chả Hà Nội', locale: 'vi-VN', note: '4 tokens, 2 concepts' },
  { q: 'cơm chay', locale: 'vi-VN', note: 'vegetarian rice (accent pair)' },
  { q: 'cơm cháy', locale: 'vi-VN', note: 'crispy rice — the tone twin' },
];

async function main(): Promise<void> {
  const app = await bootstrap();
  try {
    const prisma = app.get(PrismaService);
    let zhSentenceReachable = true;

    for (const { q, locale, note } of CASES) {
      const analysis = analyzeQuery(q, locale, { maxTokens: 48 });
      const tokens = analysis.tokens.map((t) => t.raw);
      const ngrams = Array.from(analysis.ngrams(4)).map((n) => n.folded);
      const uniq = Array.from(new Set(ngrams));

      // Does ANY of those ngram surfaces exist in the corpus today?
      const hits = uniq.length
        ? await prisma.$queryRawUnsafe<Array<{ name: string; via: string }>>(
            `SELECT e.name, 'name' AS via FROM core_entities e
              WHERE e.status='active' AND e.identity_key = ANY($1::text[])
             UNION
             SELECT e.name, 'surface' FROM entity_surface s
               JOIN core_entities e ON e.entity_id=s.entity_id AND e.status='active'
              WHERE s.status='active' AND s.role <> 'display'
                AND s.form_folded = ANY($1::text[])
             LIMIT 5`,
            uniq,
          )
        : [];

      out(`\n"${q}"  [${locale}]  — ${note}`);
      out(`  tokens(${tokens.length}): ${JSON.stringify(tokens)}`);
      out(`  ngrams(${uniq.length}): ${JSON.stringify(uniq.slice(0, 8))}`);
      out(
        `  corpus hits: ${hits.length ? hits.map((h) => `${h.name}[${h.via}]`).join(', ') : 'none'}`,
      );
      out(
        `  script flags: nonLatin=${analysis.isNonLatinScript} nonEnglish=${analysis.isNonEnglish}`,
      );

      // THE VERDICT CASE: a concept embedded in an unspaced zh sentence must
      // produce an ngram equal to the concept, or the sweep is unreachable.
      if (q === '我想吃珍珠奶茶') {
        zhSentenceReachable = uniq.some(
          (n) => n.includes('珍珠奶茶') && n !== q,
        );
        out(
          `  >>> zh sub-concept reachable as its own ngram: ${zhSentenceReachable}`,
        );
      }
    }

    out('\n=== VERDICT ===');
    out(
      zhSentenceReachable
        ? 'zh: concepts inside sentences ARE reachable — sweep is safe to run.'
        : 'zh: BLOCKED — an unspaced sentence yields no concept-sized ngram, so\n' +
            '    banked zh vocabulary would be unmatchable mid-sentence. A CJK\n' +
            '    segmentation step (or character-ngram lane) is required BEFORE\n' +
            '    spending on a zh sweep.',
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
