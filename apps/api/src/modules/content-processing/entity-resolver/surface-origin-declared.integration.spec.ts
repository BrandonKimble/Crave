import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { addSurfaces } from './entity-surface.service';
import { identityInsertData } from './entity-identity';

/**
 * THE WRITER DECLARES WHERE A FORM CAME FROM — proven against a real database.
 *
 * This file used to prove the opposite rule. `isRomanizationOfMarkedSibling`
 * INFERRED provenance from a pair of rows: an accent-free form offered under a
 * language, beside an accented spelling of the same folded word on the same
 * concept, was read as the romanization OF that spelling and re-tagged to
 * 'und'. The wave-2 measurement checked all 16 rows the rule's own `is_default`
 * exemption was protecting and found it pointed the WRONG WAY on every one:
 * es `pudin`/`daiquiri`/`bisque`, en `crepe`/`etouffee`/`cafe`, vi `kunefe`/
 * `tom yum` are the BORROWING language's own standard spelling — the sweep
 * banks that plain label, the generator separately banks the accented source
 * spelling as a recall row, and the rule reads the label as a romanization of
 * the recall row.
 *
 * The direction is NOT IN THE PAIR: `cafe`+`café` and `thit`+`thịt` are the
 * same SHAPE and opposite FACTS, because the difference is a property of the
 * language's orthography, not of the rows. Only the writer knows, so the writer
 * says — `surfaceOrigin`.
 *
 * The four cases are the whole contract, and the FIRST is the one that was
 * measured wrong: executed against the deleted code it is RED (the row lands at
 * 'und' and English loses the word it actually writes).
 */
/** The de-accenting a US keyboard performs: NFD, then drop the marks. Written
 *  out here rather than borrowed from `canonicalFold` so the fixture is a
 *  USER'S spelling, not the app's own fold judging itself. */
const ACCENTS = /[̀-ͯ]/gu;

describe('a surface banks at the language its writer claims', () => {
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

  // THE MEASURED CASE. `cafe` is what English writes; `café` beside it under
  // the same tag is the generator having banked the French spelling as an
  // English recall row. The old rule saw one shape — plain form, marked
  // sibling, same language — and took `en` away from the word English uses.
  it('keeps an authored plain form under its language, beside its own accented sibling', async () => {
    const suffix = randomUUID().slice(0, 8);
    const marked = `zzq café ${suffix}`;
    const plain = marked.normalize('NFD').replace(ACCENTS, '');
    const shop = await mintFood(`zzq coffee shop ${suffix}`);

    // The real sequence: the generator banks the accented recall row, the
    // sweep banks the plain label — and BOTH are authored.
    await prisma.$transaction((tx) =>
      addSurfaces(tx, shop, [
        { form: marked, locale: 'en', source: 'vocabulary', role: 'recall' },
      ]),
    );
    await prisma.$transaction((tx) =>
      addSurfaces(tx, shop, [
        { form: plain, locale: 'en', source: 'sweep', role: 'both' },
      ]),
    );

    const rows = await surfacesOf(shop);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ form: marked, locale: 'en' }),
        expect.objectContaining({ form: plain, locale: 'en' }),
      ]),
    );
    expect(rows.some((row) => row.form === plain && row.locale === 'und')).toBe(
      false,
    );
  });

  // The same shape in the other language, to make the point that the shape
  // decides nothing: vi `thit` beside `thịt` is a spelling nobody makes in
  // Vietnamese, and it STILL keeps its tag here — because the caller declared
  // it authored. The fix for a generator that emits a romanization is at the
  // generator, not a reader downstream guessing at direction.
  it('believes the tag even on a form the old rule would have moved', async () => {
    const suffix = randomUUID().slice(0, 8);
    const marked = `zzq thịt ${suffix}`;
    const plain = marked.normalize('NFD').replace(ACCENTS, '');
    const meat = await mintFood(`zzq meat ${suffix}`);
    await prisma.$transaction((tx) =>
      addSurfaces(tx, meat, [
        { form: marked, locale: 'vi', source: 'vocabulary', role: 'recall' },
        { form: plain, locale: 'vi', source: 'vocabulary', role: 'recall' },
      ]),
    );
    const rows = await surfacesOf(meat);
    expect(rows.find((row) => row.form === marked)?.locale).toBe('vi');
    expect(rows.find((row) => row.form === plain)?.locale).toBe('vi');
  });

  // THE OTHER ARM. A writer that says it SYNTHESIZED the spelling lands at
  // 'und' — and the locale it names is ignored rather than honoured, because a
  // string the code produced has no language to claim.
  it("banks a declared stripped-convenience form at 'und', whatever locale it names", async () => {
    const suffix = randomUUID().slice(0, 8);
    const plain = `zzq bun cha ${suffix}`;
    const dish = await mintFood(`zzq noodle ${suffix}`);
    await prisma.$transaction((tx) =>
      addSurfaces(tx, dish, [
        {
          form: plain,
          locale: 'vi',
          source: 'vocabulary',
          role: 'recall',
          surfaceOrigin: 'stripped-convenience',
        },
      ]),
    );
    expect(await surfacesOf(dish)).toEqual([
      expect.objectContaining({ form: plain, locale: 'und' }),
    ]);
  });

  // UNCONDITIONALLY — no sibling required. The old rule needed a marked twin on
  // the concept before it would move anything; a declaration needs no evidence
  // because it IS the evidence.
  it('needs no accented sibling to honour the stripped-convenience declaration', async () => {
    const suffix = randomUUID().slice(0, 8);
    const plain = `zzq lone form ${suffix}`;
    const lone = await mintFood(`zzq lone ${suffix}`);
    await prisma.$transaction((tx) =>
      addSurfaces(tx, lone, [
        {
          form: plain,
          locale: 'es',
          source: 'vocabulary',
          role: 'recall',
          surfaceOrigin: 'stripped-convenience',
        },
      ]),
    );
    expect(await surfacesOf(lone)).toEqual([
      expect.objectContaining({ form: plain, locale: 'und' }),
    ]);
  });
});
