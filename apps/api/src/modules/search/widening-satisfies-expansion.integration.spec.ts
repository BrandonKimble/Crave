import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { SearchSiblingExpansionService } from './search-sibling-expansion.service';
import { identityInsertData } from '../content-processing/entity-resolver/entity-identity';

/**
 * THE ATTRIBUTE/INGREDIENT WIDENING READS, proven against a live database
 * (owner ruling 2026-08-30 — the item satisfies reader's laws applied to the
 * new kinds): DIRECTED per edge, redirect-followed one hop, archived-without-
 * redirect dropped, rejects never read, columns derived from the widened
 * entity's TYPE, and fail-open on any read error.
 */
describe('widening satisfies expansion — proven against a live database', () => {
  const prisma = new PrismaClient();
  const made: string[] = [];
  let service: SearchSiblingExpansionService;

  const mint = async (
    name: string,
    type: 'place_attribute' | 'item_attribute' | 'ingredient',
    archived = false,
  ): Promise<string> => {
    const id = randomUUID();
    const identity = identityInsertData(name, type as never);
    await prisma.$executeRawUnsafe(
      `INSERT INTO core_entities (entity_id, name, type, status, identity_key, identity_key_sorted)
       VALUES ($1::uuid, $2, $3::entity_type, $4::entity_status, $5, $6)`,
      id,
      name,
      type,
      archived ? 'archived' : 'active',
      identity.identityKey,
      identity.identityKeySorted,
    );
    made.push(id);
    return id;
  };

  const edge = (from: string, to: string, relation: string) =>
    prisma.$executeRawUnsafe(
      `INSERT INTO entity_satisfies (from_entity_id, to_entity_id, relation, prompt_version)
       VALUES ($1::uuid, $2::uuid, $3, 2)`,
      from,
      to,
      relation,
    );

  beforeAll(() => {
    service = new SearchSiblingExpansionService(
      prisma as never,
      { setContext: () => ({ warn: () => {}, info: () => {} }) } as never,
    );
  });

  afterAll(async () => {
    if (made.length) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM entity_satisfies WHERE from_entity_id = ANY($1::uuid[]) OR to_entity_id = ANY($1::uuid[])`,
        made,
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM entity_redirects WHERE from_entity_id = ANY($1::uuid[])`,
        made,
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM core_entities WHERE entity_id = ANY($1::uuid[])`,
        made,
      );
    }
    await prisma.$disconnect();
  });

  it('maps widened attributes to the column their TYPE dictates', async () => {
    const pub = await mint(
      `zzqw pub ${randomUUID().slice(0, 8)}`,
      'place_attribute',
    );
    const bar = await mint(
      `zzqw bar ${randomUUID().slice(0, 8)}`,
      'place_attribute',
    );
    const crispy = await mint(
      `zzqw crispy ${randomUUID().slice(0, 8)}`,
      'item_attribute',
    );
    await edge(pub, bar, 'satisfies');
    await edge(pub, crispy, 'satisfies');

    const arms = await service.getSatisfiesAttributeArms([pub]);
    expect(arms.get(pub)).toEqual(
      expect.arrayContaining([
        { id: bar, column: 'restaurant_attributes' },
        { id: crispy, column: 'food_attributes' },
      ]),
    );
  });

  it('is DIRECTED — the reverse of an attribute edge is not readable', async () => {
    const a = await mint(
      `zzqw dir a ${randomUUID().slice(0, 8)}`,
      'place_attribute',
    );
    const b = await mint(
      `zzqw dir b ${randomUUID().slice(0, 8)}`,
      'place_attribute',
    );
    await edge(a, b, 'satisfies');

    expect((await service.getSatisfiesAttributeArms([a])).get(a)).toEqual([
      { id: b, column: 'restaurant_attributes' },
    ]);
    expect((await service.getSatisfiesAttributeArms([b])).size).toBe(0);
  });

  it('never reads a reject or a cousin as an attribute widening', async () => {
    const anchor = await mint(
      `zzqw rej anchor ${randomUUID().slice(0, 8)}`,
      'item_attribute',
    );
    const rejected = await mint(
      `zzqw rejected ${randomUUID().slice(0, 8)}`,
      'item_attribute',
    );
    const cousin = await mint(
      `zzqw cousin ${randomUUID().slice(0, 8)}`,
      'item_attribute',
    );
    await edge(anchor, rejected, 'reject');
    await edge(anchor, cousin, 'cousin');

    expect((await service.getSatisfiesAttributeArms([anchor])).size).toBe(0);
  });

  it('follows a merged-away attribute target through its redirect', async () => {
    const anchor = await mint(
      `zzqw redir anchor ${randomUUID().slice(0, 8)}`,
      'place_attribute',
    );
    const survivor = await mint(
      `zzqw survivor ${randomUUID().slice(0, 8)}`,
      'place_attribute',
    );
    const loser = await mint(
      `zzqw loser ${randomUUID().slice(0, 8)}`,
      'place_attribute',
      true,
    );
    await edge(anchor, loser, 'satisfies');
    await prisma.$executeRawUnsafe(
      `INSERT INTO entity_redirects (from_entity_id, to_entity_id) VALUES ($1::uuid, $2::uuid)`,
      loser,
      survivor,
    );

    expect(
      (await service.getSatisfiesAttributeArms([anchor])).get(anchor),
    ).toEqual([{ id: survivor, column: 'restaurant_attributes' }]);
  });

  it('drops an archived attribute target with no redirect', async () => {
    const anchor = await mint(
      `zzqw arch anchor ${randomUUID().slice(0, 8)}`,
      'place_attribute',
    );
    const dead = await mint(
      `zzqw dead ${randomUUID().slice(0, 8)}`,
      'place_attribute',
      true,
    );
    await edge(anchor, dead, 'satisfies');

    expect((await service.getSatisfiesAttributeArms([anchor])).size).toBe(0);
  });

  it('widens ingredients asked-side only, satisfies only, directed', async () => {
    const bacon = await mint(
      `zzqw bacon ${randomUUID().slice(0, 8)}`,
      'ingredient',
    );
    const pancetta = await mint(
      `zzqw pancetta ${randomUUID().slice(0, 8)}`,
      'ingredient',
    );
    const tofu = await mint(
      `zzqw tofu ${randomUUID().slice(0, 8)}`,
      'ingredient',
    );
    await edge(bacon, pancetta, 'satisfies');
    await edge(bacon, tofu, 'reject');

    expect(await service.getSatisfiesIngredientIds([bacon])).toEqual([
      pancetta,
    ]);
    // directed: the pancetta asker is a different question
    expect(await service.getSatisfiesIngredientIds([pancetta])).toEqual([]);
  });

  it('an attribute edge never leaks into the ingredient read (kind isolation)', async () => {
    const anchor = await mint(
      `zzqw iso anchor ${randomUUID().slice(0, 8)}`,
      'ingredient',
    );
    const attr = await mint(
      `zzqw iso attr ${randomUUID().slice(0, 8)}`,
      'item_attribute',
    );
    await edge(anchor, attr, 'satisfies');
    expect(await service.getSatisfiesIngredientIds([anchor])).toEqual([]);
  });

  it('fails open on a read error (search runs unwidened, never down)', async () => {
    const broken = new SearchSiblingExpansionService(
      {
        $queryRaw: () => Promise.reject(new Error('boom')),
      } as never,
      { setContext: () => ({ warn: () => {}, info: () => {} }) } as never,
    );
    expect((await broken.getSatisfiesAttributeArms([randomUUID()])).size).toBe(
      0,
    );
    expect(await broken.getSatisfiesIngredientIds([randomUUID()])).toEqual([]);
  });
});
