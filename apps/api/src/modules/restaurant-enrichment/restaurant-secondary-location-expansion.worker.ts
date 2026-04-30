import { Inject, OnModuleInit } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { LoggerService } from '../../shared';
import { RestaurantLocationEnrichmentService } from './restaurant-location-enrichment.service';
import { RestaurantSecondaryLocationExpansionJobData } from './restaurant-secondary-location-expansion.types';

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

    await this.restaurantLocationEnrichment.expandSecondaryLocationsForRestaurant(
      restaurantId,
      placeId,
    );
  }
}
