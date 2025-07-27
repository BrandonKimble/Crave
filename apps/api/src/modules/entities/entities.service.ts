import { Injectable } from '@nestjs/common';
import { Entity, EntityType, Prisma, Connection } from '@prisma/client';
import { EntityRepository } from '../../repositories/entity.repository';
import { EntityContextService } from '../../repositories/entity-context.service';
import { LoggerService } from '../../shared';
import { ValidationException } from '../../repositories/base/repository.exceptions';
import { CorrelationUtils } from '../../shared/logging/correlation.utils';
import { PrismaErrorMapper } from '../../shared/utils/prisma-error-mapper';

/**
 * Service layer for entity management
 * Provides business logic layer on top of EntityRepository for unified entity operations
 */
@Injectable()
export class EntitiesService {
  constructor(
    private readonly entityRepository: EntityRepository,
    private readonly entityContextService: EntityContextService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext(EntitiesService.name);
  }

  /**
   * Log performance metrics with correlation tracking
   */
  private logPerformance(
    operation: string,
    entityType: string,
    duration: number,
    success: boolean,
    additionalContext?: Record<string, any>,
  ): void {
    const correlationId = CorrelationUtils.getCorrelationId();
    const context = {
      operation,
      entityType,
      duration,
      success,
      correlationId,
      ...additionalContext,
    };

    if (success) {
      this.logger.debug(`Service operation completed`, context);
    } else {
      this.logger.warn(`Service operation failed`, context);
    }
  }

  /**
   * Handle errors with Prisma error mapping
   */
  private handleError(
    error: unknown,
    operation: string,
    entityType: string,
  ): never {
    if (error instanceof Error && error.name?.includes('Prisma')) {
      throw PrismaErrorMapper.mapError(error, entityType, operation);
    }
    throw error;
  }

  /**
   * Create a new entity with type validation
   */
  async create(data: {
    entityType: EntityType;
    name: string;
    description?: string;
    location?: {
      coordinates: { lat: number; lng: number };
      address: string;
      city: string;
      state: string;
      zipCode: string;
    };
    metadata?: Record<string, any>;
  }): Promise<Entity> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Creating entity`, {
        entityType: data.entityType,
        name: data.name,
        correlationId: CorrelationUtils.getCorrelationId(),
      });

      let result: Entity;

      // Route to appropriate type-specific create method
      switch (data.entityType) {
        case 'restaurant':
          if (!data.location) {
            throw new ValidationException('restaurant', [
              'Location data is required for restaurant entities',
            ]);
          }
          result = await this.entityRepository.createRestaurant({
            name: data.name,
            latitude: data.location.coordinates.lat,
            longitude: data.location.coordinates.lng,
            address: data.location.address,
            restaurantMetadata: {
              ...data.metadata,
              city: data.location.city,
              state: data.location.state,
              zipCode: data.location.zipCode,
            },
          });
          break;

        case 'dish_or_category':
          result = await this.entityRepository.createDishOrCategory({
            name: data.name,
          });
          break;

        case 'dish_attribute':
          result = await this.entityRepository.createDishAttribute({
            name: data.name,
          });
          break;

        case 'restaurant_attribute':
          result = await this.entityRepository.createRestaurantAttribute({
            name: data.name,
          });
          break;

        default:
          throw new ValidationException('entity', [
            `Unsupported entity type: ${String(data.entityType)}. Supported types: restaurant, dish_or_category, dish_attribute, restaurant_attribute`,
          ]);
      }

      const duration = Date.now() - startTime;
      this.logPerformance('create', data.entityType, duration, true, {
        entityId: result.entityId,
        name: data.name,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logPerformance('create', data.entityType, duration, false, {
        error: error instanceof Error ? error.message : String(error),
        name: data.name,
      });
      this.handleError(error, 'create', data.entityType);
    }
  }

  /**
   * Find entity by ID
   */
  async findById(entityId: string): Promise<Entity | null> {
    try {
      this.logger.debug(`Finding entity by ID`, { entityId });
      return await this.entityRepository.findById(entityId);
    } catch (error) {
      this.logger.error(`Failed to find entity by ID`, {
        error: error instanceof Error ? error.message : String(error),
        entityId,
      });
      throw error;
    }
  }

  /**
   * Find multiple entities with filtering and pagination
   */
  async findMany(params: {
    where?: Prisma.EntityWhereInput;
    orderBy?: Prisma.EntityOrderByWithRelationInput;
    skip?: number;
    take?: number;
    include?: Prisma.EntityInclude;
  }): Promise<Entity[]> {
    try {
      this.logger.debug(`Finding multiple entities`, { params });
      return await this.entityRepository.findMany(params);
    } catch (error) {
      this.logger.error(`Failed to find multiple entities`, {
        error: error instanceof Error ? error.message : String(error),
        params,
      });
      throw error;
    }
  }

  /**
   * Update entity with validation
   */
  async update(
    entityId: string,
    data: Prisma.EntityUpdateInput,
  ): Promise<Entity> {
    try {
      this.logger.debug(`Updating entity`, { entityId });
      return await this.entityRepository.updateWithValidation(entityId, data);
    } catch (error) {
      this.logger.error(`Failed to update entity`, {
        error: error instanceof Error ? error.message : String(error),
        entityId,
      });
      throw error;
    }
  }

  /**
   * Delete entity
   */
  async delete(entityId: string): Promise<Entity> {
    try {
      this.logger.debug(`Deleting entity`, { entityId });
      return await this.entityRepository.delete(entityId);
    } catch (error) {
      this.logger.error(`Failed to delete entity`, {
        error: error instanceof Error ? error.message : String(error),
        entityId,
      });
      throw error;
    }
  }

  /**
   * Find restaurants with optional filtering
   */
  async findRestaurants(filter?: {
    where?: Prisma.EntityWhereInput;
    orderBy?: Prisma.EntityOrderByWithRelationInput;
    skip?: number;
    take?: number;
  }): Promise<Entity[]> {
    try {
      this.logger.debug(`Finding restaurants`, { filter });
      return await this.entityRepository.findByType('restaurant', filter);
    } catch (error) {
      this.logger.error(`Failed to find restaurants`, {
        error: error instanceof Error ? error.message : String(error),
        filter,
      });
      throw error;
    }
  }

  /**
   * Find dishes with context awareness
   * PRD 4.3.1: Leverages unified dish_or_category model
   */
  async findDishes(filter?: {
    usageContext?: 'menu_item' | 'category' | 'both';
    restaurantId?: string;
    where?: Prisma.EntityWhereInput;
    orderBy?: Prisma.EntityOrderByWithRelationInput;
    skip?: number;
    take?: number;
  }): Promise<Entity[]> {
    try {
      this.logger.debug('Finding dishes with context', { filter });

      if (filter?.usageContext) {
        return await this.findEntitiesByUsage(
          filter.usageContext,
          filter.restaurantId,
        );
      }

      return await this.entityRepository.findByType('dish_or_category', filter);
    } catch (error) {
      this.logger.error('Failed to find dishes', {
        error: error instanceof Error ? error.message : String(error),
        filter,
      });
      throw error;
    }
  }

  /**
   * Find categories with context awareness
   * PRD 4.3.1: Leverages unified dish_or_category model for category context
   */
  async findCategories(filter?: {
    usageContext?: 'category' | 'both';
    where?: Prisma.EntityWhereInput;
    orderBy?: Prisma.EntityOrderByWithRelationInput;
    skip?: number;
    take?: number;
  }): Promise<Entity[]> {
    try {
      this.logger.debug('Finding categories with context', { filter });

      // Default to category context for this method
      const usageContext = filter?.usageContext || 'category';

      if (usageContext === 'category' || usageContext === 'both') {
        return await this.findEntitiesByUsage(usageContext);
      }

      return await this.entityRepository.findByType('dish_or_category', filter);
    } catch (error) {
      this.logger.error('Failed to find categories', {
        error: error instanceof Error ? error.message : String(error),
        filter,
      });
      throw error;
    }
  }

  /**
   * Find attributes with optional filtering
   */
  async findAttributes(filter?: {
    entityType?: 'dish_attribute' | 'restaurant_attribute';
    where?: Prisma.EntityWhereInput;
    orderBy?: Prisma.EntityOrderByWithRelationInput;
    skip?: number;
    take?: number;
  }): Promise<Entity[]> {
    try {
      this.logger.debug(`Finding attributes`, { filter });
      const entityType = filter?.entityType || 'dish_attribute';
      return await this.entityRepository.findByType(entityType, filter);
    } catch (error) {
      this.logger.error(`Failed to find attributes`, {
        error: error instanceof Error ? error.message : String(error),
        filter,
      });
      throw error;
    }
  }

  /**
   * Find nearby restaurants by location
   */
  async findNearbyRestaurants(location: {
    centerPoint: { lat: number; lng: number };
    radiusKm: number;
    includeInactive?: boolean;
  }): Promise<Entity[]> {
    try {
      this.logger.debug(`Finding nearby restaurants`, { location });

      const whereClause = location.includeInactive ? undefined : undefined; // Remove isActive filter as it's not part of Entity schema

      return await this.entityRepository.findRestaurantsByLocation(
        location.centerPoint.lat,
        location.centerPoint.lng,
        location.radiusKm,
        { where: whereClause },
      );
    } catch (error) {
      this.logger.error(`Failed to find nearby restaurants`, {
        error: error instanceof Error ? error.message : String(error),
        location,
      });
      throw error;
    }
  }

  /**
   * Validate that entity exists and is of expected type
   */
  async validateEntityExists(
    entityId: string,
    expectedType?: EntityType,
  ): Promise<boolean> {
    try {
      this.logger.debug(`Validating entity exists`, { entityId, expectedType });

      const entity = await this.entityRepository.findById(entityId);

      if (!entity) {
        return false;
      }

      if (expectedType && entity.type !== expectedType) {
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(`Failed to validate entity exists`, {
        error: error instanceof Error ? error.message : String(error),
        entityId,
        expectedType,
      });
      throw error;
    }
  }

  /**
   * Get entities for multiple entity IDs (helper for connection validation)
   */
  async getEntitiesForConnections(entityIds: string[]): Promise<Entity[]> {
    try {
      this.logger.debug(`Getting entities for connections`, {
        entityCount: entityIds.length,
      });

      return await this.entityRepository.findMany({
        where: {
          entityId: {
            in: entityIds,
          },
        },
      });
    } catch (error) {
      this.logger.error(`Failed to get entities for connections`, {
        error: error instanceof Error ? error.message : String(error),
        entityCount: entityIds.length,
      });
      throw error;
    }
  }

  // ===== PRD 4.3.1: Dual-Purpose Entity Methods =====

  /**
   * Get dish_or_category entity in menu item context
   * PRD 4.3.1: Same entity ID can represent both menu item and category
   */
  async getEntityInMenuContext(
    entityId: string,
    restaurantId: string,
  ): Promise<{
    entity: Entity;
    connection: Connection;
    isMenuItem: boolean;
  } | null> {
    try {
      this.logger.debug('Getting entity in menu context', {
        entityId,
        restaurantId,
      });
      return await this.entityContextService.getEntityInMenuContext(
        entityId,
        restaurantId,
      );
    } catch (error) {
      this.logger.error('Failed to get entity in menu context', {
        error: error instanceof Error ? error.message : String(error),
        entityId,
        restaurantId,
      });
      this.handleError(error, 'getEntityInMenuContext', 'dish_or_category');
    }
  }

  /**
   * Get dish_or_category entity in category context
   * PRD 4.3.1: Context-aware entity resolution
   */
  async getEntityInCategoryContext(entityId: string): Promise<{
    entity: Entity;
    connectionCount: number;
    usageType: 'category';
  } | null> {
    try {
      this.logger.debug('Getting entity in category context', { entityId });
      return await this.entityContextService.getEntityInCategoryContext(
        entityId,
      );
    } catch (error) {
      this.logger.error('Failed to get entity in category context', {
        error: error instanceof Error ? error.message : String(error),
        entityId,
      });
      this.handleError(error, 'getEntityInCategoryContext', 'dish_or_category');
    }
  }

  /**
   * Find entities serving dual purposes (both menu item AND category)
   * PRD 4.3.1: Unified dish_or_category approach
   */
  async findDualPurposeEntities(): Promise<
    Array<{
      entity: Entity;
      menuItemUsage: number;
      categoryUsage: number;
    }>
  > {
    try {
      this.logger.debug('Finding dual-purpose entities');
      return await this.entityContextService.findDualPurposeEntities();
    } catch (error) {
      this.logger.error('Failed to find dual-purpose entities', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.handleError(error, 'findDualPurposeEntities', 'dish_or_category');
    }
  }

  // ===== PRD 4.3.2: Context-Dependent Attribute Methods =====

  /**
   * Resolve context-dependent attributes by scope
   * PRD 4.3.2: "Italian" exists as both dish_attribute and restaurant_attribute
   */
  async resolveAttributesByScope(
    attributeName: string,
    scope: 'dish' | 'restaurant',
  ): Promise<Entity[]> {
    try {
      this.logger.debug('Resolving attributes by scope', {
        attributeName,
        scope,
      });
      return await this.entityContextService.resolveContextualAttributes(
        attributeName,
        scope,
      );
    } catch (error) {
      this.logger.error('Failed to resolve attributes by scope', {
        error: error instanceof Error ? error.message : String(error),
        attributeName,
        scope,
      });
      this.handleError(error, 'resolveAttributesByScope', `${scope}_attribute`);
    }
  }

  /**
   * Create or resolve context-specific attribute
   * PRD 4.3.2: Scope-aware attribute management
   */
  async createOrResolveAttribute(
    attributeName: string,
    scope: 'dish' | 'restaurant',
    aliases: string[] = [],
  ): Promise<Entity> {
    try {
      this.logger.debug('Creating or resolving contextual attribute', {
        attributeName,
        scope,
      });
      return await this.entityContextService.createOrResolveContextualAttribute(
        attributeName,
        scope,
        aliases,
      );
    } catch (error) {
      this.logger.error('Failed to create or resolve attribute', {
        error: error instanceof Error ? error.message : String(error),
        attributeName,
        scope,
      });
      this.handleError(error, 'createOrResolveAttribute', `${scope}_attribute`);
    }
  }

  // ===== PRD 4.3: Enhanced Unified Entity Model Methods =====

  /**
   * Find dish_or_category entities by usage context
   * PRD 4.3.1: Leverages dual-purpose entity design
   */
  async findEntitiesByUsage(
    usageType: 'menu_item' | 'category' | 'both',
    restaurantId?: string,
  ): Promise<Entity[]> {
    try {
      this.logger.debug('Finding entities by usage', {
        usageType,
        restaurantId,
      });
      return await this.entityRepository.findDishEntitiesByUsage(
        usageType,
        restaurantId,
      );
    } catch (error) {
      this.logger.error('Failed to find entities by usage', {
        error: error instanceof Error ? error.message : String(error),
        usageType,
        restaurantId,
      });
      this.handleError(error, 'findEntitiesByUsage', 'dish_or_category');
    }
  }

  /**
   * Find attributes across multiple scopes
   * PRD 4.3.2: Context-dependent attribute resolution
   */
  async findAttributesAcrossScopes(
    searchTerm: string,
    scopes: ('dish' | 'restaurant')[] = ['dish', 'restaurant'],
  ): Promise<{ [key in EntityType]?: Entity[] }> {
    try {
      this.logger.debug('Finding attributes across scopes', {
        searchTerm,
        scopes,
      });
      const entityTypes = scopes.map((scope) =>
        scope === 'dish' ? 'dish_attribute' : 'restaurant_attribute',
      ) as EntityType[];

      return await this.entityRepository.findByNameAcrossTypes(
        searchTerm,
        entityTypes,
      );
    } catch (error) {
      this.logger.error('Failed to find attributes across scopes', {
        error: error instanceof Error ? error.message : String(error),
        searchTerm,
        scopes,
      });
      this.handleError(error, 'findAttributesAcrossScopes', 'attribute');
    }
  }
}
