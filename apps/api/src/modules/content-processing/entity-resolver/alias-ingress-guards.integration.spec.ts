import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { addSurfaces } from './entity-surface.service';
import { identityInsertData } from './entity-identity';

/**
 * THE TWO ALIAS-INGRESS GUARDS (concept-graph plan, P0-a and P0-b), proven
 * against a real database — both were added because a measured run produced a
 * real defect, so both must be able to show RED.
 *
 * P0-a: only `und` rows enter THE RECALL SLICE — the untagged set every arm
 *       that takes no locale reads (the resolver's surface tier, the typo
 *       dictionary, the ingredient twin probe). Asserted directly against
 *       that slice now: `core_entities.aliases[]`, the derived projection
 *       this used to read, was retired (§11 item 4 / I-2).
 * P0-b: an INFERRED alias form that already names another entity (or is
 *       another entity's active alias) is refused. Observed surfaces are
 *       exempt — 7.8% of real alias rows legitimately collide.
 */
describe('alias ingress guards — proven against a live database', () => {
  const prisma = new PrismaClient();
  const made: string[] = [];

  const mintItem = async (name: string): Promise<string> => {
    const id = randomUUID();
    const identity = identityInsertData(name, 'item' as never);
    await prisma.$executeRawUnsafe(
      `INSERT INTO core_entities (entity_id, name, type, status, identity_key, identity_key_sorted)
       VALUES ($1::uuid, $2, 'item'::entity_type, 'active'::entity_status, $3, $4)`,
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

  it('P0-a: a locale-TAGGED surface is stored as a row but stays OUT of the untagged recall slice', async () => {
    const id = await mintItem(`zzq guard dish ${randomUUID().slice(0, 8)}`);
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

    // ...but only the untagged one is in the RECALL SLICE the locale-blind
    // arms read (und + active + role<>'display').
    const recall = await prisma.$queryRawUnsafe<Array<{ form: string }>>(
      `SELECT form FROM entity_surface
        WHERE entity_id = $1::uuid
          AND status = 'active' AND locale = 'und' AND role <> 'display'`,
      id,
    );
    const recallForms = recall.map((r) => r.form);
    expect(recallForms).toContain('zzq-untagged-surface');
    expect(recallForms).not.toContain('zzq-tagged-surface');
  });

  it('P0-b: an INFERRED form that already names another entity is refused', async () => {
    const occupied = `zzq occupied name ${randomUUID().slice(0, 8)}`;
    await mintItem(occupied); // this entity owns the name
    const target = await mintItem(
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
    await mintItem(occupied);
    const target = await mintItem(
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

  it('re-offering an existing form is a no-op, not a duplicate row', async () => {
    // The idempotence that used to be asserted about the derived array is a
    // property of the ROWS: (entity, locale, form) is unique, so a second
    // offer of the same form changes nothing. This is what let the enrichment
    // and knowledge passes stop hand-deduping against a loaded array.
    const id = await mintItem(`zzq idem dish ${randomUUID().slice(0, 8)}`);
    await prisma.$transaction(async (tx) => {
      await addSurfaces(tx, id, [{ form: 'zzq-idem-a', source: 'extraction' }]);
    });
    await prisma.$transaction(async (tx) => {
      await addSurfaces(tx, id, [{ form: 'zzq-idem-a', source: 'extraction' }]);
    });
    const rows = await prisma.$queryRawUnsafe<Array<{ form: string }>>(
      `SELECT form FROM entity_surface WHERE entity_id = $1::uuid`,
      id,
    );
    expect(rows.map((r) => r.form)).toEqual(['zzq-idem-a']);
  });
});
