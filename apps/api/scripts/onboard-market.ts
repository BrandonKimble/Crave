import 'dotenv/config';

import { spawnSync } from 'child_process';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  provisionRegionMarket,
  provisionCollectionCommunity,
  geocodeCityCenter,
  geocodeCountyAnchor,
  discoverMetroCountyAnchors,
  discoverCityCountyAnchors,
  type RegionMarketSeed,
} from '../prisma/market-provisioning';

/**
 * ONE-COMMAND city onboarding. Provisions the regional market (TomTom county
 * polygons unioned in PostGIS), maps the subreddit collection community, and
 * chains the existing subreddit onboarding (Google viewport + volume jobs).
 * After this, loading the city = pointing archive-collect.ts at its archives.
 *
 *   yarn ts-node scripts/onboard-market.ts --subreddit austinfood --city "Austin, TX"
 *
 * That's the whole required input: the city geocodes via TomTom to derive the
 * short name, state, and center, and the market defaults to the county
 * containing the center. Metro expansion stays a PRODUCT decision (the Census
 * MSA for Austin is 5 counties; the owner's Austin is 6 — automation would
 * have gotten it wrong): add `--county lat,lng` anchors (any point inside
 * each extra county; names auto-resolve). `--short/--state/--center/--country`
 * remain available as explicit overrides.
 * Idempotent — re-running updates in place (same upserts the seed replays).
 */

interface Options {
  subreddits: string[];
  city: string;
  short?: string;
  state?: string;
  country?: string;
  center?: { lat: number; lng: number };
  counties: string[];
  metroRadiusKm?: number;
  skipSubreddit: boolean;
  dark: boolean;
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
    counties: string[];
    subreddits: string[];
  } = {
    counties: [],
    subreddits: [],
    skipSubreddit: false,
    dark: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${token} needs a value`);
      return value;
    };
    if (token === '--subreddit') options.subreddits.push(next());
    else if (token === '--city') options.city = next();
    else if (token === '--short') options.short = next();
    else if (token === '--state') options.state = next();
    else if (token === '--country') options.country = next();
    else if (token === '--center')
      options.center = parseCoordinate(next(), '--center');
    else if (token === '--county') options.counties.push(next());
    else if (token === '--metro-radius-km')
      options.metroRadiusKm = Number(next());
    else if (token === '--skip-subreddit') options.skipSubreddit = true;
    else if (token === '--dark') options.dark = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  if (!options.subreddits.length || !options.city) {
    throw new Error(
      'Missing required args: --subreddit (repeatable) and --city',
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
  const subreddits = options.subreddits.map((name) =>
    name.trim().toLowerCase(),
  );

  // Always geocode: it also yields the municipality geometry id that powers
  // default county discovery.
  const geocoded = await geocodeCityCenter(options.city);
  const short = options.short ?? geocoded.cityName;
  const state = (options.state ?? geocoded.stateCode).toUpperCase();
  const country = (options.country ?? geocoded.countryCode).toUpperCase();
  const center = options.center ?? geocoded.center;
  process.stdout.write(
    `Geocoded "${options.city}" -> ${short}, ${state} ${country} @ ${center.lat},${center.lng}\n`,
  );
  const marketKey = `region-${slugify(country)}-${slugify(state)}-${slugify(short)}`;

  // The county containing the center is always part of the market; extra
  // counties are given by NAME ("Williamson County, TX") or "lat,lng" and
  // geocoded to anchors.
  const extraAnchors = await Promise.all(
    options.counties.map((county) =>
      /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(county.trim())
        ? Promise.resolve(parseCoordinate(county, '--county'))
        : geocodeCountyAnchor(county),
    ),
  );
  let anchors = [center, ...extraAnchors];

  // DEFAULT: every county the city's own polygon intersects (interior grid
  // sampling of the TomTom municipality geometry — deterministic w.r.t. city
  // limits; NYC -> its exact 5 boroughs, Houston -> Harris/Fort Bend/
  // Montgomery). --county / --metro-radius-km EXPAND from this core.
  if (geocoded.geometryId) {
    const cityCounties = await discoverCityCountyAnchors(geocoded.geometryId);
    process.stdout.write(
      `City-polygon counties: ${cityCounties.map((entry) => entry.county).join(', ')}\n`,
    );
    anchors = [...anchors, ...cityCounties.map((entry) => entry.anchor)];
  }

  if (options.metroRadiusKm && Number.isFinite(options.metroRadiusKm)) {
    const discovered = await discoverMetroCountyAnchors(
      center,
      options.metroRadiusKm,
    );
    process.stdout.write(
      `Metro discovery (${options.metroRadiusKm}km): ${discovered
        .map((entry) => entry.county)
        .join(', ')}\n`,
    );
    anchors = [...anchors, ...discovered.map((entry) => entry.anchor)];
  }
  const seed: RegionMarketSeed = {
    marketKey,
    marketName: options.city,
    marketShortName: short,
    countryCode: country,
    stateCode: state,
    center,
    sourceBoundaries: anchors.map((anchor, index) => ({
      label: `${short} county anchor ${index + 1} (${anchor.lat},${anchor.lng})`,
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

    if (options.dark) {
      // Dark launch: data loads + collection run, but the market is not
      // user-visible until re-run WITHOUT --dark (idempotent flip).
      await prisma.market.update({
        where: { marketKey },
        data: { isActive: false },
      });
      process.stdout.write(`  market ${marketKey} set DARK (isActive=false)\n`);
    }

    for (const community of subreddits) {
      await provisionCollectionCommunity(
        prisma,
        {
          communityName: community,
          locationName: options.city,
          marketKey,
        },
        { requireActive: !options.dark },
      );
      process.stdout.write(
        `  community ${community} -> ${marketKey} (collectable, scheduler on)\n`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }

  if (options.skipSubreddit) {
    process.stdout.write('Skipping subreddit onboarding (--skip-subreddit).\n');
    return;
  }

  // Chain the existing subreddit onboarding (Google viewport + volume jobs +
  // market-key mapping) — composition over re-implementation.
  for (const community of subreddits) {
    process.stdout.write(`Onboarding subreddit r/${community}...\n`);
    const result = spawnSync(
      'yarn',
      [
        'ts-node',
        path.join(__dirname, 'onboard-subreddit.ts'),
        community,
        String(center.lat),
        String(center.lng),
        '--location-name',
        options.city,
      ],
      { stdio: 'inherit', cwd: path.join(__dirname, '..') },
    );
    if (result.status !== 0) {
      throw new Error(`onboard-subreddit exited with status ${result.status}`);
    }
  }
  process.stdout.write(
    `✅ ${options.city} onboarded. Next: archive-collect.ts --subreddit ${subreddits[0]} --batch-size 250\n`,
  );
}

main().catch((error) => {
  console.error(
    '❌ onboarding failed:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
