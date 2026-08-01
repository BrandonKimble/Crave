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
    // raws: 2 topic array_replace + 6 endorsement (3 shapes × delete+update)
    // + 1 comment entity_spans rewrite
    expect(calls.filter((call) => call.table === '$executeRaw')).toHaveLength(
      9,
    );
  });

  it('rekeys poll endorsements in all THREE subject shapes (bare uuid + both composite halves), dropping collisions first', async () => {
    // Red team 2026-08-01 R2: subject_id is FK-free; a merge that misses any
    // shape silently un-counts the user's vote.
    const { tx, calls } = buildTx();
    await service().rehomeEntityAnchors(tx as never, WINNER, LOSER);
    const raws = calls
      .filter((call) => call.table === '$executeRaw')
      .map((call) => JSON.stringify(call.args));
    const endorsementRaws = raws.filter((text) =>
      text.includes('poll_endorsements'),
    );
    expect(endorsementRaws).toHaveLength(6);
    expect(
      endorsementRaws.filter((text) => text.includes('DELETE FROM')),
    ).toHaveLength(3);
    // both composite halves are handled
    expect(
      endorsementRaws.filter((text) => text.includes('split_part')),
    ).toHaveLength(4);
  });

  it('rewrites entityId inside poll_comments.entity_spans JSONB', async () => {
    const { tx, calls } = buildTx();
    await service().rehomeEntityAnchors(tx as never, WINNER, LOSER);
    const spanRaws = calls
      .filter((call) => call.table === '$executeRaw')
      .map((call) => JSON.stringify(call.args))
      .filter((text) => text.includes('poll_comments'));
    expect(spanRaws).toHaveLength(1);
    expect(spanRaws[0]).toContain('jsonb_set');
    expect(spanRaws[0]).toContain('entityId');
  });

  it('list-item fold keeps the user note and earlier position instead of discarding them (R3)', async () => {
    const { tx, calls } = buildTx();
    const updates: unknown[] = [];
    const deletes: unknown[] = [];
    (tx as Record<string, unknown>).userListItem = {
      findMany: () =>
        Promise.resolve([
          {
            itemId: 'loser-item',
            listId: 'list-1',
            note: 'my note',
            position: 1,
          },
        ]),
      findFirst: () =>
        Promise.resolve({ itemId: 'winner-item', note: null, position: 5 }),
      update: (args: unknown) => {
        updates.push(args);
        return Promise.resolve({});
      },
      delete: (args: unknown) => {
        deletes.push(args);
        return Promise.resolve({});
      },
    };
    await service().rehomeUserListItems(
      tx as never,
      'connectionId',
      SURVIVING_CONNECTION,
      FOLDED_CONNECTION,
    );
    expect(updates).toHaveLength(1);
    expect(JSON.stringify(updates[0])).toContain('my note');
    expect(JSON.stringify(updates[0])).toContain('"position":1');
    expect(deletes).toHaveLength(1);
    expect(JSON.stringify(deletes[0])).toContain('loser-item');
    void calls;
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
