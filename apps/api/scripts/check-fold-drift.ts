/**
 * @script-class: invariant-check
 *
 * FOLD-DRIFT DETECTOR (multilingual ruling R5, 2026-08-12): every stored
 * `identity_key` must equal `canonicalFold(name)` under the CURRENT fold
 * algorithm (FOLD_ALGORITHM_VERSION). A behavioral fold change that ships
 * without a corpus backfill strands every old key — tier-1/2.5 probes and
 * every SQL identity join then silently miss — and nothing else notices,
 * because the drift lives in the gap between a JS function and a column.
 *
 * Sample: a deterministic spread (every Nth active row by entity_id order)
 * PLUS every row whose name carries a non-ASCII letter — the rows where fold
 * revisions actually differ. Exit 1 on any divergence, printing examples.
 *
 * Wired as invariant `identity.stored-keys-match-the-fold` — the registry
 * mutates the fold and requires THIS check to fail, so the detector is
 * proven to bite, not assumed to.
 *
 *   yarn workspace api ts-node -T scripts/check-fold-drift.ts [--sample=2000]
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { ensureFoldCensusFixture } from './lib/census-fixture';
import {
  canonicalFold,
  FOLD_ALGORITHM_VERSION,
} from '../src/modules/content-processing/entity-resolver/entity-identity';

async function main(): Promise<void> {
  const sampleArg = process.argv.find((a) => a.startsWith('--sample='));
  const sample = sampleArg ? Number(sampleArg.split('=')[1]) : 2000;
  const prisma = new PrismaClient();
  try {
    await ensureFoldCensusFixture(prisma);
    const rows = await prisma.$queryRawUnsafe<
      Array<{ entity_id: string; name: string; identity_key: string | null }>
    >(
      `(
         SELECT entity_id, name, identity_key
           FROM core_entities
          WHERE status = 'active'
          ORDER BY entity_id
          LIMIT $1
       )
       UNION
       (
         SELECT entity_id, name, identity_key
           FROM core_entities
          WHERE status = 'active' AND name ~ '[^\\x00-\\x7F]'
          LIMIT $1
       )`,
      sample,
    );
    const drifted = rows.filter(
      (row) => (canonicalFold(row.name) || null) !== row.identity_key,
    );
    console.log(
      `fold-drift check: algorithm v${FOLD_ALGORITHM_VERSION}, ` +
        `${rows.length} rows sampled, ${drifted.length} drifted`,
    );
    // THE STRANDED LEDGER (LLM-decision audit 2026-08-31): identity_key is
    // not the only fold-stamped store. Fold-keyed claim_verdicts lanes read
    // with `fold_version = FOLD_ALGORITHM_VERSION`, so a version bump whose
    // backfill decision re-stamps identity keys but forgets the ledger
    // silently orphans every cached verdict — the v2 bump left 152k verdicts
    // unreadable (every word re-judged, every match re-bought) until a
    // hand re-stamp. Any fold-keyed lane still holding rows at an OLD fold
    // version after a bump means the bump's backfill decision is incomplete:
    // either re-stamp (fold output byte-identical for those keys) or re-hear.
    const strandedLanes = await prisma.$queryRawUnsafe<
      Array<{ lane: string; fold_version: number; count: bigint }>
    >(
      `SELECT lane, fold_version, count(*) AS count
         FROM claim_verdicts
        WHERE fold_version <> 0 AND fold_version <> $1
        GROUP BY lane, fold_version`,
      FOLD_ALGORITHM_VERSION,
    );
    if (strandedLanes.length) {
      for (const row of strandedLanes) {
        console.error(
          `  STRANDED-LEDGER lane=${row.lane} fold_version=${row.fold_version} ` +
            `rows=${row.count} (current algorithm v${FOLD_ALGORITHM_VERSION})`,
        );
      }
      process.exitCode = 1;
    }
    if (drifted.length) {
      for (const row of drifted.slice(0, 10)) {
        console.error(
          `  DRIFT ${row.entity_id} name=${JSON.stringify(row.name)} ` +
            `stored=${JSON.stringify(row.identity_key)} ` +
            `recomputed=${JSON.stringify(canonicalFold(row.name) || null)}`,
        );
      }
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main();
