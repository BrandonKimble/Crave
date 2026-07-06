import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  provisionRegionMarket,
  provisionCollectionCommunity,
  type CollectionCommunitySeed,
  type RegionMarketSeed,
} from './market-provisioning';

const COLLECTION_COMMUNITY_SEEDS: CollectionCommunitySeed[] = [
  {
    communityName: 'austinfood',
    locationName: 'Austin, TX',
    marketKey: 'region-us-tx-austin',
  },
  {
    communityName: 'foodnyc',
    locationName: 'New York, NY',
    marketKey: 'region-us-ny-new-york',
  },
];

const REGION_MARKET_SEEDS: RegionMarketSeed[] = [
  {
    marketKey: 'region-us-tx-austin',
    marketName: 'Austin, TX',
    marketShortName: 'Austin',
    countryCode: 'US',
    stateCode: 'TX',
    center: { lat: 30.2672, lng: -97.7431 },
    sourceBoundaries: [
      {
        label: 'Travis County, TX',
        entityType: 'CountrySecondarySubdivision',
        anchor: { lat: 30.2672, lng: -97.7431 },
      },
      {
        label: 'Williamson County, TX',
        entityType: 'CountrySecondarySubdivision',
        anchor: { lat: 30.646, lng: -97.6034 },
      },
      {
        label: 'Hays County, TX',
        entityType: 'CountrySecondarySubdivision',
        anchor: { lat: 29.8833, lng: -97.9414 },
      },
      {
        label: 'Bastrop County, TX',
        entityType: 'CountrySecondarySubdivision',
        anchor: { lat: 30.1105, lng: -97.3153 },
      },
      {
        label: 'Caldwell County, TX',
        entityType: 'CountrySecondarySubdivision',
        anchor: { lat: 29.8849, lng: -97.6699 },
      },
      {
        label: 'Burnet County, TX',
        entityType: 'CountrySecondarySubdivision',
        anchor: { lat: 30.7582, lng: -98.2284 },
      },
    ],
  },
  {
    marketKey: 'region-us-ny-new-york',
    marketName: 'New York, NY',
    marketShortName: 'New York',
    countryCode: 'US',
    stateCode: 'NY',
    center: { lat: 40.7128, lng: -74.006 },
    sourceBoundaries: [
      {
        label: 'New York County, NY',
        entityType: 'CountrySecondarySubdivision',
        anchor: { lat: 40.7831, lng: -73.9712 },
      },
      {
        label: 'Kings County, NY',
        entityType: 'CountrySecondarySubdivision',
        anchor: { lat: 40.6782, lng: -73.9442 },
      },
      {
        label: 'Queens County, NY',
        entityType: 'CountrySecondarySubdivision',
        anchor: { lat: 40.7282, lng: -73.7949 },
      },
      {
        label: 'Bronx County, NY',
        entityType: 'CountrySecondarySubdivision',
        anchor: { lat: 40.8448, lng: -73.8648 },
      },
      {
        label: 'Richmond County, NY',
        entityType: 'CountrySecondarySubdivision',
        anchor: { lat: 40.5795, lng: -74.1502 },
      },
    ],
  },
];

async function seedRegionMarkets(prisma: PrismaClient): Promise<void> {
  console.log(`Seeding ${REGION_MARKET_SEEDS.length} regional markets...`);
  for (const seed of REGION_MARKET_SEEDS) {
    const region = await provisionRegionMarket(prisma, seed);
    console.log(
      `  ${region.marketKey}: ${String(region.boundaryCount)} TomTom boundaries, ${String(region.areaKm2)} km²`,
    );
  }
  console.log('✅ Regional markets seeded');
}

async function seedCollectionCommunities(prisma: PrismaClient): Promise<void> {
  console.log(
    `Seeding ${COLLECTION_COMMUNITY_SEEDS.length} collection communities...`,
  );
  for (const seed of COLLECTION_COMMUNITY_SEEDS) {
    await provisionCollectionCommunity(prisma, seed);
  }
  console.log('✅ Collection communities seeded');
}

export async function runSeed(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seedRegionMarkets(prisma);
    await seedCollectionCommunities(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  await runSeed();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  });
}
