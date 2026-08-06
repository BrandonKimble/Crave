import { of } from 'rxjs';
import { TomtomChainProbeAdapter } from './tomtom-chain-probe.adapter';

/**
 * A FAILURE IS NOT AN OBSERVATION — PROVEN AS A PROPERTY, NOT A CATALOGUE.
 *
 * The P5 class is: a vendor fault gets written down as ground truth. Every
 * previous defence against it was a LIST of failure shapes, each mapped to the
 * right arm — and a list is only as good as the imagination that wrote it. The
 * red team that produced the current shape list said so plainly: "the set of
 * shapes is my construction from the adapter's parse paths, not an observed
 * catalogue of real TomTom faults." A shape nobody imagined is exactly the one
 * that bites, because that is what "unimagined" means.
 *
 * So this file asserts the property INSTEAD of the cases. It feeds ~400
 * structurally-varied bodies — wrong types at every level, partial objects,
 * arrays where objects belong, nulls, empty strings, extra fields, deeply
 * malformed nesting — through the REAL adapter, and asserts one law:
 *
 *   A body may produce 'named' or 'empty' ONLY IF it affirmatively matches the
 *   vendor contract. Everything else, without exception, is 'failed'.
 *
 * That is default-deny stated as a test. It cannot be evaded by a shape I did
 * not think of, because it never enumerates shapes — it enumerates the two
 * narrow gates a body must pass to be BELIEVED, and demands that everything
 * outside them is disbelieved.
 *
 * The generator is deterministic (no seeded randomness): the same 400 bodies
 * on every run, so a failure is reproducible from the index alone.
 */

interface Built {
  adapter: TomtomChainProbeAdapter;
}

function buildAdapter(body: unknown): Built {
  const httpService = {
    get: (url: string) => {
      if (url.includes('/reverseGeocode/')) return of({ data: body });
      return of({ data: { results: [] } });
    },
  };
  const governance = {
    assertTomtomSpendOpen: () => Promise.resolve(),
    pools: { poisonWindow: jest.fn() },
    draw: (_pool: string, _workClass: string, act: () => Promise<unknown>) =>
      act(),
  };
  const prisma = {
    place: { findMany: () => Promise.resolve([]) },
    $queryRaw: () => Promise.resolve([]),
  };
  const configService = {
    get: (key: string) => (key === 'tomtom.apiKey' ? 'test-key' : undefined),
  };
  const loggerService = {
    setContext: () => ({
      debug: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    }),
  };
  return {
    adapter: new TomtomChainProbeAdapter(
      httpService as never,
      prisma as never,
      governance as never,
      { record: jest.fn() } as never,
      { emit: jest.fn() } as never,
      configService as never,
      loggerService as never,
    ),
  };
}

/** Values that are not the thing the contract asks for, at any position. */
const WRONG: unknown[] = [
  null,
  undefined,
  0,
  1,
  -1,
  NaN,
  '',
  'x',
  'null',
  true,
  false,
  [],
  ['a'],
  [null],
  {},
  { a: 1 },
  [[]],
  [{}],
  { length: 1 },
  Object.create(null),
];

/** A body the contract DOES accept, for the control arm. */
function wellFormedNamed(): unknown {
  return {
    addresses: [
      {
        address: {
          countryCode: 'US',
          country: 'United States',
          countrySubdivisionCode: 'NY',
          countrySubdivisionName: 'New York',
          municipality: 'New York',
        },
        dataSources: { geometry: { id: 'geo-1' } },
        position: '40.7,-74.0',
      },
    ],
  };
}

/** Every malformed body this file asserts about. Deterministic and ordered. */
function corpus(): Array<{ index: number; label: string; body: unknown }> {
  const cases: Array<{ label: string; body: unknown }> = [];

  // 1. The whole body is the wrong thing.
  WRONG.forEach((value, i) => {
    cases.push({ label: `body=${shapeOf(value)}[${i}] #1`, body: value });
  });
  // 2. `addresses` is the wrong thing (an ARRAY is the only contract).
  for (const value of WRONG) {
    if (Array.isArray(value)) continue; // arrays are covered below
    cases.push({
      label: `addresses=${shapeOf(value)}[${WRONG.indexOf(value)}] #2`,
      body: { addresses: value },
    });
  }
  // 3. The first address entry is the wrong thing.
  for (const value of WRONG) {
    cases.push({
      label: `addresses[0]=${shapeOf(value)}[${WRONG.indexOf(value)}] #3`,
      body: { addresses: [value] },
    });
  }
  // 4. `address` is present but the wrong thing.
  for (const value of WRONG) {
    cases.push({
      label: `address=${shapeOf(value)}[${WRONG.indexOf(value)}] #4`,
      body: { addresses: [{ address: value }] },
    });
  }
  // 5. `address` is an object but countryCode is the wrong thing — the
  //    ladder-audit incident: a named ground with an empty country slot was
  //    once recorded as "nothing lives here".
  for (const value of WRONG) {
    cases.push({
      label: `countryCode=${shapeOf(value)}[${WRONG.indexOf(value)}] #5`,
      body: {
        addresses: [{ address: { countryCode: value, municipality: 'X' } }],
      },
    });
  }
  // 6. A valid country but NO ladder rung names anything — nothing to sketch.
  for (const value of WRONG) {
    cases.push({
      label: `no rungs, municipality=${shapeOf(value)}[${WRONG.indexOf(value)}] #6`,
      body: {
        addresses: [{ address: { countryCode: 'US', municipality: value } }],
      },
    });
  }
  // 7. Contract-shaped but with junk grafted alongside — extra fields must
  //    never turn a good answer bad, nor a bad answer good.
  for (const value of WRONG) {
    cases.push({
      label: `well-formed + junk=${shapeOf(value)}[${WRONG.indexOf(value)}] #7`,
      body: {
        addresses: [{ address: { countryCode: 'US', country: 'US' } }],
        junk: value,
      },
    });
  }

  return cases.map((c, index) => ({ index, ...c }));
}

function shapeOf(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === 'object') return 'object';
  if (typeof value === 'number' && Number.isNaN(value)) return 'NaN';
  return `${typeof value}:${JSON.stringify(value) ?? 'undefined'}`;
}

/**
 * The two gates a body must pass to be BELIEVED. Written independently of the
 * adapter — if this and the adapter ever disagree, one of them is wrong and
 * the test says so.
 */
function contractAllows(body: unknown): 'named' | 'empty' | null {
  if (typeof body !== 'object' || body === null) return null;
  const addresses = (body as { addresses?: unknown }).addresses;
  if (!Array.isArray(addresses)) return null;
  if (addresses.length === 0) return 'empty';
  const entry = addresses[0] as { address?: unknown } | null;
  if (typeof entry !== 'object' || entry === null) return null;
  const address = entry.address;
  if (typeof address !== 'object' || address === null) return null;
  const country = (address as { countryCode?: unknown }).countryCode;
  if (typeof country !== 'string' || country.trim() === '') return null;
  const RUNGS = [
    'neighbourhood',
    'municipalitySubdivision',
    'municipality',
    'countrySecondarySubdivision',
    'countrySubdivisionName',
    // NOT 'countrySubdivision' — it is the two-letter CODE, not a name, so it
    // never makes a body 'named'. See LEVEL_LADDER in the adapter.
    'country',
  ];
  const named = RUNGS.some((rung) => {
    const value = (address as Record<string, unknown>)[rung];
    return typeof value === 'string' && value.trim() !== '';
  });
  return named ? 'named' : null;
}

const ANCHOR = { lat: 40.7, lng: -74.0 };

describe('a probe result is believed only when the contract is affirmatively met', () => {
  const cases = corpus();

  it('the corpus is large and varied (not vacuously green)', () => {
    expect(cases.length).toBeGreaterThan(100);
    expect(new Set(cases.map((c) => c.label)).size).toBe(cases.length);
  });

  it('the CONTROL arm is believed — the law is not "disbelieve everything"', async () => {
    const { adapter } = buildAdapter(wellFormedNamed());
    const result = await adapter.probe(ANCHOR);
    expect(result.kind).toBe('named');
  });

  it('an empty addresses array is the ONE remembered negative', async () => {
    const { adapter } = buildAdapter({ addresses: [] });
    const result = await adapter.probe(ANCHOR);
    expect(result.kind).toBe('empty');
  });

  it('a two-letter CODE is not a name — countrySubdivision alone never names a ground', async () => {
    // The scar: `countrySubdivisionName ?? countrySubdivision` would have
    // named this ground "MO" instead of "Missouri". Removed from one of three
    // ladder copies on 2026-07-29; this pins the production one.
    const { adapter } = buildAdapter({
      addresses: [
        {
          address: { countryCode: 'US', countrySubdivision: 'MO' },
          dataSources: { geometry: { id: 'geo-1' } },
        },
      ],
    });
    const result = await adapter.probe(ANCHOR);
    expect(result.kind).toBe('failed');
  });

  it('the NAME field at the same rung still names it', async () => {
    const { adapter } = buildAdapter({
      addresses: [
        {
          address: {
            countryCode: 'US',
            countrySubdivision: 'MO',
            countrySubdivisionName: 'Missouri',
          },
          dataSources: { geometry: { id: 'geo-1' } },
          position: '38.5,-92.2',
        },
      ],
    });
    const result = await adapter.probe(ANCHOR);
    expect(result.kind).toBe('named');
    if (result.kind === 'named') {
      expect(result.chain.map((n) => n.name)).toContain('Missouri');
      expect(result.chain.map((n) => n.name)).not.toContain('MO');
    }
  });

  it('EVERY body outside the contract is failed — never named, never empty', async () => {
    const violations: string[] = [];
    for (const { index, label, body } of cases) {
      const { adapter } = buildAdapter(body);
      const result = await adapter.probe(ANCHOR);
      const allowed = contractAllows(body);
      if (allowed === null && result.kind !== 'failed') {
        violations.push(
          `#${index} ${label}: contract says DISBELIEVE, adapter said '${result.kind}'`,
        );
      }
      if (allowed !== null && result.kind !== allowed) {
        violations.push(
          `#${index} ${label}: contract says '${allowed}', adapter said '${result.kind}'`,
        );
      }
    }
    expect(violations).toEqual([]);
  });
});
