import 'reflect-metadata';
import { EntityAnchorRehomeService } from './entity-anchor-rehome.service';
import { LoggerService } from '../../../shared';

const WINNER = '11111111-1111-1111-1111-111111111111';
const LOSER = '22222222-2222-2222-2222-222222222222';
const SURVIVING_CONNECTION = '33333333-3333-3333-3333-333333333333';
const FOLDED_CONNECTION = '44444444-4444-4444-4444-444444444444';

/**
 * The shared user-anchor rehome law (red team 2026-07-31): BOTH merge
 * services delegate here, so every user-anchored table is hard-rekeyed by
 * one implementation. Before this, the food merge repointed only
 * user_list_items — poll dish targets, curated items, and photos were left
 * on archived losers, and folding a duplicate connection CASCADE-DELETED
 * curated picks and photos (connection_id is onDelete: Cascade on both).
 */
function buildTx() {
  const calls: Array<{ table: string; args: unknown }> = [];
  const record =
    (table: string) =>
    (args: unknown): Promise<{ count: number }> => {
      calls.push({ table, args });
      return Promise.resolve({ count: 0 });
    };
  const tx = {
    pollTopic: { updateMany: record('pollTopic') },
    curatedListItem: { updateMany: record('curatedListItem') },
    photo: { updateMany: record('photo') },
    onDemandRequest: {
      findMany: () => Promise.resolve([]),
      updateMany: record('onDemandRequest'),
    },
    demandScoringCandidate: {
      findMany: () => Promise.resolve([]),
    },
    $executeRaw: (...args: unknown[]) => {
      calls.push({ table: '$executeRaw', args });
      return Promise.resolve(0);
    },
  };
  return { tx, calls };
}

function service(): EntityAnchorRehomeService {
  const logger = {
    setContext: () => logger,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  } as unknown as LoggerService;
  return new EntityAnchorRehomeService(logger);
}

describe('EntityAnchorRehomeService', () => {
  it('rekeys ALL FOUR poll target columns plus both topic id arrays', async () => {
    const { tx, calls } = buildTx();
    await service().rehomeEntityAnchors(tx as never, WINNER, LOSER);
    const pollWheres = calls
      .filter((call) => call.table === 'pollTopic')
      .map((call) => Object.keys((call.args as { where: object }).where)[0])
      .sort();
    expect(pollWheres).toEqual([
      'targetDishId',
      'targetFoodAttributeId',
      'targetRestaurantAttributeId',
      'targetRestaurantId',
    ]);
    // the raw array_replace updates for category_entity_ids/seed_entity_ids
    expect(calls.filter((call) => call.table === '$executeRaw')).toHaveLength(
      2,
    );
  });

  it('rekeys curated list entity+restaurant columns and photo restaurants', async () => {
    const { tx, calls } = buildTx();
    await service().rehomeEntityAnchors(tx as never, WINNER, LOSER);
    const curated = calls.filter((call) => call.table === 'curatedListItem');
    expect(curated).toHaveLength(2);
    for (const call of curated) {
      expect(JSON.stringify(call.args)).toContain(WINNER);
      expect(JSON.stringify(call.args)).toContain(LOSER);
    }
    expect(calls.filter((call) => call.table === 'photo')).toHaveLength(1);
  });

  it('connection fold repoints curated picks AND photos to the survivor (cascade-delete guard)', async () => {
    const { tx, calls } = buildTx();
    await service().rehomeConnectionAnchors(
      tx as never,
      SURVIVING_CONNECTION,
      FOLDED_CONNECTION,
    );
    const byTable = (table: string) =>
      calls.filter((call) => call.table === table);
    expect(byTable('curatedListItem')).toHaveLength(1);
    expect(byTable('photo')).toHaveLength(1);
    for (const call of calls) {
      const text = JSON.stringify(call.args);
      expect(text).toContain(FOLDED_CONNECTION); // where
      expect(text).toContain(SURVIVING_CONNECTION); // data
    }
  });
});
