/**
 * D40 §1.2–1.4 — THE COMPLETION WRITE.
 *
 * Three properties, each of which was a live defect before this pass:
 *
 *  1. The answers get a HISTORY, and the users column is its latest-row
 *     projection, written in the SAME transaction. RED recipe: move the
 *     UPDATE outside `$transaction`, or drop the INSERT, and the
 *     "one transaction, both writes" case fails.
 *  2. The server stamps its OWN question-set version beside the client's
 *     declared one. RED recipe: store `dto.onboardingVersion` in both slots
 *     and the version case fails.
 *  3. The city becomes a KEY. RED recipe: stop calling
 *     `resolvePlaceIdByName` (or write the display string instead) and the
 *     city-key case fails.
 *
 * Plus the one the mobile mirror taught us: an EMPTY answer document must
 * never overwrite real answers.
 */
import 'reflect-metadata';
import { ONBOARDING_QUESTION_SET_VERSION } from '@crave-search/shared';
import { UserService } from './user.service';

const USER = '22222222-2222-2222-2222-222222222222';
const AUSTIN = '11111111-1111-1111-1111-111111111111';

interface Captured {
  sql: string;
  values: unknown[];
  /** true when the statement ran inside the $transaction callback. */
  inTransaction: boolean;
}

function createService(options: { resolvedPlaceId?: string | null } = {}) {
  const statements: Captured[] = [];
  let inTransaction = false;

  // $executeRaw is called BOTH ways in this service: as a tagged template
  // (strings + interpolations) and with a prebuilt Prisma.Sql object. Both
  // are normalized to (sql, values) so a case can assert on either without
  // caring which form the statement happened to take.
  const record = (
    first: TemplateStringsArray | { sql: string; values: unknown[] },
    ...rest: unknown[]
  ) => {
    const isSqlObject =
      typeof first === 'object' && first !== null && 'sql' in first;
    statements.push({
      sql: isSqlObject ? (first as { sql: string }).sql : first.join('?'),
      values: isSqlObject ? (first as { values: unknown[] }).values : rest,
      inTransaction,
    });
    return Promise.resolve(1);
  };

  const tx = { $executeRaw: jest.fn(record) };

  const prisma = {
    $executeRaw: jest.fn(record),
    $queryRaw: jest.fn(() => Promise.resolve([])),
    $transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => {
      inTransaction = true;
      try {
        return await fn(tx);
      } finally {
        inTransaction = false;
      }
    }),
    user: {
      findUnique: jest.fn(() => Promise.resolve(null)),
    },
  };

  const liveCities = {
    liveCities: jest.fn(() =>
      Promise.resolve([{ placeId: AUSTIN, name: 'Austin' }]),
    ),
    resolvePlaceIdByName: jest.fn(() =>
      Promise.resolve(
        'resolvedPlaceId' in options ? options.resolvedPlaceId : AUSTIN,
      ),
    ),
  };

  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

  const service = new UserService(
    prisma as never,
    // Config owns the entitlement default; the service refuses to guess it.
    {
      get: jest.fn((key: string) =>
        key === 'billing.defaultEntitlement' ? 'premium' : undefined,
      ),
    } as never,
    logger as never,
    { ensure: jest.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
    liveCities as never,
  );
  // getProfile is the read-back at the end of the write; it is not what these
  // cases are about, so it is stubbed to keep the statements list honest.
  jest
    .spyOn(
      service as unknown as { getProfile: (id: string) => Promise<unknown> },
      'getProfile',
    )
    .mockResolvedValue({} as never);

  return { service, statements, prisma, liveCities, logger };
}

const complete = (
  service: UserService,
  overrides: Record<string, unknown> = {},
) =>
  service.updateOnboarding(USER, {
    status: 'completed',
    onboardingVersion: 6,
    selectedCity: 'Austin',
    previewCity: null,
    answers: { cuisines: ['mexican'] },
    ...overrides,
  } as never);

describe('UserService.updateOnboarding — the D40 completion write', () => {
  it('appends the history row AND refreshes the projection in ONE transaction', async () => {
    const { service, statements, prisma } = createService();
    await complete(service);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const history = statements.find((s) =>
      s.sql.includes('user_onboarding_responses'),
    );
    const projection = statements.find(
      (s) => s.sql.includes('UPDATE "users"') && s.sql.includes('onboarding'),
    );
    expect(history).toBeDefined();
    expect(projection).toBeDefined();
    // Both, inside the same transaction — the projection can never disagree
    // with the row behind it.
    expect(history?.inTransaction).toBe(true);
    expect(projection?.inTransaction).toBe(true);
    expect(projection?.sql).toContain('"onboarding_responses"');
  });

  it('stores the SERVER question-set version beside the CLIENT-declared one', async () => {
    const { service, statements } = createService();
    await complete(service, { onboardingVersion: 6 });

    const history = statements.find((s) =>
      s.sql.includes('user_onboarding_responses'),
    );
    // answered_with_version = what the client rendered; question_set_version
    // = what this server understands. A mismatch is now a fact on the row.
    expect(history?.values).toContain(6);
    expect(history?.values).toContain(ONBOARDING_QUESTION_SET_VERSION);
  });

  it('resolves the city to a PLACE KEY through the one live-city definition', async () => {
    const { service, statements, liveCities } = createService();
    await complete(service);

    expect(liveCities.resolvePlaceIdByName).toHaveBeenCalledWith('Austin');
    const projection = statements.find((s) => s.sql.includes('UPDATE "users"'));
    expect(projection?.sql).toContain('"onboarding_city_place_id"');
    expect(projection?.values).toContain(AUSTIN);
  });

  it('a city that is not live sets NO key and says so out loud (never a silent zero)', async () => {
    const { service, statements, logger } = createService({
      resolvedPlaceId: null,
    });
    await complete(service, { selectedCity: 'Nowhereville' });

    const projection = statements.find((s) => s.sql.includes('UPDATE "users"'));
    expect(projection?.values).toContain(null);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('not a live city'),
      expect.objectContaining({ selectedCity: 'Nowhereville' }),
    );
  });

  it('an EMPTY answer document never overwrites real answers — and writes no history row', async () => {
    // This is the mobile "already finished on this device" mirror, which
    // sends `answers: {}`. Under a blind replace-whole-document rule it
    // erased every answer the user gave.
    const { service, statements } = createService();
    await complete(service, { answers: {} });

    expect(
      statements.some((s) => s.sql.includes('user_onboarding_responses')),
    ).toBe(false);
    const projection = statements.find((s) => s.sql.includes('UPDATE "users"'));
    expect(projection).toBeDefined();
    expect(projection?.sql).not.toContain('"onboarding_responses"');
  });
});
