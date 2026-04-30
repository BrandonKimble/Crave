import { Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { LoggerService } from '../../shared';
import { RestaurantSecondaryLocationExpansionJobData } from './restaurant-secondary-location-expansion.types';

const QUEUE_NAME = 'restaurant-secondary-location-expansion';
const JOB_NAME = 'expand-restaurant-secondary-locations';

@Injectable()
export class RestaurantSecondaryLocationExpansionQueueService {
  private readonly logger: LoggerService;

  constructor(
    @InjectQueue(QUEUE_NAME)
    private readonly queue: Queue<RestaurantSecondaryLocationExpansionJobData>,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext(
      'RestaurantSecondaryLocationExpansionQueue',
    );
  }

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
    try {
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
          removeOnFail: 50,
          attempts: 3,
        },
      );
      return String(job.id ?? jobId);
    } catch (error) {
      if (this.isDuplicateJobError(error)) {
        this.logger.debug('Secondary location expansion already queued', {
          restaurantId: normalizedRestaurantId,
          placeId: normalizedPlaceId,
          source: options.source,
        });
        return null;
      }
      throw error;
    }
  }

  private buildJobId(restaurantId: string, placeId: string): string {
    return `${QUEUE_NAME}:${restaurantId}:${placeId}`;
  }

  private isDuplicateJobError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('already exists');
  }
}
