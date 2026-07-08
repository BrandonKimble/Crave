import { Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { LoggerService } from '../../shared';

const QUEUE_NAME = 'restaurant-primary-enrichment';
const JOB_NAME = 'enrich-restaurant';

export interface RestaurantEnrichmentJobData {
  restaurantId: string;
  requestedAt: string;
  sourceMarket?: { city?: string | null; region?: string | null } | null;
  countryCode?: string | null;
  locationBias?: { lat: number; lng: number; radiusMeters?: number } | null;
}

/**
 * Queue for PRIMARY restaurant enrichment (Google Places identity + details).
 * Audit item 6: enrichment used to run inline inside collection ingest,
 * coupling ingest latency to Google's API; it now rides BullMQ like the
 * cuisine and secondary-location passes. Job id = restaurantId → duplicate
 * enqueues collapse; enrichRestaurantById's own hasPlaceId guard makes the
 * worker idempotent.
 */
@Injectable()
export class RestaurantEnrichmentQueueService {
  private readonly logger: LoggerService;

  constructor(
    @InjectQueue(QUEUE_NAME)
    private readonly queue: Queue<RestaurantEnrichmentJobData>,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('RestaurantEnrichmentQueue');
  }

  async queueEnrichment(
    restaurantId: string,
    context: Omit<RestaurantEnrichmentJobData, 'restaurantId' | 'requestedAt'>,
  ): Promise<void> {
    const normalized = restaurantId?.trim();
    if (!normalized) return;
    await this.queue.add(
      JOB_NAME,
      {
        restaurantId: normalized,
        requestedAt: new Date().toISOString(),
        ...context,
      },
      {
        jobId: `${QUEUE_NAME}:${normalized}`,
        removeOnComplete: true,
        // Failed jobs must not squat on the jobId and silently no-op later
        // enqueues: the worker's error log + the still-placeholder restaurant
        // row are the durable signal, and the janitor's weekly retry
        // re-enqueues.
        removeOnFail: true,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );
  }
}

export const RESTAURANT_ENRICHMENT_QUEUE_NAME = QUEUE_NAME;
export const RESTAURANT_ENRICHMENT_JOB_NAME = JOB_NAME;
