/**
 * @script-class: invariant-check
 *
 * SURFACE FOLD-DRIFT DETECTOR (sibling of check-fold-drift.ts, which polices
 * `core_entities.identity_key`). `entity_surface.form_folded` is the RECALL
 * key: every match arm compares the folded query against this column, on both
 * sides. A row whose stored fold is not `canonicalFold(form)` is invisible to
 * every one of those reads — not wrong, INVISIBLE, and silently so, because
 * nothing errors when a join simply finds nothing.
 *
 * Found 2026-08-13: four rows ("black-eyed pea", "dry-aged beef", "jalapeño",
 * "lemon-lime soda") carried their form VERBATIM in form_folded — hyphens
 * unspaced, accent unstripped. All four were minted by the same merge_fold
 * pass on 2026-08-04, from the losing entity's `identity_key` of the day; the
 * entities were later re-keyed by the identity backfill and these carried
 * copies were not. Stale data from an older fold, not a live write-path bug —
 * addSurfaces computes canonicalFold(form) at every insert. But nothing
 * compared the column to the function, which is why it sat there for nine days.
 *
 * UNSAMPLED, deliberately: the whole active table is ~69k rows and the scan
 * costs a few seconds, so there is no reason to inspect a spread and hope.
 * Exit 1 on any divergence, printing examples.
 *
 *   yarn workspace api ts-node -T scripts/check-surface-fold-drift.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { ensureSurfaceCensusFixture } from './lib/census-fixture';
import {
  canonicalFold,
  FOLD_ALGORITHM_VERSION,
} from '../src/modules/content-processing/entity-resolver/entity-identity';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await ensureSurfaceCensusFixture(prisma);
    const rows = await prisma.$queryRawUnsafe<
      Array<{ surface_id: string; form: string; form_folded: string }>
    >(
      `SELECT surface_id, form, form_folded
         FROM entity_surface
        WHERE status = 'active'`,
    );
    const drifted = rows.filter(
      (row) => canonicalFold(row.form) !== row.form_folded,
    );
    console.log(
      `surface fold-drift check: algorithm v${FOLD_ALGORITHM_VERSION}, ` +
        `${rows.length} active rows scanned, ${drifted.length} drifted`,
    );
    if (drifted.length) {
      for (const row of drifted.slice(0, 10)) {
        console.error(
          `  DRIFT ${row.surface_id} form=${JSON.stringify(row.form)} ` +
            `stored=${JSON.stringify(row.form_folded)} ` +
            `recomputed=${JSON.stringify(canonicalFold(row.form))}`,
        );
      }
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main();
