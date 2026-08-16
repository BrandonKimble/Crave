import { Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { LoggerService } from '../../shared';
import { currentCampaignId } from '../external-integrations/shared/work-context';

const QUEUE_NAME = 'restaurant-primary-enrichment';
const JOB_NAME = 'enrich-restaurant';

export interface PlaceEnrichmentJobData {
  placeId: string;
  requestedAt: string;
  /** Campaign funding the work that ENQUEUED this job. AsyncLocalStorage
   *  does not cross the BullMQ boundary (round-six cost #4: the envelope was
   *  sized for Places spend it never debited), so the ambient campaign is
   *  captured into the payload here and re-established in the worker. */
  campaignId?: string;
  sourceLocale?: { city?: string | null; region?: string | null } | null;
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
export class PlaceEnrichmentQueueService {
  private readonly logger: LoggerService;

  constructor(
    @InjectQueue(QUEUE_NAME)
    private readonly queue: Queue<PlaceEnrichmentJobData>,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('RestaurantEnrichmentQueue');
  }

  async queueEnrichment(
    placeId: string,
    context: Omit<PlaceEnrichmentJobData, 'placeId' | 'requestedAt'>,
  ): Promise<void> {
    const normalized = placeId?.trim();
    if (!normalized) return;
    await this.queue.add(
      JOB_NAME,
      {
        placeId: normalized,
        requestedAt: new Date().toISOString(),
        campaignId: currentCampaignId(),
        ...context,
      },
      {
        jobId: `${QUEUE_NAME}:${normalized}`,
        removeOnComplete: true,
        // Failed jobs must not squat on the jobId and silently no-op later
        // enqueues: the worker's error log + the still-placeholder restaurant
        // row are the durable signal, and the NEXT MENTION of the restaurant
        // re-enqueues (retry is mention-driven since the 2026-08-08 janitor
        // slim-down; the terminal-failure guard in the enrichment service
        // caps total definitive attempts).
        removeOnFail: true,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );
  }
}

export const PLACE_ENRICHMENT_QUEUE_NAME = QUEUE_NAME;
export const PLACE_ENRICHMENT_JOB_NAME = JOB_NAME;
