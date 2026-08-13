import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { LabelSweepService, sweepPass } from './label-sweep.service';
import { identityInsertData } from '../content-processing/entity-resolver/entity-identity';
import { WordClaimAdjudicatorService } from '../content-processing/entity-resolver/word-claim-adjudicator.service';
import { ClaimVerdictLedgerService } from '../content-processing/entity-resolver/claim-verdict-ledger.service';

/**
 * THE SWEEP COUNTS THE SURFACES IT WINS ON APPEAL — proven against a real
 * database.
 *
 * THE UNDERCOUNT, DIAGNOSED. `LabelSweepService.sweep()` finalizes
 * `surfacesBanked` inside `writeLabels`, and only THEN runs
 * `adjudicate(contested)`. Every surface the claim judge awards is banked by
 * the adjudicator — after the number the sweep reports is already fixed. So
 * the headline under-reported the run's own output by the entire appeal
 * docket, measured at 1.6x on the English sweep. A pass that cannot say how
 * much it wrote cannot be trusted to say whether it is working.
 *
 * WHY `banked` AND NOT THE OUTCOME COUNTERS. The obvious tally,
 * `bothUpheld + incumbentEvicted`, is wrong: the adjudicator's uncontested
 * branch increments `bothUpheld` for a claim whose target entity no longer
 * exists and writes NO row. Counting the `bank()` call is the only number
 * that cannot drift from the table — and the first test below makes that
 * difference visible by putting both shapes in one hearing.
 */
describe('label sweep appeal tally — proven against a live database', () => {
  const prisma = new PrismaClient();
  const made: string[] = [];
  const startedAt = new Date();

  const mintFood = async (name: string): Promise<string> => {
    const id = randomUUID();
    const identity = identityInsertData(name, 'food' as never);
    await prisma.$executeRawUnsafe(
      `INSERT INTO core_entities (entity_id, name, type, status, identity_key, identity_key_sorted)
       VALUES ($1::uuid, $2, 'food'::entity_type, 'active'::entity_status, $3, $4)`,
      id,
      name,
      identity.identityKey,
      identity.identityKeySorted,
    );
    made.push(id);
    return id;
  };

  /** A judge that must NEVER be called: neither claim below reaches one. */
  const adjudicator = new WordClaimAdjudicatorService(
    prisma as never,
    {
      generateForCaller: jest.fn(() => {
        throw new Error('an uncontested claim must not reach the judge');
      }),
    } as never,
    {
      setContext: jest.fn().mockReturnThis(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as never,
    new ClaimVerdictLedgerService(prisma as never),
  );

  afterAll(async () => {
    // The sweep under test takes the head of the REAL English backlog and
    // records an ask for every concept in it. Nobody asked about those, so
    // those ledger rows are removed and the corpus is left as found — the
    // same courtesy label-sweep-ledger.integration.spec.ts pays.
    await prisma.$executeRawUnsafe(
      `DELETE FROM knowledge_pass_runs WHERE pass = $1 AND ran_at >= $2`,
      sweepPass('en'),
      startedAt,
    );
    if (made.length) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM entity_surface WHERE entity_id = ANY($1::uuid[])`,
        made,
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM core_entities WHERE entity_id = ANY($1::uuid[])`,
        made,
      );
    }
    await prisma.$disconnect();
  });

  it('a contested-then-won claim is counted ONCE, by the write — and a dead-target claim is not counted at all', async () => {
    const winner = await mintFood(
      `zzappeal winner ${randomUUID().slice(0, 8)}`,
    );
    const word = `zzappeal word ${randomUUID().slice(0, 8)}`;
    // A claim nothing contests any more — the false-conflict undo. It banks,
    // with no hearing.
    // …and a claim whose target entity does not exist: the branch that
    // increments an OUTCOME counter while writing nothing.
    const summary = await adjudicator.adjudicate([
      { form: word, locale: 'en', entityId: winner, source: 'vocabulary' },
      {
        form: `zzappeal ghost ${randomUUID().slice(0, 8)}`,
        locale: 'en',
        entityId: randomUUID(),
        source: 'vocabulary',
      },
    ]);

    // The row really exists — the count is not a claim about intent.
    const rows = await prisma.$queryRawUnsafe<Array<{ form: string }>>(
      `SELECT form FROM entity_surface WHERE entity_id = $1::uuid`,
      winner,
    );
    expect(rows.map((r) => r.form)).toEqual([word]);

    expect(summary.banked).toBe(1);
    // …and the tally that looks equivalent is not: it counts the ghost too.
    // This line is the whole reason `banked` exists.
    expect(summary.bothUpheld + summary.incumbentEvicted).toBe(2);
  });

  it("the sweep reports the adjudicator's WRITES as surfacesWonOnAppeal, not its outcome counters", async () => {
    const sweep = new LabelSweepService(
      prisma as never,
      {
        adjudicate: jest.fn().mockResolvedValue({
          considered: 3,
          testimonyUpheld: 0,
          judged: 2,
          bothUpheld: 2,
          banked: 1,
          incumbentEvicted: 0,
          newcomerRefused: 1,
          unjudged: 0,
          cases: [],
        }),
      } as never,
    );
    // A generator that offers one label carrying a surface that the guard
    // blocks, so `contested` is non-empty and the adjudicator is consulted.
    const entityId = await mintFood(
      `zzappeal sweepee ${randomUUID().slice(0, 8)}`,
    );
    const incumbent = await mintFood(
      `zzappeal incumbent ${randomUUID().slice(0, 8)}`,
    );
    const contestedWord = `zzappeal contested ${randomUUID().slice(0, 8)}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO entity_surface (entity_id, form, form_folded, locale, role, source, confidence, status)
       VALUES ($1::uuid, $2, $2, 'en', 'recall', 'vocabulary', 1, 'active')`,
      incumbent,
      contestedWord,
    );

    const result = await sweep.sweep('en', {
      entityNames: [],
      generator: {
        name: 'test-contested',
        dryRun: false,
        generate: () =>
          Promise.resolve([
            {
              entityId,
              form: `zzappeal label ${randomUUID().slice(0, 8)}`,
              locale: 'en',
              status: 'active' as never,
              source: 'sweep' as never,
              // The SEARCH surface — the half the offered/banked/blocked
              // tally is about — and it is a word another concept owns.
              aliases: [contestedWord],
            },
          ]),
      } as never,
    });

    expect(result.surfacesBlocked).toBe(1);
    // The guard refused it, so the pre-adjudication tally saw nothing…
    expect(result.surfacesBanked).toBe(0);
    // …and the appeal's WRITE count is what surfaces, not `bothUpheld` (2).
    expect(result.surfacesWonOnAppeal).toBe(1);
  });
});
