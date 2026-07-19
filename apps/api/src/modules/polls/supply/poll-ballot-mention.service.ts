/**
 * K6 vote→mention mapping (§4, definitional): at graduation the BALLOT
 * bypasses LLM extraction — each DISTINCT voter mints ONE structured mention
 * (m = 1, NO upvote term) for their choice, composing R6 into the score
 * exactly as into demand. The discussion THREAD still flows through standard
 * extraction; this service only handles the ballot.
 *
 * Mechanics: the ballot lands as a synthetic document of the place's
 * poll_surface source (§5, lazily created) with a completed no-LLM
 * extraction run, and the mentions are ordinary evidence rows
 * (core_restaurant_events / core_restaurant_entity_events) under that run —
 * so scoring, projections, replay, and provenance treat them exactly like
 * any other mention. sourceUpvotes = 0 everywhere (K6: no upvote term).
 *
 * Idempotent: the document is unique per poll; a run that already carries
 * events is never re-minted (retry-safe against crashes mid-mint).
 */
import { Injectable } from '@nestjs/common';
import {
  EntityType,
  MentionSource,
  PollLeaderboardSubjectType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { ProjectionRebuildService } from '../../content-processing/reddit-collector/projection-rebuild.service';
import {
  POLL_SURFACE_PLATFORM,
  PollSurfaceSourceService,
  pollSurfaceHandle,
} from './poll-surface-source.service';

export const BALLOT_PIPELINE = 'poll-ballot';
/** K5-style version stamp for the (LLM-free) ballot mapping itself. */
export const BALLOT_PROMPT_HASH = 'ballot-k6-v1';

interface BallotChoice {
  userId: string;
  restaurantId: string;
  /** Set for dish-axis (connection) choices. */
  foodId: string | null;
}

@Injectable()
export class PollBallotMentionService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pollSurfaceSources: PollSurfaceSourceService,
    private readonly projectionRebuild: ProjectionRebuildService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('PollBallotMentionService');
  }

  /**
   * Mint the ballot mentions for a closed, place-keyed poll. Legacy
   * market-keyed polls (no placeId) have no poll_surface room yet and are
   * skipped — their cutover is the Phase B seeder/score sequencing.
   */
  async mintForPoll(pollId: string): Promise<void> {
    const poll = await this.prisma.poll.findUnique({
      where: { pollId },
      select: {
        pollId: true,
        placeId: true,
        question: true,
        closedAt: true,
        launchedAt: true,
        createdAt: true,
      },
    });
    if (!poll?.placeId) {
      return;
    }

    const choices = await this.resolveBallot(pollId);
    if (!choices.length) {
      return;
    }

    const source = await this.pollSurfaceSources.ensureForPlace(poll.placeId);
    const mentionedAt = poll.closedAt ?? new Date();
    const documentSourceId = `poll-ballot-${pollId}`;

    // Idempotency: one ballot document per poll; if its active run already
    // carries events, the mint completed before.
    const existingDocument = await this.prisma.sourceDocument.findUnique({
      where: {
        platform_sourceType_sourceId: {
          platform: POLL_SURFACE_PLATFORM,
          sourceType: MentionSource.post,
          sourceId: documentSourceId,
        },
      },
      select: { documentId: true, activeExtractionRunId: true },
    });
    if (existingDocument?.activeExtractionRunId) {
      const [minted, mintedEntity] = await Promise.all([
        this.prisma.restaurantEvent.findMany({
          where: { extractionRunId: existingDocument.activeExtractionRunId },
          select: { restaurantId: true },
          distinct: ['restaurantId'],
        }),
        this.prisma.restaurantEntityEvent.findMany({
          where: { extractionRunId: existingDocument.activeExtractionRunId },
          select: { restaurantId: true },
          distinct: ['restaurantId'],
        }),
      ]);
      if (minted.length > 0 || mintedEntity.length > 0) {
        // Red-team 4b: the mint completed before, but a crash BETWEEN the
        // mint commit and the projection rebuild would otherwise leave the
        // evidence invisible forever (this early return was the only path
        // that skipped the rebuild). Rebuild is idempotent — run it here too.
        await this.projectionRebuild.rebuildForRestaurants([
          ...new Set(
            [...minted, ...mintedEntity].map((event) => event.restaurantId),
          ),
        ]);
        return;
      }
    }

    const affectedRestaurantIds = new Set<string>();
    await this.prisma.$transaction(async (tx) => {
      const document = existingDocument
        ? { documentId: existingDocument.documentId }
        : await tx.sourceDocument.create({
            data: {
              platform: POLL_SURFACE_PLATFORM,
              community: pollSurfaceHandle(poll.placeId as string),
              sourceType: MentionSource.post,
              sourceId: documentSourceId,
              title: `${poll.question} — ballot`,
              sourceCreatedAt: poll.launchedAt ?? poll.createdAt,
              rawPayload: {
                pollId,
                sourceId: source.sourceId,
                distinctVoters: choices.length,
                mapping: BALLOT_PROMPT_HASH,
              } as Prisma.InputJsonValue,
            },
            select: { documentId: true },
          });

      const run = await tx.extractionRun.create({
        data: {
          pipeline: BALLOT_PIPELINE,
          model: 'none',
          systemPromptHash: BALLOT_PROMPT_HASH,
          systemPrompt:
            'K6 definitional vote→mention mapping (no LLM): each distinct ' +
            'voter mints one structured mention (m=1, no upvote term) for ' +
            'their choice.',
          status: 'completed',
          completedAt: new Date(),
          metadata: {
            pollId,
            placeId: poll.placeId,
            sourceId: source.sourceId,
          } as Prisma.InputJsonValue,
        },
        select: { extractionRunId: true },
      });
      const input = await tx.extractionInput.create({
        data: {
          extractionRunId: run.extractionRunId,
          inputIndex: 0,
          inputPayload: {
            kind: 'ballot',
            pollId,
            distinctVoters: choices.length,
          } as Prisma.InputJsonValue,
        },
        select: { inputId: true },
      });
      await tx.extractionInputDocument.create({
        data: {
          inputId: input.inputId,
          documentId: document.documentId,
          ordinal: 0,
        },
      });

      for (const choice of choices) {
        const mentionKey = `poll-ballot:${pollId}:${choice.userId}`;
        affectedRestaurantIds.add(choice.restaurantId);
        if (choice.foodId) {
          // Dish-axis choice: a direct menu-item mention (m=1) — exactly the
          // shape the projection counts as one dish mention.
          await tx.restaurantEntityEvent.create({
            data: {
              extractionRunId: run.extractionRunId,
              inputId: input.inputId,
              sourceDocumentId: document.documentId,
              restaurantId: choice.restaurantId,
              mentionKey,
              entityId: choice.foodId,
              entityType: EntityType.food,
              evidenceType: 'menu_item_food',
              isMenuItem: true,
              mentionedAt,
              sourceUpvotes: 0,
              metadata: { pollBallot: true } as Prisma.InputJsonValue,
            },
          });
        } else {
          // Restaurant-axis choice: one restaurant-level mention. The score's
          // praise read dedupes by mention_key and counts it m=1; upvotes 0.
          await tx.restaurantEvent.create({
            data: {
              extractionRunId: run.extractionRunId,
              inputId: input.inputId,
              sourceDocumentId: document.documentId,
              restaurantId: choice.restaurantId,
              mentionKey,
              evidenceType: 'poll_ballot',
              mentionedAt,
              sourceUpvotes: 0,
              metadata: { pollBallot: true } as Prisma.InputJsonValue,
            },
          });
        }
      }

      // Activate: the ballot run becomes the document's active run so the
      // events count (projection + score read only active-run evidence).
      await tx.sourceDocument.update({
        where: { documentId: document.documentId },
        data: { activeExtractionRunId: run.extractionRunId },
      });
    });

    await this.projectionRebuild.rebuildForRestaurants([
      ...affectedRestaurantIds,
    ]);
    this.logger.info('Minted K6 ballot mentions', {
      pollId,
      distinctVoters: choices.length,
      restaurants: affectedRestaurantIds.size,
    });
  }

  /**
   * The ballot = each distinct voter's standing choice at close. A voter with
   * several standing endorsements contributes their MOST RECENT one ("each
   * distinct voter mints ONE structured mention for their choice" — K6's
   * one-per-voter law; recency is the tiebreak). Subject ids resolve through
   * entity_redirects at read (§3).
   */
  private async resolveBallot(pollId: string): Promise<BallotChoice[]> {
    const endorsements = await this.prisma.pollEndorsement.findMany({
      where: { pollId },
      orderBy: { createdAt: 'asc' },
      select: {
        userId: true,
        subjectType: true,
        subjectId: true,
        createdAt: true,
      },
    });
    const latestByUser = new Map<string, (typeof endorsements)[number]>();
    for (const endorsement of endorsements) {
      latestByUser.set(endorsement.userId, endorsement);
    }

    const parsed = [...latestByUser.values()]
      .map((endorsement) => {
        if (endorsement.subjectType === PollLeaderboardSubjectType.connection) {
          const [restaurantId, foodId] = endorsement.subjectId.split('::');
          if (!restaurantId || !foodId) {
            return null;
          }
          return { userId: endorsement.userId, restaurantId, foodId };
        }
        return {
          userId: endorsement.userId,
          restaurantId: endorsement.subjectId,
          foodId: null,
        };
      })
      .filter((choice): choice is BallotChoice => choice !== null);

    // §3 read-time identity: resolve every entity id through redirects.
    const ids = new Set<string>();
    parsed.forEach((choice) => {
      ids.add(choice.restaurantId);
      if (choice.foodId) ids.add(choice.foodId);
    });
    const redirects = await this.prisma.entityRedirect.findMany({
      where: { fromEntityId: { in: [...ids] } },
      select: { fromEntityId: true, toEntityId: true },
    });
    const redirectMap = new Map(
      redirects.map((r) => [r.fromEntityId, r.toEntityId]),
    );
    return parsed.map((choice) => ({
      userId: choice.userId,
      restaurantId: redirectMap.get(choice.restaurantId) ?? choice.restaurantId,
      foodId: choice.foodId
        ? (redirectMap.get(choice.foodId) ?? choice.foodId)
        : null,
    }));
  }
}
