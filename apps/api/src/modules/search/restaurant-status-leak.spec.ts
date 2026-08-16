import 'reflect-metadata';
import { PlaceStatusService } from './restaurant-status.service';
import { entityRedirectDouble } from '../../shared/testing/prisma-doubles';

/**
 * F510 (restaurant-status.service) — getStatusPreviews read entities by id with
 * no `status <> archived` filter and no redirect resolution, so a restaurant
 * tapped just before it was merged/archived leaked a stale preview. These specs
 * seed the redirect + archived conditions against a mock prisma and assert the
 * survivor is served (under the caller's requested id) and the archived one is
 * dropped. Mutation-capable: removing the redirect lookup or the status filter
 * turns these RED.
 */

const REQUESTED = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SURVIVOR = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function createService(prisma: Record<string, unknown>): PlaceStatusService {
  const logger = { setContext: () => logger };
  return new PlaceStatusService(prisma as never, logger as never);
}

describe('RestaurantStatusService leak closure (F510)', () => {
  it('resolves a redirected id to the survivor and answers under the requested id', async () => {
    const prisma = {
      // F2202: the redirect table keys on its input — a row is served only if
      // the query ASKED for that fromEntityId. Unconditionally resolving the
      // redirect left the lookup key unpinned, so a resolver that asked about
      // nothing (the very F510 leak) kept this spec green.
      entityRedirect: {
        findMany: jest.fn(
          (args: { where: { fromEntityId: { in: string[] } } }) =>
            Promise.resolve(
              args.where.fromEntityId.in.includes(REQUESTED)
                ? [{ fromEntityId: REQUESTED, toEntityId: SURVIVOR }]
                : [],
            ),
        ),
      },
      entity: {
        findMany: jest.fn().mockResolvedValue([
          {
            entityId: SURVIVOR,
            placeMetadata: null,
            _count: { locations: 2 },
            primaryLocation: null,
          },
        ]),
      },
    };
    const service = createService(prisma);
    const out = await service.getStatusPreviews({
      placeIds: [REQUESTED],
    } as never);
    expect(out).toHaveLength(1);
    // Preview data comes from the survivor, keyed to the caller's asked id.
    expect(out[0].placeId).toBe(REQUESTED);
    expect(out[0].locationCount).toBe(2);
    // The read targets the survivor and excludes archived.
    const where = (
      prisma.entity.findMany.mock.calls[0] as [
        { where: { entityId: { in: string[] }; status: unknown } },
      ]
    )[0].where;
    expect(where.entityId.in).toContain(SURVIVOR);
    expect(where.status).toEqual({ not: 'archived' });
  });

  it('drops an archived restaurant (not returned by the status-filtered read)', async () => {
    const prisma = {
      entityRedirect: entityRedirectDouble([]),
      entity: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = createService(prisma);
    const out = await service.getStatusPreviews({
      placeIds: [REQUESTED],
    } as never);
    expect(out).toHaveLength(0);
  });
});
