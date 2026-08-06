import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { SearchSiblingExpansionService } from './search-sibling-expansion.service';
import { identityInsertData } from '../content-processing/entity-resolver/entity-identity';

/**
 * THE SUBSTITUTABILITY READ on the hot search path (concept-graph rung 4).
 *
 * It decides what lands in the FRONT section, which under the ranking
 * invariant is the most expensive place to be wrong — a false tier-0 claim
 * with a high Crave Score ranks FIRST. So each property is proven, not assumed:
 * the edge is DIRECTED, a merged-away target is followed through its redirect
 * rather than vanishing, an archived target without a redirect is dropped, and
 * a `reject` verdict never reaches search at all.
 */
describe('satisfies expansion — proven against a live database', () => {
  const prisma = new PrismaClient();
  const made: string[] = [];
  let service: SearchSiblingExpansionService;

  const mintFood = async (name: string, archived = false): Promise<string> => {
    const id = randomUUID();
    const identity = identityInsertData(name, 'food' as never);
    await prisma.$executeRawUnsafe(
      `INSERT INTO core_entities (entity_id, name, type, status, identity_key, identity_key_sorted)
       VALUES ($1::uuid, $2, 'food'::entity_type, $3::entity_status, $4, $5)`,
      id,
      name,
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
       VALUES ($1::uuid, $2::uuid, $3, 1)`,
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

  it('splits satisfies into tier 0 and cousin into tier 1, and drops rejects', async () => {
    const anchor = await mintFood(`zzq anchor ${randomUUID().slice(0, 8)}`);
    const sat = await mintFood(`zzq sat ${randomUUID().slice(0, 8)}`);
    const cos = await mintFood(`zzq cos ${randomUUID().slice(0, 8)}`);
    const rej = await mintFood(`zzq rej ${randomUUID().slice(0, 8)}`);
    await edge(anchor, sat, 'satisfies');
    await edge(anchor, cos, 'cousin');
    await edge(anchor, rej, 'reject');

    const got = await service.getSatisfiesFoodIds([anchor]);
    expect(got.satisfies).toEqual([sat]);
    expect(got.cousin).toEqual([cos]);
    // a stored reject must never reach search
    expect([...got.satisfies, ...got.cousin]).not.toContain(rej);
  });

  it('is DIRECTED — the reverse of an edge is not readable', async () => {
    const a = await mintFood(`zzq dir a ${randomUUID().slice(0, 8)}`);
    const b = await mintFood(`zzq dir b ${randomUUID().slice(0, 8)}`);
    await edge(a, b, 'satisfies');

    expect((await service.getSatisfiesFoodIds([a])).satisfies).toEqual([b]);
    // reading from the other end must find nothing
    expect((await service.getSatisfiesFoodIds([b])).satisfies).toEqual([]);
  });

  it('follows a merged-away target through its redirect', async () => {
    const anchor = await mintFood(
      `zzq redir anchor ${randomUUID().slice(0, 8)}`,
    );
    const survivor = await mintFood(`zzq survivor ${randomUUID().slice(0, 8)}`);
    const loser = await mintFood(`zzq loser ${randomUUID().slice(0, 8)}`, true);
    await edge(anchor, loser, 'satisfies');
    await prisma.$executeRawUnsafe(
      `INSERT INTO entity_redirects (from_entity_id, to_entity_id) VALUES ($1::uuid, $2::uuid)`,
      loser,
      survivor,
    );

    const got = await service.getSatisfiesFoodIds([anchor]);
    // the edge resolves to the survivor rather than vanishing
    expect(got.satisfies).toEqual([survivor]);
  });

  it('drops an archived target that has no redirect', async () => {
    const anchor = await mintFood(
      `zzq arch anchor ${randomUUID().slice(0, 8)}`,
    );
    const dead = await mintFood(`zzq dead ${randomUUID().slice(0, 8)}`, true);
    await edge(anchor, dead, 'satisfies');

    const got = await service.getSatisfiesFoodIds([anchor]);
    expect(got.satisfies).toEqual([]);
  });
});
