import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { RestaurantSecondaryLocationExpansionJobData } from './restaurant-secondary-location-expansion.types';

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
      },
      {
        jobId,
        removeOnComplete: true,
        // DELIBERATE and different from the primary-enrichment lane's `true`
        // (F356 named this divergence). This lane SPENDS PLACES MONEY, and
        // flipping it changes when that spend is re-enqueued — which is the
        // owner's call (F354, escalated), not a tidy-up. Named, not copied.
        removeOnFail: 50,
        attempts: 3,
      },
    );
    return String(job.id ?? jobId);
  }

  private buildJobId(restaurantId: string, placeId: string): string {
    return `${QUEUE_NAME}:${restaurantId}:${placeId}`;
  }
}
