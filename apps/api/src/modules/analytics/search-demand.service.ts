import { Injectable } from '@nestjs/common';
import { DemandSignalKind, DemandSourceKind, EntityType } from '@prisma/client';
import { LoggerService } from '../../shared';
import { SearchDemandAggregationService } from './search-demand-aggregation.service';

export interface LocationDemandRecord {
  marketKey: string;
  signalCount: number;
  demandScore: number;
}

export interface EntityDemandRecord {
  entityId: string;
  entityType: EntityType;
  marketKey: string;
  signalCount: number;
  distinctUsers: number;
  weightedSignalCount: number;
  demandScore: number;
  lastSeenAt: Date;
}

@Injectable()
export class SearchDemandService {
  constructor(
    private readonly demandAggregation: SearchDemandAggregationService,
    private readonly logger: LoggerService,
  ) {}

  async listActiveLocations(params: {
    since: Date;
    minDemandScore: number;
    limit?: number;
  }): Promise<LocationDemandRecord[]> {
    try {
      const rows = await this.demandAggregation.listActiveMarkets({
        since: params.since,
        minSignalCount: 0,
        minDemandScore: params.minDemandScore,
        limit: params.limit,
        sourceKinds: [DemandSourceKind.search_log],
        signalKinds: [
          DemandSignalKind.backend,
          DemandSignalKind.cache,
          DemandSignalKind.autocomplete_selection,
        ],
      });

      return rows.map((row) => ({
        marketKey: row.marketKey,
        signalCount: row.signalCount,
        demandScore: row.demandScore,
      }));
    } catch (error) {
      this.logger.warn('Failed to load active search locations', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      return [];
    }
  }

  async getTopEntitiesForLocation(params: {
    marketKey: string | null;
    since: Date;
    until?: Date;
    entityTypes?: EntityType[];
    entityIds?: string[];
    minDemandScore: number;
    limit: number;
    currentCycleDays?: number;
    halfLifeDays?: number;
  }): Promise<EntityDemandRecord[]> {
    const marketKey =
      typeof params.marketKey === 'string' ? params.marketKey.trim() : '';
    if (!marketKey) {
      return [];
    }

    try {
      const rows = await this.demandAggregation.listEntityDemand({
        since: params.since,
        until: params.until,
        marketKey,
        entityTypes: params.entityTypes,
        entityIds: params.entityIds,
        sourceKinds: [DemandSourceKind.search_log],
        signalKinds: [
          DemandSignalKind.backend,
          DemandSignalKind.cache,
          DemandSignalKind.autocomplete_selection,
        ],
        currentCycleDays: params.currentCycleDays,
        halfLifeDays: params.halfLifeDays,
        limit: params.limit,
      });

      return rows
        .filter((row) => row.entityId && row.entityType)
        .filter((row) => row.demandScore >= params.minDemandScore)
        .map((row) => ({
          entityId: row.entityId as string,
          entityType: row.entityType as EntityType,
          marketKey: row.marketKey?.trim().toLowerCase() ?? marketKey,
          signalCount: row.signalCount,
          distinctUsers: row.distinctUsers,
          weightedSignalCount: row.weightedSignalCount,
          demandScore: row.demandScore,
          lastSeenAt: row.lastSeenAt,
        }));
    } catch (error) {
      this.logger.warn('Failed to load entity demand for location', {
        marketKey,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      return [];
    }
  }
}
