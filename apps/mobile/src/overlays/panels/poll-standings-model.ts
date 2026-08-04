import type { PollCandidate, PollLeaderboardEntry } from '../../services/polls';

/**
 * The poll standings the bars render, as data.
 *
 * Extracted from PollCandidateBars so the settle step is testable in the hermetic
 * logic lane (the .tsx itself never enters jest). The rule this file exists to hold
 * (F928, owner-ruled 2026-08-03): **every standing the server sends renders.** The
 * settle step used to slice the fresh leaderboard down to the row count that
 * happened to be on screen (`slice(0, rows.length || 4)`), so a poll whose options
 * grew — or whose first render was the 4-row default — silently lost the tail. How
 * MANY bars a given host shows is a presentation choice made at the render site
 * (the card's `previewRows` half-peek); it is not the settle step's business.
 */
export type PollStanding = Pick<
  PollCandidate,
  'rank' | 'subjectType' | 'subjectId' | 'name' | 'distinctEndorsers' | 'currentUserEndorsed'
>;

export const toPollStanding = (entry: PollLeaderboardEntry): PollStanding => ({
  rank: entry.rank,
  subjectType: entry.subjectType,
  subjectId: entry.subjectId,
  name: entry.name,
  distinctEndorsers: entry.distinctEndorsers,
  currentUserEndorsed: entry.currentUserEndorsed,
});

/** The fresh standings an endorsement toggle settles against — ALL of them. */
export const settlePollStandings = (leaderboard: PollLeaderboardEntry[]): PollStanding[] =>
  leaderboard.map(toPollStanding);

/**
 * The optimistic overlay applied to the on-screen rows the instant a bar is tapped,
 * before the server answers: the tapped row flips, its endorser count moves by one
 * (never below zero), every other row is untouched.
 */
export const applyOptimisticEndorsement = (
  rows: PollStanding[],
  subjectId: string,
  willEndorse: boolean
): PollStanding[] =>
  rows.map((row) =>
    row.subjectId === subjectId
      ? {
          ...row,
          currentUserEndorsed: willEndorse,
          distinctEndorsers: Math.max(0, row.distinctEndorsers + (willEndorse ? 1 : -1)),
        }
      : row
  );
