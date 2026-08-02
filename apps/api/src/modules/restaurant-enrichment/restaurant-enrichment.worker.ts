import { Inject, OnModuleInit } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { LoggerService } from '../../shared';
import { runInWorkContext } from '../external-integrations/shared/work-context';
import { RestaurantLocationEnrichmentService } from './restaurant-location-enrichment.service';
import {
  RESTAURANT_ENRICHMENT_QUEUE_NAME,
  RESTAURANT_ENRICHMENT_JOB_NAME,
  RestaurantEnrichmentJobData,
} from './restaurant-enrichment-queue.service';

@Processor(RESTAURANT_ENRICHMENT_QUEUE_NAME)
export class RestaurantEnrichmentWorker implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    private readonly enrichment: RestaurantLocationEnrichmentService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('RestaurantEnrichmentWorker');
  }

  @Process({ name: RESTAURANT_ENRICHMENT_JOB_NAME, concurrency: 5 })
  async handle(job: Job<RestaurantEnrichmentJobData>): Promise<void> {
    const restaurantId = job.data?.restaurantId?.trim();
    if (!restaurantId) {
      this.logger.warn('Enrichment job missing restaurantId', {
        jobId: job.id,
      });
      return;
    }
    // Re-establish the enqueuer's campaign context — ALS dies at the queue
    // boundary, and this worker is where the actual Places dollars happen.
    await runInWorkContext({ campaignId: job.data.campaignId }, () =>
      this.enrichment.enrichRestaurantById(restaurantId, {
        sourceLocale: job.data.sourceLocale ?? undefined,
        countryCode: job.data.countryCode ?? undefined,
        locationBias: job.data.locationBias ?? undefined,
      }),
    );
  }
}
