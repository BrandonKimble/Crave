import 'reflect-metadata';
import { PollTopicType } from '@prisma/client';
import { PollsService } from './polls.service';
import { PollWeeklyRitualService } from './supply/poll-weekly-ritual.service';
import { entityRedirectDouble } from '../../shared/testing/prisma-doubles';

/**
 * A PERSISTED RANK IS A PURE FUNCTION OF THE DATA IT RANKS (F3502, D76 — the
 * F1902 determinism family, third and fourth instance).
 *
 * `rebuildPollLeaderboard` sorted on distinctEndorsers alone, so the order
 * WITHIN a tie fell through to Map-insertion order, which came from a
 * `pollComment.findMany` with no orderBy — raw Postgres heap order, which moves
 * with updates and vacuum. Ties are the COMMON case in a young poll (a crowd of
 * 1-endorser subjects), the rebuild runs on every comment/like/endorsement, and
 * `rank` is persisted and rendered — so tied bars could visibly swap places
 * between two taps that touched neither.
 *
 * One file over, `rankSubjects` sorted float scores with no tiebreak, and under
 * a cohortTarget cap a tie AT THE CUT decides which subject gets a poll this
 * week.
 *
 * WHY THIS SHAPE. Both specs feed the SAME tied data twice in OPPOSITE arrival
 * orders and demand identical output. That is the only assertion a nondeterminism
 * finding can make: a single run of either sort is green by luck.
 */

const ALPHA = '11111111-1111-4111-8111-111111111111';
const BRAVO = '22222222-2222-4222-8222-222222222222';
const CHARLIE = '33333333-3333-4333-8333-333333333333';
const POLL = '99999999-9999-4999-8999-999999999999';

type LeaderboardRow = { subjectId: string; rank: number };

/** One tied comment per subject: distinct author, one restaurant span each. */
function commentFor(subjectId: string, i: number) {
  return {
    commentId: `c${i}`,
    userId: `u${i}`,
    entitySpans: [{ type: 'restaurant', entityId: subjectId }],
  };
}

async function rebuildWithCommentOrder(
  order: string[],
): Promise<LeaderboardRow[]> {
  let written: LeaderboardRow[] = [];
  const tx = {
    $executeRaw: () => Promise.resolve(1),
    pollLeaderboardEntry: {
      deleteMany: () => Promise.resolve({ count: 0 }),
      createMany: ({ data }: { data: LeaderboardRow[] }) => {
        written = data.map((row) => ({
          subjectId: row.subjectId,
          rank: row.rank,
        }));
        return Promise.resolve({ count: data.length });
      },
    },
  };
  const prisma = {
    poll: {
      findUnique: () =>
        Promise.resolve({
          mode: 'ranked',
          createdByUserId: null,
          placeId: null,
          topic: {
            topicType: PollTopicType.best_restaurant_attribute,
            targetRestaurantId: null,
            targetDishId: null,
            description: null,
          },
        }),
    },
    pollComment: {
      findMany: () => Promise.resolve(order.map((id, i) => commentFor(id, i))),
    },
    pollCommentLike: { findMany: () => Promise.resolve([]) },
    pollEndorsement: { findMany: () => Promise.resolve([]) },
    entityRedirect: entityRedirectDouble([]),
    pollLeaderboardEntry: { deleteMany: () => Promise.resolve({ count: 0 }) },
    $transaction: (fn: (t: unknown) => Promise<void>) => fn(tx),
  };
  const logger = { setContext: () => logger };
  const m = {} as never;
  const service = new PollsService(
    prisma as never,
    logger as never,
    m,
    m,
    m,
    m,
    m,
    m,
    m,
    m,
    m,
    m,
    {
      loadLabels: () => Promise.resolve(new Map()),
      displayLabel: (entity: { name: string }) => entity.name,
      localizeRows: (rows: unknown[]) => Promise.resolve(rows),
    } as never,
  ) as unknown as { rebuildPollLeaderboard(pollId: string): Promise<void> };

  await service.rebuildPollLeaderboard(POLL);
  return written;
}

describe('the poll leaderboard rank does not depend on row arrival order', () => {
  it('assigns the same ranks to tied subjects however the comments arrive', async () => {
    const forwards = await rebuildWithCommentOrder([ALPHA, BRAVO, CHARLIE]);
    const backwards = await rebuildWithCommentOrder([CHARLIE, BRAVO, ALPHA]);

    // Three subjects, one distinct endorser each — a three-way tie.
    expect(forwards).toHaveLength(3);
    expect(forwards).toEqual(backwards);
    // And the tiebreak is the stated one, not an accident of the fixture.
    expect(forwards.map((row) => row.subjectId)).toEqual([
      ALPHA,
      BRAVO,
      CHARLIE,
    ]);
  });
});

type RitualPrivate = {
  rankSubjects(params: {
    placeId: string;
    weekOf: string;
    subjects: unknown[];
    cooldowns: Map<string, string>;
  }): Array<{ subject: { subjectId: string } }>;
};

function ritualSubject(subjectId: string) {
  // Identical mass and no baseline → identical score. The cut between them is
  // exactly the tie the finding is about.
  return {
    subjectId,
    mass: 5,
    currentMass: 5,
    baselineWeeklyMass: 0,
  };
}

describe('the weekly-ritual subject cut does not depend on row arrival order', () => {
  const logger = { setContext: () => logger };
  const m = {} as never;
  const ritual = new PollWeeklyRitualService(
    m,
    m,
    m,
    m,
    m,
    logger as never,
  ) as unknown as RitualPrivate;

  const rank = (order: string[]) =>
    ritual
      .rankSubjects({
        placeId: 'p1',
        weekOf: '2026-08-02',
        subjects: order.map(ritualSubject),
        cooldowns: new Map(),
      })
      .map((ranked) => ranked.subject.subjectId);

  it('orders equal-scoring subjects identically however they arrive', () => {
    expect(rank([ALPHA, BRAVO, CHARLIE])).toEqual([ALPHA, BRAVO, CHARLIE]);
    expect(rank([CHARLIE, BRAVO, ALPHA])).toEqual([ALPHA, BRAVO, CHARLIE]);
  });
});
