import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { AliasManagementService } from '../content-processing/entity-resolver/alias-management.service';
import { RestaurantCuisineExtractionQueueService } from '../restaurant-enrichment/restaurant-cuisine-extraction-queue.service';
import { RestaurantLocationEnrichmentService } from '../restaurant-enrichment/restaurant-location-enrichment.service';

/** Phase C re-key: entity seeding is biased by the creation PLACE (centroid +
 *  region hints) — the old market context is dead. */
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
      },
    });

    return { entityId: created.entityId, name: created.name, created: true };
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

    const match = await this.restaurantEnrichment.resolvePlaceForInput({
      name,
      city: params.place.city ?? undefined,
      region: params.place.region ?? undefined,
      countryCode: params.place.countryCode ?? undefined,
      locationBias: params.place.center,
      sessionToken: params.sessionToken,
    });

    if (!match) {
      throw new BadRequestException(
        'Restaurant could not be verified. Please choose a real place.',
      );
    }

    const placeId = match.place.id?.trim();
    if (!placeId) {
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
      const entity = await tx.entity.create({ data: entityData });
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
