import { Injectable } from '@nestjs/common';
import { EntityType, OnDemandReason } from '@prisma/client';
import { LoggerService, TextSanitizerService } from '../../shared';
import { EntityResolutionService } from '../content-processing/entity-resolver/entity-resolution.service';
import {
  AutocompleteRequestDto,
  AutocompleteResponseDto,
  AutocompleteMatchDto,
} from './dto/autocomplete.dto';
import { OnDemandRequestService } from '../search/on-demand-request.service';

const DEFAULT_LIMIT = 8;

@Injectable()
export class AutocompleteService {
  private readonly logger: LoggerService;

  constructor(
    loggerService: LoggerService,
    private readonly entityResolutionService: EntityResolutionService,
    private readonly onDemandRequestService: OnDemandRequestService,
    private readonly textSanitizer: TextSanitizerService,
  ) {
    this.logger = loggerService.setContext('AutocompleteService');
  }

  async autocompleteEntities(
    dto: AutocompleteRequestDto,
  ): Promise<AutocompleteResponseDto> {
    const normalizedQuery = this.textSanitizer.sanitizeOrThrow(dto.query, {
      maxLength: 140,
    });
    const limit = dto.limit ?? DEFAULT_LIMIT;
    const entityType = dto.entityType ?? EntityType.food;

    const resolution = await this.entityResolutionService.resolveBatch(
      [
        {
          tempId: 'autocomplete',
          normalizedName: normalizedQuery,
          originalText: dto.query,
          entityType,
        },
      ],
      {
        enableFuzzyMatching: true,
        fuzzyMatchThreshold: 0.6,
        batchSize: 1,
      },
    );

    const matches: AutocompleteMatchDto[] =
      resolution.resolutionResults
        .filter((result) => result.confidence >= 0.5 && result.entityId)
        .slice(0, limit)
        .map((result) => ({
          entityId: result.entityId!,
          entityType: result.entityType ?? entityType,
          name: result.matchedName ?? result.originalInput.normalizedName,
          aliases: result.originalInput.aliases ?? [],
          confidence: Number(Math.round((result.confidence ?? 0) * 100) / 100),
        })) ?? [];

    let onDemandQueued = false;
    if (
      dto.enableOnDemand &&
      matches.length === 0 &&
      dto.query.trim().length > 0
    ) {
      await this.onDemandRequestService.recordRequests(
        [
          {
            term: normalizedQuery,
            entityType,
            reason: OnDemandReason.unresolved,
            metadata: { source: 'autocomplete' },
          },
        ],
        { source: 'autocomplete' },
      );
      onDemandQueued = true;
      this.logger.debug('Queued on-demand request from autocomplete', {
        normalizedQuery,
        entityType,
      });
    }

    return {
      matches,
      query: dto.query,
      normalizedQuery,
      onDemandQueued,
      onDemandReason: onDemandQueued ? OnDemandReason.unresolved : undefined,
    };
  }
}
