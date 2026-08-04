import { identityInsertData } from '../content-processing/entity-resolver/entity-identity';
import { addAliases } from '../content-processing/entity-resolver/entity-alias.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { AliasManagementService } from '../content-processing/entity-resolver/alias-management.service';
import { RestaurantCuisineExtractionQueueService } from '../restaurant-enrichment/restaurant-cuisine-extraction-queue.service';
import { RestaurantLocationEnrichmentService } from '../restaurant-enrichment/restaurant-location-enrichment.service';
import { EntityTextSearchService } from '../entity-text-search/entity-text-search.service';

/** Phase C re-key: entity seeding is biased by the creation PLACE (centroid +
 *  region hints) — the old market context is dead. */
/**
 * §16 K3: how long a vendor MISS stays true. The vendor's catalog does
 * change, so a miss is a fact with a shelf life — long enough to kill a
 * retry loop, short enough that a genuinely new restaurant becomes findable
 * the same week. What changes it: measured vendor catalog latency.
 */
const VENDOR_MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Shortlist for the free local identity check (bounded, lexical only). */
const LOCAL_MATCH_SHORTLIST = 8;

/**
 * §16 K1 (product sentence): "the restaurant they mean is the one near the
 * poll". A metro-scale radius — same name, same metro, is the same place;
 * same name two cities over is not, and that case goes to the vendor.
 */
const LOCAL_MATCH_RADIUS_METERS = 50_000;

export type PollPlaceContext = {
  center?: { lat: number; lng: number };
  city?: string | null;
  region?: string | null;
  countryCode?: string | null;
};

type ResolvedEntity = {
  entityId: string;
  name: string;
  created: boolean;
};

type AttributeEntityType = Extract<
  EntityType,
  'food_attribute' | 'restaurant_attribute'
>;

@Injectable()
export class PollEntitySeedService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
    private readonly aliasManagement: AliasManagementService,
    private readonly restaurantEnrichment: RestaurantLocationEnrichmentService,
    private readonly cuisineExtractionQueue: RestaurantCuisineExtractionQueueService,
    private readonly entityTextSearch: EntityTextSearchService,
  ) {
    this.logger = loggerService.setContext('PollEntitySeedService');
  }

  async resolveFood(params: {
    entityId?: string | null;
    name?: string | null;
  }): Promise<ResolvedEntity> {
    if (params.entityId) {
      return this.assertEntityType(params.entityId, EntityType.food);
    }

    const name = this.normalizeInput(params.name);
    if (!name) {
      throw new BadRequestException('Dish name is required');
    }

    const existing = await this.findEntityByName(EntityType.food, name);
    if (existing) {
      return {
        entityId: existing.entityId,
        name: existing.name,
        created: false,
      };
    }

    const created = await this.prisma.entity.create({
      data: {
        name,
        type: EntityType.food,
        aliases: [],
        ...identityInsertData(name, EntityType.food),
      },
    });

    return { entityId: created.entityId, name: created.name, created: true };
  }

  async resolveAttribute(params: {
    entityId?: string | null;
    name?: string | null;
    entityType: AttributeEntityType;
  }): Promise<ResolvedEntity> {
    if (params.entityId) {
      return this.assertEntityType(params.entityId, params.entityType);
    }

    const name = this.normalizeInput(params.name);
    if (!name) {
      throw new BadRequestException('Attribute name is required');
    }

    const scopeCheck = this.aliasManagement.validateScopeConstraints(
      params.entityType,
      [name],
    );
    if (scopeCheck.violations.length > 0) {
      throw new BadRequestException(
        `Attribute not allowed for ${params.entityType.replace('_', ' ')}`,
      );
    }

    const existing = await this.findEntityByName(params.entityType, name);
    if (existing) {
      return {
        entityId: existing.entityId,
        name: existing.name,
        created: false,
      };
    }

    const created = await this.prisma.entity.create({
      data: {
        name,
        type: params.entityType,
        aliases: [],
        ...identityInsertData(name, params.entityType),
      },
    });

    return { entityId: created.entityId, name: created.name, created: true };
  }

  /**
   * Free local identity check: does our catalog already hold this restaurant,
   * near the poll's place? Lexical recall only (no embedding call), accepted
   * only on strong evidence, and confirmed by a LOCATION inside the poll's
   * place — a "Joe's Pizza" in another city must not answer for this one.
   * Returns null whenever we are not sure, which sends the caller to Google.
   */
  private async matchKnownRestaurant(
    name: string,
    place: PollPlaceContext,
  ): Promise<ResolvedEntity | null> {
    try {
      const candidates = await this.entityTextSearch.retrieveCandidates(
        name,
        [EntityType.restaurant],
        LOCAL_MATCH_SHORTLIST,
        { denseMode: 'none' },
      );
      const strong = candidates.filter(
        (candidate) =>
          candidate.sparseEvidence === 'exact' ||
          candidate.sparseEvidence === 'prefix',
      );
      if (!strong.length || !place.center) {
        return null;
      }
      // Geographic confirmation: one of the strong candidates must actually
      // have a location near the poll's centre. Bounded by the shortlist, one
      // indexed query, no vendor call.
      const [near] = await this.prisma.$queryRaw<
        Array<{ entity_id: string; name: string }>
      >(Prisma.sql`
        SELECT e.entity_id, e.name
        FROM core_entities e
        JOIN core_restaurant_locations rl ON rl.restaurant_id = e.entity_id
        WHERE e.entity_id IN (${Prisma.join(strong.map((c) => c.entityId))}::uuid[])
          AND rl.latitude IS NOT NULL AND rl.longitude IS NOT NULL
          AND ST_DWithin(
                ST_SetSRID(ST_MakePoint(rl.longitude::float8, rl.latitude::float8), 4326)::geography,
                ST_SetSRID(ST_MakePoint(${place.center.lng}::float8, ${place.center.lat}::float8), 4326)::geography,
                ${LOCAL_MATCH_RADIUS_METERS}
              )
        LIMIT 1
      `);
      if (!near) {
        return null;
      }
      this.logger.info(
        'Poll subject resolved from our own catalog (no vendor call)',
        {
          entityId: near.entity_id,
          name: near.name,
        },
      );
      return { entityId: near.entity_id, name: near.name, created: false };
    } catch (error) {
      // A local-check failure must never block creation — fall through to
      // the vendor exactly as before.
      this.logger.warn(
        'Local restaurant match failed; falling through to vendor',
        {
          detail: error instanceof Error ? error.message : String(error),
        },
      );
      return null;
    }
  }

  /** Identity of a vendor question: the name, in the metro it was asked about. */
  private vendorLookupKey(name: string, place: PollPlaceContext): string {
    const cell = place.center
      ? `${place.center.lat.toFixed(1)},${place.center.lng.toFixed(1)}`
      : 'nowhere';
    return `places:${cell}:${name.toLowerCase()}`.slice(0, 200);
  }

  private async recentlyMissed(key: string): Promise<boolean> {
    try {
      const cutoff = new Date(Date.now() - VENDOR_MISS_TTL_MS);
      const row = await this.prisma.vendorLookupMiss.findFirst({
        where: { lookupKey: key, observedAt: { gte: cutoff } },
        select: { lookupKey: true },
      });
      return row != null;
    } catch {
      // A memory failure must never block creation — ask the vendor.
      return false;
    }
  }

  private async rememberMiss(key: string): Promise<void> {
    try {
      const now = new Date();
      await this.prisma.vendorLookupMiss.upsert({
        where: { lookupKey: key },
        create: { lookupKey: key, vendor: 'google_places', observedAt: now },
        update: { observedAt: now },
      });
    } catch {
      // Losing one memory costs one re-ask, never a failed creation.
    }
  }

  async resolveRestaurant(params: {
    entityId?: string | null;
    name?: string | null;
    place: PollPlaceContext;
    sessionToken?: string;
  }): Promise<ResolvedEntity> {
    if (params.entityId) {
      return this.assertEntityType(params.entityId, EntityType.restaurant);
    }

    const name = this.normalizeInput(params.name);
    if (!name) {
      throw new BadRequestException('Restaurant name is required');
    }

    // ASK OURSELVES FIRST (2026-08-01). The collection pipeline has always
    // answered "which restaurant is this text?" from our OWN catalog —
    // entity-resolution.service runs the shared recall core and only then
    // judges. Poll creation asked GOOGLE first and consulted our catalog
    // afterwards, keyed on the place id Google returned: we were paying a
    // vendor to identify restaurants we already had, and every failed name
    // cost money and produced nothing. Two implementations of one question,
    // and the paid one was the weaker.
    //
    // The pre-check is deliberately CONSERVATIVE and FREE: lexical recall
    // only (denseMode 'none' — an embedding call costs money too), and a
    // hit counts only on exact/prefix-grade evidence. Anything softer falls
    // through to Google, which is what a vendor is actually for. A local hit
    // is also the better product answer: the poll binds to the entity that
    // already carries our reviews and score, instead of minting a near-twin.
    const local = await this.matchKnownRestaurant(name, params.place);
    if (local) {
      return local;
    }

    // REMEMBER WHAT YOU ASKED. A name the vendor already failed to resolve is
    // an answer with a shelf life — re-asking pays to learn the same nothing.
    // Same law as the geo side's probed_regions, same reason.
    const missKey = this.vendorLookupKey(name, params.place);
    if (await this.recentlyMissed(missKey)) {
      throw new BadRequestException(
        'Restaurant could not be verified. Please choose a real place.',
      );
    }

    const match = await this.restaurantEnrichment.resolvePlaceForInput({
      name,
      city: params.place.city ?? undefined,
      region: params.place.region ?? undefined,
      countryCode: params.place.countryCode ?? undefined,
      locationBias: params.place.center,
      sessionToken: params.sessionToken,
    });

    if (!match) {
      await this.rememberMiss(missKey);
      throw new BadRequestException(
        'Restaurant could not be verified. Please choose a real place.',
      );
    }

    const placeId = match.place.id?.trim();
    if (!placeId) {
      await this.rememberMiss(missKey);
      throw new BadRequestException(
        'Restaurant could not be verified. Please choose a real place.',
      );
    }

    const existing = await this.findRestaurantByPlaceId(placeId);
    if (existing) {
      return {
        entityId: existing.entityId,
        name: existing.name,
        created: false,
      };
    }

    // Geometric location data is derived inside buildRestaurantCreateInput
    // from the Google place itself — §13: creation anchors to the
    // verification result (no legacy market presence involved).
    const entityData =
      await this.restaurantEnrichment.buildRestaurantCreateInput({
        name,
        place: match.place,
        matchMetadata: match.matchMetadata,
        alias: name,
      });

    const created = await this.prisma.$transaction(async (tx) => {
      // CROSS-PATH DUPLICATE FIX (Phase 3.1, plans/extraction-ideal-shape-
      // execution.md): this path used to check ONLY google_place_id — a
      // reddit-created ungrounded entity with the same name was invisible,
      // minting the duplicate (the jollibee hole). Same advisory-lock
      // discipline as the reddit creation path, then a case-insensitive
      // name check: a same-name active entity ADOPTS this verified place
      // as a new location (creation-time's only shared evidence is the
      // name; the enrichment-time conflict resolver and the nightly sweep
      // own the finer distinct-business judgment with domain evidence).
      const resolvedName = String(entityData.name ?? name);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`entity:restaurant:${resolvedName.toLowerCase()}`}))`;
      const sameName = await tx.entity.findFirst({
        where: {
          type: EntityType.restaurant,
          status: 'active',
          name: { equals: resolvedName, mode: 'insensitive' },
        },
        select: { entityId: true, name: true, canonicalDomain: true },
      });
      // DOMAIN-FIRST (red team 2026-07-27): a shared NAME is not identity —
      // the enrichment conflict resolver and the duplicate sweep both decide
      // on domain, and the verified place in scope carries one. Adopting on
      // bare name would write a wrong LOCATION row at ingest (worse than a
      // duplicate entity: locations are what the map and see-locations mode
      // render). Adopt only when the domains AGREE or one side is silent;
      // two distinct owned domains mean two businesses -> create separately.
      const placeDomain = this.restaurantEnrichment.normalizeWebsiteDomain(
        match.place.websiteUri,
      );
      const existingDomain = this.restaurantEnrichment.normalizeWebsiteDomain(
        sameName?.canonicalDomain,
      );
      const domainsConflict = Boolean(
        placeDomain && existingDomain && placeDomain !== existingDomain,
      );
      if (sameName && !domainsConflict) {
        const locationData = this.restaurantEnrichment.buildLocationCreateInput(
          sameName.entityId,
          match.place,
        );
        await tx.restaurantLocation.create({ data: locationData });
        this.logger.info(
          'Poll input matched existing restaurant (name + domain agreement) — attached location',
          {
            entityId: sameName.entityId,
            placeId,
            placeDomain,
            existingDomain,
          },
        );
        return {
          entityId: sameName.entityId,
          name: sameName.name,
          adopted: true,
        };
      }
      const entity = await tx.entity.create({
        data: {
          ...entityData,
          ...identityInsertData(
            (entityData as { name: string }).name,
            EntityType.restaurant,
          ),
        },
      });
      const locationData = this.restaurantEnrichment.buildLocationCreateInput(
        entity.entityId,
        match.place,
      );
      const location = await tx.restaurantLocation.create({
        data: locationData,
      });
      await tx.entity.update({
        where: { entityId: entity.entityId },
        data: {
          primaryLocation: { connect: { locationId: location.locationId } },
        },
      });
      // A1: the create wrote aliases[] inline (atomic with the row, so the
      // name-unique index fires on THAT insert); the rows follow inside the
      // same transaction, tagged with Google's own displayName language
      // when it gave us one. Byte-identical projection — a no-op UPDATE.
      const createdAliases = (entityData.aliases as string[] | undefined) ?? [];
      if (createdAliases.length) {
        const placeLocale =
          match.place?.displayName?.languageCode?.trim() || undefined;
        await addAliases(
          tx,
          entity.entityId,
          createdAliases.map((form) => ({
            form,
            source: 'places' as const,
            ...(placeLocale ? { locale: placeLocale } : {}),
          })),
          { markEmbeddingStale: false },
        );
      }
      return { entityId: entity.entityId, name: entity.name, adopted: false };
    });

    if (created.adopted) {
      return { entityId: created.entityId, name: created.name, created: false };
    }

    this.logger.info('Created restaurant from poll input', {
      entityId: created.entityId,
      name: created.name,
    });

    await this.cuisineExtractionQueue.queueExtraction(created.entityId, {
      source: 'poll_input',
    });

    return { entityId: created.entityId, name: created.name, created: true };
  }

  async ensureConnection(params: {
    restaurantId: string;
    foodId: string;
    attributeId?: string | null;
  }): Promise<string> {
    const existing = await this.prisma.connection.findFirst({
      where: { restaurantId: params.restaurantId, foodId: params.foodId },
      select: { connectionId: true, foodAttributes: true },
    });

    if (existing) {
      if (params.attributeId) {
        const updated = new Set(existing.foodAttributes ?? []);
        updated.add(params.attributeId);
        await this.prisma.connection.update({
          where: { connectionId: existing.connectionId },
          data: { foodAttributes: Array.from(updated.values()) },
        });
      }
      return existing.connectionId;
    }

    const created = await this.prisma.connection.create({
      data: {
        restaurantId: params.restaurantId,
        foodId: params.foodId,
        categories: [],
        foodAttributes: params.attributeId ? [params.attributeId] : [],
      },
      select: { connectionId: true },
    });

    return created.connectionId;
  }

  async ensureRestaurantAttribute(params: {
    restaurantId: string;
    attributeId: string;
  }): Promise<void> {
    const restaurant = await this.prisma.entity.findUnique({
      where: { entityId: params.restaurantId },
      select: { restaurantAttributes: true },
    });
    if (!restaurant) {
      throw new BadRequestException('Restaurant not found');
    }

    const updated = new Set(restaurant.restaurantAttributes ?? []);
    updated.add(params.attributeId);
    await this.prisma.entity.update({
      where: { entityId: params.restaurantId },
      data: { restaurantAttributes: Array.from(updated.values()) },
    });
    // Phase 4b: a poll-seeded attribute is a claim like any other — state
    // it in the substrate so the derived array keeps it.
    await this.prisma.restaurantAttributeEvidence.createMany({
      data: [
        {
          restaurantId: params.restaurantId,
          attributeId: params.attributeId,
          sourceClass: 'poll_seed',
          observations: 1,
        },
      ],
      skipDuplicates: true,
    });
  }

  private async findRestaurantByPlaceId(placeId: string) {
    const location = await this.prisma.restaurantLocation.findUnique({
      where: { googlePlaceId: placeId },
      select: { restaurantId: true },
    });
    if (!location) {
      return null;
    }

    return this.prisma.entity.findUnique({
      where: { entityId: location.restaurantId },
      select: { entityId: true, name: true },
    });
  }

  private async assertEntityType(
    entityId: string,
    expected: EntityType,
  ): Promise<ResolvedEntity> {
    const entity = await this.prisma.entity.findUnique({
      where: { entityId },
      select: { entityId: true, type: true, name: true },
    });
    if (!entity || entity.type !== expected) {
      throw new BadRequestException(`Invalid ${expected} reference`);
    }
    return { entityId: entity.entityId, name: entity.name, created: false };
  }

  private async findEntityByName(entityType: EntityType, name: string) {
    return this.prisma.entity.findFirst({
      where: {
        type: entityType,
        OR: [
          { name: { equals: name, mode: 'insensitive' } },
          { aliases: { has: name } },
        ],
      },
      select: { entityId: true, name: true },
    });
  }

  private normalizeInput(value?: string | null): string | null {
    if (!value) {
      return null;
    }
    const trimmed = value.trim().replace(/\s+/g, ' ');
    return trimmed.length ? trimmed : null;
  }
}
