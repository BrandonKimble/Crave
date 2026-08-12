/**
 * RUNG-2 CONTAINMENT FOLDS BOTH SIDES (F9343) — against a REAL Postgres
 * (integration).
 *
 * THE DEFECT: `residualFor`'s rung-2 word-boundary containment exclusion
 * compared `lower(c.name)` against `lower(a.name)`. The repo-wide FOLD LAW is
 * that `lower()` is NOT canonicalFold on accented text (é != e), so an
 * accented/ascii pair that SHOULD be excluded (`café` vs `cafe` — the same
 * concept, one head-final containment away) slipped past the ladder and was
 * sent to the LLM judge. The fix compares `c.identity_key` against
 * `a.identity_key` — core_entities.identity_key IS canonicalFold(name), the
 * same folded form the alias/label match arms use.
 *
 * WHY A DB SPEC: the bug is entirely in how Postgres compares two stored
 * names. A mock cannot demonstrate it; only real rows and the real SQL can.
 *
 * THE SEED IS ADVERSARIAL: the anchor is ascii (`zzqcafe`), the candidate
 * carries an accent (`zzqcafé`). They fold to the SAME key (`zzqcafe`) but
 * differ under lower(), so the containment arm is the ONLY exclusion that can
 * fire — no category edge, no prior verdict.
 *
 * MUTATION: revert the two containment predicates to `lower(c.name)` /
 * `lower(a.name)` and this spec goes RED — the accented candidate is no longer
 * excluded and survives into the residual.
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev/mirror database, never prod)
 * It FAILS LOUDLY without one rather than skipping.
 */
import { PrismaClient } from '@prisma/client';
import {
  ConceptSatisfiesService,
  SatisfiesRunSummary,
} from './concept-satisfies.service';
import { canonicalFold } from './entity-identity';
import { NameContainmentEdgeBuilderService } from '../../entity-text-search/name-containment-edge-builder.service';

function stubLogger() {
  return {
    setContext: jest.fn().mockReturnThis(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

const ANCHOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa9343';
const CANDIDATE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccc9343';

// Single-token names differing ONLY by an accent: identity_key folds both to
// `zzqcafe`, but lower('zzqcafé') != 'zzqcafe'.
const ANCHOR_NAME = 'zzqcafe';
const CANDIDATE_NAME = 'zzqcafé';

const prisma = new PrismaClient();

const logger = {
  setContext: () => logger,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

const service = new ConceptSatisfiesService(
  prisma as never,
  {} as never, // llm — unused by residualFor
  {} as never, // entityTextSearch — unused (a sibling edge feeds candidates)
  logger,
);

function emptySummary(): SatisfiesRunSummary {
  return {
    conceptsScanned: 0,
    candidatesSeen: 0,
    decidedByLadder: 0,
    residualJudged: 0,
    unreturned: 0,
    satisfies: 0,
    cousin: 0,
    reject: 0,
  };
}

async function cleanup(): Promise<void> {
  await prisma.entitySiblingEdge.deleteMany({
    where: { anchorEntityId: ANCHOR_ID },
  });
  await prisma.entity.deleteMany({
    where: { entityId: { in: [ANCHOR_ID, CANDIDATE_ID] } },
  });
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required — this spec proves a SQL fold exclusion and must not be skipped',
    );
  }
  await cleanup();
  await prisma.entity.create({
    data: {
      entityId: ANCHOR_ID,
      name: ANCHOR_NAME,
      type: 'food',
      status: 'active',
      identityKey: canonicalFold(ANCHOR_NAME),
    },
  });
  await prisma.entity.create({
    data: {
      entityId: CANDIDATE_ID,
      name: CANDIDATE_NAME,
      type: 'food',
      status: 'active',
      identityKey: canonicalFold(CANDIDATE_NAME),
    },
  });
  // The sibling edge is the residual feeder — it makes the accented candidate a
  // recall candidate so the ladder gets a chance to exclude it.
  await prisma.entitySiblingEdge.create({
    data: {
      anchorEntityId: ANCHOR_ID,
      siblingEntityId: CANDIDATE_ID,
      cosine: 0.9,
      forwardRank: 1,
    },
  });
  // KL-D: rung 2 now reads the MATERIALIZED containment table (one folded
  // definition for judge + query). The fold law this spec proves lives in
  // the BUILDER, so the spec exercises it the same way production does:
  // rebuild after fixtures. A builder mutated to lower() would emit no edge
  // for the accented pair and this spec reds exactly as before.
  await new NameContainmentEdgeBuilderService(
    prisma as never,
    // The builder gained an ops-alerts dependency in ed87eef65 (KL-D
    // self-heal) and this call site was not updated, so the whole
    // integration suite failed to COMPILE — a gate that cannot run is a
    // gate that cannot show red.
    { emit: jest.fn() } as never,
    stubLogger() as never,
  ).runNow();
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('ConceptSatisfiesService.residualFor: rung-2 containment folds accents (F9343)', () => {
  it('excludes an accented candidate that folds to the anchor (lower() would miss it)', async () => {
    const summary = emptySummary();
    const residual = await (
      service as unknown as {
        residualFor: (
          concept: { entity_id: string; name: string },
          type: string,
          summary: SatisfiesRunSummary,
        ) => Promise<Array<{ entityId: string }>>;
      }
    ).residualFor({ entity_id: ANCHOR_ID, name: ANCHOR_NAME }, 'food', summary);
    // It WAS recalled as a candidate...
    expect(summary.candidatesSeen).toBe(1);
    // ...and the fold-aware containment arm excluded it (mutation to lower()
    // reds this: the accented candidate would survive into the residual).
    expect(summary.decidedByLadder).toBe(1);
    expect(residual.map((r) => r.entityId)).not.toContain(CANDIDATE_ID);
    expect(residual).toHaveLength(0);
  });
});
