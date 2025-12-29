import { Inject, OnModuleInit } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { LoggerService } from '../../shared';
import { RestaurantCuisineExtractionService } from './restaurant-cuisine-extraction.service';
import { RestaurantCuisineExtractionJobData } from './restaurant-cuisine-extraction.types';

const QUEUE_NAME = 'restaurant-cuisine-extraction';
const JOB_NAME = 'extract-restaurant-cuisine';

@Processor(QUEUE_NAME)
export class RestaurantCuisineExtractionWorker implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    private readonly cuisineExtraction: RestaurantCuisineExtractionService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext(
      'RestaurantCuisineExtractionWorker',
    );
  }

  @Process(JOB_NAME)
  async handle(job: Job<RestaurantCuisineExtractionJobData>): Promise<void> {
    const restaurantId = job.data?.restaurantId?.trim();
    if (!restaurantId) {
      this.logger.warn('Cuisine extraction job missing restaurantId', {
        jobId: job.id,
        data: job.data,
      });
      return;
    }

    this.logger.info('Processing cuisine extraction', {
      jobId: job.id,
      restaurantId,
      source: job.data?.source,
    });

    await this.cuisineExtraction.extractCuisineForRestaurant(restaurantId, {
      source: job.data?.source,
    });
  }
}
