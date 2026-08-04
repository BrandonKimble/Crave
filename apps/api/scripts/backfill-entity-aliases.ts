/** BACKFILL the entity_alias rows from the legacy `core_entities.aliases`
 *  array (multilingual plan A1). Every existing array element becomes one
 *  row: locale 'und' (untagged legacy — a FABRICATED language tag would
 *  poison both languages' retrieval with no rollback), source 'legacy',
 *  status 'active', form_folded computed by canonicalFold — the ONLY fold
 *  implementation. Never a SQL fold.
 *
 *  Idempotent (ON CONFLICT DO NOTHING on (entity_id, locale, form)), so
 *  it is safe to re-run and safe to run while writers are live: a form
 *  already banked as a row is skipped, and array order is preserved
 *  because rows are inserted in array order (seq = array position).
 *
 *  This does NOT rewrite the arrays — the projection is byte-identical to
 *  what is already there by construction (same forms, same order), so
 *  there is nothing to update and no embedding to invalidate.
 *
 *  Run: DATABASE_URL=... npx ts-node -T scripts/backfill-entity-aliases.ts
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { canonicalFold } from '../src/modules/content-processing/entity-resolver/entity-identity';
import { projectAliases } from '../src/modules/content-processing/entity-resolver/entity-alias.service';

const BATCH = 500;

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  const rows = await prisma.$queryRaw<
    Array<{ entity_id: string; aliases: string[] }>
  >`SELECT entity_id, aliases FROM core_entities
    WHERE aliases IS NOT NULL AND array_length(aliases, 1) > 0
    ORDER BY created_at, entity_id`;

  console.log('entities with aliases:', rows.length);

  let inserted = 0;
  let skippedEmpty = 0;
  let pending: Prisma.Sql[] = [];

  const flush = async (): Promise<void> => {
    if (pending.length === 0) return;
    inserted += await prisma.$executeRaw`
      INSERT INTO entity_alias
        (entity_id, form, form_folded, locale, source, confidence, status)
      VALUES ${Prisma.join(pending)}
      ON CONFLICT (entity_id, locale, form) DO NOTHING`;
    pending = [];
  };

  for (const row of rows) {
    // Per-entity dedupe on the exact form: the unique index would reject
    // the second copy anyway, but ON CONFLICT cannot fire twice within
    // ONE statement (Postgres: "cannot affect row a second time").
    const seenForms = new Set<string>();
    for (const raw of row.aliases) {
      const form = (raw ?? '').trim().replace(/\s+/g, ' ');
      if (!form) {
        skippedEmpty += 1;
        continue;
      }
      if (seenForms.has(form)) continue;
      seenForms.add(form);
      pending.push(
        Prisma.sql`(${row.entity_id}::uuid, ${form}, ${canonicalFold(form)}, 'und', 'legacy', 1, 'active')`,
      );
    }
    if (pending.length >= BATCH) {
      await flush();
    }
  }
  await flush();

  // RECONCILE: rows are the truth, so any entity whose array disagrees
  // with its projection gets the projection written. This is a no-op for
  // the legacy backfill by construction (same forms, same order) — it
  // exists for rows banked by the MIGRATION itself (the A8 ingredient
  // pre-dedupe folds each loser's name onto its winner as a merge_fold
  // row, which is a genuine new alias the winner's array does not have).
  const drifted = await prisma.$queryRaw<Array<{ entity_id: string }>>`
    SELECT e.entity_id FROM core_entities e
    WHERE COALESCE(e.aliases::text[], ARRAY[]::text[]) IS DISTINCT FROM COALESCE(
      (SELECT array_agg(d.form ORDER BY d.seq)::text[] FROM (
         SELECT DISTINCT ON (a.form) a.form, a.seq FROM entity_alias a
         WHERE a.entity_id = e.entity_id AND a.status = 'active'
         ORDER BY a.form, a.seq
       ) d), ARRAY[]::text[])`;
  for (const row of drifted) {
    await prisma.$transaction((tx) => projectAliases(tx, row.entity_id));
  }
  console.log('arrays re-projected:', drifted.length);

  const total = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM entity_alias`;
  const bySource = await prisma.$queryRaw<
    Array<{ source: string; n: number }>
  >`SELECT source, count(*)::int AS n FROM entity_alias GROUP BY 1 ORDER BY 2 DESC`;
  const unfoldable = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM entity_alias WHERE form_folded = ''`;

  console.log('inserted this run:', inserted);
  console.log('empty forms skipped:', skippedEmpty);
  console.log('entity_alias total:', total[0].n);
  console.log('by source:', bySource);
  // form_folded = '' means the surface has no letters or digits in ANY
  // script (emoji-only, '!!!'). Not an error — just not a recall key.
  console.log('unfoldable forms:', unfoldable[0].n);

  await prisma.$disconnect();
}

void main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
