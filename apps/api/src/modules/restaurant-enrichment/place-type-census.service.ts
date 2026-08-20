import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { OpsAlertsService } from '../external-integrations/shared/ops-alerts.service';
import { isClassifiedGooglePlaceType } from './google-place-type-attributes';

/**
 * THE UNMAPPED-TYPES CENSUS (R11, 2026-08-16).
 *
 * Google place types arrive AS-IS from Places responses, unpicked, and are
 * stored raw in core_entities.restaurant_metadata->googlePlaces->types — so a
 * NEW type Google ships is detectable the night it first lands on a grounded
 * restaurant. The classification authority is google-place-type-attributes.ts
 * (kind vs noise); a stored type it does not classify means Google changed
 * their taxonomy under us, and the owner re-audits manually.
 *
 * This census runs as a nightly-convergence phase and raises a deduped
 * ops-alert WARN (email opted in — a taxonomy change is exactly the "must
 * actually reach him" class) per unknown type. The same law is enforced
 * statically-against-the-corpus by scripts/check-place-type-classification.ts,
 * which is the invariant registry's check for
 * `taxonomy.every-stored-place-type-is-classified`.
 */
@Injectable()
export class PlaceTypeCensusService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly opsAlerts: OpsAlertsService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('PlaceTypeCensusService');
  }

  /** Distinct stored types (with counts) that the map classifies as neither
   *  kind nor noise. Empty array = the invariant holds. */
  async findUnclassifiedTypes(): Promise<
    Array<{ type: string; places: number }>
  > {
    const rows = await this.prisma.$queryRaw<
      Array<{ type: string; places: number }>
    >`
      SELECT t.value AS type, count(DISTINCT e.entity_id)::int AS places
        FROM core_entities e
        CROSS JOIN LATERAL jsonb_array_elements_text(
          e.restaurant_metadata->'googlePlaces'->'types'
        ) t
       WHERE e.type = 'place'
         AND jsonb_typeof(e.restaurant_metadata->'googlePlaces'->'types') = 'array'
       GROUP BY t.value
    `;
    return rows.filter((row) => !isClassifiedGooglePlaceType(row.type));
  }

  /** Nightly phase: alert on every unclassified stored type. */
  async runNightly(): Promise<void> {
    const unknown = await this.findUnclassifiedTypes();
    if (unknown.length === 0) {
      this.logger.info('Place-type census clean: every stored type classified');
      return;
    }
    for (const { type, places } of unknown) {
      this.opsAlerts.emit({
        severity: 'warn',
        emailOnWarn: true,
        kind: 'place_type_census_unclassified',
        dedupeKey: `place-type-census:${type}`,
        title: `Unclassified Google place type: ${type}`,
        body:
          `Google is sending place type "${type}" (on ${places} grounded ` +
          `restaurant(s)) and google-place-type-attributes.ts classifies it as ` +
          `neither kind nor noise. Google likely shipped a taxonomy change — ` +
          `re-audit per R11 and add it to the attribute map or the ignore set.`,
      });
    }
    this.logger.warn('Place-type census found unclassified types', {
      types: unknown.map((u) => u.type),
    });
  }
}
