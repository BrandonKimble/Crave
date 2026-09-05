import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { identityScope } from '../../../shared/locale';
import { PrismaService } from '../../../prisma/prisma.service';
import { canonicalFold } from './entity-identity';
import { identityGradeSql } from './entity-surface.service';
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
/** A metro anchor: the community's centroid. */
export interface MetroAnchor {
  lat: number;
  lng: number;
}

/**
 * THE ONE METRO-DISTANCE LAW. Great-circle km (haversine) from a location
 * row's lat/lng columns to the anchor. Every place-geography question the
 * adoption ladder asks — the gate's verdict, the local re-resolve, and the
 * judge's recall GEOGRAPHY PRIOR (entity-text-search.service.ts,
 * metroLocalPlaceIds) — is spelled with THIS fragment, so "local" cannot
 * mean two different radii in two different tiers. Recall is never
 * geo-FILTERED (identity is global, owner ruling 2026-09-04): the judge's
 * recall used to hard-filter places by the engine's place-DAG polygon,
 * then for a day by this radius, and either way the judge could not see —
 * let alone weigh — a far candidate that was the real business.
 */
export function metroDistanceKmSql(
  latColumn: Prisma.Sql,
  lngColumn: Prisma.Sql,
  anchor: MetroAnchor,
): Prisma.Sql {
  return Prisma.sql`2 * 6371 * asin(sqrt(
    pow(sin(radians(${latColumn}::float - ${anchor.lat}) / 2), 2)
    + cos(radians(${anchor.lat})) * cos(radians(${latColumn}::float))
    * pow(sin(radians(${lngColumn}::float - ${anchor.lng}) / 2), 2)
  ))`;
}

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
  private readonly communityCache = new Map<
    string,
    { value: string | null; cachedAt: number }
  >();

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
  async anchorForEngine(engineId: string): Promise<MetroAnchor | null> {
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

  /** The community's name — its anchor place's name ("Austin"), the
   *  `community` fact the entity-match judge is shown beside each place
   *  candidate's `location` (identity-is-global ruling, 2026-09-04). Null
   *  = no anchor place. Cached like the anchor: a handful of engines. */
  async communityForEngine(engineId: string): Promise<string | null> {
    const cached = this.communityCache.get(engineId);
    if (
      cached &&
      Date.now() - cached.cachedAt < MetroAdoptionService.ANCHOR_CACHE_TTL_MS
    ) {
      return cached.value;
    }
    const rows = await this.prisma.$queryRaw<Array<{ name: string }>>`
      SELECT p.name
      FROM sources s
      JOIN places p ON p.place_id = s.anchor_place_id
      WHERE s.engine_id::text = ${engineId}
      LIMIT 1
    `;
    const name = rows[0]?.name?.trim() || null;
    this.communityCache.set(engineId, { value: name, cachedAt: Date.now() });
    return name;
  }

  /** Geo verdict per restaurant: 'local' (a geocoded location inside the
   *  metro), 'remote' (geocoded somewhere, none local), or 'unknown' (no
   *  geocoded location anywhere — round-13 F5: 22.7% of active
   *  restaurants are ungrounded; treating them as remote made every
   *  nickname mention of them mint a duplicate. Unknown stands the gate
   *  DOWN, like a missing anchor). */
  async geoVerdicts(
    placeIds: string[],
    anchor: { lat: number; lng: number },
  ): Promise<Map<string, 'local' | 'remote' | 'unknown'>> {
    const verdicts = new Map<string, 'local' | 'remote' | 'unknown'>();
    if (!placeIds.length) {
      return verdicts;
    }
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; local: boolean }>
    >`
      SELECT l.restaurant_id::text AS id,
             bool_or(
               ${metroDistanceKmSql(Prisma.sql`l.latitude`, Prisma.sql`l.longitude`, anchor)}
               < ${MetroAdoptionService.METRO_RADIUS_KM}
             ) AS local
      FROM core_restaurant_locations l
      WHERE l.restaurant_id = ANY(${placeIds}::uuid[])
        AND l.latitude IS NOT NULL
      GROUP BY l.restaurant_id
    `;
    for (const id of placeIds) {
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
      WHERE e.type = 'place' AND e.status <> 'archived'
        AND (
          lower(e.name) = ${needle}
          OR EXISTS (
            SELECT 1 FROM entity_surface s
             WHERE s.entity_id = e.entity_id
               AND ${identityScope('s')}
               -- GRADE LAW (red team 2026-09-03 P1#2): this arm ROUTES a
               -- mention, so a recall-grade guess must not decide it — the
               -- same predicate Tier 2 applies.
               AND ${identityGradeSql('s')}
               AND s.form_folded = ${canonicalFold(surface)}
          )
        )
        AND EXISTS (
          SELECT 1 FROM core_restaurant_locations l
          WHERE l.restaurant_id = e.entity_id
            AND l.latitude IS NOT NULL
            AND ${metroDistanceKmSql(Prisma.sql`l.latitude`, Prisma.sql`l.longitude`, anchor)}
                < ${MetroAdoptionService.METRO_RADIUS_KM}
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
      WHERE type = 'place' AND status <> 'archived'
        AND lower(name) = ANY(${lowered})
      GROUP BY lower(name)
      HAVING count(*) = 1
    `;
    return new Set(rows.map((row) => row.name));
  }
}
