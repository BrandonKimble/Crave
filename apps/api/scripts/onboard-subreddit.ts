/**
 * Subreddit Onboarding Script
 *
 * Creates or updates a subreddit, fetches a Google Places viewport for
 * city bounds, and queues volume calculation jobs.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load API environment variables (same file the API uses)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { NestFactory } from '@nestjs/core';
import { getQueueToken } from '@nestjs/bull';
import { Queue } from 'bull';
import { Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GooglePlacesService } from '../src/modules/external-integrations/google-places';

const CITY_PLACE_TYPES = new Set([
  'locality',
  'administrative_area_level_2',
  'administrative_area_level_1',
  'postal_town',
]);

const SUBREDDIT_SUFFIXES = [
  'food',
  'foods',
  'eats',
  'dining',
  'restaurant',
  'restaurants',
];

type ParsedArgs = {
  subreddit: string;
  centerLat: number | null;
  centerLng: number | null;
};

const parseArgs = (): ParsedArgs => {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    throw new Error(
      'Usage: yarn ts-node apps/api/scripts/onboard-subreddit.ts <subreddit> [centerLat centerLng]',
    );
  }

  const subreddit = args[0]?.trim();
  if (!subreddit) {
    throw new Error('Subreddit name is required.');
  }

  const centerLat = args[1] !== undefined ? Number(args[1]) : null;
  const centerLng = args[2] !== undefined ? Number(args[2]) : null;

  if ((centerLat === null) !== (centerLng === null)) {
    throw new Error('Provide both centerLat and centerLng, or neither.');
  }

  if (centerLat !== null && !Number.isFinite(centerLat)) {
    throw new Error('centerLat must be a valid number.');
  }

  if (centerLng !== null && !Number.isFinite(centerLng)) {
    throw new Error('centerLng must be a valid number.');
  }

  return { subreddit, centerLat, centerLng };
};

const buildCityQuery = (subreddit: string): string => {
  const normalized = subreddit.toLowerCase().replace(/[_-]+/g, ' ').trim();
  if (!normalized) {
    return subreddit;
  }

  let stripped = normalized;
  for (const suffix of SUBREDDIT_SUFFIXES) {
    if (stripped.endsWith(` ${suffix}`)) {
      stripped = stripped.slice(0, -(suffix.length + 1)).trim();
      break;
    }
    if (stripped.endsWith(suffix) && stripped.length > suffix.length + 2) {
      stripped = stripped.slice(0, -suffix.length).trim();
      break;
    }
  }

  return stripped || normalized;
};

const pickCityPlaceId = (
  places: Array<{ id?: string; types?: string[] }>,
): string | null => {
  for (const place of places) {
    const types = place.types ?? [];
    if (types.some((type) => CITY_PLACE_TYPES.has(type))) {
      return place.id ?? null;
    }
  }

  return places[0]?.id ?? null;
};

async function onboardSubreddit() {
  console.log('🔍 Starting Subreddit Onboarding');
  console.log('================================');

  let app;

  try {
    const { subreddit, centerLat, centerLng } = parseArgs();

    // Initialize NestJS application
    console.log('\n🏗️  Initializing NestJS application...');
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn', 'log'],
    });

    const prisma = app.get(PrismaService);
    const googlePlaces = app.get(GooglePlacesService);
    const placeQuery = buildCityQuery(subreddit);

    console.log('\n🧭 Preparing city viewport lookup...');
    console.log(`   Subreddit: ${subreddit}`);
    console.log(`   Place query: ${placeQuery}`);

    const locationBias =
      centerLat !== null && centerLng !== null
        ? { lat: centerLat, lng: centerLng, radiusMeters: 50000 }
        : undefined;

    const placeSearch = await googlePlaces.findPlaceFromText(placeQuery, {
      fields: ['id', 'displayName', 'types'],
      locationBias,
    });

    const placeId = pickCityPlaceId(placeSearch.places);
    let viewport:
      | {
          low?: { latitude?: number; longitude?: number };
          high?: { latitude?: number; longitude?: number };
        }
      | undefined;

    if (placeId) {
      const details = await googlePlaces.getPlaceDetails(placeId, {
        fields: ['id', 'displayName', 'viewport'],
      });
      viewport = details.place.viewport;
      const placeName =
        typeof details.place.displayName?.text === 'string'
          ? details.place.displayName.text
          : 'unknown';
      console.log(`✅ Viewport resolved from Google Place: ${placeName}`);
    } else {
      console.warn('⚠️  No Google place found for viewport lookup.');
    }

    const hasViewport =
      Number.isFinite(viewport?.high?.latitude) &&
      Number.isFinite(viewport?.high?.longitude) &&
      Number.isFinite(viewport?.low?.latitude) &&
      Number.isFinite(viewport?.low?.longitude);

    const createData: Prisma.SubredditCreateInput = {
      name: subreddit,
      avgPostsPerDay: 0,
      safeIntervalDays: 0,
      lastCalculated: new Date(),
      isActive: true,
    };

    if (centerLat !== null && centerLng !== null) {
      createData.centerLatitude = new Prisma.Decimal(centerLat);
      createData.centerLongitude = new Prisma.Decimal(centerLng);
    }

    if (hasViewport && viewport?.high && viewport?.low) {
      createData.viewportNeLat = new Prisma.Decimal(viewport.high.latitude);
      createData.viewportNeLng = new Prisma.Decimal(viewport.high.longitude);
      createData.viewportSwLat = new Prisma.Decimal(viewport.low.latitude);
      createData.viewportSwLng = new Prisma.Decimal(viewport.low.longitude);
      console.log(
        `   Viewport NE: ${viewport.high.latitude}, ${viewport.high.longitude}`,
      );
      console.log(
        `   Viewport SW: ${viewport.low.latitude}, ${viewport.low.longitude}`,
      );
    }

    const updateData: Prisma.SubredditUpdateInput = {};

    if (centerLat !== null && centerLng !== null) {
      updateData.centerLatitude = new Prisma.Decimal(centerLat);
      updateData.centerLongitude = new Prisma.Decimal(centerLng);
    }

    if (hasViewport && viewport?.high && viewport?.low) {
      updateData.viewportNeLat = new Prisma.Decimal(viewport.high.latitude);
      updateData.viewportNeLng = new Prisma.Decimal(viewport.high.longitude);
      updateData.viewportSwLat = new Prisma.Decimal(viewport.low.latitude);
      updateData.viewportSwLng = new Prisma.Decimal(viewport.low.longitude);
    }

    console.log('\n🗃️  Upserting subreddit record...');
    await prisma.subreddit.upsert({
      where: { name: subreddit },
      create: createData,
      update: updateData,
    });

    // Get the volume tracking queue
    const volumeQueue = app.get(getQueueToken('volume-tracking')) as Queue;

    console.log('✅ Volume tracking queue retrieved');

    // Queue a volume calculation job
    console.log('\n📊 Queuing volume calculation job...');
    console.log(
      '   This will make actual Reddit API calls to sample posting rates',
    );
    console.log('   Sample period: 7 days (as modified)');

    const job = await volumeQueue.add('calculate-volumes', {
      jobId: `manual-volume-calc-${Date.now()}`,
      triggeredBy: 'manual',
      sampleDays: 7, // Using 7 days as you specified
    });

    console.log(`✅ Volume calculation job queued: ${job.id}`);

    // Wait for the job to complete
    console.log('\n⏳ Waiting for volume calculation to complete...');
    let jobComplete = false;
    let attempts = 0;
    const maxAttempts = 120; // 2 minutes with 1 second checks

    while (!jobComplete && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Check job status
      const bullJob = await volumeQueue.getJob(job.id);

      if (bullJob && bullJob.finishedOn) {
        jobComplete = true;

        if (bullJob.failedReason) {
          throw new Error(
            `Volume calculation job failed: ${bullJob.failedReason}`,
          );
        }

        // Get job result
        const jobResult = bullJob.returnvalue;
        console.log('✅ Volume calculation job completed successfully');
        console.log(
          `   Subreddits processed: ${jobResult.subredditsProcessed}`,
        );
        console.log(`   Processing time: ${jobResult.processingTime}ms`);

        // The actual volume data is now in the database
      } else if (bullJob && bullJob.processedOn && !bullJob.finishedOn) {
        // Job is still processing
        if (attempts % 10 === 0) {
          console.log(`   🔄 Job is processing... (${attempts}s elapsed)`);
        }
      }

      attempts++;
    }

    if (!jobComplete) {
      throw new Error('Volume calculation job did not complete in time');
    }

    // Now read the updated volumes from the database
    const volumes = await prisma.subreddit.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    console.log('\n🎉 VOLUME CALCULATION COMPLETED');
    console.log('================================');

    for (const volume of volumes) {
      console.log(`\n📋 ${volume.name.toUpperCase()}`);
      console.log(`   📈 Posts per day: ${volume.avgPostsPerDay.toFixed(1)}`);
      console.log(
        `   📊 Safe interval days: ${volume.safeIntervalDays.toFixed(1)}`,
      );
      console.log(`   ✅ Active: ${volume.isActive}`);
      console.log(
        `   🕐 Last calculated: ${volume.lastCalculated.toISOString()}`,
      );
      console.log(
        `   🕐 Last processed: ${
          volume.lastProcessed ? volume.lastProcessed.toISOString() : 'Never'
        }`,
      );
      console.log(`   🕐 Updated at: ${volume.updatedAt.toISOString()}`);
    }

    console.log('\n💾 Data has been saved to the database');
    console.log('   The collection scheduler will now use these real values');
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
