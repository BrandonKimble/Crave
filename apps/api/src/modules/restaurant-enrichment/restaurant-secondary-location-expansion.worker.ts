import { Inject, OnModuleInit } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { LoggerService } from '../../shared';
import { RestaurantLocationEnrichmentService } from './restaurant-location-enrichment.service';
import { RestaurantSecondaryLocationExpansionJobData } from './restaurant-secondary-location-expansion.types';
import { runInWorkContext } from '../external-integrations/shared/work-context';

const QUEUE_NAME = 'restaurant-secondary-location-expansion';
const JOB_NAME = 'expand-restaurant-secondary-locations';

@Processor(QUEUE_NAME)
export class RestaurantSecondaryLocationExpansionWorker
  implements OnModuleInit
{
  private logger!: LoggerService;

  constructor(
    private readonly restaurantLocationEnrichment: RestaurantLocationEnrichmentService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext(
      'RestaurantSecondaryLocationExpansionWorker',
    );
  }

  @Process(JOB_NAME)
  async handle(
    job: Job<RestaurantSecondaryLocationExpansionJobData>,
  ): Promise<void> {
    const restaurantId = job.data?.restaurantId?.trim();
    const placeId = job.data?.placeId?.trim();
    if (!restaurantId || !placeId) {
      this.logger.warn('Secondary location expansion job missing identifiers', {
        jobId: job.id,
        data: job.data,
      });
      return;
    }

    this.logger.info('Processing secondary location expansion', {
      jobId: job.id,
      restaurantId,
      placeId,
      source: job.data?.source,
    });

    // F352-attribution: re-establish the enqueuing work's campaign, which the
    // BullMQ boundary dropped. Every Places call underneath — the details
    // fetch AND every findPlaceFromText page — is then metered against that
    // campaign's envelope by the usage ledger's ambient attribution. A
    // routine-triggered job carries no campaignId; runInWorkContext with
    // `undefined` is exactly the ambient-nothing this lane has always had.
    //
    // NOTE: this deliberately does NOT catch. F354 (owner-ruled 2026-08-03):
    // a mid-run fault must leave the JOB failed so the queue's attempts:3
    // means what it says.
    await runInWorkContext({ campaignId: job.data?.campaignId }, () =>
      this.restaurantLocationEnrichment.expandSecondaryLocationsForRestaurant(
        restaurantId,
        placeId,
      ),
    );
  }
}
