import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { LoggerService } from '../logging/logger.interface';
import { OpsAlertsService } from '../../modules/external-integrations/shared/ops-alerts.service';
import {
  BootSpendGuardVerdict,
  takeBootSpendGuardVerdicts,
} from './worker-boot-spend-guard';
import { QUEUE_SPEND_CLASSIFICATION } from './queue-spend-classification';

/**
 * The SCREAM half of the worker-boot spend guard.
 *
 * The guard itself runs before Nest (see bull-queue-backlog.adapter.ts) —
 * it has to, because `@nestjs/bull` starts consuming during module init. But
 * an ops alert needs Prisma and Resend, which only exist once Nest is up. So
 * the guard records verdicts and this service drains them at bootstrap.
 *
 * Alert style follows the DerivedIndexJob precedent (src/shared/derived-index-job.ts):
 * CRITICAL severity so it emails, a stable dedupe key so a restart loop
 * cannot storm the inbox, and a body that states the CONSEQUENCE in plain
 * words plus the exact command that ends it.
 */
@Injectable()
export class BootSpendGuardAlertService implements OnApplicationBootstrap {
  private readonly logger: LoggerService;

  constructor(
    private readonly opsAlerts: OpsAlertsService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('BootSpendGuardAlertService');
  }

  onApplicationBootstrap(): void {
    for (const verdict of takeBootSpendGuardVerdicts()) {
      this.report(verdict);
    }
  }

  private report(verdict: BootSpendGuardVerdict): void {
    if (verdict.outcome === 'within-grace') {
      return;
    }
    if (verdict.outcome === 'already-paused') {
      // Not news, but a worker booting against a paused spend lane is a
      // state someone should be able to see without reading Redis.
      this.logger.warn('Spend-bearing queue is paused — nothing will drain', {
        queue: verdict.queueName,
        resumeCommand: verdict.resumeCommand,
      });
      return;
    }

    const spendsOn = QUEUE_SPEND_CLASSIFICATION[verdict.queueName]?.why ?? '';
    const measured = verdict.outcome === 'measurement-failed';
    const title = measured
      ? `Spend queue paused (backlog unmeasurable): ${verdict.queueName}`
      : `Spend queue paused — ${verdict.backlog} fossil jobs: ${verdict.queueName}`;
    const body = measured
      ? [
          `The worker could not measure the pre-boot backlog on '${verdict.queueName}', so it paused the queue rather than risk draining one.`,
          `Reason: ${verdict.detail ?? 'unknown'}`,
          `What this spends: ${spendsOn}`,
          `Nothing on this queue will be processed until someone resumes it:`,
          `  ${verdict.resumeCommand}`,
        ].join('\n')
      : [
          `'${verdict.queueName}' held ${verdict.backlog} jobs enqueued BEFORE this worker booted. Draining them would spend vendor money on work this process was never told to do — the failure that cost $25 in fossil Google Places calls.`,
          `What this spends: ${spendsOn}`,
          `The queue is PAUSED. New jobs still enqueue behind the pause and nothing is lost; nothing drains until someone decides the backlog is worth paying for:`,
          `  ${verdict.resumeCommand}`,
          `If it is NOT worth paying for, clear it instead: npx ts-node scripts/job-control.ts clear`,
        ].join('\n');

    this.opsAlerts.emit({
      severity: 'critical',
      kind: 'worker_boot_spend_guard_paused',
      title,
      body,
      // Per queue, per outcome — a crash-restart loop collapses to one page.
      dedupeKey: `worker_boot_spend_guard:${verdict.queueName}:${verdict.outcome}`,
    });
    this.logger.error(
      `Spend-bearing queue '${verdict.queueName}' paused at boot`,
      new Error(title),
    );
  }
}
