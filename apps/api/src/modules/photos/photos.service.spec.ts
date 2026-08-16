/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PhotosService } from './photos.service';
import { ImageModerationUnavailableError } from '../external-integrations/google-vision/google-vision.service';

/**
 * Contract tests for the photo lifecycle (mocked Prisma/Cloudinary — the
 * contracts under test are ORDERING and STATE-MACHINE semantics: pending is
 * the only state moderation can move, is-food gates AFTER safety, removal
 * destroys the asset, reports auto-hide at threshold, reconciliation
 * expires abandoned tickets).
 */
function makeService(overrides?: {
  photo?: Record<string, unknown> | null;
  isItem?: boolean;
  safetyRejected?: boolean;
  safetyError?: Error;
  reportThreshold?: number;
  reporterCount?: number;
}) {
  const prisma = {
    entity: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ entityId: 'r1', type: 'place' }),
    },
    connection: {
      findUnique: jest.fn().mockResolvedValue({ placeId: 'r1' }),
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
          placeId: data.placeId,
          connectionId: data.connectionId ?? null,
          publicId: data.publicId,
          status: 'pending',
          caption: data.caption ?? null,
          takenAt: data.takenAt ?? null,
          ticketedAt: new Date(),
        }),
      ),
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          photoId: 'p1',
          userId: 'u1',
          placeId: 'r1',
          connectionId: null,
          publicId: 'crave/test/photos/p1',
          status: data?.status ?? 'pending',
          caption: null,
          takenAt: null,
          ticketedAt: new Date(),
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
    user: {
      findUnique: jest.fn().mockResolvedValue({ avatarUrl: null }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    // The avatar destroy-retry queue (F9701) is unacknowledged ops_alerts.
    opsAlert: {
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
    isAvatarPublicId: jest.fn().mockReturnValue(false),
    avatarPublicIdFor: jest.fn().mockReturnValue('crave/test/avatars/u1'),
    buildAvatarUrl: jest
      .fn()
      .mockReturnValue('https://res/img/upload/t/v99/crave/test/avatars/u1'),
  };
  const vision = {
    isItemContent: jest.fn().mockResolvedValue(overrides?.isItem ?? true),
  };
  // SAFETY moderation (D149-V): Google Vision SafeSearch, called by us.
  // Default = approved; `safetyError` makes every call throw, which is the
  // fail-CLOSED case the mutation tests below pin down.
  const safety = {
    moderateImage: jest.fn().mockImplementation(() => {
      if (overrides?.safetyError) {
        return Promise.reject(overrides.safetyError);
      }
      return Promise.resolve(
        overrides?.safetyRejected
          ? { decision: 'rejected', reason: 'adult:LIKELY', likelihoods: {} }
          : { decision: 'approved', likelihoods: {} },
      );
    }),
  };
  const opsAlerts = {
    emit: jest.fn(),
    acknowledge: jest.fn().mockResolvedValue(undefined),
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
    safety as never,
    {
      resolveSaveablePlace: (id: string) =>
        Promise.resolve({ entityId: id, name: 'R', city: null }),
      resolveSaveableItem: (id: string) =>
        Promise.resolve({ entityId: id, name: 'F', city: null }),
      resolveActiveByIds: (ids: string[]) =>
        Promise.resolve(
          new Map(
            ids.map((id) => [id, { entityId: id, name: 'E', city: null }]),
          ),
        ),
    } as never,
    opsAlerts as never,
    logger as never,
  );
  return { service, prisma, cloudinary, vision, safety, opsAlerts };
}

describe('PhotosService lifecycle', () => {
  it('ticket: validates restaurant + dish-belongs-to-restaurant, mints public_id server-side', async () => {
    const { service, prisma } = makeService();
    const result = await service.createUploadTicket({
      userId: 'u1',
      placeId: 'r1',
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
      placeId: 'OTHER',
    });
    await expect(
      service.createUploadTicket({
        userId: 'u1',
        placeId: 'r1',
        connectionId: 'c1',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('ticket: connectionId + pendingDishName together is a loud 400 (mutually exclusive)', async () => {
    const { service, prisma } = makeService();
    await expect(
      service.createUploadTicket({
        userId: 'u1',
        placeId: 'r1',
        connectionId: 'c1',
        pendingDishName: 'secret menu birria',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.photo.create).not.toHaveBeenCalled();
  });

  // THE STATE MACHINE IS DRIVEN THROUGH ITS REAL DOOR (F9700). These used to
  // call `applyModerationResult(id, publicId, 'approved')` with a bare string.
  // That call site was the hole: any future caller could hand the machine an
  // approval no moderator ever gave, and the type system had no opinion. The
  // verdict is a branded type minted only by `safetyVerdict` now, and the
  // method is private — so the tests drive the upload notification and let the
  // (mocked) moderator decide, which is also what production does.
  const uploadNotification = {
    public_id: 'crave/test/photos/p1',
    width: 100,
    bytes: 2000,
  };

  it('moderation approved + is-food -> LIVE (conditional transition from pending)', async () => {
    const { service, prisma } = makeService({ isItem: true });
    await service.handleNotification({ ...uploadNotification });
    const update = prisma.photo.updateMany.mock.calls.find(
      ([args]) =>
        args.data?.status === 'live' && args.where?.status === 'pending',
    );
    expect(update).toBeDefined();
  });

  it('a LOST transition race never double-settles (updateMany count 0 -> no side effects)', async () => {
    const { service, prisma, cloudinary } = makeService({
      isItem: true,
      safetyRejected: true,
    });
    prisma.photo.updateMany.mockResolvedValue({ count: 0 });
    await service.handleNotification({ ...uploadNotification });
    expect(cloudinary.destroyAsset).not.toHaveBeenCalled();
  });

  it('moderation approved but NOT food -> REMOVED, asset KEPT (auditable false-positives)', async () => {
    const { service, prisma, cloudinary } = makeService({ isItem: false });
    await service.handleNotification({ ...uploadNotification });
    const update = prisma.photo.updateMany.mock.calls.find(
      ([args]) => args.data?.status === 'removed',
    );
    expect(update).toBeDefined();
    expect(cloudinary.destroyAsset).not.toHaveBeenCalled();
  });

  it('safety-REJECTED -> REMOVED + asset destroyed', async () => {
    const { service, cloudinary } = makeService({ safetyRejected: true });
    await service.handleNotification({ ...uploadNotification });
    expect(cloudinary.destroyAsset).toHaveBeenCalled();
  });

  it('moderation rejected -> REMOVED; settled photos are never re-moved (idempotent replay)', async () => {
    const { service, cloudinary } = makeService({
      safetyRejected: true,
      photo: { photoId: 'p1', status: 'live', publicId: 'x' },
    });
    await service.handleNotification({ ...uploadNotification });
    expect(cloudinary.destroyAsset).not.toHaveBeenCalled(); // already settled
  });

  it('owner delete: someone else’s photo 404s (no 403/404 existence split); report threshold auto-hides', async () => {
    const { service } = makeService({
      photo: { photoId: 'p1', userId: 'OTHER', publicId: 'x', status: 'live' },
    });
    // NotFound — a Forbidden here would confirm the photo exists.
    await expect(service.deleteOwnPhoto('u1', 'p1')).rejects.toThrow(
      NotFoundException,
    );

    const { service: service2 } = makeService({
      photo: { photoId: 'p1', status: 'live', visibility: 'public' },
      reporterCount: 3,
    });
    const result = await service2.report('u9', 'p1');
    expect(result.hidden).toBe(true);
  });

  // ── SERVER-SIDE SAFETY MODERATION (D149-V) ─────────────────────────────
  // Moderation used to be a Cloudinary preset add-on; it is now a Vision
  // SafeSearch call we make on upload-finalize and on every reconciliation
  // sweep. These pin the two things that matter: a rejection removes the
  // photo, and a MODERATOR FAILURE NEVER PUBLISHES ONE.

  it('upload notification runs SafeSearch on the delivery URL; rejected -> destroy_pending -> asset destroyed', async () => {
    // MUTATION: make safetyVerdict return 'approved' on rejection, or drop
    // the moderateImage call from applyUploadResult, and this reds.
    const { service, cloudinary, safety } = makeService({
      safetyRejected: true,
    });
    await service.handleNotification({
      public_id: 'crave/test/photos/p1',
      width: 100,
      bytes: 2000,
    });
    expect(safety.moderateImage).toHaveBeenCalledWith('g'); // gallery variant
    expect(cloudinary.destroyAsset).toHaveBeenCalled();
  });

  it('SAFETY FAILS CLOSED: a Vision transport error leaves the photo PENDING — never approved', async () => {
    // THE fail-open mutation. Make safetyVerdict return 'approved' in its
    // catch (the posture PhotoVisionService's is-food gate correctly takes)
    // and this reds on both assertions: an unvetted photo would go live.
    const { service, prisma, vision, safety } = makeService({
      safetyError: new Error('ECONNRESET'),
    });
    await service.handleNotification({
      public_id: 'crave/test/photos/p1',
      width: 100,
      bytes: 2000,
    });
    expect(safety.moderateImage).toHaveBeenCalled();
    // No transition at all: no live, no removed, no destroy_pending.
    const transitions = prisma.photo.updateMany.mock.calls.filter(
      ([args]: [{ data?: { status?: string } }]) =>
        args.data?.status !== undefined,
    );
    expect(transitions).toHaveLength(0);
    // And the is-food gate never even ran — safety is the first door.
    expect(vision.isItemContent).not.toHaveBeenCalled();
  });

  it('the reconciliation sweep is the RETRY ARM: a still-pending row is re-moderated, and an unknown verdict is not counted as settled', async () => {
    // MUTATION: count an undefined verdict as settled (the lying counter) and
    // the `0` here reds; drop the safetyVerdict call from reconcilePending
    // and the moderateImage assertion reds — a photo stuck pending because
    // Vision was down would stay pending forever.
    const { service, prisma, cloudinary, safety } = makeService({
      safetyError: new Error('503 backend unavailable'),
    });
    // The asset exists and carries NO Cloudinary verdict — the add-on is gone.
    cloudinary.getAsset.mockResolvedValue({ exists: true, width: 10 });
    prisma.photo.findMany.mockImplementation(
      ({ where }: { where: { status: string } }) =>
        Promise.resolve(
          where.status === 'pending'
            ? [
                {
                  photoId: 'p1',
                  publicId: 'crave/test/photos/p1',
                  ticketedAt: new Date(),
                },
              ]
            : [],
        ),
    );
    prisma.photo.findUnique.mockResolvedValue({ status: 'pending' });
    const settled = await service.reconcilePending(0, 25);
    expect(safety.moderateImage).toHaveBeenCalled();
    expect(settled).toBe(0);
  });

  it('MUTATION (F9701): a rejected AVATAR whose destroy throws is PARKED and retried — never dropped', async () => {
    // THE DEFECT. Photos got `destroy_pending` in F9470; avatars kept two bare
    // `catch {}`s whose comment said the asset was "unreferenced either way".
    // The avatar public_id is `.../avatars/{userId}` and its delivery URL is
    // derivable, so a rejected image whose destroy failed stayed FETCHABLE —
    // the exact leak, minus the row to park in.
    //
    // MUTATION TO RE-RED: put the `catch {}` back (drop the opsAlerts.emit) and
    // the park assertion reds; drop `reconcileAvatarDestroys` from the sweep
    // and the retry assertion reds.
    const { service, cloudinary, prisma, opsAlerts } = makeService({
      safetyRejected: true,
    });
    cloudinary.isAvatarPublicId.mockReturnValue(true);
    cloudinary.destroyAsset.mockRejectedValueOnce(new Error('Cloudinary 5xx'));

    await service.handleNotification({
      public_id: 'crave/test/avatars/u1',
      version: 99,
      width: 256,
    });

    // PARKED: durable, deduped per user, and visible to the owner.
    const parked = opsAlerts.emit.mock.calls.find(
      ([a]: [{ kind: string }]) => a.kind === 'avatar_destroy_pending',
    );
    expect(parked).toBeDefined();
    expect(parked[0].dedupeKey).toBe('avatar_destroy_pending:u1');
    expect(parked[0].body).toContain('version=99');

    // RETRIED: the sweep drains the queue and acknowledges only on success.
    prisma.opsAlert.findMany.mockResolvedValueOnce([
      {
        alertId: 'a1',
        dedupeKey: 'avatar_destroy_pending:u1',
        body: 'version=99',
      },
    ]);
    const before = cloudinary.destroyAsset.mock.calls.length;
    await service.reconcilePending();
    expect(cloudinary.destroyAsset.mock.calls.length).toBe(before + 1);
    expect(opsAlerts.acknowledge).toHaveBeenCalledWith('a1');
  });

  it('F9701: the retry stands down when a NEWER, approved avatar now occupies the id', async () => {
    // The destroy is not versioned — it kills whatever is at the public_id
    // now. If the user has since had an avatar APPROVED, retrying would delete
    // the good one, which is a worse bug than the leak.
    const { service, cloudinary, prisma, opsAlerts } = makeService();
    prisma.opsAlert.findMany.mockResolvedValueOnce([
      {
        alertId: 'a1',
        dedupeKey: 'avatar_destroy_pending:u1',
        body: 'version=99',
      },
    ]);
    prisma.user.findUnique.mockResolvedValueOnce({
      avatarUrl: 'https://res/img/upload/t/v200/crave/test/avatars/u1',
    });
    await service.reconcilePending();
    expect(cloudinary.destroyAsset).not.toHaveBeenCalled();
    expect(opsAlerts.acknowledge).toHaveBeenCalledWith('a1');
  });

  it('F9703: an image Vision can never read SETTLES — a permanent OUR-SIDE failure does not', async () => {
    // The paid-retry bound. `scope: 'image'` + non-transient is the one answer
    // that will never change, so re-asking buys the same sentence every ten
    // minutes forever. It settles (removed, asset destroyed, never approved).
    const imageError = new ImageModerationUnavailableError(
      'cannot fetch',
      false,
      'image',
    );
    const { service, prisma, cloudinary } = makeService({
      safetyError: imageError,
    });
    await service.handleNotification({ ...uploadNotification });
    const parked = prisma.photo.updateMany.mock.calls.find(
      ([args]: [{ data?: { status?: string } }]) =>
        args.data?.status === 'destroy_pending',
    );
    expect(parked).toBeDefined();
    expect(cloudinary.destroyAsset).toHaveBeenCalled();

    // …and the SERVICE-side permanent failure (a 403, a missing key) must NOT
    // settle anything: that would turn one config mistake into mass deletion.
    const serviceError = new ImageModerationUnavailableError(
      'denied',
      false,
      'service',
    );
    const { service: s2, prisma: p2 } = makeService({
      safetyError: serviceError,
    });
    await s2.handleNotification({ ...uploadNotification });
    const transitions = p2.photo.updateMany.mock.calls.filter(
      ([args]: [{ data?: { status?: string } }]) =>
        args.data?.status !== undefined,
    );
    expect(transitions).toHaveLength(0);
  });

  it('F9703: a backlog stuck pending for days rings the bell (the retry stays unbounded, the silence does not)', async () => {
    const { service, prisma, opsAlerts } = makeService();
    prisma.photo.count.mockResolvedValue(7);
    await service.reconcilePending();
    const alert = opsAlerts.emit.mock.calls.find(
      ([a]: [{ kind: string }]) => a.kind === 'photos_stuck_pending',
    );
    expect(alert).toBeDefined();
    expect(alert[0].title).toContain('7 photo(s)');
  });

  it('report: a photo INVISIBLE to the reporter 404s (no private-photo oracle, no hiding what you can’t see)', async () => {
    // live+private, reporter is a stranger -> 404 (owner-only surface).
    const { service } = makeService({
      photo: {
        photoId: 'p1',
        userId: 'owner',
        status: 'live',
        visibility: 'private',
      },
    });
    await expect(service.report('stranger', 'p1')).rejects.toThrow(
      NotFoundException,
    );
    // pending (not yet public), stranger -> 404.
    const { service: service2 } = makeService({
      photo: {
        photoId: 'p1',
        userId: 'owner',
        status: 'pending',
        visibility: 'public',
      },
    });
    await expect(service2.report('stranger', 'p1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('report persists the "what\'s wrong" reason (nullable)', async () => {
    const { service, prisma } = makeService({
      photo: { photoId: 'p1', status: 'live', visibility: 'public' },
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
      photo: { photoId: 'p1', status: 'live', visibility: 'public' },
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
        placeId: 'r1',
        connectionId: null,
        caption: null,
        takenAt: null,
        ticketedAt: new Date(),
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
        placeId: 'r1',
        connectionId: null,
        caption: null,
        takenAt: null,
        ticketedAt: new Date(),
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
    await service.createUploadTicket({ userId: 'u1', placeId: 'r1' });
    expect(prisma.photo.create.mock.calls[0][0].data.visibility).toBe('public');
    await service.createUploadTicket({
      userId: 'u1',
      placeId: 'r1',
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
        ticketedAt: new Date(Date.now() - 2 * 60 * 60_000),
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

  it('F622: a Cloudinary failure on the HEAD-of-queue photo does not wedge the sweep — later photos still settle', async () => {
    const { service, prisma, cloudinary } = makeService();
    prisma.photo.findMany.mockResolvedValueOnce([
      {
        photoId: 'p-head-broken',
        publicId: 'crave/test/photos/p-head-broken',
        ticketedAt: new Date(Date.now() - 20 * 60_000),
      },
      {
        photoId: 'p-tail-ok',
        publicId: 'crave/test/photos/p-tail-ok',
        ticketedAt: new Date(Date.now() - 15 * 60_000),
      },
    ]);
    cloudinary.getAsset
      .mockRejectedValueOnce(new Error('Cloudinary ECONNRESET'))
      .mockResolvedValueOnce({
        exists: true,
        width: 100,
        height: 100,
        bytes: 1000,
        focusScore: 0.5,
        moderationStatus: 'approved',
      });

    const settled = await service.reconcilePending();

    // The second (tail) photo settled even though the first (head) failed.
    expect(settled).toBe(1);
    expect(cloudinary.getAsset).toHaveBeenCalledTimes(2);
    const tailUpdate = prisma.photo.update.mock.calls.find(
      ([args]) => args.where.photoId === 'p-tail-ok',
    );
    expect(tailUpdate).toBeDefined();
    // The broken head photo never got an update call from the failed branch.
    const headUpdate = prisma.photo.update.mock.calls.find(
      ([args]) => args.where.photoId === 'p-head-broken',
    );
    expect(headUpdate).toBeUndefined();
  });

  it('F9470: a destroy that THROWS parks the row in destroy_pending (never `removed` while the asset lives) and the sweep retries until the asset is gone', async () => {
    const { service, prisma, cloudinary } = makeService({
      safetyRejected: true,
    });

    // Reject moderation, but the destroy call fails (transient Cloudinary
    // outage). The row must NOT flip to `removed` — the asset is still alive.
    cloudinary.destroyAsset.mockRejectedValueOnce(new Error('Cloudinary 5xx'));
    await service.handleNotification({ ...uploadNotification });

    // Parked, not removed: pending -> destroy_pending happened, but nothing
    // flipped it to `removed` (that would strand the still-present asset — the
    // exact leak F9470 is about).
    const removedEarly = prisma.photo.updateMany.mock.calls.find(
      ([args]) => args.data?.status === 'removed',
    );
    expect(removedEarly).toBeUndefined();
    const parked = prisma.photo.updateMany.mock.calls.find(
      ([args]) => args.data?.status === 'destroy_pending',
    );
    expect(parked).toBeDefined();

    // The reconciliation sweep finds the destroy_pending row; destroy now
    // succeeds -> asset destroyed AND the row finally becomes `removed`.
    prisma.photo.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where?.status === 'destroy_pending'
          ? [{ photoId: 'p1', publicId: 'crave/test/photos/p1' }]
          : [],
      ),
    );
    const destroyCallsBefore = cloudinary.destroyAsset.mock.calls.length;
    await service.reconcilePending();

    // Retried exactly once more (the successful attempt).
    expect(cloudinary.destroyAsset.mock.calls.length).toBe(
      destroyCallsBefore + 1,
    );
    const finalized = prisma.photo.updateMany.mock.calls.find(
      ([args]) =>
        args.where?.status === 'destroy_pending' &&
        args.data?.status === 'removed',
    );
    expect(finalized).toBeDefined();
  });
});
