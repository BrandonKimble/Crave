/** BACKFILL entity_labels.form_folded through canonicalFold — the ONLY fold
 *  implementation, never a SQL fold (Postgres Unicode classes are
 *  platform-dependent). The migration 20260807000000 added the column with a
 *  constant '' default and dropped the default; this rewrites every existing
 *  row's form_folded to canonicalFold(form), the same value the app writer
 *  (LabelSweepService.writeLabels) now writes for every new label.
 *
 *  Idempotent: it recomputes canonicalFold(form) for every row and only
 *  UPDATEs the rows whose stored form_folded differs, so a re-run after the
 *  first pass touches nothing. Safe to run while writers are live — a row the
 *  writer already folded correctly is skipped.
 *
 *  Run: DATABASE_URL=... npx ts-node -T scripts/backfill-label-folds.ts
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { canonicalFold } from '../src/modules/content-processing/entity-resolver/entity-identity';

const BATCH = 500;

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  const rows = await prisma.$queryRaw<
    Array<{
      entity_id: string;
      locale: string;
      form: string;
      form_folded: string;
    }>
  >`SELECT entity_id, locale, form, form_folded FROM entity_labels
    ORDER BY entity_id, locale, form`;

  console.log('entity_labels rows:', rows.length);

  let updated = 0;
  let alreadyCorrect = 0;
  let pending: Prisma.Sql[] = [];

  const flush = async (): Promise<void> => {
    if (pending.length === 0) return;
    // form is the last component of the composite PK, so (entity_id, locale,
    // form) addresses exactly one row. UPDATE ... FROM a VALUES list is one
    // round trip per batch.
    updated += await prisma.$executeRaw`
      UPDATE entity_labels el
      SET form_folded = v.form_folded
      FROM (VALUES ${Prisma.join(pending)})
        AS v(entity_id, locale, form, form_folded)
      WHERE el.entity_id = v.entity_id::uuid
        AND el.locale = v.locale
        AND el.form = v.form`;
    pending = [];
  };

  for (const row of rows) {
    const folded = canonicalFold(row.form);
    if (folded === row.form_folded) {
      alreadyCorrect += 1;
      continue;
    }
    pending.push(
      Prisma.sql`(${row.entity_id}, ${row.locale}, ${row.form}, ${folded})`,
    );
    if (pending.length >= BATCH) {
      await flush();
    }
  }
  await flush();

  const unfoldable = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM entity_labels WHERE form_folded = ''`;

  console.log('rows re-folded this run:', updated);
  console.log('rows already correct:', alreadyCorrect);
  // form_folded = '' means the surface has no letters or digits in ANY script
  // (emoji-only, '!!!'). Not an error — just not a recall key.
  console.log('unfoldable forms (fold to empty):', unfoldable[0].n);

  await prisma.$disconnect();
}

void main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
