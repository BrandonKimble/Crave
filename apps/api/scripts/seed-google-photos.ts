/**
 * @script-class: operational
 * @runner: manual, per the usage line in the docstring below
 *   (`yarn ts-node -r tsconfig-paths/register scripts/seed-google-photos.ts`).
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';
import { GooglePlacesService } from '../src/modules/external-integrations/google-places/google-places.service';

/**
 * Dev-gallery seeding (wave2 charter §7 / plans/media-images-ledger.md):
 * pull 5-10 Google Places photos for the dev DB's real restaurant set and
 * store them through the app's REAL image pipeline — bytes land in
 * Cloudinary under the canonical publicId scheme (crave/{env}/photos/{id})
 * and a live `photos` row is written, attributed to the dedicated
 * "Crave Imports" system user (google-import@crave-search.local).
 *
 * Restaurant set: top Austin restaurants (by crave display_score, bbox-scoped
 * to the catalog's Austin, TX place) that have a google_place_id, plus every
 * restaurant referenced by the owner's favorite lists. Additive + idempotent:
 * a restaurant with >=5 imported photos is skipped.
 *
 *   yarn ts-node -r tsconfig-paths/register scripts/seed-google-photos.ts [--limit N]
 *
 * BILLED CALLS GO THROUGH THE METERED CLIENT (F1256, 2026-08-03). This seeder
 * used to call Places Details and Places Photo Media with a raw `fetch` and a
 * bare `GOOGLE_PLACES_API_KEY` — bypassing the vendor client, the rate-limit
 * coordinator, the durable spend pool and `api_usage_ledger` entirely. The
 * spend was small, which is exactly what made it a MEASUREMENT defect rather
 * than a spend defect: the cost-truth law is billed-vs-ledger reconciliation,
 * and calls with no ledger counterpart get absorbed into the known
 * under-metering and then baked into a durable per-vendor multiplier that
 * biases every future estimate. There is one gateway per vendor and it meters;
 * a raw `fetch` to a billed host is that law violated, whoever the caller is.
 * (Same shape still open elsewhere: `data-fixes/audit-catalog-vs-vendor.ts`
 * and `data-fixes/resolve-entity-names.ts` raw-fetch TomTom identically.)
 */

const PHOTOS_PER_RESTAURANT = 8;
const TOP_AUSTIN_LIMIT = Number(
  process.argv.includes('--limit')
    ? process.argv[process.argv.indexOf('--limit') + 1]
    : 15,
);
const IMPORT_USER_EMAIL = 'google-import@crave-search.local';

const prisma = new PrismaClient();
let app: INestApplicationContext | null = null;

type Candidate = { entityId: string; name: string; googlePlaceId: string };

async function getImportUserId(): Promise<string> {
  const user = await prisma.user.upsert({
    where: { email: IMPORT_USER_EMAIL },
    update: {},
    create: {
      email: IMPORT_USER_EMAIL,
      displayName: 'Crave Imports',
      username: 'crave.imports',
    },
    select: { userId: true },
  });
  return user.userId;
}

async function getCandidates(): Promise<Candidate[]> {
  const rows = await prisma.$queryRawUnsafe<
    { entity_id: string; name: string; google_place_id: string }[]
  >(
    `
    with austin_place as (
      -- P4: the ONE ground judges membership, not a rectangle.
      select p.place_id, g.geometry
      from places p join place_geometries g on g.place_id = p.place_id
      where p.name = 'Austin' and p.subdivision_code = 'TX' and p.country_code = 'US'
      order by p.promoted_at desc nulls last
      limit 1
    ),
    owner_list_restaurants as (
      select distinct coalesce(li.restaurant_id, c.restaurant_id) as entity_id
      from user_list_items li
      join user_lists l on l.list_id = li.list_id
      join users u on u.user_id = l.owner_user_id
      left join core_restaurant_items c on c.connection_id = li.connection_id
      where u.email = 'kimble.brandonm@gmail.com'
    ),
    top_austin as (
      select e.entity_id
      from core_entities e
      join core_public_entity_scores s
        on s.subject_id = e.entity_id and s.subject_type = 'restaurant'
      join core_restaurant_locations rl on rl.location_id = e.primary_location_id
      cross join austin_place ap
      where e.type = 'place'
        and ap.place_id is not null
        and ST_Covers(ap.geometry, ST_SetSRID(ST_MakePoint(rl.longitude, rl.latitude), 4326))
      order by s.display_score desc
      limit ${TOP_AUSTIN_LIMIT}
    ),
    unioned as (
      select entity_id from owner_list_restaurants where entity_id is not null
      union
      select entity_id from top_austin
    )
    select e.entity_id, e.name, l.google_place_id
    from unioned u
    join core_entities e on e.entity_id = u.entity_id
    join core_restaurant_locations l on l.location_id = e.primary_location_id
    where l.google_place_id is not null
    `,
  );
  return rows.map((r) => ({
    entityId: r.entity_id,
    name: r.name,
    googlePlaceId: r.google_place_id,
  }));
}

async function fetchPhotoNames(
  places: GooglePlacesService,
  placeId: string,
): Promise<string[]> {
  const details = await places.getPlaceDetails(placeId, {
    fields: ['photos.name'],
  });
  const photos = (details.place as { photos?: { name: string }[] }).photos;
  return (photos ?? []).map((p) => p.name);
}

async function main(): Promise<void> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('CLOUDINARY_* config missing');
  }
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
  const envPrefix = process.env.CLOUDINARY_ENV_PREFIX || 'dev';

  // Boot the real graph purely to obtain the METERED Places client.
  app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const places = app.get(GooglePlacesService);

  const importUserId = await getImportUserId();
  const candidates = await getCandidates();
  console.log(`candidates: ${candidates.length}`);

  let created = 0;
  for (const c of candidates) {
    const existing = await prisma.photo.count({
      where: { placeId: c.entityId, userId: importUserId },
    });
    if (existing >= 5) {
      console.log(`skip (${existing} already): ${c.name}`);
      continue;
    }
    let names: string[];
    try {
      names = await fetchPhotoNames(places, c.googlePlaceId);
    } catch (err) {
      console.warn(`SKIP ${c.name}: ${(err as Error).message}`);
      continue;
    }
    const wanted = names.slice(0, PHOTOS_PER_RESTAURANT);
    console.log(`${c.name}: ${wanted.length} photos`);
    for (const photoName of wanted) {
      try {
        const uri = await places.getPlacePhotoUri(photoName, {
          maxWidthPx: 1600,
        });
        const photoId = randomUUID();
        const publicId = `crave/${envPrefix}/photos/${photoId}`;
        const upload = await cloudinary.uploader.upload(uri, {
          public_id: publicId,
          overwrite: false,
          resource_type: 'image',
        });
        await prisma.photo.create({
          data: {
            photoId,
            userId: importUserId,
            placeId: c.entityId,
            publicId,
            status: 'live',
            visibility: 'public',
            moderatedAt: new Date(),
            width: upload.width,
            height: upload.height,
            bytes: upload.bytes,
          },
        });
        created += 1;
      } catch (err) {
        console.warn(`  photo failed: ${(err as Error).message}`);
      }
    }
  }
  console.log(`done. created ${created} photos.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await app?.close();
    await prisma.$disconnect();
  });
