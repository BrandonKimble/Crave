/**
 * HONEST PRISMA DOUBLES — fakes that answer the question they were asked.
 *
 * THE INCIDENT (F2200-F2206). Six specs passed while their subject did nothing,
 * and FOUR were the same construct: `prisma.entityRedirect.findMany` stubbed
 * with an unconditional `jest.fn().mockResolvedValue([...])`. A mock that
 * answers every argument identically cannot tell a resolver asking about the
 * right ids from one asking about none, so all four stayed green when the
 * production call was mutated to `fromEntityId: { in: [] }`.
 *
 * All four specs existed to close the SAME leak: an entity merged away keeps
 * serving under its stale identity when the redirect lookup resolves nothing.
 * Each was written as the proof that leak was closed. None could have shown it
 * open.
 *
 * WHY IT CLUSTERS HERE. The redirect read is a pure lookup whose ONLY input is
 * an id set, so there is nothing else for an assertion to land on — and the
 * natural thing to assert is the resolved output, which a one-answer mock
 * supplies for free. Any table with that shape will grow the same defect.
 *
 * WHY A SHARED DOUBLE. Within a day of the six fixes there were already TWO
 * byte-identical private `redirectTable` helpers in two spec files, and two
 * more specs doing it inline a third way. That is the hand-rolled-resolver
 * pattern restarting. One home, and the blind form is banned by lint
 * (`no-restricted-syntax` in eslint.config.mjs) so a caller cannot quietly
 * reintroduce it.
 */
import type { Prisma } from '@prisma/client';

export interface EntityRedirectRow {
  fromEntityId: string;
  toEntityId: string;
}

type FindManyArgs = {
  where?: {
    fromEntityId?: { in?: readonly string[] };
    toEntityId?: { in?: readonly string[] };
  };
};

/**
 * A stand-in for `prisma.entityRedirect` that KEYS ON ITS INPUT: it returns
 * only the rows whose `fromEntityId` was actually asked for.
 *
 * A resolver that asks about the wrong ids — or about none — gets nothing back,
 * which is exactly what production does and exactly what the one-answer mock
 * concealed.
 */
export function entityRedirectDouble(rows: readonly EntityRedirectRow[]) {
  const findMany = jest.fn((args?: FindManyArgs) => {
    // BOTH DIRECTIONS, because the redirect table is read both ways: forward
    // ("what did this stale id become?") and reverse ("which stale ids point at
    // this survivor?", signal-demand-read.service.ts:1095, which folds a
    // survivor's history back together). A double that modelled only the
    // forward read would have to be bypassed by the reverse callers — and a
    // bypassed double is how the private copies started.
    const forward = args?.where?.fromEntityId?.in;
    const reverse = args?.where?.toEntityId?.in;

    if (forward !== undefined) {
      const wanted = new Set(forward);
      return Promise.resolve(rows.filter((r) => wanted.has(r.fromEntityId)));
    }
    if (reverse !== undefined) {
      const wanted = new Set(reverse);
      return Promise.resolve(rows.filter((r) => wanted.has(r.toEntityId)));
    }

    // Not a shape this double models. Fail LOUDLY rather than invent an answer
    // — a double that guesses is precisely how we got here. The error names
    // the fix so the next query shape is added once, for every spec at once,
    // instead of being worked around locally.
    throw new Error(
      'entityRedirectDouble: expected findMany with where.fromEntityId.in or ' +
        'where.toEntityId.in, got ' +
        JSON.stringify(args?.where) +
        '. If the query shape changed, model it here so every spec using this ' +
        'double changes together.',
    );
  });

  // The mock is typed in BOTH directions — return value and ARGUMENTS — so a
  // spec asserting `findMany.mock.calls[0][0].where.fromEntityId.in` reads a
  // typed value instead of `any`. A bare `jest.Mock` erases the argument type,
  // which is how asserting on the call turns into six no-unsafe-* errors and
  // then into a suppression: the assertion most worth writing here is the one
  // about what was ASKED, so it must be the easiest one to write.
  /**
   * The ids a given call actually asked about, sorted.
   *
   * This is the assertion worth writing — "the resolver asked about exactly the
   * subjects on the board" is the claim the blind mocks could not support — so
   * it gets a one-liner. Reaching into `findMany.mock.calls[0][0].where` by
   * hand costs four optional-chain guards, and the reliable outcome of that is
   * a `!` or a suppression, not a better assertion.
   *
   * Throws when the call never happened: "asked about nothing" and "never asked"
   * are different failures and must not collapse into an empty array.
   */
  const askedFor = (callIndex = 0): string[] => {
    const call = findMany.mock.calls[callIndex];
    if (!call) {
      throw new Error(
        `entityRedirectDouble.askedFor(${callIndex}): findMany was called ` +
          `${findMany.mock.calls.length} time(s) — the read under test never happened.`,
      );
    }
    const where = call[0]?.where;
    const ids = where?.fromEntityId?.in ?? where?.toEntityId?.in ?? [];
    return [...ids].sort();
  };

  return { findMany, askedFor } as unknown as Prisma.EntityRedirectDelegate & {
    findMany: jest.Mock<Promise<EntityRedirectRow[]>, [FindManyArgs?]>;
    askedFor: (callIndex?: number) => string[];
  };
}
