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
  subreddit: string | null;
  centerLat: number | null;
  centerLng: number | null;
  locationName: string | null;
  overwrite: boolean;
  skipVolume: boolean;
  fillMissing: boolean;
};

const parseArgs = (): ParsedArgs => {
  const args = process.argv.slice(2);
  const usage =
    'Usage: yarn ts-node apps/api/scripts/onboard-subreddit.ts [subreddit] [centerLat centerLng] [--location-name <name>] [--overwrite] [--skip-volume] [--fill-missing] (omit subreddit to batch fill missing rows)';

  const positionals: string[] = [];
  let locationName: string | null = null;
  let overwrite = false;
  let skipVolume = false;
  let fillMissing = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--only-missing') {
      continue;
    }
    if (arg === '--skip-volume') {
      skipVolume = true;
      continue;
    }
    if (arg === '--overwrite') {
      overwrite = true;
      continue;
    }
    if (arg === '--fill-missing') {
      fillMissing = true;
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
    if (locationName) {
      throw new Error(`location-name requires a subreddit.\n${usage}`);
    }
    fillMissing = true;
  }

  const centerLat =
    positionals[1] !== undefined ? Number(positionals[1]) : null;
  const centerLng =
    positionals[2] !== undefined ? Number(positionals[2]) : null;

  if ((centerLat === null) !== (centerLng === null)) {
    throw new Error('Provide both centerLat and centerLng, or neither.');
  }

  if (centerLat !== null && !Number.isFinite(centerLat)) {
    throw new Error('centerLat must be a valid number.');
  }

  if (centerLng !== null && !Number.isFinite(centerLng)) {
    throw new Error('centerLng must be a valid number.');
  }

  return {
    subreddit,
    centerLat,
    centerLng,
    locationName,
    overwrite,
    skipVolume,
    fillMissing,
  };
};

const normalizeMarketKey = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, '_');

const normalizeLocationToken = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const resolveViewportCenter = (viewport?: {
  low?: { latitude?: number; longitude?: number };
  high?: { latitude?: number; longitude?: number };
}): { lat: number; lng: number } | null => {
  const lowLat = viewport?.low?.latitude;
  const lowLng = viewport?.low?.longitude;
  const highLat = viewport?.high?.latitude;
  const highLng = viewport?.high?.longitude;
  if (
    typeof lowLat !== 'number' ||
    typeof lowLng !== 'number' ||
    typeof highLat !== 'number' ||
    typeof highLng !== 'number'
  ) {
    return null;
  }

  return {
    lat: (lowLat + highLat) / 2,
    lng: (lowLng + highLng) / 2,
  };
};

const computeDistanceMiles = (
  origin: { lat: number; lng: number },
  target: { lat: number; lng: number },
): number => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(target.lat - origin.lat);
  const dLng = toRad(target.lng - origin.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(origin.lat)) *
      Math.cos(toRad(target.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 3958.8 * c;
};

const buildLocalityMarketKey = (
  addressComponents: Array<{
    shortText?: string;
    longText?: string;
    types?: string[];
  }> = [],
): string | null => {
  const lookup = (type: string): string | null => {
    const component = addressComponents.find((entry) =>
      entry.types?.includes(type),
    );
    if (!component) {
      return null;
    }
    return component.shortText || component.longText || null;
  };

  const locality =
    lookup('locality') || lookup('postal_town') || lookup('sublocality');
  if (!locality) {
    return null;
  }

  const region = lookup('administrative_area_level_1');
  const country = lookup('country');

  const tokens = [locality, region, country]
    .filter(Boolean)
    .map((value) => normalizeLocationToken(value!))
    .filter((value) => value.length > 0);

  if (!tokens.length) {
    return null;
  }

  if (!region || !country) {
    return tokens[0] ?? null;
  }

  return tokens.join('_');
};

const resolveLocalityDisplayName = (
  addressComponents: Array<{
    shortText?: string;
    longText?: string;
    types?: string[];
  }> = [],
  fallbackName?: string | null,
): string | null => {
  const lookup = (type: string): string | null => {
    const component = addressComponents.find((entry) =>
      entry.types?.includes(type),
    );
    if (!component) {
      return null;
    }
    return component.shortText || component.longText || null;
  };

  const locality =
    lookup('locality') ||
    lookup('postal_town') ||
    lookup('sublocality') ||
    lookup('sublocality_level_1');
  if (locality) {
    return locality;
  }

  if (fallbackName) {
    const [first] = fallbackName.split(',');
    return first?.trim() || fallbackName.trim();
  }

  return null;
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

const resolveExistingMarketKey = async (
  prisma: PrismaService,
  center: { lat: number; lng: number },
  excludeName?: string,
): Promise<string | null> => {
  type AreaCandidate = {
    name: string;
    marketKey: string;
    area: number;
    center: { lat: number; lng: number };
  };

  const marketCandidates = await prisma.market.findMany({
    where: {
      isActive: true,
      bboxNeLat: { not: null },
      bboxNeLng: { not: null },
      bboxSwLat: { not: null },
      bboxSwLng: { not: null },
      ...(excludeName
        ? {
            sourceCommunity: {
              not: excludeName.toLowerCase(),
            },
          }
        : {}),
    },
    select: {
      marketKey: true,
      centerLatitude: true,
      centerLongitude: true,
      bboxNeLat: true,
      bboxNeLng: true,
      bboxSwLat: true,
      bboxSwLng: true,
    },
  });

  const resolveNumber = (
    value: Prisma.Decimal | number | null,
  ): number | null =>
    value instanceof Prisma.Decimal ? value.toNumber() : (value ?? null);

  const containingMarkets = marketCandidates
    .map((row) => {
      const northEastLat = resolveNumber(row.bboxNeLat);
      const northEastLng = resolveNumber(row.bboxNeLng);
      const southWestLat = resolveNumber(row.bboxSwLat);
      const southWestLng = resolveNumber(row.bboxSwLng);
      if (
        northEastLat === null ||
        northEastLng === null ||
        southWestLat === null ||
        southWestLng === null
      ) {
        return null;
      }
      const minLat = Math.min(southWestLat, northEastLat);
      const maxLat = Math.max(southWestLat, northEastLat);
      const minLng = Math.min(southWestLng, northEastLng);
      const maxLng = Math.max(southWestLng, northEastLng);
      const inBounds =
        center.lat >= minLat &&
        center.lat <= maxLat &&
        center.lng >= minLng &&
        center.lng <= maxLng;
      if (!inBounds) {
        return null;
      }
      const area = Math.abs(maxLat - minLat) * Math.abs(maxLng - minLng);
      const centerLat = resolveNumber(row.centerLatitude);
      const centerLng = resolveNumber(row.centerLongitude);
      const candidateCenter =
        typeof centerLat === 'number' && typeof centerLng === 'number'
          ? { lat: centerLat, lng: centerLng }
          : {
              lat: (northEastLat + southWestLat) / 2,
              lng: (northEastLng + southWestLng) / 2,
            };
      return {
        name: row.marketKey,
        marketKey: row.marketKey,
        area,
        center: candidateCenter,
      };
    })
    .filter((row): row is AreaCandidate => Boolean(row));

  if (containingMarkets.length) {
    const epsilon = 1e-6;
    const best = containingMarkets.reduce(
      (winner, candidate) => {
        if (!winner || candidate.area < winner.area - epsilon) {
          return candidate;
        }
        if (Math.abs(candidate.area - winner.area) <= epsilon) {
          const candidateDistance = computeDistanceMiles(
            center,
            candidate.center,
          );
          const winnerDistance = computeDistanceMiles(center, winner.center);
          if (candidateDistance < winnerDistance) {
            return candidate;
          }
        }
        return winner;
      },
      null as (typeof containingMarkets)[number] | null,
    );

    const rawKey = best?.marketKey?.trim() || best?.name?.trim() || null;
    return rawKey ? normalizeMarketKey(rawKey) : null;
  }

  return null;
};

const syncMarketSubredditMapping = async (params: {
  prisma: PrismaService;
  marketKey: string;
  subreddit: string;
  locationName?: string | null;
  displayName?: string | null;
}): Promise<void> => {
  const normalizedSubreddit = params.subreddit.trim().toLowerCase();
  if (!normalizedSubreddit) {
    return;
  }

  const market = await params.prisma.market.findUnique({
    where: { marketKey: params.marketKey },
    select: {
      marketId: true,
      marketName: true,
      marketShortName: true,
      marketType: true,
    },
  });

  if (!market) {
    console.warn(
      `⚠️  No market row found for "${params.marketKey}". Community metrics were saved, but market mapping was not updated.`,
    );
    return;
  }

  const preferredShortName =
    params.displayName?.trim() || params.locationName?.trim() || null;

  await params.prisma.market.update({
    where: { marketKey: params.marketKey },
    data: {
      sourceCommunity: normalizedSubreddit,
      isCollectable: true,
      schedulerEnabled: true,
      isActive: true,
      ...(preferredShortName && !market.marketShortName
        ? { marketShortName: preferredShortName }
        : {}),
      ...(params.displayName?.trim() &&
      market.marketType === 'local_fallback' &&
      market.marketName !== params.displayName.trim()
        ? { marketName: params.displayName.trim() }
        : {}),
    },
  });
};

async function onboardSubreddit() {
  console.log('🔍 Starting Subreddit Onboarding');
  console.log('================================');

  let app;

  try {
    const {
      subreddit,
      centerLat,
      centerLng,
      locationName,
      overwrite,
      skipVolume,
      fillMissing,
    } = parseArgs();

    // Initialize NestJS application
    console.log('\n🏗️  Initializing NestJS application...');
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn', 'log'],
    });

    const prisma = app.get(PrismaService);
    const googlePlaces = app.get(GooglePlacesService);

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

    const processSubreddit = async (params: {
      subreddit: string;
      centerLat: number | null;
      centerLng: number | null;
      locationName: string | null;
      overwrite: boolean;
    }): Promise<void> => {
      const onlyMissing = !params.overwrite;

      const existingRows = await prisma.collectionCommunity.findMany({
        where: {
          communityName: {
            equals: params.subreddit,
            mode: 'insensitive',
          },
        },
        select: {
          communityName: true,
          marketKey: true,
          locationName: true,
        },
      });
      const exactMatch = existingRows.find(
        (row) => row.communityName === params.subreddit,
      );
      const existingRow = exactMatch ?? existingRows[0] ?? null;
      if (existingRows.length > 1 && !exactMatch) {
        console.warn(
          `⚠️  Multiple subreddit rows matched "${params.subreddit}" (case-insensitive). Using "${existingRow?.communityName}".`,
        );
      }

      const resolvedLocationName =
        params.locationName?.trim() ||
        existingRow?.locationName?.trim() ||
        null;
      const placeQuery =
        resolvedLocationName || buildCityQuery(params.subreddit);

      let placeAddressComponents:
        | Array<{
            shortText?: string;
            longText?: string;
            types?: string[];
          }>
        | undefined;

      console.log('\n🧭 Preparing city viewport lookup...');
      console.log(`   Subreddit: ${params.subreddit}`);
      if (resolvedLocationName) {
        console.log(`   Location name: ${resolvedLocationName}`);
      }
      console.log(`   Place query: ${placeQuery}`);

      const locationBias =
        params.centerLat !== null && params.centerLng !== null
          ? {
              lat: params.centerLat,
              lng: params.centerLng,
              radiusMeters: 50000,
            }
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
          fields: ['id', 'displayName', 'viewport', 'addressComponents'],
        });
        viewport = details.place.viewport;
        placeAddressComponents = details.place.addressComponents ?? [];
        const viewportCenter = resolveViewportCenter(viewport);
        const placeName =
          typeof details.place.displayName?.text === 'string'
            ? details.place.displayName.text
            : 'unknown';
        console.log(`✅ Viewport resolved from Google Place: ${placeName}`);
        if (viewportCenter) {
          console.log(
            `   Viewport center: ${viewportCenter.lat}, ${viewportCenter.lng}`,
          );
          if (
            typeof params.centerLat === 'number' &&
            typeof params.centerLng === 'number'
          ) {
            const distance = computeDistanceMiles(viewportCenter, {
              lat: params.centerLat,
              lng: params.centerLng,
            });
            console.log(
              `   Provided center: ${params.centerLat}, ${
                params.centerLng
              } (~${distance.toFixed(2)} mi from viewport center)`,
            );
          }
        }
      } else {
        console.warn('⚠️  No Google place found for viewport lookup.');
      }

      const viewportNeLat = viewport?.high?.latitude;
      const viewportNeLng = viewport?.high?.longitude;
      const viewportSwLat = viewport?.low?.latitude;
      const viewportSwLng = viewport?.low?.longitude;
      const isFiniteNumber = (value: unknown): value is number =>
        typeof value === 'number' && Number.isFinite(value);
      const viewportBounds =
        isFiniteNumber(viewportNeLat) &&
        isFiniteNumber(viewportNeLng) &&
        isFiniteNumber(viewportSwLat) &&
        isFiniteNumber(viewportSwLng)
          ? {
              neLat: viewportNeLat,
              neLng: viewportNeLng,
              swLat: viewportSwLat,
              swLng: viewportSwLng,
            }
          : null;

      const viewportCenter = resolveViewportCenter(viewport);
      const derivedCenter =
        params.centerLat !== null && params.centerLng !== null
          ? { lat: params.centerLat, lng: params.centerLng }
          : (viewportCenter ?? null);
      const marketCenter = derivedCenter;

      let resolvedMarketKey =
        existingRow?.marketKey && onlyMissing
          ? normalizeMarketKey(existingRow.marketKey)
          : null;

      if (!resolvedMarketKey && marketCenter) {
        resolvedMarketKey = await resolveExistingMarketKey(
          prisma,
          marketCenter,
          existingRow?.communityName ?? params.subreddit,
        );
      }

      if (!resolvedMarketKey) {
        const localityKey = buildLocalityMarketKey(placeAddressComponents);
        if (!localityKey) {
          console.warn(
            '   Skipping: unable to derive locality-based market key.',
          );
          return;
        }
        resolvedMarketKey = localityKey;
      }

      const resolvedDisplayName = resolveLocalityDisplayName(
        placeAddressComponents,
        resolvedLocationName,
      );

      console.log(`   Market key: ${resolvedMarketKey}`);

      const createData: Prisma.CollectionCommunityCreateInput = {
        communityName: params.subreddit,
        marketKey: resolvedMarketKey,
        isActive: true,
      };

      if (params.locationName) {
        createData.locationName = params.locationName.trim();
      }

      if (viewportBounds) {
        console.log(
          `   Viewport NE: ${viewportBounds.neLat}, ${viewportBounds.neLng}`,
        );
        console.log(
          `   Viewport SW: ${viewportBounds.swLat}, ${viewportBounds.swLng}`,
        );
      }

      const updateData: Prisma.CollectionCommunityUpdateInput = {};

      if (
        params.locationName &&
        (!onlyMissing || !existingRow?.locationName?.trim())
      ) {
        updateData.locationName = params.locationName.trim();
      }

      if (!onlyMissing || !existingRow?.marketKey) {
        updateData.marketKey = resolvedMarketKey;
      }

      console.log('\n🗃️  Saving subreddit record...');
      if (existingRow) {
        if (Object.keys(updateData).length > 0) {
          await prisma.collectionCommunity.update({
            where: { communityName: existingRow.communityName },
            data: updateData,
          });
        } else {
          console.log('   No updates needed (only-missing default).');
        }
      } else {
        await prisma.collectionCommunity.create({ data: createData });
      }

      await syncMarketSubredditMapping({
        prisma,
        marketKey: resolvedMarketKey,
        subreddit: params.subreddit,
        locationName: params.locationName,
        displayName: resolvedDisplayName,
      });
    };

    const batchMode = fillMissing;

    if (batchMode) {
      if (subreddit) {
        console.log(
          'NOTE: --fill-missing enabled; ignoring the provided subreddit.',
        );
      }

      const rows = await prisma.collectionCommunity.findMany({
        select: {
          communityName: true,
          locationName: true,
          marketKey: true,
        },
      });

      let skippedNoLocation = 0;
      const candidates = rows.filter((row) => {
        const hasLocationName =
          typeof row.locationName === 'string' &&
          row.locationName.trim().length > 0;
        if (!hasLocationName) {
          skippedNoLocation += 1;
          return false;
        }

        if (overwrite) {
          return true;
        }

        const missingMarket =
          typeof row.marketKey !== 'string' || !row.marketKey.trim();

        return missingMarket;
      });

      if (skippedNoLocation > 0) {
        console.log(
          `\n⚠️  Skipping ${skippedNoLocation} subreddit(s) missing location_name. Add a location_name to enable Google lookup.`,
        );
      }

      if (!candidates.length) {
        console.log('\n✅ No communities found with missing market mappings.');
      } else {
        console.log(
          `\n🧾 Filling missing market mappings for ${candidates.length} community record(s)...`,
        );
        for (const row of candidates) {
          await processSubreddit({
            subreddit: row.communityName,
            centerLat: null,
            centerLng: null,
            locationName: row.locationName ?? null,
            overwrite,
          });
        }
      }
    } else {
      if (!subreddit) {
        throw new Error('Subreddit name is required.');
      }

      await processSubreddit({
        subreddit,
        centerLat,
        centerLng,
        locationName,
        overwrite,
      });
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
