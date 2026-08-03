import 'reflect-metadata';
import { EntityType } from '@prisma/client';
import { AutocompleteService } from './autocomplete.service';

/**
 * F570 / F571 / F572 — the injected personal lanes (favorites, viewed) and the
 * entity-resolver name refetch used to read user engagement facts with NO
 * status filter and NO redirect resolution, so an archived or merged-away
 * entity leaked into autocomplete with its stale id + name. These specs seed
 * exactly that condition against a mock prisma and assert the leak is closed:
 * archived survivors drop, merged ids follow the one-hop redirect to the
 * survivor's id AND name. Mutation-capable — deleting the status/redirect
 * handling in resolveInjectedSubjects / resolveViaEntityResolver turns each
 * assertion RED.
 */

const REQUESTED = '11111111-1111-1111-1111-111111111111';
const SURVIVOR = '22222222-2222-2222-2222-222222222222';
const ARCHIVED = '33333333-3333-3333-3333-333333333333';

type ServicePrivate = {
  resolveInjectedSubjects(
    matches: unknown[],
  ): Promise<Array<{ entityId: string; name: string; status?: string }>>;
  resolveViaEntityResolver(...args: unknown[]): Promise<unknown[]>;
  entityResolutionService: unknown;
};

function createService(prisma: Record<string, unknown>): ServicePrivate {
  const logger = {
    setContext: () => logger,
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const redis = {
    getOrThrow: () => ({
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    }),
  };
  return new AutocompleteService(
    logger as never,
    redis as never,
    {} as never,
    {} as never,
    {} as never,
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  ) as unknown as ServicePrivate;
}

const match = (entityId: string, name: string): Record<string, unknown> => ({
  entityId,
  entityType: EntityType.restaurant,
  name,
  confidence: 0.65,
  aliases: [],
  matchType: 'entity',
  badges: { favorite: true },
});

describe('autocomplete injected-lane leak closure (F570/F571)', () => {
  it('follows a one-hop redirect: serves the SURVIVOR id AND name, not the stale ones', async () => {
    const prisma = {
      entityRedirect: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { fromEntityId: REQUESTED, toEntityId: SURVIVOR },
          ]),
      },
      entity: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ entityId: SURVIVOR, name: 'Survivor Name' }]),
      },
    };
    const service = createService(prisma);
    const resolved = await service.resolveInjectedSubjects([
      match(REQUESTED, 'Stale Name'),
    ]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].entityId).toBe(SURVIVOR);
    expect(resolved[0].name).toBe('Survivor Name');
  });

  it('drops an archived survivor entirely (never in the findMany result set)', async () => {
    const prisma = {
      entityRedirect: { findMany: jest.fn().mockResolvedValue([]) },
      // The status filter means an archived entity simply is not returned.
      entity: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = createService(prisma);
    const resolved = await service.resolveInjectedSubjects([
      match(ARCHIVED, 'Archived Spot'),
    ]);
    expect(resolved).toHaveLength(0);
    // Proof the status guard is on the query, not a post-filter:
    const where = (
      prisma.entity.findMany.mock.calls[0] as [{ where: { status: unknown } }]
    )[0].where;
    expect(where.status).toEqual({ not: 'archived' });
  });

  it('dedupes two saved rows that collapse onto one survivor', async () => {
    const other = '44444444-4444-4444-4444-444444444444';
    const prisma = {
      entityRedirect: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ fromEntityId: other, toEntityId: SURVIVOR }]),
      },
      entity: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ entityId: SURVIVOR, name: 'Survivor Name' }]),
      },
    };
    const service = createService(prisma);
    const resolved = await service.resolveInjectedSubjects([
      match(SURVIVOR, 'Survivor Name'),
      match(other, 'Old Alias'),
    ]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].entityId).toBe(SURVIVOR);
  });
});

describe('autocomplete resolver name-refetch archived guard (F572)', () => {
  it('an archived resolver hit is dropped (name refetch filters status, canonicalName undefined)', async () => {
    const entityResolutionService = {
      resolveBatch: jest.fn().mockResolvedValue({
        resolutionResults: [
          {
            entityId: ARCHIVED,
            confidence: 0.9,
            entityType: EntityType.restaurant,
            matchedName: null,
            originalInput: { aliases: [] },
          },
        ],
      }),
    };
    // The status-filtered refetch returns nothing for the archived id.
    const prisma = {
      entity: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = createService(prisma);
    service.entityResolutionService = entityResolutionService;
    const matches = await service.resolveViaEntityResolver(
      { query: 'ghost' },
      'ghost',
      EntityType.restaurant,
      8,
    );
    expect(matches).toHaveLength(0);
    const where = (
      prisma.entity.findMany.mock.calls[0] as [{ where: { status: unknown } }]
    )[0].where;
    expect(where.status).toEqual({ not: 'archived' });
  });
});
