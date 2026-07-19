import { BadRequestException } from '@nestjs/common';
import { PollListSort } from './dto/list-polls.dto';
import { decodePollFeedCursor, encodePollFeedCursor } from './poll-feed-cursor';

const POLL_ID = '11111111-1111-1111-1111-111111111111';

describe('poll-feed-cursor — §6 keyset cursor codec', () => {
  it('round-trips all three sort shapes', () => {
    const cases = [
      { sort: PollListSort.new as const, createdAtMs: 1000, pollId: POLL_ID },
      {
        sort: PollListSort.top as const,
        metric: 7,
        createdAtMs: 1000,
        pollId: POLL_ID,
      },
      {
        sort: PollListSort.trending as const,
        refMs: 5000,
        metric: 2.5,
        createdAtMs: 1000,
        pollId: POLL_ID,
      },
    ];
    for (const cursor of cases) {
      expect(
        decodePollFeedCursor(encodePollFeedCursor(cursor), cursor.sort),
      ).toEqual(cursor);
    }
  });

  it('a cursor replayed under a DIFFERENT sort is a 400, never a silently-wrong page', () => {
    const encoded = encodePollFeedCursor({
      sort: PollListSort.new,
      createdAtMs: 1000,
      pollId: POLL_ID,
    });
    expect(() => decodePollFeedCursor(encoded, PollListSort.top)).toThrow(
      BadRequestException,
    );
  });

  it('garbage and shape-invalid cursors are 400s', () => {
    expect(() =>
      decodePollFeedCursor('not-a-cursor', PollListSort.new),
    ).toThrow(BadRequestException);
    const missingMetric = Buffer.from(
      JSON.stringify({ sort: 'top', createdAtMs: 1, pollId: POLL_ID }),
      'utf8',
    ).toString('base64url');
    expect(() => decodePollFeedCursor(missingMetric, PollListSort.top)).toThrow(
      BadRequestException,
    );
  });
});
