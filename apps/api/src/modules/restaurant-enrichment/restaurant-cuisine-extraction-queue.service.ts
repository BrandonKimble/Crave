import { Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { LoggerService } from '../../shared';
import { RestaurantCuisineExtractionJobData } from './restaurant-cuisine-extraction.types';

const QUEUE_NAME = 'restaurant-cuisine-extraction';
const JOB_NAME = 'extract-restaurant-cuisine';

@Injectable()
export class RestaurantCuisineExtractionQueueService {
  private readonly logger: LoggerService;

  constructor(
    @InjectQueue(QUEUE_NAME)
    private readonly queue: Queue<RestaurantCuisineExtractionJobData>,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('RestaurantCuisineExtractionQueue');
  }

  async queueExtraction(
    restaurantId: string,
    options: { source?: string } = {},
  ): Promise<string | null> {
    const normalized = restaurantId?.trim();
    if (!normalized) {
      return null;
    }

    const jobId = this.buildJobId(normalized);
    try {
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
          removeOnFail: 50,
          attempts: 3,
        },
      );
      return String(job.id ?? jobId);
    } catch (error) {
      if (this.isDuplicateJobError(error)) {
        this.logger.debug('Cuisine extraction already queued', {
          restaurantId: normalized,
          source: options.source,
        });
        return null;
      }
      throw error;
    }
  }

  private buildJobId(restaurantId: string): string {
    return `${QUEUE_NAME}:${restaurantId}`;
  }

  private isDuplicateJobError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('already exists');
  }
}
