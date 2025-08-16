import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { Entity, EntityType, Connection } from '@prisma/client';
import { EntityRepository } from './entity.repository';
import { ConnectionRepository } from './connection.repository';
import { LoggerService } from '../shared';
import { ValidationException } from './base/repository.exceptions';

/**
 * Service for entity context lookups and contextual attribute resolution
 *
 * IMPLEMENTATION NOTE: This service provides static entity query methods for M01 database foundation.
 * These methods will be complemented (not replaced) by the dynamic component-based processing
 * system described in PRD Section 6.5 which will be implemented in M02.
 *
 * Current Methods (M01 - Database Foundation):
 * - Static entity queries for API endpoints
 * - Context-aware entity lookups (menu vs category context)
 * - Contextual attribute resolution
 * - Dual-purpose entity management
 *
 * Future M02 Methods (Component-Based Processing):
 * - Dynamic LLM output processing via 6 processing components
 * - Bulk entity resolution and creation
 * - Connection boosting and quality score updates
 *
 * Implements PRD Section 4.3.1 - Unified dish_or_category Entity Approach
 */
@Injectable()
export class EntityContextService implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    private readonly entityRepository: EntityRepository,
    private readonly connectionRepository: ConnectionRepository,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('EntityContextService');
  }

  /**
   * Get dish_or_category entity in menu item context
   * When is_menu_item = true in connections, the entity represents a specific dish
   *
   * USAGE: API endpoints for restaurant detail pages showing specific menu items
   * M02 COMPONENT PROCESSING: Dynamic processing will use bulk operations instead
   *
   * PRD 4.3.1: "Node entity (when is_menu_item = true)"
   */
  async getEntityInMenuContext(
    entityId: string,
    restaurantId: string,
  ): Promise<{
    entity: Entity;
    connection: Connection;
    isMenuItem: boolean;
  } | null> {
    const startTime = Date.now();
    try {
      this.logger.debug('Getting entity in menu context', {
        entityId,
        restaurantId,
      });

      // Find the specific restaurant-dish connection
      const connections = await this.connectionRepository.findMany({
        where: {
          restaurantId,
          dishOrCategoryId: entityId,
          isMenuItem: true, // Specific menu item context
        },
        include: {
          dish: true,
          restaurant: true,
        },
      });

      if (connections.length === 0) {
        return null;
      }

      const connection = connections[0];
      const entity = await this.entityRepository.findById(entityId);

      if (!entity || entity.type !== 'dish_or_category') {
        throw new ValidationException('EntityContext', [
          `Entity ${entityId} is not a valid dish_or_category entity`,
        ]);
      }

      const duration = Date.now() - startTime;
      this.logger.debug('Entity retrieved in menu context', {
        duration,
        entityId,
        restaurantId,
        isMenuItem: connection.isMenuItem,
      });

      return {
        entity,
        connection,
        isMenuItem: connection.isMenuItem,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Failed to get entity in menu context', {
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
        entityId,
        restaurantId,
      });
      throw error;
    }
  }

  /**
   * Get dish_or_category entity in category context
   * When stored in categories array, the entity represents a food category
   *
   * USAGE: API endpoints for category browsing and usage statistics
   * M02 COMPONENT PROCESSING: Dynamic processing will handle category assignment in bulk
   *
   * PRD 4.3.1: "Connection-scope metadata (stored in categories array)"
   */
  async getEntityInCategoryContext(entityId: string): Promise<{
    entity: Entity;
    connectionCount: number;
    usageType: 'category';
  } | null> {
    const startTime = Date.now();
    try {
      this.logger.debug('Getting entity in category context', { entityId });

      const entity = await this.entityRepository.findById(entityId);

      if (!entity || entity.type !== 'dish_or_category') {
        return null;
      }

      // Count how many connections use this entity as a category
      const connectionCount = await this.connectionRepository.count({
        categories: {
          has: entityId,
        },
      });

      const duration = Date.now() - startTime;
      this.logger.debug('Entity retrieved in category context', {
        duration,
        entityId,
        connectionCount,
      });

      return {
        entity,
        connectionCount,
        usageType: 'category',
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Failed to get entity in category context', {
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
        entityId,
      });
      throw error;
    }
  }

  /**
   * Resolve context-dependent attributes
   * Handles attributes that exist in both dish and restaurant scopes
   *
   * USAGE: API endpoints for attribute filtering and search
   * M02 COMPONENT PROCESSING: Bulk attribute resolution will use different patterns
   *
   * PRD 4.3.2: "Separate entities by scope" - same name, different entities by scope
   */
  async resolveContextualAttributes(
    attributeName: string,
    scope: 'dish' | 'restaurant',
  ): Promise<Entity[]> {
    const startTime = Date.now();
    try {
      this.logger.debug('Resolving contextual attributes', {
        attributeName,
        scope,
      });

      const entityType: EntityType =
        scope === 'dish' ? 'dish_attribute' : 'restaurant_attribute';

      // Find attributes by name and scope-specific type
      const attributes = await this.entityRepository.findMany({
        where: {
          name: {
            equals: attributeName,
            mode: 'insensitive',
          },
          type: entityType,
        },
      });

      const duration = Date.now() - startTime;
      this.logger.debug('Contextual attributes resolved', {
        duration,
        attributeName,
        scope,
        count: attributes.length,
      });

      return attributes;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Failed to resolve contextual attributes', {
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
        attributeName,
        scope,
      });
      throw error;
    }
  }

  /**
   * Find dish_or_category entities that serve dual purposes
   * Returns entities that are used both as menu items AND categories
   *
   * USAGE: Analytics and admin interfaces for data quality analysis
   * M02 COMPONENT PROCESSING: Dynamic processing will handle dual-purpose detection automatically
   *
   * PRD 4.3.1: "Same entity ID can represent both menu item and category"
   */
  async findDualPurposeEntities(): Promise<
    Array<{
      entity: Entity;
      menuItemUsage: number;
      categoryUsage: number;
    }>
  > {
    const startTime = Date.now();
    try {
      this.logger.debug('Finding dual-purpose entities');

      const dishEntities =
        await this.entityRepository.findByType('dish_or_category');

      const dualPurposeEntities: Array<{
        entity: Entity;
        menuItemUsage: number;
        categoryUsage: number;
      }> = [];

      for (const entity of dishEntities) {
        // Count menu item usage (direct connections with isMenuItem = true)
        const menuItemUsage = await this.connectionRepository.count({
          dishOrCategoryId: entity.entityId,
          isMenuItem: true,
        });

        // Count category usage (references in categories arrays)
        const categoryUsage = await this.connectionRepository.count({
          categories: {
            has: entity.entityId,
          },
        });

        // Include entities that are used in both contexts
        if (menuItemUsage > 0 && categoryUsage > 0) {
          dualPurposeEntities.push({
            entity,
            menuItemUsage,
            categoryUsage,
          });
        }
      }

      const duration = Date.now() - startTime;
      this.logger.debug('Dual-purpose entities found', {
        duration,
        count: dualPurposeEntities.length,
      });

      return dualPurposeEntities;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Failed to find dual-purpose entities', {
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Create or resolve context-dependent attribute entity
   * Ensures attributes exist in the correct scope (dish vs restaurant)
   *
   * USAGE: Manual entity creation via admin interfaces or API endpoints
   * M02 COMPONENT PROCESSING: Bulk attribute creation will use different patterns from PRD 6.5
   *
   * PRD 4.3.2: Example - "Italian" exists as both dish_attribute and restaurant_attribute
   */
  async createOrResolveContextualAttribute(
    attributeName: string,
    scope: 'dish' | 'restaurant',
    aliases: string[] = [],
  ): Promise<Entity> {
    const startTime = Date.now();
    try {
      this.logger.debug('Creating or resolving contextual attribute', {
        attributeName,
        scope,
        aliases,
      });

      // First try to find existing attribute in the correct scope
      const existing = await this.resolveContextualAttributes(
        attributeName,
        scope,
      );

      if (existing.length > 0) {
        this.logger.debug('Using existing contextual attribute', {
          attributeId: existing[0].entityId,
          attributeName,
          scope,
        });
        return existing[0];
      }

      // Create new attribute entity in the correct scope
      const entityType: EntityType =
        scope === 'dish' ? 'dish_attribute' : 'restaurant_attribute';

      const newEntity =
        entityType === 'dish_attribute'
          ? await this.entityRepository.createDishAttribute({
              name: attributeName,
              aliases,
            })
          : await this.entityRepository.createRestaurantAttribute({
              name: attributeName,
              aliases,
            });

      const duration = Date.now() - startTime;
      this.logger.debug('Created new contextual attribute', {
        duration,
        attributeId: newEntity.entityId,
        attributeName,
        scope,
      });

      return newEntity;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Failed to create or resolve contextual attribute', {
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
        attributeName,
        scope,
      });
      throw error;
    }
  }
}
