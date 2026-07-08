import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EntityStatus, EntityType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { LLMService } from '../../external-integrations/llm/llm.service';

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
 * script; same pattern as the sibling-edge builder.
 */
@Injectable()
export class DishKnowledgeSynthesisService {
  private readonly logger: LoggerService;
  private cronInFlight = false;
  private static readonly DISHES_PER_CALL = 20;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LLMService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('DishKnowledgeSynthesisService');
  }

  @Cron(CronExpression.EVERY_DAY_AT_5AM)
  async nightlyPass(): Promise<void> {
    if (process.env.DISH_KNOWLEDGE_SYNTHESIS_ENABLED !== 'true') return;
    if (this.cronInFlight) return;
    this.cronInFlight = true;
    try {
      await this.run({ limit: 2000 });
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
    options: { limit?: number; dryRun?: boolean } = {},
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
      select: { entityId: true, name: true, aliases: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    if (!dishes.length) {
      return summary;
    }

    for (
      let offset = 0;
      offset < dishes.length;
      offset += DishKnowledgeSynthesisService.DISHES_PER_CALL
    ) {
      const batch = dishes.slice(
        offset,
        offset + DishKnowledgeSynthesisService.DISHES_PER_CALL,
      );
      const knowledge = await this.llmService.synthesizeDishKnowledgeBatch(
        batch.map((dish) => ({ name: dish.name })),
      );

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

        // Merge established aliases (never the dish's own name); a changed
        // alias set changes the dense doc -> mark stale for the reconciler.
        const dishNameLower = dish.name.trim().toLowerCase();
        const newAliases = result.aliases.filter(
          (alias) =>
            alias !== dishNameLower &&
            !dish.aliases.some(
              (existing) => existing.trim().toLowerCase() === alias,
            ),
        );
        await this.prisma.entity.update({
          where: { entityId: dish.entityId },
          data: {
            canonicalIngredients: Array.from(new Set(ingredientIds)),
            knowledgeSynthesizedAt: new Date(),
            ...(newAliases.length
              ? {
                  aliases: [...dish.aliases, ...newAliases],
                  nameEmbeddingStale: true,
                }
              : {}),
          },
        });
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
    const existing = await this.prisma.entity.findFirst({
      where: { type: EntityType.ingredient, name: normalized },
      select: { entityId: true },
    });
    if (existing) {
      return { entityId: existing.entityId, created: false };
    }
    const created = await this.prisma.entity.create({
      data: { name: normalized, type: EntityType.ingredient },
      select: { entityId: true },
    });
    return { entityId: created.entityId, created: true };
  }
}
