/**
 * THE SATISFIES LANE ON THE HEARING LEDGER — proven against a real database
 * (H5 adoption, 2026-08-12).
 *
 * Three properties:
 *
 *   1. the VERDICT commits before the `entity_satisfies` effect — a crash
 *      between them leaves work to finish, and the resume replays the STORED
 *      subject without a judge (CRASH-SEAM MUTATION: swap
 *      settleSatisfiesVerdicts to effect-before-record and proof 1's
 *      assertions go red — the edge would exist while claim_verdicts holds
 *      nothing);
 *   2. a ledger verdict at the current rule version excludes the pair from
 *      the residual EVEN WHEN the `entity_satisfies` row does not exist yet
 *      (the crash window) — and the NEUTERED-MEMORY CONTROL deletes the
 *      verdict row and watches the same pair return to the residual, so the
 *      exclusion is load-bearing;
 *   3. the claim is DIRECTED: a verdict on A→B answers nothing about B→A
 *      (the adapter's key deliberately does not sort — the dedupe lane's
 *      does, and that difference is the whole point of per-lane
 *      canonicalization).
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev/mirror database, never prod)
 */
import { PrismaClient } from '@prisma/client';
import { ClaimVerdictLedgerService } from './claim-verdict-ledger.service';
import {
  ConceptSatisfiesService,
  SatisfiesRunSummary,
  SatisfiesVerdictSubject,
} from './concept-satisfies.service';
import {
  CONCEPT_SATISFIES_LANE,
  conceptSatisfiesLane,
} from './concept-satisfies-lane';
import { SATISFIES_PROMPT_VERSION } from './concept-satisfies-rule';
import { canonicalFold } from './entity-identity';

const ANCHOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0812';
const CANDIDATE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccc0812';

// Lexically far apart so no containment/category rung can decide the pair —
// the ledger arm is the only exclusion that can fire.
const ANCHOR_NAME = 'zzq soup dumplings hearing';
const CANDIDATE_NAME = 'zzq xiao long bao hearing';

const prisma = new PrismaClient();
const ledger = new ClaimVerdictLedgerService(prisma as never);

const logger = {
  setContext: () => logger,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

const service = new ConceptSatisfiesService(
  prisma as never,
  {} as never, // llm — no proof here pays for a hearing
  {} as never, // entityTextSearch — the seeded sibling edge feeds candidates
  ledger,
  logger,
);

/** The same service with the EFFECT step killed — the crash seam. */
class CrashingSatisfies extends ConceptSatisfiesService {
  protected applySatisfiesEffect(): Promise<void> {
    return Promise.reject(
      new Error('process died before the edge was written'),
    );
  }
}

type Internals = {
  settleSatisfiesVerdicts: (
    subjects: readonly SatisfiesVerdictSubject[],
  ) => Promise<void>;
  residualFor: (
    concept: { entity_id: string; name: string },
    type: string,
    summary: SatisfiesRunSummary,
  ) => Promise<Array<{ entityId: string }>>;
};

const emptySummary = (): SatisfiesRunSummary => ({
  conceptsScanned: 0,
  candidatesSeen: 0,
  decidedByLadder: 0,
  residualJudged: 0,
  unreturned: 0,
  satisfies: 0,
  cousin: 0,
  reject: 0,
});

const subject = (): SatisfiesVerdictSubject => ({
  fromEntityId: ANCHOR_ID,
  toEntityId: CANDIDATE_ID,
  relation: 'satisfies',
  promptVersion: SATISFIES_PROMPT_VERSION,
});

const claimKey = conceptSatisfiesLane.canonicalClaimKey(subject());

async function verdictRow(): Promise<{
  outcome: string;
  reason: string;
  executed_at: Date | null;
} | null> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ outcome: string; reason: string; executed_at: Date | null }>
  >(
    `SELECT outcome, reason, executed_at FROM claim_verdicts
      WHERE lane = $1 AND claim_key = $2`,
    CONCEPT_SATISFIES_LANE,
    claimKey,
  );
  return rows[0] ?? null;
}

async function satisfiesEdge(): Promise<{ relation: string } | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ relation: string }>>(
    `SELECT relation FROM entity_satisfies
      WHERE from_entity_id = $1::uuid AND to_entity_id = $2::uuid`,
    ANCHOR_ID,
    CANDIDATE_ID,
  );
  return rows[0] ?? null;
}

async function residual(): Promise<string[]> {
  const rows = await (service as unknown as Internals).residualFor(
    { entity_id: ANCHOR_ID, name: ANCHOR_NAME },
    'item',
    emptySummary(),
  );
  return rows.map((row) => row.entityId);
}

async function cleanup(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DELETE FROM claim_verdicts WHERE lane = $1 AND claim_key LIKE $2`,
    CONCEPT_SATISFIES_LANE,
    `%${ANCHOR_ID}%`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM entity_satisfies
      WHERE from_entity_id = ANY($1::uuid[]) OR to_entity_id = ANY($1::uuid[])`,
    [ANCHOR_ID, CANDIDATE_ID],
  );
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
      'DATABASE_URL is required — this spec proves the satisfies hearing memory and must not be skipped',
    );
  }
  await cleanup();
  await prisma.entity.create({
    data: {
      entityId: ANCHOR_ID,
      name: ANCHOR_NAME,
      type: 'item',
      status: 'active',
      identityKey: canonicalFold(ANCHOR_NAME),
    },
  });
  await prisma.entity.create({
    data: {
      entityId: CANDIDATE_ID,
      name: CANDIDATE_NAME,
      type: 'item',
      status: 'active',
      identityKey: canonicalFold(CANDIDATE_NAME),
    },
  });
  // The sibling edge is the residual feeder.
  await prisma.entitySiblingEdge.create({
    data: {
      anchorEntityId: ANCHOR_ID,
      siblingEntityId: CANDIDATE_ID,
      cosine: 0.9,
      forwardRank: 1,
    },
  });
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('the satisfies lane on the hearing ledger — live database', () => {
  /**
   * PROOF 1 — verdict before effect, resume replays the stored subject.
   */
  it('commits the verdict BEFORE the entity_satisfies write, and resumes it', async () => {
    const crashing = new CrashingSatisfies(
      prisma as never,
      {} as never,
      {} as never,
      ledger,
      logger,
    );
    await expect(
      (crashing as unknown as Internals).settleSatisfiesVerdicts([subject()]),
    ).rejects.toThrow('process died before the edge was written');

    // THE ANSWER SURVIVED: decided, grounded, NOT executed — and no edge.
    const decided = await verdictRow();
    expect(decided).toMatchObject({ outcome: 'satisfies', executed_at: null });
    expect(decided?.reason.length).toBeGreaterThan(0);
    expect(await satisfiesEdge()).toBeNull();

    // PROOF 2 (crash window): the pair is already DECIDED — the residual
    // must not re-offer it even though entity_satisfies has no row.
    expect(await residual()).not.toContain(CANDIDATE_ID);

    // The resume writes the edge from the STORED subject, no judge involved.
    expect(await service.resumePendingSatisfiesEffects()).toBe(1);
    expect(await satisfiesEdge()).toMatchObject({ relation: 'satisfies' });
    expect((await verdictRow())?.executed_at).not.toBeNull();

    // IDEMPOTENT: resuming again is a no-op.
    expect(await service.resumePendingSatisfiesEffects()).toBe(0);
  });

  /**
   * PROOF 2b — NEUTERED-MEMORY CONTROL: delete both memories and the pair
   * returns to the residual. The exclusion assertions above are capable of
   * red, so they prove the memory rather than restating it.
   */
  it('re-offers the pair when the memory is neutered', async () => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM claim_verdicts WHERE lane = $1 AND claim_key = $2`,
      CONCEPT_SATISFIES_LANE,
      claimKey,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM entity_satisfies
        WHERE from_entity_id = $1::uuid AND to_entity_id = $2::uuid`,
      ANCHOR_ID,
      CANDIDATE_ID,
    );
    expect(await residual()).toContain(CANDIDATE_ID);
  });

  /**
   * PROOF 3 — the claim is DIRECTED: a verdict on candidate→anchor answers
   * nothing about anchor→candidate.
   */
  it('does not let the reverse direction answer for this one', async () => {
    expect(
      conceptSatisfiesLane.canonicalClaimKey({
        fromEntityId: ANCHOR_ID,
        toEntityId: CANDIDATE_ID,
      }),
    ).not.toBe(
      conceptSatisfiesLane.canonicalClaimKey({
        fromEntityId: CANDIDATE_ID,
        toEntityId: ANCHOR_ID,
      }),
    );
    // The reverse verdict, recorded and executed, still leaves THIS
    // direction due.
    await (service as unknown as Internals).settleSatisfiesVerdicts([
      {
        fromEntityId: CANDIDATE_ID,
        toEntityId: ANCHOR_ID,
        relation: 'satisfies',
        promptVersion: SATISFIES_PROMPT_VERSION,
      },
    ]);
    expect(await residual()).toContain(CANDIDATE_ID);
  });
});
