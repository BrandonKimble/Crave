/**
 * @script-class: operational
 * @runner: rig/bench.sh
 *
 * THE ITERATION BENCH's operator entry (plans/iteration-bench.md). Every
 * verb answers with the run's single next required action — the bench
 * spins the choreography at you, never the reverse.
 *
 *   bench.ts start <candidateVersion> [community,community]
 *   bench.ts status
 *   bench.ts advance
 *   bench.ts preflight
 *   bench.ts approve <sheetHash>
 *   bench.ts campaign <campaignId>
 *   bench.ts drive            (one step; rig/bench.sh loops it)
 *   bench.ts diff-artifact <path>
 *   bench.ts close-review <summary...>
 *   bench.ts outcome <activated|rejected>
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { IterationBenchService } from '../src/modules/content-processing/iteration-bench/iteration-bench.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

async function main(): Promise<void> {
  const [, , verb, ...rest] = process.argv;
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  try {
    const bench = app.get(IterationBenchService);
    const prisma = app.get(PrismaService);
    const activeRun = async () => {
      const run = await prisma.iterationRun.findFirst({
        where: { status: 'active' },
        select: { runId: true, phase: true, phaseState: true, corpus: true },
      });
      if (!run) throw new Error('No active iteration run — bench.ts start');
      return run;
    };

    switch (verb) {
      case 'start': {
        const version = Number(rest[0]);
        if (!Number.isInteger(version)) {
          throw new Error('Usage: bench.ts start <candidateVersion> [corpus]');
        }
        const corpus = rest[1]?.split(',').map((value) => value.trim());
        const { runId, next } = await bench.start({
          candidateVersion: version,
          ...(corpus?.length ? { corpus } : {}),
        });
        console.log(`Run ${runId} started.`);
        console.log(`NEXT: ${next.action}`);
        break;
      }
      case 'status': {
        const run = await activeRun();
        const next = await bench.nextAction(run.runId);
        console.log(
          `Run ${run.runId} — phase ${next.phase} — corpus ${run.corpus.join(',')}`,
        );
        console.log(`NEXT: ${next.action}`);
        break;
      }
      case 'advance': {
        const run = await activeRun();
        const next = await bench.advance(run.runId);
        console.log(`Phase now ${next.phase}.`);
        console.log(`NEXT: ${next.action}`);
        break;
      }
      case 'preflight': {
        const run = await activeRun();
        const result = await bench.preflight(run.runId);
        if (result.green) {
          console.log('PREFLIGHT GREEN — arm the replay.');
        } else {
          console.log('PREFLIGHT REFUSALS:');
          for (const refusal of result.refusals) console.log(`  - ${refusal}`);
          process.exitCode = 1;
        }
        break;
      }
      case 'approve': {
        const run = await activeRun();
        const next = await bench.approve(run.runId, rest[0]);
        console.log(`Approved. NEXT: ${next.action}`);
        break;
      }
      case 'campaign': {
        const run = await activeRun();
        await bench.recordCampaign(run.runId, rest[0]);
        console.log('Campaign recorded on the run.');
        break;
      }
      case 'drive': {
        const run = await activeRun();
        const status = await bench.driveStatus(run.runId);
        console.log(`${status.state.toUpperCase()}: ${status.detail}`);
        if (status.state === 'stalled') process.exitCode = 2;
        break;
      }
      case 'diff-artifact': {
        const run = await activeRun();
        await bench.recordDiffArtifact(run.runId, rest[0]);
        console.log('Diff artifact recorded — phase is now review.');
        break;
      }
      case 'close-review': {
        const run = await activeRun();
        await bench.closeReview(run.runId, rest.join(' '));
        console.log('Review closed — phase is now activation (owner gate).');
        break;
      }
      case 'outcome': {
        const run = await activeRun();
        await bench.recordOutcome(
          run.runId,
          rest[0] as 'activated' | 'rejected',
        );
        console.log('Outcome recorded — run closed.');
        break;
      }
      default:
        throw new Error(`Unknown verb '${verb ?? ''}' — see the header.`);
    }
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
