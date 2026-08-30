/**
 * @script-class: operational
 * @runner: run manually (dry-run default; --apply to execute)
 *
 * STRIKE VOID for the 2026-08-20 broken grounding sweep (campaign red-team
 * v3, R1). That sweep (01:13→03:18 UTC) declined all 716 attempts under
 * chooser rule v1's single-snippet geography doctrine, and every decline was
 * classified DEFINITIVE — spending one permanent strike toward the janitor's
 * archive threshold (682 entities landed at fc=1, 34 at fc=2). The rule is
 * now v2 (place-grounding-rule.ts), which re-opens the remembered
 * rejections; this script gives back the strike the broken run spent, so
 * the reload's mention-driven retries start from the count they'd have had
 * if the run had never happened.
 *
 * Row identification is precise: active place entities whose LAST attempt is
 * the sweep's own breadcrumb — failureReasonCode='no_acceptable_candidate'
 * AND failureAt inside the sweep's window. Each qualifying row's
 * enrichment_failure_count is decremented by exactly 1 (the sweep attempted
 * each entity once), floored at 0.
 *
 *   yarn workspace api ts-node scripts/void-broken-sweep-strikes.ts
 *   yarn workspace api ts-node scripts/void-broken-sweep-strikes.ts --apply
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

const SWEEP_START = '2026-08-20T00:00:00Z';
const SWEEP_END = '2026-08-20T04:00:00Z';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const prisma = app.get(PrismaService);

  try {
    const rows = await prisma.$queryRaw<
      Array<{ entity_id: string; name: string; fc: number }>
    >`
      SELECT entity_id, name, enrichment_failure_count AS fc
        FROM core_entities
       WHERE type = 'place' AND status = 'active'
         AND restaurant_metadata->'lastEnrichmentAttempt'->>'failureReasonCode'
             = 'no_acceptable_candidate'
         AND (restaurant_metadata->'lastEnrichmentAttempt'->>'failureAt')::timestamptz
             >= ${SWEEP_START}::timestamptz
         AND (restaurant_metadata->'lastEnrichmentAttempt'->>'failureAt')::timestamptz
             < ${SWEEP_END}::timestamptz
         AND enrichment_failure_count > 0
       ORDER BY enrichment_failure_count DESC, name`;

    const byCount = new Map<number, number>();
    for (const row of rows) {
      byCount.set(row.fc, (byCount.get(row.fc) ?? 0) + 1);
    }
    console.log(
      `${apply ? 'VOIDING' : 'dry-run: would void'} 1 strike on ${rows.length} entities struck by the 08-20 sweep`,
    );
    for (const [fc, count] of [...byCount.entries()].sort()) {
      console.log(`  fc=${fc} -> ${fc - 1}: ${count} entities`);
    }
    for (const row of rows.slice(0, 15)) {
      console.log(`  e.g. ${row.name} (fc=${row.fc})`);
    }

    if (apply && rows.length) {
      const updated = await prisma.$executeRaw`
        UPDATE core_entities
           SET enrichment_failure_count = greatest(enrichment_failure_count - 1, 0)
         WHERE entity_id = ANY(${rows.map((r) => r.entity_id)}::uuid[])`;
      console.log(`APPLIED: decremented ${updated} rows`);
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exit(1);
});
