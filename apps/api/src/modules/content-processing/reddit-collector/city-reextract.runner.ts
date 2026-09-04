import { runInWorkContext } from '../../external-integrations/shared/work-context';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { SpendCampaignService } from '../../external-integrations/shared/spend-campaign.service';
import { ReplayService } from './replay.service';
import { isEnvFlagEnabled } from '../../../shared/config/env-flag';
import { resolveProcessRole } from '../../../shared/utils/process-role';

/**
 * CITY RE-EXTRACT (the standing pattern; generalizes the 2026-07-30 Austin
 * full reload). Every prompt iteration eventually wants a full-city re-run:
 * wipe the city's derived layer (scripts/reload/wipe-city-derived.sql —
 * community-scoped, preserving restaurants + user anchors), then this
 * runner replays every target document's active extraction run under the
 * CURRENT prompt via Gemini batch, and the anchor audit
 * (scripts/reload/anchor-audit.sql) closes the run.
 *
 * Executed PROD-NATIVELY as a worker boot one-shot: the standing law
 * forbids pointing laptop-run app code at the prod DB, and the worker owns
 * the batch machinery the replays drain through. Arm with:
 *   REEXTRACT_COMMUNITIES=austinfood[,foodnyc]
 *   REEXTRACT_CAMPAIGN_ID=<approved spend campaign id>
 * and remove both after the DONE log.
 *
 * SPEND LAW (owner 2026-07-31): a re-extract REFUSES to start without an
 * owner-approved campaign. The id threads into every replay's runMetadata,
 * so the batch spend meters the campaign envelope and a breach stops
 * further submissions — the estimate is enforced, not remembered. (The
 * same morning this was built, the scheduler's keyword lane re-extracted
 * 20k NY docs ungoverned because prompt-hash coverage invalidation is
 * silent — exactly the hole this guard closes for deliberate re-runs.)
 *
 * A crash-restart re-replays from the top; replay is projection-idempotent
 * and the pre-LLM coverage dedupe skips documents whose extraction under
 * the current prompt hash already completed or is in flight, so a restart
 * does not double-pay.
 */
@Injectable()
export class CityReextractRunner implements OnApplicationBootstrap {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly replay: ReplayService,
    private readonly spendCampaigns: SpendCampaignService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('CityReextractRunner');
  }

  onApplicationBootstrap(): void {
    const communities = (process.env.REEXTRACT_COMMUNITIES ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (!communities.length) {
      return;
    }
    // ONE PROCESS-ROLE READER (F9608). This read the env var itself and
    // defaulted to 'api', while the canonical reader defaults to 'all' — two
    // rival answers to "what is this process" that disagree on the unset case
    // that every dev laptop and every script runs under. The rule this wants
    // is unchanged and deliberately STRICT: only the dedicated worker service
    // (PROCESS_ROLE=worker, start:prod:worker) may start a heavy one-shot
    // drain, so 'all' is not good enough here even though it is
    // worker-capable for scheduling.
    if (resolveProcessRole() !== 'worker') {
      this.logger.warn(
        'REEXTRACT_COMMUNITIES set on a non-worker role — ignoring',
      );
      return;
    }
    const campaignId = process.env.REEXTRACT_CAMPAIGN_ID?.trim();
    // SHADOW MODE (versioned prompts, 2026-08-01): REEXTRACT_ACTIVATE=false
    // replays WITHOUT flipping documents' active runs — old extractions keep
    // serving the app while the candidate prompt's outputs accumulate for
    // the diff review. REEXTRACT_PROMPT_VERSION pins a registered candidate.
    // Canonical env-flag dialect (F466/F401), fallback TRUE — activation
    // stays the default, as before. ONE deliberate semantic change: the old
    // `!== 'false'` test treated ANY unrecognized value ('no', '0', 'flase')
    // as ON, i.e. a typo silently FLIPPED THE LIVE CORPUS to a candidate
    // prompt's outputs. Under the canonical reader an unrecognized value is
    // OFF, so a typo now costs a shadow replay instead of a live flip. For a
    // destructive default that is the only safe direction to fail.
    const activate = isEnvFlagEnabled(process.env.REEXTRACT_ACTIVATE, true);
    const promptVersionRaw = process.env.REEXTRACT_PROMPT_VERSION?.trim();
    const promptVersion = promptVersionRaw
      ? Number.parseInt(promptVersionRaw, 10)
      : undefined;
    // F9450: registered prompt versions start at 1 (nextVersion = (max ?? 0)+1), so a
    // pin must be a POSITIVE integer. Requiring >0 here (not just isFinite) closes the
    // falsy-zero seam: REEXTRACT_PROMPT_VERSION=0 is finite AND falsy, so it would slip
    // both this check and the `if (promptVersion && activate)` firewall below — turning a
    // "pin candidate 0" request into a live activate instead of a refusal.
    if (
      promptVersionRaw &&
      (!Number.isInteger(promptVersion) || (promptVersion as number) < 1)
    ) {
      this.logger.error(
        'REEXTRACT_PROMPT_VERSION must be a positive integer (versions start at 1) — refusing',
      );
      return;
    }
    if (promptVersion && activate) {
      // A candidate prompt must go through the shadow → diff → activate
      // choreography; direct-activate under an unreviewed prompt is the
      // July self-heal accident with extra steps.
      this.logger.error(
        'REEXTRACT_PROMPT_VERSION requires REEXTRACT_ACTIVATE=false (shadow) — refusing',
      );
      return;
    }
    // RE-CHUNK (reply-chain windows, 2026-09-04): REEXTRACT_RECHUNK=true
    // rebuilds every replayed run's windows with the current chunker instead
    // of reusing stored payloads. Off by default — a prompt diff wants the
    // same windows; a chunking change wants this. Estimate with the same
    // flag (reextract-estimate.ts --rechunk) so the envelope prices the new
    // window count.
    const rechunk = isEnvFlagEnabled(process.env.REEXTRACT_RECHUNK, false);
    // Fire-and-forget on purpose: boot must complete so the batch ingest
    // pollers this run depends on are alive alongside it.
    void runInWorkContext(
      { campaignId, label: `reextract:${communities.join('+')}` },
      () => this.run(communities, campaignId, activate, promptVersion, rechunk),
    ).catch((error: unknown) => {
      this.logger.error('City re-extract CRASHED', {
        communities,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
    });
  }

  private async run(
    communities: string[],
    campaignId: string | undefined,
    activate: boolean = true,
    promptVersion?: number,
    rechunk: boolean = false,
  ): Promise<void> {
    if (!campaignId) {
      this.logger.error(
        'REFUSED: city re-extract requires REEXTRACT_CAMPAIGN_ID (an owner-approved spend campaign). Estimate with prepareManifestEstimate, approve by hash, then arm.',
        { communities },
      );
      return;
    }
    if (!(await this.spendCampaigns.isDispatchable(campaignId))) {
      this.logger.error(
        'REFUSED: campaign is not dispatchable (must be approved/running).',
        { communities, campaignId },
      );
      return;
    }

    const runs = await this.prisma.$queryRaw<
      Array<{ runId: string; docs: number }>
    >`
      SELECT d.active_extraction_run_id AS "runId",
             count(*)::int AS docs
      FROM collection_source_documents d
      WHERE d.community = ANY(${communities})
        AND d.active_extraction_run_id IS NOT NULL
        -- poll_surface docs are synthetic ballot carriers (per-voter, no
        -- body); replaying their no-LLM runs would activate an empty run
        -- over the ballot mentions and supersede-delete them (round-3
        -- red team). Same exclusion the curated-list builder applies.
        AND d.platform <> 'poll_surface'
      GROUP BY 1
      ORDER BY min(d.collected_at)
    `;
    const totalDocs = runs.reduce((acc, run) => acc + run.docs, 0);
    this.logger.info('CITY RE-EXTRACT starting', {
      communities,
      campaignId,
      runs: runs.length,
      totalDocs,
      rechunk,
    });

    let ok = 0;
    let failed = 0;
    let docsDone = 0;
    for (const [index, run] of runs.entries()) {
      try {
        await this.replay.replayExtractionRun({
          sourceExtractionRunId: run.runId,
          activate,
          campaignId,
          promptVersion,
          rechunk,
        });
        ok += 1;
      } catch (error) {
        failed += 1;
        this.logger.error('Re-extract run failed (continuing)', {
          runId: run.runId,
          error:
            error instanceof Error
              ? { message: error.message }
              : { message: String(error) },
        });
      }
      docsDone += run.docs;
      if ((index + 1) % 10 === 0 || index === runs.length - 1) {
        this.logger.info('CITY RE-EXTRACT progress', {
          runsDone: index + 1,
          runsTotal: runs.length,
          docsDone,
          totalDocs,
          failed,
        });
      }
    }

    this.logger.info('CITY RE-EXTRACT submission phase done', {
      communities,
      campaignId,
      ok,
      failed,
      totalDocs,
      // The next steps DIFFER by mode (red team B7): the old wipe-flow's
      // closing sequence was being logged even in shadow mode, telling an
      // agent tailing worker logs at 3am to re-enable a scheduler that
      // should never have been off and to skip the diff/activate review.
      note: activate
        ? 'ACTIVATE mode. Batch ingestion + projection rebuilds continue asynchronously; when the queue drains: run scripts/reload/anchor-audit.sql, reconcile costs (scripts/rig/cost-reconcile.sh), then remove the REEXTRACT_* vars.'
        : 'SHADOW mode — nothing is live yet. When the batch queue drains: ./scripts/rig/reextract.sh diff <communities> <version>, triage the review file, THEN activate. Do NOT touch CRONS_ENABLED; crons stay on.',
    });

    // A RUN THAT FAILED BEFORE A JOB ROW EXISTED IS OWED WORK THE JOB QUERY
    // CANNOT SEE (red team 2026-09-03 governance #3): the drained-queue
    // completion counts llm_batch_jobs only, so a submission-phase failure
    // (spend gate closed, dispatch refusal, DB error) leaves documents owed
    // with zero rows — degenerately, a campaign whose every submit failed
    // would complete as "done" on the first tick over an un-executed corpus.
    // The runner is the one process that knows its own manifest: any
    // pre-submit failure means the system may not declare done.
    if (failed > 0) {
      this.logger.error(
        'CITY RE-EXTRACT: runs failed before submission — campaign left OPEN for retry/human, system completion refused',
        { communities, campaignId, failedRuns: failed, okRuns: ok },
      );
      return;
    }
    await this.completeCampaignWhenDrained(communities, campaignId);
  }

  /**
   * SYSTEM-OWNED COMPLETION (rederivation 2026-08-31). Completing a campaign
   * used to be a human step (scripts/complete-campaign.ts) that the human
   * forgot — prod's v7 replay sat 'running' forever at $30.44 spent, and the
   * 24h stale watchdog exists only because completion had no owner. THIS
   * runner is the process that knows what "done" means for a re-extract:
   * every batch job it caused is terminal ('ingested'/'failed') and the
   * ingest tree behind them has drained. So it waits for that fact and calls
   * complete() itself. The watchdog stays as the backstop for crashes (a
   * killed worker leaves 'running', silent ledger → alert, human completes).
   */
  private async completeCampaignWhenDrained(
    communities: string[],
    campaignId: string,
  ): Promise<void> {
    const POLL_MS = 60_000;
    // Generous ceiling (vendor SLA is ≤24h per batch; a city is many waves):
    // past it, stop polling and leave the row to the watchdog + human.
    const DEADLINE_MS = 72 * 3_600_000;
    const deadline = Date.now() + DEADLINE_MS;
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      try {
        if (await this.spendCampaigns.isBreached(campaignId)) {
          this.logger.error(
            'CITY RE-EXTRACT: campaign breached — completion handoff to resumeAfterBreach; not completing',
            { communities, campaignId },
          );
          return;
        }
        // TERMINAL IS NOT THE SAME AS DONE (2026-08-31, caught in flight).
        // This used to complete once every job was merely TERMINAL, counting
        // 'failed' as finished — but a failed job is UNFINISHED WORK: the
        // replay skip-check deliberately re-runs failed replays
        // (replay.service.ts), and a completed campaign is not dispatchable,
        // so closing the envelope over a failure LOCKED OUT the very retry
        // the design depends on. It also reported a false "done" for a
        // campaign missing part of its corpus. A campaign closes when its
        // work SUCCEEDED; while a recoverable failure stands, it stays open
        // for the retry and the deadline arm below hands it to a human.
        // …AND A FAILURE THAT HAS BEEN REDONE IS NOT WORK STILL OWED (same
        // night, second correction — the first version blocked on the mere
        // EXISTENCE of a failed row, which a retry never clears, so a
        // campaign that fully recovered would have hung open until the
        // deadline handed a finished job to a human). The question is not
        // "did anything fail?" but "is any work still OWED?" — a failed job
        // whose SOURCE run has since been replayed to completion is history.
        // Measured against the replay lineage rather than job-row states,
        // because the rows are transport and the lineage is the work.
        //
        // …UNDER THE SAME PROMPT (third correction, 2026-08-31 trust audit).
        // The second version matched ANY completed replay of the same source
        // run — but successive prompt versions replay the SAME source
        // generation, so v18's completed replay would have marked a failed
        // v19 job "already redone" and closed v19's campaign over real debt.
        // It read 0-owed in verification only because the retry had already
        // landed — correct by coincidence. "Redone" means redone under the
        // prompt THIS campaign is buying: same system_prompt_hash as the
        // failed run itself.
        const open = await this.prisma.$queryRaw<
          Array<{ open: number; failed: number }>
        >`
          SELECT
            count(*) FILTER (
              WHERE j.status NOT IN ('ingested', 'failed')
            )::int AS open,
            count(*) FILTER (
              WHERE j.status = 'failed'
                AND NOT EXISTS (
                  SELECT 1
                  FROM collection_extraction_runs failed_run
                  JOIN collection_extraction_runs redone
                    ON redone.metadata->>'replayOfExtractionRunId'
                       = failed_run.metadata->>'replayOfExtractionRunId'
                   AND redone.system_prompt_hash
                       = failed_run.system_prompt_hash
                   AND redone.status = 'completed'
                  WHERE failed_run.extraction_run_id
                        = (j.resume_context->>'extractionRunId')::uuid
                )
            )::int AS failed
          FROM llm_batch_jobs j
          WHERE j.resume_context->>'campaignId' = ${campaignId}
        `;
        if (open[0]?.open === 0 && open[0]?.failed === 0) {
          await this.spendCampaigns.complete(campaignId);
          this.logger.info(
            'CITY RE-EXTRACT DONE — campaign completed by the system (all batch jobs ingested, ingest drained)',
            { communities, campaignId },
          );
          return;
        }
        if (open[0]?.open === 0 && (open[0]?.failed ?? 0) > 0) {
          this.logger.warn(
            'CITY RE-EXTRACT: batch queue drained but jobs FAILED — campaign stays open so their retry can dispatch',
            { communities, campaignId, failed: open[0]?.failed },
          );
        }
        if (Date.now() >= deadline) {
          this.logger.error(
            'CITY RE-EXTRACT: batch jobs still open past the completion deadline — leaving the campaign to the stale watchdog',
            { communities, campaignId, openJobs: open[0]?.open },
          );
          return;
        }
      } catch (error) {
        // Transient poll errors just wait for the next tick; complete()'s
        // own state errors (e.g. someone completed it by hand) end the loop.
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('cannot complete from state')) {
          this.logger.warn(
            'CITY RE-EXTRACT: campaign state moved out from under completion — stopping the drain watch',
            { communities, campaignId, error: { message } },
          );
          return;
        }
        this.logger.warn(
          'CITY RE-EXTRACT completion poll failed (will retry)',
          {
            communities,
            campaignId,
            error: { message },
          },
        );
      }
    }
  }
}
