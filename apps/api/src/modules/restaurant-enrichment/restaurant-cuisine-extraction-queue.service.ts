import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { RestaurantCuisineExtractionJobData } from './restaurant-cuisine-extraction.types';

const QUEUE_NAME = 'restaurant-cuisine-extraction';
const JOB_NAME = 'extract-restaurant-cuisine';

@Injectable()
export class RestaurantCuisineExtractionQueueService {
  constructor(
    @InjectQueue(QUEUE_NAME)
    private readonly queue: Queue<RestaurantCuisineExtractionJobData>,
  ) {}

  async queueExtraction(
    restaurantId: string,
    options: { source?: string } = {},
  ): Promise<string | null> {
    const normalized = restaurantId?.trim();
    if (!normalized) {
      return null;
    }

    const jobId = this.buildJobId(normalized);
    // F356: no try/catch. Bull's `add` with an existing jobId does NOT throw —
    // addJob-6.lua checks `EXISTS jobIdKey` and RETURNS the existing id (bull
    // 4.16) — so the `catch (isDuplicateJobError)` arm that used to wrap this,
    // matching on the vendor prose 'already exists', guarded a case that
    // cannot occur. It was duplicated verbatim in the sibling expansion queue.
    // Deduplication happens in Redis and the caller gets the existing job's
    // id, which is the honest answer.
    const job = await this.queue.add(
      JOB_NAME,
      {
        restaurantId: normalized,
        requestedAt: new Date().toISOString(),
        source: options.source,
      },
      {
        jobId,
        removeOnComplete: true,
        // DELIBERATE, and different from the primary-enrichment lane's
        // `true` (F356 named this divergence): a failed cuisine job is kept
        // so its error is inspectable. The cost is that it squats on the
        // jobId until Bull evicts it. Changing it changes when work is
        // re-enqueued, so it stays a named choice, not a copied default.
        removeOnFail: 50,
        attempts: 3,
      },
    );
    return String(job.id ?? jobId);
  }

  private buildJobId(restaurantId: string): string {
    return `${QUEUE_NAME}:${restaurantId}`;
  }
}
