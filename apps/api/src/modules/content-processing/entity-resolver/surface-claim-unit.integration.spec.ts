import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { addSurfaces } from './entity-surface.service';
import { identityInsertData } from './entity-identity';
import { ClaimVerdictLedgerService } from './claim-verdict-ledger.service';
import {
  CLAIM_JUDGE_PROMPT_VERSION,
  WordClaimAdjudicatorService,
} from './word-claim-adjudicator.service';

/**
 * THE CLAIM UNIT IS THE FORM — proven against a real database.
 *
 * The collision guard and the word-claim judge used to work on `canonicalFold`,
 * the accent-DESTROYING recall key. That made every hearing between two
 * Vietnamese words a FALSE CONFLICT — bò (beef), bơ (butter) and bó (bunch) are
 * one folded `bo` — and both possible outcomes of such a hearing take a correct
 * word→concept pairing away. These tests pin the two halves that must BOTH
 * hold, because relaxing one without the other is exactly how the founding
 * regressions (caldo→soup, helado→iced, picante) got in:
 *
 *   1. an IDENTICAL-form claim on another concept's word is still refused, and
 *      still reaches the judge;
 *   2. a claim that shares only the FOLD banks silently — no refusal, no
 *      hearing, no LLM call;
 *   3. recall breadth is untouched: both words keep the same `form_folded`, so
 *      typing the unaccented word still reaches both concepts.
 *
 * Executed against the pre-fix code, 2 and 3-as-a-pair are RED (the fold-only
 * claim is refused and the judge is asked an unanswerable question).
 */
describe('the claim unit is the FORM, not the fold', () => {
  const prisma = new PrismaClient();
  const made: string[] = [];

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

  const surfacesOf = async (
    entityId: string,
  ): Promise<
    Array<{ form: string; form_folded: string; role: string; status: string }>
  > =>
    prisma.$queryRawUnsafe(
      `SELECT form, form_folded, role, status FROM entity_surface
        WHERE entity_id = $1::uuid ORDER BY form`,
      entityId,
    );

  /** A judge that must NEVER be called: any invocation fails the test. */
  const forbiddenJudge = () => ({
    generateForCaller: jest.fn(() => {
      throw new Error('the judge was asked about a fold-only collision');
    }),
  });

  const adjudicatorWith = (judge: unknown): WordClaimAdjudicatorService =>
    new WordClaimAdjudicatorService(
      prisma as never,
      judge as never,
      {
        setContext: jest.fn().mockReturnThis(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      } as never,
      new ClaimVerdictLedgerService(prisma as never),
    );

  afterAll(async () => {
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

  /**
   * THE GUARD'S FOUNDING CASE, unchanged: one word, two concepts, inference on
   * both sides. `caldo` names a concept and an inferred surface claims it.
   */
  it('refuses an IDENTICAL-form claim on another concept and offers it to the judge', async () => {
    const word = `zzq caldo ${randomUUID().slice(0, 8)}`;
    const incumbent = await mintFood(
      `zzq incumbent ${randomUUID().slice(0, 8)}`,
    );
    const newcomer = await mintFood(`zzq newcomer ${randomUUID().slice(0, 8)}`);
    await prisma.$transaction((tx) =>
      addSurfaces(tx, incumbent, [
        { form: word, locale: 'es', source: 'vocabulary', role: 'recall' },
      ]),
    );

    const refused = await prisma.$transaction((tx) =>
      addSurfaces(tx, newcomer, [
        { form: word, locale: 'es', source: 'vocabulary', role: 'both' },
      ]),
    );
    expect(refused.blocked).toEqual([word]);
    // Degraded, not dropped: the label lives, the word does not.
    expect((await surfacesOf(newcomer))[0]).toMatchObject({ role: 'display' });

    // And the appeal is REAL — the judge is asked, and its verdict lands.
    const judge = {
      generateForCaller: jest.fn().mockResolvedValue(
        JSON.stringify({
          items: [{ n: 1, a_owns_word: true, incumbents_own_word: [true] }],
        }),
      ),
    };
    const summary = await adjudicatorWith(judge).adjudicate([
      { form: word, locale: 'es', entityId: newcomer, source: 'vocabulary' },
    ]);
    expect(judge.generateForCaller).toHaveBeenCalledTimes(1);
    expect(summary.bothUpheld).toBe(1);
  });

  /**
   * THE FALSE CONFLICT, which must not happen at all: bò and bơ share a fold
   * and nothing else. No refusal, no degrade, and — the part that costs real
   * money and real verdicts — NO HEARING.
   */
  it('banks a FOLD-ONLY claim silently: no refusal, no degrade, no hearing', async () => {
    const suffix = randomUUID().slice(0, 8);
    const butterWord = `zzq bơ ${suffix}`;
    const beefWord = `zzq bò ${suffix}`;
    const butter = await mintFood(`zzq butter ${suffix}`);
    const beef = await mintFood(`zzq beef ${suffix}`);

    await prisma.$transaction((tx) =>
      addSurfaces(tx, butter, [
        { form: butterWord, locale: 'vi', source: 'vocabulary', role: 'both' },
      ]),
    );
    const banked = await prisma.$transaction((tx) =>
      addSurfaces(tx, beef, [
        { form: beefWord, locale: 'vi', source: 'vocabulary', role: 'both' },
      ]),
    );

    expect(banked.blocked).toEqual([]);
    expect((await surfacesOf(beef))[0]).toMatchObject({
      role: 'both',
      status: 'active',
    });
    // The incumbent is untouched — a false conflict cannot cost it the word.
    expect((await surfacesOf(butter))[0]).toMatchObject({ role: 'both' });

    // RECALL BREADTH IS UNCHANGED: one folded key, two words. Typing the
    // unaccented 'bo' still reaches both concepts — placement resolves it.
    const beefRow = (await surfacesOf(beef))[0];
    const butterRow = (await surfacesOf(butter))[0];
    expect(beefRow.form_folded).toBe(butterRow.form_folded);
    expect(beefRow.form).not.toBe(butterRow.form);

    // AND NO JUDGE WAS PAID. Handing this pair to the adjudicator must not
    // produce a hearing: there is no question to ask.
    const judge = forbiddenJudge();
    const summary = await adjudicatorWith(judge).adjudicate([
      { form: beefWord, locale: 'vi', entityId: beef, source: 'vocabulary' },
    ]);
    expect(judge.generateForCaller).not.toHaveBeenCalled();
    expect(summary.judged).toBe(0);
  });

  /**
   * THE FALSE-CONFLICT CLEAR IS IDEMPOTENT. A row that lost a fold-only hearing
   * is restored by `scripts/data-fixes/clear-fold-only-claim-verdicts.ts`; the
   * property that makes that pass safe to re-run is that a RESTORED row is no
   * longer a loser, so the second run has nothing to do. This asserts the
   * property at its source — re-offering the restored claim changes nothing and
   * still needs no hearing.
   */
  it('the cleared claim stays cleared: re-offering it is a no-op with no hearing', async () => {
    const suffix = randomUUID().slice(0, 8);
    const bunchWord = `zzq bó ${suffix}`;
    const beefWord = `zzq bò ${suffix}`;
    const bunch = await mintFood(`zzq bunch ${suffix}`);
    const beef = await mintFood(`zzq beef ${suffix}`);

    await prisma.$transaction((tx) =>
      addSurfaces(tx, bunch, [
        { form: bunchWord, locale: 'vi', source: 'vocabulary', role: 'both' },
      ]),
    );
    // The state the old fold-scoped guard left behind: a refused claim,
    // remembered as wrong.
    await prisma.$executeRawUnsafe(
      `INSERT INTO entity_surface (entity_id, form, form_folded, locale, role, source, status)
       VALUES ($1::uuid, $2, $3, 'vi', 'recall', 'vocabulary', 'deprecated')`,
      beef,
      beefWord,
      `zzq bo ${suffix}`,
    );
    // …cleared by the data fix (the same two columns it writes).
    await prisma.$executeRawUnsafe(
      `UPDATE entity_surface SET status = 'active'
        WHERE entity_id = $1::uuid AND form = $2`,
      beef,
      beefWord,
    );

    const judge = forbiddenJudge();
    const again = await prisma.$transaction((tx) =>
      addSurfaces(tx, beef, [
        { form: beefWord, locale: 'vi', source: 'vocabulary', role: 'recall' },
      ]),
    );
    expect(again.blocked).toEqual([]);
    expect((await surfacesOf(beef))[0]).toMatchObject({
      role: 'recall',
      status: 'active',
    });
    const summary = await adjudicatorWith(judge).adjudicate([
      { form: beefWord, locale: 'vi', entityId: beef, source: 'vocabulary' },
    ]);
    expect(judge.generateForCaller).not.toHaveBeenCalled();
    expect(summary.judged).toBe(0);
  });

  /**
   * A WRONG VERDICT IS CORRECTED BY RE-HEARING, NEVER BY HAND.
   *
   * The memory of a lost claim is permanent on purpose, so nothing re-proposes
   * it nightly. That made a wrong JUDGING RULE uncorrectable except by editing
   * rows — which is what was done to `chả giò` and `chảy` on 2026-08-09 and is
   * exactly what does not scale. Every verdict now carries the rule version
   * that made it, so bumping the rule re-opens the case and the machinery
   * decides again. Three things must hold together, and the middle one is what
   * the old code got wrong: a re-heard WIN could not actually land, because an
   * adjudicated re-bank left the row deprecated.
   */
  it('re-opens a verdict made by an OLDER rule, and a re-heard win lands', async () => {
    const suffix = randomUUID().slice(0, 8);
    const word = `zzq picante ${suffix}`;
    const incumbent = await mintFood(`zzq holder ${suffix}`);
    const loser = await mintFood(`zzq loser ${suffix}`);

    await prisma.$transaction((tx) =>
      addSurfaces(tx, incumbent, [
        { form: word, locale: 'es', source: 'vocabulary', role: 'recall' },
      ]),
    );
    // The old rule refused the newcomer and remembered it as wrong.
    const refusingJudge = {
      generateForCaller: jest.fn().mockResolvedValue(
        JSON.stringify({
          items: [
            {
              n: 1,
              a_owns_word: false,
              incumbents_own_word: [true],
              reason: 'the old rule',
            },
          ],
        }),
      ),
    };
    await adjudicatorWith(refusingJudge).adjudicate([
      { form: word, locale: 'es', entityId: loser, source: 'vocabulary' },
    ]);
    expect((await surfacesOf(loser))[0]).toMatchObject({
      status: 'deprecated',
    });

    // Stamped with the rule that decided it — the whole point of the column.
    const stampNow = await prisma.$queryRawUnsafe<
      Array<{ claim_judge_version: number | null }>
    >(
      `SELECT claim_judge_version FROM entity_surface
        WHERE entity_id = $1::uuid AND form = $2`,
      loser,
      word,
    );
    expect(stampNow[0].claim_judge_version).toBe(CLAIM_JUDGE_PROMPT_VERSION);

    // Current-rule verdicts are settled: nothing re-offers them.
    const judgeService = adjudicatorWith(refusingJudge);
    const settled = await judgeService.dueClaims('es', { forms: [word] });
    expect(settled.map((c) => c.entityId)).not.toContain(loser);

    // Age the VERDICT — i.e. the rule moved on — and the claim comes due.
    // The lever is the ledger row, not a stamp on the surface: that is what
    // makes the same lever work for a claim that WON, which left no losing
    // row to age.
    await prisma.$executeRawUnsafe(
      `UPDATE claim_verdicts SET rule_version = rule_version - 1
        WHERE lane = 'word_claim' AND subject->>'entityId' = $1`,
      loser,
    );
    const due = await judgeService.dueClaims('es', { forms: [word] });
    expect(due.map((c) => c.entityId)).toContain(loser);

    // Re-heard under the new rule, BOTH are upheld — and the win must land,
    // not be swallowed by the remembered refusal.
    const upholdingJudge = {
      generateForCaller: jest.fn().mockResolvedValue(
        JSON.stringify({
          items: [
            {
              n: 1,
              a_owns_word: true,
              incumbents_own_word: [true],
              reason: 'culinary near-synonyms',
            },
          ],
        }),
      ),
    };
    const summary = await adjudicatorWith(upholdingJudge).adjudicate(due);
    expect(summary.bothUpheld).toBe(1);
    expect(summary.cases[0].reason).toBe('culinary near-synonyms');
    expect((await surfacesOf(loser))[0]).toMatchObject({
      status: 'active',
    });
    // The incumbent kept its word — upholding both takes nothing away.
    expect((await surfacesOf(incumbent))[0]).toMatchObject({
      role: 'recall',
      status: 'active',
    });
  });

  /**
   * THE SINGLE-CLAIMANT HEARING — a mis-banked word with NO rival.
   *
   * Before 2026-08-12 this claim could not be heard at all: with no incumbent
   * the adjudicator took the "uncontested → bank" shortcut, which is the right
   * answer for a claim being PROPOSED and decides nothing for one the entity
   * already HOLDS. So a wrong surface nobody contested went on grounding
   * mentions at 0.95 forever (`bánh cuộn` on `wrap`). Executed against the
   * pre-fix code this test is RED twice over: the judge is never called, and
   * the row stays active.
   */
  it('hears a held claim with NO competing claimant, and a NO RETRACTS it with the rule version stamped', async () => {
    const word = `zzq lonely ${randomUUID().slice(0, 8)}`;
    const owner = await mintFood(`zzq owner ${randomUUID().slice(0, 8)}`);
    await prisma.$transaction((tx) =>
      addSurfaces(tx, owner, [
        { form: word, locale: 'vi', source: 'vocabulary', role: 'recall' },
      ]),
    );
    // The premise: nothing contests this word, and it is banked and grounding.
    expect((await surfacesOf(owner))[0]).toMatchObject({
      role: 'recall',
      status: 'active',
    });

    const refusingJudge = {
      generateForCaller: jest.fn().mockResolvedValue(
        JSON.stringify({
          items: [
            {
              n: 1,
              a_owns_word: false,
              incumbents_own_word: [],
              reason: 'a speaker typing this word does not want this concept',
            },
          ],
        }),
      ),
    };
    const summary = await adjudicatorWith(refusingJudge).adjudicate([
      {
        form: word,
        locale: 'vi',
        entityId: owner,
        source: 'vocabulary',
        hearing: 'retain',
      },
    ]);

    // A HEARING HAPPENED — the shortcut no longer swallows it.
    expect(refusingJudge.generateForCaller).toHaveBeenCalledTimes(1);
    // THE WORD UNDER JUDGMENT IS NOT ITS OWN EVIDENCE: the claimant card must
    // not list the very form being judged as "also known as", or the judge
    // reads the claim back as proof of itself and a retraction can never
    // reach NO (observed verbatim on the first seeded run).
    const [[call]] = refusingJudge.generateForCaller.mock.calls as Array<
      [{ prompt: string }]
    >;
    expect(call.prompt).not.toContain(`also known as: ${word}`);
    // And the verdict is a RETRACTION, not a refusal — different event,
    // different counter, and the row is the memory of it.
    expect(summary.claimsRetracted).toBe(1);
    expect(summary.newcomerRefused).toBe(0);
    expect(summary.cases[0].outcome).toBe('claimRetracted');
    expect((await surfacesOf(owner))[0]).toMatchObject({
      role: 'recall',
      status: 'deprecated',
    });
    const [stamped] = await prisma.$queryRawUnsafe<
      Array<{ claim_judge_version: number }>
    >(
      `SELECT claim_judge_version FROM entity_surface
        WHERE entity_id = $1::uuid AND form = $2`,
      owner,
      word,
    );
    expect(stamped.claim_judge_version).toBe(CLAIM_JUDGE_PROMPT_VERSION);
  });

  /** The other side: a held claim the judge UPHOLDS keeps its word and is
   *  stamped, so no later feed pays to ask the same question again. */
  it('a held claim the judge upholds stays active and carries the stamp', async () => {
    const word = `zzq upheld ${randomUUID().slice(0, 8)}`;
    const owner = await mintFood(`zzq keeper ${randomUUID().slice(0, 8)}`);
    await prisma.$transaction((tx) =>
      addSurfaces(tx, owner, [
        { form: word, locale: 'vi', source: 'vocabulary', role: 'recall' },
      ]),
    );
    const upholdingJudge = {
      generateForCaller: jest.fn().mockResolvedValue(
        JSON.stringify({
          items: [
            {
              n: 1,
              a_owns_word: true,
              incumbents_own_word: [],
              reason: 'this is what speakers call it',
            },
          ],
        }),
      ),
    };
    const summary = await adjudicatorWith(upholdingJudge).adjudicate([
      {
        form: word,
        locale: 'vi',
        entityId: owner,
        source: 'vocabulary',
        hearing: 'retain',
      },
    ]);
    expect(summary.claimsRetracted).toBe(0);
    const [row] = await prisma.$queryRawUnsafe<
      Array<{ status: string; role: string; claim_judge_version: number }>
    >(
      `SELECT status::text, role::text, claim_judge_version FROM entity_surface
        WHERE entity_id = $1::uuid AND form = $2`,
      owner,
      word,
    );
    expect(row).toMatchObject({ status: 'active', role: 'recall' });
    expect(row.claim_judge_version).toBe(CLAIM_JUDGE_PROMPT_VERSION);
  });
});
