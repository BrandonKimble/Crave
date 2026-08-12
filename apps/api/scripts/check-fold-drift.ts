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
import {
  canonicalFold,
  FOLD_ALGORITHM_VERSION,
} from '../src/modules/content-processing/entity-resolver/entity-identity';

async function main(): Promise<void> {
  const sampleArg = process.argv.find((a) => a.startsWith('--sample='));
  const sample = sampleArg ? Number(sampleArg.split('=')[1]) : 2000;
  const prisma = new PrismaClient();
  try {
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
