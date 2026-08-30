/**
 * @script-class: operational
 * @runner: operator-run (plans/attribute-merge-system.md — dry-run default;
 *   --apply is the supervised first drain; runSweep() is the future cron).
 *
 * ACTIVE-VOCABULARY ATTRIBUTE DEDUPE-MERGE runner
 * (AttributeDedupeMergeService — the post-hoc merge lane; design in
 * plans/attribute-merge-system.md).
 *
 * DRY RUN BY DEFAULT: lists the candidate docket (recall provenance +
 * cosine) and, with --sample=N, buys N preview verdicts that are printed
 * and deliberately NOT recorded (no effect will follow, so remembering
 * them would strand pending merges for a resume to execute unasked).
 *
 *   # docket only (no LLM spend)
 *   yarn workspace api ts-node scripts/attribute-dedupe-merge.ts
 *   # docket + 200 preview verdicts
 *   yarn workspace api ts-node scripts/attribute-dedupe-merge.ts --sample=200
 *   # the real thing: hear, record, merge (operator-run => 'certification')
 *   yarn workspace api ts-node scripts/attribute-dedupe-merge.ts --apply
 *
 * --apply flips the judge-lane gate for THIS process only — the operator
 * invoking the script IS the activation decision, same trust shape as
 * food-dedupe-merge.ts. Scheduled runs go through runSweep() behind
 * ATTRIBUTE_MERGE_JUDGE_ENABLED instead (not cron-registered yet).
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import {
  AttributeDedupeMergeService,
  AttributeMergeSummary,
} from '../src/modules/attribute-ontology/attribute-dedupe-merge.service';
import { AttributeEntityType } from '../src/modules/attribute-ontology/attribute-ontology.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

interface CliOptions {
  types: AttributeEntityType[];
  apply: boolean;
  sample: number;
  maxHearings?: number;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    types: ['place_attribute', 'item_attribute'],
    apply: false,
    sample: 0,
  };
  for (const arg of argv) {
    if (arg === '--apply') options.apply = true;
    else if (arg === '--place') options.types = ['place_attribute'];
    else if (arg === '--item') options.types = ['item_attribute'];
    else if (arg.startsWith('--sample=')) {
      const value = Number(arg.split('=')[1]);
      if (Number.isInteger(value) && value >= 0) options.sample = value;
    } else if (arg.startsWith('--max-hearings=')) {
      const value = Number(arg.split('=')[1]);
      if (Number.isInteger(value) && value > 0) options.maxHearings = value;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

async function bootstrap(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.apply) {
    // The operator running --apply IS the gate decision for this process.
    process.env.ATTRIBUTE_MERGE_JUDGE_ENABLED = 'true';
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });
  stopCronsForScript(app);

  try {
    const service = app.get(AttributeDedupeMergeService);
    const out = (msg = '') => process.stdout.write(`${msg}\n`);

    if (cli.apply) {
      const resumed = await service.resumePendingEffects();
      if (resumed) out(`Resumed ${resumed} decided-but-unexecuted merges`);
    }

    for (const type of cli.types) {
      out(
        `\n==== ${type} — ${cli.apply ? 'APPLY (hear + record + merge)' : 'DRY RUN'} ====`,
      );
      const summary: AttributeMergeSummary = await service.run(type, {
        dryRun: !cli.apply,
        sample: cli.sample,
        maxHearings: cli.maxHearings,
        source: 'certification',
      });
      out(`  candidatePairs      ${summary.candidatePairs}`);
      out(`  judgeAlreadyDecided ${summary.judgeAlreadyDecided}`);
      out(`  judgeMerged         ${summary.judgeMerged}`);
      out(`  judgeRejected       ${summary.judgeRejected}`);
      out(`  judgeUnjudged       ${summary.judgeUnjudged}`);
      out(`  judgeHeld           ${summary.judgeHeld}`);
    }
  } finally {
    await app.close();
  }
}

bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
