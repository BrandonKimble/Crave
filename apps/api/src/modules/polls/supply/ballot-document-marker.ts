import { Prisma } from '@prisma/client';

/**
 * THE marker that says "this source document is a ballot claim, not room
 * activity" — one literal, written once, read once.
 *
 * WHY (F540). A per-voter ballot document must be excluded from A(τ), the
 * public-score source-activity baseline. That was a cross-module contract
 * between two files that never referenced each other: the WRITER
 * (poll-ballot-mention.service) stamped `voterUserId` into the document's
 * rawPayload, and the SCORER (public-crave-score.service) excluded any document
 * whose `raw_payload` carried that key. Rename it on one side and a poll room's
 * A(τ) silently re-weights by turnout — voters+1 documents contributing where
 * one should.
 *
 * A spec used to couple them by asserting both files contained the same string.
 * That is the shape of the contract, not the contract: it could only notice
 * afterwards, it had to know both file paths, and it passed on any file that
 * merely mentioned the token. Exporting the literal makes drift not a thing
 * that gets caught but a thing that cannot be expressed — there is one
 * spelling, and both ends import it.
 */
export const BALLOT_VOTER_MARKER = 'voterUserId';

/**
 * The SQL predicate for "this document is NOT a ballot claim".
 *
 * Lives here rather than in the scorer because the JSON key and the test for
 * its absence are one fact. `COALESCE(..., true)` keeps a NULL payload — a
 * document with no rawPayload at all — counted as room activity.
 */
export function notABallotDocumentSql(alias: string): Prisma.Sql {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) {
    throw new Error(`Unsafe SQL alias: ${JSON.stringify(alias)}`);
  }
  return Prisma.sql`COALESCE(NOT (${Prisma.raw(alias)}.raw_payload ? ${BALLOT_VOTER_MARKER}), true)`;
}
