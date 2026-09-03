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
  identityGradeSql,
  JudgedClaimWithoutVerdictError,
} from './entity-surface.service';
import { ENTITY_DEDUPE_RULE_VERSION } from './entity-dedupe-rule';

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
});
