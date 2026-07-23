import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { randomBytes } from 'crypto';
import {
  Prisma,
  PollState,
  PollMode,
  PollOrigin,
  PollTopicType,
  PollTopicStatus,
  PollCommentModerationStatus,
  PollCommentExtractionStatus,
  EntityType,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PollsService } from '../src/modules/polls/polls.service';
import { EntityTextSearchService } from '../src/modules/entity-text-search/entity-text-search.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

/**
 * Seed realistic LIVE-MODEL poll data (poll + topic + threaded comments with real
 * gazetteer entitySpans + a real endorsement leaderboard) so the polls-frontend UI
 * is verifiable — the polls table is otherwise empty. Drives the real pipeline
 * (EntityTextSearchService.scanForKnownEntities → entitySpans →
 * PollsService.refreshPollLeaderboard), so it also end-to-end-validates the
 * gazetteer + leaderboard the new UI renders.
 *
 * Idempotent: deletes prior seed polls (metadata.seedFixture) before re-seeding.
 *
 *   yarn polls:seed-fixtures
 */
const MARKET_KEY = process.env.TEST_POLL_MARKET_KEY ?? 'region-us-ny-new-york';

type SeedPoll = {
  topicType: PollTopicType;
  origin: PollOrigin;
  question: string;
  // The poll's axis target, resolved live via the gazetteer (dish for dish-axis
  // polls, so the leaderboard ranks restaurant+dish Connections; omit for the
  // restaurant-attribute axis which ranks bare restaurant entities).
  target?: { name: string; type: EntityType };
  comments: string[]; // one per author, round-robined across seed users
};

// Comment bodies mention REAL NYC entities verbatim so the live gazetteer matches.
const SEED_POLLS: SeedPoll[] = [
  {
    // dish-axis: fixed dish (fried chicken), variable restaurant → the leaderboard
    // ranks (restaurant, fried chicken) Connections (every option restaurant-anchored).
    topicType: PollTopicType.best_dish,
    origin: PollOrigin.seeded, // app-created → sparkles badge
    question: 'Best fried chicken in NYC right now?',
    target: { name: 'fried chicken', type: EntityType.food },
    comments: [
      'The Eighty Six has the best fried chicken, hands down.',
      'Honestly the fried chicken at Cathédrale Restaurant is unreal too.',
      'The Eighty Six all day. Il Fornaio does a solid version as well.',
    ],
  },
  {
    topicType: PollTopicType.best_restaurant_attribute, // → restaurant-subject leaderboard
    origin: PollOrigin.user, // user-created → avatar badge
    question: 'Best spot for a date night in NYC?',
    comments: [
      'Cathédrale Restaurant is perfect for date night.',
      'Cathédrale Restaurant, hands down. Il Fornaio is also lovely.',
      'Il Fornaio or Cathédrale Restaurant for me.',
    ],
  },
];

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  try {
    const prisma = app.get(PrismaService);
    const polls = app.get(PollsService);
    const gazetteer = app.get(EntityTextSearchService);

    const users = await prisma.user.findMany({
      select: { userId: true },
      take: 3,
    });
    if (users.length < 2) {
      throw new Error('need at least 2 users to seed distinct endorsers');
    }
    const userIds = users.map((u) => u.userId);

    // The user-origin poll should be owned by the real authenticated account
    // (Clerk users have an authProviderUserId like `user_...`), not an arbitrary
    // dev/maestro fixture — so it actually shows up in the signed-in user's
    // profile. Falls back to the first user if no real account exists yet.
    const realUser = await prisma.user.findFirst({
      where: { authProviderUserId: { startsWith: 'user_' } },
      select: { userId: true },
    });
    const userPollOwnerId = realUser?.userId ?? userIds[0];

    // Idempotency: remove prior seed polls (comments + leaderboard cascade on FK).
    const prior = await prisma.poll.findMany({
      where: { metadata: { path: ['seedFixture'], equals: true } },
      select: { pollId: true, topicId: true },
    });
    if (prior.length) {
      await prisma.poll.deleteMany({
        where: { pollId: { in: prior.map((p) => p.pollId) } },
      });
      const topicIds = prior
        .map((p) => p.topicId)
        .filter((id): id is string => Boolean(id));
      if (topicIds.length) {
        await prisma.pollTopic.deleteMany({
          where: { topicId: { in: topicIds } },
        });
      }
      console.log(`removed ${prior.length} prior seed poll(s)`);
    }

    for (const seed of SEED_POLLS) {
      // Resolve the axis target so dish-axis polls have the fixed side they need
      // to form (restaurant, dish) Connections in the leaderboard.
      let targetDishId: string | null = null;
      let targetRestaurantId: string | null = null;
      if (seed.target) {
        const spans = await gazetteer.scanForKnownEntities(
          seed.target.name,
          [seed.target.type],
          { engineId: null },
        );
        const entityId =
          spans.find((s) => s.type === seed.target!.type && s.entityId)
            ?.entityId ?? null;
        if (!entityId) {
          throw new Error(
            `could not resolve poll target "${seed.target.name}"`,
          );
        }
        if (seed.target.type === EntityType.food) targetDishId = entityId;
        else targetRestaurantId = entityId;
      }

      const topic = await prisma.pollTopic.create({
        data: {
          topicType: seed.topicType,
          title: seed.question,
          status: PollTopicStatus.archived,
          targetDishId,
          targetRestaurantId,
          metadata: { seedFixture: true },
        },
        select: { topicId: true },
      });
      const poll = await prisma.poll.create({
        data: {
          topicId: topic.topicId,
          question: seed.question,
          state: PollState.active,
          mode: PollMode.ranked,
          origin: seed.origin,
          launchedAt: new Date(),
          createdByUserId:
            seed.origin === PollOrigin.user ? userPollOwnerId : null,
          metadata: { seedFixture: true },
        },
        select: { pollId: true },
      });

      for (let i = 0; i < seed.comments.length; i += 1) {
        const body = seed.comments[i];
        const userId = userIds[i % userIds.length];
        const spans = await gazetteer.scanForKnownEntities(
          body,
          [EntityType.restaurant, EntityType.food],
          { engineId: null },
        );
        await prisma.pollComment.create({
          data: {
            pollId: poll.pollId,
            userId,
            body,
            publicId: randomBytes(12).toString('base64url'),
            moderationStatus: PollCommentModerationStatus.approved,
            extractionStatus: PollCommentExtractionStatus.highlighted,
            entitySpans: spans as unknown as Prisma.InputJsonValue,
          },
        });
      }

      await polls.refreshPollLeaderboard(poll.pollId);

      const leaderboard = await polls.getPollLeaderboard(poll.pollId);
      const commentCount = await prisma.pollComment.count({
        where: { pollId: poll.pollId, deletedAt: null },
      });
      console.log(`\npoll: "${seed.question}" (${seed.topicType})`);
      console.log(`  comments: ${commentCount}`);
      console.log(
        `  leaderboard: ${
          leaderboard.length
            ? leaderboard
                .map(
                  (e) =>
                    `#${e.rank} ${e.name ?? e.subjectId} (${e.distinctEndorsers})`,
                )
                .join(', ')
            : '(empty)'
        }`,
      );
    }
    console.log('\nseed complete.');
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
