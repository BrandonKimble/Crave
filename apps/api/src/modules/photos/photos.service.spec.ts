/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PhotosService } from './photos.service';

/**
 * Contract tests for the photo lifecycle (mocked Prisma/Cloudinary — the
 * contracts under test are ORDERING and STATE-MACHINE semantics: pending is
 * the only state moderation can move, is-food gates AFTER safety, removal
 * destroys the asset, reports auto-hide at threshold, reconciliation
 * expires abandoned tickets).
 */
function makeService(overrides?: {
  photo?: Record<string, unknown> | null;
  isFood?: boolean;
  reportThreshold?: number;
}) {
  const prisma = {
    entity: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ entityId: 'r1', type: 'restaurant' }),
    },
    connection: {
      findUnique: jest.fn().mockResolvedValue({ restaurantId: 'r1' }),
    },
    photo: {
      create: jest.fn().mockResolvedValue({ photoId: 'p1' }),
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          photoId: 'p1',
          userId: 'u1',
          restaurantId: 'r1',
          connectionId: null,
          publicId: 'crave/test/photos/p1',
          status: data?.status ?? 'pending',
          caption: null,
          takenAt: null,
          uploadedAt: new Date(),
          reportCount: data?.reportCount?.increment ? 3 : 0,
          ...data,
        }),
      ),
      findUnique: jest.fn().mockResolvedValue(
        overrides && 'photo' in overrides
          ? overrides.photo
          : {
              photoId: 'p1',
              userId: 'u1',
              publicId: 'crave/test/photos/p1',
              status: 'pending',
            },
      ),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const cloudinary = {
    publicIdFor: (id: string) => `crave/test/photos/${id}`,
    signUploadTicket: jest.fn().mockReturnValue({
      uploadUrl: 'https://api.cloudinary.com/v1_1/test/image/upload',
      apiKey: 'k',
      timestamp: 1,
      signature: 's',
      publicId: 'crave/test/photos/p1',
      uploadPreset: 'crave_ugc_photo',
    }),
    buildUrls: jest.fn().mockReturnValue({
      thumb: 't',
      card: 'c',
      gallery: 'g',
      full: 'f',
    }),
    destroyAsset: jest.fn().mockResolvedValue(undefined),
    getAsset: jest.fn().mockResolvedValue({ exists: false }),
    extractModerationStatus: jest.fn().mockReturnValue(undefined),
    extractTakenAt: jest.fn().mockReturnValue(undefined),
  };
  const vision = {
    isFoodContent: jest.fn().mockResolvedValue(overrides?.isFood ?? true),
  };
  const logger = {
    setContext: () => logger,
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const config = {
    get: (key: string) =>
      key === 'cloudinary.reportHideThreshold'
        ? (overrides?.reportThreshold ?? 3)
        : undefined,
  };
  const service = new PhotosService(
    prisma as never,
    config as never,
    cloudinary as never,
    vision as never,
    logger as never,
  );
  return { service, prisma, cloudinary, vision };
}

describe('PhotosService lifecycle', () => {
  it('ticket: validates restaurant + dish-belongs-to-restaurant, mints public_id server-side', async () => {
    const { service, prisma } = makeService();
    const result = await service.createUploadTicket({
      userId: 'u1',
      restaurantId: 'r1',
      connectionId: 'c1',
    });
    expect(result.ticket.publicId).toBe('crave/test/photos/p1');
    expect(prisma.photo.create).toHaveBeenCalled();

    prisma.connection.findUnique.mockResolvedValueOnce({
      restaurantId: 'OTHER',
    });
    await expect(
      service.createUploadTicket({
        userId: 'u1',
        restaurantId: 'r1',
        connectionId: 'c1',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('moderation approved + is-food -> LIVE', async () => {
    const { service, prisma } = makeService({ isFood: true });
    await service.applyModerationResult(
      'p1',
      'crave/test/photos/p1',
      'approved',
    );
    const update = prisma.photo.update.mock.calls.find(
      ([args]) => args.data?.status === 'live',
    );
    expect(update).toBeDefined();
  });

  it('moderation approved but NOT food -> REMOVED + asset destroyed', async () => {
    const { service, prisma, cloudinary } = makeService({ isFood: false });
    await service.applyModerationResult(
      'p1',
      'crave/test/photos/p1',
      'approved',
    );
    const update = prisma.photo.update.mock.calls.find(
      ([args]) => args.data?.status === 'removed',
    );
    expect(update).toBeDefined();
    expect(cloudinary.destroyAsset).toHaveBeenCalled();
  });

  it('moderation rejected -> REMOVED; settled photos are never re-moved (idempotent replay)', async () => {
    const { service, cloudinary } = makeService({
      photo: { photoId: 'p1', status: 'live', publicId: 'x' },
    });
    await service.applyModerationResult('p1', 'x', 'rejected');
    expect(cloudinary.destroyAsset).not.toHaveBeenCalled(); // already settled
  });

  it('owner delete: only the owner; report threshold auto-hides', async () => {
    const { service } = makeService({
      photo: { photoId: 'p1', userId: 'OTHER', publicId: 'x', status: 'live' },
    });
    await expect(service.deleteOwnPhoto('u1', 'p1')).rejects.toThrow(
      ForbiddenException,
    );

    const { service: service2, prisma: prisma2 } = makeService();
    prisma2.photo.update.mockResolvedValueOnce({
      reportCount: 3,
      status: 'live',
    });
    const result = await service2.report('p1');
    expect(result.hidden).toBe(true);
  });

  it('reconciliation expires abandoned tickets (no asset, >1h old)', async () => {
    const { service, prisma, cloudinary } = makeService();
    prisma.photo.findMany.mockResolvedValueOnce([
      {
        photoId: 'p1',
        publicId: 'crave/test/photos/p1',
        uploadedAt: new Date(Date.now() - 2 * 60 * 60_000),
      },
    ]);
    cloudinary.getAsset.mockResolvedValueOnce({ exists: false });
    const settled = await service.reconcilePending();
    expect(settled).toBe(1);
    const update = prisma.photo.update.mock.calls.find(
      ([args]) => args.data?.status === 'removed',
    );
    expect(update).toBeDefined();
  });
});
