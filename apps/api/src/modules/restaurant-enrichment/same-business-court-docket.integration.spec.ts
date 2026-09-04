/**
 * THE COURT HEARS THE NEW PAIR, NOT THE FIFTY IT ALREADY DECIDED (red team
 * 2026-09-04 E-2), proven against a real database.
 *
 * Two defects, one proof. The hearing ceiling (50/run) was charged BEFORE
 * the ledger lookup, so remembered 'distinct' pairs — which never leave the
 * candidate set (both stay active on the same domain) — consumed the budget
 * every night and a new pair behind them was never heard. And the domain
 * lane fetched an un-ordered LIMIT 50, so those same fifty refilled it.
 *
 * Fixture: 50 domain pairs already decided 'distinct' at the rule in force,
 * plus ONE fresh pair on its own impure domain. Expected: exactly one bought
 * hearing. RED against the old sweep: zero (the fresh pair was either not
 * fetched or deferred at the ceiling).
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PlaceEntityMergeService } from './restaurant-entity-merge.service';
import {
  SAME_BUSINESS_LANE,
  sameBusinessClaimKey,
} from './business-identity-rules';
import {
  SAME_BUSINESS_RULE_FINGERPRINT,
  SAME_BUSINESS_RULE_VERSION,
} from './same-business-rule';
import { ClaimVerdictLedgerService } from '../content-processing/entity-resolver/claim-verdict-ledger.service';
import { EntityAnchorRehomeService } from '../content-processing/entity-resolver/entity-anchor-rehome.service';
import { identityInsertData } from '../content-processing/entity-resolver/entity-identity';

const TAG = 'itest-court-docket';
const prisma = new PrismaClient();
const entityIds: string[] = [];
const claimKeys: string[] = [];

function noopLogger() {
  const logger: Record<string, unknown> = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
  logger.setContext = () => logger;
  return logger;
}

async function mintPlace(name: string, domain: string): Promise<string> {
  const id = randomUUID();
  const identity = identityInsertData(name, 'place' as never);
  await prisma.$executeRawUnsafe(
    `INSERT INTO core_entities
       (entity_id, name, type, status, identity_key, identity_key_sorted, fold_version, canonical_domain)
     VALUES ($1::uuid, $2, 'place'::entity_type, 'active'::entity_status, $3, $4, $5, $6)`,
    id,
    name,
    identity.identityKey,
    identity.identityKeySorted,
    identity.foldVersion,
    domain,
  );
  entityIds.push(id);
  return id;
}

/** Item support: the D5 law holds an evidence-free pair; one item row per
 *  place is the cheapest real evidence. */
async function mintSupport(placeId: string, foodId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO core_restaurant_items (restaurant_id, food_id, mention_count)
     VALUES ($1::uuid, $2::uuid, 1)`,
    placeId,
    foodId,
  );
}

afterAll(async () => {
  if (entityIds.length) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM core_restaurant_items WHERE restaurant_id = ANY($1::uuid[]) OR food_id = ANY($1::uuid[])`,
      entityIds,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM claim_verdicts WHERE lane = $1 AND claim_key = ANY($2::text[])`,
      SAME_BUSINESS_LANE,
      claimKeys,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM entity_redirects WHERE from_entity_id = ANY($1::uuid[]) OR to_entity_id = ANY($1::uuid[])`,
      entityIds,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM entity_surface WHERE entity_id = ANY($1::uuid[])`,
      entityIds,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM core_entities WHERE entity_id = ANY($1::uuid[])`,
      entityIds,
    );
  }
  await prisma.$disconnect();
});

describe('same-business court docket (real DB)', () => {
  it('a fresh pair behind fifty remembered ones gets its one hearing', async () => {
    const foodId = await mintPlace(`${TAG}:food`, `${TAG}-food.com`);
    // The item entity must be an item, not a place.
    await prisma.$executeRawUnsafe(
      `UPDATE core_entities SET type = 'item'::entity_type, canonical_domain = NULL WHERE entity_id = $1::uuid`,
      foodId,
    );

    // Fifty decided pairs: two differently-named places per impure domain.
    for (let n = 0; n < 50; n += 1) {
      const domain = `${TAG}-${n}.com`;
      const a = await mintPlace(`${TAG} Alpha ${n}`, domain);
      const b = await mintPlace(`${TAG} Beta ${n}`, domain);
      await mintSupport(a, foodId);
      await mintSupport(b, foodId);
      const claimKey = sameBusinessClaimKey(a, b);
      claimKeys.push(claimKey);
      await prisma.$executeRawUnsafe(
        `INSERT INTO claim_verdicts
           (lane, claim_key, rule_version, fold_version, outcome, reason, rule_fingerprint, subject, source, decided_at, executed_at)
         VALUES ($1, $2, $3, 0, 'distinct', 'itest: remembered', $4, '{}'::jsonb, 'steady', now(), now())`,
        SAME_BUSINESS_LANE,
        claimKey,
        SAME_BUSINESS_RULE_VERSION,
        SAME_BUSINESS_RULE_FINGERPRINT,
      );
    }
    // The fresh pair.
    const freshA = await mintPlace(`${TAG} Gamma fresh`, `${TAG}-fresh.com`);
    const freshB = await mintPlace(`${TAG} Delta fresh`, `${TAG}-fresh.com`);
    await mintSupport(freshA, foodId);
    await mintSupport(freshB, foodId);
    claimKeys.push(sameBusinessClaimKey(freshA, freshB));

    const heard: string[] = [];
    const isFixture = (prompt: string): boolean =>
      prompt.includes('Gamma fresh') && prompt.includes('Delta fresh');
    const llm = {
      generateForCaller: jest.fn((params: { prompt: string }) => {
        heard.push(params.prompt);
        // The shared local corpus may carry its own court-routed pairs; a
        // transport failure holds them without recording anything, so this
        // proof never writes a stub verdict against a real pair.
        if (!isFixture(params.prompt)) {
          return Promise.reject(new Error('itest: not a fixture pair'));
        }
        return Promise.resolve(
          JSON.stringify({
            items: [
              { n: 1, verdict: 'distinct', reason: 'itest: two businesses' },
            ],
          }),
        );
      }),
    };
    const service = new PlaceEntityMergeService(
      prisma as never,
      { rebuildForPlaces: jest.fn() } as never,
      new EntityAnchorRehomeService(noopLogger() as never),
      new ClaimVerdictLedgerService(prisma as never),
      llm as never,
      noopLogger() as never,
    );

    await service.sweepSameNameDuplicates({ apply: true });

    // Exactly the fresh pair was heard — the fifty decided ones cost nothing
    // and never crowded it out.
    expect(heard.filter(isFixture)).toHaveLength(1);
    // None of the fifty decided pairs reached the court at all.
    expect(
      heard.filter((prompt) => prompt.includes(`${TAG} Alpha`)),
    ).toHaveLength(0);
    const recorded = await prisma.$queryRawUnsafe<Array<{ outcome: string }>>(
      `SELECT outcome::text FROM claim_verdicts WHERE lane = $1 AND claim_key = $2`,
      SAME_BUSINESS_LANE,
      sameBusinessClaimKey(freshA, freshB),
    );
    expect(recorded).toEqual([{ outcome: 'distinct' }]);
  });
});
