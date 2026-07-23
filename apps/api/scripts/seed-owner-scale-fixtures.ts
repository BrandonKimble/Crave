import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import { randomUUID } from 'node:crypto';

/**
 * Scale fixtures for the owner account (wave3 conformance audit, DU #1/#2 +
 * ND #2 verification data — plans/media-images-ledger.md Leg 2):
 *
 *  A. ~10 EXTRA lists PER SIDE (mixed sizes, several past one screen of home
 *     tiles) drawn from a bounded pool of top Austin restaurants with Google
 *     place ids (so the google-photos seeder can cover them) and their real
 *     dish connections.
 *  B. OWNER-ATTRIBUTED photos (Cloudinary side-copies of existing import
 *     assets — no extra Google spend) at a handful of restaurants, plus a
 *     "My shots ATX" list with use_own_photos = true that mixes shot and
 *     un-shot restaurants (exercises the sparse-slot law).
 *  C. Connection-level photo links: every owner dish-list connection with
 *     zero linked photos gets up to 3 of its restaurant's unlinked import
 *     photos linked (dish cards read strips by connectionId).
 *
 * Additive + idempotent. Run order: this script -> seed-google-photos.ts
 * (picks up the new lists' restaurants) -> this script again (B/C then find
 * photos to copy/link).
 *
 *   yarn ts-node -r tsconfig-paths/register scripts/seed-owner-scale-fixtures.ts
 */

const OWNER_EMAIL = 'kimble.brandonm@gmail.com';
const IMPORT_USER_EMAIL = 'google-import@crave-search.local';
const POOL_SIZE = 50;

const prisma = new PrismaClient();

type PoolRestaurant = { entityId: string; name: string };

/** Deterministic slice of the pool: offset stride keeps lists distinct but
 *  overlapping (bounds the google-photo spend to the one pool). */
const RESTAURANT_LISTS: {
  name: string;
  size: number;
  offset: number;
  visibility: 'public' | 'private';
}[] = [
  { name: 'Date night ATX', size: 12, offset: 0, visibility: 'public' },
  { name: 'Patio season', size: 9, offset: 4, visibility: 'public' },
  { name: 'Taco crawl 2026', size: 8, offset: 8, visibility: 'private' },
  { name: 'Brunch rotation', size: 7, offset: 12, visibility: 'public' },
  { name: 'Out-of-towner tour', size: 15, offset: 2, visibility: 'public' },
  { name: 'Cheap eats champs', size: 6, offset: 18, visibility: 'private' },
  { name: 'Late night list', size: 5, offset: 22, visibility: 'public' },
  { name: 'Coffee crawl', size: 4, offset: 26, visibility: 'private' },
  { name: 'Big group dinners', size: 3, offset: 30, visibility: 'public' },
  { name: 'Anniversary shortlist', size: 2, offset: 34, visibility: 'private' },
];

const DISH_LISTS: {
  name: string;
  size: number;
  offset: number;
  visibility: 'public' | 'private';
}[] = [
  { name: 'Dish bucket list', size: 12, offset: 0, visibility: 'public' },
  { name: 'Noodle hall of fame', size: 9, offset: 3, visibility: 'public' },
  { name: 'Smoked things', size: 8, offset: 7, visibility: 'private' },
  { name: 'Breakfast benders', size: 7, offset: 11, visibility: 'public' },
  { name: 'Desserts first', size: 6, offset: 15, visibility: 'private' },
  { name: 'Spice runs', size: 5, offset: 19, visibility: 'public' },
  { name: 'Raw + fresh', size: 4, offset: 23, visibility: 'public' },
  { name: 'Comfort carbs', size: 3, offset: 27, visibility: 'private' },
  { name: 'One-bite wonders', size: 2, offset: 31, visibility: 'public' },
  { name: 'Chef counter picks', size: 10, offset: 5, visibility: 'private' },
];

/** Restaurants the owner "shot" (B) — must be photo-seeded names. */
const OWN_PHOTO_RESTAURANTS = [
  'Cuantos Tacos',
  'Micklethwait Barbecue',
  'Home Slice Pizza',
  'Ramen Del Barrio',
];
/** Un-shot members of My shots ATX — their slots must render sparse. */
const MY_SHOTS_UNSHOT = ['Uchi Austin', 'Uroko'];
const OWN_PHOTOS_PER_RESTAURANT = 2;
const MY_SHOTS_LIST = 'My shots ATX';

async function userId(email: string): Promise<string> {
  const u = await prisma.user.findUniqueOrThrow({
    where: { email },
    select: { userId: true },
  });
  return u.userId;
}

async function loadPool(): Promise<PoolRestaurant[]> {
  const rows = await prisma.$queryRawUnsafe<
    { entity_id: string; name: string }[]
  >(
    `
    with austin_place as (
      select bbox_min_lat, bbox_min_lng, bbox_max_lat, bbox_max_lng
      from places
      where name = 'Austin' and subdivision_code = 'TX' and country_code = 'US'
      order by promoted_at desc nulls last
      limit 1
    )
    select e.entity_id, e.name
    from core_entities e
    join core_public_entity_scores s
      on s.subject_id = e.entity_id and s.subject_type = 'restaurant'
    join core_restaurant_locations l on l.location_id = e.primary_location_id
    cross join austin_place ap
    where e.type = 'restaurant' and l.google_place_id is not null
      and l.latitude between ap.bbox_min_lat and ap.bbox_max_lat
      and l.longitude between ap.bbox_min_lng and ap.bbox_max_lng
    order by s.display_score desc
    limit ${POOL_SIZE}
    `,
  );
  return rows.map((r) => ({ entityId: r.entity_id, name: r.name }));
}

async function loadConnectionPool(
  restaurantIds: string[],
): Promise<{ connectionId: string }[]> {
  // Up to 2 connections per pool restaurant, restaurant-score order kept by
  // the caller's id order via array position join.
  const rows = await prisma.$queryRawUnsafe<{ connection_id: string }[]>(
    `
    with ranked as (
      select c.connection_id, c.restaurant_id,
             row_number() over (partition by c.restaurant_id order by c.mention_count desc nulls last) rn,
             array_position($1::uuid[], c.restaurant_id) as pool_rank
      from core_restaurant_items c
      where c.restaurant_id = any($1::uuid[])
    )
    select connection_id from ranked where rn <= 2 order by pool_rank, rn
    `,
    restaurantIds,
  );
  return rows.map((r) => ({ connectionId: r.connection_id }));
}

async function upsertList(
  ownerUserId: string,
  listType: 'restaurant' | 'dish',
  name: string,
  visibility: 'public' | 'private',
  useOwnPhotos = false,
): Promise<string> {
  const list = await prisma.favoriteList.upsert({
    where: { ownerUserId_listType_name: { ownerUserId, listType, name } },
    update: {},
    create: { ownerUserId, name, listType, visibility, useOwnPhotos },
    select: { listId: true },
  });
  return list.listId;
}

async function fillList(
  listId: string,
  ownerUserId: string,
  items: { restaurantId?: string; connectionId?: string }[],
): Promise<number> {
  await prisma.favoriteListItem.createMany({
    data: items.map((it, i) => ({
      listId,
      addedByUserId: ownerUserId,
      restaurantId: it.restaurantId ?? null,
      connectionId: it.connectionId ?? null,
      position: i,
    })),
    skipDuplicates: true,
  });
  const count = await prisma.favoriteListItem.count({ where: { listId } });
  await prisma.favoriteList.update({
    where: { listId },
    data: { itemCount: count },
  });
  return count;
}

const wrap = <T>(pool: T[], offset: number, size: number): T[] =>
  Array.from({ length: Math.min(size, pool.length) }).map(
    (_, i) => pool[(offset + i) % pool.length],
  );

async function seedLists(ownerUserId: string): Promise<void> {
  const pool = await loadPool();
  if (pool.length < 10) throw new Error('restaurant pool unexpectedly small');
  for (const spec of RESTAURANT_LISTS) {
    const listId = await upsertList(
      ownerUserId,
      'restaurant',
      spec.name,
      spec.visibility,
    );
    const picks = [
      ...new Set(wrap(pool, spec.offset, spec.size).map((p) => p.entityId)),
    ];
    const count = await fillList(
      listId,
      ownerUserId,
      picks.map((restaurantId) => ({ restaurantId })),
    );
    console.log(`list [restaurant] ${spec.name}: ${count} items`);
  }

  const connections = await loadConnectionPool(pool.map((p) => p.entityId));
  if (connections.length < 10) throw new Error('connection pool too small');
  for (const spec of DISH_LISTS) {
    const listId = await upsertList(
      ownerUserId,
      'dish',
      spec.name,
      spec.visibility,
    );
    const picks = [
      ...new Set(
        wrap(connections, spec.offset, spec.size).map((c) => c.connectionId),
      ),
    ];
    const count = await fillList(
      listId,
      ownerUserId,
      picks.map((connectionId) => ({ connectionId })),
    );
    console.log(`list [dish] ${spec.name}: ${count} items`);
  }
}

function configureCloudinary(): string {
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
  return process.env.CLOUDINARY_ENV_PREFIX || 'dev';
}

/** B: owner-attributed photos (side-copies of import assets) + My shots. */
async function seedOwnPhotos(ownerUserId: string): Promise<void> {
  const envPrefix = configureCloudinary();
  const restaurantIdByName = new Map<string, string>();
  for (const name of [...OWN_PHOTO_RESTAURANTS, ...MY_SHOTS_UNSHOT]) {
    const row = await prisma.entity.findFirst({
      where: { name, type: 'restaurant' },
      select: { entityId: true },
    });
    if (!row) throw new Error(`restaurant not found: ${name}`);
    restaurantIdByName.set(name, row.entityId);
  }

  for (const name of OWN_PHOTO_RESTAURANTS) {
    const restaurantId = restaurantIdByName.get(name)!;
    const existing = await prisma.photo.count({
      where: { restaurantId, userId: ownerUserId },
    });
    if (existing >= OWN_PHOTOS_PER_RESTAURANT) {
      console.log(`own photos: skip ${name} (${existing} already)`);
      continue;
    }
    const sources = await prisma.photo.findMany({
      where: { restaurantId, status: 'live', visibility: 'public' },
      orderBy: { uploadedAt: 'asc' },
      take: OWN_PHOTOS_PER_RESTAURANT - existing,
      select: { publicId: true },
    });
    if (!sources.length) {
      console.warn(
        `own photos: NO source assets yet at ${name} (run the google seeder first)`,
      );
      continue;
    }
    for (const source of sources) {
      const photoId = randomUUID();
      const publicId = `crave/${envPrefix}/photos/${photoId}`;
      const sourceUrl = cloudinary.url(source.publicId, {
        secure: true,
        sign_url: true,
        type: 'upload',
      });
      const upload = await cloudinary.uploader.upload(sourceUrl, {
        public_id: publicId,
        overwrite: false,
        resource_type: 'image',
      });
      await prisma.photo.create({
        data: {
          photoId,
          userId: ownerUserId,
          restaurantId,
          publicId,
          status: 'live',
          visibility: 'public',
          moderatedAt: new Date(),
          caption: `My shot at ${name}`,
          width: upload.width,
          height: upload.height,
          bytes: upload.bytes,
        },
      });
      console.log(`own photo created at ${name}`);
    }
  }

  const myShots = await upsertList(
    ownerUserId,
    'restaurant',
    MY_SHOTS_LIST,
    'public',
    true,
  );
  // Ensure the flag sticks even if the list pre-existed unflagged.
  await prisma.favoriteList.update({
    where: { listId: myShots },
    data: { useOwnPhotos: true },
  });
  const count = await fillList(
    myShots,
    ownerUserId,
    [...OWN_PHOTO_RESTAURANTS, ...MY_SHOTS_UNSHOT].map((name) => ({
      restaurantId: restaurantIdByName.get(name)!,
    })),
  );
  console.log(
    `list [restaurant] ${MY_SHOTS_LIST}: ${count} items (use_own_photos=true)`,
  );
}

/** C: link unlinked import photos to photo-less owner dish connections. */
async function linkConnectionPhotos(ownerUserId: string): Promise<void> {
  const importUserId = await userId(IMPORT_USER_EMAIL);
  const rows = await prisma.$queryRawUnsafe<
    { connection_id: string; restaurant_id: string; name: string }[]
  >(
    `
    select distinct c.connection_id, c.restaurant_id, r.name
    from favorite_list_items li
    join favorite_lists l on l.list_id = li.list_id and l.list_type = 'dish'
    join core_restaurant_items c on c.connection_id = li.connection_id
    join core_entities r on r.entity_id = c.restaurant_id
    where l.owner_user_id = '${ownerUserId}'::uuid
      and not exists (
        select 1 from photos p
        where p.connection_id = c.connection_id and p.status = 'live'
      )
    `,
  );
  let linked = 0;
  for (const row of rows) {
    const candidates = await prisma.photo.findMany({
      where: {
        restaurantId: row.restaurant_id,
        userId: importUserId,
        connectionId: null,
        status: 'live',
      },
      orderBy: { uploadedAt: 'desc' },
      take: 3,
      select: { photoId: true },
    });
    if (!candidates.length) {
      console.warn(
        `connection link: no free photos at ${row.name} (${row.connection_id})`,
      );
      continue;
    }
    await prisma.photo.updateMany({
      where: { photoId: { in: candidates.map((c) => c.photoId) } },
      data: { connectionId: row.connection_id },
    });
    linked += candidates.length;
    console.log(
      `connection link: ${row.name} ${row.connection_id} +${candidates.length}`,
    );
  }
  console.log(
    `connection links added: ${linked} (photo-less connections found: ${rows.length})`,
  );
}

async function main(): Promise<void> {
  const ownerUserId = await userId(OWNER_EMAIL);
  await seedLists(ownerUserId);
  await seedOwnPhotos(ownerUserId);
  await linkConnectionPhotos(ownerUserId);
  console.log('owner scale fixtures complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
