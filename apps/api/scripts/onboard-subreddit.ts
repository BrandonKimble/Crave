/**
 * Subreddit Onboarding Script
 *
 * Creates or updates a subreddit's collection_communities metadata row
 * (collector-owned saturation metadata: location name, active flag) and
 * queues the volume calculation job (real Reddit API posting-rate sampling).
 *
 * Source identity (sources row: platform/handle, anchor place, engine) is
 * operator-managed separately (§10 source-centric collector state); the old
 * market resolution/mapping machinery died in the markets-extermination legs.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load API environment variables (same file the API uses)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { NestFactory } from '@nestjs/core';
import { getQueueToken } from '@nestjs/bull';
import { Queue } from 'bull';
import { Prisma } from '@prisma/client';
import { REDDIT_LANES } from '../src/modules/content-processing/reddit-collector/reddit-collection-adapter';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

type ParsedArgs = {
  subreddit: string;
  locationName: string | null;
  overwrite: boolean;
  skipVolume: boolean;
};

const parseArgs = (): ParsedArgs => {
  const args = process.argv.slice(2);
  const usage =
    'Usage: yarn ts-node apps/api/scripts/onboard-subreddit.ts <subreddit> [--location-name <name>] [--overwrite] [--skip-volume]';

  const positionals: string[] = [];
  let locationName: string | null = null;
  let overwrite = false;
  let skipVolume = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--skip-volume') {
      skipVolume = true;
      continue;
    }
    if (arg === '--overwrite') {
      overwrite = true;
      continue;
    }
    if (arg === '--location-name' || arg.startsWith('--location-name=')) {
      if (arg.includes('=')) {
        locationName = arg.split('=').slice(1).join('=').trim();
      } else {
        locationName = args[index + 1]?.trim() ?? '';
        index += 1;
      }
      if (!locationName) {
        throw new Error('location-name must be a non-empty string.');
      }
      continue;
    }
    positionals.push(arg);
  }

  const subreddit = positionals[0]?.trim() || null;
  if (!subreddit) {
    throw new Error(`Subreddit name is required.\n${usage}`);
  }

  return { subreddit, locationName, overwrite, skipVolume };
};

async function onboardSubreddit() {
  console.log('🔍 Starting Subreddit Onboarding');
  console.log('================================');

  let app;

  try {
    const { subreddit, locationName, overwrite, skipVolume } = parseArgs();

    console.log('\n🏗️  Initializing NestJS application...');
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn', 'log'],
    });
    stopCronsForScript(app);

    const prisma = app.get(PrismaService);

    const formatNumber = (value: number | null | undefined): string =>
      typeof value === 'number' && Number.isFinite(value)
        ? value.toFixed(1)
        : 'n/a';

    const formatDate = (value: Date | null | undefined): string =>
      value ? value.toISOString() : 'Never';

    const runVolumeCalculation = async (): Promise<void> => {
      const volumeQueue = app.get(getQueueToken('volume-tracking')) as Queue;

      console.log('✅ Volume tracking queue retrieved');
      console.log('\n📊 Queuing volume calculation job...');
      console.log(
        '   This will make actual Reddit API calls to sample posting rates',
      );
      console.log('   Sample period: 7 days (as modified)');

      const job = await volumeQueue.add('calculate-volumes', {
        jobId: `manual-volume-calc-${Date.now()}`,
        triggeredBy: 'manual',
        sampleDays: 7,
      });

      console.log(`✅ Volume calculation job queued: ${job.id}`);

      console.log('\n⏳ Waiting for volume calculation to complete...');
      let jobComplete = false;
      let attempts = 0;
      const maxAttempts = 120;

      while (!jobComplete && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const bullJob = await volumeQueue.getJob(job.id);
        if (bullJob && bullJob.finishedOn) {
          jobComplete = true;

          if (bullJob.failedReason) {
            throw new Error(
              `Volume calculation job failed: ${bullJob.failedReason}`,
            );
          }

          const jobResult = bullJob.returnvalue;
          console.log('✅ Volume calculation job completed successfully');
          console.log(
            `   Subreddits processed: ${jobResult.subredditsProcessed}`,
          );
          console.log(`   Processing time: ${jobResult.processingTime}ms`);
        } else if (bullJob && bullJob.processedOn && !bullJob.finishedOn) {
          if (attempts % 10 === 0) {
            console.log(`   🔄 Job is processing... (${attempts}s elapsed)`);
          }
        }

        attempts++;
      }

      if (!jobComplete) {
        throw new Error('Volume calculation job did not complete in time');
      }

      const volumes = await prisma.collectionCommunity.findMany({
        where: { isActive: true },
        orderBy: { communityName: 'asc' },
      });

      console.log('\n🎉 VOLUME CALCULATION COMPLETED');
      console.log('================================');

      for (const volume of volumes) {
        console.log(`\n📋 ${volume.communityName.toUpperCase()}`);
        console.log(
          `   📈 Posts per day: ${formatNumber(volume.avgPostsPerDay)}`,
        );
        console.log(
          `   📊 Safe interval days: ${formatNumber(volume.safeIntervalDays)}`,
        );
        console.log(`   ✅ Active: ${volume.isActive}`);
        console.log(
          `   🕐 Last calculated: ${formatDate(volume.lastCalculated)}`,
        );
        console.log(
          `   🕐 Last processed: ${formatDate(volume.lastProcessed)}`,
        );
        console.log(`   🕐 Updated at: ${volume.updatedAt.toISOString()}`);
      }

      console.log('\n💾 Data has been saved to the database');
      console.log('   The collection scheduler will now use these real values');
    };

    const onlyMissing = !overwrite;

    const existingRows = await prisma.collectionCommunity.findMany({
      where: {
        communityName: { equals: subreddit, mode: 'insensitive' },
      },
      select: { communityName: true, locationName: true },
    });
    const exactMatch = existingRows.find(
      (row) => row.communityName === subreddit,
    );
    const existingRow = exactMatch ?? existingRows[0] ?? null;
    if (existingRows.length > 1 && !exactMatch) {
      console.warn(
        `⚠️  Multiple subreddit rows matched "${subreddit}" (case-insensitive). Using "${existingRow?.communityName}".`,
      );
    }

    console.log('\n🗃️  Saving subreddit record...');
    if (existingRow) {
      const updateData: Prisma.CollectionCommunityUpdateInput = {};
      if (locationName && (!onlyMissing || !existingRow.locationName?.trim())) {
        updateData.locationName = locationName.trim();
      }
      if (Object.keys(updateData).length > 0) {
        await prisma.collectionCommunity.update({
          where: { communityName: existingRow.communityName },
          data: updateData,
        });
      } else {
        console.log('   No updates needed (only-missing default).');
      }
    } else {
      const createData: Prisma.CollectionCommunityCreateInput = {
        communityName: subreddit,
        isActive: true,
      };
      if (locationName) {
        createData.locationName = locationName.trim();
      }
      await prisma.collectionCommunity.create({ data: createData });
    }

    const source = await prisma.source.findUnique({
      where: { platform_handle: { platform: 'reddit', handle: subreddit } },
      select: { sourceId: true, anchorPlaceId: true, engineId: true },
    });
    if (source) {
      console.log(
        `   Source row: ${source.sourceId} (engine ${source.engineId ?? 'none'}, anchor place ${source.anchorPlaceId ?? 'none'})`,
      );
      // Lane provisioning (v2 cadence audit 2026-07-23): the migration-era
      // seed only covered pre-existing sources — a new source needs its
      // declared lanes or the pacer never visits it. Due NOW: the baseline
      // chronological sweep should fire on the next tick, before the
      // archive-end gap grows. Mirrors
      // CollectorSourceRegistryService.ensureLanes (kept inline — the
      // script runs on a bare prisma client, not the Nest graph).
      for (const lane of REDDIT_LANES) {
        await prisma.$executeRaw`
          INSERT INTO source_collection_lanes
            (source_id, lane, enabled, cadence_days, lateness_tolerance_days,
             due_at, state)
          VALUES
            (${source.sourceId}::uuid, ${lane.lane}, true,
             ${lane.defaultCadenceDays}, ${lane.defaultLatenessToleranceDays},
             now(), '{}'::jsonb)
          ON CONFLICT (source_id, lane) DO NOTHING
        `;
      }
      console.log(
        '   Collection lanes ensured (chronological + keyword, due now).',
      );
    } else {
      console.warn(
        '⚠️  No sources row exists for this subreddit yet — collection identity (anchor place, engine) is operator-managed in the sources table (§10).',
      );
    }

    if (!skipVolume) {
      await runVolumeCalculation();
    } else {
      console.log('\n⏭️  Skipping volume calculation (flag enabled).');
    }
  } catch (error) {
    console.error(
      '\n❌ Subreddit onboarding failed:',
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

// Run the script
if (require.main === module) {
  onboardSubreddit()
    .then(() => {
      console.log('✅ Subreddit onboarding completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Subreddit onboarding failed:', error);
      process.exit(1);
    });
}
