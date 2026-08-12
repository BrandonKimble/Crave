/**
 * @script-class: operational
 *
 * REGIONED SURFACE LOCALES — report, then fold to the base language.
 *
 * WHAT WENT WRONG (A0 R4, 2026-08-11). Two writers stamped a locale tag onto
 * surface rows without normalizing it: the poll entity seed passed Google's
 * `displayName.languageCode` through verbatim onto EVERY form it banked, and
 * the enrichment service trimmed it and no more. Google answers `zh-TW`,
 * `pt-BR`, `es-419`.
 *
 * WHY A REGION IS A BUG HERE, not a harmless extra. The lookup chain is the
 * only thing that ever reads this column: `localeLookupChain('zh')` is
 * `['zh','und']`, which does NOT contain `zh-tw`. So a row banked `zh-TW` is
 * reachable only by a caller who asks with that exact region — the surface is
 * invisible to every other Chinese reader and to ingestion out of a `zh`
 * document. We paid Google for that tag and it hid the row it described.
 *
 * THE REPAIR is `bankableLanguageTag`, the same function the writers now use:
 * normalize as BCP-47, keep the base language, and drop anything unparseable
 * to `und` (the universal slice, honest about not knowing). A row whose
 * repaired (entity, locale, form) already exists is DELETED rather than
 * updated — the target row is the same claim about the same form, and
 * addSurfaces is idempotent per that key, so this converges.
 *
 * IDEMPOTENT: the predicate is "the stored tag differs from its own
 * normalization", so a second run finds nothing. Report-only by default.
 *
 * Usage: ts-node scripts/repair-regioned-surface-locales.ts [--apply]
 */
import { PrismaClient } from '@prisma/client';
import { bankableLanguageTag } from '../src/shared/locale';

const prisma = new PrismaClient();

interface Row {
  surface_id: string;
  entity_id: string;
  form: string;
  locale: string;
  source: string;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT surface_id::text AS surface_id, entity_id::text AS entity_id,
            form, locale, source
       FROM entity_surface
      WHERE locale IS NOT NULL AND locale <> 'und'`,
  );

  const offenders = rows
    .map((row) => ({ row, repaired: bankableLanguageTag(row.locale) ?? 'und' }))
    .filter(({ row, repaired }) => repaired !== row.locale);

  console.log(
    `scanned ${rows.length} tagged surface rows; ${offenders.length} carry a tag that is not its own normalization`,
  );
  const byPair = new Map<string, number>();
  for (const { row, repaired } of offenders) {
    const key = `${row.locale} -> ${repaired} (source=${row.source})`;
    byPair.set(key, (byPair.get(key) ?? 0) + 1);
  }
  for (const [pair, n] of [...byPair.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(6)}  ${pair}`);
  }

  if (!offenders.length) {
    console.log('nothing to repair.');
    await prisma.$disconnect();
    return;
  }
  if (!apply) {
    console.log('\nreport only — re-run with --apply to repair.');
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  let collapsed = 0;
  for (const { row, repaired } of offenders) {
    const existing = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT count(*)::bigint AS n FROM entity_surface
        WHERE entity_id = $1::uuid AND locale = $2 AND form = $3
          AND surface_id <> $4::uuid`,
      row.entity_id,
      repaired,
      row.form,
      row.surface_id,
    );
    if (Number(existing[0]?.n ?? 0) > 0) {
      // The repaired claim already exists — this row is a duplicate of it.
      await prisma.$executeRawUnsafe(
        `DELETE FROM entity_surface WHERE surface_id = $1::uuid`,
        row.surface_id,
      );
      collapsed += 1;
      continue;
    }
    await prisma.$executeRawUnsafe(
      `UPDATE entity_surface SET locale = $1 WHERE surface_id = $2::uuid`,
      repaired,
      row.surface_id,
    );
    updated += 1;
  }
  console.log(
    `repaired: ${updated} retagged, ${collapsed} collapsed as duplicates`,
  );
  await prisma.$disconnect();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
