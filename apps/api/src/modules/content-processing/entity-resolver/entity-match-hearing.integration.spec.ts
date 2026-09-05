/**
 * THE RESOLUTION-MATCH LANE ON THE HEARING LEDGER — proven against a real
 * database (hearing-ledger adoption, 2026-08-13).
 *
 * The tier-3 judge (`matchEntitiesBatch` inside `performLlmMatches`) is the
 * same fail-closed entity-match rule the dedupe lane adopted — and until this
 * lane, it had NO verdict memory: every re-mention of a term re-bought the
 * same shortlist judgment, and every judged 'new' (the expensive fail-closed
 * re-roll) evaporated on return.
 *
 * The proofs, each with its RED half:
 *
 *   1. a judged 'new' is REMEMBERED per (term, candidate) pair — the same
 *      term against the same shortlist skips the LLM entirely (a judge that
 *      THROWS proves no call is made). NEUTERED-MEMORY CONTROL: delete the
 *      verdict rows and the same ask pays a judge again — the skip assertion
 *      would go red, so the memory is load-bearing, not decorative;
 *   2. a remembered 'match' RESOLVES the term to its candidate without a
 *      hearing;
 *   3. a verdict with no stated ground is NOT a ruling (amendment (d)) —
 *      matchEntitiesBatch fails CLOSED to a reasonless 'new', so an outage
 *      records nothing and the question stays open (the judge is paid again
 *      next time — asserted, which is the RED for a memory that swallowed
 *      an outage as an answer);
 *   4. a 'match' verdict binds ONLY the matched pair — the judge picked the
 *      best answer, it did not rule the other candidates strangers;
 *   5. VERDICT-MEMORY-ONLY: `executed_at` stamps at record, so this lane
 *      never leaves subjects in the resume queue (its "effect" is the
 *      resolution result the caller consumed in the same pass — the
 *      re-readable memory IS the resume path).
 *
 * The claim key is spelled by the ACCENT-PRESERVING fold: bò and bơ against
 * one candidate are two claims (the word-claim lane's claim-unit doctrine).
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev/mirror database, never prod)
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ClaimVerdictLedgerService } from './claim-verdict-ledger.service';
import { EntityResolutionService } from './entity-resolution.service';
import { ENTITY_MATCH_LANE, entityMatchLane } from './entity-match-lane';
import {
  ENTITY_DEDUPE_RULE_FINGERPRINT,
  ENTITY_DEDUPE_RULE_VERSION,
} from './entity-dedupe-rule';
import { canonicalFold } from './entity-identity';
import type { EntityResolutionInput } from './entity-resolution.types';
import type { RecallCandidate } from '../../entity-text-search/entity-text-search.service';

const prisma = new PrismaClient();
const ledger = new ClaimVerdictLedgerService(prisma as never);
const madeEntities: string[] = [];
const madeKeys: string[] = [];

const noopLogger = () => {
  const logger: Record<string, unknown> = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
  logger.setContext = () => logger;
  return logger;
};

type JudgeMock = jest.Mock;

/** The service with only what `performLlmMatches` touches: real prisma, the
 *  real ledger, a scripted recall and a scripted (or forbidden) judge. */
function serviceWith(opts: {
  judge: JudgeMock;
  candidatesByTerm: Map<string, RecallCandidate[]>;
}): EntityResolutionService {
  const service = new EntityResolutionService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    { matchEntitiesBatch: opts.judge } as never,
    {
      retrieveCandidates: jest.fn(async (term: string) =>
        Promise.resolve(opts.candidatesByTerm.get(term) ?? []),
      ),
    } as never,
    noopLogger() as never,
    {} as never,
    ledger,
  );
  (service as unknown as { logger: unknown }).logger = noopLogger();
  return service;
}

type Driveable = {
  performLlmMatches: (
    entities: EntityResolutionInput[],
    entityType: 'item',
    engineId: string | null,
    documentLocale: string | null,
  ) => Promise<
    Array<{ tempId: string; entityId: string | null; resolutionTier: string }>
  >;
};

const drive = (
  service: EntityResolutionService,
  inputs: EntityResolutionInput[],
) =>
  (service as unknown as Driveable).performLlmMatches(
    inputs,
    'item',
    null,
    null,
  );

const inputFor = (term: string): EntityResolutionInput => ({
  tempId: randomUUID(),
  normalizedName: term,
  originalText: term,
  entityType: 'item',
});

async function mintItem(name: string): Promise<RecallCandidate> {
  const entity = await prisma.entity.create({
    data: { name, type: 'item', identityKey: canonicalFold(name) },
  });
  madeEntities.push(entity.entityId);
  return {
    entityId: entity.entityId,
    name,
    type: 'item',
    rrf: 1,
    sparseRank: 1,
    sparseSimilarity: 0.9,
    sparseEvidence: null,
    denseRank: null,
    denseCosine: null,
    metroLocal: null,
  };
}

const keyOf = (term: string, candidateEntityId: string): string => {
  const key = entityMatchLane.canonicalClaimKey({
    kind: 'item',
    term,
    candidateEntityId,
  });
  if (!madeKeys.includes(key)) madeKeys.push(key);
  return key;
};

async function verdictRow(claimKey: string): Promise<{
  outcome: string;
  reason: string;
  rule_version: number;
  rule_fingerprint: string | null;
  executed_at: Date | null;
} | null> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      outcome: string;
      reason: string;
      rule_version: number;
      rule_fingerprint: string | null;
      executed_at: Date | null;
    }>
  >(
    `SELECT outcome, reason, rule_version, rule_fingerprint, executed_at
       FROM claim_verdicts WHERE lane = $1 AND claim_key = $2`,
    ENTITY_MATCH_LANE,
    claimKey,
  );
  return rows[0] ?? null;
}

const forbiddenJudge = (): JudgeMock =>
  jest.fn(() => {
    throw new Error('a remembered claim must not pay for a new hearing');
  });

const judgeSaying = (verdict: {
  decision: 'match' | 'new';
  candidateId?: number | null;
  reason?: string;
}): JudgeMock =>
  jest.fn(({ items }: { items: unknown[] }) =>
    Promise.resolve(
      items.map(() => ({
        decision: verdict.decision,
        candidateId: verdict.candidateId ?? null,
        ...(verdict.reason ? { reason: verdict.reason } : {}),
      })),
    ),
  );

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required — this spec proves the resolution-match hearing memory and must not be skipped',
    );
  }
});

afterAll(async () => {
  if (madeKeys.length) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM claim_verdicts WHERE lane = $1 AND claim_key = ANY($2::text[])`,
      ENTITY_MATCH_LANE,
      madeKeys,
    );
  }
  if (madeEntities.length) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM entity_surface WHERE entity_id = ANY($1::uuid[])`,
      madeEntities,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM core_entities WHERE entity_id = ANY($1::uuid[])`,
      madeEntities,
    );
  }
  await prisma.$disconnect();
});

describe('the resolution-match lane on the hearing ledger — live database', () => {
  it("remembers a judged 'new' per pair and skips the LLM — and pays again when the memory is neutered", async () => {
    const suffix = randomUUID().slice(0, 8);
    const term = `zzq resmatch ${suffix}`;
    const a = await mintItem(`zzq resmatch cand a ${suffix}`);
    const b = await mintItem(`zzq resmatch cand b ${suffix}`);
    const candidates = new Map([[term, [a, b]]]);

    // FIRST ASK — the judge rules 'new' with a stated ground.
    const judge = judgeSaying({
      decision: 'new',
      reason: 'the term names a different dish than every candidate',
    });
    const first = await drive(
      serviceWith({ judge, candidatesByTerm: candidates }),
      [inputFor(term)],
    );
    expect(judge).toHaveBeenCalledTimes(1);
    expect(first[0].entityId).toBeNull();

    // BOTH shown pairs are on the record — decision 'new' rules on every
    // candidate the judge saw — executed at record (verdict-memory-only).
    for (const candidate of [a, b]) {
      const row = await verdictRow(keyOf(term, candidate.entityId));
      expect(row).not.toBeNull();
      expect(row!.outcome).toBe('new');
      expect(row!.rule_version).toBe(ENTITY_DEDUPE_RULE_VERSION);
      expect(row!.rule_fingerprint).toBe(ENTITY_DEDUPE_RULE_FINGERPRINT);
      expect(row!.executed_at).not.toBeNull();
    }
    // ...and the lane leaves NOTHING in the resume queue.
    expect(
      await ledger.pendingExecution(
        ENTITY_MATCH_LANE,
        ENTITY_DEDUPE_RULE_VERSION,
        entityMatchLane.keyFoldVersion,
        10,
      ),
    ).toHaveLength(0);

    // SECOND ASK, same shortlist — a judge that throws proves no LLM call
    // happens: the whole docket is struck by remembered 'new's.
    const second = await drive(
      serviceWith({ judge: forbiddenJudge(), candidatesByTerm: candidates }),
      [inputFor(term)],
    );
    expect(second[0].entityId).toBeNull();

    // NEUTERED-MEMORY CONTROL (the RED half): delete the verdicts and the
    // same ask pays a judge again — so the skip above was the memory
    // talking, not a coincidence of the pipeline.
    await prisma.$executeRawUnsafe(
      `DELETE FROM claim_verdicts WHERE lane = $1 AND claim_key = ANY($2::text[])`,
      ENTITY_MATCH_LANE,
      [keyOf(term, a.entityId), keyOf(term, b.entityId)],
    );
    const paidAgain = judgeSaying({
      decision: 'new',
      reason: 'still a different dish',
    });
    await drive(
      serviceWith({ judge: paidAgain, candidatesByTerm: candidates }),
      [inputFor(term)],
    );
    expect(paidAgain).toHaveBeenCalledTimes(1);
  });

  it("resolves from a remembered 'match' without paying a judge", async () => {
    const suffix = randomUUID().slice(0, 8);
    const term = `zzq resmatch hit ${suffix}`;
    const winner = await mintItem(`zzq resmatch winner ${suffix}`);
    const other = await mintItem(`zzq resmatch other ${suffix}`);
    await ledger.record({
      lane: ENTITY_MATCH_LANE,
      claimKey: keyOf(term, winner.entityId),
      ruleVersion: ENTITY_DEDUPE_RULE_VERSION,
      foldVersion: entityMatchLane.keyFoldVersion,
      outcome: 'match',
      reason: 'another name for the same dish',
      ruleFingerprint: ENTITY_DEDUPE_RULE_FINGERPRINT,
      subject: {
        kind: 'item',
        term,
        candidateEntityId: winner.entityId,
        outcome: 'match',
      },
    });
    await ledger.markExecuted(
      ENTITY_MATCH_LANE,
      keyOf(term, winner.entityId),
      ENTITY_DEDUPE_RULE_VERSION,
      entityMatchLane.keyFoldVersion,
    );

    const result = await drive(
      serviceWith({
        judge: forbiddenJudge(),
        candidatesByTerm: new Map([[term, [other, winner]]]),
      }),
      [inputFor(term)],
    );
    expect(result[0].entityId).toBe(winner.entityId);
    expect(result[0].resolutionTier).toBe('fuzzy');
  });

  it("a reasonless fail-closed 'new' records NOTHING — the question stays open and is paid for again", async () => {
    const suffix = randomUUID().slice(0, 8);
    const term = `zzq resmatch outage ${suffix}`;
    const candidate = await mintItem(`zzq resmatch outage cand ${suffix}`);
    const candidates = new Map([[term, [candidate]]]);

    // matchEntitiesBatch's real outage shape: 'new', no reason.
    const outage = judgeSaying({ decision: 'new' });
    await drive(serviceWith({ judge: outage, candidatesByTerm: candidates }), [
      inputFor(term),
    ]);
    expect(await verdictRow(keyOf(term, candidate.entityId))).toBeNull();

    // The RED half: were the outage recorded as an answer, this second judge
    // would never be called.
    const judge = judgeSaying({ decision: 'new', reason: 'a real ruling' });
    await drive(serviceWith({ judge, candidatesByTerm: candidates }), [
      inputFor(term),
    ]);
    expect(judge).toHaveBeenCalledTimes(1);
    expect((await verdictRow(keyOf(term, candidate.entityId)))?.outcome).toBe(
      'new',
    );
  });

  it("a 'match' binds only the matched pair — the other candidates stay unheard", async () => {
    const suffix = randomUUID().slice(0, 8);
    const term = `zzq resmatch partial ${suffix}`;
    const first = await mintItem(`zzq resmatch partial a ${suffix}`);
    const second = await mintItem(`zzq resmatch partial b ${suffix}`);
    const judge = judgeSaying({
      decision: 'match',
      candidateId: 1,
      reason: 'candidate 1 is the same dish',
    });
    const result = await drive(
      serviceWith({
        judge,
        candidatesByTerm: new Map([[term, [first, second]]]),
      }),
      [inputFor(term)],
    );
    expect(result[0].entityId).toBe(second.entityId);
    const matchedRow = await verdictRow(keyOf(term, second.entityId));
    expect(matchedRow?.outcome).toBe('match');
    expect(matchedRow?.executed_at).not.toBeNull();
    // The judge picked the best answer; it did not rule `first` a stranger.
    expect(await verdictRow(keyOf(term, first.entityId))).toBeNull();
  });

  it('spells the claim by the accent-preserving fold — bò and bơ are two claims', () => {
    const candidateEntityId = randomUUID();
    const keyBo1 = entityMatchLane.canonicalClaimKey({
      kind: 'item',
      term: 'bò kho',
      candidateEntityId,
    });
    const keyBo2 = entityMatchLane.canonicalClaimKey({
      kind: 'item',
      term: 'bơ kho',
      candidateEntityId,
    });
    expect(keyBo1).not.toBe(keyBo2);
    // ...while case and punctuation still fold into one claim.
    expect(
      entityMatchLane.canonicalClaimKey({
        kind: 'item',
        term: 'Bò  Kho',
        candidateEntityId,
      }),
    ).toBe(keyBo1);
  });
});
