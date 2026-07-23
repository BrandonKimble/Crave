import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import { randomUUID } from 'node:crypto';

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
 */

const PHOTOS_PER_RESTAURANT = 8;
const TOP_AUSTIN_LIMIT = Number(
  process.argv.includes('--limit')
    ? process.argv[process.argv.indexOf('--limit') + 1]
    : 15,
);
const IMPORT_USER_EMAIL = 'google-import@crave-search.local';
const PLACES_BASE = 'https://places.googleapis.com/v1';

const prisma = new PrismaClient();

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
      select place_id, bbox_min_lat, bbox_min_lng, bbox_max_lat, bbox_max_lng
      from places
      where name = 'Austin' and subdivision_code = 'TX' and country_code = 'US'
      order by promoted_at desc nulls last
      limit 1
    ),
    owner_list_restaurants as (
      select distinct coalesce(li.restaurant_id, c.restaurant_id) as entity_id
      from favorite_list_items li
      join favorite_lists l on l.list_id = li.list_id
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
      where e.type = 'restaurant'
        and ap.place_id is not null
        and rl.latitude between ap.bbox_min_lat and ap.bbox_max_lat
        and rl.longitude between ap.bbox_min_lng and ap.bbox_max_lng
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
  placeId: string,
  key: string,
): Promise<string[]> {
  const res = await fetch(
    `${PLACES_BASE}/places/${placeId}?fields=photos.name&key=${key}`,
  );
  if (!res.ok) {
    throw new Error(`place details ${placeId}: ${res.status}`);
  }
  const json = (await res.json()) as { photos?: { name: string }[] };
  return (json.photos ?? []).map((p) => p.name);
}

async function fetchPhotoUri(photoName: string, key: string): Promise<string> {
  const res = await fetch(
    `${PLACES_BASE}/${photoName}/media?maxWidthPx=1600&skipHttpRedirect=true&key=${key}`,
  );
  if (!res.ok) {
    throw new Error(`photo media ${photoName}: ${res.status}`);
  }
  const json = (await res.json()) as { photoUri?: string };
  if (!json.photoUri) throw new Error(`photo media ${photoName}: no photoUri`);
  return json.photoUri;
}

async function main(): Promise<void> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY missing');
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

  const importUserId = await getImportUserId();
  const candidates = await getCandidates();
  console.log(`candidates: ${candidates.length}`);

  let created = 0;
  for (const c of candidates) {
    const existing = await prisma.photo.count({
      where: { restaurantId: c.entityId, userId: importUserId },
    });
    if (existing >= 5) {
      console.log(`skip (${existing} already): ${c.name}`);
      continue;
    }
    let names: string[];
    try {
      names = await fetchPhotoNames(c.googlePlaceId, key);
    } catch (err) {
      console.warn(`SKIP ${c.name}: ${(err as Error).message}`);
      continue;
    }
    const wanted = names.slice(0, PHOTOS_PER_RESTAURANT);
    console.log(`${c.name}: ${wanted.length} photos`);
    for (const photoName of wanted) {
      try {
        const uri = await fetchPhotoUri(photoName, key);
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
            restaurantId: c.entityId,
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
  .finally(() => prisma.$disconnect());
