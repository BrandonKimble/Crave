import { isEnvFlagExplicitlyDisabled } from '../../shared/config/env-flag';
/**
 * CURATED LIST BUILDER (plans/home-surface-charter.md) — the worker-side
 * materializer for the home surface's app-curated lists.
 *
 * Cities = places with collection sources anchored (sources.anchor_place_id,
 * platform != 'poll_surface' — poll_surface rows are the per-place poll
 * mouth, not corpus collection). Never hardcoded.
 *
 * Every recipe ranks by the PUBLIC crave score read surface
 * (core_public_entity_scores: display_score / percentile_rank / rising) —
 * the same table the search surface reads; no new score path. Membership
 * data (mention volumes, medians) comes from core_restaurant_items
 * mention_count, the measured evidence projection.
 *
 * Rotation law: a build for rotation R of (city, recipe, owner) deletes
 * every other rotation of that tuple IN THE SAME TRANSACTION (supersede is
 * atomic; readers only ever see exactly one rotation per tuple).
 *
 * Scheduling: @Cron registers only in the worker runtime by construction —
 * app.module gates ScheduleModule.forRoot() on isSchedulerRuntime(), so no
 * per-service role guard is needed (stop-crons.ts chokepoint doctrine).
 */
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { parseOnboardingAnswers } from '@crave-search/shared';
import { activeRestaurantEventCountSql } from '../content-processing/reddit-collector/extraction-scope.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { LiveCitiesReader, type LiveCity } from '../places/live-cities.reader';
import { TASTE_WINDOW_ALL_DAYS } from '../signals/user-taste-profile.builder';
import {
  CONTEXT_RECIPES,
  HIDDEN_GEMS_EVIDENCE_FLOOR,
  ICON_CUISINE,
  ICON_DISH,
  ICON_HIDDEN_GEMS,
  ICON_TRENDING,
  ICON_WEEKLY_TASTING,
  MAX_LIST_ITEMS,
  MIN_VIABLE_LIST_ITEMS,
  ONBOARDING_CUISINE_ATTRIBUTE_NAMES,
  PERSONAL_RECIPE_INPUTS,
  RECIPE_CUISINE_BEST_PREFIX,
  RECIPE_DISH_BEST_PREFIX,
  RECIPE_HIDDEN_GEMS,
  RECIPE_TRENDING,
  RECIPE_WEEKLY_TASTING,
  dailyRotationKey,
  monthLabel,
  monthlyRotationKey,
  weeklyRotationKey,
} from './curated-lists.constants';

interface CityRestaurantRow {
  entity_id: string;
  name: string;
  restaurant_attributes: string[];
  mention_volume: number;
  display_score: number;
  percentile_rank: number;
  rising: number | null;
}

interface CityDishRow {
  connection_id: string;
  food_id: string;
  food_name: string;
  restaurant_id: string;
  mention_count: number;
  display_score: number;
  percentile_rank: number;
}

interface ListDraft {
  recipeKey: string;
  scope: 'global' | 'personal';
  ownerUserId: string | null;
  listType: 'restaurant' | 'dish';
  title: string;
  subtitle: string | null;
  iconKey: string;
  rotationKey: string;
  items: Array<{
    entityId: string;
    restaurantId: string | null;
    /** Dish items: the connection id — a build fact straight from the dish
     *  read (which selects FROM core_restaurant_items). Restaurant items: null. */
    connectionId: string | null;
  }>;
}

@Injectable()
export class CuratedListBuilderService {
  private readonly logger: LoggerService;
  private buildInFlight = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly liveCitiesReader: LiveCitiesReader,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('CuratedListBuilderService');
  }

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async scheduledBuild(): Promise<void> {
    if (isEnvFlagExplicitlyDisabled(process.env.CURATED_LISTS_BUILD_ENABLED)) {
      return;
    }
    if (this.buildInFlight) {
      this.logger.warn('Curated list build already running; skipping tick');
      return;
    }
    this.buildInFlight = true;
    try {
      await this.buildAll();
    } catch (error) {
      this.logger.error('Curated list build failed', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
    } finally {
      this.buildInFlight = false;
    }
  }

  async buildAll(now: Date = new Date()): Promise<{
    cities: number;
    lists: number;
  }> {
    const started = Date.now();
    const cities = await this.liveCities();
    let lists = 0;
    for (const city of cities) {
      lists += await this.buildCity(city, now);
    }
    lists += await this.buildPersonalWeekly(cities, now);
    this.logger.info('Curated list build complete', {
      cities: cities.length,
      lists,
      ms: Date.now() - started,
    });
    return { cities: cities.length, lists };
  }

  /**
   * Live cities — the definition now lives in LiveCitiesReader, because the
   * onboarding write path needs the SAME one to turn the user's chosen city
   * into a key (D40 §1.4). Two queries that happen to look alike is how the
   * name-match join became a silent zero.
   */
  liveCities(): Promise<LiveCity[]> {
    return this.liveCitiesReader.liveCities();
  }

  /** One city pass: fetch candidates once, run every global recipe in TS. */
  async buildCity(city: LiveCity, now: Date): Promise<number> {
    const restaurants = await this.cityRestaurants(city.placeId);
    if (!restaurants.length) {
      return 0;
    }
    const dishes = await this.cityDishes(
      restaurants.map((row) => row.entity_id),
    );
    const cuisineAttributeIds = await this.cuisineAttributeIds();
    const attributeNames = await this.attributeNameMap(restaurants);

    const drafts: ListDraft[] = [
      ...this.buildCuisineLists(
        city,
        restaurants,
        cuisineAttributeIds,
        attributeNames,
        now,
      ),
      ...this.buildDishLists(city, dishes, now),
      ...this.buildTrendingList(city, restaurants, now),
      ...this.buildHiddenGemsList(city, restaurants, now),
      ...this.buildContextLists(city, restaurants, attributeNames, now),
    ];

    for (const draft of drafts) {
      await this.persistList(city.placeId, draft, now);
    }
    return drafts.length;
  }

  // ---------- global recipes (pure functions over the candidate rows) ----------

  /**
   * Recipe 1 — cuisine best-ofs. Cuisine identity = the attribute ids the
   * cuisine-extraction pipeline recorded (restaurant_metadata->
   * 'cuisineExtraction'->'attributeIds' — the measured cuisine subset of the
   * open restaurant_attributes vocabulary). Cuisines rank by MEASURED
   * mention volume (sum of the member restaurants' connection
   * mention_count); members rank by the public crave score percentile.
   */
  private buildCuisineLists(
    city: LiveCity,
    restaurants: CityRestaurantRow[],
    cuisineAttributeIds: Set<string>,
    attributeNames: Map<string, { name: string; aliases: string[] }>,
    now: Date,
  ): ListDraft[] {
    const byCuisine = new Map<string, CityRestaurantRow[]>();
    for (const row of restaurants) {
      for (const attrId of new Set(row.restaurant_attributes)) {
        if (!cuisineAttributeIds.has(attrId)) {
          continue;
        }
        const bucket = byCuisine.get(attrId);
        if (bucket) {
          bucket.push(row);
        } else {
          byCuisine.set(attrId, [row]);
        }
      }
    }
    const ranked = [...byCuisine.entries()]
      .map(([attrId, members]) => ({
        attrId,
        members,
        volume: members.reduce((sum, row) => sum + row.mention_volume, 0),
      }))
      .filter(({ members }) => members.length >= MIN_VIABLE_LIST_ITEMS)
      // UNCAPPED (owner-ratified 2026-07-26): every cuisine that clears the
      // min-viable gate earns its list; volume order is presentation only.
      .sort((a, b) => b.volume - a.volume);
    return ranked.flatMap(({ attrId, members }) => {
      const attribute = attributeNames.get(attrId);
      if (!attribute) {
        return [];
      }
      const items = this.rankByScore(members);
      const label = titleCase(attribute.name);
      return [
        {
          recipeKey: `${RECIPE_CUISINE_BEST_PREFIX}${attrId}`,
          scope: 'global' as const,
          ownerUserId: null,
          listType: 'restaurant' as const,
          title: `Best ${label} in ${city.name}`,
          subtitle: `The top-scored ${label} spots in ${city.name}`,
          iconKey: ICON_CUISINE,
          rotationKey: dailyRotationKey(now),
          items,
        },
      ];
    });
  }

  /**
   * Recipe 2 — dish best-ofs: top dishes by measured mention volume; for
   * each, the restaurants serving it ranked by the CONNECTION public score
   * (the same dish→restaurant ranked read search runs). Monthly rotation —
   * the "Best breakfast taco — July" title variant is the rotation itself.
   */
  private buildDishLists(
    city: LiveCity,
    dishes: CityDishRow[],
    now: Date,
  ): ListDraft[] {
    const byFood = new Map<string, CityDishRow[]>();
    for (const row of dishes) {
      const bucket = byFood.get(row.food_id);
      if (bucket) {
        bucket.push(row);
      } else {
        byFood.set(row.food_id, [row]);
      }
    }
    const ranked = [...byFood.values()]
      .map((rows) => ({
        rows,
        volume: rows.reduce((sum, row) => sum + row.mention_count, 0),
      }))
      .filter(({ rows }) => rows.length >= MIN_VIABLE_LIST_ITEMS)
      // UNCAPPED (owner-ratified 2026-07-26): every dish that clears the
      // min-viable gate earns its monthly list.
      .sort((a, b) => b.volume - a.volume);
    return ranked.map(({ rows }) => {
      const sorted = [...rows]
        .sort((a, b) => b.percentile_rank - a.percentile_rank)
        .slice(0, MAX_LIST_ITEMS);
      const foodName = titleCase(sorted[0].food_name);
      return {
        recipeKey: `${RECIPE_DISH_BEST_PREFIX}${sorted[0].food_id}`,
        scope: 'global' as const,
        ownerUserId: null,
        listType: 'dish' as const,
        title: `Best ${foodName} in ${city.name} — ${monthLabel(now)}`,
        subtitle: `Where ${city.name} eats its ${foodName.toLowerCase()} this month`,
        iconKey: ICON_DISH,
        rotationKey: monthlyRotationKey(now),
        items: sorted.map((row) => ({
          entityId: row.food_id,
          restaurantId: row.restaurant_id,
          connectionId: row.connection_id,
        })),
      };
    });
  }

  /**
   * Recipe 3 — Trending: ranked by the score's existing rising/surge
   * component (core_public_entity_scores.rising: rawDisplayFast −
   * rawDisplayStable — the measured recent-vs-baseline surge that powers
   * the search Rising sort). Only genuinely-rising rows (> 0) qualify.
   */
  private buildTrendingList(
    city: LiveCity,
    restaurants: CityRestaurantRow[],
    now: Date,
  ): ListDraft[] {
    const rising = restaurants
      .filter((row) => row.rising !== null && row.rising > 0)
      .sort((a, b) => (b.rising ?? 0) - (a.rising ?? 0))
      .slice(0, MAX_LIST_ITEMS);
    if (rising.length < MIN_VIABLE_LIST_ITEMS) {
      return [];
    }
    return [
      {
        recipeKey: RECIPE_TRENDING,
        scope: 'global',
        ownerUserId: null,
        listType: 'restaurant',
        title: `Trending in ${city.name}`,
        subtitle: 'Rising fastest right now',
        iconKey: ICON_TRENDING,
        rotationKey: dailyRotationKey(now),
        items: rising.map((row) => ({
          entityId: row.entity_id,
          restaurantId: null,
          connectionId: null,
        })),
      },
    ];
  }

  /**
   * Recipe 4 — Hidden Gems: high display score, mention volume strictly
   * below the city median measured over the CREDIBLE population (rows at or
   * above the evidence floor), with the K1-UNRATIFIED evidence floor.
   * Measured 2026-07-26: the whole-population median sits BELOW the floor
   * (the catalog's long tail is 1-mention enrichment rows), which made
   * "below median AND above floor" structurally empty — a gem is
   * great-but-modestly-discussed relative to restaurants that have a real
   * discussion footprint, not relative to the tail.
   */
  private buildHiddenGemsList(
    city: LiveCity,
    restaurants: CityRestaurantRow[],
    now: Date,
  ): ListDraft[] {
    const credible = restaurants.filter(
      (row) => row.mention_volume >= HIDDEN_GEMS_EVIDENCE_FLOOR,
    );
    const median = medianOf(credible.map((row) => row.mention_volume));
    if (median === null) {
      return [];
    }
    const gems = credible
      .filter((row) => row.mention_volume < median)
      .sort(
        (a, b) =>
          b.display_score - a.display_score ||
          b.percentile_rank - a.percentile_rank,
      )
      .slice(0, MAX_LIST_ITEMS);
    if (gems.length < MIN_VIABLE_LIST_ITEMS) {
      return [];
    }
    return [
      {
        recipeKey: RECIPE_HIDDEN_GEMS,
        scope: 'global',
        ownerUserId: null,
        listType: 'restaurant',
        title: `Hidden gems of ${city.name}`,
        subtitle: 'Loved hard, talked about little',
        iconKey: ICON_HIDDEN_GEMS,
        rotationKey: dailyRotationKey(now),
        items: gems.map((row) => ({
          entityId: row.entity_id,
          restaurantId: null,
          connectionId: null,
        })),
      },
    ];
  }

  /**
   * Recipe 5 — context lists from extracted restaurant attribute tags:
   * membership = the restaurant carries an attribute whose name/alias
   * matches the recipe vocabulary; ranking = public score. Built only when
   * the city has enough qualifying items (the same min-viable gate).
   */
  private buildContextLists(
    city: LiveCity,
    restaurants: CityRestaurantRow[],
    attributeNames: Map<string, { name: string; aliases: string[] }>,
    now: Date,
  ): ListDraft[] {
    const drafts: ListDraft[] = [];
    for (const recipe of CONTEXT_RECIPES) {
      const vocabulary = new Set(
        recipe.attributeNames.map((name) => name.toLowerCase()),
      );
      const matchingAttrIds = new Set<string>();
      for (const [attrId, attribute] of attributeNames) {
        const names = [attribute.name, ...attribute.aliases].map((value) =>
          value.toLowerCase(),
        );
        if (names.some((value) => vocabulary.has(value))) {
          matchingAttrIds.add(attrId);
        }
      }
      if (!matchingAttrIds.size) {
        continue;
      }
      const members = restaurants.filter((row) =>
        row.restaurant_attributes.some((attrId) => matchingAttrIds.has(attrId)),
      );
      if (members.length < MIN_VIABLE_LIST_ITEMS) {
        continue;
      }
      drafts.push({
        recipeKey: recipe.recipeKey,
        scope: 'global',
        ownerUserId: null,
        listType: 'restaurant',
        title: `${recipe.title} in ${city.name}`,
        subtitle: null,
        iconKey: recipe.iconKey,
        rotationKey: dailyRotationKey(now),
        items: this.rankByScore(members),
      });
    }
    return drafts;
  }

  // ---------- personal weekly rotator ----------

  /**
   * 'your_weekly_tasting' — declared input 'both' (D40 §4): untried dishes
   * from the cuisines this user LIKES, weekly rotation.
   *
   * "Cuisines they like" is the union of two declared sources, and the union
   * is the point:
   *   - SEED: the onboarding answers, read through the SHARED DECODER — the
   *     only thing allowed to read a stored answer document. The hand-spelled
   *     `responses.cuisines` this replaced was a silent zero waiting for a
   *     rename.
   *   - BEHAVIOR: the derived taste profile's attribute roll-up — the mined
   *     restaurant attributes this actor has actually acted on. It ADDS
   *     cuisines the answers never named (the "new and fresh" requirement)
   *     and can never delete a declared one.
   *
   * City comes from `onboarding_city_place_id`, a KEY resolved once at write
   * time. The `lower(name)` join it replaces produced no lists and no error
   * for a renamed or re-cased city.
   *
   * 'Untried' proxy (the weakest honest one available, documented): no
   * user-list item on the connection/restaurant, and no recorded act on the
   * food/restaurant/connection subject. The act half now comes from the taste
   * profile instead of this file's own `signals` query — same facts, one
   * dialect, and the profile knows about echo exclusion and act grain, which
   * the bespoke query did not.
   *
   * ALWAYS-GREEN DEFENCE: every `continue` below increments a NAMED skip
   * counter and the whole breakdown is logged. "Built 0 lists" used to be
   * indistinguishable from "there are no users"; now the reason is a number.
   */
  async buildPersonalWeekly(cities: LiveCity[], now: Date): Promise<number> {
    const weekKey = weeklyRotationKey(now);
    const cityByPlaceId = new Map(cities.map((city) => [city.placeId, city]));
    const skips = {
      noLiveCity: 0,
      alreadyBuiltThisWeek: 0,
      noPreferredCuisines: 0,
      noMatchingAttributes: 0,
      tooFewCandidates: 0,
      tooFewUntried: 0,
      droppedOptionIds: 0,
    };
    const users = await this.prisma.user.findMany({
      where: {
        onboardingStatus: 'completed',
        deletedAt: null,
      },
      select: {
        userId: true,
        onboardingCityPlaceId: true,
        onboardingQuestionSetVersion: true,
        onboardingResponses: true,
      },
    });
    // Idempotence within the week: a (city, user) pair already carrying the
    // current week's rotation is not rebuilt (mid-week churn would defeat
    // the "weekly drop" ritual).
    const existing = await this.prisma.curatedList.findMany({
      where: { recipeKey: RECIPE_WEEKLY_TASTING, rotationKey: weekKey },
      select: { cityPlaceId: true, ownerUserId: true },
    });
    const alreadyBuilt = new Set(
      existing.map((row) => `${row.cityPlaceId}:${row.ownerUserId}`),
    );

    const dishCacheByCity = new Map<string, CityDishRow[]>();
    const restaurantCacheByCity = new Map<string, CityRestaurantRow[]>();
    let built = 0;
    for (const user of users) {
      const city = user.onboardingCityPlaceId
        ? cityByPlaceId.get(user.onboardingCityPlaceId)
        : undefined;
      if (!city) {
        skips.noLiveCity += 1;
        continue;
      }
      if (alreadyBuilt.has(`${city.placeId}:${user.userId}`)) {
        skips.alreadyBuiltThisWeek += 1;
        continue;
      }
      // THE DECODER IS THE ONLY READER of a stored answer document.
      const decoded = parseOnboardingAnswers(
        user.onboardingQuestionSetVersion,
        user.onboardingResponses,
      );
      skips.droppedOptionIds += decoded.droppedOptionIds.length;
      const cuisineOptionIds = decoded.answers.cuisines;
      const behavioralAttributeIds = await this.behavioralAttributeIds(
        user.userId,
      );
      if (!cuisineOptionIds.length && !behavioralAttributeIds.size) {
        skips.noPreferredCuisines += 1;
        continue;
      }
      let restaurants = restaurantCacheByCity.get(city.placeId);
      if (!restaurants) {
        restaurants = await this.cityRestaurants(city.placeId);
        restaurantCacheByCity.set(city.placeId, restaurants);
      }
      let dishes = dishCacheByCity.get(city.placeId);
      if (!dishes) {
        dishes = await this.cityDishes(restaurants.map((row) => row.entity_id));
        dishCacheByCity.set(city.placeId, dishes);
      }
      const attributeNames = await this.attributeNameMap(restaurants);
      const preferredNames = new Set(
        cuisineOptionIds.flatMap((id) =>
          (ONBOARDING_CUISINE_ATTRIBUTE_NAMES[id] ?? []).map((name) =>
            name.toLowerCase(),
          ),
        ),
      );
      // SEED ∪ BEHAVIOR. Behavior adds attribute ids the seed's name bridge
      // never resolved; it removes nothing.
      const preferredAttrIds = new Set<string>(behavioralAttributeIds);
      for (const [attrId, attribute] of attributeNames) {
        const names = [attribute.name, ...attribute.aliases].map((value) =>
          value.toLowerCase(),
        );
        if (names.some((value) => preferredNames.has(value))) {
          preferredAttrIds.add(attrId);
        }
      }
      if (!preferredAttrIds.size) {
        // The recipe/vocabulary bridge missed entirely: the user named
        // cuisines and none of them resolved to a live mined attribute. That
        // is the ONBOARDING_CUISINE_ATTRIBUTE_NAMES drift class, and it is
        // now a counted fact rather than an empty shelf.
        skips.noMatchingAttributes += 1;
        continue;
      }
      const preferredRestaurantIds = new Set(
        restaurants
          .filter((row) =>
            row.restaurant_attributes.some((attrId) =>
              preferredAttrIds.has(attrId),
            ),
          )
          .map((row) => row.entity_id),
      );
      const candidates = dishes.filter((row) =>
        preferredRestaurantIds.has(row.restaurant_id),
      );
      if (candidates.length < MIN_VIABLE_LIST_ITEMS) {
        skips.tooFewCandidates += 1;
        continue;
      }
      const engaged = await this.engagedSubjectIds(
        user.userId,
        candidates.flatMap((row) => [
          row.food_id,
          row.restaurant_id,
          row.connection_id,
        ]),
      );
      const untried = candidates.filter(
        (row) =>
          !engaged.has(row.food_id) &&
          !engaged.has(row.restaurant_id) &&
          !engaged.has(row.connection_id),
      );
      if (untried.length < MIN_VIABLE_LIST_ITEMS) {
        skips.tooFewUntried += 1;
        continue;
      }
      const sorted = [...untried]
        .sort((a, b) => b.percentile_rank - a.percentile_rank)
        .slice(0, MAX_LIST_ITEMS);
      await this.persistList(
        city.placeId,
        {
          recipeKey: RECIPE_WEEKLY_TASTING,
          scope: 'personal',
          ownerUserId: user.userId,
          listType: 'dish',
          title: 'Your weekly tasting',
          subtitle: `New-to-you dishes in ${city.name}, from cuisines you love`,
          iconKey: ICON_WEEKLY_TASTING,
          rotationKey: weekKey,
          items: sorted.map((row) => ({
            entityId: row.food_id,
            restaurantId: row.restaurant_id,
            connectionId: row.connection_id,
          })),
        },
        now,
      );
      built += 1;
    }
    // The metric that can show RED. Mutate the cuisine vocabulary bridge and
    // `noMatchingAttributes` moves; break the city key and `noLiveCity`
    // moves. A build that quietly produces nothing now has to say why.
    this.logger.info('Personal weekly build', {
      recipeKey: RECIPE_WEEKLY_TASTING,
      input: PERSONAL_RECIPE_INPUTS[RECIPE_WEEKLY_TASTING],
      candidates: users.length,
      built,
      skips,
    });
    return built;
  }

  /**
   * The BEHAVIOR half, read from the derived taste profile (D40 §3): the
   * mined restaurant attributes this user's actor has acted on, over ALL
   * history.
   *
   * ALL history is deliberate, not an oversight. A behavioral horizon — "acts
   * older than N days stop counting" — is an owner ruling that has not been
   * made, and inventing one here would be exactly the fabricated number the
   * no-fake-estimates law forbids. The profile records `last_act_at` as a
   * fact and stores the ratified windows beside it, so the day that ruling
   * arrives it is a window argument, not a rewrite.
   *
   * One indexed select. Never a request-path computation, never a second
   * write path.
   */
  private async behavioralAttributeIds(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.$queryRaw<Array<{ subject_id: string }>>(
      Prisma.sql`
        /*curated:taste_profile_attributes*/
        SELECT DISTINCT p.subject_id
        FROM user_taste_profile p
        JOIN signal_actors a ON a.actor_id = p.actor_id
        WHERE a.user_id = ${userId}::uuid
          AND p.window_days = ${TASTE_WINDOW_ALL_DAYS}
          AND p.subject_kind = 'attribute'
          AND p.subject_id IS NOT NULL
      `,
    );
    return new Set(rows.map((row) => row.subject_id));
  }

  // ---------- shared data reads ----------

  /**
   * Scored restaurants located in the city: THE GROUND decides, alone
   * (one-ground charter P1/P2, 2026-07-26). The city's polygon ST_Covers the
   * restaurant point — one predicate, served by the GiST index on
   * place_geometries.geometry.
   *
   * What this replaces: wrap-aware bbox lng arms as a prefilter PLUS a
   * `NOT EXISTS place_geometries OR ST_Covers(...)` disjunct whose first arm
   * let the bbox silently judge a groundless place. That arm was already
   * unreachable — the `bbox_min_lat IS NOT NULL` guard excluded the only
   * groundless row — so this is a pure simplification, and the ground was
   * always the real judge.
   */
  private cityRestaurants(cityPlaceId: string): Promise<CityRestaurantRow[]> {
    return this.prisma.$queryRaw<CityRestaurantRow[]>(Prisma.sql`
      /*curated:city_restaurants*/
      SELECT e.entity_id,
             e.name,
             e.restaurant_attributes,
             /* Restaurant-level mention volume = event count. Item-level
                mention_count sums were the first cut and produced a city
                MEDIAN OF ZERO (most restaurants carry mentions as events,
                not item rows) — structurally emptying hidden_gems. */
             ${Prisma.raw(activeRestaurantEventCountSql('e.entity_id'))} AS mention_volume,
             pes.display_score::float8 AS display_score,
             pes.percentile_rank::float8 AS percentile_rank,
             pes.rising::float8 AS rising
      FROM core_entities e
      JOIN core_public_entity_scores pes
        ON pes.subject_type = 'restaurant' AND pes.subject_id = e.entity_id
      JOIN place_geometries pg ON pg.place_id = ${cityPlaceId}::uuid
      LEFT JOIN core_restaurant_items c ON c.restaurant_id = e.entity_id
      WHERE e.type = 'restaurant'
        AND e.status = 'active'
        AND e.latitude IS NOT NULL
        AND e.longitude IS NOT NULL
        AND ST_Covers(
              pg.geometry,
              ST_SetSRID(ST_MakePoint(e.longitude::float8, e.latitude::float8), 4326)
            )
      GROUP BY e.entity_id, e.name, e.restaurant_attributes,
               pes.display_score, pes.percentile_rank, pes.rising
    `);
  }

  /** Scored dish connections of the given restaurants. */
  private async cityDishes(restaurantIds: string[]): Promise<CityDishRow[]> {
    if (!restaurantIds.length) {
      return [];
    }
    return this.prisma.$queryRaw<CityDishRow[]>(Prisma.sql`
      /*curated:city_dishes*/
      SELECT c.connection_id,
             c.food_id,
             f.name AS food_name,
             c.restaurant_id,
             c.mention_count,
             pes.display_score::float8 AS display_score,
             pes.percentile_rank::float8 AS percentile_rank
      FROM core_restaurant_items c
      JOIN core_entities f ON f.entity_id = c.food_id AND f.status = 'active'
      JOIN core_public_entity_scores pes
        ON pes.subject_type = 'connection' AND pes.subject_id = c.connection_id
      WHERE c.restaurant_id = ANY(${restaurantIds}::uuid[])
        -- STARVED anchors never become curated picks (product red team F2):
        -- 115 curated dish rows pointed at zeroed connections and the
        -- mobile adapter rendered them as Crave Score 0 — a fabricated
        -- number under the no-fake-estimates law.
        AND c.mention_count > 0
    `);
  }

  /**
   * The cuisine subset of the attribute vocabulary: attribute ids the
   * cuisine-extraction pipeline recorded on any restaurant (measured — the
   * pipeline's own classification, not a name heuristic).
   */
  private async cuisineAttributeIds(): Promise<Set<string>> {
    const rows = await this.prisma.$queryRaw<Array<{ attribute_id: string }>>(
      Prisma.sql`
        /*curated:cuisine_attribute_ids*/
        SELECT DISTINCT jsonb_array_elements_text(
                 restaurant_metadata->'cuisineExtraction'->'attributeIds'
               ) AS attribute_id
        FROM core_entities
        WHERE type = 'restaurant'
          AND jsonb_typeof(
                restaurant_metadata->'cuisineExtraction'->'attributeIds'
              ) = 'array'
      `,
    );
    return new Set(rows.map((row) => row.attribute_id));
  }

  /** Names + aliases for every attribute id present on the candidate set. */
  private async attributeNameMap(
    restaurants: CityRestaurantRow[],
  ): Promise<Map<string, { name: string; aliases: string[] }>> {
    const attrIds = [
      ...new Set(restaurants.flatMap((row) => row.restaurant_attributes)),
    ];
    if (!attrIds.length) {
      return new Map();
    }
    const rows = await this.prisma.entity.findMany({
      where: {
        entityId: { in: attrIds },
        type: 'restaurant_attribute',
        status: 'active',
      },
      select: { entityId: true, name: true, aliases: true },
    });
    return new Map(
      rows.map((row) => [
        row.entityId,
        { name: row.name, aliases: row.aliases },
      ]),
    );
  }

  /**
   * Subjects the user already engaged with — the 'untried' exclusion set.
   *
   * D40: the act half is read from the DERIVED TASTE PROFILE, not from a
   * hand-written `signals` query. The query this replaced —
   *
   *     SELECT DISTINCT s.subject_id FROM signals s
   *      JOIN signal_actors a ON a.actor_id = s.actor_id
   *      WHERE a.user_id = ... AND s.kind IN ('favorite_added','entity_view')
   *
   * — was a fourth dialect of the act-grain law: no echo exclusion, its own
   * kind list, straight off the raw ledger. Same facts, one dialect now, and
   * a change to what "an act" means reaches this recipe automatically.
   *
   * ALL-history window, for the same reason as `behavioralAttributeIds`: a
   * dish you viewed two years ago is still not new to you, and no cutoff has
   * been ruled on. Favorite-list saves are read from user_list_items directly
   * (connection + restaurant) — a save is state, not an act.
   */
  private async engagedSubjectIds(
    userId: string,
    subjectIds: string[],
  ): Promise<Set<string>> {
    if (!subjectIds.length) {
      return new Set();
    }
    const unique = [...new Set(subjectIds)];
    const [signalRows, favoriteItems] = await Promise.all([
      this.prisma.$queryRaw<Array<{ subject_id: string }>>(Prisma.sql`
        /*curated:user_engagement*/
        SELECT DISTINCT p.subject_id
        FROM user_taste_profile p
        JOIN signal_actors a ON a.actor_id = p.actor_id
        WHERE a.user_id = ${userId}::uuid
          AND p.window_days = ${TASTE_WINDOW_ALL_DAYS}
          AND p.subject_kind = 'entity'
          AND p.subject_id = ANY(${unique}::uuid[])
      `),
      this.prisma.userListItem.findMany({
        where: {
          list: { ownerUserId: userId },
          OR: [
            { connectionId: { in: unique } },
            { restaurantId: { in: unique } },
          ],
        },
        select: { connectionId: true, restaurantId: true },
      }),
    ]);
    const engaged = new Set(signalRows.map((row) => row.subject_id));
    for (const item of favoriteItems) {
      if (item.connectionId) {
        engaged.add(item.connectionId);
      }
      if (item.restaurantId) {
        engaged.add(item.restaurantId);
      }
    }
    return engaged;
  }

  // ---------- persistence ----------

  /**
   * Atomic supersede: delete EVERY rotation of (city, recipe, owner) and
   * insert the new one in the same transaction. The raw NULLS NOT DISTINCT
   * unique index backstops races.
   */
  private async persistList(
    cityPlaceId: string,
    draft: ListDraft,
    now: Date,
  ): Promise<void> {
    const items = draft.items.slice(0, MAX_LIST_ITEMS);
    await this.prisma.$transaction(async (tx) => {
      await tx.curatedList.deleteMany({
        where: {
          cityPlaceId,
          recipeKey: draft.recipeKey,
          ownerUserId: draft.ownerUserId,
        },
      });
      await tx.curatedList.create({
        data: {
          cityPlaceId,
          recipeKey: draft.recipeKey,
          scope: draft.scope,
          ownerUserId: draft.ownerUserId,
          listType: draft.listType,
          title: draft.title,
          subtitle: draft.subtitle,
          iconKey: draft.iconKey,
          rotationKey: draft.rotationKey,
          builtAt: now,
          itemCount: items.length,
          items: {
            create: items.map((item, index) => ({
              rank: index + 1,
              entityId: item.entityId,
              restaurantId: item.restaurantId,
              connectionId: item.connectionId,
            })),
          },
        },
      });
    });
  }

  private rankByScore(
    members: CityRestaurantRow[],
  ): Array<{ entityId: string; restaurantId: null; connectionId: null }> {
    return [...members]
      .sort(
        (a, b) =>
          b.percentile_rank - a.percentile_rank ||
          b.display_score - a.display_score,
      )
      .slice(0, MAX_LIST_ITEMS)
      .map((row) => ({
        entityId: row.entity_id,
        restaurantId: null,
        connectionId: null,
      }));
  }
}

function medianOf(values: number[]): number | null {
  if (!values.length) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}
