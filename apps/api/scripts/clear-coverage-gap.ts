/**
 * @script-class: operational
 * @runner: operator (manual)
 *
 * Operational tooling: the last-resort clear for a §10 C4 coverage gap that
 * the DERIVED clear cannot reach. Classed operational, not probe, because it
 * MUTATES lane state — it is the escape hatch, not an investigation.
 */
/**
 * CLEAR A COVERAGE GAP (F456 fallback)
 *
 * The gap is normally released by the fact that set it: a later chronological
 * fetch that confirms overlap AND reaches back to at-or-before the gap's
 * recorded `windowStart` clears it automatically
 * (CollectorSourceRegistryService.clearCoverageGapIfRecovered, called from
 * the chronological worker). That is the honest path and it needs no
 * operator.
 *
 * Two cases the derived clear CANNOT reach, which is why this exists:
 *  1. a gap recorded with no `windowStart` (nothing to compare a reach
 *     against — there is no derivable fact, and inventing one would be a
 *     fabricated clear);
 *  2. a gap the operator has satisfied OUT OF BAND — e.g. a manual archive
 *     sweep back-filled the window — where the recovery is real but no
 *     chronological fetch will ever demonstrate it.
 *
 * This script never asserts the gap is closed on its own authority: it
 * PRINTS the recorded gap, requires `--force` to proceed, and says loudly
 * that the clear is an operator claim. Modeled on resume-lane.ts.
 *
 * Usage:
 *   yarn ts-node apps/api/scripts/clear-coverage-gap.ts <handle> <lane> [--force]
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { NestFactory } from '@nestjs/core';
import { CollectorSourceRegistryService } from '../src/modules/content-processing/reddit-collector/collector-source-registry.service';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

async function clearCoverageGap() {
  console.log('🔍 Starting Coverage-Gap Clear');
  console.log('================================');

  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const [handle, lane] = args.filter((arg) => !arg.startsWith('--'));
  if (!handle || !lane) {
    throw new Error(
      'Usage: yarn ts-node apps/api/scripts/clear-coverage-gap.ts <handle> <lane> [--force]',
    );
  }

  let app;
  try {
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn', 'log'],
    });
    stopCronsForScript(app);

    const prisma = app.get(PrismaService);
    const registry = app.get(CollectorSourceRegistryService);

    const source = await registry.findRedditSourceByHandle(handle);
    if (!source) {
      throw new Error(`No reddit source row found for handle "${handle}"`);
    }

    const before = await prisma.$queryRaw<Array<{ coverage_gap: unknown }>>`
      SELECT state->'coverageGap' AS coverage_gap
      FROM source_collection_lanes
      WHERE source_id = ${source.sourceId}::uuid AND lane = ${lane}
    `;
    if (!before[0]) {
      throw new Error(
        `No lane row for source ${source.sourceId} / lane "${lane}"`,
      );
    }
    console.log('\n📊 Recorded gap:', before[0].coverage_gap ?? '(none)');

    if (before[0].coverage_gap == null) {
      console.log('\n✅ Nothing to clear — this lane has no coverage gap.');
      return;
    }

    if (!force) {
      console.log(
        '\n⚠️  DRY RUN. Clearing a gap is an OPERATOR CLAIM that the window\n' +
          '    above has been re-covered out of band — the system has no fact\n' +
          '    proving it. If a normal fetch can reach back past windowStart,\n' +
          '    do nothing: the derived clear will fire on its own.\n' +
          '    Re-run with --force to clear it anyway.',
      );
      return;
    }

    await prisma.$executeRaw`
      UPDATE source_collection_lanes
      SET state = state - 'coverageGap',
          updated_at = now()
      WHERE source_id = ${source.sourceId}::uuid AND lane = ${lane}
    `;

    const after = await prisma.$queryRaw<Array<{ coverage_gap: unknown }>>`
      SELECT state->'coverageGap' AS coverage_gap
      FROM source_collection_lanes
      WHERE source_id = ${source.sourceId}::uuid AND lane = ${lane}
    `;
    console.log('\n📊 After:', after[0]?.coverage_gap ?? '(none)');
    console.log(
      '\n📝 Cleared by OPERATOR CLAIM, not by a recovery fact. If the window\n' +
        '   was not actually re-covered, the corpus hole is still there.',
    );
  } catch (error) {
    console.error(
      '\n❌ Coverage-gap clear failed:',
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  } finally {
    if (app) {
      await app.close();
      console.log('\n✅ Application closed');
    }
  }
}

if (require.main === module) {
  clearCoverageGap()
    .then(() => {
      console.log('✅ Coverage-gap clear completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Coverage-gap clear failed:', error);
      process.exit(1);
    });
}
