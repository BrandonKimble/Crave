import { Inject, OnModuleInit } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { LoggerService } from '../../shared';
import { PlaceCuisineExtractionService } from './restaurant-cuisine-extraction.service';
import { PlaceCuisineExtractionJobData } from './restaurant-cuisine-extraction.types';

const QUEUE_NAME = 'restaurant-cuisine-extraction';
const JOB_NAME = 'extract-restaurant-cuisine';

@Processor(QUEUE_NAME)
export class PlaceCuisineExtractionWorker implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    private readonly cuisineExtraction: PlaceCuisineExtractionService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext(
      'RestaurantCuisineExtractionWorker',
    );
  }

  @Process(JOB_NAME)
  async handle(job: Job<PlaceCuisineExtractionJobData>): Promise<void> {
    const placeId = job.data?.placeId?.trim();
    if (!placeId) {
      this.logger.warn('Cuisine extraction job missing restaurantId', {
        jobId: job.id,
        data: job.data,
      });
      return;
    }

    this.logger.info('Processing cuisine extraction', {
      jobId: job.id,
      placeId,
      source: job.data?.source,
    });

    await this.cuisineExtraction.extractCuisineForPlace(placeId, {
      source: job.data?.source,
    });
  }
}
