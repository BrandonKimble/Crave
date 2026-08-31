import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { Connection, EntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { derivePlaceAttributes as derivePlaceAttributesProjection } from './place-attribute-projection';
import {
  ITEM_CATEGORY_EDGE_LOCK,
  itemCategoryEdgeDeleteSql,
  itemCategoryEdgeInsertSql,
  itemCategoryEdgeProspectiveCountSql,
} from './food-category-edge-sql';
import { COLLAPSE_DROP_FRACTION } from '../../external-integrations/shared/source-table-collapse-alarm.service';

type PrismaTransaction = Prisma.TransactionClient;

type ActivePlaceEvent = {
  extractionRunId: string;
  placeId: string;
  sourceDocumentId: string;
  mentionKey: string;
  evidenceType: string;
  mentionedAt: Date;
  sourceUpvotes: number;
};

type ActivePlaceEntityEvent = {
  extractionRunId: string;
  placeId: string;
  sourceDocumentId: string;
  mentionKey: string;
  entityId: string;
  entityType: EntityType;
  evidenceType: string;
  isMenuItem: boolean | null;
  mentionedAt: Date;
  sourceUpvotes: number;
};

type MentionEventGroup = {
  placeId: string;
  mentionKey: string;
  events: ActivePlaceEntityEvent[];
};

type ItemSupportMention = {
  placeId: string;
  categoryIds: string[];
  mentionedAt: Date;
  sourceUpvotes: number;
  /** §8 provenance unification — the calibration room this support came from. */
  sourceDocumentId: string | null;
  itemAttributeIds: string[];
};

type PlaceItemProjection = {
  placeId: string;
  itemId: string;
  /** Phase 4: this row is a CATEGORY claim materialized as an item. */
  isCategoryItem: boolean;
  categories: string[];
  baseItemAttributes: string[];
  itemAttributes: string[];
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
  async rebuildForPlaces(
    placeIds: string[],
    tx?: PrismaTransaction,
  ): Promise<{ connectionIds: string[]; placeIds: string[] }> {
    const uniquePlaceIds = Array.from(
      new Set(placeIds.filter((value): value is string => Boolean(value))),
    );
    if (!uniquePlaceIds.length) {
      return { connectionIds: [], placeIds: [] };
    }

    if (tx) {
      const connectionIds = await this.rebuildForPlacesTx(tx, uniquePlaceIds);
      return { connectionIds, placeIds: uniquePlaceIds };
    }

    const connectionIds = await this.prismaService.$transaction(
      async (transaction) =>
        this.rebuildForPlacesTx(transaction, uniquePlaceIds),
      { timeout: 15 * 60 * 1000 },
    );

    return { connectionIds, placeIds: uniquePlaceIds };
  }

  private async rebuildForPlacesTx(
    tx: PrismaTransaction,
    placeIds: string[],
  ): Promise<string[]> {
    // SERIALIZE PER RESTAURANT (async-integrity step 4, H4): rebuilds are
    // full-replace (read events → delete → insert); two concurrent
    // rebuilds of the same restaurant let the one with the STALER snapshot
    // commit last and silently erase the fresher one's contribution. Ids
    // are sorted so overlapping sets always lock in the same order (no
    // deadlock). Same primitive as entity-identity creation locks.
    for (const placeId of [...placeIds].sort()) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rebuild:place:${placeId}`}))`;
    }
    const [placeEvents, entityEvents] = await Promise.all([
      this.loadActivePlaceEvents(tx, placeIds),
      this.loadActivePlaceEntityEvents(tx, placeIds),
    ]);

    await Promise.all([
      this.replacePlacePraise(tx, placeIds, placeEvents),
      this.replacePlaceEntitySignals(tx, placeIds, entityEvents),
      this.replaceRedditAttributeEvidence(tx, placeIds, entityEvents),
    ]);

    // Phase 4b: the attribute array is DERIVED from evidence now — this is
    // the line that makes re-extraction able to correct a wrong attribute.
    await this.derivePlaceAttributes(tx, placeIds);

    const mentionGroups = this.groupEntityEventsByMention(entityEvents);
    const itemSupportMentions = this.buildItemSupportMentions(mentionGroups);
    const itemProjections = this.buildPlaceItemProjections(
      mentionGroups,
      itemSupportMentions,
    );

    const connectionIds = await this.replacePlaceItems(
      tx,
      placeIds,
      itemProjections,
    );

    // Keep the canonical per-food category edges (derived_food_category_edges —
    // what SEARCH reads for category membership) consistent with the just-
    // rebuilt connections: re-project each touched food's
    // knowledge_categories facet against its LIVE connection count (D4 —
    // membership is knowledge on the dish entity; the rebuild only changes
    // which foods are live here). Incremental + tx-consistent.
    await this.refreshItemCategoryEdgesForPlaces(tx, placeIds);

    this.logger.debug('Rebuilt restaurant projections from active evidence', {
      placeCount: placeIds.length,
      placeEventCount: placeEvents.length,
      placeEntityEventCount: entityEvents.length,
      itemSupportMentionCount: itemSupportMentions.length,
      rebuiltConnectionCount: connectionIds.length,
    });

    return connectionIds;
  }

  private async refreshItemCategoryEdgesForPlaces(
    tx: PrismaTransaction,
    placeIds: string[],
  ): Promise<void> {
    if (!placeIds.length) return;
    // The SQL is FoodCategoryEdgeBuilderService's too — see
    // food-category-edge-sql.ts for why the incremental and full-replace
    // writers must derive membership from one text.
    const scope = { placeIdsParam: '$1' };
    await tx.$executeRawUnsafe(ITEM_CATEGORY_EDGE_LOCK);
    // REFUSE A COLLAPSE, NOT MERELY A ZERO (2026-08-31, and the second draft
    // of this guard — the first checked only for EMPTY input and would have
    // sailed straight past the live danger: measured that day, a 50-place
    // scope derived 2 rows against 152 standing, so "not empty" was true and
    // the wipe would have proceeded. An emptiness test cannot see a collapse.
    //
    // Membership comes from the dish-knowledge knowledge_categories facet,
    // which a separate pass backfills; activation rebuilds EVERY place, so a
    // half-filled facet silently guts category search ("tacos" stops finding
    // al pastor). We price the rebuild against what stands and refuse a
    // catastrophic shrink, borrowing the drop fraction this repo already
    // ruled on for source-table collapse rather than inventing a second
    // number: nothing legitimate removes a fifth of a derived set in one
    // step, while an unrun producer removes nearly all of it.
    const [standing] = await tx.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT count(*)::int AS n FROM derived_food_category_edges
        WHERE food_id IN (
          SELECT DISTINCT food_id FROM core_restaurant_items
          WHERE restaurant_id = ANY($1::uuid[])
        )`,
      placeIds,
    );
    const standingEdges = standing?.n ?? 0;
    if (standingEdges > 0) {
      const [prospective] = await tx.$queryRawUnsafe<Array<{ n: number }>>(
        itemCategoryEdgeProspectiveCountSql(scope),
        placeIds,
      );
      const prospectiveEdges = prospective?.n ?? 0;
      if (prospectiveEdges < standingEdges * (1 - COLLAPSE_DROP_FRACTION)) {
        this.logger.error(
          'Category-edge refresh REFUSED: rebuilding would collapse category membership — keeping what stands (run dish-knowledge synthesis, then rebuild)',
          { places: placeIds.length, standingEdges, prospectiveEdges },
        );
        return;
      }
    }
    await tx.$executeRawUnsafe(itemCategoryEdgeDeleteSql(scope), placeIds);
    await tx.$executeRawUnsafe(itemCategoryEdgeInsertSql(scope), placeIds);
  }

  /* ACTIVE-RUN IS A JOIN PREDICATE, NOT A POST-FILTER (D47 scale pass).
   * "This event belongs to its document's active generation" is
   * `sd.active_extraction_run_id = ev.extraction_run_id` — a column-to-column
   * comparison, which Prisma's relation filters cannot express, so both
   * loaders used to fetch EVERY generation's events for the batch, carry a
   * joined column solely to compare it in JS, and discard the losers. This
   * file already states the same predicate in raw SQL twice (sweepTombstoneEvents'
   * repoint and dup-delete CTEs); these were the odd dialect out.
   *
   * The discard rate is not static, and that is why this is a shape fix rather
   * than a micro-optimisation. supersedeAndActivate only DELETES a superseded
   * generation when it shares the activating run's systemPromptHash — a
   * re-extraction under an ITERATED prompt, which is the entire point of the
   * re-extract rail, retains its predecessor forever. So the rows fetched grow
   * one full generation per prompt version while the rows kept stay at one.
   * On the mirror today (one generation, so nothing is discarded yet) the
   * hottest 50-restaurant batch measured 12,271 rows: 121 ms via findMany+JS
   * filter, 59 ms via the join. Each retained generation multiplies the
   * former and leaves the latter flat, because the index the predicate wants
   * (idx_source_documents_active_run) can only be used inside the query. */
  private async loadActivePlaceEvents(
    tx: PrismaTransaction,
    placeIds: string[],
  ): Promise<ActivePlaceEvent[]> {
    if (!placeIds.length) {
      return [];
    }
    return tx.$queryRaw<ActivePlaceEvent[]>`
      SELECT
        ev.extraction_run_id::text AS "extractionRunId",
        ev.restaurant_id::text     AS "placeId",
        ev.source_document_id::text AS "sourceDocumentId",
        ev.mention_key             AS "mentionKey",
        ev.evidence_type::text     AS "evidenceType",
        ev.mentioned_at            AS "mentionedAt",
        ev.source_upvotes          AS "sourceUpvotes"
      FROM core_restaurant_events ev
      JOIN collection_source_documents sd
        ON sd.document_id = ev.source_document_id
       AND sd.active_extraction_run_id = ev.extraction_run_id
      WHERE ev.restaurant_id = ANY(${placeIds}::uuid[])
    `;
  }

  private async loadActivePlaceEntityEvents(
    tx: PrismaTransaction,
    placeIds: string[],
  ): Promise<ActivePlaceEntityEvent[]> {
    if (!placeIds.length) {
      return [];
    }
    return tx.$queryRaw<ActivePlaceEntityEvent[]>`
      SELECT
        ev.extraction_run_id::text  AS "extractionRunId",
        ev.restaurant_id::text      AS "placeId",
        ev.source_document_id::text AS "sourceDocumentId",
        ev.mention_key              AS "mentionKey",
        ev.entity_id::text          AS "entityId",
        ev.entity_type::text        AS "entityType",
        ev.evidence_type::text      AS "evidenceType",
        ev.is_menu_item             AS "isMenuItem",
        ev.mentioned_at             AS "mentionedAt",
        ev.source_upvotes           AS "sourceUpvotes"
      FROM core_restaurant_entity_events ev
      JOIN collection_source_documents sd
        ON sd.document_id = ev.source_document_id
       AND sd.active_extraction_run_id = ev.extraction_run_id
      WHERE ev.restaurant_id = ANY(${placeIds}::uuid[])
    `;
  }

  private groupEntityEventsByMention(
    entityEvents: ActivePlaceEntityEvent[],
  ): MentionEventGroup[] {
    const groups = new Map<string, MentionEventGroup>();

    entityEvents.forEach((event) => {
      const key = `${event.placeId}:${event.mentionKey}`;
      const existing = groups.get(key);
      if (existing) {
        existing.events.push(event);
        return;
      }

      groups.set(key, {
        placeId: event.placeId,
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
      const itemEvent = group.events.find(
        (event) =>
          event.entityType === 'item' &&
          (event.evidenceType === 'menu_item_food' ||
            event.evidenceType === 'food_mention'),
      );
      // Any group that MINTS an item (menu_item_food or, since the round-2
      // 705-pair fix, a direct food_mention) must not ALSO count as a
      // support mention — that would credit one comment twice on the same
      // (restaurant, food) row. Support is now purely for category/
      // attribute-only groups.
      if (itemEvent) {
        return;
      }

      const categoryIds = Array.from(
        new Set(
          group.events
            .filter((event) => event.evidenceType === 'food_category')
            .map((event) => event.entityId),
        ),
      );
      const itemAttributeIds = Array.from(
        new Set(
          group.events
            .filter((event) => event.evidenceType === 'item_attribute')
            .map((event) => event.entityId),
        ),
      );
      if (categoryIds.length === 0 && itemAttributeIds.length === 0) {
        return;
      }

      mentions.push({
        placeId: group.placeId,
        categoryIds,
        mentionedAt: group.events[0]?.mentionedAt ?? new Date(0),
        sourceUpvotes: group.events[0]?.sourceUpvotes ?? 0,
        sourceDocumentId: group.events[0]?.sourceDocumentId ?? null,
        itemAttributeIds,
      });
    });

    return mentions.sort(
      (left, right) => left.mentionedAt.getTime() - right.mentionedAt.getTime(),
    );
  }

  private buildPlaceItemProjections(
    mentionGroups: MentionEventGroup[],
    itemSupportMentions: ItemSupportMention[],
  ): PlaceItemProjection[] {
    const items = new Map<string, PlaceItemProjection>();

    mentionGroups.forEach((group) => {
      // A DIRECT food claim mints the connection whether or not it is a
      // specific menu item. "34th st cafe has a killer salad" is a real,
      // searchable claim about salad at that restaurant; the old
      // menu_item-only predicate silently discarded 705 (restaurant, food)
      // pairs of exactly this shape — 12.4% of food_mention-bearing pairs
      // produced NOTHING (round-2 census; owner ruled 2026-08-06 they
      // project as the family-level link, with the specific dish arriving
      // only when the source names one — which extraction already handles).
      const itemEvent = group.events.find(
        (event) =>
          event.entityType === 'item' &&
          ((event.isMenuItem === true &&
            event.evidenceType === 'menu_item_food') ||
            event.evidenceType === 'food_mention'),
      );
      if (!itemEvent) {
        return;
      }

      const categories = Array.from(
        new Set(
          group.events
            .filter((event) => event.evidenceType === 'food_category')
            .map((event) => event.entityId),
        ),
      );
      const itemAttributes = Array.from(
        new Set(
          group.events
            .filter((event) => event.evidenceType === 'item_attribute')
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
      const key = `${itemEvent.placeId}:${itemEvent.entityId}`;
      const aggregate =
        items.get(key) ??
        ({
          placeId: itemEvent.placeId,
          itemId: itemEvent.entityId,
          isCategoryItem: false,
          categories: [],
          baseItemAttributes: [],
          itemAttributes: [],
          ingredients: [],
          mentionCount: 0,
          totalUpvotes: 0,
          supportMentionCount: 0,
          supportTotalUpvotes: 0,
          lastMentionedAt: null,
          firstMentionedAt: null,
          mentions: [],
        } satisfies PlaceItemProjection);

      aggregate.categories = Array.from(
        new Set([...aggregate.categories, ...categories]),
      ).sort();
      aggregate.baseItemAttributes = Array.from(
        new Set([...aggregate.baseItemAttributes, ...itemAttributes]),
      ).sort();
      aggregate.itemAttributes = Array.from(
        new Set([...aggregate.itemAttributes, ...itemAttributes]),
      ).sort();
      aggregate.ingredients = Array.from(
        new Set([...aggregate.ingredients, ...ingredients]),
      ).sort();

      this.applyTimedContribution(
        aggregate,
        itemEvent.mentionedAt,
        itemEvent.sourceUpvotes ?? 0,
        itemEvent.sourceDocumentId,
      );

      items.set(key, aggregate);
    });

    const itemsByPlace = new Map<string, PlaceItemProjection[]>();
    items.forEach((aggregate) => {
      const existing = itemsByPlace.get(aggregate.placeId) ?? [];
      existing.push(aggregate);
      itemsByPlace.set(aggregate.placeId, existing);
    });

    itemSupportMentions.forEach((support) => {
      const placeItems = itemsByPlace.get(support.placeId) ?? [];
      if (placeItems.length === 0) {
        return;
      }

      placeItems.forEach((aggregate) => {
        const matchesCategory =
          support.categoryIds.length > 0 &&
          support.categoryIds.some((categoryId) =>
            aggregate.categories.includes(categoryId),
          );
        const matchesAttribute =
          support.itemAttributeIds.length > 0 &&
          support.itemAttributeIds.some((attributeId) =>
            aggregate.baseItemAttributes.includes(attributeId),
          );

        if (!matchesCategory && !matchesAttribute) {
          return;
        }

        if (
          support.itemAttributeIds.length > 0 &&
          !matchesAttribute &&
          matchesCategory
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
        const key = `${support.placeId}:${categoryId}`;
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
            placeId: support.placeId,
            itemId: categoryId,
            isCategoryItem: true,
            categories: [],
            baseItemAttributes: [],
            itemAttributes: [],
            ingredients: [],
            mentionCount: 0,
            totalUpvotes: 0,
            supportMentionCount: 0,
            supportTotalUpvotes: 0,
            lastMentionedAt: null,
            firstMentionedAt: null,
            mentions: [],
          } satisfies PlaceItemProjection);
        aggregate.itemAttributes = Array.from(
          new Set([...aggregate.itemAttributes, ...support.itemAttributeIds]),
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
    aggregate: PlaceItemProjection,
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
    aggregate: PlaceItemProjection,
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
    aggregate: PlaceItemProjection,
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

  private async replacePlacePraise(
    tx: PrismaTransaction,
    placeIds: string[],
    placeEvents: ActivePlaceEvent[],
  ): Promise<void> {
    const praiseTotals = new Map<string, number>();
    // `general_praise` is a RESTAURANT-level fact riding a dish-scoped mention key,
    // so one source that praises a restaurant across N dishes emits N events. It's
    // still one endorsement — dedupe per (sourceDocument, restaurant) before summing
    // so the source's upvotes count once, not N times (undoes the fan-out inflation).
    const countedSourcePraise = new Set<string>();

    placeEvents
      .filter((event) => event.evidenceType === 'general_praise')
      .forEach((event) => {
        const sourceKey = `${event.placeId}:${event.sourceDocumentId}`;
        if (countedSourcePraise.has(sourceKey)) {
          return;
        }
        countedSourcePraise.add(sourceKey);
        praiseTotals.set(
          event.placeId,
          (praiseTotals.get(event.placeId) ?? 0) + (event.sourceUpvotes ?? 0),
        );
      });

    await tx.entity.updateMany({
      where: { entityId: { in: placeIds } },
      data: {
        generalPraiseUpvotes: 0,
        lastUpdated: new Date(),
      },
    });

    for (const placeId of placeIds) {
      const total = praiseTotals.get(placeId) ?? 0;
      if (total <= 0) {
        continue;
      }

      await tx.entity.update({
        where: { entityId: placeId },
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
    placeIds: string[],
    entityEvents: ActivePlaceEntityEvent[],
  ): Promise<void> {
    const counts = new Map<
      string,
      { placeId: string; attributeId: string; observations: number }
    >();
    entityEvents.forEach((event) => {
      if (event.evidenceType !== 'place_attribute') return;
      const key = `${event.placeId}:${event.entityId}`;
      const existing = counts.get(key) ?? {
        placeId: event.placeId,
        attributeId: event.entityId,
        observations: 0,
      };
      existing.observations += 1;
      counts.set(key, existing);
    });

    await tx.placeAttributeEvidence.deleteMany({
      where: {
        placeId: { in: placeIds },
        sourceClass: 'reddit_evidence',
      },
    });
    if (counts.size === 0) return;
    await tx.placeAttributeEvidence.createMany({
      data: Array.from(counts.values()).map((row) => ({
        placeId: row.placeId,
        attributeId: row.attributeId,
        sourceClass: 'reddit_evidence',
        observations: row.observations,
      })),
      skipDuplicates: true,
    });
  }

  /**
   * Phase 4b: `core_entities.restaurant_attributes` is a PROJECTION of the
   * evidence table. The SQL lives in place-attribute-projection.ts (THE one
   * writer, redteam-l2 K1) — shared with the enrichment lanes so their
   * reruns correct the read column immediately, not on the next rebuild.
   */
  private async derivePlaceAttributes(
    tx: PrismaTransaction,
    placeIds: string[],
  ): Promise<void> {
    await derivePlaceAttributesProjection(tx, placeIds);
  }

  private async replacePlaceEntitySignals(
    tx: PrismaTransaction,
    placeIds: string[],
    entityEvents: ActivePlaceEntityEvent[],
  ): Promise<void> {
    const counts = new Map<
      string,
      {
        placeId: string;
        entityId: string;
        entityType: EntityType;
        mentionCount: number;
      }
    >();

    entityEvents.forEach((event) => {
      const key = `${event.placeId}:${event.entityId}`;
      const existing =
        counts.get(key) ??
        ({
          placeId: event.placeId,
          entityId: event.entityId,
          entityType: event.entityType,
          mentionCount: 0,
        } as {
          placeId: string;
          entityId: string;
          entityType: EntityType;
          mentionCount: number;
        });
      existing.mentionCount += 1;
      counts.set(key, existing);
    });

    await tx.placeEntitySignal.deleteMany({
      where: { placeId: { in: placeIds } },
    });

    if (counts.size === 0) {
      return;
    }

    await tx.placeEntitySignal.createMany({
      data: Array.from(counts.values()).map((row) => ({
        placeId: row.placeId,
        entityId: row.entityId,
        entityType: row.entityType,
        mentionCount: row.mentionCount,
      })),
    });
  }

  private async replacePlaceItems(
    tx: PrismaTransaction,
    placeIds: string[],
    items: PlaceItemProjection[],
  ): Promise<string[]> {
    const existingConnections = await tx.connection.findMany({
      where: { placeId: { in: placeIds } },
    });

    const existingByKey = new Map<string, Connection>();
    existingConnections.forEach((connection) => {
      existingByKey.set(
        `${connection.placeId}:${connection.itemId}`,
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
      const key = `${item.placeId}:${item.itemId}`;
      retainedKeys.add(key);

      const existing = existingByKey.get(key);
      let connectionId: string;
      if (existing) {
        await tx.connection.update({
          where: { connectionId: existing.connectionId },
          data: {
            categories: item.categories,
            itemAttributes: item.itemAttributes,
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
            placeId: item.placeId,
            itemId: item.itemId,
            categories: item.categories,
            itemAttributes: item.itemAttributes,
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
      await tx.placeItemMention.deleteMany({
        where: { connectionId: { in: touchedConnectionIds } },
      });
    }
    if (mentionRecords.length > 0) {
      await tx.placeItemMention.createMany({ data: mentionRecords });
    }

    const staleConnectionIds = existingConnections
      .filter(
        (connection) =>
          !retainedKeys.has(`${connection.placeId}:${connection.itemId}`),
      )
      .map((connection) => connection.connectionId);

    if (staleConnectionIds.length > 0) {
      // USER-LAYER LAW (R1): a connection a user has anchored (list item,
      // photo, curated pick) is never deleted by rebuild — it survives with
      // zeroed counters and shows up in the anchor audit as STARVED instead.
      // The FKs are ON DELETE RESTRICT, so an unfiltered delete would abort
      // the whole rebuild transaction; this filter is the law, the FK is
      // the backstop.
      const anchoredRows = await tx.$queryRaw<
        Array<{ connection_id: string }>
      >(Prisma.sql`
        SELECT c.connection_id FROM core_restaurant_items c
        WHERE c.connection_id = ANY(${staleConnectionIds}::uuid[])
          AND (
            EXISTS (SELECT 1 FROM user_list_items u WHERE u.connection_id = c.connection_id)
            OR EXISTS (SELECT 1 FROM photos p WHERE p.connection_id = c.connection_id)
            OR EXISTS (SELECT 1 FROM curated_list_items cl WHERE cl.connection_id = c.connection_id)
          )
      `);
      const anchored = new Set(anchoredRows.map((r) => r.connection_id));
      const deletable = staleConnectionIds.filter((id) => !anchored.has(id));
      if (deletable.length > 0) {
        await tx.connection.deleteMany({
          where: { connectionId: { in: deletable } },
        });
      }
      if (anchored.size > 0) {
        await tx.connection.updateMany({
          where: { connectionId: { in: Array.from(anchored) } },
          data: {
            mentionCount: 0,
            totalUpvotes: 0,
            supportMentionCount: 0,
            supportTotalUpvotes: 0,
            // F3 (final red team): zeroing only the counters left the row
            // fully matchable — search matches on categories/food_attributes
            // and reads last_mentioned_at, so an evidence-free connection
            // kept appearing in attribute/category lanes with a fresh
            // recency signal. A starved anchor survives; it does not rank.
            lastMentionedAt: null,
            categories: [],
            itemAttributes: [],
            ingredients: [],
          },
        });
        // F5 (final-final red team): zeroing counters but LEAVING the
        // mention ledger let the scorer keep scoring starved anchors from
        // dead evidence — 5 of 115 zeroed connections still held live
        // scores. The ledger is derived; clear it with the counters.
        await tx.placeItemMention.deleteMany({
          where: { connectionId: { in: Array.from(anchored) } },
        });
      }
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
  /**
   * TOMBSTONE-EVENT SWEEP — now the CRASH-WINDOW BACKSTOP, not the invariant
   * owner (2026-08-11 convergence audit, ranked change #1).
   *
   * The invariant "no new event references a merged-away entity" is owned at
   * write time by the extraction-scope chokepoints
   * (writeRestaurantEvents / writeRestaurantEntityEvents in
   * extraction-scope.service.ts): every insert resolves both dimensions
   * through the active-winner redirect map first, so a stale resolution
   * snapshot can no longer land evidence on an archived loser in steady
   * state. What this sweep still repairs, nightly:
   *   - the residual race window — a merge that COMMITS between a writer's
   *     redirect-map read and its insert's commit;
   *   - historical strandings from before the chokepoint existed;
   *   - tombstone events with NO active-winner redirect, which are counted
   *     and logged — they need a human (or vocabulary) decision, never
   *     silence.
   * Mechanism unchanged: re-point events on archived entities through
   * entity_redirects (both dimensions + praise), delete redundant copies,
   * rebuild the affected restaurants. Runs before the orphan repair so
   * re-lit restaurants get rebuilt in the same night. A rising
   * `strandedOnTombstones` / rebuild count here is now a REGRESSION signal
   * about the chokepoint, not routine convergence.
   */
  async sweepTombstoneEvents(): Promise<void> {
    // One WINNER ROW per target identity moves (DISTINCT ON) — two archived
    // losers redirecting to the same winner with the same (run, doc,
    // restaurant, type) would otherwise both move inside one snapshot and
    // abort the whole statement on the content unique (red team F5).
    const repointed = await this.prismaService.$queryRaw<
      Array<{ place_id: string }>
    >`
      WITH candidates AS (
        SELECT DISTINCT ON (
            ev.extraction_run_id, ev.source_document_id,
            ev.restaurant_id, r.to_entity_id, ev.evidence_type)
          ev.event_id, r.to_entity_id
        FROM core_restaurant_entity_events ev
        -- ACTIVE-run only (final-final red team #3): retained superseded
        -- generations are inert to every reader — re-pointing them buys
        -- nothing and silently corrupts the rollback target. Leave them
        -- byte-identical until their explicit discard.
        JOIN collection_source_documents sd
          ON sd.document_id = ev.source_document_id
         AND sd.active_extraction_run_id = ev.extraction_run_id
        JOIN core_entities e
          ON e.entity_id = ev.entity_id AND e.status = 'archived'
        JOIN entity_redirects r ON r.from_entity_id = e.entity_id
        JOIN core_entities winner
          ON winner.entity_id = r.to_entity_id AND winner.status = 'active'
        WHERE NOT EXISTS (
          SELECT 1 FROM core_restaurant_entity_events dup
          WHERE dup.extraction_run_id = ev.extraction_run_id
            AND dup.source_document_id = ev.source_document_id
            AND dup.restaurant_id = ev.restaurant_id
            AND dup.entity_id = r.to_entity_id
            AND dup.evidence_type = ev.evidence_type
        )
        ORDER BY ev.extraction_run_id, ev.source_document_id,
                 ev.restaurant_id, r.to_entity_id, ev.evidence_type,
                 ev.event_id
      ), moved AS (
        UPDATE core_restaurant_entity_events ev
        SET entity_id = candidates.to_entity_id
        FROM candidates
        WHERE ev.event_id = candidates.event_id
        RETURNING ev.restaurant_id
      )
      SELECT DISTINCT restaurant_id AS place_id FROM moved
    `;
    // Delete ONLY redundant copies: rows whose redirect points at an ACTIVE
    // winner (the claim either just moved or already exists there). Events
    // whose redirect target is itself archived are NOT deletable — they are
    // stranded recoverable evidence and stay counted below (red team F5:
    // the previous delete removed them silently). Deleted rows' restaurants
    // join the rebuild set — their counts were inflated by the duplicate
    // (round 2 ③).
    const dupDeleted = await this.prismaService.$queryRaw<
      Array<{ place_id: string }>
    >`
      WITH gone AS (
        DELETE FROM core_restaurant_entity_events ev
        USING core_entities e, entity_redirects r, core_entities winner,
              collection_source_documents sd
        WHERE ev.entity_id = e.entity_id
          -- ACTIVE-run only (final-final red team #3): see the repoint CTE.
          AND sd.document_id = ev.source_document_id
          AND sd.active_extraction_run_id = ev.extraction_run_id
          AND e.status = 'archived'
          AND r.from_entity_id = e.entity_id
          AND winner.entity_id = r.to_entity_id
          AND winner.status = 'active'
        RETURNING ev.restaurant_id
      )
      SELECT DISTINCT restaurant_id AS place_id FROM gone
    `;
    // RESTAURANT DIMENSION (round 2 ③): events keyed to a merged-away
    // RESTAURANT id are the same open tail — the projection loads by
    // restaurant_id and never sees them. Re-point both event tables through
    // the restaurant's redirect; content-unique collisions are redundant
    // copies (the winner already heard this document) and are deleted.
    const restRepointed = await this.prismaService.$queryRaw<
      Array<{ place_id: string }>
    >`
      WITH candidates AS (
        SELECT DISTINCT ON (
            ev.extraction_run_id, ev.source_document_id,
            r.to_entity_id, ev.entity_id, ev.evidence_type)
          ev.event_id, r.to_entity_id
        FROM core_restaurant_entity_events ev
        JOIN core_entities e
          ON e.entity_id = ev.restaurant_id AND e.status = 'archived'
        JOIN entity_redirects r ON r.from_entity_id = e.entity_id
        JOIN core_entities winner
          ON winner.entity_id = r.to_entity_id AND winner.status = 'active'
        WHERE NOT EXISTS (
          SELECT 1 FROM core_restaurant_entity_events dup
          WHERE dup.extraction_run_id = ev.extraction_run_id
            AND dup.source_document_id = ev.source_document_id
            AND dup.restaurant_id = r.to_entity_id
            AND dup.entity_id = ev.entity_id
            AND dup.evidence_type = ev.evidence_type
        )
        ORDER BY ev.extraction_run_id, ev.source_document_id,
                 r.to_entity_id, ev.entity_id, ev.evidence_type, ev.event_id
      ), moved AS (
        UPDATE core_restaurant_entity_events ev
        SET restaurant_id = candidates.to_entity_id
        FROM candidates
        WHERE ev.event_id = candidates.event_id
        RETURNING candidates.to_entity_id AS restaurant_id
      )
      SELECT DISTINCT restaurant_id AS place_id FROM moved
    `;
    await this.prismaService.$executeRaw`
      DELETE FROM core_restaurant_entity_events ev
      USING core_entities e, entity_redirects r, core_entities winner
      WHERE ev.restaurant_id = e.entity_id
        AND e.status = 'archived'
        AND r.from_entity_id = e.entity_id
        AND winner.entity_id = r.to_entity_id
        AND winner.status = 'active'
    `;
    const praiseRepointed = await this.prismaService.$queryRaw<
      Array<{ place_id: string }>
    >`
      WITH candidates AS (
        SELECT DISTINCT ON (
            ev.extraction_run_id, ev.source_document_id,
            r.to_entity_id, ev.evidence_type)
          ev.event_id, r.to_entity_id
        FROM core_restaurant_events ev
        JOIN core_entities e
          ON e.entity_id = ev.restaurant_id AND e.status = 'archived'
        JOIN entity_redirects r ON r.from_entity_id = e.entity_id
        JOIN core_entities winner
          ON winner.entity_id = r.to_entity_id AND winner.status = 'active'
        WHERE NOT EXISTS (
          SELECT 1 FROM core_restaurant_events dup
          WHERE dup.extraction_run_id = ev.extraction_run_id
            AND dup.source_document_id = ev.source_document_id
            AND dup.restaurant_id = r.to_entity_id
            AND dup.evidence_type = ev.evidence_type
        )
        ORDER BY ev.extraction_run_id, ev.source_document_id,
                 r.to_entity_id, ev.evidence_type, ev.event_id
      ), moved AS (
        UPDATE core_restaurant_events ev
        SET restaurant_id = candidates.to_entity_id
        FROM candidates
        WHERE ev.event_id = candidates.event_id
        RETURNING candidates.to_entity_id AS restaurant_id
      )
      SELECT DISTINCT restaurant_id AS place_id FROM moved
    `;
    await this.prismaService.$executeRaw`
      DELETE FROM core_restaurant_events ev
      USING core_entities e, entity_redirects r, core_entities winner
      WHERE ev.restaurant_id = e.entity_id
        AND e.status = 'archived'
        AND r.from_entity_id = e.entity_id
        AND winner.entity_id = r.to_entity_id
        AND winner.status = 'active'
    `;
    // Stranded = still on a tombstone after the sweep, split by dimension
    // (round-3 C5: the old count was blind to the restaurant dimension) and
    // by redirect-lessness. NOTE the entity-dimension count is dominated by
    // ~11k deliberately-archived attribute events (cuisine vocabulary)
    // awaiting the class-② repointing ruling — expected to drain then, not
    // a regression signal until it does.
    const stranded = await this.prismaService.$queryRaw<
      Array<{ entity_dim: number; place_dim: number; praise_dim: number }>
    >`
      SELECT
        (SELECT count(*)::int FROM core_restaurant_entity_events ev
          JOIN core_entities e ON e.entity_id = ev.entity_id
          WHERE e.status = 'archived') AS entity_dim,
        (SELECT count(*)::int FROM core_restaurant_entity_events ev
          JOIN core_entities e ON e.entity_id = ev.restaurant_id
          WHERE e.status = 'archived') AS place_dim,
        (SELECT count(*)::int FROM core_restaurant_events ev
          JOIN core_entities e ON e.entity_id = ev.restaurant_id
          WHERE e.status = 'archived') AS praise_dim
    `;
    const strandedCount =
      Number(stranded[0]?.entity_dim ?? 0) +
      Number(stranded[0]?.place_dim ?? 0) +
      Number(stranded[0]?.praise_dim ?? 0);
    // Archived restaurants' derived rows are dead weight the per-batch
    // rebuild never sweeps (it only touches the batch's placeIds) —
    // big-one red team: 900 stale signal rows + scores survived archival.
    await this.prismaService.$executeRaw`
      DELETE FROM core_restaurant_entity_signals s
      USING core_entities e
      WHERE e.entity_id = s.restaurant_id AND e.status = 'archived'
    `;
    await this.prismaService.$executeRaw`
      DELETE FROM core_public_entity_scores ps
      USING core_entities e
      WHERE e.entity_id = ps.subject_id AND e.status = 'archived'
    `;
    const rebuildSet = Array.from(
      new Set(
        [...repointed, ...dupDeleted, ...restRepointed, ...praiseRepointed].map(
          (row) => row.place_id,
        ),
      ),
    );
    if (rebuildSet.length > 0 || strandedCount > 0) {
      this.logger.warn('Tombstone-event sweep', {
        operation: 'tombstone_event_sweep',
        rebuiltPlaces: rebuildSet.length,
        // label matches the MEASUREMENT (round 5): events still on
        // archived entities post-sweep — no active-winner redirect existed
        // for them (moved/deleted rows are already gone by this point).
        strandedOnTombstones: strandedCount,
        strandedEntityDim: Number(stranded[0]?.entity_dim ?? 0),
        strandedPlaceDim: Number(stranded[0]?.place_dim ?? 0),
        strandedPraiseDim: Number(stranded[0]?.praise_dim ?? 0),
      });
    }
    for (let i = 0; i < rebuildSet.length; i += 50) {
      await this.rebuildForPlaces(rebuildSet.slice(i, i + 50));
    }
  }

  async repairOrphanedProjections(): Promise<{ repaired: number }> {
    // THE RECONCILER (ideal-shape pass, 2026-08-02). This used to be a
    // growing checklist of hand-enumerated brokenness ("events with no
    // connection", "stale attribute arrays", "connections that outlived
    // their evidence", …) — every red-team round added an arm, which is
    // the signature of a missing abstraction. The actual invariant is one
    // sentence: EVERY restaurant's projection must equal a fresh rebuild
    // from its surviving active evidence. rebuildForRestaurants IS that
    // statement (idempotent, byte-exact when clean, anchor-preserving —
    // proven across rounds 8–11), so the reconciler simply rebuilds every
    // restaurant that has any active evidence OR any projection rows.
    // ~6.7k restaurants in ~3 minutes nightly; no enumeration of failure
    // modes, so no future bug class ever needs a new arm.
    const orphans = await this.prismaService.$queryRaw<
      Array<{ placeId: string }>
    >`
      SELECT e.entity_id AS "placeId"
      FROM core_entities e
      WHERE e.type = 'place'
        AND (
          EXISTS (
            SELECT 1 FROM core_restaurant_entity_events ev
            JOIN collection_source_documents d
              ON d.document_id = ev.source_document_id
             AND d.active_extraction_run_id = ev.extraction_run_id
            WHERE ev.restaurant_id = e.entity_id
          )
          OR EXISTS (
            SELECT 1 FROM core_restaurant_items i
            WHERE i.restaurant_id = e.entity_id
              -- zeroed rows on evidence-less hosts are the deliberately
              -- preserved user-anchored connections; rebuilding them is a
              -- no-op but including them costs nothing and keeps this
              -- clause honest: ANY projection row qualifies its host.
          )
          OR EXISTS (
            SELECT 1 FROM core_restaurant_entity_signals sg
            WHERE sg.restaurant_id = e.entity_id
          )
        )
    `;
    if (!orphans.length) {
      return { repaired: 0 };
    }
    this.logger.info('Nightly projection reconciliation', {
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
        .map((o) => o.placeId);
      try {
        await this.rebuildForPlaces(batch);
        repaired += batch.length;
      } catch (error) {
        // logger.error IS the Sentry seam — a failing repair batch is loud.
        this.logger.error('Orphaned-projection repair batch failed', error, {
          operation: 'projection_orphan_repair',
          batchSize: batch.length,
        });
      }
    }
    // Scores are a derived table too (round-12 audit layer 6): prune
    // connection-dim rows whose connection no longer exists — the one
    // derived table the reconcile-everything invariant didn't yet cover.
    await this.prismaService.$executeRaw`
      DELETE FROM core_public_entity_scores ps
      WHERE ps.subject_type = 'connection'
        AND NOT EXISTS (
          SELECT 1 FROM core_restaurant_items i
          WHERE i.connection_id = ps.subject_id
        )`;
    this.logger.info('Orphaned-projection repair complete', {
      operation: 'projection_orphan_repair',
      repaired,
      of: orphans.length,
    });
    return { repaired };
  }
}
