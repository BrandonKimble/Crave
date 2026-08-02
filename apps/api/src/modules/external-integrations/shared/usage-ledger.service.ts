import { Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CorrelationUtils, LoggerService } from '../../../shared';
import { GovernanceService } from '../governance/governance.service';
import { currentCampaignId } from './work-context';
import { placesCostMicrosPerCall } from './vendor-pricing';
import { geminiCostMicros } from './gemini-pricing';
import { SpendCampaignService } from './spend-campaign.service';

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
  /** Cache-storage events only: hours the cached content is held. Presence
   *  switches pricing from cached-READ to cache-STORAGE (token-hours). */
  durationHours?: number;
  /** How the paid call ended (ok | truncated | aborted | failed). Omit for
   *  non-generation rows (cache lifecycle, Places, TomTom). */
  outcome?: 'ok' | 'truncated' | 'aborted' | 'failed';
  caller: string;
  runKey?: string;
  /** Idempotency key for at-most-once records (unique column; a duplicate
   *  insert is silently skipped). Use when the same logical usage could be
   *  recorded twice across crash/retry — e.g. one row per batch job. */
  dedupeKey?: string;
  /** §24.3 Leg C: when this event's spend belongs to an owner-approved Tier
   *  1 campaign, thread its id through so the envelope gets metered (see
   *  meterCampaignSpend). Currently threaded from archive gemini-batch
   *  extraction (resumeContext.campaignId, set at submit time) — see
   *  gemini-batch.service.ts's pollOne. */
  campaignId?: string;
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
    // Optional: slim script module graphs may lack the governance module;
    // the ledger's DB record must never depend on the meter.
    @Optional() private readonly governance?: GovernanceService,
    // Optional for the same reason — a script graph without the campaign
    // service simply never attributes campaign spend (events still record).
    @Optional() private readonly spendCampaigns?: SpendCampaignService,
  ) {
    this.logger = loggerService.setContext('UsageLedgerService');
  }

  record(event: UsageEvent): void {
    this.meterGeminiSpend(event);
    this.meterPlacesSpend(event);
    this.meterCampaignSpend(event);
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
      durationHours: event.durationHours ?? null,
      outcome: event.outcome ?? null,
      caller: event.caller,
      // RUN ATTRIBUTION BY DEFAULT. runKey had exactly one producer (the
      // batch job id), so 165 of 58,958 gemini rows and ZERO Places/TomTom
      // rows carried it — "what did this reload cost, by cause?" was
      // unanswerable for 99.7% of spend. The correlation id is already
      // threaded through every request path, so defaulting to it makes cost
      // a real run-scoped dimension without touching a single call site.
      runKey: event.runKey ?? CorrelationUtils.getCorrelationId() ?? null,
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

  /**
   * Meter ACTUAL gemini dollars (micro-USD, K4 rates) into the
   * gemini.monthlySpend pool — §24.1 Tier 3, the catastrophe backstop's
   * ledger side (never a work governor; see governance.service.ts's
   * registration comment). The pool's window is the LAST-resort admission
   * gate; this is the write side. Fire-and-forget; never breaks the record.
   * §24.4 item 6: the 80%-of-budget warn that used to live here is GONE —
   * it warned against the wrong denominator (percent of a Tier-3 dollar
   * cap). SpendAnalyticsService.nightlyRefresh now logs the honest
   * telemetry: month-to-date spend vs. the trailing MEASURED baseline,
   * prorated to the day of month (see logSpendTelemetry there).
   */
  /**
   * THE PLACES METER (capacity red team, RANK 1 — the gate was decorative).
   *
   * `assertPlacesSpendOpen` admits against `googlePlaces.monthlySpend`, but
   * NOTHING ever incremented that pool: `pools.meter` was called only for
   * gemini and for campaign grants. Proven on prod —
   * `pool_window_consumption` had rows for gemini.monthlySpend and tomtom.*
   * and NO googlePlaces.monthlySpend row at all, against $565.80 of billed
   * Places in July. A gate reading a counter that is permanently zero admits
   * forever. Places was 55% of that month's bill.
   *
   * Same shape as the gemini meter: fail-soft (metering must never break the
   * usage record) and priced by the existing per-SKU pricer.
   */
  private meterPlacesSpend(event: UsageEvent): void {
    if (event.service !== 'google_places' || !this.governance) {
      return;
    }
    try {
      const micros = placesCostMicrosPerCall(
        event.skuTier ?? null,
        event.operation,
      );
      const calls = event.requestCount ?? 1;
      const total = micros * (Number.isFinite(calls) && calls > 0 ? calls : 1);
      if (total <= 0) {
        return;
      }
      void this.governance.pools.meter('googlePlaces.monthlySpend', total);
    } catch {
      // Metering must never break the usage record itself.
    }
  }

  private meterGeminiSpend(event: UsageEvent): void {
    if (event.service !== 'gemini' || !this.governance) {
      return;
    }
    try {
      // §24 red team finding 6 ("NaN spend must not vanish"): geminiCostMicros
      // now sanitizes NaN token fields to 0 rather than propagating NaN into
      // a silent no-op meter (`micros <= 0` below is falsy for NaN too, so a
      // malformed event used to under-meter with ZERO visibility). Warn once
      // per malformed event so the under-metering is LOUD, not silent.
      if (
        (event.inputTokens !== undefined &&
          !Number.isFinite(event.inputTokens)) ||
        (event.outputTokens !== undefined &&
          !Number.isFinite(event.outputTokens)) ||
        (event.cachedTokens !== undefined &&
          !Number.isFinite(event.cachedTokens))
      ) {
        this.logger.warn('Malformed token counts — spend under-metered', {
          operation: event.operation,
          caller: event.caller,
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          cachedTokens: event.cachedTokens,
        });
      }
      const micros = geminiCostMicros(event);
      if (micros <= 0) {
        return;
      }
      void this.governance.pools.meter('gemini.monthlySpend', micros);
    } catch {
      // Metering must never break the usage record itself.
    }
  }

  /**
   * §24.3 Leg C: forward this event's ACTUAL dollars into its campaign's
   * envelope, when campaignId is present. Fire-and-forget (mirrors
   * meterGeminiSpend) — a breach/refusal here must never break the usage
   * record itself; SpendCampaignService.recordSpend already logs loudly on
   * breach, so a caught error here only needs a warn for visibility.
   */
  private meterCampaignSpend(event: UsageEvent): void {
    // AMBIENT ATTRIBUTION (final red team D4): an explicit campaignId still
    // wins, but work running under a campaign context is attributed even
    // when the call site knows nothing about campaigns. Before this, only
    // the batch line carried an id — ~7% of the priced manifest — so the
    // envelope could be overrun by multiples without ever breaching.
    const campaignId = event.campaignId ?? currentCampaignId();
    if (!campaignId || !this.spendCampaigns) {
      return;
    }
    try {
      // SERVICE → PRICER dispatch (final-final red team #5): the old
      // `service !== 'gemini'` early-return meant Places spend under a
      // campaign was never metered — while the manifest PRICES a Places
      // line and the $118 lesson was Places. The stale comment claimed
      // Places wasn't priced; vendor-pricing.ts has priced it per-SKU since
      // 2026-07-30. One meter, every priced vendor.
      let micros = 0;
      if (event.service === 'gemini') {
        micros = geminiCostMicros(event);
      } else if (event.service === 'google_places') {
        micros = placesCostMicrosPerCall(
          event.skuTier ?? null,
          event.operation,
        );
      } else {
        return; // unpriced vendors stay out of the envelope
      }
      if (micros <= 0) {
        return;
      }
      this.spendCampaigns
        .recordSpend(campaignId, micros)
        .catch((error: unknown) => {
          this.logger.warn('Campaign spend attribution failed', {
            campaignId,
            error:
              error instanceof Error
                ? { message: error.message }
                : { message: String(error) },
          });
        });
    } catch {
      // Attribution must never break the usage record itself.
    }
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
