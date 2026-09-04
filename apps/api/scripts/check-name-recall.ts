/**
 * @script-class: invariant-check
 *
 * THE COURT SEES THE WHOLE ROSTER — name-recall census (recall-scope
 * rederivation, 2026-09-04). Every live (active or pending) place / item /
 * ingredient / attribute entity must be recallable through the judge's own
 * entry point (`retrieveCandidates`, adoption scope) by ITS OWN NAME —
 * whether or not it has banked a single surface row. After the 2026-09-02
 * alias clean slate, 7,024 of 8,448 active staging places carried NO
 * recallable surface; the name arms of the lexical lane are the only thing
 * standing between such a row and total invisibility to the judge, and
 * nothing exercised them against a real database.
 *
 * Sample: every surface-less live row first (the population whose only
 * recall path is the name arm), then a deterministic spread of the rest,
 * per type. Exit 1 on any miss, printing examples. A census with nothing
 * to census seeds its own fixture (scripts/lib/census-fixture.ts).
 *
 * Wired as invariant `recall.every-live-entity-is-recallable-by-its-own-name`
 * — the registry deletes the name arm (and, separately, narrows the
 * adoption status scope) and requires THIS check to fail.
 *
 *   yarn workspace api ts-node -T scripts/check-name-recall.ts [--per-type=60]
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { ensureNameRecallCensusFixture } from './lib/census-fixture';
import { EntityTextSearchService } from '../src/modules/entity-text-search/entity-text-search.service';

const TYPES = [
  'place',
  'item',
  'ingredient',
  'item_attribute',
  'place_attribute',
] as const;

const silentLogger = {
  setContext: () => silentLogger,
  info: () => undefined,
  warn: (message: string, meta?: unknown) =>
    console.error(`  WARN ${message} ${JSON.stringify(meta ?? {})}`),
  error: (message: string, meta?: unknown) =>
    console.error(`  ERROR ${message} ${JSON.stringify(meta ?? {})}`),
  debug: () => undefined,
} as never;

async function main(): Promise<void> {
  const perTypeArg = process.argv.find((a) => a.startsWith('--per-type='));
  const perType = perTypeArg ? Number(perTypeArg.split('=')[1]) : 60;
  const prisma = new PrismaClient();
  try {
    await ensureNameRecallCensusFixture(prisma);
    // No embedding provider (dense lane off), no denials (a court-denied
    // name is deliberately unrecallable and is not this census's question).
    const search = new EntityTextSearchService(
      prisma as never,
      {} as never,
      silentLogger,
      {
        deniedNamePairs: () => Promise.resolve([]),
        isDeniedName: () => Promise.resolve(false),
      } as never,
    );

    const rows: Array<{
      entity_id: string;
      name: string;
      type: (typeof TYPES)[number];
      status: string;
      surfaceless: boolean;
    }> = [];
    for (const type of TYPES) {
      rows.push(
        ...(await prisma.$queryRawUnsafe<typeof rows>(
          `SELECT * FROM (
             SELECT e.entity_id, e.name, e.type::text AS type, e.status::text AS status,
                    NOT EXISTS (
                      SELECT 1 FROM entity_surface s
                       WHERE s.entity_id = e.entity_id
                         AND s.status = 'active' AND s.role <> 'display'
                    ) AS surfaceless
               FROM core_entities e
              WHERE e.type = $1::entity_type
                AND e.status IN ('active', 'pending')
                AND length(e.name) BETWEEN 1 AND 200
              ORDER BY surfaceless DESC, e.entity_id
              LIMIT $2
           ) sampled`,
          type,
          perType,
        )),
      );
    }
    if (!rows.length) {
      console.error('name-recall census: NO live rows to census — vacuous');
      process.exitCode = 1;
      return;
    }

    const misses: typeof rows = [];
    for (const row of rows) {
      const candidates = await search.retrieveCandidates(
        row.name,
        [row.type as never],
        50,
        {
          denseMode: 'none',
          // The judge's scope: live rows, no rehearsal run, no metro.
          adoption: { rehearsalRunId: null, metro: null },
        },
      );
      if (!candidates.some((c) => c.entityId === row.entity_id)) {
        misses.push(row);
      }
    }
    const surfaceless = rows.filter((r) => r.surfaceless).length;
    const pending = rows.filter((r) => r.status === 'pending').length;
    console.log(
      `name-recall census: ${rows.length} live rows probed by their own name ` +
        `(${surfaceless} surface-less, ${pending} pending), ${misses.length} unrecallable`,
    );
    if (misses.length) {
      for (const row of misses.slice(0, 12)) {
        console.error(
          `  UNRECALLABLE ${row.type}/${row.status} ${row.entity_id} ` +
            `name=${JSON.stringify(row.name)} surfaceless=${row.surfaceless}`,
        );
      }
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main();
