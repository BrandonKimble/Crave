import 'dotenv/config';

import { spawnSync } from 'child_process';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  provisionRegionMarket,
  provisionCollectionCommunity,
  type RegionMarketSeed,
} from '../prisma/market-provisioning';

/**
 * ONE-COMMAND city onboarding. Provisions the regional market (TomTom county
 * polygons unioned in PostGIS), maps the subreddit collection community, and
 * chains the existing subreddit onboarding (Google viewport + volume jobs).
 * After this, loading the city = pointing archive-collect.ts at its archives.
 *
 *   yarn ts-node scripts/onboard-market.ts \
 *     --subreddit austinfood \
 *     --city "Austin, TX" --short Austin --state TX \
 *     --center 30.2672,-97.7431 \
 *     --county 30.646,-97.6034 --county 29.8833,-97.9414
 *
 * Counties are anchor points (any lat/lng inside the county); names resolve
 * automatically via TomTom reverse geocode. The county containing --center is
 * always included, so a compact single-county market needs no --county args.
 * Idempotent — re-running updates in place (same upserts the seed replays).
 */

interface Options {
  subreddit: string;
  city: string;
  short: string;
  state: string;
  country: string;
  center: { lat: number; lng: number };
  counties: { lat: number; lng: number }[];
  skipSubreddit: boolean;
}

function parseCoordinate(
  raw: string,
  flag: string,
): { lat: number; lng: number } {
  const [latRaw, lngRaw] = raw.split(',').map((part) => part.trim());
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error(`${flag} expects "lat,lng", got "${raw}"`);
  }
  return { lat, lng };
}

function parseArgs(argv: string[]): Options {
  const options: Partial<Options> & {
    counties: { lat: number; lng: number }[];
  } = { counties: [], country: 'US', skipSubreddit: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${token} needs a value`);
      return value;
    };
    if (token === '--subreddit') options.subreddit = next();
    else if (token === '--city') options.city = next();
    else if (token === '--short') options.short = next();
    else if (token === '--state') options.state = next();
    else if (token === '--country') options.country = next();
    else if (token === '--center')
      options.center = parseCoordinate(next(), '--center');
    else if (token === '--county')
      options.counties.push(parseCoordinate(next(), '--county'));
    else if (token === '--skip-subreddit') options.skipSubreddit = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  const missing = ['subreddit', 'city', 'short', 'state', 'center'].filter(
    (key) => !(key in options) || !options[key as keyof typeof options],
  );
  if (missing.length) {
    throw new Error(
      `Missing required args: ${missing.map((key) => `--${key}`).join(', ')}`,
    );
  }
  return options as Options;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const marketKey = `region-${slugify(options.country)}-${slugify(options.state)}-${slugify(options.short)}`;

  // The county containing the center is always part of the market.
  const anchors = [options.center, ...options.counties];
  const seed: RegionMarketSeed = {
    marketKey,
    marketName: options.city,
    marketShortName: options.short,
    countryCode: options.country.toUpperCase(),
    stateCode: options.state.toUpperCase(),
    center: options.center,
    sourceBoundaries: anchors.map((anchor, index) => ({
      label: `${options.short} county anchor ${index + 1} (${anchor.lat},${anchor.lng})`,
      entityType: 'CountrySecondarySubdivision',
      anchor,
    })),
  };

  const prisma = new PrismaClient();
  try {
    process.stdout.write(
      `Provisioning market ${marketKey} from ${anchors.length} county anchor(s)...\n`,
    );
    const region = await provisionRegionMarket(prisma, seed);
    process.stdout.write(
      `  ${region.marketKey}: ${String(region.boundaryCount)} boundaries, ${String(region.areaKm2)} km²\n`,
    );

    await provisionCollectionCommunity(prisma, {
      communityName: options.subreddit,
      locationName: options.city,
      marketKey,
    });
    process.stdout.write(
      `  community ${options.subreddit} -> ${marketKey} (collectable, scheduler on)\n`,
    );
  } finally {
    await prisma.$disconnect();
  }

  if (options.skipSubreddit) {
    process.stdout.write('Skipping subreddit onboarding (--skip-subreddit).\n');
    return;
  }

  // Chain the existing subreddit onboarding (Google viewport + volume jobs +
  // market-key mapping) — composition over re-implementation.
  process.stdout.write(`Onboarding subreddit r/${options.subreddit}...\n`);
  const result = spawnSync(
    'yarn',
    [
      'ts-node',
      path.join(__dirname, 'onboard-subreddit.ts'),
      options.subreddit,
      String(options.center.lat),
      String(options.center.lng),
      '--location-name',
      options.city,
    ],
    { stdio: 'inherit', cwd: path.join(__dirname, '..') },
  );
  if (result.status !== 0) {
    throw new Error(`onboard-subreddit exited with status ${result.status}`);
  }
  process.stdout.write(
    `✅ ${options.city} onboarded. Next: archive-collect.ts --subreddit ${options.subreddit} --batch-size 250\n`,
  );
}

main().catch((error) => {
  console.error(
    '❌ onboarding failed:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
