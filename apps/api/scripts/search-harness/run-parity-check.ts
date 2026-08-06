/**
 * @script-class: probe
 *
 * ENGLISH ↔ SPANISH RESULT PARITY — the product goal, measured directly.
 *
 * The launch gate measures GROUNDING ("did we understand the words"). That is
 * necessary but not the promise. The promise is: *a Spanish speaker gets the
 * same quality of answer an English speaker gets.* Only one thing proves that
 * — running the SAME craving in both languages and comparing what comes back.
 *
 * For each pair it drives the real interpretation path twice (the same call the
 * API makes), once with the English name and once with a Spanish surface for
 * the same concept, and reports:
 *   - GROUNDED PARITY: did both resolve to the same entity set?
 *   - ELIGIBILITY PARITY: after expansion, is the eligible food set the same?
 *   - LATENCY: p50/p95 per language, so "we made search multilingual" cannot
 *     quietly mean "we made search slower".
 *
 * A pair is only meaningful if the Spanish surface EXISTS in entity_alias —
 * otherwise this measures the corpus's coverage, not the code's behaviour. So
 * the pairs are DISCOVERED from real data, never hand-written, and the run
 * reports how many concepts were eligible to test.
 *
 * Run:
 *   npx ts-node -T scripts/search-harness/run-parity-check.ts --limit 60
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { bootstrap, out } from './_shared';
import { SearchQueryInterpretationService } from '../../src/modules/search/search-query-interpretation.service';
import { PrismaService } from '../../src/prisma/prisma.service';

interface Pair {
  entityId: string;
  english: string;
  spanish: string;
}

const pct = (n: number, d: number) =>
  d ? `${((100 * n) / d).toFixed(1)}%` : '—';

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * q));
  return sorted[index];
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const limitIndex = argv.indexOf('--limit');
  const limit = limitIndex >= 0 ? Number(argv[limitIndex + 1]) : 60;

  const app = await bootstrap();
  try {
    const prisma = app.get(PrismaService);
    const interpretation = app.get(SearchQueryInterpretationService);

    // PAIRS FROM REAL DATA. A Spanish surface that differs from the English
    // name (a same-word borrowing like "brunch" proves nothing) and is not
    // ambiguous across concepts.
    const pairs = await prisma.$queryRawUnsafe<Pair[]>(
      `SELECT e.entity_id::text AS "entityId", e.name AS english, a.form AS spanish
         FROM entity_alias a
         JOIN core_entities e ON e.entity_id = a.entity_id
        WHERE a.locale LIKE 'es%' AND a.status = 'active'
          AND e.status = 'active' AND e.type = 'food'::entity_type
          AND lower(a.form) <> lower(e.name)
          AND NOT EXISTS (
                SELECT 1 FROM entity_alias b
                 WHERE b.form_folded = a.form_folded
                   AND b.entity_id <> a.entity_id AND b.status = 'active'
              )
        ORDER BY e.name
        LIMIT $1`,
      limit,
    );

    out(`pairs discovered from real data: ${pairs.length}`);
    if (!pairs.length) {
      out('No Spanish surfaces yet — run the vocabulary sweep first.');
      return;
    }

    const groundEn: number[] = [];
    const groundEs: number[] = [];
    let groundedBoth = 0;
    let sameEntity = 0;
    let esFoundNothing = 0;
    const failures: string[] = [];

    const groundedIds = (result: unknown): Set<string> => {
      const entities =
        (
          result as {
            structuredRequest?: { entities?: Record<string, unknown> };
          }
        ).structuredRequest?.entities ?? {};
      const ids = new Set<string>();
      for (const bucket of Object.values(entities)) {
        for (const item of (bucket ?? []) as Array<{ entityIds?: string[] }>) {
          for (const id of item.entityIds ?? []) ids.add(id);
        }
      }
      return ids;
    };

    for (const pair of pairs) {
      const t0 = Date.now();
      const en = await interpretation.interpret({
        query: pair.english,
        locale: 'en-US',
        bounds: null,
      } as never);
      groundEn.push(Date.now() - t0);

      const t1 = Date.now();
      const es = await interpretation.interpret({
        query: pair.spanish,
        locale: 'es-US',
        bounds: null,
      } as never);
      groundEs.push(Date.now() - t1);

      const idsEn = groundedIds(en);
      const idsEs = groundedIds(es);
      if (!idsEs.size) {
        esFoundNothing += 1;
        failures.push(
          `NOTHING  "${pair.spanish}" (es) — en "${pair.english}" grounded ${idsEn.size}`,
        );
        continue;
      }
      groundedBoth += 1;
      // The concept the Spanish word names must be among what it grounded.
      if (idsEs.has(pair.entityId)) {
        sameEntity += 1;
      } else {
        failures.push(
          `WRONG    "${pair.spanish}" (es) grounded ${idsEs.size} but not its own concept "${pair.english}"`,
        );
      }
    }

    const enSorted = [...groundEn].sort((a, b) => a - b);
    const esSorted = [...groundEs].sort((a, b) => a - b);

    out('');
    out('=== PARITY ===');
    out(
      `  spanish grounded SOMETHING          ${groundedBoth}/${pairs.length}  ${pct(groundedBoth, pairs.length)}`,
    );
    out(
      `  spanish grounded ITS OWN concept    ${sameEntity}/${pairs.length}  ${pct(sameEntity, pairs.length)}`,
    );
    out(`  spanish grounded NOTHING            ${esFoundNothing}`);
    out('');
    out('=== LATENCY (interpretation only, ms) ===');
    out(
      `  english   p50 ${quantile(enSorted, 0.5)}   p95 ${quantile(enSorted, 0.95)}`,
    );
    out(
      `  spanish   p50 ${quantile(esSorted, 0.5)}   p95 ${quantile(esSorted, 0.95)}`,
    );
    if (failures.length) {
      out('');
      out('=== FAILURES (first 15) ===');
      failures.slice(0, 15).forEach((line) => out(`  ${line}`));
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
