import { Injectable, Inject } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

@Injectable()
export class UserEventService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('UserEventService');
  }

  async recordEvent(params: {
    userId: string;
    eventType: string;
    eventData?: Prisma.InputJsonValue;
  }): Promise<void> {
    try {
      await this.prisma.userEvent.create({
        data: {
          userId: params.userId,
          eventType: params.eventType,
          eventData: params.eventData ?? Prisma.JsonNull,
        },
      });
    } catch (error) {
      this.logger.warn('Failed to record user event', {
        userId: params.userId,
        eventType: params.eventType,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
    }
  }
}
