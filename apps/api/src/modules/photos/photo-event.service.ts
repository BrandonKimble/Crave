import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PhotoEventType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

// Per-event count clamp. MUST be >= the client's coalesce flush threshold
// (FLUSH_AT_COUNT = 50 in apps/mobile/src/components/photos/photo-events-buffer.ts)
// or legitimately coalesced impression counts get silently halved.
export const MAX_EVENT_COUNT = 50;

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
    // Ranking integrity: only LIVE photos accept events (FK backstops
    // existence; this filter keeps a poisoned batch from failing whole),
    // and per-event counts are capped tight — the tap-rate v2 signal must
    // not be self-servable.
    const write = (async () => {
      const candidate = events.slice(0, 200);
      const liveIds = new Set(
        (
          await this.prisma.photo.findMany({
            where: {
              photoId: { in: [...new Set(candidate.map((e) => e.photoId))] },
              // Ranking events are a PUBLIC-surface signal: private photos
              // never rank publicly, so owner views of them don't count.
              status: 'live',
              visibility: 'public',
            },
            select: { photoId: true },
          })
        ).map((row) => row.photoId),
      );
      const rows = candidate
        .filter((event) => liveIds.has(event.photoId))
        .map((event) => ({
          photoId: event.photoId,
          userId,
          eventType: event.eventType,
          eventCount: Math.max(1, Math.min(event.count ?? 1, MAX_EVENT_COUNT)),
        }));
      if (rows.length === 0) return;
      await this.prisma.photoEvent.createMany({ data: rows });
    })().catch((error) => {
      this.logger.warn('photo_events write failed (dropped)', {
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
