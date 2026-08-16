/**
 * `restaurantGallery` PAGINATES OVER A UNIQUE ORDER (F3103) — against a
 * REAL Postgres (integration).
 *
 * Why a DB spec: the defect is skip/take pagination over `ticketed_at DESC`
 * with no unique tiebreak. Batch uploads mint identical-timestamp rows
 * (ticketedAt is stamped at ticket time); Postgres gives tied rows no
 * stable order, so a page boundary crossing a tie can DUPLICATE a photo on
 * page N+1 or drop one entirely. Only a real planner deciding real row
 * order can demonstrate that. Same determinism law as F1902/F3102.
 *
 * Three photos share ONE ticketed_at and straddle a limit-2 page boundary.
 * Explicit photo_ids are inserted in ASCENDING id order, so under
 * `photo_id DESC` the required output is the REVERSE of insertion order —
 * a run that fell back to physical (insertion) order goes RED instead of
 * passing vacuously.
 *
 * MUTATION-CAPABLE: drop `{ photoId: 'desc' }` from restaurantGallery's
 * findMany orderBy (photo-read.service.ts) and this spec is free to go RED
 * (a duplicated or dropped photo across the two pages, or a non-DESC
 * ordering) — nothing else constrains the tied rows' relative order.
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev/mirror database, never prod)
 * It FAILS LOUDLY without one rather than skipping.
 */
import { PrismaClient } from '@prisma/client';
import { PhotoReadService } from './photo-read.service';

const TEST_TAG = 'itest-gallery-tiebreak';

const prisma = new PrismaClient();

const cloudinaryStub = {
  buildUrls: (publicId: string) => ({
    thumb: `stub://${publicId}/thumb`,
    card: `stub://${publicId}/card`,
    full: `stub://${publicId}/full`,
  }),
} as never;

const service = new PhotoReadService(prisma as never, cloudinaryStub);

// Ascending ids — inserted in this order; `photo_id DESC` must emit P3,P2,P1.
const P1 = '00000000-0000-4000-8000-00000000f103';
const P2 = '77777777-7777-4777-8777-77777777f103';
const P3 = 'ffffffff-ffff-4fff-8fff-fffffffff103';
const TIED_AT = new Date('2026-08-01T12:00:00.000Z');

let placeId: string;
let userId: string;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required — this spec proves a SQL ordering under pagination and must not be skipped',
    );
  }
  const place = await prisma.entity.create({
    data: { name: `${TEST_TAG}-restaurant`, type: 'place' },
  });
  placeId = place.entityId;
  const user = await prisma.user.create({
    data: { email: `${TEST_TAG}@example.test` },
  });
  userId = user.userId;

  for (const photoId of [P1, P2, P3]) {
    await prisma.photo.create({
      data: {
        photoId,
        userId,
        placeId,
        publicId: `${TEST_TAG}-${photoId}`,
        status: 'live',
        visibility: 'public',
        // The tie: identical ticket timestamps, as a batch upload mints.
        ticketedAt: TIED_AT,
      },
    });
  }
});

afterAll(async () => {
  await prisma.photo.deleteMany({
    where: { photoId: { in: [P1, P2, P3] } },
  });
  await prisma.user.deleteMany({ where: { userId } });
  await prisma.entity.deleteMany({ where: { entityId: placeId } });
  await prisma.$disconnect();
});

describe('restaurantGallery: tied ticketed_at rows page without dup/drop (F3103)', () => {
  it('a limit-2 page boundary across the tie yields each photo exactly once, in photo_id DESC order, across repeated runs', async () => {
    // Run several times: a physical-row-order defect is a planning decision,
    // not guaranteed to flip on every single execution.
    for (let i = 0; i < 5; i++) {
      const page1 = await service.placeGallery(placeId, {
        limit: 2,
        offset: 0,
      });
      const page2 = await service.placeGallery(placeId, {
        limit: 2,
        offset: 2,
      });
      const ids = [...page1.all, ...page2.all].map((p) => p.photoId);
      // No duplicate, no drop — the union of the two pages is the whole set…
      expect([...ids].sort()).toEqual([P1, P2, P3].sort());
      // …and the order is the specified unique order, not insertion order.
      expect(ids).toEqual([P3, P2, P1]);
      expect(page1.totalCount).toBe(3);
    }
  });
});
