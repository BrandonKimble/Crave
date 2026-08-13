import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import configuration from '../src/config/configuration';
import { CloudinaryService } from '../src/modules/photos/cloudinary.service';
import { SaveableEntityResolver } from '../src/modules/entities/saveable-entity.resolver';
import { PhotoVisionService } from '../src/modules/photos/photo-vision.service';
import { PhotosService } from '../src/modules/photos/photos.service';
import { HttpService } from '@nestjs/axios';
import axios from 'axios';
import { GoogleVisionService } from '../src/modules/external-integrations/google-vision/google-vision.service';
import { UsageLedgerService } from '../src/modules/external-integrations/shared/usage-ledger.service';
import { OpsAlertsService } from '../src/modules/external-integrations/shared/ops-alerts.service';
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
  // PhotoVisionService rides the Gemini gateway now; the e2e probe stubs it
  // with a permissive double (this script tests the upload/moderation flow,
  // not the paid classifier).
  const fakeLlm = {
    generateForCaller: async () => 'YES',
  } as unknown as import('../src/modules/external-integrations/llm/llm.service').LLMService;
  const vision = new PhotoVisionService(fakeLlm, fakeLogger);
  // SAFETY moderation is REAL here (D149-V): the whole point of this probe
  // is that a live upload settles, and settling now depends on our own Vision
  // SafeSearch call rather than a Cloudinary preset add-on. It writes a real
  // google_vision ledger line, which is a fraction of a cent per run.
  // The spend gate is a constructor argument now (D4): the vendor's dollar
  // gate lives inside its one door, like every other vendor's. This probe
  // makes a real, gated call, and it is not the place to exercise an
  // exhausted budget — the verdict is 'open' so the flow under test is the
  // upload/moderation flow.
  const openSpendGate = {
    visionSpendVerdict: () => Promise.resolve('open' as const),
  } as unknown as import('../src/modules/external-integrations/governance/governance.service').GovernanceService;
  const safety = new GoogleVisionService(
    new HttpService(axios.create()),
    fakeConfig,
    new UsageLedgerService(prisma, fakeLogger),
    openSpendGate,
    fakeLogger,
  );
  const photos = new PhotosService(
    prisma,
    fakeConfig,
    cloudinary,
    vision,
    safety,
    new SaveableEntityResolver(prisma),
    new OpsAlertsService(prisma, fakeLogger),
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
