/**
 * @script-class: operational
 *
 * D5 DISH-SET LANE BACKFILL (2026-08-30): run the deterministic dish-set
 * venue-cuisine evidence lane (VenueCuisineEvidenceService — 'dish_set')
 * over the whole corpus once, ahead of its nightly-convergence phase.
 * DRY-RUN BY DEFAULT: prints the full diff report (desired/inserted/
 * deleted counts, the dish-set share distribution) and writes NOTHING.
 * `--apply` performs the diffed writes and re-projects
 * restaurant_attributes for every changed place through THE one writer.
 *
 * (The former 'venue_name' lane was deleted 2026-08-30 — the venue name
 * is now an input of the LLM venue-facts judge; its recompute rides the
 * cuisine-extraction input-fingerprint gate, not this script.)
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

function printReport(report: VenueCuisineEvidenceReport): void {
  out(`mode: ${report.dryRun ? 'DRY RUN (no writes)' : 'APPLY'}`);
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
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});
