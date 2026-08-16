/**
 * @script-class: operational
 * @finding: plans/prompt-fleet-audit.md P3 — "consensus = opinions, not
 *   applause" (owner ruling 2026-08-16).
 *
 * EPOCH BACKFILL: set every post-body-sourced claim's stored ballot to
 * exactly 1 (creator = one vote), matching the writer law now in
 * enrichHydratedMention. Runs ONCE inside the activation calibration epoch,
 * immediately before the epoch rescore — never standalone, or live rankings
 * shift outside a calibration boundary.
 *
 *   yarn workspace api ts-node scripts/backfill-post-claim-ballots.ts            # dry-run: counts only
 *   yarn workspace api ts-node scripts/backfill-post-claim-ballots.ts --apply   # write
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const [m] = await prisma.$queryRawUnsafe<[{ n: bigint; mass: bigint }]>(`
      SELECT count(*)::bigint AS n, coalesce(sum(m.source_upvotes - 1), 0)::bigint AS mass
      FROM core_restaurant_item_mentions m
      JOIN collection_source_documents d ON d.document_id = m.source_document_id
      WHERE d.source_type = 'post' AND m.source_upvotes <> 1
    `);
    const [e] = await prisma.$queryRawUnsafe<[{ n: bigint; mass: bigint }]>(`
      SELECT count(*)::bigint AS n, coalesce(sum(ev.source_upvotes - 1), 0)::bigint AS mass
      FROM core_restaurant_events ev
      JOIN collection_source_documents d ON d.document_id = ev.source_document_id
      WHERE d.source_type = 'post' AND ev.source_upvotes <> 1
    `);
    console.log(
      `post-sourced rows off the one-ballot law: mentions=${m.n} (applause mass ${m.mass}), events=${e.n} (applause mass ${e.mass})`,
    );
    if (!apply) {
      console.log('dry-run — pass --apply inside the activation epoch.');
      return;
    }
    const mUpdated = await prisma.$executeRawUnsafe(`
      UPDATE core_restaurant_item_mentions m
      SET source_upvotes = 1
      FROM collection_source_documents d
      WHERE d.document_id = m.source_document_id
        AND d.source_type = 'post' AND m.source_upvotes <> 1
    `);
    const eUpdated = await prisma.$executeRawUnsafe(`
      UPDATE core_restaurant_events ev
      SET source_upvotes = 1
      FROM collection_source_documents d
      WHERE d.document_id = ev.source_document_id
        AND d.source_type = 'post' AND ev.source_upvotes <> 1
    `);
    console.log(
      `updated mentions=${mUpdated}, events=${eUpdated}. Run the epoch rescore next.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
