import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { addSurfaces, foldSurfacesFromMerge } from './entity-surface.service';
import { identityInsertData } from './entity-identity';
import { WordClaimAdjudicatorService } from './word-claim-adjudicator.service';

/**
 * THE ROLE IS A VERDICT — proven against a real database.
 *
 * Since the surface merge, ONE row carries both the label a user reads and the
 * memory of what its recall claim was worth. That makes `role` a verdict, and
 * every one of these tests is a path that was found OVERTURNING a verdict
 * without a hearing (red team, 2026-08-09), each executed against this corpus
 * before it was fixed:
 *
 *   P0  eviction deprecated a role='both' row, so winning a word away from a
 *       concept silently reverted 13,734 users' localized labels to English.
 *   A   an OBSERVED `ON CONFLICT` write widened role display->both: testimony
 *       that someone said a word became testimony that a refused claim was
 *       wrongly refused.
 *   B   a role='both' write flipped status deprecated->active: the memory that
 *       a form is WRONG was erasable by re-offering it.
 *   C   the merge fold omitted `role`, so the column default laundered a
 *       loser's REFUSED display row into an active recall surface on the
 *       winner — a merge deciding word ownership.
 */
describe('surface role verdicts — proven against a live database', () => {
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
    Array<{ form: string; role: string; status: string; is_default: boolean }>
  > =>
    prisma.$queryRawUnsafe(
      `SELECT form, role, status, is_default FROM entity_surface
        WHERE entity_id = $1::uuid ORDER BY form`,
      entityId,
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
   * P0 — the whole eviction scenario, end to end, with the judge stubbed to
   * the exact verdict that costs the incumbent the word: the newcomer owns it,
   * the incumbent does not.
   */
  it('P0: eviction takes the incumbent WORD and leaves the user their LABEL', async () => {
    const word = `zzq palabra ${randomUUID().slice(0, 8)}`;
    const incumbent = await mintFood(
      `zzq incumbent ${randomUUID().slice(0, 8)}`,
    );
    const newcomer = await mintFood(`zzq newcomer ${randomUUID().slice(0, 8)}`);

    // The incumbent banks it the way the label sweep does: role='both', the
    // rendered default label for (entity, locale).
    await prisma.$transaction((tx) =>
      addSurfaces(tx, incumbent, [
        {
          form: word,
          locale: 'es',
          source: 'sweep',
          role: 'both',
          isDefault: true,
        },
      ]),
    );

    const judge = {
      generateForCaller: jest.fn().mockResolvedValue(
        JSON.stringify({
          items: [{ n: 1, a_owns_word: true, incumbents_own_word: [false] }],
        }),
      ),
    };
    const adjudicator = new WordClaimAdjudicatorService(
      prisma as never,
      judge as never,
      {
        setContext: jest.fn().mockReturnThis(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      } as never,
    );

    const summary = await adjudicator.adjudicate([
      { form: word, locale: 'es', entityId: newcomer, source: 'vocabulary' },
    ]);
    expect(summary.incumbentEvicted).toBe(1);

    // THE LABEL SURVIVES. Every display read requires status='active'; a
    // deprecated row would have reverted this user's Spanish label to English.
    const loser = (await surfacesOf(incumbent)).find((r) => r.form === word);
    expect(loser).toMatchObject({
      role: 'display',
      status: 'active',
      is_default: true,
    });

    // THE WORD IS GONE. The recall slice every grounding arm reads carries
    // `role <> 'display'`, so the lost claim grounds nothing.
    const grounds = await prisma.$queryRawUnsafe<Array<{ form: string }>>(
      `SELECT form FROM entity_surface
        WHERE entity_id = $1::uuid AND status = 'active' AND role <> 'display'`,
      incumbent,
    );
    expect(grounds.map((r) => r.form)).not.toContain(word);

    // THE WINNER HOLDS IT.
    const won = (await surfacesOf(newcomer)).find((r) => r.form === word);
    expect(won).toMatchObject({ role: 'recall', status: 'active' });

    // THE LOSS IS SETTLED: the loser can no longer re-earn the word by
    // re-offering it (a nightly sweep re-writing the same label), and it no
    // longer contests the winner's hold on it either.
    await prisma.$transaction((tx) =>
      addSurfaces(tx, incumbent, [
        { form: word, locale: 'es', source: 'sweep', role: 'both' },
      ]),
    );
    const afterRetry = (await surfacesOf(incumbent)).find(
      (r) => r.form === word,
    );
    expect(afterRetry).toMatchObject({ role: 'display', status: 'active' });

    // ...and it is not re-judged: a display row is not an incumbent, so the
    // adjudicator sees nothing to contest and never pays for a hearing.
    judge.generateForCaller.mockClear();
    const rerun = await adjudicator.adjudicate([
      { form: word, locale: 'es', entityId: newcomer, source: 'vocabulary' },
    ]);
    expect(judge.generateForCaller).not.toHaveBeenCalled();
    expect(rerun.judged).toBe(0);
  });

  it('A: an OBSERVED write cannot widen a refused display row into a recall claim', async () => {
    const word = `zzq observada ${randomUUID().slice(0, 8)}`;
    const holder = await mintFood(`zzq holder ${randomUUID().slice(0, 8)}`);
    const refused = await mintFood(`zzq refused ${randomUUID().slice(0, 8)}`);

    await prisma.$transaction((tx) =>
      addSurfaces(tx, holder, [
        { form: word, locale: 'es', source: 'extraction', role: 'recall' },
      ]),
    );
    // The guard refuses the inferred label's claim; the row lands as display.
    const first = await prisma.$transaction((tx) =>
      addSurfaces(tx, refused, [
        { form: word, locale: 'es', source: 'sweep', role: 'both' },
      ]),
    );
    expect(first.blocked).toContain(word);
    expect((await surfacesOf(refused))[0]).toMatchObject({ role: 'display' });

    // Now the bypass: an OBSERVED source re-offers the same form. Its own new
    // rows are testimony and land freely — but this row already sits at
    // 'display', and widening it is a claim on a word another concept holds.
    const second = await prisma.$transaction((tx) =>
      addSurfaces(tx, refused, [
        { form: word, locale: 'es', source: 'extraction', role: 'recall' },
      ]),
    );
    expect((await surfacesOf(refused))[0]).toMatchObject({ role: 'display' });
    // The refusal is REPORTED, not silent — a guard whose blast radius is
    // invisible is a guard nobody can trust.
    expect(second.blocked).toContain(word);
  });

  it('A: an observed write DOES widen once the word is uncontested', async () => {
    // The mirror image, so the rule reads as "widening is earned" and not
    // "display rows are frozen": with nothing contesting the word, the same
    // write lands.
    const word = `zzq libre ${randomUUID().slice(0, 8)}`;
    const entity = await mintFood(`zzq free ${randomUUID().slice(0, 8)}`);
    await prisma.$transaction((tx) =>
      addSurfaces(tx, entity, [
        { form: word, locale: 'es', source: 'sweep', role: 'display' },
      ]),
    );
    await prisma.$transaction((tx) =>
      addSurfaces(tx, entity, [
        { form: word, locale: 'es', source: 'extraction', role: 'recall' },
      ]),
    );
    expect((await surfacesOf(entity))[0]).toMatchObject({ role: 'both' });
  });

  it('B: no unadjudicated write can resurrect a deprecated form', async () => {
    const word = `zzq muerta ${randomUUID().slice(0, 8)}`;
    const entity = await mintFood(`zzq buried ${randomUUID().slice(0, 8)}`);
    await prisma.$transaction((tx) =>
      addSurfaces(tx, entity, [
        { form: word, locale: 'es', source: 'sweep', role: 'both' },
      ]),
    );
    await prisma.$transaction((tx) =>
      addSurfaces(tx, entity, [], { deprecateForms: [word] }),
    );
    expect((await surfacesOf(entity))[0]).toMatchObject({
      status: 'deprecated',
    });

    for (const role of ['both', 'recall', 'display'] as const) {
      await prisma.$transaction((tx) =>
        addSurfaces(tx, entity, [
          { form: word, locale: 'es', source: 'sweep', role, status: 'active' },
        ]),
      );
      expect((await surfacesOf(entity))[0]).toMatchObject({
        status: 'deprecated',
      });
    }
  });

  it('C: the merge fold carries ROLE, so a loser’s refused label is not laundered into a recall claim', async () => {
    const word = `zzq fusion ${randomUUID().slice(0, 8)}`;
    const loser = await mintFood(`zzq loser ${randomUUID().slice(0, 8)}`);
    const winner = await mintFood(`zzq winner ${randomUUID().slice(0, 8)}`);

    await prisma.$executeRawUnsafe(
      `INSERT INTO entity_surface (entity_id, form, form_folded, locale, role, source, confidence, status)
       VALUES ($1::uuid, $2, $2, 'es', 'display', 'sweep', 1, 'active'),
              ($1::uuid, $3, $3, 'es', 'recall', 'sweep', 1, 'deprecated')`,
      loser,
      word,
      `${word} dep`,
    );

    await prisma.$transaction((tx) => foldSurfacesFromMerge(tx, winner, loser));

    const carried = await surfacesOf(winner);
    expect(carried.find((r) => r.form === word)).toMatchObject({
      role: 'display',
      status: 'active',
    });
    expect(carried.find((r) => r.form === `${word} dep`)).toMatchObject({
      role: 'recall',
      status: 'deprecated',
    });
    // ...and none of it entered the recall slice by moving house.
    const grounds = await prisma.$queryRawUnsafe<Array<{ form: string }>>(
      `SELECT form FROM entity_surface
        WHERE entity_id = $1::uuid AND status = 'active' AND role <> 'display'`,
      winner,
    );
    expect(grounds.map((r) => r.form)).not.toContain(word);
  });
});
