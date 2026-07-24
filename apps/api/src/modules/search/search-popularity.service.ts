import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../shared';
import {
  SignalDemandReadService,
  EntityDemandParams,
} from '../signals/signal-demand-read.service';

// §16 K1 (attention-window sentence): popularity = the trailing month of
// demand. Classified 2026-07-24 (pre-constitution module).
const DEFAULT_POPULARITY_WINDOW_DAYS = 30;

/**
 * READER CUT (§22 item 6): entity popularity + per-user affinity read the
 * signals substrate (signal_demand_daily aggregate + fresh ledger today) —
 * the old user_search_demand_daily / search_events reads are dead here.
 *
 * Demand semantics: EVERY entity-subject act of EVERY kind counts (no kind
 * list — §3 self-provisioning; a new signal kind participates automatically)
 * at the uniform K2 kind-weight prior 1.0. The old hand-set per-kind weights
 * (1.5 / 0.6 / 0.35) died with the rollup; per-kind measurement arrives via
 * the estimator registry. Market scoping died with the market model: demand
 * is global (Austin-only launch makes scoped ≡ global; geo-scoped reads come
 * with place-tile readers when a consumer needs them).
 */

@Injectable()
export class SearchPopularityService {
  private readonly logger: LoggerService;

  constructor(
    private readonly signalDemandRead: SignalDemandReadService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SearchPopularityService');
  }

  async getEntityPopularityScores(
    entityIds: string[],
  ): Promise<Map<string, number>> {
    if (!entityIds.length) {
      return new Map();
    }
    try {
      return await this.signalDemandRead.entityDemandScores(
        this.demandParams({ entityIds }),
      );
    } catch (error) {
      this.logger.warn('Failed to load entity popularity scores', {
        entityCount: entityIds.length,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      return new Map();
    }
  }

  async getUserEntityAffinity(
    userId: string,
    entityIds: string[],
  ): Promise<Map<string, number>> {
    if (!userId || !entityIds.length) {
      return new Map();
    }
    try {
      return await this.signalDemandRead.entityDemandScores(
        this.demandParams({ entityIds, userId }),
      );
    } catch (error) {
      this.logger.warn('Failed to load user affinity scores', {
        userId,
        entityCount: entityIds.length,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      return new Map();
    }
  }

  private demandParams(params: {
    entityIds: string[];
    userId?: string;
  }): EntityDemandParams {
    return {
      entityIds: params.entityIds,
      userId: params.userId ?? null,
      windowDays: this.windowDays(),
    };
  }

  private windowDays(): number {
    const raw = Number(process.env.SEARCH_POPULARITY_WINDOW_DAYS);
    return Number.isFinite(raw) && raw > 0
      ? Math.min(Math.floor(raw), 365)
      : DEFAULT_POPULARITY_WINDOW_DAYS;
  }
}
