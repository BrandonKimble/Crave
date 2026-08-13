import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { identityScope } from '../../shared/locale';
import { PrismaService } from '../../prisma/prisma.service';
import { canonicalFold } from '../content-processing/entity-resolver/entity-identity';
import { LoggerService } from '../../shared';
import type {
  ContextOptionId,
  CravingOptionId,
  CuisineOptionId,
  LiveCityValue,
} from '@crave-search/shared';

/**
 * The onboarding teaser: the pre-auth, pre-paywall "first answer" payload
 * (business/signal/teaser-spec.md). Deliberately NOT the search stack — this
 * surface is public (no Clerk, no entitlement), so it exposes only a fixed,
 * trimmed, cacheable composition: top-3 scored dishes for one of the user's
 * declared go-to cravings inside their live city.
 *
 * Ranking mirrors product semantics: connections ordered by score percentile
 * (never the rounded display value), expanded one category hop like search,
 * with a minimum-mentions floor standing in for the unbuilt evidence floor so
 * a 2-opinion 9.9 can never headline the first thing a user ever sees.
 */

/**
 * OWNER RULING 2026-08-02 (F109/D7): the only numbers the teaser may show are
 * the ones a real restaurant card shows — the Crave score, read from
 * core_public_entity_scores by the same path the card uses. Every other count
 * or numeric claim is deleted, not hidden: `mentionCount`, `totalUpvotes` and
 * the payload's `totalCount` are gone from the wire, so no future surface can
 * quietly start rendering them.
 */
export interface TeaserRow {
  dishName: string;
  restaurantName: string;
  score: number;
}

export interface TeaserRestaurantRow {
  restaurantName: string;
  score: number;
}

export interface TeaserRestaurantSet {
  /** 'context' frames the set as an occasion list ("date-night"); 'cuisine' as
   *  a cuisine shortlist ("Mexican"). */
  kind: 'context' | 'cuisine';
  frame: string;
  rows: TeaserRestaurantRow[];
}

export interface TeaserPreviewPayload {
  source: 'dish' | 'browse';
  dishLabel: string | null;
  city: string;
  top: TeaserRow;
  runners: TeaserRow[];
  restaurants: TeaserRestaurantSet | null;
}

/**
 * ONE RECORD PER DISH. This used to be two parallel records keyed by the same
 * eleven ids (`DISH_ID_TERMS` + `DISH_ID_LABELS`) — the repo's own type-list
 * disease: adding a dish meant editing two literals and nothing caught a miss.
 *
 * Keyed by the SHARED craving vocabulary (packages/shared), which the mobile
 * onboarding quiz builds its options from — so a renamed option id is a
 * compile error here instead of a teaser that silently degrades to browse.
 *
 * Partial on purpose: brunch / salad-bowls / sweets are meal-period and
 * category concepts, not dish entities. They have no terms, and the fallback
 * chain absorbs them.
 */
export const DISHES_BY_CRAVING_ID: Partial<
  Record<CravingOptionId, { terms: string[]; label: string }>
> = {
  pizza: { terms: ['pizza'], label: 'pizza' },
  tacos: { terms: ['taco', 'tacos'], label: 'tacos' },
  burgers: { terms: ['burger', 'burgers'], label: 'burgers' },
  sushi: { terms: ['sushi'], label: 'sushi' },
  ramen: { terms: ['ramen'], label: 'ramen' },
  wings: { terms: ['wings', 'chicken wings'], label: 'wings' },
  'fried-chicken': { terms: ['fried chicken'], label: 'fried chicken' },
  pasta: { terms: ['pasta'], label: 'pasta' },
  dumplings: { terms: ['dumpling', 'dumplings'], label: 'dumplings' },
  bbq: { terms: ['bbq', 'barbecue', 'brisket'], label: 'BBQ' },
  steak: { terms: ['steak'], label: 'steak' },
};

/** contexts quiz id → mined restaurant-attribute names, in SELECTIVITY order
 *  (most differentiating first — 'good for groups' covers ~a quarter of a city,
 *  so it comes last; business/solo have no attribute and are omitted). */
export const CONTEXT_ATTR_NAMES: Array<{
  contextId: ContextOptionId;
  attrName: string;
  frame: string;
}> = [
  { contextId: 'date-nights', attrName: 'romantic', frame: 'date-night' },
  {
    contextId: 'special-occasions',
    attrName: 'celebratory',
    frame: 'special-occasion',
  },
  { contextId: 'family', attrName: 'family-friendly', frame: 'family-dinner' },
  {
    contextId: 'group-hangs',
    attrName: 'good for groups',
    frame: 'group-night',
  },
];

/** cuisines quiz id → restaurant-attribute name + display label. Partial:
 *  'coffee' has no restaurant attribute to shortlist on. */
export const CUISINE_ATTRS: Partial<
  Record<CuisineOptionId, { attrName: string; label: string }>
> = {
  mexican: { attrName: 'mexican', label: 'Mexican' },
  bbq: { attrName: 'barbecue', label: 'BBQ' },
  japanese: { attrName: 'japanese', label: 'Japanese' },
  italian: { attrName: 'italian', label: 'Italian' },
  mediterranean: { attrName: 'mediterranean', label: 'Mediterranean' },
  american: { attrName: 'american', label: 'American' },
  asian: { attrName: 'asian', label: 'Asian' },
};

/** Live-city onboarding value → location city names in core_restaurant_locations. */
export const CITY_LOCATION_NAMES: Record<LiveCityValue, string[]> = {
  Austin: ['Austin'],
  'New York': [
    'Manhattan',
    'Brooklyn',
    'Queens',
    'Bronx',
    'Staten Island',
    'New York',
  ],
};

/** Evidence floor for the teaser (the global evidence floor is unbuilt; the
 *  first score a user ever sees must not be a 2-opinion artifact). */
const MIN_MENTIONS = 3;
/** A dish query must produce at least this many rows to headline. */
const MIN_RESULTS = 3;
/**
 * The teaser's display ceiling for a score, declared ONCE. It was written as a
 * bare `9.9` at two call sites in this file, which is two places for a
 * presentation rule to drift from itself.
 */
export const TEASER_SCORE_CEILING = 9.9;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class TeaserService {
  private readonly cache = new Map<
    string,
    { at: number; payload: TeaserPreviewPayload | null }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async preview(
    city: string,
    dishIds: string[],
    contextIds: string[] = [],
    cuisineIds: string[] = [],
  ): Promise<TeaserPreviewPayload | null> {
    const cities = CITY_LOCATION_NAMES[city as LiveCityValue] as
      | string[]
      | undefined;
    if (!cities) {
      return null;
    }

    let base: TeaserPreviewPayload | null = null;
    const orderedDishIds = dishIds.filter(
      (id): id is CravingOptionId =>
        DISHES_BY_CRAVING_ID[id as CravingOptionId] !== undefined,
    );
    for (const dishId of orderedDishIds) {
      const cacheKey = `${city}:${dishId}`;
      base = await this.cached(cacheKey, () =>
        this.dishPreview(city, cities, dishId),
      );
      if (base) {
        break;
      }
    }
    if (!base) {
      // Fallback: the city's best dishes overall — always non-empty in a live city.
      base = await this.cached(`${city}:__browse`, () =>
        this.browsePreview(city, cities),
      );
    }
    if (!base) {
      return null;
    }

    const restaurants = await this.restaurantSet(
      city,
      cities,
      contextIds,
      cuisineIds,
    );
    return { ...base, restaurants };
  }

  /** The second set: restaurants framed by the user's declared occasion, with a
   *  specificity ladder — context∧cuisine (the dream: "Fonda San Miguel for date
   *  night") → context alone → cuisine alone — first rung with ≥3 rows wins. */
  private async restaurantSet(
    city: string,
    cities: string[],
    contextIds: string[],
    cuisineIds: string[],
  ): Promise<TeaserRestaurantSet | null> {
    const context = CONTEXT_ATTR_NAMES.find((entry) =>
      contextIds.includes(entry.contextId),
    );
    const cuisine = cuisineIds
      .map((id) => CUISINE_ATTRS[id as CuisineOptionId])
      .find(Boolean);
    const key = `${city}:rs:${context?.contextId ?? '-'}:${cuisine?.attrName ?? '-'}`;

    const setPayload = await this.cachedRestaurantSet(key, async () => {
      if (context && cuisine) {
        const rows = await this.topRestaurantsByAttrs(cities, [
          context.attrName,
          cuisine.attrName,
        ]);
        if (rows.length >= MIN_RESULTS) {
          return { kind: 'context' as const, frame: context.frame, rows };
        }
      }
      if (context) {
        const rows = await this.topRestaurantsByAttrs(cities, [
          context.attrName,
        ]);
        if (rows.length >= MIN_RESULTS) {
          return { kind: 'context' as const, frame: context.frame, rows };
        }
      }
      if (cuisine) {
        const rows = await this.topRestaurantsByAttrs(cities, [
          cuisine.attrName,
        ]);
        if (rows.length >= MIN_RESULTS) {
          return { kind: 'cuisine' as const, frame: cuisine.label, rows };
        }
      }
      return null;
    });
    return setPayload;
  }

  private readonly restaurantSetCache = new Map<
    string,
    { at: number; payload: TeaserRestaurantSet | null }
  >();

  private async cachedRestaurantSet(
    key: string,
    build: () => Promise<TeaserRestaurantSet | null>,
  ): Promise<TeaserRestaurantSet | null> {
    const hit = this.restaurantSetCache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return hit.payload;
    }
    const payload = await build();
    this.restaurantSetCache.set(key, { at: Date.now(), payload });
    return payload;
  }

  /** Top restaurants carrying ALL named active attributes, in the city, by
   *  restaurant score percentile. */
  private async topRestaurantsByAttrs(
    cities: string[],
    attrNames: string[],
  ): Promise<TeaserRestaurantRow[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ restaurant_name: string; score: number }>
    >(Prisma.sql`
      WITH attrs AS (
        SELECT array_agg(entity_id) AS ids, count(*) AS found
        FROM core_entities
        WHERE type = 'restaurant_attribute' AND status = 'active'
          AND lower(name) = ANY(${attrNames.map((n) => n.toLowerCase())})
      )
      SELECT r.name AS restaurant_name, s.display_score::float AS score
      FROM core_entities r
      JOIN core_public_entity_scores s
        ON s.subject_type = 'restaurant' AND s.subject_id = r.entity_id
      WHERE r.type = 'restaurant' AND r.status = 'active'
        AND (SELECT found FROM attrs) = ${attrNames.length}
        AND r.restaurant_attributes @> (SELECT ids FROM attrs)
        AND EXISTS (
          SELECT 1 FROM core_restaurant_locations l
          WHERE l.restaurant_id = r.entity_id AND l.city = ANY(${cities})
        )
      ORDER BY s.percentile_rank DESC
      LIMIT 3
    `);
    return rows.map((row) => ({
      restaurantName: row.restaurant_name,
      score: Math.min(row.score, TEASER_SCORE_CEILING),
    }));
  }

  private async cached(
    key: string,
    build: () => Promise<TeaserPreviewPayload | null>,
  ): Promise<TeaserPreviewPayload | null> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return hit.payload;
    }
    const payload = await build();
    this.cache.set(key, { at: Date.now(), payload });
    return payload;
  }

  private async dishPreview(
    city: string,
    cities: string[],
    dishId: CravingOptionId,
  ): Promise<TeaserPreviewPayload | null> {
    const dish = DISHES_BY_CRAVING_ID[dishId];
    if (!dish) {
      return null;
    }
    const foodIds = await this.resolveFoodIds(dish.terms);
    if (foodIds.length === 0) {
      return null;
    }

    const rows = await this.topConnections(cities, foodIds);
    if (rows.length < MIN_RESULTS) {
      return null;
    }
    return {
      source: 'dish',
      dishLabel: dish.label,
      city,
      top: rows[0],
      runners: rows.slice(1, 3),
      restaurants: null,
    };
  }

  private async browsePreview(
    city: string,
    cities: string[],
  ): Promise<TeaserPreviewPayload | null> {
    const rows = await this.topConnections(cities, null);
    if (rows.length === 0) {
      this.logger.warn(`Teaser browse fallback empty for city ${city}`);
      return null;
    }
    return {
      source: 'browse',
      dishLabel: null,
      city,
      top: rows[0],
      runners: rows.slice(1, 3),
      restaurants: null,
    };
  }

  /** Exact name/alias match on active food entities, expanded one category hop
   *  (derived_food_category_edges), mirroring search's expansion law. */
  private async resolveFoodIds(terms: string[]): Promise<string[]> {
    // The surface arm compares CANONICAL FOLDS on both sides (form_folded is
    // app-written by the one fold implementation); the name arm keeps its
    // existing lower() semantics so this change is the surface read and
    // nothing else.
    const foldedTerms = Array.from(
      new Set(terms.map((term) => canonicalFold(term)).filter(Boolean)),
    );
    const rows = await this.prisma.$queryRaw<
      Array<{ entity_id: string }>
    >(Prisma.sql`
      SELECT e.entity_id
      FROM core_entities e
      WHERE e.type = 'food'
        AND e.status = 'active'
        AND (
          lower(e.name) = ANY(${terms})
          OR EXISTS (
            SELECT 1 FROM entity_surface s
             WHERE s.entity_id = e.entity_id
               AND ${identityScope('s')}
               AND s.form_folded = ANY(${foldedTerms})
          )
        )
    `);
    const baseIds = rows.map((r) => r.entity_id);
    if (baseIds.length === 0) {
      return [];
    }
    const members = await this.prisma.$queryRaw<
      Array<{ food_id: string }>
    >(Prisma.sql`
      SELECT DISTINCT food_id
      FROM derived_food_category_edges
      WHERE category_id = ANY(${baseIds}::uuid[])
    `);
    return Array.from(new Set([...baseIds, ...members.map((m) => m.food_id)]));
  }

  private connectionFilter(
    cities: string[],
    foodIds: string[] | null,
  ): Prisma.Sql {
    const foodClause = foodIds
      ? Prisma.sql`AND ci.food_id = ANY(${foodIds}::uuid[])`
      : Prisma.empty;
    return Prisma.sql`
      FROM core_restaurant_items ci
      JOIN core_public_entity_scores s
        ON s.subject_type = 'connection' AND s.subject_id = ci.connection_id
      JOIN core_entities f ON f.entity_id = ci.food_id AND f.status = 'active'
      JOIN core_entities r ON r.entity_id = ci.restaurant_id AND r.status = 'active'
      WHERE ci.mention_count >= ${MIN_MENTIONS}
        -- Rollup rows are parents of real dishes, never dishes themselves.
        AND NOT ci.is_category_item
        ${foodClause}
        AND EXISTS (
          SELECT 1 FROM core_restaurant_locations l
          WHERE l.restaurant_id = ci.restaurant_id AND l.city = ANY(${cities})
        )
    `;
  }

  private async topConnections(
    cities: string[],
    foodIds: string[] | null,
  ): Promise<TeaserRow[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        dish_name: string;
        restaurant_name: string;
        score: number;
      }>
    >(Prisma.sql`
      SELECT f.name AS dish_name,
             r.name AS restaurant_name,
             s.display_score::float AS score
      ${this.connectionFilter(cities, foodIds)}
      ORDER BY s.percentile_rank DESC
      LIMIT 3
    `);
    return rows.map((row) => ({
      dishName: row.dish_name,
      restaurantName: row.restaurant_name,
      score: Math.min(row.score, TEASER_SCORE_CEILING),
    }));
  }
}
