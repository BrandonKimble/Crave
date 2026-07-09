import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';

export interface UsageEvent {
  service: 'gemini' | 'google_places' | 'tomtom';
  operation: string;
  skuTier?: string;
  model?: string;
  mode?: 'interactive' | 'batch';
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  requestCount?: number;
  caller: string;
  runKey?: string;
  /** Idempotency key for at-most-once records (unique column; a duplicate
   *  insert is silently skipped). Use when the same logical usage could be
   *  recorded twice across crash/retry — e.g. one row per batch job. */
  dedupeKey?: string;
}

/** Places fields that force the Enterprise+Atmosphere SKU. */
const ATMOSPHERE_FIELDS = new Set([
  'editorialSummary',
  'priceRange',
  'allowsDogs',
  'curbsidePickup',
  'delivery',
  'dineIn',
  'goodForChildren',
  'goodForGroups',
  'goodForWatchingSports',
  'liveMusic',
  'outdoorSeating',
  'servesBeer',
  'servesBreakfast',
  'servesBrunch',
  'servesCocktails',
  'servesCoffee',
  'servesDinner',
  'servesDessert',
  'servesLunch',
  'servesVegetarianFood',
  'servesWine',
]);
/** Places fields that force the Enterprise SKU. */
const ENTERPRISE_FIELDS = new Set([
  'internationalPhoneNumber',
  'nationalPhoneNumber',
  'websiteUri',
  'regularOpeningHours',
  'currentOpeningHours',
  'priceLevel',
]);
/** Places fields billed at Pro (above Essentials id/location/address basics). */
const PRO_FIELDS = new Set([
  'displayName',
  'primaryType',
  'types',
  'businessStatus',
  'movedPlaceId',
]);

/**
 * Automatic usage/cost ledger for paid external APIs. Written fire-and-forget
 * at the service chokepoints (GooglePlacesService + LLMService/GeminiBatch),
 * so ANY collection run's spend is answerable after the fact:
 *   SELECT service, operation, sku_tier, model, mode,
 *          sum(request_count), sum(input_tokens), sum(output_tokens), sum(cached_tokens)
 *   FROM api_usage_ledger WHERE run_key = $1 GROUP BY 1,2,3,4,5;
 * A write failure only warns — the ledger must never break a real call.
 */
@Injectable()
export class UsageLedgerService implements OnModuleDestroy {
  /** In-flight fire-and-forget writes, awaited on shutdown so short-lived
   *  scripts and deploys can't drop records. */
  private readonly pending = new Set<Promise<unknown>>();

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled(Array.from(this.pending));
  }

  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('UsageLedgerService');
  }

  record(event: UsageEvent): void {
    const data = {
      service: event.service,
      operation: event.operation,
      skuTier: event.skuTier ?? null,
      model: event.model ?? null,
      mode: event.mode ?? null,
      inputTokens: event.inputTokens ?? null,
      outputTokens: event.outputTokens ?? null,
      cachedTokens: event.cachedTokens ?? null,
      requestCount: event.requestCount ?? 1,
      caller: event.caller,
      runKey: event.runKey ?? null,
      dedupeKey: event.dedupeKey ?? null,
    };
    // createMany + skipDuplicates makes keyed records idempotent (unique
    // dedupe_key): crash/retry re-records are no-ops, so callers never have
    // to choose between under- and double-recording via statement ordering.
    const write = this.prisma.apiUsageEvent
      .createMany({ data: [data], skipDuplicates: true })
      .catch((error: unknown) => {
        this.logger.warn('Usage ledger write failed', {
          operation: event.operation,
          error:
            error instanceof Error
              ? { message: error.message }
              : { message: String(error) },
        });
      });
    this.pending.add(write);
    void write.finally(() => this.pending.delete(write));
  }

  /** Highest-SKU-in-mask classification, mirroring Google's billing rule. */
  static classifyPlacesSku(fieldMaskFields: string[]): string {
    // Strip the `places.` prefix text-search masks carry.
    const fields = fieldMaskFields.map((f) => f.replace(/^places\./, ''));
    if (fields.some((f) => ATMOSPHERE_FIELDS.has(f))) {
      return 'enterprise_atmosphere';
    }
    if (fields.some((f) => ENTERPRISE_FIELDS.has(f))) {
      return 'enterprise';
    }
    if (fields.some((f) => PRO_FIELDS.has(f))) {
      return 'pro';
    }
    return 'essentials';
  }
}
