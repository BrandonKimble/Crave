import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { addSurfaces, foldSurfacesFromMerge } from './entity-surface.service';
import { identityInsertData } from './entity-identity';

/**
 * A HEARING THAT HAPPENED STAYS HAPPENED (A0 R6), proven against a real
 * database because every path here is SQL.
 *
 * `entity_surface.claim_judge_version` is the memory that a word claim was
 * SETTLED — by a verdict or by an eviction. `staleVerdictClaims` re-offers
 * every claim whose stamp is NULL or older than the current judge prompt, so
 * losing a stamp is not cosmetic: it silently re-opens a settled question and
 * pays an LLM judge call to answer it again.
 *
 * Two fold paths can touch a stamped row, and one of them was dropping it:
 *   - the addSurfaces conflict clause (an ordinary re-offer of the same form)
 *   - foldSurfacesFromMerge (the loser's rows land on the winner) — this one
 *     did not carry the column at all, so every settled claim a merged-away
 *     entity held arrived on the winner looking unheard.
 */
describe('claim_judge_version survives every fold — live database', () => {
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

  const stampOf = async (
    entityId: string,
    form: string,
  ): Promise<number | null> => {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ claim_judge_version: number | null }>
    >(
      `SELECT claim_judge_version FROM entity_surface
        WHERE entity_id = $1::uuid AND form = $2`,
      entityId,
      form,
    );
    return rows[0]?.claim_judge_version ?? null;
  };

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

  it('an ordinary re-offer neither erases NOR walks back the stamp', async () => {
    const id = await mintFood(`zzq stamp dish ${randomUUID().slice(0, 8)}`);
    const form = `zzq stamped form ${randomUUID().slice(0, 8)}`;

    await prisma.$transaction((tx) =>
      addSurfaces(tx, id, [
        { form, source: 'extraction', claimJudgeVersion: 7 },
      ]),
    );
    expect(await stampOf(id, form)).toBe(7);

    // A recall re-offer carries no verdict at all — the stamp must survive.
    await prisma.$transaction((tx) =>
      addSurfaces(tx, id, [{ form, source: 'extraction' }]),
    );
    expect(await stampOf(id, form)).toBe(7);

    // A re-offer carrying an OLDER version (a replay, or a hearing running
    // behind a prompt bump) must not make a settled claim look less settled:
    // staleVerdictClaims would re-offer it and pay for the answer again.
    await prisma.$transaction((tx) =>
      addSurfaces(tx, id, [
        { form, source: 'extraction', claimJudgeVersion: 3 },
      ]),
    );
    expect(await stampOf(id, form)).toBe(7);

    // A NEWER verdict is exactly what should move it.
    await prisma.$transaction((tx) =>
      addSurfaces(tx, id, [
        { form, source: 'extraction', claimJudgeVersion: 9 },
      ]),
    );
    expect(await stampOf(id, form)).toBe(9);
  });

  it('a merge fold carries the loser row’s stamp onto the winner', async () => {
    const winner = await mintFood(`zzq winner ${randomUUID().slice(0, 8)}`);
    const loser = await mintFood(`zzq loser ${randomUUID().slice(0, 8)}`);
    const form = `zzq settled claim ${randomUUID().slice(0, 8)}`;

    await prisma.$transaction((tx) =>
      addSurfaces(tx, loser, [
        { form, source: 'extraction', claimJudgeVersion: 5 },
      ]),
    );

    await prisma.$transaction((tx) => foldSurfacesFromMerge(tx, winner, loser));

    // Before the fix this was NULL — a settled claim arriving on the winner
    // as though no judge had ever heard it.
    expect(await stampOf(winner, form)).toBe(5);
  });

  it('when both sides hold the form, the NEWER hearing is the one that survives', async () => {
    const winner = await mintFood(`zzq winner2 ${randomUUID().slice(0, 8)}`);
    const loser = await mintFood(`zzq loser2 ${randomUUID().slice(0, 8)}`);
    const form = `zzq contested ${randomUUID().slice(0, 8)}`;

    await prisma.$transaction((tx) =>
      addSurfaces(tx, winner, [
        { form, source: 'extraction', claimJudgeVersion: 2 },
      ]),
    );
    await prisma.$transaction((tx) =>
      addSurfaces(tx, loser, [
        { form, source: 'extraction', claimJudgeVersion: 8 },
      ]),
    );

    await prisma.$transaction((tx) => foldSurfacesFromMerge(tx, winner, loser));
    expect(await stampOf(winner, form)).toBe(8);

    // ...and in the other direction too: a loser with the OLDER hearing
    // cannot drag the winner's stamp backwards.
    const winner3 = await mintFood(`zzq winner3 ${randomUUID().slice(0, 8)}`);
    const loser3 = await mintFood(`zzq loser3 ${randomUUID().slice(0, 8)}`);
    const form3 = `zzq contested3 ${randomUUID().slice(0, 8)}`;
    await prisma.$transaction((tx) =>
      addSurfaces(tx, winner3, [
        { form: form3, source: 'extraction', claimJudgeVersion: 8 },
      ]),
    );
    await prisma.$transaction((tx) =>
      addSurfaces(tx, loser3, [
        { form: form3, source: 'extraction', claimJudgeVersion: 2 },
      ]),
    );
    await prisma.$transaction((tx) =>
      foldSurfacesFromMerge(tx, winner3, loser3),
    );
    expect(await stampOf(winner3, form3)).toBe(8);
  });
});
