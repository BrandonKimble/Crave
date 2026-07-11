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
  reporterCount?: number;
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
    photoReport: {
      create: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(overrides?.reporterCount ?? 1),
    },
    photo: {
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          photoId: data.photoId ?? 'p1',
          userId: data.userId,
          restaurantId: data.restaurantId,
          connectionId: data.connectionId ?? null,
          publicId: data.publicId,
          status: 'pending',
          caption: data.caption ?? null,
          takenAt: data.takenAt ?? null,
          uploadedAt: new Date(),
        }),
      ),
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
    signUploadTicket: jest.fn().mockImplementation((id: string) => ({
      uploadUrl: 'https://api.cloudinary.com/v1_1/test/image/upload',
      apiKey: 'k',
      timestamp: 1,
      signature: 's',
      publicId: `crave/test/photos/${id}`,
      uploadPreset: 'crave_ugc_photo',
    })),
    buildUrls: jest.fn().mockReturnValue({
      thumb: 't',
      card: 'c',
      gallery: 'g',
      full: 'f',
    }),
    destroyAsset: jest.fn().mockResolvedValue(undefined),
    getAsset: jest.fn().mockResolvedValue({ exists: false }),
    extractModerationStatus: jest.fn().mockReturnValue(undefined),
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
    // ONE create carries the REAL publicId (no placeholder row, ever) and
    // the id is app-generated.
    const createArgs = prisma.photo.create.mock.calls[0][0];
    expect(createArgs.data.publicId).toBe(
      `crave/test/photos/${createArgs.data.photoId}`,
    );
    expect(result.photo.photoId).toBe(createArgs.data.photoId);

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

  it('moderation approved + is-food -> LIVE (conditional transition from pending)', async () => {
    const { service, prisma } = makeService({ isFood: true });
    await service.applyModerationResult(
      'p1',
      'crave/test/photos/p1',
      'approved',
    );
    const update = prisma.photo.updateMany.mock.calls.find(
      ([args]) =>
        args.data?.status === 'live' && args.where?.status === 'pending',
    );
    expect(update).toBeDefined();
  });

  it('a LOST transition race never double-settles (updateMany count 0 -> no side effects)', async () => {
    const { service, prisma, cloudinary } = makeService({ isFood: true });
    prisma.photo.updateMany.mockResolvedValue({ count: 0 });
    await service.applyModerationResult(
      'p1',
      'crave/test/photos/p1',
      'rejected',
    );
    expect(cloudinary.destroyAsset).not.toHaveBeenCalled();
  });

  it('moderation approved but NOT food -> REMOVED, asset KEPT (auditable false-positives)', async () => {
    const { service, prisma, cloudinary } = makeService({ isFood: false });
    await service.applyModerationResult(
      'p1',
      'crave/test/photos/p1',
      'approved',
    );
    const update = prisma.photo.updateMany.mock.calls.find(
      ([args]) => args.data?.status === 'removed',
    );
    expect(update).toBeDefined();
    expect(cloudinary.destroyAsset).not.toHaveBeenCalled();
  });

  it('safety-REJECTED -> REMOVED + asset destroyed', async () => {
    const { service, cloudinary } = makeService();
    await service.applyModerationResult(
      'p1',
      'crave/test/photos/p1',
      'rejected',
    );
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

    const { service: service2 } = makeService({
      photo: { photoId: 'p1', status: 'live' },
      reporterCount: 3,
    });
    const result = await service2.report('u9', 'p1');
    expect(result.hidden).toBe(true);
  });

  it('report persists the "what\'s wrong" reason (nullable)', async () => {
    const { service, prisma } = makeService({
      photo: { photoId: 'p1', status: 'live' },
      reporterCount: 1,
    });
    await service.report('u1', 'p1', 'not_food');
    expect(prisma.photoReport.create).toHaveBeenCalledWith({
      data: { photoId: 'p1', userId: 'u1', reason: 'not_food' },
    });

    await service.report('u2', 'p1');
    expect(prisma.photoReport.create).toHaveBeenLastCalledWith({
      data: { photoId: 'p1', userId: 'u2', reason: null },
    });
  });

  it('duplicate report by the same user is a no-op (unique index dedup)', async () => {
    const { service, prisma } = makeService({
      photo: { photoId: 'p1', status: 'live' },
      reporterCount: 3,
    });
    const { Prisma } = jest.requireActual('@prisma/client');
    prisma.photoReport.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'x',
      }),
    );
    const result = await service.report('u1', 'p1');
    expect(result.hidden).toBe(false);
    expect(prisma.photo.updateMany).not.toHaveBeenCalled();
  });

  it('visibility: non-live photos are owner-only', async () => {
    const { service } = makeService({
      photo: {
        photoId: 'p1',
        userId: 'owner',
        publicId: 'x',
        status: 'hidden',
        restaurantId: 'r1',
        connectionId: null,
        caption: null,
        takenAt: null,
        uploadedAt: new Date(),
      },
    });
    await expect(service.getPhoto('p1', 'someone-else')).rejects.toThrow(
      'Photo not found',
    );
    const own = await service.getPhoto('p1', 'owner');
    expect(own.photoId).toBe('p1');
  });

  it('visibility: a LIVE but PRIVATE photo is owner-only', async () => {
    const { service } = makeService({
      photo: {
        photoId: 'p1',
        userId: 'owner',
        publicId: 'x',
        status: 'live',
        visibility: 'private',
        restaurantId: 'r1',
        connectionId: null,
        caption: null,
        takenAt: null,
        uploadedAt: new Date(),
      },
    });
    await expect(service.getPhoto('p1', 'someone-else')).rejects.toThrow(
      'Photo not found',
    );
    const own = await service.getPhoto('p1', 'owner');
    expect(own.photoId).toBe('p1');
    expect(own.visibility).toBe('private');
  });

  it('ticket: visibility lands on the row at create (default public, explicit private)', async () => {
    const { service, prisma } = makeService();
    await service.createUploadTicket({ userId: 'u1', restaurantId: 'r1' });
    expect(prisma.photo.create.mock.calls[0][0].data.visibility).toBe('public');
    await service.createUploadTicket({
      userId: 'u1',
      restaurantId: 'r1',
      visibility: 'private',
    });
    expect(prisma.photo.create.mock.calls[1][0].data.visibility).toBe(
      'private',
    );
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
