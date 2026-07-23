/**
 * TomtomChainProbeAdapter specs — §2 sketch mechanics against the two
 * live-verified vendor shapes (reverse = "lat,lng" strings, forward =
 * {topLeftPoint,btmRightPoint} objects).
 */
import { of } from 'rxjs';
import { TomtomChainProbeAdapter } from './tomtom-chain-probe.adapter';

const UWS_REVERSE_ENTRY = {
  address: {
    countryCode: 'US',
    countrySubdivision: 'NY',
    countrySubdivisionName: 'New York',
    countrySubdivisionCode: 'NY',
    municipality: 'New York',
    neighbourhood: 'Upper West Side',
    country: 'United States',
    boundingBox: {
      northEast: '40.807972,-73.964694',
      southWest: '40.779488,-73.992672',
    },
  },
  position: '40.786999,-73.975403',
  dataSources: { geometry: { id: 'geo-uws' } },
  entityType: 'Neighbourhood',
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
        return of({ data: { addresses: options.reverseAddresses ?? [] } });
      }
      if (url.includes('additionalData')) {
        return of({ data: { additionalData: options.additionalData ?? [] } });
      }
      return of({ data: { results: options.forwardResults ?? [] } });
    },
  };
  const poisonWindow = jest.fn();
  const governance = {
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
  const prisma = {
    place: {
      findFirst: () =>
        Promise.resolve(options.knownBboxIdentities ? { bboxMinLat: 1 } : null),
    },
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
    configService as never,
    loggerService as never,
  );
  return { adapter, calls, drawCalls, poisonWindow };
}

const ANCHOR = { lat: 40.787, lng: -73.9754 };

describe('TomtomChainProbeAdapter', () => {
  it('builds the chain most-specific-first with the free bbox/id on the returned entity', async () => {
    const { adapter } = buildAdapter({
      reverseAddresses: [UWS_REVERSE_ENTRY],
      knownBboxIdentities: true, // no forward geocodes — isolate reverse parsing
    });
    const result = await adapter.probe(ANCHOR);
    expect(result.chain.map((n) => n.providerLevelCode)).toEqual([
      'Neighbourhood',
      'Municipality',
      'CountrySubdivision',
      'Country',
    ]);
    const uws = result.chain[0];
    expect(uws.name).toBe('Upper West Side');
    expect(uws.providerPlaceId).toBe('geo-uws');
    // Reverse-shape "lat,lng" strings parsed and min/max normalized.
    expect(uws.bbox).toEqual({
      minLat: 40.779488,
      minLng: -73.992672,
      maxLat: 40.807972,
      maxLng: -73.964694,
    });
    // Country identity carries no subdivision (§1 identity tuple).
    expect(result.chain[3].subdivisionCode).toBeNull();
    expect(result.chain[1].subdivisionCode).toBe('NY');
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
    // 4-node chain, most-specific comes free → 3 unknown nodes probed.
    expect(forwardCalls).toHaveLength(3);
    const municipality = result.chain.find(
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
    const state = result.chain.find(
      (n) => n.providerLevelCode === 'CountrySubdivision',
    );
    expect(state?.bbox ?? null).toBeNull();
  });

  it('threads the inline county onto nodes FINER than the county rung ONLY (§1 county axis)', async () => {
    // Live-verified shape (2026-07-19, Lakeside TX probes): the reverse
    // response carries countrySecondarySubdivision inline as the BARE county
    // name even when the returned entity is finer.
    const { adapter } = buildAdapter({
      reverseAddresses: [
        {
          ...UWS_REVERSE_ENTRY,
          address: {
            ...UWS_REVERSE_ENTRY.address,
            countrySecondarySubdivision: 'New York',
            municipalitySubdivision: 'Manhattan',
          },
        },
      ],
      knownBboxIdentities: true,
    });
    const result = await adapter.probe(ANCHOR);
    const countyOf = (level: string) =>
      result.chain.find((n) => n.providerLevelCode === level)?.county ?? null;
    // Finer than the county rung: county threaded.
    expect(countyOf('Neighbourhood')).toBe('New York');
    expect(countyOf('MunicipalitySubdivision')).toBe('New York');
    expect(countyOf('Municipality')).toBe('New York');
    // The county rung itself and broader: a county is not discriminated by
    // itself, and a state/country is not inside a county — NULL.
    expect(countyOf('CountrySecondarySubdivision')).toBeNull();
    expect(countyOf('CountrySubdivision')).toBeNull();
    expect(countyOf('Country')).toBeNull();
  });

  it('county-qualifies the forward-geocode query so limit=1 lands on the observed same-name twin', async () => {
    const { adapter, calls } = buildAdapter({
      reverseAddresses: [
        {
          ...UWS_REVERSE_ENTRY,
          address: {
            ...UWS_REVERSE_ENTRY.address,
            countrySecondarySubdivision: 'New York',
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
    // Municipality (below the county rung) carries the county qualifier…
    expect(
      urlFor('Municipality').endsWith('/New York, New York, NY.json'),
    ).toBe(true);
    // …while the state rung stays unqualified (no county axis there).
    expect(urlFor('CountrySubdivision').endsWith('/New York, NY.json')).toBe(
      true,
    );
  });

  it('returns an empty chain (a first-class negative observation) when the vendor names nothing', async () => {
    const { adapter } = buildAdapter({ reverseAddresses: [] });
    const result = await adapter.probe(ANCHOR);
    expect(result.chain).toEqual([]);
    // probedBbox = anchor ± 100 m (vendor default radius) — a real region.
    expect(result.probedBbox.minLat).toBeLessThan(ANCHOR.lat);
    expect(result.probedBbox.maxLat).toBeGreaterThan(ANCHOR.lat);
    expect(result.probedBbox.minLng).toBeLessThan(ANCHOR.lng);
    expect(result.probedBbox.maxLng).toBeGreaterThan(ANCHOR.lng);
  });

  it('THROWS on a pool denial — never fabricates a "no place here" observation', async () => {
    const { adapter } = buildAdapter({
      reverseAddresses: [UWS_REVERSE_ENTRY],
      denyPool: true,
    });
    await expect(adapter.probe(ANCHOR)).rejects.toThrow('tomtom_pool_denied');
  });
});

const IDENTITY_NODE = {
  name: 'Wolfe City',
  county: 'Hunt',
  subdivisionCode: 'TX',
  countryCode: 'US',
  providerLevelCode: 'Municipality',
};

describe('TomtomChainProbeAdapter — §2 promotion vendor flow', () => {
  it('resolveGeometryId rides the CHEAP pool with the promotion workClass and county-qualified query', async () => {
    const { adapter, calls, drawCalls } = buildAdapter({
      forwardResults: [
        {
          entityType: 'Municipality',
          address: { countryCode: 'US' },
          dataSources: { geometry: { id: 'geo-wolfe' } },
        },
      ],
    });
    const result = await adapter.resolveGeometryId(IDENTITY_NODE);
    expect(result).toEqual({ kind: 'ok', geometryId: 'geo-wolfe' });
    expect(drawCalls).toEqual([
      { pool: 'tomtom.cheapGeocode', workClass: 'promotion' },
    ]);
    expect(calls[0].url).toContain(encodeURIComponent('Wolfe City, Hunt, TX'));
  });

  it('resolveGeometryId: denial is typed not-now; a wrong-entity match is a miss', async () => {
    const denied = buildAdapter({ denyPool: true });
    expect(await denied.adapter.resolveGeometryId(IDENTITY_NODE)).toEqual({
      kind: 'denied',
    });
    const wrongEntity = buildAdapter({
      forwardResults: [
        {
          entityType: 'Neighbourhood',
          address: { countryCode: 'US' },
          dataSources: { geometry: { id: 'geo-x' } },
        },
      ],
    });
    expect(await wrongEntity.adapter.resolveGeometryId(IDENTITY_NODE)).toEqual({
      kind: 'miss',
    });
  });

  it('resolveGeometryId with a place bbox: picks the bbox-AGREEING candidate, not the vendor rank-1 twin (§2.5)', async () => {
    // The San Antonio defect: the vendor keeps two same-name Municipality
    // records and ranks the 0.012°-wide fragment first for the
    // county-qualified query. The place's own extent must decide.
    const { adapter, calls } = buildAdapter({
      forwardResults: [
        {
          entityType: 'Municipality',
          address: { countryCode: 'US' },
          boundingBox: {
            topLeftPoint: { lat: 29.385, lon: -98.604 },
            btmRightPoint: { lat: 29.368, lon: -98.592 },
          },
          dataSources: { geometry: { id: 'geo-tiny-twin' } },
        },
        {
          entityType: 'Municipality',
          address: { countryCode: 'US' },
          boundingBox: {
            topLeftPoint: { lat: 29.761, lon: -98.886 },
            btmRightPoint: { lat: 29.103, lon: -98.223 },
          },
          dataSources: { geometry: { id: 'geo-real' } },
        },
      ],
    });
    const result = await adapter.resolveGeometryId({
      ...IDENTITY_NODE,
      name: 'San Antonio',
      county: 'Bexar',
      bbox: {
        minLat: 29.103,
        minLng: -98.886,
        maxLat: 29.761,
        maxLng: -98.223,
      },
    });
    expect(result).toEqual({ kind: 'ok', geometryId: 'geo-real' });
    // A validation bbox widens the draw to a candidate LIST (still one call).
    expect(calls[0].params.limit).toBe(5);
  });

  it('resolveGeometryId with a place bbox: NO agreeing candidate = miss (sketch truth beats a wrong twin)', async () => {
    const { adapter } = buildAdapter({
      forwardResults: [
        {
          entityType: 'Municipality',
          address: { countryCode: 'US' },
          boundingBox: {
            topLeftPoint: { lat: 29.385, lon: -98.604 },
            btmRightPoint: { lat: 29.368, lon: -98.592 },
          },
          dataSources: { geometry: { id: 'geo-tiny-twin' } },
        },
      ],
    });
    expect(
      await adapter.resolveGeometryId({
        ...IDENTITY_NODE,
        bbox: {
          minLat: 29.103,
          minLng: -98.886,
          maxLat: 29.761,
          maxLng: -98.223,
        },
      }),
    ).toEqual({ kind: 'miss' });
  });

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

  it('resolveGeometryId: a 429 without Retry-After poisons the CHEAP pool with the K4 per-second-window default', async () => {
    const { adapter, poisonWindow } = buildAdapter({
      httpFailure: { status: 429 },
    });
    expect(await adapter.resolveGeometryId(IDENTITY_NODE)).toEqual({
      kind: 'denied',
    });
    expect(poisonWindow).toHaveBeenCalledWith('tomtom.cheapGeocode', 1000);
  });

  it('probe (reverse geocode): a 429 poisons the cheap pool and throws the pool-denied operational miss — never a negative observation', async () => {
    const { adapter, poisonWindow } = buildAdapter({
      httpFailure: { status: 429, retryAfter: '2' },
    });
    await expect(adapter.probe(ANCHOR)).rejects.toThrow('tomtom_pool_denied');
    expect(poisonWindow).toHaveBeenCalledWith('tomtom.cheapGeocode', 2000);
  });

  it('a genuine vendor error (non-429) still throws — the drain records the attempt', async () => {
    const boom = buildAdapter({ httpFailure: { status: 500 } });
    await expect(boom.adapter.fetchPolygon('geo-wolfe')).rejects.toThrow(
      'status code 500',
    );
    expect(boom.poisonWindow).not.toHaveBeenCalled();
  });
});
