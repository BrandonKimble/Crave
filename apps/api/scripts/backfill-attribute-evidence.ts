/**
 * @script-class: probe
 * @finding: NOT YET BANKED — record what this probe answered, or delete it.
 *
 * A banked probe's value is the RECORDED RESULT, kept so the finding stays
 * reproducible. This one has no runner and no written-down finding: the
 * F414 sweep (2026-08-02) could establish the first fact mechanically but
 * not the second, and inventing one would be worse than leaving it visible.
 * Until a finding is written here, this file is a deletion candidate.
 */
import { Prisma } from '@prisma/client';
import { activeEntityEventsSourceSql } from '../src/modules/content-processing/reddit-collector/extraction-scope.service';
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

/**
 * Phase 4b backfill. Before the evidence table existed, provenance was NOT
 * recorded — an attribute in the array could have come from reddit, Google,
 * the cuisine LLM, or a poll seed, and nothing distinguishes them after the
 * fact. So: pairs with real reddit events are classed 'reddit_evidence'
 * (with their true observation count); every remaining stamped pair is
 * classed 'legacy_stamp' — honest about the fact that we cannot know.
 *
 * Legacy rows keep the derived array whole (77.7% of stamped attributes
 * have no reddit event). They are inert: each real source overwrites its
 * own class as it re-runs, and re-extraction now rebuilds the reddit slice.
 *
 *   yarn workspace api ts-node scripts/backfill-attribute-evidence.ts [--apply]
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (m = '') => process.stdout.write(`${m}\n`);
  try {
    const prisma = app.get(PrismaService);
    const [pending] = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n
      FROM (SELECT entity_id, unnest(restaurant_attributes) AS attr
            FROM core_entities WHERE type='place' AND status='active') x
    `;
    out(
      `stamped pairs to classify: ${pending.n} (mode=${apply ? 'APPLY' : 'dry-run'})`,
    );
    if (!apply) return;

    const reddit = await prisma.$executeRaw`
      INSERT INTO core_restaurant_attribute_evidence
        (restaurant_id, attribute_id, source_class, observations)
      SELECT ev_scope.restaurant_id, ev_scope.entity_id, 'reddit_evidence', count(*)
      -- The ACTIVE-scope source, from the one owner of "active" — this join
      -- was hand-rolled here, in a script the src-only guard never walked.
      FROM ${Prisma.raw(activeEntityEventsSourceSql())}
      WHERE ev_scope.evidence_type = 'place_attribute'
      GROUP BY ev_scope.restaurant_id, ev_scope.entity_id
      ON CONFLICT DO NOTHING
    `;
    const legacy = await prisma.$executeRaw`
      INSERT INTO core_restaurant_attribute_evidence
        (restaurant_id, attribute_id, source_class, observations)
      SELECT x.entity_id, x.attr, 'legacy_stamp', 1
      FROM (SELECT entity_id, unnest(restaurant_attributes) AS attr
            FROM core_entities WHERE type='place' AND status='active') x
      WHERE NOT EXISTS (
        SELECT 1 FROM core_restaurant_attribute_evidence a
        WHERE a.restaurant_id = x.entity_id AND a.attribute_id = x.attr
      )
      ON CONFLICT DO NOTHING
    `;
    out(`inserted: reddit_evidence=${reddit} legacy_stamp=${legacy}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exit(1);
});
