import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { CloudinaryService } from '../src/modules/photos/cloudinary.service';
import { PhotoReadService } from '../src/modules/photos/photo-read.service';

/** Composite probe (RED-capable): every connection in the owner's dish-side
 *  lists must return a non-empty CARD STRIP through the REAL read path
 *  (PhotoReadService.cardStrips keyed by connectionId — what dish result
 *  cards consume). Exits non-zero listing any photo-less connection. */
const prisma = new PrismaClient();
const logger = {
  setContext: () => ({
    warn: console.warn,
    log: () => {},
    error: console.error,
    debug: () => {},
  }),
};
const config = {
  get: (k: string) =>
    (
      ({
        'cloudinary.cloudName': process.env.CLOUDINARY_CLOUD_NAME,
        'cloudinary.apiKey': process.env.CLOUDINARY_API_KEY,
        'cloudinary.apiSecret': process.env.CLOUDINARY_API_SECRET,
        'cloudinary.webhookSecret': process.env.CLOUDINARY_WEBHOOK_SECRET,
        'cloudinary.envPrefix': process.env.CLOUDINARY_ENV_PREFIX,
        'cloudinary.uploadPreset': process.env.CLOUDINARY_UPLOAD_PRESET,
        'cloudinary.notificationUrl': process.env.CLOUDINARY_NOTIFICATION_URL,
      }) as Record<string, string | undefined>
    )[k],
};

async function main(): Promise<void> {
  const cloudinary = new CloudinaryService(config as never, logger as never);
  const photoRead = new PhotoReadService(prisma as never, cloudinary);

  const rows = await prisma.$queryRawUnsafe<
    {
      list_name: string;
      connection_id: string;
      restaurant_id: string;
      restaurant: string;
      dish: string;
    }[]
  >(
    `
    select distinct l.name as list_name, c.connection_id, c.restaurant_id,
           r.name as restaurant, f.name as dish
    from favorite_list_items li
    join favorite_lists l on l.list_id = li.list_id and l.list_type = 'dish'
    join users u on u.user_id = l.owner_user_id
      and u.email = 'kimble.brandonm@gmail.com'
    join core_restaurant_items c on c.connection_id = li.connection_id
    join core_entities r on r.entity_id = c.restaurant_id
    join core_entities f on f.entity_id = c.food_id
    order by l.name, r.name
    `,
  );
  const { strips } = await photoRead.cardStrips(
    rows.map((row) => ({
      restaurantId: row.restaurant_id,
      connectionId: row.connection_id,
    })),
  );
  const byKey = new Map(strips.map((s) => [s.key, s]));
  let empty = 0;
  for (const row of rows) {
    const strip = byKey.get(row.connection_id);
    const n = strip?.photos.length ?? 0;
    if (!n) {
      empty += 1;
      console.error(
        `RED: [${row.list_name}] ${row.restaurant} / ${row.dish} — 0 photos (${row.connection_id})`,
      );
    }
  }
  console.log(
    `dish connections probed: ${rows.length}; with photos: ${rows.length - empty}; empty: ${empty}`,
  );
  console.log(
    empty ? 'DISH-CONNECTION PROBE: FAIL' : 'DISH-CONNECTION PROBE: PASS',
  );
  if (empty) process.exitCode = 1;
}
void main().finally(() => prisma.$disconnect());
