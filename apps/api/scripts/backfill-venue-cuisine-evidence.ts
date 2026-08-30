/**
 * @script-class: operational
 *
 * D5 VENUE-CUISINE LANES BACKFILL (2026-08-30): run the two deterministic
 * venue-cuisine evidence lanes (VenueCuisineEvidenceService — 'dish_set'
 * dish-set implications + 'venue_name' name signal) over the whole corpus
 * once, ahead of their nightly-convergence phase. DRY-RUN BY DEFAULT:
 * prints the full diff report (desired/inserted/deleted counts, the
 * dish-set share distribution, per-cuisine name-lane counts) and writes
 * NOTHING. `--apply` performs the diffed writes and re-projects
 * restaurant_attributes for every changed place through THE one writer.
 *
 *   yarn workspace api ts-node scripts/backfill-venue-cuisine-evidence.ts [--apply]
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { PrismaClient } from '@prisma/client';
import {
  VenueCuisineEvidenceService,
  VenueCuisineEvidenceReport,
} from '../src/modules/restaurant-enrichment/venue-cuisine-evidence.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { LoggerService } from '../src/shared';
import { PRODUCT_VENUE_KIND_ATTRIBUTE_NAMES } from '../src/modules/restaurant-enrichment/google-place-type-attributes';

const out = (m = '') => process.stdout.write(`${m}\n`);

// The service needs only prisma + a logger; a bare client keeps the script
// runnable against any DATABASE_URL without booting the Nest app (no crons,
// no queues, no LLM gateway).
const consoleLogger = {
  setContext() {
    return consoleLogger;
  },
  info(message: string, meta?: Record<string, unknown>) {
    out(`[info] ${message} ${meta ? JSON.stringify(meta) : ''}`);
  },
  warn(message: string, meta?: Record<string, unknown>) {
    out(`[warn] ${message} ${meta ? JSON.stringify(meta) : ''}`);
  },
  error(message: string) {
    out(`[error] ${message}`);
  },
  debug() {
    /* quiet */
  },
} as unknown as LoggerService;

async function printNameLaneVerdicts(
  prisma: PrismaClient,
  desiredRows: Array<{ placeId: string; attributeId: string }>,
): Promise<void> {
  if (!desiredRows.length) return;
  // Peek: which name-lane rows would the PROJECTION admit vs outvote?
  // (Mirrors place-attribute-projection.ts semantics for report purposes
  // only — the projection stays the one authority.) Works on the DESIRED
  // pairs, so the dry run shows the verdicts without writing anything.
  const placeIds = desiredRows.map((row) => row.placeId);
  const attributeIds = desiredRows.map((row) => row.attributeId);
  const productKinds = [...PRODUCT_VENUE_KIND_ATTRIBUTE_NAMES];
  const rows = await prisma.$queryRaw<
    Array<{ place: string; cuisine: string; verdict: string }>
  >`
    WITH name_rows AS (
      SELECT rid AS restaurant_id, aid AS attribute_id
        FROM unnest(${placeIds}::uuid[], ${attributeIds}::uuid[]) AS d(rid, aid)
    )
    SELECT p.name AS place, c.name AS cuisine,
           CASE
             WHEN EXISTS (SELECT 1 FROM core_restaurant_attribute_evidence x
                           WHERE x.restaurant_id = n.restaurant_id
                             AND x.attribute_id = n.attribute_id
                             AND x.source_class <> 'venue_name')
               THEN 'projected (corroborated)'
             WHEN EXISTS (SELECT 1 FROM core_restaurant_attribute_evidence o
                           JOIN core_entities oe ON oe.entity_id = o.attribute_id
                            AND oe.facet = 'cuisine'
                           WHERE o.restaurant_id = n.restaurant_id
                             AND o.source_class <> 'venue_name')
               THEN 'OUTVOTED (contrary cuisine evidence)'
             WHEN EXISTS (SELECT 1 FROM core_restaurant_attribute_evidence k
                           JOIN core_entities ke ON ke.entity_id = k.attribute_id
                            AND ke.facet = 'venue_kind'
                           WHERE k.restaurant_id = n.restaurant_id
                             AND k.source_class <> 'venue_name'
                             AND ke.name = ANY(${productKinds}::text[]))
               THEN 'OUTVOTED (product-counter venue)'
             ELSE 'projected (unopposed)'
           END AS verdict
      FROM name_rows n
      JOIN core_entities p ON p.entity_id = n.restaurant_id
      JOIN core_entities c ON c.entity_id = n.attribute_id
     ORDER BY 3, 1`;
  for (const row of rows) {
    out(`  ${row.verdict.padEnd(38)} ${row.place} -> ${row.cuisine}`);
  }
}

function printReport(report: VenueCuisineEvidenceReport): void {
  out(`mode: ${report.dryRun ? 'DRY RUN (no writes)' : 'APPLY'}`);
  out('');
  out('NAME LANE (venue_name):');
  out(`  matched (place, cuisine) pairs: ${report.nameLane.matchedPairs}`);
  out(
    `  skipped non-food venues:        ${report.nameLane.skippedNonFoodVenues}`,
  );
  out(`  desired evidence rows:          ${report.nameLane.desired}`);
  out(
    `  would insert / delete:          ${report.nameLane.inserted} / ${report.nameLane.deleted}`,
  );
  out(`  places changed:                 ${report.nameLane.placesChanged}`);
  out('');
  out('DISH-SET LANE (dish_set):');
  out(
    `  restaurants with cuisine-attributed dishes: ${report.dishSetLane.restaurantsWithCuisineKnowledge}`,
  );
  out(`  desired evidence rows:          ${report.dishSetLane.desired}`);
  out(
    `  would insert / delete:          ${report.dishSetLane.inserted} / ${report.dishSetLane.deleted}`,
  );
  out(`  places changed:                 ${report.dishSetLane.placesChanged}`);
  out('  share distribution (bucket -> candidate pairs):');
  const buckets = Object.keys(report.dishSetLane.shareDistribution).sort();
  if (!buckets.length) {
    out(
      '    (empty — knowledge_cuisines unpopulated; thresholds await the v2 backfill measurement)',
    );
  }
  for (const bucket of buckets) {
    out(`    ${bucket}: ${report.dishSetLane.shareDistribution[bucket]}`);
  }
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const service = new VenueCuisineEvidenceService(
      prisma as unknown as PrismaService,
      consoleLogger,
    );
    const report = await service.reconcile({ dryRun: !apply });
    printReport(report);
    out('');
    out('Projection verdicts for the name-lane rows (desired set):');
    await printNameLaneVerdicts(prisma, report.nameLane.desiredRows);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});
