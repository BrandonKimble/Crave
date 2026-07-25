/**
 * Complete-Campaign Ops Script (red team 2026-07-25)
 *
 * Marks a spend campaign 'completed' and feeds its declared-vs-actual pair
 * into measureDrift. Run when a campaign's backlog is fully drained (e.g.
 * the seed-coarse-polygons promotion backlog is empty) — NEVER while work
 * is still queued, since the drain skips non-dispatchable (completed)
 * campaigns.
 *
 *   yarn ts-node -r tsconfig-paths/register scripts/complete-campaign.ts \
 *     --campaign-id <uuid>
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SpendCampaignService } from '../src/modules/external-integrations/shared/spend-campaign.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

async function completeCampaign() {
  const idx = process.argv.indexOf('--campaign-id');
  const campaignId = idx >= 0 ? process.argv[idx + 1] : undefined;
  if (!campaignId) {
    throw new Error(
      'Usage: yarn ts-node apps/api/scripts/complete-campaign.ts ' +
        '--campaign-id <uuid>',
    );
  }

  let app;
  try {
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn'],
    });
    stopCronsForScript(app);
    const spendCampaigns = app.get(SpendCampaignService);
    await spendCampaigns.complete(campaignId);
    console.log(`✅ Campaign ${campaignId} completed`);
  } finally {
    if (app) {
      await app.close();
    }
  }
}

if (require.main === module) {
  completeCampaign()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(
        '❌ Campaign complete failed:',
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    });
}
