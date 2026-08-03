import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { RestaurantSecondaryLocationExpansionJobData } from './restaurant-secondary-location-expansion.types';
import { currentCampaignId } from '../external-integrations/shared/work-context';

const QUEUE_NAME = 'restaurant-secondary-location-expansion';
const JOB_NAME = 'expand-restaurant-secondary-locations';

@Injectable()
export class RestaurantSecondaryLocationExpansionQueueService {
  constructor(
    @InjectQueue(QUEUE_NAME)
    private readonly queue: Queue<RestaurantSecondaryLocationExpansionJobData>,
  ) {}

  async queueExpansion(
    restaurantId: string,
    placeId: string,
    options: { source?: string } = {},
  ): Promise<string | null> {
    const normalizedRestaurantId = restaurantId?.trim();
    const normalizedPlaceId = placeId?.trim();
    if (!normalizedRestaurantId || !normalizedPlaceId) {
      return null;
    }

    const jobId = this.buildJobId(normalizedRestaurantId, normalizedPlaceId);
    // F356: no try/catch — see the cuisine queue for the full account. Bull's
    // `add` returns the existing job for a duplicate jobId; it never throws
    // 'already exists', so the guard that used to sit here could not fire.
    const job = await this.queue.add(
      JOB_NAME,
      {
        restaurantId: normalizedRestaurantId,
        placeId: normalizedPlaceId,
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

  private buildJobId(restaurantId: string, placeId: string): string {
    return `${QUEUE_NAME}:${restaurantId}:${placeId}`;
  }
}
