/**
 * Subreddit Onboarding Script
 *
 * Creates or updates a subreddit's collection_communities metadata row
 * (collector-owned metadata: location name, active flag) and, when the
 * operator-managed sources row exists, provisions its collection lanes
 * (due NOW — the baseline chronological sweep fires on the next pacer
 * tick). Posting rates are measured by the pacer itself from collected
 * documents (loss-horizon floor); the old volume-tracking sampling job is
 * dead.
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
import { Prisma } from '@prisma/client';
import { CollectorSourceRegistryService } from '../src/modules/content-processing/reddit-collector/collector-source-registry.service';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

type ParsedArgs = {
  subreddit: string;
  locationName: string | null;
  overwrite: boolean;
};

const parseArgs = (): ParsedArgs => {
  const args = process.argv.slice(2);
  const usage =
    'Usage: yarn ts-node apps/api/scripts/onboard-subreddit.ts <subreddit> [--location-name <name>] [--overwrite]';

  const positionals: string[] = [];
  let locationName: string | null = null;
  let overwrite = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
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

  return { subreddit, locationName, overwrite };
};

async function onboardSubreddit() {
  console.log('🔍 Starting Subreddit Onboarding');
  console.log('================================');

  let app;

  try {
    const { subreddit, locationName, overwrite } = parseArgs();

    console.log('\n🏗️  Initializing NestJS application...');
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn', 'log'],
    });
    stopCronsForScript(app);

    const prisma = app.get(PrismaService);

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
      // chronological sweep fires on the next pacer tick, before the
      // archive-end gap grows.
      await app
        .get(CollectorSourceRegistryService)
        .ensureLanes(source.sourceId);
      console.log(
        '   Collection lanes ensured (chronological + keyword, due now).',
      );
    } else {
      console.warn(
        '⚠️  No sources row exists for this subreddit yet — collection identity (anchor place, engine) is operator-managed in the sources table (§10).',
      );
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
