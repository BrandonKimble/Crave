/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { PhotoEventService, MAX_EVENT_COUNT } from './photo-event.service';

/**
 * Contract: the per-event count clamp must admit the client's full coalesce
 * batch (photo-events-buffer flushes at 50) — a lower server clamp silently
 * halves legitimate impression counts — while still flooring at 1 and
 * rejecting self-servable inflation above the clamp.
 */
function makeService(liveIds: string[]) {
  const prisma = {
    photo: {
      findMany: jest
        .fn()
        .mockResolvedValue(liveIds.map((photoId) => ({ photoId }))),
    },
    photoEvent: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const logger = {
    setContext: () => logger,
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const service = new PhotoEventService(prisma as never, logger as never);
  return { service, prisma };
}

describe('PhotoEventService count clamp', () => {
  it('matches the client coalesce threshold (50) — a full flush is not halved', async () => {
    expect(MAX_EVENT_COUNT).toBe(50);
    const { service, prisma } = makeService(['p1', 'p2', 'p3']);
    service.record('u1', [
      { photoId: 'p1', eventType: 'impression' as never, count: 50 },
      { photoId: 'p2', eventType: 'impression' as never, count: 9999 },
      { photoId: 'p3', eventType: 'impression' as never, count: 0 },
    ]);
    await service.onModuleDestroy(); // flush pending writes
    const rows = prisma.photoEvent.createMany.mock.calls[0][0].data as Array<{
      photoId: string;
      eventCount: number;
    }>;
    expect(rows.find((r) => r.photoId === 'p1')?.eventCount).toBe(50);
    expect(rows.find((r) => r.photoId === 'p2')?.eventCount).toBe(50);
    expect(rows.find((r) => r.photoId === 'p3')?.eventCount).toBe(1);
  });
});
