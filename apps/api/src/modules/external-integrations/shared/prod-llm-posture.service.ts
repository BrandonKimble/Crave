import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { LoggerService } from '../../../shared';
import { OpsAlertsService } from './ops-alerts.service';
import { resolveAppEnv, isProdEnv } from '../../../shared/config/app-env';
import {
  isEnvFlagEnabled,
  isEnvFlagExplicitlyDisabled,
} from '../../../shared/config/env-flag';
import { isSchedulerRuntime } from '../../../shared/utils/process-role';

/**
 * PROD LLM-SPEND POSTURE BACKSTOP (money-spine audit 2026-08-26, item 2).
 *
 * The iteration-phase ruling "prod LLM rails are disarmed" (2026-08-09)
 * lives only in Railway env flags — nothing in the code knew the ruling
 * existed, so a flag flip (or a new env built without the flags) would
 * silently re-arm unattended vendor spend in production. This service makes
 * the posture a STATED FACT at every prod boot:
 *
 * - lanes disarmed  -> one info line naming the posture.
 * - any lane ARMED  -> a loud error log + a deduped warn ops-alert (with
 *   email) naming exactly which lanes will spend.
 *
 * ASSERTION, NOT REFUSAL — deliberately. Re-arming prod is a legitimate
 * future operation; the invariant is only that it can never happen
 * silently. Dedupe is keyed by the armed-lane SET, so a posture change
 * re-alerts while a crash-restart loop collapses to one page.
 *
 * The lane list below is the enumeration of every flag-gated LLM/vendor
 * spend lane a booted process can run unattended (all are cron-driven, so
 * all sit under the scheduler-runtime gate — CRONS_ENABLED + worker role):
 * collection (COLLECTION_SCHEDULER_ENABLED, default off), the batch poller
 * (LLM_BATCH_POLL_ENABLED, default ON — armed unless explicitly disabled),
 * dish-knowledge synthesis (DISH_KNOWLEDGE_SYNTHESIS_ENABLED, default off)
 * and knowledge maintenance (KNOWLEDGE_MAINTENANCE_ENABLED, default off).
 */

export interface ProdLlmPostureEnv {
  schedulerRuntime: boolean;
  env: NodeJS.ProcessEnv;
}

/** Pure lane evaluation — the testable core. Returns the ARMED lane names. */
export function armedLlmSpendLanes(input: ProdLlmPostureEnv): string[] {
  if (!input.schedulerRuntime) {
    // No cron ever fires (ScheduleModule is not even loaded), so every
    // lane below is structurally inert regardless of its own flag.
    return [];
  }
  const lanes: string[] = [];
  if (isEnvFlagEnabled(input.env.COLLECTION_SCHEDULER_ENABLED)) {
    lanes.push('collection-scheduler');
  }
  if (!isEnvFlagExplicitlyDisabled(input.env.LLM_BATCH_POLL_ENABLED)) {
    lanes.push('llm-batch-poll');
  }
  if (isEnvFlagEnabled(input.env.DISH_KNOWLEDGE_SYNTHESIS_ENABLED)) {
    lanes.push('dish-knowledge-synthesis');
  }
  if (isEnvFlagEnabled(input.env.KNOWLEDGE_MAINTENANCE_ENABLED)) {
    lanes.push('knowledge-maintenance');
  }
  return lanes;
}

@Injectable()
export class ProdLlmPostureService implements OnApplicationBootstrap {
  private readonly logger: LoggerService;

  constructor(
    private readonly opsAlerts: OpsAlertsService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('ProdLlmPostureService');
  }

  onApplicationBootstrap(): void {
    const appEnv = resolveAppEnv();
    if (!isProdEnv(appEnv)) {
      return;
    }
    const lanes = armedLlmSpendLanes({
      schedulerRuntime: isSchedulerRuntime(),
      env: process.env,
    });
    if (lanes.length === 0) {
      this.logger.info(
        'Prod LLM spend posture: DISARMED — no flag-gated spend lane can run unattended on this process (iteration-phase ruling 2026-08-09)',
      );
      return;
    }
    const title = `Prod LLM spend lanes ARMED: ${lanes.join(', ')}`;
    const body = [
      `This production process booted with unattended LLM/vendor spend lanes armed: ${lanes.join(', ')}.`,
      'The iteration-phase posture (2026-08-09) is prod-disarmed. If re-arming is deliberate, this alert is the stated fact it requires; if not, disarm via the Railway env flags (CRONS_ENABLED / COLLECTION_SCHEDULER_ENABLED / LLM_BATCH_POLL_ENABLED / DISH_KNOWLEDGE_SYNTHESIS_ENABLED / KNOWLEDGE_MAINTENANCE_ENABLED) and redeploy.',
    ].join('\n');
    this.logger.error('Prod LLM spend posture: ARMED', new Error(title));
    this.opsAlerts.emit({
      severity: 'warn',
      kind: 'prod_llm_spend_lanes_armed',
      title,
      body,
      emailOnWarn: true,
      // Keyed by the armed SET: a posture change re-alerts; a restart loop
      // with the same posture collapses to one row.
      dedupeKey: `prod_llm_spend_lanes_armed:${lanes.join(',')}`,
    });
  }
}
