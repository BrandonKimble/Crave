import 'reflect-metadata';
import { PollsService } from './polls.service';

/**
 * F541 — rebuildPollLeaderboard did NOT redirect-resolve subject keys, so a
 * restaurant merged AFTER a direct tap-to-endorse silently split from (or was
 * lost against) the survivor's endorsements (comment spans self-heal; a stored
 * tap never does). The resolution now runs over the assembled endorser map.
 * These specs drive that resolver directly and assert merged subjects fold onto
 * the survivor with their endorser sets UNIONED. Mutation-capable: dropping the
 * redirect lookup leaves the two subjects split (distinctEndorsers wrong).
 */

const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SURVIVOR = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const FOOD = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

type ServicePrivate = {
  resolveLeaderboardSubjectRedirects(
    endorsers: Map<string, Set<string>>,
    composite: boolean,
  ): Promise<Map<string, Set<string>>>;
};

function createService(prisma: Record<string, unknown>): ServicePrivate {
  const logger = { setContext: () => logger };
  const m = {} as never;
  return new PollsService(
    prisma as never,
    logger as never,
    m,
    m,
    m,
    m,
    m,
    m,
    m,
    m,
    m,
    m,
    {
      loadLabels: () => Promise.resolve(new Map()),
      displayLabel: (entity: { name: string }) => entity.name,
      localizeRows: (rows: unknown[]) => Promise.resolve(rows),
    } as never,
  ) as unknown as ServicePrivate;
}

describe('rebuildPollLeaderboard redirect resolution (F541)', () => {
  it('merges a merged-after-tap restaurant subject onto the survivor, unioning endorsers', async () => {
    const prisma = {
      entityRedirect: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ fromEntityId: A, toEntityId: SURVIVOR }]),
      },
    };
    const service = createService(prisma);
    // Two subject keys that are really the same restaurant post-merge: the
    // stale tap id (A) with user u1, and the survivor id with user u2.
    const endorsers = new Map<string, Set<string>>([
      [A, new Set(['u1'])],
      [SURVIVOR, new Set(['u2'])],
    ]);
    const resolved = await service.resolveLeaderboardSubjectRedirects(
      endorsers,
      false,
    );
    expect([...resolved.keys()]).toEqual([SURVIVOR]);
    expect(resolved.get(SURVIVOR)).toEqual(new Set(['u1', 'u2']));
  });

  it('resolves BOTH halves of a connection (restaurant::dish) composite subject', async () => {
    const prisma = {
      entityRedirect: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ fromEntityId: A, toEntityId: SURVIVOR }]),
      },
    };
    const service = createService(prisma);
    const endorsers = new Map<string, Set<string>>([
      [`${A}::${FOOD}`, new Set(['u1'])],
    ]);
    const resolved = await service.resolveLeaderboardSubjectRedirects(
      endorsers,
      true,
    );
    expect([...resolved.keys()]).toEqual([`${SURVIVOR}::${FOOD}`]);
  });

  it('no redirects → the map is returned unchanged (single lookup, no drift)', async () => {
    const prisma = {
      entityRedirect: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = createService(prisma);
    const endorsers = new Map<string, Set<string>>([
      [SURVIVOR, new Set(['u2'])],
    ]);
    const resolved = await service.resolveLeaderboardSubjectRedirects(
      endorsers,
      false,
    );
    expect(resolved).toBe(endorsers);
  });
});
