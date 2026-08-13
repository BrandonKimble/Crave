import { canonicalFold, identityInsertData } from './entity-identity';
import { addSurfaces } from './entity-surface.service';
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EntityStatus, EntityType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { LLMService } from '../../external-integrations/llm/llm.service';
import { PooledBatchRunner } from '../../external-integrations/llm/pooled-batch-runner';
import { recordUnanswered } from '../../external-integrations/llm/unanswered-outcome';
import { isEnvFlagEnabled } from '../../../shared/config/env-flag';

export interface DishKnowledgeSummary {
  dishesProcessed: number;
  ingredientsLinked: number;
  ingredientEntitiesCreated: number;
  aliasesAdded: number;
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
    };

    const dishes = await this.prisma.entity.findMany({
      where: {
        type: EntityType.food,
        status: EntityStatus.active,
        knowledgeSynthesizedAt: null,
      },
      select: { entityId: true, name: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    if (!dishes.length) {
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
      let knowledge: { ingredients: string[]; aliases: string[] }[];
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
        const result = knowledge[i] ?? { ingredients: [], aliases: [] };

        if (dryRun) {
          this.logger.info('Would synthesize dish knowledge', {
            dish: dish.name,
            ingredients: result.ingredients,
            aliases: result.aliases,
          });
          summary.dishesProcessed += 1;
          summary.ingredientsLinked += result.ingredients.length;
          summary.aliasesAdded += result.aliases.length;
          continue;
        }

        const ingredientIds: string[] = [];
        for (const name of result.ingredients) {
          const { entityId, created } = await this.ensureIngredientEntity(name);
          ingredientIds.push(entityId);
          if (created) summary.ingredientEntitiesCreated += 1;
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
        await this.prisma.entity.update({
          where: { entityId: dish.entityId },
          data: {
            canonicalIngredients: Array.from(new Set(ingredientIds)),
            knowledgeSynthesizedAt: new Date(),
          },
        });
        // A1: established shorthand goes through THE surface writer, which
        // marks the dense doc stale for the reconciler.
        // Locale UNSET ('und'): this prompt bans translation and works on
        // an English corpus, so a language tag here would be fabricated —
        // and these are SURFACES, never labels (the plan's NEVER list).
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
        summary.dishesProcessed += 1;
        summary.ingredientsLinked += ingredientIds.length;
        summary.aliasesAdded += newAliases.length;
      }
    }

    this.logger.info('Dish knowledge synthesis pass complete', {
      dryRun,
      ...(summary as unknown as Record<string, unknown>),
    });
    return summary;
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
         AND (
           e.name = ${normalized}
           OR EXISTS (
             SELECT 1 FROM entity_surface s
              WHERE s.entity_id = e.entity_id
                AND s.status = 'active'
                AND s.locale = 'und'
                AND s.role <> 'display'
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
      return { entityId: created.entityId, created: true };
    } catch (error) {
      // Unique partial index on (name) WHERE type='ingredient' makes the
      // find-then-create race lose loudly instead of duplicating — refetch.
      const winner = await this.prisma.entity.findFirst({
        where: { type: EntityType.ingredient, name: normalized },
        select: { entityId: true },
      });
      if (winner) {
        return { entityId: winner.entityId, created: false };
      }
      throw error;
    }
  }
}
