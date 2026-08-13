import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { addSurfaces } from './entity-surface.service';
import { identityInsertData } from './entity-identity';

/**
 * A LANGUAGE TAG IS A CLAIM SOMEBODY MAKES — proven against a real database.
 *
 * `locale='vi'` says: somebody spells it this way, in Vietnamese. The
 * vocabulary pass was banking DE-ACCENTED ROMANIZATIONS under that tag —
 * 'vit' beside the very row ('vịt') it is the stripped spelling of — and the
 * exact-tier admission rule reads a language-tagged accent-free form as a
 * word the user spelled IN FULL. So a mis-tagged romanization is not untidy
 * bookkeeping: it makes 'salad vit' stop claiming 'salad vịt'.
 *
 * The three cases below are the whole rule, and the second is the one that
 * makes it safe to run:
 *   1. a plain form WITH a marked sibling on the same concept in the same
 *      language lands at 'und' — the universal romanization bucket;
 *   2. a plain form with NO marked sibling KEEPS its tag: 'chay'
 *      (vegetarian) is a real Vietnamese word, and it is exactly what powers
 *      the discriminator that stops 'cơm chay' matching 'cơm cháy';
 *   3. the marked form itself is never touched, and the batch judges its own
 *      rows against each other (a sweep offers both in one call).
 *
 * Executed against the pre-fix code, case 1 is RED (the row lands at 'vi').
 */
/** The de-accenting a US keyboard performs: NFD, then drop the marks. Written
 *  out here rather than borrowed from `canonicalFold` so the fixture is the
 *  USER'S spelling, not the app's own fold judging itself. */
const ACCENTS = /[̀-ͯ]/gu;

describe('a romanization is banked at und, not under a language', () => {
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
  ): Promise<Array<{ form: string; locale: string; role: string }>> =>
    prisma.$queryRawUnsafe(
      `SELECT form, LOWER(locale) AS locale, role FROM entity_surface
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

  it('re-tags the de-accented twin of a word the concept already spells', async () => {
    const marked = `zzq vịt ${randomUUID().slice(0, 8)}`;
    const plain = marked.normalize('NFD').replace(ACCENTS, '');
    const duck = await mintFood(`zzq duck ${randomUUID().slice(0, 8)}`);

    // The sweep banks the properly-spelled word first, then the generator
    // offers its romanization in a later call — the real sequence.
    await prisma.$transaction((tx) =>
      addSurfaces(tx, duck, [
        { form: marked, locale: 'vi', source: 'sweep', role: 'both' },
      ]),
    );
    await prisma.$transaction((tx) =>
      addSurfaces(tx, duck, [
        { form: plain, locale: 'vi', source: 'vocabulary', role: 'recall' },
      ]),
    );

    const rows = await surfacesOf(duck);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ form: marked, locale: 'vi' }),
        expect.objectContaining({ form: plain, locale: 'und' }),
      ]),
    );
    // Recall is UNTOUCHED — both rows still fold to the same key, so typing
    // the plain word still reaches the concept. Only the CLAIM moved.
    expect(rows.some((row) => row.form === plain && row.locale === 'vi')).toBe(
      false,
    );
  });

  it('leaves a genuine unaccented word under its language', async () => {
    const word = `zzq chay ${randomUUID().slice(0, 8)}`;
    const concept = await mintFood(`zzq veg ${randomUUID().slice(0, 8)}`);
    await prisma.$transaction((tx) =>
      addSurfaces(tx, concept, [
        { form: word, locale: 'vi', source: 'vocabulary', role: 'recall' },
      ]),
    );
    expect(await surfacesOf(concept)).toEqual([
      expect.objectContaining({ form: word, locale: 'vi' }),
    ]);
  });

  it('judges a batch against its own rows, and never moves the marked form', async () => {
    const marked = `zzq bưởi ${randomUUID().slice(0, 8)}`;
    const plain = marked.normalize('NFD').replace(ACCENTS, '');
    const pomelo = await mintFood(`zzq pomelo ${randomUUID().slice(0, 8)}`);
    await prisma.$transaction((tx) =>
      addSurfaces(tx, pomelo, [
        { form: marked, locale: 'vi', source: 'vocabulary', role: 'recall' },
        { form: plain, locale: 'vi', source: 'vocabulary', role: 'recall' },
      ]),
    );
    const rows = await surfacesOf(pomelo);
    expect(rows.find((row) => row.form === marked)?.locale).toBe('vi');
    expect(rows.find((row) => row.form === plain)?.locale).toBe('und');
  });
});
