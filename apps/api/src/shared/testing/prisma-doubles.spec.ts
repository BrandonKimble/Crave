import { entityRedirectDouble } from './prisma-doubles';

/**
 * F2210 — the double that replaced four blind mocks needs its own proof.
 *
 * The defect it exists to prevent is a stub that answers every argument the
 * same way, so the property under test is precisely that the answer DEPENDS ON
 * THE ARGUMENT. A double asserted only through the specs that use it would
 * inherit their blindness.
 */
describe('entityRedirectDouble', () => {
  const A = 'aaaaaaaa-0000-0000-0000-000000000001';
  const B = 'bbbbbbbb-0000-0000-0000-000000000002';
  const SURVIVOR = 'cccccccc-0000-0000-0000-000000000003';
  const rows = [
    { fromEntityId: A, toEntityId: SURVIVOR },
    { fromEntityId: B, toEntityId: SURVIVOR },
  ];

  it('forward: returns only the rows whose fromEntityId was asked for', async () => {
    const table = entityRedirectDouble(rows);

    const got = await table.findMany({ where: { fromEntityId: { in: [A] } } });

    expect(got).toEqual([{ fromEntityId: A, toEntityId: SURVIVOR }]);
  });

  it('forward: asking about NOTHING resolves nothing — the mutation the blind mocks survived', async () => {
    const table = entityRedirectDouble(rows);

    const got = await table.findMany({ where: { fromEntityId: { in: [] } } });

    // The one-answer mock returned the seeded rows here, which is exactly why
    // four specs stayed green while their resolver asked about no ids at all.
    expect(got).toEqual([]);
  });

  it('forward: an id with no redirect resolves nothing', async () => {
    const table = entityRedirectDouble(rows);

    const got = await table.findMany({
      where: { fromEntityId: { in: ['dddddddd-0000-0000-0000-000000000004'] } },
    });

    expect(got).toEqual([]);
  });

  it('reverse: returns every source pointing at the asked-for survivor', async () => {
    const table = entityRedirectDouble(rows);

    const got = await table.findMany({
      where: { toEntityId: { in: [SURVIVOR] } },
    });

    expect(got).toHaveLength(2);
    expect(got.map((r) => r.fromEntityId).sort()).toEqual([A, B].sort());
  });

  it('reverse: asking about NOTHING resolves nothing', async () => {
    const table = entityRedirectDouble(rows);

    const got = await table.findMany({ where: { toEntityId: { in: [] } } });

    expect(got).toEqual([]);
  });

  it('refuses a query shape it does not model instead of inventing an answer', () => {
    const table = entityRedirectDouble(rows);

    // A double that quietly returned the seeded rows for an unmodelled shape
    // would be the original defect wearing a helper's name. It throws
    // SYNCHRONOUSLY — findMany is a plain jest.fn that returns a promise, so
    // the guard fires before any promise exists to reject.
    expect(() =>
      table.findMany({ where: { somethingElse: { in: [A] } } } as never),
    ).toThrow(/expected findMany with where\.fromEntityId\.in/);
  });
});
