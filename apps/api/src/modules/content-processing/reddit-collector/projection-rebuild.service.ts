import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Connection, EntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';

type PrismaTransaction = Prisma.TransactionClient;

type ActiveRestaurantEvent = {
  extractionRunId: string;
  restaurantId: string;
  sourceDocumentId: string;
  mentionKey: string;
  evidenceType: string;
  mentionedAt: Date;
  sourceUpvotes: number;
  sourceDocument: {
    activeExtractionRunId: string | null;
  };
};

type ActiveRestaurantEntityEvent = {
  extractionRunId: string;
  restaurantId: string;
  sourceDocumentId: string;
  mentionKey: string;
  entityId: string;
  entityType: EntityType;
  evidenceType: string;
  isMenuItem: boolean | null;
  mentionedAt: Date;
  sourceUpvotes: number;
  sourceDocument: {
    activeExtractionRunId: string | null;
  };
};

type MentionEventGroup = {
  restaurantId: string;
  mentionKey: string;
  events: ActiveRestaurantEntityEvent[];
};

type ItemSupportMention = {
  restaurantId: string;
  foodId: string | null;
  categoryIds: string[];
  mentionedAt: Date;
  sourceUpvotes: number;
  /** §8 provenance unification — the calibration room this support came from. */
  sourceDocumentId: string | null;
  foodAttributeIds: string[];
};

type RestaurantItemProjection = {
  restaurantId: string;
  foodId: string;
  /** Phase 4: this row is a CATEGORY claim materialized as an item. */
  isCategoryItem: boolean;
  categories: string[];
  baseFoodAttributes: string[];
  foodAttributes: string[];
  /** Source-faithful ingredient entity ids (evidence tier). */
  ingredients: string[];
  mentionCount: number;
  totalUpvotes: number;
  supportMentionCount: number;
  supportTotalUpvotes: number;
  lastMentionedAt: Date | null;
  firstMentionedAt: Date | null;
  mentions: {
    kind: 'direct' | 'support';
    mentionedAt: Date;
    sourceUpvotes: number;
    /** §8 provenance unification — resolved to a SOURCE room by the scorer. */
    sourceDocumentId: string | null;
  }[];
  /** CLAIM IDENTITY (async-integrity step 2): one document contributes at
   *  most ONE mention of each kind to a connection — two category routes
   *  banking the same doc's support must not double it. Transient. */
  seenContributions?: Set<string>;
};

@Injectable()
export class ProjectionRebuildService implements OnModuleInit {
  /** Repair-sweep batch size — structural plumbing (transaction size bound),
   *  not a behavior knob. */
  private static readonly REPAIR_BATCH_SIZE = 100;

  private logger!: LoggerService;

  constructor(
    private readonly prismaService: PrismaService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('ProjectionRebuildService');
  }

  /**
   * Rebuild all restaurant-level projections from the currently active event set.
   * This is the authoritative, order-independent path used after ingestion and replay cutovers.
   */
  async rebuildForRestaurants(
    restaurantIds: string[],
    tx?: PrismaTransaction,
  ): Promise<{ connectionIds: string[]; restaurantIds: string[] }> {
    const uniqueRestaurantIds = Array.from(
      new Set(restaurantIds.filter((value): value is string => Boolean(value))),
    );
    if (!uniqueRestaurantIds.length) {
      return { connectionIds: [], restaurantIds: [] };
    }

    if (tx) {
      const connectionIds = await this.rebuildForRestaurantsTx(
        tx,
        uniqueRestaurantIds,
      );
      return { connectionIds, restaurantIds: uniqueRestaurantIds };
    }

    const connectionIds = await this.prismaService.$transaction(
      async (transaction) =>
        this.rebuildForRestaurantsTx(transaction, uniqueRestaurantIds),
      { timeout: 15 * 60 * 1000 },
    );

    return { connectionIds, restaurantIds: uniqueRestaurantIds };
  }

  private async rebuildForRestaurantsTx(
    tx: PrismaTransaction,
    restaurantIds: string[],
  ): Promise<string[]> {
    const [restaurantEvents, entityEvents] = await Promise.all([
      this.loadActiveRestaurantEvents(tx, restaurantIds),
      this.loadActiveRestaurantEntityEvents(tx, restaurantIds),
    ]);

    await Promise.all([
      this.replaceRestaurantPraise(tx, restaurantIds, restaurantEvents),
      this.replaceRestaurantEntitySignals(tx, restaurantIds, entityEvents),
      this.replaceRedditAttributeEvidence(tx, restaurantIds, entityEvents),
    ]);

    // Phase 4b: the attribute array is DERIVED from evidence now — this is
    // the line that makes re-extraction able to correct a wrong attribute.
    await this.deriveRestaurantAttributes(tx, restaurantIds);

    const mentionGroups = this.groupEntityEventsByMention(entityEvents);
    const itemSupportMentions = this.buildItemSupportMentions(mentionGroups);
    const itemProjections = this.buildRestaurantItemProjections(
      mentionGroups,
      itemSupportMentions,
    );

    const connectionIds = await this.replaceRestaurantItems(
      tx,
      restaurantIds,
      itemProjections,
    );

    // Keep the canonical per-food category edges (derived_food_category_edges —
    // what SEARCH reads for category membership) consistent with the just-
    // rebuilt connection arrays: recompute edges for every food these
    // restaurants touch, across ALL of that food's connections (per-food
    // reconciliation, self-edges excluded). Incremental + tx-consistent.
    await this.refreshFoodCategoryEdgesForRestaurants(tx, restaurantIds);

    this.logger.debug('Rebuilt restaurant projections from active evidence', {
      restaurantCount: restaurantIds.length,
      restaurantEventCount: restaurantEvents.length,
      restaurantEntityEventCount: entityEvents.length,
      itemSupportMentionCount: itemSupportMentions.length,
      rebuiltConnectionCount: connectionIds.length,
    });

    return connectionIds;
  }

  private async refreshFoodCategoryEdgesForRestaurants(
    tx: PrismaTransaction,
    restaurantIds: string[],
  ): Promise<void> {
    if (!restaurantIds.length) return;
    await tx.$executeRawUnsafe(
      `DELETE FROM derived_food_category_edges
       WHERE food_id IN (
         SELECT DISTINCT food_id FROM core_restaurant_items
         WHERE restaurant_id = ANY($1::uuid[])
       )`,
      restaurantIds,
    );
    await tx.$executeRawUnsafe(
      `INSERT INTO derived_food_category_edges (food_id, category_id, conn_support, food_conns)
       SELECT c.food_id, cat_id, count(*),
              (SELECT count(*) FROM core_restaurant_items c2 WHERE c2.food_id = c.food_id)
       FROM core_restaurant_items c, unnest(c.categories) AS cat_id
       WHERE cat_id <> c.food_id
         AND c.food_id IN (
           SELECT DISTINCT food_id FROM core_restaurant_items
           WHERE restaurant_id = ANY($1::uuid[])
         )
       GROUP BY c.food_id, cat_id`,
      restaurantIds,
    );
  }

  private async loadActiveRestaurantEvents(
    tx: PrismaTransaction,
    restaurantIds: string[],
  ): Promise<ActiveRestaurantEvent[]> {
    const rows = await tx.restaurantEvent.findMany({
      where: {
        restaurantId: { in: restaurantIds },
      },
      select: {
        extractionRunId: true,
        restaurantId: true,
        sourceDocumentId: true,
        mentionKey: true,
        evidenceType: true,
        mentionedAt: true,
        sourceUpvotes: true,
        sourceDocument: {
          select: { activeExtractionRunId: true },
        },
      },
    });

    return rows.filter(
      (row): row is ActiveRestaurantEvent =>
        row.sourceDocument.activeExtractionRunId === row.extractionRunId,
    );
  }

  private async loadActiveRestaurantEntityEvents(
    tx: PrismaTransaction,
    restaurantIds: string[],
  ): Promise<ActiveRestaurantEntityEvent[]> {
    const rows = await tx.restaurantEntityEvent.findMany({
      where: {
        restaurantId: { in: restaurantIds },
      },
      select: {
        extractionRunId: true,
        restaurantId: true,
        sourceDocumentId: true,
        mentionKey: true,
        entityId: true,
        entityType: true,
        evidenceType: true,
        isMenuItem: true,
        mentionedAt: true,
        sourceUpvotes: true,
        sourceDocument: {
          select: { activeExtractionRunId: true },
        },
      },
    });

    return rows.filter(
      (row) => row.sourceDocument.activeExtractionRunId === row.extractionRunId,
    );
  }

  private groupEntityEventsByMention(
    entityEvents: ActiveRestaurantEntityEvent[],
  ): MentionEventGroup[] {
    const groups = new Map<string, MentionEventGroup>();

    entityEvents.forEach((event) => {
      const key = `${event.restaurantId}:${event.mentionKey}`;
      const existing = groups.get(key);
      if (existing) {
        existing.events.push(event);
        return;
      }

      groups.set(key, {
        restaurantId: event.restaurantId,
        mentionKey: event.mentionKey,
        events: [event],
      });
    });

    return Array.from(groups.values());
  }

  private buildItemSupportMentions(
    mentionGroups: MentionEventGroup[],
  ): ItemSupportMention[] {
    const mentions: ItemSupportMention[] = [];

    mentionGroups.forEach((group) => {
      const foodEvent = group.events.find(
        (event) =>
          event.entityType === 'food' &&
          (event.evidenceType === 'menu_item_food' ||
            event.evidenceType === 'food_mention'),
      );
      if (foodEvent?.isMenuItem === true) {
        return;
      }

      const supportFoodId =
        foodEvent?.evidenceType === 'food_mention' ? foodEvent.entityId : null;
      const categoryIds = Array.from(
        new Set(
          group.events
            .filter((event) => event.evidenceType === 'food_category')
            .map((event) => event.entityId),
        ),
      );
      const foodAttributeIds = Array.from(
        new Set(
          group.events
            .filter((event) => event.evidenceType === 'food_attribute')
            .map((event) => event.entityId),
        ),
      );
      if (
        !supportFoodId &&
        categoryIds.length === 0 &&
        foodAttributeIds.length === 0
      ) {
        return;
      }

      mentions.push({
        restaurantId: group.restaurantId,
        foodId: supportFoodId,
        categoryIds,
        mentionedAt:
          foodEvent?.mentionedAt ?? group.events[0]?.mentionedAt ?? new Date(0),
        sourceUpvotes:
          foodEvent?.sourceUpvotes ?? group.events[0]?.sourceUpvotes ?? 0,
        sourceDocumentId:
          foodEvent?.sourceDocumentId ??
          group.events[0]?.sourceDocumentId ??
          null,
        foodAttributeIds,
      });
    });

    return mentions.sort(
      (left, right) => left.mentionedAt.getTime() - right.mentionedAt.getTime(),
    );
  }

  private buildRestaurantItemProjections(
    mentionGroups: MentionEventGroup[],
    itemSupportMentions: ItemSupportMention[],
  ): RestaurantItemProjection[] {
    const items = new Map<string, RestaurantItemProjection>();

    mentionGroups.forEach((group) => {
      const foodEvent = group.events.find(
        (event) =>
          event.entityType === 'food' &&
          event.isMenuItem === true &&
          event.evidenceType === 'menu_item_food',
      );
      if (!foodEvent) {
        return;
      }

      const categories = Array.from(
        new Set(
          group.events
            .filter((event) => event.evidenceType === 'food_category')
            .map((event) => event.entityId),
        ),
      );
      const foodAttributes = Array.from(
        new Set(
          group.events
            .filter((event) => event.evidenceType === 'food_attribute')
            .map((event) => event.entityId),
        ),
      );
      const ingredients = Array.from(
        new Set(
          group.events
            .filter((event) => event.evidenceType === 'ingredient')
            .map((event) => event.entityId),
        ),
      );
      const key = `${foodEvent.restaurantId}:${foodEvent.entityId}`;
      const aggregate =
        items.get(key) ??
        ({
          restaurantId: foodEvent.restaurantId,
          foodId: foodEvent.entityId,
          isCategoryItem: false,
          categories: [],
          baseFoodAttributes: [],
          foodAttributes: [],
          ingredients: [],
          mentionCount: 0,
          totalUpvotes: 0,
          supportMentionCount: 0,
          supportTotalUpvotes: 0,
          lastMentionedAt: null,
          firstMentionedAt: null,
          mentions: [],
        } satisfies RestaurantItemProjection);

      aggregate.categories = Array.from(
        new Set([...aggregate.categories, ...categories]),
      ).sort();
      aggregate.baseFoodAttributes = Array.from(
        new Set([...aggregate.baseFoodAttributes, ...foodAttributes]),
      ).sort();
      aggregate.foodAttributes = Array.from(
        new Set([...aggregate.foodAttributes, ...foodAttributes]),
      ).sort();
      aggregate.ingredients = Array.from(
        new Set([...aggregate.ingredients, ...ingredients]),
      ).sort();

      this.applyTimedContribution(
        aggregate,
        foodEvent.mentionedAt,
        foodEvent.sourceUpvotes ?? 0,
        foodEvent.sourceDocumentId,
      );

      items.set(key, aggregate);
    });

    const itemsByRestaurant = new Map<string, RestaurantItemProjection[]>();
    items.forEach((aggregate) => {
      const existing = itemsByRestaurant.get(aggregate.restaurantId) ?? [];
      existing.push(aggregate);
      itemsByRestaurant.set(aggregate.restaurantId, existing);
    });

    itemSupportMentions.forEach((support) => {
      const restaurantItems = itemsByRestaurant.get(support.restaurantId) ?? [];
      if (restaurantItems.length === 0) {
        return;
      }

      restaurantItems.forEach((aggregate) => {
        const matchesFood =
          support.foodId !== null && aggregate.foodId === support.foodId;
        const matchesCategory =
          support.categoryIds.length > 0 &&
          support.categoryIds.some((categoryId) =>
            aggregate.categories.includes(categoryId),
          );
        const matchesAttribute =
          support.foodAttributeIds.length > 0 &&
          support.foodAttributeIds.some((attributeId) =>
            aggregate.baseFoodAttributes.includes(attributeId),
          );

        if (!matchesFood && !matchesCategory && !matchesAttribute) {
          return;
        }

        if (
          support.foodAttributeIds.length > 0 &&
          !matchesAttribute &&
          (matchesFood || matchesCategory)
        ) {
          return;
        }

        this.applySupportContribution(
          aggregate,
          support.mentionedAt,
          support.sourceUpvotes,
          support.sourceDocumentId,
        );
      });
    });

    // PHASE 4 — CATEGORY ITEMS (owner's design). A category claim ("known
    // for their burgers") is real, scoreable evidence about the place, but
    // until now it could only ride along as SUPPORT on a specific dish —
    // so a restaurant praised for burgers with no named burger had nothing
    // to show. Materialize each claimed category as its own item whose
    // food_id IS the category entity: honest about what it is, presentable
    // as a category card, and scored by the same mention machinery.
    //
    // The claim's mentions still bank onto matching dishes above (unchanged
    // — a dish under a loved category deserves that boost); the category
    // item carries the claim's OWN direct evidence. Restaurant-level
    // vote-total rollups exclude these rows so the same mention can't be
    // counted twice at the restaurant level.
    //
    // INVARIANT: a category item never lists itself in `categories` — a
    // category is not its own parent (also what keeps the edge derivation
    // from minting a self-edge).
    itemSupportMentions.forEach((support) => {
      support.categoryIds.forEach((categoryId) => {
        const key = `${support.restaurantId}:${categoryId}`;
        const existing = items.get(key);
        if (existing && !existing.isCategoryItem) {
          // A real dish already occupies this (restaurant, food) pair — the
          // category is genuinely ordered by name here, so the dish IS the
          // claim's home. Nothing to materialize.
          return;
        }
        const aggregate =
          existing ??
          ({
            restaurantId: support.restaurantId,
            foodId: categoryId,
            isCategoryItem: true,
            categories: [],
            baseFoodAttributes: [],
            foodAttributes: [],
            ingredients: [],
            mentionCount: 0,
            totalUpvotes: 0,
            supportMentionCount: 0,
            supportTotalUpvotes: 0,
            lastMentionedAt: null,
            firstMentionedAt: null,
            mentions: [],
          } satisfies RestaurantItemProjection);
        aggregate.foodAttributes = Array.from(
          new Set([...aggregate.foodAttributes, ...support.foodAttributeIds]),
        ).sort();
        this.applyTimedContribution(
          aggregate,
          support.mentionedAt,
          support.sourceUpvotes,
          support.sourceDocumentId,
        );
        items.set(key, aggregate);
      });
    });

    return Array.from(items.values());
  }

  /** One (document, kind) claim per connection — the doc-null lane (ballot
   *  mentions etc.) is never deduped, it has no document identity. */
  private alreadyContributed(
    aggregate: RestaurantItemProjection,
    kind: 'direct' | 'support',
    sourceDocumentId: string | null,
  ): boolean {
    if (!sourceDocumentId) {
      return false;
    }
    const key = `${kind}:${sourceDocumentId}`;
    aggregate.seenContributions ??= new Set();
    if (aggregate.seenContributions.has(key)) {
      return true;
    }
    aggregate.seenContributions.add(key);
    return false;
  }

  private applyTimedContribution(
    aggregate: RestaurantItemProjection,
    mentionedAt: Date,
    upvotes: number,
    sourceDocumentId: string | null,
  ): void {
    if (this.alreadyContributed(aggregate, 'direct', sourceDocumentId)) {
      return;
    }
    aggregate.mentionCount += 1;
    aggregate.totalUpvotes += Math.max(0, upvotes);
    aggregate.mentions.push({
      kind: 'direct',
      mentionedAt,
      sourceUpvotes: Math.max(0, upvotes),
      sourceDocumentId,
    });

    if (
      !aggregate.firstMentionedAt ||
      mentionedAt.getTime() < aggregate.firstMentionedAt.getTime()
    ) {
      aggregate.firstMentionedAt = mentionedAt;
    }
    if (
      !aggregate.lastMentionedAt ||
      mentionedAt.getTime() > aggregate.lastMentionedAt.getTime()
    ) {
      aggregate.lastMentionedAt = mentionedAt;
    }
  }

  private applySupportContribution(
    aggregate: RestaurantItemProjection,
    mentionedAt: Date,
    upvotes: number,
    sourceDocumentId: string | null,
  ): void {
    if (this.alreadyContributed(aggregate, 'support', sourceDocumentId)) {
      return;
    }
    aggregate.supportMentionCount += 1;
    aggregate.supportTotalUpvotes += Math.max(0, upvotes);
    aggregate.mentions.push({
      kind: 'support',
      mentionedAt,
      sourceUpvotes: Math.max(0, upvotes),
      sourceDocumentId,
    });

    if (
      !aggregate.lastMentionedAt ||
      mentionedAt.getTime() > aggregate.lastMentionedAt.getTime()
    ) {
      aggregate.lastMentionedAt = mentionedAt;
    }
  }

  private async replaceRestaurantPraise(
    tx: PrismaTransaction,
    restaurantIds: string[],
    restaurantEvents: ActiveRestaurantEvent[],
  ): Promise<void> {
    const praiseTotals = new Map<string, number>();
    // `general_praise` is a RESTAURANT-level fact riding a dish-scoped mention key,
    // so one source that praises a restaurant across N dishes emits N events. It's
    // still one endorsement — dedupe per (sourceDocument, restaurant) before summing
    // so the source's upvotes count once, not N times (undoes the fan-out inflation).
    const countedSourcePraise = new Set<string>();

    restaurantEvents
      .filter((event) => event.evidenceType === 'general_praise')
      .forEach((event) => {
        const sourceKey = `${event.restaurantId}:${event.sourceDocumentId}`;
        if (countedSourcePraise.has(sourceKey)) {
          return;
        }
        countedSourcePraise.add(sourceKey);
        praiseTotals.set(
          event.restaurantId,
          (praiseTotals.get(event.restaurantId) ?? 0) +
            (event.sourceUpvotes ?? 0),
        );
      });

    await tx.entity.updateMany({
      where: { entityId: { in: restaurantIds } },
      data: {
        generalPraiseUpvotes: 0,
        lastUpdated: new Date(),
      },
    });

    for (const restaurantId of restaurantIds) {
      const total = praiseTotals.get(restaurantId) ?? 0;
      if (total <= 0) {
        continue;
      }

      await tx.entity.update({
        where: { entityId: restaurantId },
        data: {
          generalPraiseUpvotes: total,
          lastUpdated: new Date(),
        },
      });
    }
  }

  /**
   * Phase 4b: rebuild the REDDIT slice of restaurant-attribute evidence
   * from the active event set — same wipe-and-recount discipline as
   * signals. Only this source class is touched: places_api / cuisine_llm /
   * poll_seed / legacy_stamp rows are owned by their own writers and must
   * survive a projection rebuild (77.7% of stamped attributes come from
   * them — deriving from events alone would erase three quarters of the
   * data).
   */
  private async replaceRedditAttributeEvidence(
    tx: PrismaTransaction,
    restaurantIds: string[],
    entityEvents: ActiveRestaurantEntityEvent[],
  ): Promise<void> {
    const counts = new Map<
      string,
      { restaurantId: string; attributeId: string; observations: number }
    >();
    entityEvents.forEach((event) => {
      if (event.evidenceType !== 'restaurant_attribute') return;
      const key = `${event.restaurantId}:${event.entityId}`;
      const existing = counts.get(key) ?? {
        restaurantId: event.restaurantId,
        attributeId: event.entityId,
        observations: 0,
      };
      existing.observations += 1;
      counts.set(key, existing);
    });

    await tx.restaurantAttributeEvidence.deleteMany({
      where: {
        restaurantId: { in: restaurantIds },
        sourceClass: 'reddit_evidence',
      },
    });
    if (counts.size === 0) return;
    await tx.restaurantAttributeEvidence.createMany({
      data: Array.from(counts.values()).map((row) => ({
        restaurantId: row.restaurantId,
        attributeId: row.attributeId,
        sourceClass: 'reddit_evidence',
        observations: row.observations,
      })),
      skipDuplicates: true,
    });
  }

  /**
   * Phase 4b: `core_entities.restaurant_attributes` becomes a PROJECTION of
   * the evidence table — the union of every source's live claims, filtered
   * to ACTIVE attribute entities so archived vocabulary drops out on its
   * own. Before this, the array was merge-only: it could never shrink, so a
   * wrong attribute survived every re-extraction. Now it tracks the
   * evidence, which is the system's law everywhere else.
   */
  private async deriveRestaurantAttributes(
    tx: PrismaTransaction,
    restaurantIds: string[],
  ): Promise<void> {
    if (!restaurantIds.length) return;
    await tx.$executeRaw`
      UPDATE core_entities r
      SET restaurant_attributes = COALESCE(ev.attrs, ARRAY[]::uuid[])
      FROM (
        SELECT rid AS restaurant_id,
               (SELECT array_agg(DISTINCT a.attribute_id)
                FROM core_restaurant_attribute_evidence a
                JOIN core_entities ae
                  ON ae.entity_id = a.attribute_id AND ae.status = 'active'
                WHERE a.restaurant_id = rid) AS attrs
        FROM unnest(${restaurantIds}::uuid[]) AS rid
      ) ev
      WHERE r.entity_id = ev.restaurant_id
        AND r.type = 'restaurant'
    `;
  }

  private async replaceRestaurantEntitySignals(
    tx: PrismaTransaction,
    restaurantIds: string[],
    entityEvents: ActiveRestaurantEntityEvent[],
  ): Promise<void> {
    const counts = new Map<
      string,
      {
        restaurantId: string;
        entityId: string;
        entityType: EntityType;
        mentionCount: number;
      }
    >();

    entityEvents.forEach((event) => {
      const key = `${event.restaurantId}:${event.entityId}`;
      const existing =
        counts.get(key) ??
        ({
          restaurantId: event.restaurantId,
          entityId: event.entityId,
          entityType: event.entityType,
          mentionCount: 0,
        } as {
          restaurantId: string;
          entityId: string;
          entityType: EntityType;
          mentionCount: number;
        });
      existing.mentionCount += 1;
      counts.set(key, existing);
    });

    await tx.restaurantEntitySignal.deleteMany({
      where: { restaurantId: { in: restaurantIds } },
    });

    if (counts.size === 0) {
      return;
    }

    await tx.restaurantEntitySignal.createMany({
      data: Array.from(counts.values()).map((row) => ({
        restaurantId: row.restaurantId,
        entityId: row.entityId,
        entityType: row.entityType,
        mentionCount: row.mentionCount,
      })),
    });
  }

  private async replaceRestaurantItems(
    tx: PrismaTransaction,
    restaurantIds: string[],
    items: RestaurantItemProjection[],
  ): Promise<string[]> {
    const existingConnections = await tx.connection.findMany({
      where: { restaurantId: { in: restaurantIds } },
    });

    const existingByKey = new Map<string, Connection>();
    existingConnections.forEach((connection) => {
      existingByKey.set(
        `${connection.restaurantId}:${connection.foodId}`,
        connection,
      );
    });

    const retainedKeys = new Set<string>();
    const affectedConnectionIds: string[] = [];
    const mentionRecords: {
      connectionId: string;
      kind: string;
      mentionedAt: Date;
      sourceUpvotes: number;
      sourceDocumentId: string | null;
    }[] = [];
    const now = new Date();

    for (const item of items) {
      const key = `${item.restaurantId}:${item.foodId}`;
      retainedKeys.add(key);

      const existing = existingByKey.get(key);
      let connectionId: string;
      if (existing) {
        await tx.connection.update({
          where: { connectionId: existing.connectionId },
          data: {
            categories: item.categories,
            foodAttributes: item.foodAttributes,
            ingredients: item.ingredients,
            mentionCount: item.mentionCount,
            totalUpvotes: item.totalUpvotes,
            supportMentionCount: item.supportMentionCount,
            supportTotalUpvotes: item.supportTotalUpvotes,
            isCategoryItem: item.isCategoryItem,
            lastMentionedAt: item.lastMentionedAt,
            lastUpdated: now,
          },
        });
        connectionId = existing.connectionId;
      } else {
        const created = await tx.connection.create({
          data: {
            restaurantId: item.restaurantId,
            foodId: item.foodId,
            categories: item.categories,
            foodAttributes: item.foodAttributes,
            ingredients: item.ingredients,
            mentionCount: item.mentionCount,
            totalUpvotes: item.totalUpvotes,
            supportMentionCount: item.supportMentionCount,
            supportTotalUpvotes: item.supportTotalUpvotes,
            isCategoryItem: item.isCategoryItem,
            lastMentionedAt: item.lastMentionedAt,
            lastUpdated: now,
            createdAt: item.firstMentionedAt ?? now,
          },
          select: { connectionId: true },
        });
        connectionId = created.connectionId;
      }

      affectedConnectionIds.push(connectionId);
      for (const mention of item.mentions) {
        mentionRecords.push({
          connectionId,
          kind: mention.kind,
          mentionedAt: mention.mentionedAt,
          sourceUpvotes: mention.sourceUpvotes,
          sourceDocumentId: mention.sourceDocumentId,
        });
      }
    }

    // Rebuild the per-contribution decay ledger for the connections we touched.
    // (Cascade on connection delete handles stale-connection rows.)
    const touchedConnectionIds = Array.from(new Set(affectedConnectionIds));
    if (touchedConnectionIds.length > 0) {
      await tx.restaurantItemMention.deleteMany({
        where: { connectionId: { in: touchedConnectionIds } },
      });
    }
    if (mentionRecords.length > 0) {
      await tx.restaurantItemMention.createMany({ data: mentionRecords });
    }

    const staleConnectionIds = existingConnections
      .filter(
        (connection) =>
          !retainedKeys.has(`${connection.restaurantId}:${connection.foodId}`),
      )
      .map((connection) => connection.connectionId);

    if (staleConnectionIds.length > 0) {
      await tx.connection.deleteMany({
        where: { connectionId: { in: staleConnectionIds } },
      });
    }

    return Array.from(new Set(affectedConnectionIds));
  }

  /**
   * ORPHANED-PROJECTION REPAIR SWEEP (root cause 2026-07-26): the post-commit
   * rebuildForRestaurants call can fail after events are durably written
   * (timeout/restart/deadlock), permanently stranding restaurants as
   * mentions-with-no-connection — 2,220 found on first audit ('carbonara
   * udon' had 3 mentions, zero connections, hence zero category edges).
   * Idempotent and cheap when there is nothing to repair; runs nightly on
   * the worker (bootstrap stops crons elsewhere). No env flag: this is
   * correctness self-healing, not spend.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async repairOrphanedProjections(): Promise<{ repaired: number }> {
    const orphans = await this.prismaService.$queryRaw<
      Array<{ restaurantId: string }>
    >`
      SELECT DISTINCT ev.restaurant_id AS "restaurantId"
      FROM core_restaurant_entity_events ev
      JOIN core_entities e
        ON e.entity_id = ev.restaurant_id AND e.status = 'active'
      WHERE NOT EXISTS (
        SELECT 1 FROM core_restaurant_items i
        WHERE i.restaurant_id = ev.restaurant_id
      )
    `;
    if (!orphans.length) {
      return { repaired: 0 };
    }
    this.logger.warn('Orphaned projections found — repairing', {
      operation: 'projection_orphan_repair',
      count: orphans.length,
    });
    let repaired = 0;
    for (
      let offset = 0;
      offset < orphans.length;
      offset += ProjectionRebuildService.REPAIR_BATCH_SIZE
    ) {
      const batch = orphans
        .slice(offset, offset + ProjectionRebuildService.REPAIR_BATCH_SIZE)
        .map((o) => o.restaurantId);
      try {
        await this.rebuildForRestaurants(batch);
        repaired += batch.length;
      } catch (error) {
        // logger.error IS the Sentry seam — a failing repair batch is loud.
        this.logger.error('Orphaned-projection repair batch failed', error, {
          operation: 'projection_orphan_repair',
          batchSize: batch.length,
        });
      }
    }
    this.logger.info('Orphaned-projection repair complete', {
      operation: 'projection_orphan_repair',
      repaired,
      of: orphans.length,
    });
    return { repaired };
  }
}
