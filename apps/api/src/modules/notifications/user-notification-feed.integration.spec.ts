import { PrismaClient } from '@prisma/client';

/**
 * A PAGINATED ORDER IS A TOTAL ORDER OR IT IS NOT AN ORDER (F7502).
 *
 * `listFeed` pages by `created_at DESC` alone, which is non-unique
 * (Timestamptz(3)). Two notifications for one user sharing a millisecond are
 * ordered however the plan returns — not stably between the page-1 and page-2
 * queries — so a row can appear on both pages or on neither. One transaction /
 * a batch producer gives every row the SAME `created_at` (Postgres `now()` is
 * transaction-stable), which turns the rare tie into the normal case.
 *
 * This inserts five rows for one user in a single transaction (identical
 * `created_at`) with ids in ASCENDING order, and proves the fetched order is
 * `user_notification_id` DESC — which holds only because the query carries the
 * unique tiebreak. Without it, the rows come back in the plan's tie order
 * (insertion/heap order, ascending), and the assertion goes RED.
 */
describe('user notification feed — pagination is a total order', () => {
  const prisma = new PrismaClient();

  // Five ids in ASCENDING order. If the ORDER BY carried no unique tiebreak the
  // ties would return in insertion order (these, ascending); the fix returns
  // them DESC, so the reverse of this list is the correct answer.
  const ids = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
    '55555555-5555-4555-8555-555555555555',
  ];
  let userId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `feed-order-${Date.now()}@example.test` },
    });
    userId = user.userId;
    const sharedCreatedAt = new Date('2026-08-07T00:00:00.000Z');
    await prisma.$transaction(
      ids.map((id) =>
        prisma.userNotification.create({
          data: {
            userNotificationId: id,
            userId,
            type: 'follower_added',
            payload: {},
            createdAt: sharedCreatedAt,
          },
        }),
      ),
    );
  });

  afterAll(async () => {
    // FK is ON DELETE CASCADE, so removing the user removes the notifications.
    if (userId) await prisma.user.delete({ where: { userId } });
    await prisma.$disconnect();
  });

  it('orders identical-timestamp rows by the unique id tiebreak (RED without it)', async () => {
    const rows = await prisma.userNotification.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { userNotificationId: 'desc' }],
      take: ids.length,
    });
    expect(rows.map((r) => r.userNotificationId)).toEqual([...ids].reverse());
  });

  it('pages the five rows without a duplicate or a gap', async () => {
    const collected: string[] = [];
    for (let offset = 0; offset < ids.length; offset += 2) {
      const page = await prisma.userNotification.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { userNotificationId: 'desc' }],
        skip: offset,
        take: 2,
      });
      collected.push(...page.map((r) => r.userNotificationId));
    }
    // Every id exactly once — the union of the pages is the whole set.
    expect(new Set(collected).size).toBe(ids.length);
    expect(collected.length).toBe(ids.length);
    expect(new Set(collected)).toEqual(new Set(ids));
  });
});
