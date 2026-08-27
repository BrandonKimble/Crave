/**
 * @script-class: operational
 * @runner: scripts/rig/reextract.sh (recover-refusals verb)
 *
 * BANKED-REFUSAL RECOVERY (v17 witness repair): re-admit a campaign's banked
 * observed-span contract refusals through the real admitWireMention + the
 * normal downstream persist path — NO LLM call, no spend. Recovered rows are
 * deleted from collection_extraction_contract_refusals; still-refused rows
 * (the witnesses=0 invention residue) stay. Idempotent: a re-run re-refuses
 * the residue and recovers nothing twice.
 *
 *   DATABASE_URL=... npx ts-node scripts/replay-banked-refusals.ts --campaign <id>
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { ReplayService } from '../src/modules/content-processing/reddit-collector/replay.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

function parseCampaignId(argv: string[]): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--campaign') return argv[index + 1] ?? '';
    if (token.startsWith('--campaign=')) return token.split('=', 2)[1];
  }
  return '';
}

async function main(): Promise<void> {
  const logger = new Logger('replay-banked-refusals');
  const campaignId = parseCampaignId(process.argv.slice(2));
  if (!campaignId) {
    logger.error(
      'Usage: ts-node scripts/replay-banked-refusals.ts --campaign <campaignId>',
    );
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  stopCronsForScript(app);
  try {
    const replayService = app.get(ReplayService);
    const summary = await replayService.recoverBankedRefusals({ campaignId });
    logger.log(
      `Banked-refusal recovery for campaign ${summary.campaignId}: ` +
        `${summary.bankedRows} banked, ${summary.recoveredRows} recovered, ` +
        `${summary.stillRefusedRows} still refused, ` +
        `${summary.runsProcessed} runs processed, ${summary.runsSkipped} skipped. ` +
        `Recovery runs: ${summary.recoveryRunIds.join(', ') || '(none)'}`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
