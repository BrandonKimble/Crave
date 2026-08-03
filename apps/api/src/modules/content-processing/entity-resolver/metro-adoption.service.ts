import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';

/**
 * P2.2 — METRO-AWARE ADOPTION (the ruled design, plans/data-audit-2026-08.md).
 *
 * The model: a BRAND ENTITY is global identity; LOCATIONS are a
 * demand-driven cache of where it exists near our communities; TESTIMONY
 * is metro-tagged by its document's community. Resolution maps a surface
 * string written in a metro to a brand — and the ladder decides whether a
 * candidate with NO local presence may still be adopted:
 *
 *   a full exact name can travel across the country;
 *   a nickname can only reach places nearby.
 *
 * Executed evidence behind the rule (2026-08-02, prod): "Rudy's" written
 * in r/austinfood reached "Rudy's Bar & Grill" (NYC) through fold
 * matching — 182 misattributed events; "Franklin Barbecue" written in
 * r/FoodNYC is real testimony about the single global Franklin and must
 * keep adopting remotely.
 */
@Injectable()
export class MetroAdoptionService {
  /** Metro radius around a community's anchor centroid. Structural
   *  plumbing (a metro's extent), not a ranking knob. */
  static readonly METRO_RADIUS_KM = 80;

  private readonly logger: LoggerService;
  private readonly anchorCache = new Map<
    string,
    { value: { lat: number; lng: number } | null; cachedAt: number }
  >();
  private static readonly ANCHOR_CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('MetroAdoptionService');
  }

  /** The community's metro anchor: sources(engine_id) → anchor place
   *  centroid. Null = no geo anchor (the gate then stands down — a
   *  mention with no metro cannot be metro-gated). Cached: a handful of
   *  engines exist. */
  async anchorForEngine(
    engineId: string,
  ): Promise<{ lat: number; lng: number } | null> {
    const cached = this.anchorCache.get(engineId);
    if (
      cached &&
      Date.now() - cached.cachedAt < MetroAdoptionService.ANCHOR_CACHE_TTL_MS
    ) {
      return cached.value;
    }
    const rows = await this.prisma.$queryRaw<
      Array<{ lat: number; lng: number }>
    >`
      SELECT p.centroid_lat::float AS lat, p.centroid_lng::float AS lng
      FROM sources s
      JOIN places p ON p.place_id = s.anchor_place_id
      WHERE s.engine_id::text = ${engineId}
      LIMIT 1
    `;
    const anchor = rows[0] ?? null;
    this.anchorCache.set(engineId, { value: anchor, cachedAt: Date.now() });
    return anchor;
  }

  /** Geo verdict per restaurant: 'local' (a geocoded location inside the
   *  metro), 'remote' (geocoded somewhere, none local), or 'unknown' (no
   *  geocoded location anywhere — round-13 F5: 22.7% of active
   *  restaurants are ungrounded; treating them as remote made every
   *  nickname mention of them mint a duplicate. Unknown stands the gate
   *  DOWN, like a missing anchor). */
  async geoVerdicts(
    restaurantIds: string[],
    anchor: { lat: number; lng: number },
  ): Promise<Map<string, 'local' | 'remote' | 'unknown'>> {
    const verdicts = new Map<string, 'local' | 'remote' | 'unknown'>();
    if (!restaurantIds.length) {
      return verdicts;
    }
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; local: boolean }>
    >`
      SELECT l.restaurant_id::text AS id,
             bool_or(
               2 * 6371 * asin(sqrt(
                 pow(sin(radians(l.latitude::float - ${anchor.lat}) / 2), 2)
                 + cos(radians(${anchor.lat})) * cos(radians(l.latitude::float))
                 * pow(sin(radians(l.longitude::float - ${anchor.lng}) / 2), 2)
               )) < ${MetroAdoptionService.METRO_RADIUS_KM}
             ) AS local
      FROM core_restaurant_locations l
      WHERE l.restaurant_id = ANY(${restaurantIds}::uuid[])
        AND l.latitude IS NOT NULL
      GROUP BY l.restaurant_id
    `;
    for (const id of restaurantIds) {
      verdicts.set(id, 'unknown');
    }
    for (const row of rows) {
      verdicts.set(row.id, row.local ? 'local' : 'remote');
    }
    return verdicts;
  }

  /** Local re-resolve (round-13 F4): before demoting, look for a
   *  LOCALLY-PRESENT active restaurant carrying the surface as its name
   *  or an alias — "resolve locally" must mean resolve, not mint. */
  async findLocalByNameOrAlias(
    surface: string,
    anchor: { lat: number; lng: number },
  ): Promise<string | null> {
    const needle = surface.toLowerCase().trim();
    if (!needle) {
      return null;
    }
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT e.entity_id::text AS id
      FROM core_entities e
      WHERE e.type = 'restaurant' AND e.status <> 'archived'
        AND (
          lower(e.name) = ${needle}
          OR EXISTS (
            SELECT 1 FROM unnest(e.aliases) a WHERE lower(a) = ${needle}
          )
        )
        AND EXISTS (
          SELECT 1 FROM core_restaurant_locations l
          WHERE l.restaurant_id = e.entity_id
            AND l.latitude IS NOT NULL
            AND 2 * 6371 * asin(sqrt(
                  pow(sin(radians(l.latitude::float - ${anchor.lat}) / 2), 2)
                  + cos(radians(${anchor.lat})) * cos(radians(l.latitude::float))
                  * pow(sin(radians(l.longitude::float - ${anchor.lng}) / 2), 2)
                )) < ${MetroAdoptionService.METRO_RADIUS_KM}
        )
      ORDER BY e.created_at
      LIMIT 1
    `;
    return rows[0]?.id ?? null;
  }

  /** Names (lowered) that belong to exactly ONE active restaurant
   *  globally — the "single global candidate" arm of the exact-name
   *  remote-adoption rule. */
  async globallyUniqueExactNames(names: string[]): Promise<Set<string>> {
    const lowered = Array.from(
      new Set(names.map((name) => name.toLowerCase().trim()).filter(Boolean)),
    );
    if (!lowered.length) {
      return new Set();
    }
    const rows = await this.prisma.$queryRaw<Array<{ name: string }>>`
      SELECT lower(name) AS name
      FROM core_entities
      WHERE type = 'restaurant' AND status <> 'archived'
        AND lower(name) = ANY(${lowered})
      GROUP BY lower(name)
      HAVING count(*) = 1
    `;
    return new Set(rows.map((row) => row.name));
  }
}
