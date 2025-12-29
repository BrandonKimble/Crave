import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { AliasManagementService } from '../content-processing/entity-resolver/alias-management.service';
import { RestaurantCuisineExtractionQueueService } from '../restaurant-enrichment/restaurant-cuisine-extraction-queue.service';
import { RestaurantLocationEnrichmentService } from '../restaurant-enrichment/restaurant-location-enrichment.service';

export type CoverageContext = {
  coverageKey: string;
  center?: { lat: number; lng: number };
  cityLabel?: string | null;
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
        locationKey: 'global',
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
        locationKey: 'global',
        aliases: [],
      },
    });

    return { entityId: created.entityId, name: created.name, created: true };
  }

  async resolveRestaurant(params: {
    entityId?: string | null;
    name?: string | null;
    coverage: CoverageContext;
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
      city: params.coverage.cityLabel ?? undefined,
      country: params.coverage.countryCode ?? undefined,
      locationBias: params.coverage.center,
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

    const entityData =
      await this.restaurantEnrichment.buildRestaurantCreateInput({
        name,
        coverageKey: this.normalizeCoverageKey(params.coverage.coverageKey),
        place: match.place,
        matchMetadata: match.matchMetadata,
        alias: name,
      });

    const created = await this.prisma.$transaction(async (tx) => {
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
      return entity;
    });

    this.logger.info('Created restaurant from poll input', {
      entityId: created.entityId,
      name: created.name,
      coverageKey: params.coverage.coverageKey,
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
    const entity = await this.prisma.entity.findFirst({
      where: { googlePlaceId: placeId },
      select: { entityId: true, name: true },
    });
    if (entity) {
      return entity;
    }

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
        locationKey:
          entityType === EntityType.restaurant ? undefined : 'global',
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

  private normalizeCoverageKey(value: string): string {
    return value.trim().toLowerCase();
  }
}
