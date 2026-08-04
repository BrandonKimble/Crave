/**
 * @script-class: probe
 * @finding: BANKED 2026-08-03 — see the "RECORDED RESULT" block at the
 * bottom of this header. Re-runnable against the dev mirror.
 *
 * WHAT THIS PROBES (multilingual plan N1 + R5-3 + M4):
 *  1. N1 FOLD SYMMETRY — the plan's named unreachable entities
 *     (Despaña, Phở Hoài, Harry’s-with-curly-apostrophe, "phils ice
 *     house") must ground through the REAL scanForKnownEntityGroups.
 *  2. NO REGRESSION — a 50-query sample of plain English names must
 *     produce span sets that are identical or strictly better.
 *  3. R5-3 NEGATION — "ramen sin cerdo" / "tacos without cheese" must
 *     ground the head and RECORD the negated span, never invert it.
 *
 * READ-ONLY. Runs the production code path via the real Nest context.
 * The dense tier is exercised separately (it costs a real embedding call);
 * pass PROBE_DENSE=1 to include the single "pulpo" probe.
 *
 * RECORDED RESULT (2026-08-03, dev mirror crave_search):
 *   N1: all six forms ground at the FULL span — "phils ice house" →
 *   Phil's Ice House + Phils Ice House, "pho hoai" → Phở Hoài,
 *   "harry's bagels" AND "harry’s bagels" → Harry’s bagels, "despana"
 *   AND "despaña" → Despaña. BEFORE this change the old rule (lowercased
 *   raw candidates vs lower(name)/lower(aliases), tokenizer without the
 *   curly apostrophe) produced NO full-span match for either apostrophe
 *   form of "harry's bagels", and reached only the ASCII twin "Phils Ice
 *   House" for "phils ice house"; despana/pho hoai already worked via
 *   legacy alias rows.
 *   NO-REGRESSION: 50/50 plain English names still ground.
 *   NEGATION: "ramen sin cerdo" → food:ramen, excluded[cerdo cue sin/es];
 *   "tacos without cheese" → food:tacos, excluded[cheese cue without/en];
 *   "pizza senza glutine" → food:pizza, excluded[glutine cue senza/it].
 *   Dense was NOT invoked on any negated span.
 *   DENSE (PROBE_DENSE=1, one real embedding call): "pulpo" @ es-ES →
 *   octopus (food). The locale prefix is worth 0.023 cosine on its own
 *   (`[es-ES] pulpo`→octopus 0.753 vs bare `pulpo`→octopus 0.730).
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { EntityType } from '@prisma/client';
import { bootstrap, out } from './_shared';
import { EntityTextSearchService } from '../../src/modules/entity-text-search/entity-text-search.service';
import { SearchQueryInterpretationService } from '../../src/modules/search/search-query-interpretation.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const TYPES: EntityType[] = [
  'food',
  'ingredient',
  'food_attribute',
  'restaurant_attribute',
  'restaurant',
] as EntityType[];

const N1_QUERIES = [
  'phils ice house',
  'pho hoai',
  "harry's bagels",
  'harry’s bagels',
  'despana',
  'despaña',
];

const NEGATION_QUERIES = [
  { query: 'ramen sin cerdo', locale: 'es-MX' },
  { query: 'tacos without cheese', locale: 'en-US' },
  { query: 'pizza senza glutine', locale: 'it-IT' },
];

async function main(): Promise<void> {
  const app = await bootstrap();
  const scan = app.get(EntityTextSearchService);
  const prisma = app.get(PrismaService);
  const interpretation = app.get(SearchQueryInterpretationService);

  const fmt = (
    groups: Awaited<ReturnType<typeof scan.scanForKnownEntityGroups>>,
  ) =>
    groups.length
      ? groups
          .map(
            (g) =>
              `[${g.text}→${g.entities
                .map((e) => `${e.name}(${e.type})`)
                .join('|')}]`,
          )
          .join(' ')
      : '(ungrounded)';

  out('=== N1 FOLD SYMMETRY ===');
  for (const q of N1_QUERIES) {
    const groups = await scan.scanForKnownEntityGroups(q, TYPES);
    out(`${q.padEnd(18)} ${fmt(groups)}`);
  }

  out('');
  out('=== NO-REGRESSION SAMPLE (50 plain English names) ===');
  const sample = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM core_entities
      WHERE status = 'active' AND name ~ '^[A-Za-z0-9 ]+$'
        AND type IN ('food','restaurant','food_attribute')
      ORDER BY md5(name) LIMIT 50`,
  );
  let grounded = 0;
  const misses: string[] = [];
  for (const row of sample) {
    const groups = await scan.scanForKnownEntityGroups(row.name, TYPES);
    if (groups.length) grounded += 1;
    else misses.push(row.name);
  }
  out(`grounded ${grounded}/${sample.length}`);
  if (misses.length) out(`misses: ${misses.join(', ')}`);

  out('');
  out('=== R5-3 NEGATION GATE ===');
  for (const c of NEGATION_QUERIES) {
    const result = await interpretation.interpret({
      query: c.query,
      locale: c.locale,
    } as never);
    const groups = result.structuredRequest.entities;
    const listed = Object.entries(groups)
      .flatMap(([k, v]) =>
        (v ?? []).map(
          (e: { normalizedName: string }) => `${k}:${e.normalizedName}`,
        ),
      )
      .join(' ');
    out(
      `${c.query.padEnd(22)} grounded=[${listed}] excluded=[${(
        result.excludedSpans ?? []
      )
        .map((e) => `${e.text}(cue ${e.cue}/${e.cueLocale})`)
        .join(', ')}] analysis=${JSON.stringify(result.queryAnalysis)}`,
    );
  }

  if (process.env.PROBE_DENSE === '1') {
    out('');
    out('=== M4 DENSE TIER (ONE real embedding call) ===');
    const result = await interpretation.interpret({
      query: 'pulpo',
      locale: 'es-ES',
    } as never);
    out(JSON.stringify(result.structuredRequest.entities));
    out(`analysis=${JSON.stringify(result.queryAnalysis)}`);
    out(`unresolved=${JSON.stringify(result.unresolved)}`);
  }

  await app.close();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
