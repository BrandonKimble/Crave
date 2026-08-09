import { PrismaClient } from '@prisma/client';

/**
 * P0-a AS A CHECKED PROPERTY (autocomplete i18n audit, AC-P1a interim).
 *
 * The autocomplete sparse lane still reads the unlocalized `aliases[]`
 * projection (haystack/tsv/unnest arms). That is safe ONLY while the
 * projection contains no tagged-locale-only form — the exact F2 class the
 * search gazetteer removed its array arm over (seeded es forms grounding
 * English requests). Today that safety is a data coincidence (measured: 0
 * leaking forms). This spec turns the coincidence into a law: every form in
 * the projection must be backed by an active und-locale alias row.
 *
 * MUTATION PROOF: push any tagged-only form into an entity's aliases[]
 * array (or make projectAliases include tagged rows) and this REDs.
 *
 * The full fix — retiring the array arms onto the locale-chained registry —
 * is AC-P1a in plans/concept-graph.md §13; this spec is its safety net, and
 * survives as the projection law's regression guard afterwards.
 */
const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('aliases[] projection stays und-only (P0-a / latent-F2 guard)', () => {
  it('no projected form lacks an active und alias row', async () => {
    const leaks = await prisma.$queryRaw<Array<{ name: string; form: string }>>`
      SELECT e.name, arr.form
      FROM core_entities e,
           LATERAL unnest(e.aliases) AS arr(form)
      WHERE e.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM entity_surface a
           WHERE a.entity_id = e.entity_id
             AND a.form = arr.form
             AND a.locale = 'und'
             AND a.status = 'active'
        )
      LIMIT 20`;
    expect(leaks).toEqual([]);
  });
});
