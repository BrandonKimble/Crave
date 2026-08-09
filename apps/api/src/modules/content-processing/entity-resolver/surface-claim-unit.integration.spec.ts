import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { addSurfaces } from './entity-surface.service';
import { identityInsertData } from './entity-identity';
import { WordClaimAdjudicatorService } from './word-claim-adjudicator.service';

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
});
