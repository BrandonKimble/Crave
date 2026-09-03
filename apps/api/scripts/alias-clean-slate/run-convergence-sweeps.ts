/**
 * @script-class: operational
 * Runner: the clean-slate choreography (README.md step 3) — drives the
 * SAME judged machinery the nightly convergence uses (place same-name
 * sweep with the routing law + same-business court, then the food dedupe
 * resume drain) to fixpoint, for environments where the scheduler is off
 * (staging). Passes are bounded; the sweep is idempotent.
 *
 *   DATABASE_URL=<target> npx ts-node -T scripts/alias-clean-slate/run-convergence-sweeps.ts [--apply]
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { PlaceEntityMergeService } from '../../src/modules/restaurant-enrichment/restaurant-entity-merge.service';
import { stopCronsForScript } from '../../src/shared/utils/stop-crons';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  try {
    const placeMerge = app.get(PlaceEntityMergeService);
    for (let pass = 1; pass <= 8; pass += 1) {
      const swept = await placeMerge.sweepSameNameDuplicates({ apply });
      console.log(
        `place sweep pass ${pass} (${apply ? 'APPLY' : 'dry-run'}): ${swept.merged} merged, ${swept.held} held`,
      );
      for (const d of swept.decisions.filter((x) => x.verdict === 'merge')) {
        console.log(`  MERGE ${d.name} (${d.duplicateId} -> ${d.canonicalId})`);
      }
      if (swept.merged === 0 || !apply) break;
    }
  } finally {
    await app.close();
  }
}

void main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.stack : String(e));
  process.exit(1);
});
