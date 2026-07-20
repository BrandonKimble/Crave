import { Injectable } from '@nestjs/common';
import { EntityStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { LLMService } from '../../external-integrations/llm/llm.service';

export interface DedupeMergeSummary {
  candidatePairs: number;
  autoMerged: number;
  judgeMerged: number;
  judgeRejected: number;
}

const STOPWORDS = new Set(['and', 'with', 'the', 'a', 'of', 'de', 'y']);

/**
 * Periodic food dedupe-merge — the long-term-ideal replacement for the old
 * "Phase 3 raw-emit" idea. Duplicate variants that slip past within-batch
 * dedupe ("steak and frites" vs "steak frites", "hainan" vs "hainanese
 * chicken") get found by trigram candidate scan, adjudicated (deterministic
 * token-multiset rule first, batched LLM judge for the rest), and MERGED:
 * connections re-pointed (colliding (restaurant,food) rows folded together),
 * the loser's name banked as an alias on the winner, loser archived. The
 * variation data is thereby fully exploited instead of lost.
 *
 * Winner = the food with more connections (more evidence behind its name);
 * ties break to the shorter name (more canonical).
 */
@Injectable()
export class FoodDedupeMergeService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LLMService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('FoodDedupeMergeService');
  }

  async run(
    options: { similarityFloor?: number; dryRun?: boolean } = {},
  ): Promise<DedupeMergeSummary> {
    const floor = options.similarityFloor ?? 0.72;
    const dryRun = options.dryRun ?? false;
    const summary: DedupeMergeSummary = {
      candidatePairs: 0,
      autoMerged: 0,
      judgeMerged: 0,
      judgeRejected: 0,
    };

    // 1. Candidate pairs: high trigram similarity, both active foods, and not
    // substring-related (substrings are legitimate specific-vs-general dishes,
    // e.g. "chicken sandwich" ⊂ "chicken parm sandwich").
    const pairs = await this.prisma.$queryRaw<
      { a_id: string; a_name: string; b_id: string; b_name: string }[]
    >`
      SELECT a.entity_id a_id, a.name a_name, b.entity_id b_id, b.name b_name
      FROM core_entities a
      JOIN core_entities b ON a.entity_id < b.entity_id
      WHERE a.type = 'food' AND b.type = 'food'
        AND a.status = 'active' AND b.status = 'active'
        AND similarity(a.name, b.name) > ${floor}
        AND position(a.name IN b.name) = 0
        AND position(b.name IN a.name) = 0
      ORDER BY similarity(a.name, b.name) DESC
      LIMIT 200
    `;
    summary.candidatePairs = pairs.length;
    if (!pairs.length) {
      return summary;
    }

    // 2. Deterministic rule: identical token multisets modulo connector
    // stopwords ("steak and frites" == "steak frites") auto-merge; the rest
    // go to one batched judge call.
    const autoMerge: typeof pairs = [];
    const needJudge: typeof pairs = [];
    for (const pair of pairs) {
      if (this.contentTokens(pair.a_name) === this.contentTokens(pair.b_name)) {
        autoMerge.push(pair);
      } else {
        needJudge.push(pair);
      }
    }

    let judged: { pair: (typeof pairs)[number]; same: boolean }[] = [];
    if (needJudge.length) {
      const verdicts = await this.llmService.matchEntitiesBatch({
        kind: 'food',
        items: needJudge.map((pair) => ({
          term: pair.a_name,
          candidates: [{ id: 1, name: pair.b_name }],
        })),
      });
      judged = needJudge.map((pair, index) => ({
        pair,
        same: verdicts[index]?.decision === 'match',
      }));
    }

    const toMerge = [
      ...autoMerge.map((pair) => ({ pair, via: 'auto' as const })),
      ...judged
        .filter((entry) => entry.same)
        .map((entry) => ({ pair: entry.pair, via: 'judge' as const })),
    ];
    summary.judgeRejected = judged.filter((entry) => !entry.same).length;

    for (const { pair, via } of toMerge) {
      if (dryRun) {
        this.logger.info('Would merge duplicate foods', {
          a: pair.a_name,
          b: pair.b_name,
          via,
        });
      } else {
        await this.mergeFoodPair(pair.a_id, pair.b_id);
      }
      if (via === 'auto') summary.autoMerged += 1;
      else summary.judgeMerged += 1;
    }

    this.logger.info('Food dedupe-merge pass complete', {
      dryRun,
      ...(summary as unknown as Record<string, unknown>),
    });
    return summary;
  }

  /** Full merge: pick winner by evidence, fold connections, bank the loser's
   *  name+aliases on the winner, archive the loser. */
  private async mergeFoodPair(idA: string, idB: string): Promise<void> {
    const [connectionsA, connectionsB] = await Promise.all([
      this.prisma.connection.count({ where: { foodId: idA } }),
      this.prisma.connection.count({ where: { foodId: idB } }),
    ]);
    const [entityA, entityB] = await Promise.all([
      this.prisma.entity.findUniqueOrThrow({
        where: { entityId: idA },
        select: { entityId: true, name: true, aliases: true },
      }),
      this.prisma.entity.findUniqueOrThrow({
        where: { entityId: idB },
        select: { entityId: true, name: true, aliases: true },
      }),
    ]);
    const aWins =
      connectionsA !== connectionsB
        ? connectionsA > connectionsB
        : entityA.name.length <= entityB.name.length;
    const winner = aWins ? entityA : entityB;
    const loser = aWins ? entityB : entityA;

    await this.prisma.$transaction(async (tx) => {
      // Fold colliding connections (same restaurant has both variants).
      const loserConnections = await tx.connection.findMany({
        where: { foodId: loser.entityId },
      });
      for (const connection of loserConnections) {
        const surviving = await tx.connection.findUnique({
          where: {
            restaurantId_foodId: {
              restaurantId: connection.restaurantId,
              foodId: winner.entityId,
            },
          },
          select: { connectionId: true, lastMentionedAt: true },
        });
        if (!surviving) {
          await tx.connection.update({
            where: { connectionId: connection.connectionId },
            data: { foodId: winner.entityId },
          });
          continue;
        }
        // Re-point dependents, sum counters, drop the loser row.
        await tx.restaurantItemMention.updateMany({
          where: { connectionId: connection.connectionId },
          data: { connectionId: surviving.connectionId },
        });
        await tx.favoriteListItem.updateMany({
          where: { connectionId: connection.connectionId },
          data: { connectionId: surviving.connectionId },
        });
        await tx.foodView.updateMany({
          where: { connectionId: connection.connectionId },
          data: { connectionId: surviving.connectionId },
        });
        await tx.userEntityViewEvent.updateMany({
          where: { connectionId: connection.connectionId },
          data: { connectionId: surviving.connectionId },
        });
        await tx.connection.update({
          where: { connectionId: surviving.connectionId },
          data: {
            mentionCount: { increment: connection.mentionCount },
            totalUpvotes: { increment: connection.totalUpvotes },
            supportMentionCount: { increment: connection.supportMentionCount },
            supportTotalUpvotes: { increment: connection.supportTotalUpvotes },
            lastMentionedAt:
              connection.lastMentionedAt &&
              (!surviving.lastMentionedAt ||
                connection.lastMentionedAt > surviving.lastMentionedAt)
                ? connection.lastMentionedAt
                : undefined,
          },
        });
        await tx.connection.delete({
          where: { connectionId: connection.connectionId },
        });
      }

      // Bank the loser's name + aliases on the winner; archive the loser.
      const mergedAliases = Array.from(
        new Set(
          [...winner.aliases, loser.name, ...loser.aliases]
            .map((alias) => alias.trim().toLowerCase())
            .filter(Boolean),
        ),
      );
      await tx.entity.update({
        where: { entityId: winner.entityId },
        data: { aliases: mergedAliases, nameEmbeddingStale: true },
      });
      await tx.entity.update({
        where: { entityId: loser.entityId },
        data: { status: EntityStatus.archived },
      });

      // Identity is a judgment (§3, red-team 2b): merges WRITE redirects; the
      // signals ledger is never rekeyed — readers resolve loser subjectIds to
      // the survivor at read. Chains are flattened so the readers' one-hop
      // COALESCE stays complete (A→B then B→C rewrites A→C), and any stale
      // redirect FROM the live winner is dropped.
      await tx.entityRedirect.updateMany({
        where: { toEntityId: loser.entityId },
        data: { toEntityId: winner.entityId },
      });
      await tx.entityRedirect.deleteMany({
        where: { fromEntityId: winner.entityId },
      });
      await tx.entityRedirect.upsert({
        where: { fromEntityId: loser.entityId },
        update: { toEntityId: winner.entityId },
        create: { fromEntityId: loser.entityId, toEntityId: winner.entityId },
      });
    });

    this.logger.info('Merged duplicate foods', {
      winner: winner.name,
      loser: loser.name,
    });
  }

  private contentTokens(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token && !STOPWORDS.has(token))
      .sort()
      .join(' ');
  }
}
