import 'reflect-metadata';
import { PollState } from '@prisma/client';
import { PollListSort } from './dto/list-polls.dto';
import { PollsService } from './polls.service';
import { decodePollFeedCursor, encodePollFeedCursor } from './poll-feed-cursor';

// THE TIMEZONE LANDMINE (attributed empirically 2026-08-02).
//
// Every timestamp column on polls/poll_comments/poll_endorsements is
// `timestamp WITHOUT time zone`, storing UTC wall-clock. Prisma binds a JS
// Date as `timestamptz`. Comparing the two makes Postgres coerce the naive
// column using the SESSION's TimeZone, so the meaning of every feed cursor
// depends on where the server thinks it is.
//
// Measured on a dev box running America/Chicago against one real cursor: the
// timestamptz form matched 3,175 polls where the correct naive comparison
// matched 16,528. The feed could not load a second page on ANY sort — page 1
// said "more", page 2 came back empty. Production runs UTC, where the offset
// is zero and the bug is invisible; that is what made it a landmine rather
// than an outage, and why it needs a test rather than a memory.
//
// These tests capture the SQL the REAL service builds. A copy of the helper
// asserted against itself would pass forever; this fails if the production
// query ever compares a bound Date against a naive column again.

const PLACE_ID = '44444444-4444-4444-4444-444444444444';
const POLL_ID = 'ceb6f804-5efc-48fc-95ad-f3ecb61ae8a7';

function captureFeedSql(sort: PollListSort, withCursor: boolean) {
  const captured: string[] = [];
  const prisma = {
    $queryRaw: jest.fn((sql: { sql: string }) => {
      captured.push(sql.sql);
      return Promise.resolve([]);
    }),
  };
  const service = new PollsService(
    prisma as never,
    { setContext: () => ({}), warn: jest.fn(), error: jest.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const cursor = withCursor
    ? encodePollFeedCursor(
        sort === PollListSort.new
          ? {
              sort: PollListSort.new,
              createdAtMs: Date.UTC(2026, 6, 27, 5, 5, 0, 837),
              pollId: POLL_ID,
            }
          : {
              sort,
              metric: 3,
              refMs: Date.UTC(2026, 6, 27, 5, 5, 0, 837),
              createdAtMs: Date.UTC(2026, 6, 27, 5, 5, 0, 837),
              pollId: POLL_ID,
            },
      )
    : null;

  return (async () => {
    await (
      service as unknown as {
        queryFeedPage: (p: unknown) => Promise<unknown>;
      }
    ).queryFeedPage({
      state: PollState.active,
      mode: null,
      launchedAfter: new Date(Date.UTC(2026, 6, 1)),
      placeIds: [PLACE_ID],
      sort,
      limit: 2,
      // Decoded exactly as the controller does, so the spec exercises the
      // real cursor round-trip rather than a hand-built object.
      cursor: cursor ? decodePollFeedCursor(cursor, sort) : null,
    });
    return captured.join('\n');
  })();
}

const SORTS = [
  PollListSort.new,
  PollListSort.top,
  PollListSort.trending,
] as const;

describe('poll feed timestamp frame', () => {
  for (const sort of SORTS) {
    for (const withCursor of [false, true]) {
      const label = `${sort}${withCursor ? ' (paging)' : ' (first page)'}`;

      it(`states the UTC frame on every Date it binds — ${label}`, async () => {
        const sql = await captureFeedSql(sort, withCursor);

        // Every bound instant must be converted into the naive frame the
        // columns are stored in. Prisma renders parameters as `?`, so this
        // looks for a `?::timestamptz` that is NOT immediately converted —
        // the exact shape that shipped.
        const bareTimestamptz = /\?::timestamptz(?!\s*AT TIME ZONE)/.exec(sql);
        expect({
          sort,
          withCursor,
          offender: bareTimestamptz?.[0] ?? null,
        }).toEqual({ sort, withCursor, offender: null });
      });
    }
  }

  it('actually emits the conversion (the assertion above can see it)', async () => {
    const sql = await captureFeedSql(PollListSort.trending, true);
    expect(sql).toContain(`AT TIME ZONE 'UTC'`);
  });
});
