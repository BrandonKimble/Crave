import { canonicalFold, identityInsertData } from './entity-identity';
import { addSurfaces } from './entity-surface.service';
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EntityStatus, EntityType } from '@prisma/client';
import { identityScope } from '../../../shared/locale';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { LLMService } from '../../external-integrations/llm/llm.service';
import { PooledBatchRunner } from '../../external-integrations/llm/pooled-batch-runner';
import { recordUnanswered } from '../../external-integrations/llm/unanswered-outcome';
import { isEnvFlagEnabled } from '../../../shared/config/env-flag';
import { DISH_KNOWLEDGE_RULE } from './dish-knowledge-rule';
import { cuisineVocabularySql, mintCuisineFacetRow } from './cuisine-attribute';
import { EntityEmbeddingReconcilerService } from '../../entity-text-search/entity-embedding-reconciler.service';

export interface DishKnowledgeSummary {
  dishesProcessed: number;
  ingredientsLinked: number;
  ingredientEntitiesCreated: number;
  aliasesAdded: number;
  /** Cuisine facet (S4): canonical cuisine attribute ids linked to dishes. */
  cuisinesLinked: number;
  cuisineEntitiesCreated: number;
  /** Category facet (D4): canonical item-entity category ids linked to dishes. */
  categoriesLinked: number;
  categoryEntitiesCreated: number;
  /** Grain bridge: (restaurant, dish) rows whose food_attributes were
   *  re-projected from the dish entity's knowledge cuisines. */
  connectionsProjected: number;
}

/**
 * KNOWLEDGE TIER of the ingredient/alias system. The collection prompt stays
 * pure testimony (it reports only what sources said); this pass supplies the
 * world knowledge — once per dish entity, offline:
 *
 * - canonicalIngredients: typical contents of the dish AS NAMED ("al pastor
 *   taco" -> pork, pineapple...). Identity modifiers live in the entity name
 *   by the composition law, so "vegan al pastor taco" is a different entity
 *   whose synthesis correctly excludes pork — no per-mention nuance needed.
 * - aliases: established shorthand/co-names ("ctm", "army stew"), merged into
 *   entity.aliases (embedding marked stale so the dense doc re-embeds).
 *
 * Runs per NEW dish (knowledgeSynthesizedAt stamp), batched ~20 dishes per
 * LLM call. Cron flag-gated (DISH_KNOWLEDGE_SYNTHESIS_ENABLED) + manual
 * script (scripts/run-dish-knowledge-synthesis.ts — dry-run by default);
 * same pattern as the sibling-edge builder.
 */
@Injectable()
export class DishKnowledgeSynthesisService {
  private readonly logger: LoggerService;
  private cronInFlight = false;
  private static readonly DISHES_PER_CALL = 20;
  /** THE PERIOD-DEADLINE CONTRACT (sweep-rail parity, 2026-08-12): a nightly
   *  pass must never outlive the night that scheduled it. Every other
   *  batch-backed sweep (knowledge-maintenance → label-sweep → vocabulary)
   *  already sizes its bounded wait to its own rail period; this lane was
   *  the one pooled consumer silently inheriting the runner's default
   *  timeout instead. Sized to the cron period (24h). */
  private static readonly RAIL_PERIOD_MS = 24 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LLMService,
    private readonly pooled: PooledBatchRunner,
    loggerService: LoggerService,
    private readonly entityEmbeddings: EntityEmbeddingReconcilerService,
  ) {
    this.logger = loggerService.setContext('DishKnowledgeSynthesisService');
  }

  @Cron(CronExpression.EVERY_DAY_AT_5AM)
  async nightlyPass(): Promise<void> {
    // Canonical env-flag dialect (F466/F401): default OFF, and '1'/'yes'/'on'
    // now mean what an operator typing them plainly meant.
    if (!isEnvFlagEnabled(process.env.DISH_KNOWLEDGE_SYNTHESIS_ENABLED)) return;
    // Multi-dyno safety lives at the bootstrap chokepoint (main.ts stops all
    // crons on non-worker runtimes) — no per-service guard here.
    if (this.cronInFlight) return;
    this.cronInFlight = true;
    try {
      await this.run({
        limit: 2000,
        deadlineAt: Date.now() + DishKnowledgeSynthesisService.RAIL_PERIOD_MS,
      });
    } catch (error) {
      this.logger.error('Dish knowledge nightly pass failed', {
        error:
          error instanceof Error
            ? { message: error.message }
            : { message: String(error) },
      });
    } finally {
      this.cronInFlight = false;
    }
  }

  async run(
    options: {
      limit?: number;
      dryRun?: boolean;
      /** Wall-clock epoch-ms deadline for the pooled WAIT, owned by the rail
       *  that scheduled this pass (the nightly cron passes its own period).
       *  Absent = the runner's default bounded wait (manual script runs). */
      deadlineAt?: number;
    } = {},
  ): Promise<DishKnowledgeSummary> {
    const limit = options.limit ?? 500;
    const dryRun = options.dryRun ?? false;
    const summary: DishKnowledgeSummary = {
      dishesProcessed: 0,
      ingredientsLinked: 0,
      ingredientEntitiesCreated: 0,
      aliasesAdded: 0,
      cuisinesLinked: 0,
      cuisineEntitiesCreated: 0,
      categoriesLinked: 0,
      categoryEntitiesCreated: 0,
      connectionsProjected: 0,
    };

    // Due = never synthesized, OR stamped by a superseded rule version
    // (P7 re-open, 2026-08-17), OR the dish NAME changed since the stamp
    // (redteam-l2 K4: the name is a synthesis INPUT — "vegan al pastor
    // taco" is different knowledge — so a renamed dish re-synthesizes).
    // '=' law, not '<' (claim-verdict-ledger doctrine; red team 2026-08-19
    // D1): a hearing is answered by the rule IN FORCE, so a rollback to a
    // lower ledgered version re-opens work the wrong newer rule stamped —
    // `lt` would leave it invisible forever. IS DISTINCT FROM is that
    // equality with NULL treated as "answered by nothing", which is due.
    const dishes = (
      await this.prisma.$queryRaw<Array<{ entity_id: string; name: string }>>`
        SELECT entity_id, name
          FROM core_entities
         WHERE type = 'item'::entity_type
           AND status = 'active'::entity_status
           AND (knowledge_synthesized_at IS NULL
             OR knowledge_prompt_version IS DISTINCT FROM ${DISH_KNOWLEDGE_RULE.version}::int
             OR knowledge_synthesized_name IS DISTINCT FROM name)
         ORDER BY created_at ASC
         LIMIT ${limit}`
    ).map((row) => ({ entityId: row.entity_id, name: row.name }));
    if (!dishes.length) {
      // Reconciler law: the grain bridge is derived from state (entity
      // version vs connection stamp), so it runs even when no dish is due —
      // a crash between a past synthesis and its projection leaves owed
      // rows that only a state-driven pass can find.
      if (!dryRun) {
        summary.connectionsProjected = await this.projectKnowledgeCuisines();
      }
      return summary;
    }

    // POOLED BATCH, one job for the whole pass (prompt-fleet audit
    // 2026-08-11): this lane was the fleet's biggest output-token spender
    // (7.06M output tokens / 30d in the ledger) running sync where nobody
    // waits — the nightly cron and the manual script both tolerate batch
    // latency, at half the price. Assembly and parsing are the SAME parts
    // the sync synthesizeDishKnowledgeBatch uses (llm.service.ts), so the
    // two paths cannot drift. An unanswered chunk leaves its dishes
    // unstamped (knowledgeSynthesizedAt stays null) and the next pass
    // re-offers them — never fabricated knowledge.
    const chunks: Array<typeof dishes> = [];
    for (
      let offset = 0;
      offset < dishes.length;
      offset += DishKnowledgeSynthesisService.DISHES_PER_CALL
    ) {
      chunks.push(
        dishes.slice(
          offset,
          offset + DishKnowledgeSynthesisService.DISHES_PER_CALL,
        ),
      );
    }
    const remainingMs = options.deadlineAt
      ? options.deadlineAt - Date.now()
      : null;
    if (remainingMs !== null && remainingMs <= 0) {
      // The deadline elapsed before any ask was posed: nothing was asked,
      // so EVERYTHING stays due and nothing may be stamped.
      recordUnanswered(this.logger, {
        lane: 'dish.knowledge_synthesize',
        unit: 'dish',
        count: dishes.length,
        reason: 'deadline_elapsed',
      });
      return summary;
    }
    const firstParts = this.llmService.dishKnowledgeRequestParts([]);
    const responses = await this.pooled.generateMany({
      caller: 'dish.knowledge_synthesize',
      items: chunks.map((batch, index) => ({
        key: `chunk-${index}`,
        prompt: this.llmService.dishKnowledgeRequestParts(
          batch.map((dish) => ({ name: dish.name })),
        ).prompt,
      })),
      systemInstruction: firstParts.systemInstruction,
      generationConfig: firstParts.generationConfig,
      ...(remainingMs !== null ? { timeoutMs: remainingMs } : {}),
    });

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      const batch = chunks[chunkIndex];
      const text = responses.get(`chunk-${chunkIndex}`);
      if (!text) {
        recordUnanswered(this.logger, {
          lane: 'dish.knowledge_synthesize',
          unit: 'dish',
          count: batch.length,
          reason: 'chunk_unanswered',
        });
        continue;
      }
      let knowledge: {
        ingredients: string[];
        aliases: string[];
        cuisines: string[];
        categories: string[];
      }[];
      try {
        knowledge = this.llmService.parseDishKnowledgeResponse(
          text,
          batch.length,
        );
      } catch (error) {
        recordUnanswered(this.logger, {
          lane: 'dish.knowledge_synthesize',
          unit: 'dish',
          count: batch.length,
          reason: 'unparseable',
        });
        this.logger.warn('Dish knowledge chunk unparseable detail', {
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        });
        continue;
      }

      for (let i = 0; i < batch.length; i += 1) {
        const dish = batch[i];
        const result = knowledge[i] ?? {
          ingredients: [],
          aliases: [],
          cuisines: [],
          categories: [],
        };

        if (dryRun) {
          this.logger.info('Would synthesize dish knowledge', {
            dish: dish.name,
            ingredients: result.ingredients,
            aliases: result.aliases,
            cuisines: result.cuisines,
            categories: result.categories,
          });
          summary.dishesProcessed += 1;
          summary.ingredientsLinked += result.ingredients.length;
          summary.aliasesAdded += result.aliases.length;
          summary.cuisinesLinked += result.cuisines.length;
          summary.categoriesLinked += result.categories.length;
          continue;
        }

        const ingredientIds: string[] = [];
        for (const name of result.ingredients) {
          const { entityId, created } = await this.ensureIngredientEntity(name);
          ingredientIds.push(entityId);
          if (created) summary.ingredientEntitiesCreated += 1;
        }

        // Cuisine facet (S4): resolve each tradition name onto THE canonical
        // facet='cuisine' place_attribute row — the same canonical entities
        // core_restaurant_attribute_evidence points at — so dish-side and
        // restaurant-side cuisine share one vocabulary.
        const cuisineIds: string[] = [];
        for (const name of result.cuisines) {
          const resolved = await this.ensureCuisineAttributeEntity(name);
          if (!resolved) continue;
          cuisineIds.push(resolved.entityId);
          if (resolved.created) summary.cuisineEntitiesCreated += 1;
        }

        // Category facet (D4): resolve each broader dish class onto THE
        // canonical active ITEM entity carrying that name — the same rows
        // the per-mention category arrays used to point at, so search's
        // category expansion keeps its vocabulary. Never the dish itself
        // (a category is not its own parent), and never a cuisine row —
        // the write-time twin of the prompt's never-a-tradition law.
        const categoryIds: string[] = [];
        for (const name of result.categories) {
          const resolved = await this.ensureCategoryEntity(name, dish.name);
          if (!resolved) continue;
          if (resolved.entityId === dish.entityId) continue;
          categoryIds.push(resolved.entityId);
          if (resolved.created) summary.categoryEntitiesCreated += 1;
        }

        // Established shorthand, minus the dish's own name. NOTE there is no
        // "already banked?" filter here any more, and there does not need to
        // be: addSurfaces is idempotent per (entity, locale, form), so a
        // re-offer of an existing form is a no-op insert. The old
        // hand-rolled dedupe against the loaded aliases[] array only ever
        // duplicated that guarantee — less exactly, since it compared with
        // `toLowerCase()` while the row's uniqueness is on the canonical
        // fold. `aliasesAdded` therefore counts forms OFFERED, which is what
        // this counter has always really measured.
        const dishNameLower = dish.name.trim().toLowerCase();
        const newAliases = result.aliases.filter(
          (alias) => alias !== dishNameLower,
        );
        // A1: established shorthand goes through THE surface writer, which
        // marks the dense doc stale for the reconciler.
        // Locale UNSET ('und'): this prompt bans translation and works on
        // an English corpus, so a language tag here would be fabricated —
        // and these are SURFACES, never labels (the plan's NEVER list).
        // ORDER (red team 2026-08-19 M6): surfaces land BEFORE the done-
        // stamp. The old order stamped first — a crash between the two left
        // paid aliases unlanded on a dish marked done forever (verdict-
        // before-effect, inverted). addSurfaces is idempotent, so a crash
        // after surfaces but before the stamp just re-offers next pass.
        if (newAliases.length) {
          await this.prisma.$transaction((tx) =>
            addSurfaces(
              tx,
              dish.entityId,
              newAliases.map((alias) => ({
                form: alias,
                source: 'knowledge_synthesis' as const,
              })),
            ),
          );
        }
        await this.prisma.entity.update({
          where: { entityId: dish.entityId },
          data: {
            canonicalIngredients: Array.from(new Set(ingredientIds)),
            knowledgeCuisines: Array.from(new Set(cuisineIds)),
            knowledgeCategories: Array.from(new Set(categoryIds)),
            knowledgeSynthesizedAt: new Date(),
            knowledgePromptVersion: DISH_KNOWLEDGE_RULE.version,
            // K4: stamp the name ANSWERED FOR (query-time), so a rename
            // mid-pass still re-opens the dish next pass.
            knowledgeSynthesizedName: dish.name,
          },
        });
        summary.dishesProcessed += 1;
        summary.ingredientsLinked += ingredientIds.length;
        summary.aliasesAdded += newAliases.length;
        summary.cuisinesLinked += cuisineIds.length;
        summary.categoriesLinked += categoryIds.length;
      }
    }

    if (!dryRun) {
      summary.connectionsProjected = await this.projectKnowledgeCuisines();
    }

    this.logger.info('Dish knowledge synthesis pass complete', {
      dryRun,
      ...(summary as unknown as Record<string, unknown>),
    });
    return summary;
  }

  /**
   * THE GRAIN BRIDGE (S4): dish-side cuisine is KNOWLEDGE on the food
   * ENTITY; search filters at (restaurant, dish) grain via
   * core_restaurant_items.food_attributes. This projection stamps each
   * connection's food_attributes with its dish entity's knowledge cuisines.
   *
   * Reconciler-shaped, never event-fired: due = the connection's
   * cuisine_projection_version differs from the dish's
   * knowledge_prompt_version. SET-REPLACEMENT within the cuisine facet:
   * every facet='cuisine' id NOT in the current knowledge set is stripped,
   * the knowledge set is unioned in, non-cuisine attribute ids pass through
   * untouched — so a corrected synthesis removes the wrong cuisine instead
   * of accumulating beside it. Idempotent: a second run finds nothing due.
   */
  async projectKnowledgeCuisines(): Promise<number> {
    const updated = await this.prisma.$executeRaw`
      WITH cuisine_vocab AS (
        -- Two questions, one row (redteam-l2 K2/K5): "is x a cuisine at
        -- all?" spans every status (an ARCHIVED cuisine is still a cuisine
        -- — it must be STRIPPED below, never passed through as non-cuisine
        -- vocabulary), while "may x be WRITTEN?" is THE active-only
        -- vocabulary predicate — so a merge-archived id lingering in
        -- knowledge_cuisines can never be resurrected into
        -- food_attributes by this projection.
        SELECT ce.entity_id, (${cuisineVocabularySql('ce')}) AS is_active
          FROM core_entities ce
         WHERE ce.type = 'place_attribute'::entity_type
           AND ce.facet = 'cuisine'
      ),
      due AS (
        SELECT c.connection_id,
               e.knowledge_cuisines,
               e.knowledge_prompt_version
          FROM core_restaurant_items c
          JOIN core_entities e ON e.entity_id = c.food_id
         WHERE e.knowledge_prompt_version IS NOT NULL
           AND c.cuisine_projection_version IS DISTINCT FROM e.knowledge_prompt_version
      )
      UPDATE core_restaurant_items c
         SET food_attributes = (
               SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::uuid[])
                 FROM unnest(c.food_attributes || d.knowledge_cuisines) AS x
                WHERE (x = ANY(d.knowledge_cuisines)
                       AND EXISTS (
                             SELECT 1 FROM cuisine_vocab v
                              WHERE v.entity_id = x AND v.is_active
                           ))
                   OR NOT EXISTS (
                        SELECT 1 FROM cuisine_vocab v WHERE v.entity_id = x
                      )
             ),
             cuisine_projection_version = d.knowledge_prompt_version
        FROM due d
       WHERE c.connection_id = d.connection_id`;
    if (updated > 0) {
      this.logger.info('Knowledge-cuisine grain bridge projected', {
        connections: updated,
      });
    }
    return updated;
  }

  /**
   * Cuisine vocabulary resolves onto THE canonical facet='cuisine'
   * place_attribute rows (class ② of the 2026-08 data audit) — matched on
   * name, identity key, or any banked recall surface (fold, both sides),
   * exactly like the ingredient path below. A tradition the vocabulary has
   * never seen mints an ACTIVE facet='cuisine' row (the shipped cuisine
   * lane's shape — cuisines are a curated closed-ish set, not quarantined
   * collection vocabulary).
   */
  private async ensureCuisineAttributeEntity(
    name: string,
  ): Promise<{ entityId: string; created: boolean } | null> {
    const normalized = name.trim().toLowerCase().replace(/\s+/g, ' ');
    if (normalized.length < 2) return null;
    const folded = canonicalFold(normalized);
    const [existing] = await this.prisma.$queryRaw<
      Array<{ entity_id: string }>
    >`
      SELECT e.entity_id
        FROM core_entities e
       WHERE e.type = 'place_attribute'::entity_type
         AND e.status = 'active'::entity_status
         AND (
           e.name = ${normalized}
           OR e.identity_key = ${folded}
           OR EXISTS (
             SELECT 1 FROM entity_surface s
              WHERE s.entity_id = e.entity_id
                AND ${identityScope('s')}
                AND s.form_folded = ${folded}
           )
         )
       -- Prefer the facet-tagged canonical when both a cuisine row and an
       -- ordinary attribute answer to the same fold.
       ORDER BY (e.facet = 'cuisine') DESC NULLS LAST
       LIMIT 1`;
    if (existing) {
      return { entityId: existing.entity_id, created: false };
    }
    // THE shared minter (redteam-l2 K5): facet='cuisine' + explicit status,
    // race-safe — the same primitive the venue-facts lane calls, so the two
    // cuisine minters cannot disagree about whether a cuisine is a cuisine.
    const minted = await mintCuisineFacetRow(this.prisma, normalized, {
      forms: [normalized],
      source: 'cuisine',
    });
    // Write-time embedding law: a minted row is recallable before this
    // call returns (the minter itself is a free function with no service).
    if (minted) await this.entityEmbeddings.embedEntities([minted.entityId]);
    return minted;
  }

  /**
   * Category facet (D4): a category IS a food — the canonical active ITEM
   * entity whose name/surfaces answer to the class word ("taco", "fries").
   * Matched on name, identity key, or any banked recall surface (fold,
   * both sides), like the ingredient path below. Two refusals:
   *
   *  - a name the cuisine vocabulary claims ("japanese", "indian") is a
   *    TRADITION, never a category — the write-time twin of the prompt's
   *    never-a-tradition law, so one bad emission cannot recreate the
   *    cuisine-as-category leak the study measured (19 edges);
   *  - the dish's own name (self-parenting is filtered at the call site).
   *
   * A class word no item row answers to mints an ACTIVE item entity —
   * the same self-provisioning the per-mention category route performed,
   * now once per concept. (No unique identity constraint exists for
   * items; the fold lookup + the food-dedupe sweep own twin healing.)
   */
  private async ensureCategoryEntity(
    name: string,
    dishName: string,
  ): Promise<{ entityId: string; created: boolean } | null> {
    const normalized = name.trim().toLowerCase().replace(/\s+/g, ' ');
    if (normalized.length < 2) return null;
    if (normalized === dishName.trim().toLowerCase()) return null;
    const folded = canonicalFold(normalized);
    // Cuisine-vocabulary refusal: any active facet='cuisine' row answering
    // to this fold makes the word a tradition, not a dish class.
    const [cuisineRow] = await this.prisma.$queryRaw<
      Array<{ entity_id: string }>
    >`
      SELECT e.entity_id
        FROM core_entities e
       WHERE e.type = 'place_attribute'::entity_type
         AND e.facet = 'cuisine'
         AND e.status = 'active'::entity_status
         AND (e.name = ${normalized} OR e.identity_key = ${folded})
       LIMIT 1`;
    if (cuisineRow) {
      this.logger.warn('Dish-knowledge category refused: cuisine word', {
        category: normalized,
        dish: dishName,
      });
      return null;
    }
    const [existing] = await this.prisma.$queryRaw<
      Array<{ entity_id: string }>
    >`
      SELECT e.entity_id
        FROM core_entities e
       WHERE e.type = 'item'::entity_type
         AND e.status = 'active'::entity_status
         AND (
           e.name = ${normalized}
           OR e.identity_key = ${folded}
           OR EXISTS (
             SELECT 1 FROM entity_surface s
              WHERE s.entity_id = e.entity_id
                AND ${identityScope('s')}
                AND s.form_folded = ${folded}
           )
         )
       ORDER BY e.created_at
       LIMIT 1`;
    if (existing) {
      return { entityId: existing.entity_id, created: false };
    }
    const created = await this.prisma.entity.create({
      data: {
        name: normalized,
        type: EntityType.item,
        ...identityInsertData(normalized, EntityType.item),
      },
      select: { entityId: true },
    });
    await this.entityEmbeddings.embedEntities([created.entityId]);
    return { entityId: created.entityId, created: true };
  }

  /** Ingredient vocabulary self-provisions, same normalization as the
   *  collection pipeline (lowercase, collapsed whitespace). */
  private async ensureIngredientEntity(
    name: string,
  ): Promise<{ entityId: string; created: boolean }> {
    const normalized = name.trim().toLowerCase().replace(/\s+/g, ' ');
    // Surface-aware lookup: the collection pipeline's resolver banks losing
    // forms on the winning ingredient row — a knowledge-pass surface that
    // matches one must reuse that row, not mint a variant the resolver would
    // have merged. (Ingredients stay first-class: same surface contract as
    // every other entity type.) Matched on the FOLD, both sides, so a banked
    // "Créme Fraîche" is reachable from a synthesized "creme fraiche" — the
    // old `aliases: { has: normalized }` was byte equality and was not.
    const folded = canonicalFold(normalized);
    const [existing] = await this.prisma.$queryRaw<
      Array<{ entity_id: string }>
    >`
      SELECT e.entity_id
        FROM core_entities e
       WHERE e.type = 'ingredient'::entity_type
         -- ACTIVE only (red team 2026-08-19 M5): this second mint door used
         -- to link archived/rehearsal rows into canonicalIngredients —
         -- entities no live reader can see.
         AND e.status = 'active'::entity_status
         AND (
           e.name = ${normalized}
           -- identity-key match closes the fold-twin gap (M5): two spellings
           -- with one canonical fold must reuse one row, same law as the
           -- collection resolver's tier 1.
           OR e.identity_key = ${folded}
           OR EXISTS (
             SELECT 1 FROM entity_surface s
              WHERE s.entity_id = e.entity_id
                AND ${identityScope('s')}
                AND s.form_folded = ${folded}
           )
         )
       LIMIT 1`;
    if (existing) {
      return { entityId: existing.entity_id, created: false };
    }
    try {
      const created = await this.prisma.entity.create({
        data: {
          name: normalized,
          type: EntityType.ingredient,
          ...identityInsertData(normalized, EntityType.ingredient),
        },
        select: { entityId: true },
      });
      await this.entityEmbeddings.embedEntities([created.entityId]);
      return { entityId: created.entityId, created: true };
    } catch (error) {
      // FULL uniqueness scope (2026-08-27): uq_ingredient_identity_key
      // spans every non-archived status — a pending or shadow-rehearsal
      // ingredient row blocks the insert too, and it fires on the identity
      // KEY, not the byte name. The row holding the slot IS the
      // ingredient: adopt it, promoting a shadow-born winner to the
      // status this live mint would have stamped.
      const [winner] = await this.prisma.$queryRaw<
        Array<{ entity_id: string; status: string }>
      >`
        SELECT entity_id, status::text FROM core_entities
         WHERE type = 'ingredient'::entity_type
           AND status <> 'archived'::entity_status
           AND (identity_key = ${folded || null}
                OR lower(name) = lower(${normalized}))
         ORDER BY created_at
         LIMIT 1`;
      if (winner) {
        if (winner.status === 'rehearsal') {
          await this.prisma.entity.update({
            where: { entityId: winner.entity_id },
            data: {
              status: EntityStatus.active,
              bornExtractionRunId: null,
              lastUpdated: new Date(),
            },
          });
        }
        return { entityId: winner.entity_id, created: false };
      }
      throw error;
    }
  }
}
