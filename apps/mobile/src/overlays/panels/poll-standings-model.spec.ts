import type { PollLeaderboardEntry } from '../../services/polls';
import {
  applyOptimisticEndorsement,
  settlePollStandings,
  toPollStanding,
  type PollStanding,
} from './poll-standings-model';

const entry = (rank: number, endorsers = 10): PollLeaderboardEntry => ({
  rank,
  subjectType: 'entity',
  subjectId: `subject-${rank}`,
  name: `Option ${rank}`,
  type: null,
  distinctEndorsers: endorsers,
  currentUserEndorsed: false,
});

const leaderboardOf = (count: number): PollLeaderboardEntry[] =>
  Array.from({ length: count }, (_, index) => entry(index + 1, 100 - index));

describe('settlePollStandings', () => {
  // THE MUTATION GUARD (F928): restore the old `slice(0, rows.length || 4)` and this
  // fails — 10 server standings must produce 10 render-data entries, not 4.
  it('keeps every standing the server sent', () => {
    const settled = settlePollStandings(leaderboardOf(10));

    expect(settled).toHaveLength(10);
    expect(settled.map((row) => row.subjectId)).toEqual(
      Array.from({ length: 10 }, (_, index) => `subject-${index + 1}`)
    );
  });

  it('does not truncate to the four-row default when the poll is small or empty', () => {
    expect(settlePollStandings(leaderboardOf(2))).toHaveLength(2);
    expect(settlePollStandings([])).toEqual([]);
  });

  it('preserves server order, so a re-ranked leaderboard reorders the bars', () => {
    const reordered = [entry(1), entry(2), entry(3)].reverse();

    expect(settlePollStandings(reordered).map((row) => row.rank)).toEqual([3, 2, 1]);
  });

  it('projects only the fields the bars render', () => {
    expect(toPollStanding(entry(1, 7))).toEqual({
      rank: 1,
      subjectType: 'entity',
      subjectId: 'subject-1',
      name: 'Option 1',
      distinctEndorsers: 7,
      currentUserEndorsed: false,
    });
  });
});

describe('applyOptimisticEndorsement', () => {
  const rows: PollStanding[] = leaderboardOf(3).map(toPollStanding);

  it('flips only the tapped row and moves its count by one', () => {
    const next = applyOptimisticEndorsement(rows, 'subject-2', true);

    expect(next[1]).toMatchObject({ currentUserEndorsed: true, distinctEndorsers: 100 });
    expect(next[0]).toEqual(rows[0]);
    expect(next[2]).toEqual(rows[2]);
  });

  it('never drives an endorser count below zero on un-endorse', () => {
    const zeroed: PollStanding[] = [
      { ...rows[0], distinctEndorsers: 0, currentUserEndorsed: true },
    ];

    expect(applyOptimisticEndorsement(zeroed, zeroed[0].subjectId, false)[0]).toMatchObject({
      currentUserEndorsed: false,
      distinctEndorsers: 0,
    });
  });

  it('preserves row count', () => {
    expect(applyOptimisticEndorsement(rows, 'subject-1', true)).toHaveLength(rows.length);
  });
});
