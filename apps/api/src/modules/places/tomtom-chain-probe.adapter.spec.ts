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
  denyPool?: boolean;
  knownBboxIdentities?: boolean;
}) {
  const calls: HttpCall[] = [];
  const httpService = {
    get: (url: string, config: { params: Record<string, unknown> }) => {
      calls.push({ url, params: config.params });
      if (url.includes('/reverseGeocode/')) {
        return of({ data: { addresses: options.reverseAddresses ?? [] } });
      }
      return of({ data: { results: options.forwardResults ?? [] } });
    },
  };
  const governance = {
    draw: async (
      _pool: string,
      _workClass: string,
      act: () => Promise<unknown>,
    ) => (options.denyPool ? null : act()),
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
  return { adapter, calls };
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
