/**
 * @script-class: operational
 *
 * THE RESTAURANT-NAME DOCKET DRIVER (C4a) — feed specimens to the
 * restaurant-name court and print what it ruled and why.
 *
 * The generic-word census (the other session) is the standing docket feeder;
 * this script is the manual entry point for the same court: seeded specimens,
 * a census export, or a hand-typed claim. It selects nothing corpus-wide —
 * a claim is always an explicit (entityId, form) pair.
 *
 * DRY-RUN BY DEFAULT: without --apply the judge is consulted and the rulings
 * print, but NOTHING is written — no verdict rows, no surface mutations.
 * The standard gates apply on --apply: already-decided claims are skipped,
 * and a docket beyond the rolling allowance REFUSES with a quote and the
 * hash to approve.
 *
 * Run:
 *   npx ts-node -T scripts/hear-restaurant-name-claims.ts \
 *        --claims "<entityId>:best,<entityId2>:place"            # dry run
 *   npx ts-node -T scripts/hear-restaurant-name-claims.ts \
 *        --file docket.json --apply                              # [{entityId,form},...]
 *   npx ts-node -T scripts/hear-restaurant-name-claims.ts \
 *        --file docket.json --apply --approve-drain <hash>
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PlaceNameHearingService } from '../src/modules/content-processing/entity-resolver/restaurant-name-hearing.service';
import { PLACE_NAME_RULE_VERSION } from '../src/modules/content-processing/entity-resolver/restaurant-name-rule';
import type { PlaceNameClaim } from '../src/modules/content-processing/entity-resolver/restaurant-name-lane';
import {
  DrainExceedsStandingCapError,
  StaleDrainApprovalError,
} from '../src/modules/content-processing/entity-resolver/claim-rehearing-budget.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

function parseClaims(argv: string[]): PlaceNameClaim[] {
  const flag = (name: string): string | null => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? (argv[i + 1] ?? null) : null;
  };
  const file = flag('file');
  if (file) {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Array<{
      entityId?: string;
      form?: string;
    }>;
    return parsed
      .filter((row) => row.entityId && row.form)
      .map((row) => ({
        entityId: row.entityId as string,
        form: row.form as string,
      }));
  }
  return (flag('claims') ?? '')
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const sep = pair.indexOf(':');
      return { entityId: pair.slice(0, sep), form: pair.slice(sep + 1) };
    })
    .filter((claim) => claim.entityId && claim.form);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const approveIdx = argv.indexOf('--approve-drain');
  const approvedHash = approveIdx >= 0 ? (argv[approveIdx + 1] ?? null) : null;
  const claims = parseClaims(argv);
  const out = (m: string) => process.stdout.write(`${m}\n`);
  if (!claims.length) {
    out('No claims. Pass --claims "entityId:form,..." or --file docket.json');
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  try {
    const court = app.get(PlaceNameHearingService);

    // FINISH FIRST: paid decisions a dead run left unexecuted.
    const resumed = await court.resumePendingEffects();
    if (resumed) out(`resumed=${resumed} decided-but-unexecuted verdicts`);

    out(
      `docket=${claims.length} rule=v${PLACE_NAME_RULE_VERSION} ` +
        (apply ? 'APPLY' : 'DRY RUN — judge consulted, nothing written'),
    );
    try {
      const summary = await court.hear(claims, {
        dryRun: !apply,
        approvedHash,
      });
      for (const c of summary.cases) {
        out(
          `${c.outcome.padEnd(9)} "${c.form}" as a name of "${c.placeName}"` +
            (c.surfacesTaken ? ` | surfaces taken: ${c.surfacesTaken}` : '') +
            `\n    reason: ${c.reason}`,
        );
      }
      out(JSON.stringify({ ...summary, cases: summary.cases.length }));
    } catch (error) {
      if (
        error instanceof DrainExceedsStandingCapError ||
        error instanceof StaleDrainApprovalError
      ) {
        out(`REFUSED — ${error.message}`);
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
