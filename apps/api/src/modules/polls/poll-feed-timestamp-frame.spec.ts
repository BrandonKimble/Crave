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
  const capturedValues: unknown[][] = [];
  const prisma = {
    $queryRaw: jest.fn((sql: { sql: string; values: unknown[] }) => {
      captured.push(sql.sql);
      capturedValues.push(sql.values);
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
    { blockedPeerIds: jest.fn().mockResolvedValue(new Set()) } as never, // blocks
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
    return { sql: captured.join('\n'), values: capturedValues.flat() };
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

      it(`every bound Date is converted — ${label}`, async () => {
        const { sql, values } = await captureFeedSql(sort, withCursor);

        // PAIR EACH PARAMETER WITH ITS SLOT (red team 2026-08-02).
        //
        // The previous check searched for `?::timestamptz` NOT followed by
        // `AT TIME ZONE`. Prisma renders a bound Date as a bare `?` — the
        // string `::timestamptz` appears ONLY because utcInstant put it there.
        // So the detector looked for a shape that only the FIXED code emits,
        // and the broken shape (a bare `?`) was invisible. Six of seven tests
        // were vacuous: reverting a real bind stayed green.
        //
        // The honest question is positional: for every Date argument, is its
        // `?` inside an `AT TIME ZONE 'UTC'` conversion?
        const slots = sql.split('?');
        const unconverted: number[] = [];
        values.forEach((value, index) => {
          if (!(value instanceof Date)) return;
          // The text immediately AFTER this parameter's slot.
          const after = slots[index + 1] ?? '';
          if (!/^\s*(::timestamptz\s*)?AT TIME ZONE 'UTC'/.test(after)) {
            unconverted.push(index);
          }
        });

        expect({ sort, withCursor, unconverted }).toEqual({
          sort,
          withCursor,
          unconverted: [],
        });
      });
    }
  }

  it('actually emits the conversion (the assertion above can see it)', async () => {
    const { sql, values } = await captureFeedSql(PollListSort.trending, true);
    expect(sql).toContain(`AT TIME ZONE 'UTC'`);
    // And the pairing above actually had Dates to inspect — otherwise the
    // positional check would pass over an empty set.
    expect(values.some((v) => v instanceof Date)).toBe(true);
  });
});
