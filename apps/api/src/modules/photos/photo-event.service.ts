import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PhotoEventType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

export interface PhotoEventInput {
  photoId: string;
  eventType: PhotoEventType;
  /** Client-coalesced count (batched impressions). */
  count?: number;
}

/**
 * Batched impression|tap ledger (usage-ledger pattern: fire-and-forget
 * createMany, pending-flush on shutdown, warn-never-throw). Feeds hero
 * tap-rate v2 + profile sorting. Day-one requirement per product/images.md.
 */
@Injectable()
export class PhotoEventService implements OnModuleDestroy {
  private readonly logger: LoggerService;
  private readonly pending = new Set<Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('PhotoEventService');
  }

  record(userId: string | null, events: PhotoEventInput[]): void {
    if (events.length === 0) return;
    const rows = events.slice(0, 200).map((event) => ({
      photoId: event.photoId,
      userId,
      eventType: event.eventType,
      eventCount: Math.max(1, Math.min(event.count ?? 1, 1000)),
    }));
    const write = this.prisma.photoEvent
      .createMany({ data: rows })
      .catch((error) => {
        this.logger.warn('photo_events write failed (dropped)', {
          count: rows.length,
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        });
      });
    this.pending.add(write);
    void write.finally(() => this.pending.delete(write));
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([...this.pending]);
  }
}
