/**
 * The residue drain keeps ALL FIVE of the segmenter's output arrays
 * (entity-type coverage audit F-3). The prompt and schema have emitted an
 * `ingredients` array all along; the drain hand-copied four arms and threw
 * the fifth away — the exact F3800 forgot-a-group defect, one system
 * upstream of the one already fixed. Staging showed ZERO ingredient
 * on-demand rows ever recorded.
 *
 * The mapping now derives from QUERY_ENTITY_GROUP_KEYS, so this spec proves
 * the end-to-end consequence: an ingredient answer from the segmenter
 * becomes a typed on-demand request — and every other group still does too.
 */
import { EntityType } from '@prisma/client';
import { UnsegmentedResidueService } from './unsegmented-residue.service';
import { QUERY_ENTITY_GROUP_KEYS } from './dto/search-query.dto';

describe('UnsegmentedResidueService — ingredient residue becomes typed demand (F-3)', () => {
  function build(analysis: Record<string, string[]>) {
    const pendingRow = {
      residueId: 'residue-1',
      residueText: 'something with yuzu kosho',
      engineIds: ['engine-1'],
      userId: 'user-1',
      searchRequestId: 'req-1',
      detectedLocale: 'en',
      context: {},
    };
    const prisma = {
      onDemandUnsegmentedResidue: {
        findMany: jest.fn().mockResolvedValue([pendingRow]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const llmService = {
      interpretResidue: jest.fn().mockResolvedValue(analysis),
    };
    const onDemand = {
      recordRequests: jest.fn().mockResolvedValue(undefined),
    };
    const logger = {
      setContext: () => logger,
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    const service = new UnsegmentedResidueService(
      prisma as never,
      llmService as never,
      onDemand as never,
      logger as never,
    );
    return { service, onDemand, prisma };
  }

  it('records an ingredient answer as an ingredient-typed on-demand request', async () => {
    const { service, onDemand } = build({
      places: [],
      items: [],
      itemAttributes: [],
      placeAttributes: [],
      ingredients: ['yuzu kosho'],
    });
    await service.drainBatch();
    expect(onDemand.recordRequests).toHaveBeenCalledTimes(1);
    const [requests] = onDemand.recordRequests.mock.calls[0] as [
      Array<{ term: string; entityType: EntityType }>,
    ];
    expect(requests).toEqual([
      expect.objectContaining({
        term: 'yuzu kosho',
        entityType: EntityType.ingredient,
      }),
    ]);
  });

  it('maps every group of the search vocabulary — no arm can be dropped again', async () => {
    const analysis: Record<string, string[]> = {};
    for (const key of QUERY_ENTITY_GROUP_KEYS) {
      analysis[key] = [`term-${key}`];
    }
    const { service, onDemand } = build(analysis);
    await service.drainBatch();
    const [requests] = onDemand.recordRequests.mock.calls[0] as [
      Array<{ term: string; entityType: EntityType }>,
    ];
    expect(requests.map((request) => request.entityType).sort()).toEqual(
      [...Object.values(EntityType)].sort(),
    );
    expect(requests).toHaveLength(QUERY_ENTITY_GROUP_KEYS.length);
  });

  it('discards a residue whose segmentation names nothing, unchanged behaviour', async () => {
    const { service, onDemand, prisma } = build({
      places: [],
      items: [],
      itemAttributes: [],
      placeAttributes: [],
      ingredients: [],
    });
    await service.drainBatch();
    expect(onDemand.recordRequests).not.toHaveBeenCalled();
    const updateArgs = prisma.onDemandUnsegmentedResidue.updateMany.mock
      .calls[0] as [{ data: { status: string } }];
    expect(updateArgs[0].data.status).toBe('discarded');
  });
});
