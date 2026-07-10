import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import configuration from '../src/config/configuration';
import { CloudinaryService } from '../src/modules/photos/cloudinary.service';
import { PhotoVisionService } from '../src/modules/photos/photo-vision.service';
import { PhotosService } from '../src/modules/photos/photos.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { LoggerService } from '../src/shared';

/**
 * LIVE E2E for the photo pipeline (plans/images-ideal-shape.md steps 1-2):
 * ticket -> direct multipart upload to Cloudinary (exactly what the app
 * will do) -> webhook/reconciliation settles moderation -> LIVE -> delivery
 * URL serves -> EXIF GPS is verified STRIPPED from the delivered variant
 * while takenAt survived into the DB.
 *
 *   yarn ts-node scripts/photo-e2e.ts /tmp/crave-e2e-photo.jpg
 */
// Manual construction (entitlement-spec pattern) — the services only need
// config/logger/prisma; booting the Nest graph pulls the whole app.
const config = configuration();
const fakeConfig = {
  get: (key: string) =>
    key
      .split('.')
      .reduce<unknown>(
        (value, part) =>
          value && typeof value === 'object'
            ? (value as Record<string, unknown>)[part]
            : undefined,
        config,
      ),
} as never;
const fakeLogger = {
  setContext: () => fakeLogger,
  info: (m: string, x?: unknown) => console.log(m, x ?? ''),
  warn: (m: string, x?: unknown) => console.warn(m, x ?? ''),
  error: (m: string, x?: unknown) => console.error(m, x ?? ''),
  debug: () => undefined,
} as unknown as LoggerService;

async function main(): Promise<void> {
  const imagePath = process.argv[2] ?? '/tmp/crave-e2e-photo.jpg';
  const prismaClient = new PrismaClient();
  const prisma = prismaClient as unknown as PrismaService;
  const cloudinary = new CloudinaryService(fakeConfig, fakeLogger);
  const fakeLedger = {
    record: () => undefined,
  } as unknown as import('../src/modules/external-integrations/shared/usage-ledger.service').UsageLedgerService;
  const vision = new PhotoVisionService(fakeConfig, fakeLedger, fakeLogger);
  const photos = new PhotosService(
    prisma,
    fakeConfig,
    cloudinary,
    vision,
    fakeLogger,
  );
  const out = (message: string) => process.stdout.write(`${message}\n`);
  try {
    const user = await prisma.user.findFirst({
      where: { email: 'entitlement-spec@test.local' },
      select: { userId: true },
    });
    if (!user) throw new Error('probe user missing');
    const connection = await prisma.connection.findFirst({
      where: {},
      select: { connectionId: true, restaurantId: true },
    });
    if (!connection) throw new Error('no connection rows in dev DB');

    // 1. Ticket
    const { photo, ticket } = await photos.createUploadTicket({
      userId: user.userId,
      restaurantId: connection.restaurantId,
      connectionId: connection.connectionId,
      caption: 'photo pipeline E2E',
    });
    out(`🎫 ticket: ${ticket.publicId}`);

    // 2. Direct multipart upload (exactly the client's call)
    const form = [
      '-F',
      `file=@${imagePath}`,
      '-F',
      `api_key=${ticket.apiKey}`,
      '-F',
      `timestamp=${ticket.timestamp}`,
      '-F',
      `signature=${ticket.signature}`,
      '-F',
      `public_id=${ticket.publicId}`,
      '-F',
      `upload_preset=${ticket.uploadPreset}`,
    ];
    if (ticket.notificationUrl) {
      form.push('-F', `notification_url=${ticket.notificationUrl}`);
    }
    const uploadResponse = execFileSync(
      'curl',
      ['-s', ...form, ticket.uploadUrl],
      { encoding: 'utf8' },
    );
    const upload = JSON.parse(uploadResponse) as Record<string, unknown>;
    if (upload.error) {
      throw new Error(`upload failed: ${JSON.stringify(upload.error)}`);
    }
    out(
      `⬆️  uploaded: ${String(upload.width)}x${String(upload.height)} bytes=${String(upload.bytes)} moderation=${JSON.stringify(
        (upload.moderation as unknown[]) ?? 'none',
      )}`,
    );
    const metadata = upload.media_metadata as
      | Record<string, string>
      | undefined;
    out(
      `📸 EXIF in upload response: DateTimeOriginal=${metadata?.DateTimeOriginal ?? 'MISSING'} (GPS present in response: ${Boolean(
        metadata?.GPSLatitude,
      )})`,
    );

    // 3. Wait for webhook/reconciliation to settle the status
    let status = 'pending';
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const row = await prisma.photo.findUnique({
        where: { photoId: photo.photoId },
        select: {
          status: true,
          takenAt: true,
          focusScore: true,
          width: true,
        },
      });
      status = row?.status ?? 'missing';
      if (status !== 'pending') {
        out(
          `✅ settled: status=${status} takenAt=${row?.takenAt?.toISOString() ?? 'null'} focus=${row?.focusScore ?? 'null'} width=${row?.width ?? 'null'}`,
        );
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    if (status === 'pending') {
      out('⏳ still pending after 60s — forcing a reconciliation sweep');
      await photos.reconcilePending(0);
      const row = await prisma.photo.findUnique({
        where: { photoId: photo.photoId },
        select: { status: true, takenAt: true, focusScore: true },
      });
      out(
        `🔁 after reconcile: status=${row?.status} takenAt=${row?.takenAt?.toISOString() ?? 'null'} focus=${row?.focusScore ?? 'null'}`,
      );
      status = row?.status ?? status;
    }

    // 4. Delivery URL + GPS-stripped verification
    const fresh = await photos.getPhoto(photo.photoId);
    out(`🌐 thumb: ${fresh.urls.thumb}`);
    execFileSync('curl', [
      '-s',
      '-o',
      '/tmp/crave-e2e-thumb.bin',
      fresh.urls.thumb,
    ]);
    const exif = execFileSync(
      'exiftool',
      ['-GPSLatitude', '-DateTimeOriginal', '/tmp/crave-e2e-thumb.bin'],
      { encoding: 'utf8' },
    );
    out(
      `🔒 delivered-variant EXIF (must show NO GPS):\n${exif.trim() || '   (no EXIF at all — fully stripped)'}`,
    );
  } finally {
    await prismaClient.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
