/**
 * @script-class: probe
 * @finding: BANKED — the collection-locale A0 red team's F1/F2/F3/F4/F9 probes,
 * as one runnable instrument. See the "corrected principle" trail:
 *
 *   A source's configured language is READER CONTEXT — it decides which
 *   registry slices ingestion consults — never WORD IDENTITY. Extraction
 *   observes strings without knowing their language: its surfaces are 'und'.
 *   Only the vocabulary GENERATOR (asked per-language questions) and the
 *   JUDGE produce language-knowledge; only their rows carry language tags.
 *
 * RESULT, 2026-08-11, live dev corpus (before -> after the correction):
 *   F1  'bún đậu mắm tôm'  en@1.00 (surface) -> null    (never `en` again)
 *       'phở bò'           es@0.20 (detector) -> vi@1.00 (surface)
 *       'camarones'        null -> es@1.00 (surface)
 *   F2  extraction rows carrying a language   10,670 -> 0
 *   F3  'cat' vi@1.00, 'pan' es@1.00, 'crema' vi@1.00 (each one generator
 *       row beating an explicit en-US prior) -> all three en-US@0.50
 *   F4  gold-corpus locale disagreements     es 2 -> 2, vi 8 -> 7
 *       (the members changed completely; what remains is NOT this oracle —
 *       'tacos with cheese' really is English text in the es corpus, 'tuna'
 *       is banked by two English entities and is a word in both languages,
 *       and all six vi ones are tinyld answering `es` at accuracy 1.0 for
 *       plainly Vietnamese sentences, which is a detector-MODEL problem)
 *   F9  'тако tacos' from an es-MX phone      es@0.11 (detector) -> null
 *       (bare 'тако' was already null — tinyld ranks nothing for it under
 *       the restricted candidate set, so the code-switched query is the
 *       case that actually reproduces the leak)
 *
 * READ-ONLY. Bootstraps the real AppModule so the oracle index, the analyzer
 * and the launch corpora are exactly the ones the server runs.
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { stopCronsForScript } from '../../src/shared/utils/stop-crons';
import { SurfaceLocaleIndexService } from '../../src/modules/entity-text-search/surface-locale-index.service';
import {
  analyzeQuery,
  type DetectedLocale,
} from '../../src/modules/entity-text-search/query-analyzer';
import { stripGenericTokens } from '../../src/shared/utils/generic-token-handling';

interface GoldEntry {
  id: string;
  query: string;
  locale?: string;
}
interface GoldCorpus {
  locale: string;
  entries: GoldEntry[];
}

const show = (d: DetectedLocale | null): string =>
  d ? `${d.tag}@${d.confidence.toFixed(2)} (${d.source})` : 'null';

const base = (tag: string | null | undefined): string | null =>
  tag ? tag.trim().toLowerCase().split(/[-_]/)[0] || null : null;

/** F1/F3/F9 — the exact query table the red team measured. Each row states
 *  what the CORRECTED principle requires, so the probe can show red. */
const QUERIES: Array<{
  query: string;
  requestLocale: string | null;
  must: string;
  /** base languages this query may NEVER detect as. */
  forbidden: string[];
}> = [
  // F1 — the write-flip's signature failure: a Vietnamese noun phrase read
  // as English because extraction banked its words under `en`.
  {
    query: 'bún đậu mắm tôm',
    requestLocale: null,
    must: 'vi or null',
    forbidden: ['en'],
  },
  {
    query: 'cơm tấm',
    requestLocale: null,
    must: 'vi or null',
    forbidden: ['en'],
  },
  {
    query: 'phở bò',
    requestLocale: null,
    must: 'vi or null',
    forbidden: ['en'],
  },
  // The es control — a word the GENERATOR banked, which must keep working.
  { query: 'camarones', requestLocale: null, must: 'es', forbidden: ['en'] },
  { query: 'lengua', requestLocale: null, must: 'es or null', forbidden: [] },
  // F3 — junk words. Plain English food words that a single extraction row
  // was flipping to a foreign language at confidence 1.0.
  {
    query: 'cat',
    requestLocale: 'en-US',
    must: 'en (the prior)',
    forbidden: ['es', 'vi'],
  },
  {
    query: 'pan',
    requestLocale: 'en-US',
    must: 'en (the prior)',
    forbidden: ['es', 'vi'],
  },
  {
    query: 'crema',
    requestLocale: 'en-US',
    must: 'en (the prior)',
    forbidden: ['vi'],
  },
  {
    query: 'top',
    requestLocale: 'en-US',
    must: 'en (the prior)',
    forbidden: ['vi'],
  },
  {
    query: 'phils ice house',
    requestLocale: 'en-US',
    must: 'en (the prior)',
    forbidden: ['es', 'vi'],
  },
  // F9 — a Cyrillic query may not be forced through a Latin-only detector.
  // The code-switched form is the one that reproduces: tinyld ranks
  // 'тако tacos' es@0.11, and bare 'тако' ranks nothing at all.
  {
    query: 'тако tacos',
    requestLocale: 'es-MX',
    must: 'null',
    forbidden: ['es', 'en', 'vi'],
  },
  {
    query: 'тако',
    requestLocale: 'es-MX',
    must: 'null',
    forbidden: ['es', 'en', 'vi'],
  },
  // The script-pin controls, which must not move.
  {
    query: '麻辣牛肉面',
    requestLocale: 'es-MX',
    must: 'zh',
    forbidden: ['es', 'en'],
  },
  { query: 'ラーメン', requestLocale: 'es-MX', must: 'ja', forbidden: ['es'] },
];

/** F5 — genericness is a claim about a language. */
const GENERIC_CASES: Array<{
  term: string;
  locale: string | null;
  must: string;
}> = [
  {
    term: 'top',
    locale: 'vi',
    must: 'survives (vi has no authored stop-list)',
  },
  { term: 'top', locale: 'en', must: 'generic-only' },
  { term: 'best tacos', locale: 'en', must: "strips to 'tacos'" },
  { term: 'best tacos', locale: null, must: "strips to 'tacos' (und => en)" },
  { term: 'mejores tacos', locale: 'es', must: 'survives whole' },
];

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  stopCronsForScript(app);
  const prisma = app.get(PrismaService);
  const index = app.get(SurfaceLocaleIndexService);
  await index.refresh();
  const oracle = index.oracle;
  let red = 0;

  console.log('\n=== ORACLE INDEX ===');
  console.log(index.stats());

  console.log('\n=== F2 — surface rows carrying a LANGUAGE, by provenance ===');
  const byProvenance = await prisma.$queryRaw<
    Array<{ source: string; locale: string; n: bigint }>
  >`
    SELECT source, lower(locale) AS locale, count(*)::bigint AS n
      FROM entity_surface
     WHERE lower(locale) <> 'und'
     GROUP BY 1, 2
     ORDER BY 3 DESC`;
  for (const row of byProvenance) {
    console.log(`  ${row.source.padEnd(22)} ${row.locale.padEnd(8)} ${row.n}`);
  }
  const extractionTagged = byProvenance
    .filter((r) => r.source === 'extraction')
    .reduce((sum, r) => sum + Number(r.n), 0);
  console.log(
    `  -> extraction rows tagged with a language: ${extractionTagged}`,
  );
  if (extractionTagged > 0) {
    console.log(
      '     RED: extraction observes strings, it does not know their language.',
    );
    red += 1;
  }

  console.log('\n=== F1/F3/F9 — query detection ===');
  for (const probe of QUERIES) {
    const detected = analyzeQuery(probe.query, probe.requestLocale, {
      surfaceLocales: oracle,
    }).detectedLocale;
    const got = base(detected?.tag ?? null);
    const bad = got != null && probe.forbidden.includes(got);
    if (bad) red += 1;
    console.log(
      `  ${bad ? 'RED ' : 'ok  '} ${probe.query.padEnd(18)} prior=${String(
        probe.requestLocale,
      ).padEnd(6)} -> ${show(detected).padEnd(24)} must be ${probe.must}`,
    );
  }

  console.log('\n=== F4 — gold-corpus locale disagreements ===');
  for (const lang of ['es', 'vi']) {
    const corpusPath = path.join(__dirname, 'gold-corpus', `${lang}.json`);
    if (!fs.existsSync(corpusPath)) continue;
    const corpus = JSON.parse(
      fs.readFileSync(corpusPath, 'utf8'),
    ) as GoldCorpus;
    const disagreements: string[] = [];
    for (const entry of corpus.entries) {
      const locale = entry.locale ?? corpus.locale;
      const detected = analyzeQuery(entry.query, locale, {
        surfaceLocales: oracle,
      }).detectedLocale;
      const got = base(detected?.tag ?? null);
      // A DISAGREEMENT is the detector naming a DIFFERENT language than the
      // one the query is certified to be in. `null` is not a disagreement —
      // it is the honest answer on a near-undecidable short string.
      if (got != null && got !== base(corpus.locale)) {
        disagreements.push(`${entry.id} '${entry.query}' -> ${show(detected)}`);
      }
    }
    console.log(
      `  ${lang}: ${disagreements.length} of ${corpus.entries.length}`,
    );
    for (const line of disagreements.slice(0, 15)) console.log(`     ${line}`);
    if (disagreements.length > 0) red += 1;
  }

  console.log('\n=== F5 — stripGenericTokens is per-language ===');
  for (const item of GENERIC_CASES) {
    const stripped = stripGenericTokens(item.term, item.locale);
    console.log(
      `  '${item.term}' [${item.locale ?? 'und'}] -> text='${stripped.text}' genericOnly=${
        stripped.isGenericOnly
      }   must ${item.must}`,
    );
  }

  console.log(
    `\n=== ${red === 0 ? 'GREEN' : `RED (${red} finding groups)`} ===\n`,
  );
  await app.close();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
