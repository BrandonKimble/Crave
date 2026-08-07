import type { PlaceSketchNode } from './places-catalog.service';
/**
 * TomtomChainProbeAdapter specs — §2 sketch mechanics.
 *
 * The probe's reverse geocode is PLAIN (address-mode, corrected 2026-08-07):
 * it supplies the COMPLETE chain of names and NO geometry — its boundingBox
 * is a position box, never an outline. All geometry arrives through the
 * forward geocode ({topLeftPoint,btmRightPoint} objects), which is why the
 * F3001 antimeridian tests below exercise only the forward parser.
 */
import { of } from 'rxjs';
import {
  TomtomChainProbeAdapter,
  parseForwardBoundingBox,
} from './tomtom-chain-probe.adapter';
import { bboxContainsPoint } from '@crave-search/shared';
import { SpendBudgetClosedError } from '../external-integrations/governance/governance.service';

/**
 * A PLAIN (address-mode) reverse entry, the shape the probe actually
 * receives: entityType null, no dataSources, boundingBox a few-metre
 * position box. The position box is included PRECISELY so the suite proves
 * nobody adopts it as an outline — the deleted freeNode step would have
 * sketched this neighbourhood as a doorstep.
 */
const UWS_REVERSE_ENTRY = {
  address: {
    countryCode: 'US',
    countrySubdivision: 'NY',
    countrySubdivisionName: 'New York',
    countrySubdivisionCode: 'NY',
    municipality: 'New York',
    // The rung the entityType filter used to null out (2026-08-07): a plain
    // response carries it, and the chain must too.
    municipalitySubdivision: 'Manhattan',
    neighbourhood: 'Upper West Side',
    country: 'United States',
    boundingBox: {
      northEast: '40.787099,-73.975303',
      southWest: '40.786899,-73.975503',
      entity: 'position',
    },
  },
  position: '40.786999,-73.975403',
};

const MANHATTAN_FORWARD_RESULT = {
  type: 'Geography',
  entityType: 'Municipality',
  address: { countryCode: 'US', municipality: 'New York' },
  position: { lat: 40.7532511, lon: -74.0038099 },
  boundingBox: {
    topLeftPoint: { lat: 40.882, lon: -74.04725 },
    btmRightPoint: { lat: 40.684007, lon: -73.907093 },
  },
  dataSources: { geometry: { id: 'geo-nyc' } },
};

type HttpCall = { url: string; params: Record<string, unknown> };

function buildAdapter(options: {
  reverseAddresses?: unknown[];
  /** Force a body that violates the contract (no `addresses` array). */
  reverseBodyMalformed?: boolean;
  forwardResults?: unknown[];
  additionalData?: unknown[];
  denyPool?: boolean;
  knownBboxIdentities?: boolean;
  /** Wave-6 item 2: every http call rejects with a vendor HTTP failure
   *  (AxiosError shape); retryAfter fills the Retry-After header. */
  httpFailure?: { status: number; retryAfter?: string };
}) {
  const calls: HttpCall[] = [];
  const drawCalls: Array<{ pool: string; workClass: string }> = [];
  const httpService = {
    get: (url: string, config: { params: Record<string, unknown> }) => {
      calls.push({ url, params: config.params });
      if (options.httpFailure) {
        throw Object.assign(
          new Error(
            `Request failed with status code ${options.httpFailure.status}`,
          ),
          {
            isAxiosError: true,
            response: {
              status: options.httpFailure.status,
              headers: options.httpFailure.retryAfter
                ? { 'retry-after': options.httpFailure.retryAfter }
                : {},
            },
          },
        );
      }
      if (url.includes('/reverseGeocode/')) {
        return of({
          data: options.reverseBodyMalformed
            ? { unexpected: true }
            : { addresses: options.reverseAddresses ?? [] },
        });
      }
      if (url.includes('additionalData')) {
        return of({ data: { additionalData: options.additionalData ?? [] } });
      }
      return of({ data: { results: options.forwardResults ?? [] } });
    },
  };
  const poisonWindow = jest.fn();
  const governance = {
    assertTomtomSpendOpen: () => Promise.resolve(),
    pools: { poisonWindow },
    draw: async (
      pool: string,
      workClass: string,
      act: () => Promise<unknown>,
    ) => {
      drawCalls.push({ pool, workClass });
      return options.denyPool ? null : act();
    },
  };
  // P4: "catalog knows the extent" = a matching identity row WITH a ground.
  const prisma = {
    place: {
      findMany: () =>
        Promise.resolve(
          options.knownBboxIdentities ? [{ placeId: 'known-place-id' }] : [],
        ),
    },
    $queryRaw: () =>
      Promise.resolve(options.knownBboxIdentities ? [{ ok: true }] : []),
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
  const adapter = new TomtomChainProbeAdapter(
    httpService as never,
    prisma as never,
    governance as never,
    { record: jest.fn() } as never,
    { emit: jest.fn() } as never,
    configService as never,
    loggerService as never,
  );
  return { adapter, calls, drawCalls, poisonWindow, governance };
}

const ANCHOR = { lat: 40.787, lng: -73.9754 };

describe('TomtomChainProbeAdapter', () => {
  it('builds the COMPLETE chain most-specific-first — including the rung the entityType filter used to erase', async () => {
    const { adapter, calls } = buildAdapter({
      reverseAddresses: [UWS_REVERSE_ENTRY],
      knownBboxIdentities: true, // no forward geocodes — isolate reverse parsing
    });
    const result = await adapter.probe(ANCHOR);
    // The request is PLAIN: an entityType param would truncate the chain
    // (nulls municipalitySubdivision and usually countrySecondarySubdivision
    // — measured 2026-08-07; it is why the catalog had zero boroughs).
    const reverse = calls.find((c) => c.url.includes('/reverseGeocode/'));
    expect(reverse?.params).not.toHaveProperty('entityType');
    expect(
      (result as { chain: PlaceSketchNode[] }).chain.map(
        (n) => n.providerLevelCode,
      ),
    ).toEqual([
      'Neighbourhood',
      'MunicipalitySubdivision',
      'Municipality',
      'CountrySubdivision',
      'Country',
    ]);
    const uws = (result as { chain: PlaceSketchNode[] }).chain[0];
    expect(uws.name).toBe('Upper West Side');
    // NOTHING IS FREE off a plain reverse: its boundingBox is a position box
    // (a doorstep, present in the fixture), and adopting it as the
    // neighbourhood's outline is exactly the defect deleting freeNode
    // removed. No geometry may come from this response.
    expect(uws.bbox ?? null).toBeNull();
    expect(uws.providerPlaceId ?? null).toBeNull();
    // Country identity carries no subdivision (§1 identity tuple).
    expect(
      (result as { chain: PlaceSketchNode[] }).chain[4].subdivisionCode,
    ).toBeNull();
    expect(
      (result as { chain: PlaceSketchNode[] }).chain[1].subdivisionCode,
    ).toBe('NY');
  });

  it('forward-geocodes ONLY previously-unknown nodes and adopts the forward-shape bbox', async () => {
    const { adapter, calls } = buildAdapter({
      reverseAddresses: [UWS_REVERSE_ENTRY],
      forwardResults: [MANHATTAN_FORWARD_RESULT],
      knownBboxIdentities: false,
    });
    const result = await adapter.probe(ANCHOR);
    const forwardCalls = calls.filter(
      (c) => !c.url.includes('/reverseGeocode/'),
    );
    // 5-node chain, nothing free off the plain reverse → all 5 probed.
    expect(forwardCalls).toHaveLength(5);
    const municipality = (result as { chain: PlaceSketchNode[] }).chain.find(
      (n) => n.providerLevelCode === 'Municipality',
    );
    // Forward-shape {topLeftPoint,btmRightPoint} parsed and normalized —
    // but only when the vendor echoes the SAME entityType back.
    expect(municipality?.bbox).toEqual({
      minLat: 40.684007,
      minLng: -74.04725,
      maxLat: 40.882,
      maxLng: -73.907093,
    });
    // Wrong-entity echoes (CountrySubdivision request → Municipality result)
    // must NOT donate a bbox (§1: bboxes only ever grow — no foreign geometry).
    const state = (result as { chain: PlaceSketchNode[] }).chain.find(
      (n) => n.providerLevelCode === 'CountrySubdivision',
    );
    expect(state?.bbox ?? null).toBeNull();
  });

  // The county-threading test DIED with the county axis (docket #4).

  it('the forward-geocode query is EXACTLY "name, subdivisionCode" — the county qualifier died with docket #4 and must not come back', async () => {
    // F372(a): this spec used to assert the SAME string twice while its
    // comments claimed the two rungs differed by a county qualifier, and it
    // set up `countrySecondarySubdivision` without ever discriminating on it
    // — so re-introducing the county axis would have passed. The fixture now
    // carries a county name that appears NOWHERE else ('Gotham County'), and
    // the assertions are the actual claim: candidates are disambiguated by
    // ANCHOR CONTAINMENT, not by name qualifiers, so no rung qualifies.
    const { adapter, calls } = buildAdapter({
      reverseAddresses: [
        {
          ...UWS_REVERSE_ENTRY,
          address: {
            ...UWS_REVERSE_ENTRY.address,
            countrySecondarySubdivision: 'Gotham County',
          },
        },
      ],
      forwardResults: [],
      knownBboxIdentities: false,
    });
    await adapter.probe(ANCHOR);
    const forward = calls.filter((c) => !c.url.includes('/reverseGeocode/'));
    const urlFor = (entityTypeSet: string) =>
      decodeURIComponent(
        forward.find((c) => c.params.entityTypeSet === entityTypeSet)?.url ??
          '',
      );
    // Every rung: "<name>, <subdivisionCode>" and nothing else.
    expect(urlFor('Municipality').endsWith('/New York, NY.json')).toBe(true);
    expect(urlFor('CountrySubdivision').endsWith('/New York, NY.json')).toBe(
      true,
    );
    // The county is a RUNG OF ITS OWN (CountrySecondarySubdivision), so it
    // appears as that rung's own name — and NOWHERE else. It is never a
    // qualifier appended to another rung's query, which is the distinction
    // the old comments claimed and the old assertions could not see.
    expect(
      urlFor('CountrySecondarySubdivision').endsWith('/Gotham County, NY.json'),
    ).toBe(true);
    expect(forward.length).toBeGreaterThan(1);
    expect(
      forward.filter((c) => decodeURIComponent(c.url).includes('Gotham')),
    ).toHaveLength(1);
  });

  it('a well-formed 200 with NO addresses is OBSERVED-EMPTY — the one negative that may be remembered', async () => {
    const { adapter } = buildAdapter({ reverseAddresses: [] });
    const result = await adapter.probe(ANCHOR);
    expect(result.kind).toBe('empty');
    // The probe speaks for a DISC of the vendor's 100 m default radius —
    // recorded as a radius, never squared into a bbox (which would claim
    // ~21% more ground than was ever asked about).
    expect((result as { probedRegion: unknown }).probedRegion).toEqual({
      kind: 'disc',
      center: ANCHOR,
      radiusMeters: 100,
    });
  });

  it('a body that violates the vendor contract is FAILED, never empty — and carries no region to remember', async () => {
    // The observation type's whole point: a malformed body used to reduce to
    // `{chain: []}` and be written as a 30-day "nothing lives here".
    const { adapter } = buildAdapter({ reverseBodyMalformed: true });
    const result = await adapter.probe(ANCHOR);
    expect(result.kind).toBe('failed');
    expect(result).not.toHaveProperty('probedRegion');
  });

  it('a CLOSED MONEY GATE is the typed denied arm, and the vendor is never reached', async () => {
    // The money gate lives INSIDE the adapter (the GatedGeminiClient
    // property): no call site can forget it, and a closed budget cannot
    // reach the vendor. Before 2026-08-04 TomTom had no money gate at all.
    const closed = buildAdapter({ reverseAddresses: [UWS_REVERSE_ENTRY] });
    (
      closed.governance as { assertTomtomSpendOpen: () => Promise<void> }
    ).assertTomtomSpendOpen = () =>
      Promise.reject(
        new SpendBudgetClosedError(
          'TomTom spend budget exhausted',
          'exhausted',
        ),
      );
    await expect(closed.adapter.probe(ANCHOR)).resolves.toEqual({
      kind: 'denied',
    });
    await expect(closed.adapter.fetchPolygon('geo-x')).resolves.toEqual({
      kind: 'denied',
    });
    // No governed draw ⇒ no vendor call and no pool debit.
    expect(closed.drawCalls).toHaveLength(0);
  });

  it('a BROKEN gate is a FAULT, not back-pressure — the distinction that keeps a systemic failure loud', async () => {
    // An unregistered pool throws from requirePool with NO ops alert. Catching
    // it as 'denied' (as this adapter did until 2026-08-04) made TomTom stop
    // silently and permanently, indistinguishable from a spent budget.
    const broken = buildAdapter({ reverseAddresses: [UWS_REVERSE_ENTRY] });
    (
      broken.governance as { assertTomtomSpendOpen: () => Promise<void> }
    ).assertTomtomSpendOpen = () =>
      Promise.reject(new Error("Pool 'tomtom.monthlySpend' is not registered"));

    await expect(broken.adapter.probe(ANCHOR)).resolves.toEqual({
      kind: 'failed',
      reason: 'tomtom_spend_gate_unavailable',
      scope: 'systemic',
    });
    expect(broken.drawCalls).toHaveLength(0);
  });

  it('a pool denial is the TYPED denied arm — never a "no place here" observation, never a string sentinel', async () => {
    const { adapter } = buildAdapter({
      reverseAddresses: [UWS_REVERSE_ENTRY],
      denyPool: true,
    });
    // Was `rejects.toThrow('tomtom_pool_denied')` — a thrown string that
    // seed-region matched by comparison, the pre-P5 shape the union exists
    // to end. The type carries the distinction now.
    await expect(adapter.probe(ANCHOR)).resolves.toEqual({ kind: 'denied' });
  });
});

// The POINT-IDENTITY resolve describe DIED with resolveGeometryId (dockets
// #1 + #4): the census resolve lane is gone — every place carries its
// geometry id from birth.

describe('TomtomChainProbeAdapter — §2 promotion vendor flow', () => {
  // The five resolveGeometryId tests DIED with the method (dockets #1+#4).

  it('fetchPolygon rides the SCARCE pool and returns only Polygon/MultiPolygon features', async () => {
    const { adapter, drawCalls } = buildAdapter({
      additionalData: [
        {
          providerID: 'geo-wolfe',
          geometryData: {
            type: 'FeatureCollection',
            features: [
              { type: 'Feature', geometry: { type: 'MultiPolygon' } },
              { type: 'Feature', geometry: { type: 'Point' } },
            ],
          },
        },
      ],
    });
    const result = await adapter.fetchPolygon('geo-wolfe');
    expect(drawCalls).toEqual([
      { pool: 'tomtom.scarcePolygons', workClass: 'promotion' },
    ]);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.geojson.features).toHaveLength(1);
      expect(result.geojson.features[0].geometry?.type).toBe('MultiPolygon');
    }
  });

  it('fetchPolygon: scarce denial is typed not-now; a no-polygon answer is a consumed-draw miss', async () => {
    const denied = buildAdapter({ denyPool: true });
    expect(await denied.adapter.fetchPolygon('geo-wolfe')).toEqual({
      kind: 'denied',
    });
    const empty = buildAdapter({
      additionalData: [
        { providerID: 'geo-wolfe', error: 'geometry not found' },
      ],
    });
    expect(await empty.adapter.fetchPolygon('geo-wolfe')).toEqual({
      kind: 'miss',
    });
  });
});

describe('TomtomChainProbeAdapter — wave-6 item 2: 429 → poisonWindow', () => {
  it('fetchPolygon: a vendor 429 poisons the SCARCE pool with the Retry-After span and returns typed denied (row attempt-free)', async () => {
    const { adapter, poisonWindow } = buildAdapter({
      httpFailure: { status: 429, retryAfter: '5' },
    });
    // 'denied' — promoteOne treats it as pool-denial: row UNTOUCHED, pass
    // ends. A throw here would recordAttempt and burn the month backoff on
    // a transient.
    expect(await adapter.fetchPolygon('geo-wolfe')).toEqual({
      kind: 'denied',
    });
    expect(poisonWindow).toHaveBeenCalledWith('tomtom.scarcePolygons', 5000);
  });

  it('probe (reverse geocode): a 429 poisons the REVERSE pool and returns the typed denied arm — never a negative observation', async () => {
    const { adapter, poisonWindow } = buildAdapter({
      httpFailure: { status: 429, retryAfter: '2' },
    });
    await expect(adapter.probe(ANCHOR)).resolves.toEqual({ kind: 'denied' });
    expect(poisonWindow).toHaveBeenCalledWith('tomtom.reverseGeocode', 2000);
  });

  it('a genuine vendor error (non-429) is the FAILED arm — a fault, never a miss and never a throw', async () => {
    // Was `rejects.toThrow('status code 500')`. A thrown fault made every
    // caller's catch decide what a fault means — and before the union grew
    // its failed arm, three transport faults in three hourly ticks read as
    // three vendor MISSES and permanently retired the place (refused_at).
    const boom = buildAdapter({ httpFailure: { status: 500 } });
    const result = await boom.adapter.fetchPolygon('geo-wolfe');
    expect(result.kind).toBe('failed');
    expect(boom.poisonWindow).not.toHaveBeenCalled();
  });
});

describe('bbox parsers — F3001: longitude preserves the provider edge order (antimeridian crossing survives the parse)', () => {
  // D71 acceptance: a 20-degree wrap box (tl.lon=170 / br.lon=-170) used to
  // parse as its 340-degree COMPLEMENT ({minLng:-170, maxLng:170}) because
  // Math.min/max on longitude destroyed the minLng>maxLng crossing
  // representation that bboxContainsPoint/bboxLngArcs honor.
  it('forward shape: a crossing box keeps minLng>maxLng and contains a point inside the true arc', () => {
    const parsed = parseForwardBoundingBox({
      topLeftPoint: { lat: 53, lon: 170 },
      btmRightPoint: { lat: 51, lon: -170 },
    });
    expect(parsed).toEqual({
      minLat: 51,
      minLng: 170,
      maxLat: 53,
      maxLng: -170,
    });
    expect(bboxContainsPoint(parsed!, { lat: 52, lng: 179 })).toBe(true);
    // Directional: the complement arc must test OUTSIDE.
    expect(bboxContainsPoint(parsed!, { lat: 52, lng: 0 })).toBe(false);
  });

  it('forward shape: a non-crossing box still parses correctly and excludes outside points', () => {
    const parsed = parseForwardBoundingBox({
      topLeftPoint: { lat: 40.882, lon: -74.04725 },
      btmRightPoint: { lat: 40.684007, lon: -73.907093 },
    });
    expect(parsed).toEqual({
      minLat: 40.684007,
      minLng: -74.04725,
      maxLat: 40.882,
      maxLng: -73.907093,
    });
    expect(
      bboxContainsPoint(parsed!, { lat: 40.7532511, lng: -74.0038099 }),
    ).toBe(true);
    expect(bboxContainsPoint(parsed!, { lat: 40.75, lng: -75.5 })).toBe(false);
  });

  // The reverse-shape F3001 tests died with parseReverseBoundingBox
  // (2026-08-07): the probe's reverse geocode is plain/address-mode and
  // returns no outline, so there is no reverse-shape bbox to parse. F3001's
  // antimeridian law lives in parseForwardBoundingBox — tested above.
});
