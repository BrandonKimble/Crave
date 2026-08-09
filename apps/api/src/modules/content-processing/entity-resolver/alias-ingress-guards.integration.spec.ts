import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { addSurfaces, projectAliases } from './entity-surface.service';
import { identityInsertData } from './entity-identity';

/**
 * THE TWO ALIAS-INGRESS GUARDS (concept-graph plan, P0-a and P0-b), proven
 * against a real database — both were added because a measured run produced a
 * real defect, so both must be able to show RED.
 *
 * P0-a: only `und` rows enter `core_entities.aliases[]`, the unlocalized hub
 *       that feeds the lexical recall core, the embedding doc and the typo
 *       dictionary.
 * P0-b: an INFERRED alias form that already names another entity (or is
 *       another entity's active alias) is refused. Observed surfaces are
 *       exempt — 7.8% of real alias rows legitimately collide.
 */
describe('alias ingress guards — proven against a live database', () => {
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

  it('P0-a: a locale-TAGGED alias is stored as a row but stays OUT of the array', async () => {
    const id = await mintFood(`zzq guard dish ${randomUUID().slice(0, 8)}`);
    await prisma.$transaction(async (tx) => {
      await addSurfaces(tx, id, [
        { form: 'zzq-untagged-surface', source: 'extraction' },
        { form: 'zzq-tagged-surface', locale: 'es', source: 'seed' },
      ]);
    });

    const rows = await prisma.$queryRawUnsafe<
      Array<{ form: string; locale: string }>
    >(
      `SELECT form, locale FROM entity_surface WHERE entity_id = $1::uuid ORDER BY form`,
      id,
    );
    // Both rows exist — the tagged one is reachable via the locale-aware gazetteer.
    expect(rows.map((r) => r.form).sort()).toEqual([
      'zzq-tagged-surface',
      'zzq-untagged-surface',
    ]);

    const [entity] = await prisma.$queryRawUnsafe<Array<{ aliases: string[] }>>(
      `SELECT aliases FROM core_entities WHERE entity_id = $1::uuid`,
      id,
    );
    // ...but only the untagged one is in the unlocalized projection.
    expect(entity.aliases).toContain('zzq-untagged-surface');
    expect(entity.aliases).not.toContain('zzq-tagged-surface');
  });

  it('P0-b: an INFERRED form that already names another entity is refused', async () => {
    const occupied = `zzq occupied name ${randomUUID().slice(0, 8)}`;
    await mintFood(occupied); // this entity owns the name
    const target = await mintFood(
      `zzq target dish ${randomUUID().slice(0, 8)}`,
    );

    await prisma.$transaction(async (tx) => {
      await addSurfaces(tx, target, [
        // the soup->caldo class: an inferred surface naming a different concept
        { form: occupied, source: 'seed', locale: 'es' },
        { form: 'zzq-inferred-safe', source: 'seed', locale: 'es' },
      ]);
    });

    const forms = await prisma.$queryRawUnsafe<Array<{ form: string }>>(
      `SELECT form FROM entity_surface WHERE entity_id = $1::uuid`,
      target,
    );
    const got = forms.map((f) => f.form);
    expect(got).not.toContain(occupied); // refused
    expect(got).toContain('zzq-inferred-safe'); // the safe one still lands
  });

  it('P0-b: an OBSERVED form is EXEMPT — testimony may collide', async () => {
    const occupied = `zzq observed name ${randomUUID().slice(0, 8)}`;
    await mintFood(occupied);
    const target = await mintFood(
      `zzq observed target ${randomUUID().slice(0, 8)}`,
    );

    await prisma.$transaction(async (tx) => {
      await addSurfaces(tx, target, [
        { form: occupied, source: 'extraction' }, // a real person said this
      ]);
    });

    const forms = await prisma.$queryRawUnsafe<Array<{ form: string }>>(
      `SELECT form FROM entity_surface WHERE entity_id = $1::uuid`,
      target,
    );
    expect(forms.map((f) => f.form)).toContain(occupied);
  });

  it('projectAliases stays idempotent under the und filter', async () => {
    const id = await mintFood(`zzq idem dish ${randomUUID().slice(0, 8)}`);
    await prisma.$transaction(async (tx) => {
      await addSurfaces(tx, id, [{ form: 'zzq-idem-a', source: 'extraction' }]);
    });
    const first = await prisma.$transaction((tx) => projectAliases(tx, id));
    const second = await prisma.$transaction((tx) => projectAliases(tx, id));
    expect(second).toEqual(first);
  });
});
