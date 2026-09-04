/**
 * THE GRADE LAW, PROVEN AGAINST A REAL DATABASE (plans/alias-clean-slate.md
 * items 1–2, registered in shared/invariants/registry.ts).
 *
 * Three facts, each of which has silently been false before:
 *
 *  1. A 'judged' bank without its origin verdict is REFUSED at the door —
 *     the alias ratchet was exactly a judge inference banked as if it were
 *     testimony, with no ledger row to re-hear.
 *  2. identityGradeSql admits 'observed' rows and 'judged' rows heard AT THE
 *     RULE IN FORCE — a judged row from a superseded rule version is a
 *     candidate again, invisible to mention routing until re-heard.
 *  3. 'recall' NEVER routes: ~93% of the audited corpus's alias-shaped rows
 *     were speculation carrying identity authority.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import {
  addSurfaces,
  foldSurfacesFromMerge,
  identityGradeSql,
  JudgedClaimWithoutVerdictError,
} from './entity-surface.service';
import { ENTITY_DEDUPE_RULE_VERSION } from './entity-dedupe-rule';
import {
  PLACE_MERGE_LANE,
  PLACE_MERGE_RULE_VERSION,
} from '../../restaurant-enrichment/business-identity-rules';

const TEST_TAG = 'itest-claim-grade';
const prisma = new PrismaClient();

async function cleanup(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DELETE FROM entity_surface s USING core_entities e
    WHERE s.entity_id = e.entity_id AND e.name LIKE '${TEST_TAG}:%'`);
  await prisma.$executeRawUnsafe(
    `DELETE FROM core_entities WHERE name LIKE '${TEST_TAG}:%'`,
  );
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('the claim-grade law', () => {
  it("refuses a 'judged' bank that carries no origin verdict", async () => {
    const entity = await prisma.entity.create({
      data: { name: `${TEST_TAG}:ratchet`, type: 'place', status: 'active' },
      select: { entityId: true },
    });
    await expect(
      prisma.$transaction((tx) =>
        addSurfaces(tx, entity.entityId, [
          {
            form: `${TEST_TAG} normalized by a judge`,
            source: 'extraction',
            claimGrade: 'judged',
          },
        ]),
      ),
    ).rejects.toThrow(JudgedClaimWithoutVerdictError);
  });

  it('routes observed and in-force judged rows — never stale-judged, never recall', async () => {
    const entity = await prisma.entity.create({
      data: { name: `${TEST_TAG}:grades`, type: 'place', status: 'active' },
      select: { entityId: true },
    });
    await prisma.$transaction(async (tx) => {
      await addSurfaces(tx, entity.entityId, [
        {
          form: `${TEST_TAG} observed form`,
          source: 'extraction',
          claimGrade: 'observed',
        },
        {
          form: `${TEST_TAG} judged in force`,
          source: 'extraction',
          claimGrade: 'judged',
          originVerdict: {
            lane: 'entity_match',
            claimKey: `${TEST_TAG}|in-force`,
            ruleVersion: ENTITY_DEDUPE_RULE_VERSION,
            foldVersion: 1,
          },
        },
        {
          form: `${TEST_TAG} judged stale`,
          source: 'extraction',
          claimGrade: 'judged',
          originVerdict: {
            lane: 'entity_match',
            claimKey: `${TEST_TAG}|stale`,
            // A rule bump happened after this hearing: the verdict is
            // history, not authority, until the claim is re-heard.
            ruleVersion: ENTITY_DEDUPE_RULE_VERSION - 1,
            foldVersion: 1,
          },
        },
        {
          form: `${TEST_TAG} recall guess`,
          source: 'cuisine',
          // claimGrade omitted — the default MUST be the powerless grade.
        },
      ]);
    });

    const routable = await prisma.$queryRaw<Array<{ form: string }>>(
      Prisma.sql`SELECT s.form FROM entity_surface s
        WHERE s.entity_id = ${entity.entityId}::uuid
          AND s.status = 'active'
          AND ${identityGradeSql('s')}
        ORDER BY s.form`,
    );
    expect(routable.map((r) => r.form)).toEqual([
      `${TEST_TAG} judged in force`,
      `${TEST_TAG} observed form`,
    ]);
  });

  /**
   * Red team 2026-09-04 ID-1. The loser's OWN name is banked 'observed' at
   * birth; carried onto the winner uncapped it out-ranked the merge's
   * 'judged' row for the same form and became permanent identity with a
   * NULL origin — a wrong merge could never be un-routed. A carried row's
   * grade is capped at the merge's: judged under the verdict's coordinates
   * when ledgered, recall when not. RED against the pre-fix fold: the
   * winner's row read observed/NULL and stayed routable after a rule bump.
   */
  it('caps a carried row at the MERGE grade — a ledgered merge routes only under its verdict, an unledgered one never', async () => {
    const mint = async (
      suffix: string,
    ): Promise<{ entityId: string; name: string }> => {
      const name = `${TEST_TAG}:${suffix}`;
      const row = await prisma.entity.create({
        data: { name, type: 'place', status: 'active', identityKey: name },
        select: { entityId: true },
      });
      // Birth testimony: the entity's own name, observed.
      await prisma.$transaction((tx) =>
        addSurfaces(tx, row.entityId, [
          { form: name, source: 'extraction', claimGrade: 'observed' },
        ]),
      );
      return { entityId: row.entityId, name };
    };
    const winner = await mint('fold-winner');
    const ledgeredLoser = await mint('fold-loser-ledgered');
    const bareLoser = await mint('fold-loser-unledgered');

    await prisma.$transaction(async (tx) => {
      await foldSurfacesFromMerge(tx, winner.entityId, ledgeredLoser.entityId, {
        mergeVerdict: {
          lane: PLACE_MERGE_LANE,
          claimKey: `${TEST_TAG}|ledgered-merge`,
          ruleVersion: PLACE_MERGE_RULE_VERSION,
          foldVersion: 1,
        },
      });
      await foldSurfacesFromMerge(tx, winner.entityId, bareLoser.entityId);
    });

    const rows = await prisma.$queryRaw<
      Array<{
        form: string;
        claim_grade: string;
        origin_lane: string | null;
        routes: boolean;
      }>
    >(Prisma.sql`SELECT s.form, s.claim_grade::text, s.origin_lane,
                        ${identityGradeSql('s')} AS routes
                   FROM entity_surface s
                  WHERE s.entity_id = ${winner.entityId}::uuid
                    AND s.form IN (${ledgeredLoser.name}, ${bareLoser.name})
                  ORDER BY s.form`);
    expect(rows).toEqual([
      {
        form: ledgeredLoser.name,
        claim_grade: 'judged',
        origin_lane: PLACE_MERGE_LANE,
        routes: true,
      },
      {
        form: bareLoser.name,
        claim_grade: 'recall',
        origin_lane: null,
        routes: false,
      },
    ]);
  });
});
