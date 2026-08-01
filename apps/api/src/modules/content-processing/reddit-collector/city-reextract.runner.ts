import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { SpendCampaignService } from '../../external-integrations/shared/spend-campaign.service';
import { ReplayService } from './replay.service';

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
    if ((process.env.PROCESS_ROLE || 'api') !== 'worker') {
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
    const activate =
      (process.env.REEXTRACT_ACTIVATE ?? 'true').trim().toLowerCase() !==
      'false';
    const promptVersionRaw = process.env.REEXTRACT_PROMPT_VERSION?.trim();
    const promptVersion = promptVersionRaw
      ? Number.parseInt(promptVersionRaw, 10)
      : undefined;
    if (promptVersionRaw && !Number.isFinite(promptVersion)) {
      this.logger.error('REEXTRACT_PROMPT_VERSION is not a number — refusing');
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
    // Fire-and-forget on purpose: boot must complete so the batch ingest
    // pollers this run depends on are alive alongside it.
    void this.run(communities, campaignId, activate, promptVersion).catch(
      (error: unknown) => {
        this.logger.error('City re-extract CRASHED', {
          communities,
          error:
            error instanceof Error
              ? { message: error.message, stack: error.stack }
              : { message: String(error) },
        });
      },
    );
  }

  private async run(
    communities: string[],
    campaignId: string | undefined,
    activate: boolean = true,
    promptVersion?: number,
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

    this.logger.info('CITY RE-EXTRACT DONE (submission phase)', {
      communities,
      campaignId,
      ok,
      failed,
      totalDocs,
      note: 'Batch ingestion + projection rebuilds continue asynchronously; when the queue drains: run scripts/reload/anchor-audit.sql, reconcile costs (scripts/rig/cost-reconcile.sh), then remove REEXTRACT_COMMUNITIES/REEXTRACT_CAMPAIGN_ID and re-enable the scheduler.',
    });
  }
}
