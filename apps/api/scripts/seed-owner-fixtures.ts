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
 * Owner test-data fixtures (wave2 charter §7 / plans/media-images-ledger.md):
 * under kimble.brandonm@gmail.com — live + closed Austin polls with FILLED
 * threaded discussions (owner participating), comment likes, endorsements +
 * real leaderboards (drives the REAL pipeline: gazetteer entitySpans →
 * refreshPollLeaderboard); populated lists on BOTH sides (system Been /
 * Want-to-go / Tried / Want-to-try + custom lists); follower/following
 * fixtures for the follow-list surface.
 *
 * Additive + idempotent: polls tagged metadata.ownerFixture are replaced on
 * re-run (own seeds only); list items and follows upsert/skip-duplicate;
 * nothing else is touched.
 *
 *   yarn ts-node -r tsconfig-paths/register scripts/seed-owner-fixtures.ts
 */

const OWNER_EMAIL = 'kimble.brandonm@gmail.com';
const MARKET_KEY = 'region-us-tx-austin';

type Friend = { email: string; username: string; displayName: string };
const FRIENDS: Friend[] = [
  {
    email: 'jess.eats@crave-search.local',
    username: 'jess.eats',
    displayName: 'Jess Rivera',
  },
  {
    email: 'marco.atx@crave-search.local',
    username: 'marco.atx',
    displayName: 'Marco Delgado',
  },
  {
    email: 'sofia.tastes@crave-search.local',
    username: 'sofia.tastes',
    displayName: 'Sofia Chen',
  },
  {
    email: 'dan.bbq@crave-search.local',
    username: 'dan.bbq',
    displayName: 'Dan Whitfield',
  },
  {
    email: 'priya.noms@crave-search.local',
    username: 'priya.noms',
    displayName: 'Priya Natarajan',
  },
];

type SeedPoll = {
  topicType: PollTopicType;
  origin: PollOrigin;
  state: PollState;
  question: string;
  target?: { name: string; type: EntityType };
  ownedByOwner?: boolean;
  /** author key: 'owner' | friend index; parent: index into this array (thread). */
  comments: {
    author: 'owner' | number;
    body: string;
    parent?: number;
    likes?: ('owner' | number)[];
  }[];
};

const SEED_POLLS: SeedPoll[] = [
  {
    topicType: PollTopicType.best_dish,
    origin: PollOrigin.seeded,
    state: PollState.active,
    question: 'Best breakfast taco in Austin right now?',
    target: { name: 'breakfast taco', type: EntityType.food },
    comments: [
      {
        author: 0,
        body: 'Cuantos Tacos is the answer, every time.',
        likes: ['owner', 1, 2],
      },
      {
        author: 'owner',
        body: 'Cuantos Tacos for me too, but Nixta Taqueria deserves a mention.',
        parent: 0,
        likes: [0, 3],
      },
      {
        author: 1,
        body: 'Bouldin Creek Cafe if you want the veggie route.',
        likes: [4],
      },
      {
        author: 3,
        body: 'Micklethwait Barbecue does a sleeper brisket taco on weekends.',
        likes: ['owner'],
      },
    ],
  },
  {
    topicType: PollTopicType.best_dish,
    origin: PollOrigin.seeded,
    state: PollState.active,
    question: 'Best brisket in Austin?',
    target: { name: 'brisket', type: EntityType.food },
    comments: [
      {
        author: 3,
        body: 'Micklethwait Barbecue, and it is not close.',
        likes: ['owner', 0, 1, 2],
      },
      {
        author: 'owner',
        body: 'Micklethwait Barbecue is my pick as well. The jalapeno cheese grits seal it.',
        parent: 0,
        likes: [3],
      },
      {
        author: 2,
        body: 'Hot take: the brisket at Loro Asian Smokehouse & Bar belongs in this conversation.',
        likes: [1],
      },
      {
        author: 4,
        body: 'Micklethwait Barbecue for the bark alone.',
        parent: 0,
      },
    ],
  },
  {
    topicType: PollTopicType.best_restaurant_attribute,
    origin: PollOrigin.user,
    state: PollState.active,
    question: 'Best late-night food in Austin?',
    ownedByOwner: true,
    comments: [
      {
        author: 'owner',
        body: 'Home Slice Pizza window slices at 1am are undefeated.',
        likes: [0, 1, 2, 3],
      },
      {
        author: 1,
        body: 'Home Slice Pizza, no contest.',
        parent: 0,
        likes: ['owner'],
      },
      {
        author: 2,
        body: 'Cuantos Tacos when the truck is open late.',
        likes: [4],
      },
      {
        author: 4,
        body: 'Ramen Del Barrio right before close hits different.',
        likes: ['owner', 0],
      },
    ],
  },
  {
    topicType: PollTopicType.best_dish,
    origin: PollOrigin.seeded,
    state: PollState.closed,
    question: 'Best ramen in Austin? (closed)',
    target: { name: 'ramen', type: EntityType.food },
    comments: [
      {
        author: 2,
        body: 'Ramen Del Barrio — the tonkotsu campechano is a genius mashup.',
        likes: ['owner', 0, 1],
      },
      {
        author: 'owner',
        body: 'Ramen Del Barrio took this one fair and square.',
        parent: 0,
        likes: [2],
      },
      {
        author: 0,
        body: 'Kiin Di is Thai but the killer noodles scratch the same itch.',
        likes: [3],
      },
    ],
  },
  {
    topicType: PollTopicType.best_restaurant_attribute,
    origin: PollOrigin.user,
    state: PollState.closed,
    question: 'Best coffee shop to work from in Austin? (closed)',
    ownedByOwner: true,
    comments: [
      {
        author: 4,
        body: 'Proud Mary Coffee — the espresso flight is a ritual.',
        likes: ['owner', 1],
      },
      {
        author: 'owner',
        body: 'Proud Mary Coffee wins, though épicerie is the cozier hang.',
        parent: 0,
        likes: [4, 2],
      },
      {
        author: 1,
        body: 'Bouldin Creek Cafe if you want food that goes past pastries.',
        likes: [0],
      },
    ],
  },
];

/** Restaurant names -> list placement (all photo-seeded so galleries render). */
const BEEN = [
  'Cuantos Tacos',
  'Micklethwait Barbecue',
  'Home Slice Pizza',
  'Ramen Del Barrio',
  'Proud Mary Coffee',
  'Bouldin Creek Cafe',
];
const WANT_TO_GO = [
  'Uchi Austin',
  'Uroko',
  'Kiin Di',
  'Sunflower Vietnamese Cuisine',
  'épicerie',
];
const CUSTOM_RESTAURANT_LIST = {
  name: 'ATX heavy hitters',
  items: [
    'Cuantos Tacos',
    'Micklethwait Barbecue',
    'Uchi Austin',
    'Home Slice Pizza',
    'Ramen Del Barrio',
  ],
};
// Dish side: (restaurant, dish) connection pairs verified to exist.
const TRIED: [string, string][] = [
  ['Micklethwait Barbecue', 'brisket'],
  ['Ramen Del Barrio', 'tonkotsu campechano'],
  ['Home Slice Pizza', 'italian deli sandwiches'],
  ['Proud Mary Coffee', 'espresso flight'],
];
const WANT_TO_TRY: [string, string][] = [
  ['Uchi Austin', 'omakase'],
  ['Sunflower Vietnamese Cuisine', 'banh xeo'],
  ['Kiin Di', 'killer noodles'],
];
const CUSTOM_DISH_LIST: { name: string; items: [string, string][] } = {
  name: 'Best bites ATX',
  items: [
    ['Micklethwait Barbecue', 'brisket'],
    ['Bouldin Creek Cafe', 'veggie burger'],
    ['Uchi Austin', 'kinoko nabe'],
    ['Proud Mary Coffee', 'sausage roll'],
  ],
};

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  try {
    const prisma = app.get(PrismaService);
    const polls = app.get(PollsService);
    const gazetteer = app.get(EntityTextSearchService);

    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: OWNER_EMAIL },
      select: { userId: true },
    });

    // ---- friend users + follow edges -----------------------------------
    const friendIds: string[] = [];
    for (const f of FRIENDS) {
      const u = await prisma.user.upsert({
        where: { email: f.email },
        update: { displayName: f.displayName },
        create: {
          email: f.email,
          username: f.username,
          displayName: f.displayName,
        },
        select: { userId: true },
      });
      friendIds.push(u.userId);
    }
    // Everyone follows the owner; the owner follows the first three back.
    await prisma.userFollow.createMany({
      data: [
        ...friendIds.map((id) => ({
          followerUserId: id,
          followingUserId: owner.userId,
        })),
        ...friendIds
          .slice(0, 3)
          .map((id) => ({ followerUserId: owner.userId, followingUserId: id })),
      ],
      skipDuplicates: true,
    });
    console.log(`follows: ${friendIds.length} followers, 3 following`);

    // ---- entity lookups --------------------------------------------------
    const restaurantIdByName = new Map<string, string>();
    const allNames = [
      ...new Set([...BEEN, ...WANT_TO_GO, ...CUSTOM_RESTAURANT_LIST.items]),
    ];
    for (const name of allNames) {
      const row = await prisma.entity.findFirst({
        where: { name, type: 'restaurant' },
        select: { entityId: true },
      });
      if (!row) throw new Error(`restaurant not found: ${name}`);
      restaurantIdByName.set(name, row.entityId);
    }
    const connectionIdByPair = new Map<string, string>();
    const allPairs = [...TRIED, ...WANT_TO_TRY, ...CUSTOM_DISH_LIST.items];
    for (const [rest, dish] of allPairs) {
      const rows = await prisma.$queryRaw<
        { connection_id: string }[]
      >(Prisma.sql`
        select c.connection_id
        from core_restaurant_items c
        join core_entities r on r.entity_id = c.restaurant_id
        join core_entities f on f.entity_id = c.food_id
        where r.name = ${rest} and f.name = ${dish}
        limit 1`);
      if (!rows.length)
        throw new Error(`connection not found: ${rest} / ${dish}`);
      connectionIdByPair.set(`${rest}::${dish}`, rows[0].connection_id);
    }

    // ---- lists -----------------------------------------------------------
    async function fillList(
      listId: string,
      items: { restaurantId?: string; connectionId?: string }[],
    ): Promise<void> {
      await prisma.favoriteListItem.createMany({
        data: items.map((it, i) => ({
          listId,
          addedByUserId: owner.userId,
          restaurantId: it.restaurantId ?? null,
          connectionId: it.connectionId ?? null,
          position: i,
        })),
        skipDuplicates: true,
      });
      const count = await prisma.favoriteListItem.count({ where: { listId } });
      await prisma.favoriteList.update({
        where: { listId },
        data: { itemCount: count },
      });
    }

    const systemList = async (systemKind: string) =>
      (
        await prisma.favoriteList.findUniqueOrThrow({
          where: {
            ownerUserId_systemKind: { ownerUserId: owner.userId, systemKind },
          },
          select: { listId: true },
        })
      ).listId;

    await fillList(
      await systemList('been'),
      BEEN.map((n) => ({ restaurantId: restaurantIdByName.get(n)! })),
    );
    await fillList(
      await systemList('want_to_go'),
      WANT_TO_GO.map((n) => ({ restaurantId: restaurantIdByName.get(n)! })),
    );
    await fillList(
      await systemList('tried'),
      TRIED.map(([r, d]) => ({
        connectionId: connectionIdByPair.get(`${r}::${d}`)!,
      })),
    );
    await fillList(
      await systemList('want_to_try'),
      WANT_TO_TRY.map(([r, d]) => ({
        connectionId: connectionIdByPair.get(`${r}::${d}`)!,
      })),
    );

    const customRestaurant = await prisma.favoriteList.upsert({
      where: {
        ownerUserId_listType_name: {
          ownerUserId: owner.userId,
          listType: 'restaurant',
          name: CUSTOM_RESTAURANT_LIST.name,
        },
      },
      update: {},
      create: {
        ownerUserId: owner.userId,
        name: CUSTOM_RESTAURANT_LIST.name,
        listType: 'restaurant',
        visibility: 'public',
      },
      select: { listId: true },
    });
    await fillList(
      customRestaurant.listId,
      CUSTOM_RESTAURANT_LIST.items.map((n) => ({
        restaurantId: restaurantIdByName.get(n)!,
      })),
    );

    const customDish = await prisma.favoriteList.upsert({
      where: {
        ownerUserId_listType_name: {
          ownerUserId: owner.userId,
          listType: 'dish',
          name: CUSTOM_DISH_LIST.name,
        },
      },
      update: {},
      create: {
        ownerUserId: owner.userId,
        name: CUSTOM_DISH_LIST.name,
        listType: 'dish',
        visibility: 'public',
      },
      select: { listId: true },
    });
    await fillList(
      customDish.listId,
      CUSTOM_DISH_LIST.items.map(([r, d]) => ({
        connectionId: connectionIdByPair.get(`${r}::${d}`)!,
      })),
    );
    console.log(
      'lists: been/want_to_go/tried/want_to_try + 2 custom populated',
    );

    // ---- polls (replace prior owner fixtures) ---------------------------
    const prior = await prisma.poll.findMany({
      where: { metadata: { path: ['ownerFixture'], equals: true } },
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
      console.log(`replaced ${prior.length} prior owner-fixture poll(s)`);
    }

    const authorId = (a: 'owner' | number): string =>
      a === 'owner' ? owner.userId : friendIds[a % friendIds.length];

    for (const seed of SEED_POLLS) {
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
        if (!entityId)
          throw new Error(
            `could not resolve poll target "${seed.target.name}"`,
          );
        if (seed.target.type === EntityType.food) targetDishId = entityId;
        else targetRestaurantId = entityId;
      }

      const closed = seed.state === PollState.closed;
      const launchedAt = new Date(
        Date.now() - (closed ? 21 : 2) * 24 * 3600 * 1000,
      );
      const topic = await prisma.pollTopic.create({
        data: {
          topicType: seed.topicType,
          title: seed.question,
          status: PollTopicStatus.archived,
          targetDishId,
          targetRestaurantId,
          metadata: { ownerFixture: true },
        },
        select: { topicId: true },
      });
      const poll = await prisma.poll.create({
        data: {
          topicId: topic.topicId,
          question: seed.question,
          state: seed.state,
          mode: PollMode.ranked,
          origin: seed.origin,
          launchedAt,
          closedAt: closed ? new Date(Date.now() - 3 * 24 * 3600 * 1000) : null,
          createdByUserId: seed.ownedByOwner ? owner.userId : null,
          metadata: { ownerFixture: true },
        },
        select: { pollId: true },
      });

      const commentIds: string[] = [];
      for (let i = 0; i < seed.comments.length; i += 1) {
        const c = seed.comments[i];
        const spans = await gazetteer.scanForKnownEntities(
          c.body,
          [EntityType.restaurant, EntityType.food],
          { engineId: null },
        );
        const row = await prisma.pollComment.create({
          data: {
            pollId: poll.pollId,
            userId: authorId(c.author),
            parentCommentId:
              c.parent !== undefined ? commentIds[c.parent] : null,
            body: c.body,
            score: c.likes?.length ?? 0,
            publicId: randomBytes(12).toString('base64url'),
            moderationStatus: PollCommentModerationStatus.approved,
            extractionStatus: PollCommentExtractionStatus.highlighted,
            entitySpans: spans as unknown as Prisma.InputJsonValue,
            loggedAt: new Date(launchedAt.getTime() + (i + 1) * 3600 * 1000),
          },
          select: { commentId: true },
        });
        commentIds.push(row.commentId);
        if (c.likes?.length) {
          await prisma.pollCommentLike.createMany({
            data: c.likes.map((l) => ({
              commentId: row.commentId,
              userId: authorId(l),
            })),
            skipDuplicates: true,
          });
        }
      }

      await polls.refreshPollLeaderboard(poll.pollId);

      // Endorse the top subject from a couple of accounts, then re-project.
      const top = await prisma.pollLeaderboardEntry.findFirst({
        where: { pollId: poll.pollId },
        orderBy: { rank: 'asc' },
      });
      if (top) {
        await prisma.pollEndorsement.createMany({
          data: [owner.userId, friendIds[0], friendIds[1]].map((userId) => ({
            pollId: poll.pollId,
            subjectType: top.subjectType,
            subjectId: top.subjectId,
            userId,
          })),
          skipDuplicates: true,
        });
        await polls.refreshPollLeaderboard(poll.pollId);
      }

      const commentCount = await prisma.pollComment.count({
        where: { pollId: poll.pollId, deletedAt: null },
      });
      console.log(
        `poll [${seed.state}] "${seed.question}" — ${commentCount} comments`,
      );
    }

    console.log('owner fixtures complete.');
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
