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
/**
 * Resume-Campaign Ops Script (red team 2026-07-25)
 *
 * SpendCampaignService.resumeAfterBreach had no caller wiring — a campaign
 * flipped 'breached' by recordSpend could never be re-approved even though
 * the breach alert tells the owner to use resumeAfterBreach. Modeled on
 * resume-lane.ts.
 *
 * Two-step (print-then-approve, mirroring the estimate-hash gate):
 *   1. Run with only --campaign-id: prints the freshly recomputed refined
 *      estimate INCLUDING its hash (the campaign stays breached).
 *   2. Re-run with --campaign-id AND --estimate-hash <hash from step 1>:
 *      calls resumeAfterBreach, which recomputes + verifies the hash and
 *      reopens the campaign with the refined envelope.
 *
 *   yarn ts-node -r tsconfig-paths/register scripts/resume-campaign.ts \
 *     --campaign-id <uuid> [--estimate-hash <sha256>]
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SpendCampaignService } from '../src/modules/external-integrations/shared/spend-campaign.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function resumeCampaign() {
  console.log('🔍 Campaign Resume');
  console.log('================================');

  const campaignId = argValue('--campaign-id');
  const providedHash = argValue('--estimate-hash');
  if (!campaignId) {
    throw new Error(
      'Usage: yarn ts-node apps/api/scripts/resume-campaign.ts ' +
        '--campaign-id <uuid> [--estimate-hash <sha256>]',
    );
  }

  let app;
  try {
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn'],
    });
    stopCronsForScript(app);

    const prisma = app.get(PrismaService);
    const spendCampaigns = app.get(SpendCampaignService);

    const row = await prisma.spendCampaign.findUnique({
      where: { campaignId },
    });
    if (!row) {
      throw new Error(`No campaign row for id ${campaignId}`);
    }
    console.log('\n📊 Campaign:', {
      name: row.name,
      workClass: row.workClass,
      state: row.state,
      estimateMicros:
        row.estimateMicros === null ? null : Number(row.estimateMicros),
      spentMicros: Number(row.spentMicros),
    });

    if (!providedHash) {
      // Step 1: print the refined estimate + hash. ONE quote — the service's
      // own (red team 2026-09-04 G-2): this script used to re-derive it
      // with an in-memory drift that is null in a fresh process, so its
      // hash never matched what resumeAfterBreach verified.
      const quote = await spendCampaigns.quoteResume(campaignId);
      console.log('\n📄 Refined estimate (campaign stays breached):', {
        unitCount: quote.unitCount,
        microUsdPerUnit: quote.microUsdPerUnit,
        spentUsd: (quote.spentMicros / 1_000_000).toFixed(2),
        estimateUsd: (quote.estimateMicros / 1_000_000).toFixed(2),
        toleranceFraction: quote.toleranceFraction,
        envelopeUsd: (quote.envelopeMicros / 1_000_000).toFixed(2),
        estimateHash: quote.estimateHash,
      });
      console.log(
        '\nTo approve, re-run with: --estimate-hash ' + quote.estimateHash,
      );
      return;
    }

    const resumed = await spendCampaigns.resumeAfterBreach(
      campaignId,
      providedHash,
    );
    console.log('\n✅ Campaign resumed:', {
      campaignId: resumed.campaignId,
      estimateUsd: (resumed.estimateMicros / 1_000_000).toFixed(2),
      toleranceFraction: resumed.toleranceFraction,
      envelopeUsd: (resumed.envelopeMicros / 1_000_000).toFixed(2),
    });
  } finally {
    if (app) {
      await app.close();
    }
  }
}

if (require.main === module) {
  resumeCampaign()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(
        '❌ Campaign resume failed:',
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    });
}
