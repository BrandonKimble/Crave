import { Inject, OnModuleInit } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { LoggerService } from '../../shared';
import { RestaurantLocationEnrichmentService } from './restaurant-location-enrichment.service';
import { RestaurantSecondaryLocationExpansionJobData } from './restaurant-secondary-location-expansion.types';
import { runInWorkContext } from '../external-integrations/shared/work-context';
import { PrismaService } from '../../prisma/prisma.service';

const QUEUE_NAME = 'restaurant-secondary-location-expansion';
const JOB_NAME = 'expand-restaurant-secondary-locations';

@Processor(QUEUE_NAME)
export class RestaurantSecondaryLocationExpansionWorker
  implements OnModuleInit
{
  private logger!: LoggerService;

  constructor(
    private readonly restaurantLocationEnrichment: RestaurantLocationEnrichmentService,
    private readonly prisma: PrismaService,
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
    // P2.2 metro probe: resolve the community's anchor and bias the
    // expansion's text search to it, then record the cooldown row —
    // success OR empty result both count as "probed" (that's the point
    // of the cooldown).
    const metroHandle = job.data?.metroCommunityHandle?.trim().toLowerCase();
    let bias: { lat: number; lng: number } | undefined;
    if (metroHandle) {
      const rows = await this.prisma.$queryRaw<
        Array<{ lat: number; lng: number }>
      >`
        SELECT p.centroid_lat::float AS lat, p.centroid_lng::float AS lng
        FROM sources s JOIN places p ON p.place_id = s.anchor_place_id
        WHERE lower(s.handle) = ${metroHandle} LIMIT 1
      `;
      bias = rows[0];
      if (!bias) {
        this.logger.warn('Metro probe has no anchor — skipping', {
          restaurantId,
          metroHandle,
        });
        return;
      }
    }
    await runInWorkContext({ campaignId: job.data?.campaignId }, () =>
      this.restaurantLocationEnrichment.expandSecondaryLocationsForRestaurant(
        restaurantId,
        placeId,
        bias,
      ),
    );
    if (metroHandle) {
      await this.prisma.metroLocationProbe.upsert({
        where: {
          restaurantId_communityHandle: {
            restaurantId,
            communityHandle: metroHandle,
          },
        },
        update: { probedAt: new Date() },
        create: { restaurantId, communityHandle: metroHandle },
      });
    }
  }
}
