/**
 * Resume-Lane Ops Script (§24.1 Tier 2 operator seam, red team 2026-07-24)
 *
 * CollectorSourceRegistryService.resumeLane had no caller wiring — a lane
 * paused by §24.5 Leg B's cost breach could never be un-paused. Modeled on
 * onboard-subreddit.ts: resolves the source by handle, prints the lane's
 * cost fields before/after, and clears cost_paused.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { NestFactory } from '@nestjs/core';
import { CollectorSourceRegistryService } from '../src/modules/content-processing/reddit-collector/collector-source-registry.service';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

async function resumeLane() {
  console.log('🔍 Starting Lane Resume');
  console.log('================================');

  const [handle, lane] = process.argv.slice(2);
  if (!handle || !lane) {
    throw new Error(
      'Usage: yarn ts-node apps/api/scripts/resume-lane.ts <handle> <lane>',
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

    const before = await prisma.$queryRaw<
      Array<{
        cost_paused: boolean;
        last_cost_micros: bigint | null;
        cost_baseline_micros: number | null;
        cost_baseline_dev_micros: number | null;
      }>
    >`
      SELECT cost_paused, last_cost_micros, cost_baseline_micros,
             cost_baseline_dev_micros
      FROM source_collection_lanes
      WHERE source_id = ${source.sourceId}::uuid AND lane = ${lane}
    `;
    if (!before[0]) {
      throw new Error(
        `No lane row for source ${source.sourceId} / lane "${lane}"`,
      );
    }
    console.log('\n📊 Before:', {
      costPaused: before[0].cost_paused,
      lastCostMicros: before[0].last_cost_micros?.toString() ?? null,
      costBaselineMicros: before[0].cost_baseline_micros,
      costBaselineDevMicros: before[0].cost_baseline_dev_micros,
    });

    await registry.resumeLane(source.sourceId, lane);

    const after = await prisma.$queryRaw<
      Array<{
        cost_paused: boolean;
        last_cost_micros: bigint | null;
        cost_baseline_micros: number | null;
        cost_baseline_dev_micros: number | null;
      }>
    >`
      SELECT cost_paused, last_cost_micros, cost_baseline_micros,
             cost_baseline_dev_micros
      FROM source_collection_lanes
      WHERE source_id = ${source.sourceId}::uuid AND lane = ${lane}
    `;
    console.log('\n📊 After:', {
      costPaused: after[0]?.cost_paused,
      lastCostMicros: after[0]?.last_cost_micros?.toString() ?? null,
      costBaselineMicros: after[0]?.cost_baseline_micros,
      costBaselineDevMicros: after[0]?.cost_baseline_dev_micros,
    });
  } catch (error) {
    console.error(
      '\n❌ Lane resume failed:',
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
  resumeLane()
    .then(() => {
      console.log('✅ Lane resume completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Lane resume failed:', error);
      process.exit(1);
    });
}
