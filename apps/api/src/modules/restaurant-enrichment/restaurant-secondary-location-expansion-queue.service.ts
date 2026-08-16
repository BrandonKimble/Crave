import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { PlaceSecondaryLocationExpansionJobData } from './restaurant-secondary-location-expansion.types';
import { currentCampaignId } from '../external-integrations/shared/work-context';

const QUEUE_NAME = 'restaurant-secondary-location-expansion';
const JOB_NAME = 'expand-restaurant-secondary-locations';

@Injectable()
export class PlaceSecondaryLocationExpansionQueueService {
  /** P2.2: metro-probe cooldown — a brand with no local store is
   *  re-checked at most once per this window. */
  static readonly METRO_PROBE_COOLDOWN_DAYS = 30;

  constructor(
    @InjectQueue(QUEUE_NAME)
    private readonly queue: Queue<PlaceSecondaryLocationExpansionJobData>,
    private readonly prisma: PrismaService,
  ) {}

  /** P2.2 locations-follow-testimony: testimony arrived in a metro where
   *  this adopted brand has no location — probe Places with the metro's
   *  bias, once per cooldown. Enqueue is free; the worker spends. */
  async queueMetroProbe(
    placeId: string,
    communityHandle: string,
  ): Promise<string | null> {
    const id = placeId?.trim();
    const handle = communityHandle?.trim().toLowerCase();
    if (!id || !handle) {
      return null;
    }
    const fresh = await this.prisma.metroLocationProbe.findUnique({
      where: {
        placeId_communityHandle: {
          placeId: id,
          communityHandle: handle,
        },
      },
      select: { probedAt: true },
    });
    if (
      fresh &&
      Date.now() - fresh.probedAt.getTime() <
        PlaceSecondaryLocationExpansionQueueService.METRO_PROBE_COOLDOWN_DAYS *
          24 *
          3600 *
          1000
    ) {
      return null;
    }
    // the probe expands from the entity's primary grounded place — an
    // entirely ungrounded entity has nothing to expand from (backfill owns it)
    const primary = await this.prisma.placeLocation.findFirst({
      where: { placeId: id, googlePlaceId: { not: null } },
      orderBy: { isPrimary: 'desc' },
      select: { googlePlaceId: true },
    });
    if (!primary?.googlePlaceId) {
      return null;
    }
    const job = await this.queue.add(
      JOB_NAME,
      {
        placeId: id,
        googlePlaceId: primary.googlePlaceId,
        requestedAt: new Date().toISOString(),
        source: 'metro-probe',
        campaignId: currentCampaignId(),
        metroCommunityHandle: handle,
      },
      {
        jobId: `${QUEUE_NAME}:metro:${id}:${handle}`,
        removeOnComplete: true,
        removeOnFail: true,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );
    return String(job.id ?? '');
  }

  async queueExpansion(
    placeId: string,
    googlePlaceId: string,
    options: { source?: string } = {},
  ): Promise<string | null> {
    const normalizedPlaceId = placeId?.trim();
    const normalizedGooglePlaceId = googlePlaceId?.trim();
    if (!normalizedPlaceId || !normalizedGooglePlaceId) {
      return null;
    }

    const jobId = this.buildJobId(normalizedPlaceId, normalizedGooglePlaceId);
    // F356: no try/catch — see the cuisine queue for the full account. Bull's
    // `add` returns the existing job for a duplicate jobId; it never throws
    // 'already exists', so the guard that used to sit here could not fire.
    const job = await this.queue.add(
      JOB_NAME,
      {
        placeId: normalizedPlaceId,
        googlePlaceId: normalizedGooglePlaceId,
        requestedAt: new Date().toISOString(),
        source: options.source,
        // F352-attribution (owner-ruled 2026-08-03). Ambient, never asked for
        // by the caller: bulk flows (city onboarding, re-extraction) already
        // run inside runInWorkContext, routine collection does not. Absent =
        // routine = unattributed and ungated. See the job-data docstring.
        campaignId: currentCampaignId(),
      },
      {
        jobId,
        removeOnComplete: true,
        // F354 RULED (2026-08-03): expansion failures now THROW, so `attempts`
        // is reachable for the first time — and that makes the old
        // `removeOnFail: 50` actively harmful rather than merely divergent. A
        // retained failed job SQUATS on the jobId, so the next enqueue for
        // this restaurant resolves to the dead job and silently no-ops: the
        // exact failure the primary lane documents. Now identical to that
        // lane, for its stated reason.
        removeOnFail: true,
        // Mirrors the primary lane exactly (not a new number). Without a
        // backoff the three attempts fire back-to-back, which turns a vendor
        // blip into 3× the Places spend inside a few seconds; the ruling
        // accepted retry-at-cost, not instant retry-at-cost.
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );
    return String(job.id ?? jobId);
  }

  private buildJobId(placeId: string, googlePlaceId: string): string {
    return `${QUEUE_NAME}:${placeId}:${googlePlaceId}`;
  }
}
