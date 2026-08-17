/**
 * @script-class: probe
 * @finding: plans/prompt-fleet-audit.md — P3 consensus-scoring measurements.
 *
 * BOTH-WAYS RANKING DIFF for the consensus policy decisions (owner ruling
 * "consensus = opinions, not applause", 2026-08-14 walkthrough subject 3):
 *
 *   A. post-body claims floored to 1 upvote (creator = one ballot) vs
 *      today's whole-thread applause riding every post claim;
 *   B. praiseWeight 2.0 vs 1.0 (the 2026-06-19 dishless-restaurant dial).
 *
 * Runs the REAL scorer (PublicCraveScoreService.rebuildAllScores) under four
 * variants — baseline, floor-posts, praise1, floor+praise1 — snapshotting
 * top-N per city after each, then RESTORES the original upvote values and
 * rebuilds baseline, so the database ends exactly where it started. The
 * mutation is reversible by construction: original values are copied to
 * backup tables first and the restore UPDATEs from them.
 *
 * Read-only for the corpus in net effect; never run against prod.
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PublicCraveScoreService } from '../src/modules/content-processing/public-crave-score/public-crave-score.service';

const TOP_N = 50;
const OUT =
  process.argv.find((a) => a.startsWith('--out='))?.slice(6) ??
  'consensus-policy-diff.result.json';

const consoleLogger = {
  setContext() {
    return this;
  },
  debug() {},
  info(...args: unknown[]) {
    console.log(...args);
  },
  warn(...args: unknown[]) {
    console.warn(...args);
  },
  error(...args: unknown[]) {
    console.error(...args);
  },
} as never;

type Row = {
  subject_type: string;
  subject_id: string;
  name: string;
  city: string | null;
  display_score: string;
  endorsement_raw: string;
};

async function snapshot(prisma: PrismaClient): Promise<Record<string, Row[]>> {
  const rows = await prisma.$queryRawUnsafe<Row[]>(`
    WITH ranked AS (
      SELECT s.subject_type, s.subject_id, e.name, e.city,
             s.display_score::text, s.endorsement_raw::text,
             ROW_NUMBER() OVER (
               PARTITION BY e.city, s.subject_type
               ORDER BY s.endorsement_raw DESC
             ) AS rn
      FROM core_public_entity_scores s
      JOIN core_entities e ON e.entity_id = s.subject_id
      WHERE e.city IS NOT NULL
    )
    SELECT subject_type, subject_id, name, city, display_score, endorsement_raw
    FROM ranked WHERE rn <= ${TOP_N}
    ORDER BY city, subject_type, endorsement_raw DESC
  `);
  const byKey: Record<string, Row[]> = {};
  for (const row of rows) {
    const key = `${row.city}::${row.subject_type}`;
    (byKey[key] ??= []).push(row);
  }
  return byKey;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const scorer = new PublicCraveScoreService(prisma as never, consoleLogger);

  const rebuild = async (config?: Record<string, unknown>) => {
    await scorer.rebuildAllScores(config ? { config } : undefined);
  };

  const results: Record<string, Record<string, Row[]>> = {};
  try {
    console.log('backing up upvote columns…');
    await prisma.$executeRawUnsafe(
      `CREATE TABLE probe_upv_backup_m AS
         SELECT id, source_upvotes FROM core_restaurant_item_mentions`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TABLE probe_upv_backup_e AS
         SELECT event_id, source_upvotes FROM core_restaurant_events`,
    );

    console.log('variant 1/6: baseline…');
    await rebuild();
    results.baseline = await snapshot(prisma);

    console.log('variant 3/6: post-body claims floored to 1…');
    await prisma.$executeRawUnsafe(`
      UPDATE core_restaurant_item_mentions m
      SET source_upvotes = LEAST(m.source_upvotes, 1)
      FROM collection_source_documents d
      WHERE d.document_id = m.source_document_id AND d.source_type = 'post'
    `);
    await prisma.$executeRawUnsafe(`
      UPDATE core_restaurant_events ev
      SET source_upvotes = LEAST(ev.source_upvotes, 1)
      FROM collection_source_documents d
      WHERE d.document_id = ev.source_document_id AND d.source_type = 'post'
    `);
    await rebuild();
    results.floorPosts = await snapshot(prisma);

    console.log('variant: floor + sqrt compression…');
    await rebuild({ compression: 'sqrt' });
    results.floorSqrt = await snapshot(prisma);

    console.log('variant: floor + sqrt + praiseWeight 1.0…');
    await rebuild({ compression: 'sqrt', praiseWeight: 1.0 });
    results.floorSqrtPraise1 = await snapshot(prisma);

    console.log('variant: floor + sqrt + decay 180d…');
    await rebuild({ compression: 'sqrt', endorsementHalfLifeDays: 180 });
    results.floorSqrtDecay = await snapshot(prisma);

    console.log('variant: floor + sqrt + ONE POOL…');
    await rebuild({ compression: 'sqrt', pooling: 'one-pool' });
    results.floorSqrtOnePool = await snapshot(prisma);

    console.log('variant: floor + log + ONE POOL…');
    await rebuild({ pooling: 'one-pool' });
    results.floorLogOnePool = await snapshot(prisma);
  } finally {
    console.log('restoring upvote columns…');
    await prisma.$executeRawUnsafe(`
      UPDATE core_restaurant_item_mentions m
      SET source_upvotes = b.source_upvotes
      FROM probe_upv_backup_m b WHERE b.id = m.id
        AND m.source_upvotes <> b.source_upvotes
    `);
    await prisma.$executeRawUnsafe(`
      UPDATE core_restaurant_events ev
      SET source_upvotes = b.source_upvotes
      FROM probe_upv_backup_e b WHERE b.event_id = ev.event_id
        AND ev.source_upvotes <> b.source_upvotes
    `);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS probe_upv_backup_m`);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS probe_upv_backup_e`);
    console.log('rebuilding baseline scores…');
    await scorer.rebuildAllScores();
    await prisma.$disconnect();
  }

  writeFileSync(OUT, JSON.stringify(results, null, 1));
  console.log(`wrote ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
