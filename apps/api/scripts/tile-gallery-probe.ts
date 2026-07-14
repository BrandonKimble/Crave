import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { CloudinaryService } from '../src/modules/photos/cloudinary.service';
import { PhotoReadService } from '../src/modules/photos/photo-read.service';
import { FavoriteListMapper } from '../src/modules/favorites/favorite-list.mappers';
import { FavoriteListTileGalleryService } from '../src/modules/favorites/favorite-list-tile-gallery.service';

/** Composite probe (no Nest bootstrap): run the REAL tile-gallery service
 *  against the live dev DB for the owner's lists and print the slots. */
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
  const mapper = new FavoriteListMapper(prisma as never, logger as never);
  const service = new FavoriteListTileGalleryService(
    prisma as never,
    mapper,
    photoRead,
  );
  const lists = await prisma.favoriteList.findMany({
    where: { owner: { email: 'kimble.brandonm@gmail.com' } },
    select: {
      listId: true,
      name: true,
      ownerUserId: true,
      useOwnPhotos: true,
    },
  });
  const tiles = await service.loadTileImages(lists);
  for (const l of lists) {
    const t = tiles.get(l.listId) ?? [];
    console.log(
      `${l.name}${l.useOwnPhotos ? ' [own photos]' : ''}: ${t.length} tiles`,
    );
    for (const tile of t)
      console.log(
        `  slot ${tile.slot} ${tile.restaurantId} ${tile.thumbUrl.slice(0, 90)}`,
      );
  }

  // ── Own-photos law probe (RED-capable): for every flagged list, every
  // returned photo must belong to the list owner; and re-running the SAME
  // list unflagged must be able to differ (global pool). ────────────────
  const flagged = lists.filter((l) => l.useOwnPhotos);
  let failures = 0;
  for (const l of flagged) {
    for (const tile of tiles.get(l.listId) ?? []) {
      const row = await prisma.photo.findUnique({
        where: { photoId: tile.photoId },
        select: { userId: true },
      });
      if (row?.userId !== l.ownerUserId) {
        failures += 1;
        console.error(
          `RED: list "${l.name}" slot ${tile.slot} photo ${tile.photoId} belongs to ${row?.userId}, not the owner`,
        );
      }
    }
    const globalTiles = await service.loadTileImages([
      { ...l, useOwnPhotos: false },
    ]);
    console.log(
      `own-vs-global "${l.name}": own=${(tiles.get(l.listId) ?? []).length} global=${(globalTiles.get(l.listId) ?? []).length}`,
    );
  }
  console.log(
    flagged.length
      ? failures
        ? `OWN-PHOTOS PROBE: ${failures} FAILURE(S)`
        : 'OWN-PHOTOS PROBE: PASS'
      : 'OWN-PHOTOS PROBE: no flagged lists (nothing exercised)',
  );
  if (failures) process.exitCode = 1;
}
void main().finally(() => prisma.$disconnect());
