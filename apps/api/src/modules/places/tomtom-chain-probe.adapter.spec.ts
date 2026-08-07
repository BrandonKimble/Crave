import type { PlaceSketchNode } from './places-catalog.service';
/**
 * TomtomChainProbeAdapter specs — §2 sketch mechanics.
 *
 * The probe's reverse geocode is PLAIN (address-mode): it supplies the
 * COMPLETE chain of names and NO geometry — its boundingBox is a position
 * box, never an outline. Every rung's identity then arrives BY THE POINT:
 * the catalog's outline-grade covering entity (the lawful skip) or an
 * anchored single-level lookup (geography-mode: id + outline + centroid).
 * The F3001 antimeridian tests exercise the geography parser — the one
 * vendor bbox parser left.
 */
import { of } from 'rxjs';
import {
  TomtomChainProbeAdapter,
  parseGeographyBoundingBox,
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

/** Geography-mode single-level answer for the finest rung (Neighbourhood). */
const UWS_LEVEL_ENTITY_ENTRY = {
  address: {
    countryCode: 'US',
    countrySubdivision: 'NY',
    countrySubdivisionName: 'New York',
    countrySubdivisionCode: 'NY',
    neighbourhood: 'Upper West Side',
    boundingBox: {
      northEast: '40.807972,-73.964694',
      southWest: '40.779488,-73.992672',
    },
  },
  position: '40.786999,-73.975403',
  dataSources: { geometry: { id: 'geo-uws' } },
  entityType: 'Neighbourhood',
};

type HttpCall = { url: string; params: Record<string, unknown> };

function buildAdapter(options: {
  reverseAddresses?: unknown[];
  /** Force a body that violates the contract (no `addresses` array). */
  reverseBodyMalformed?: boolean;
  /** The anchored single-level (geography-mode) reverse: entries returned
   *  when the request carries an entityType param. Defaults to [] — the
   *  finest rung then simply stays id-less, the honest fault posture. */
  levelEntityAddresses?: unknown[];
  /** Outline-grade catalog coverage rows for the lawful skip:
   *  providerLevelCode → providerPlaceId. Defaults to none — every rung
   *  then pays an anchored lookup. */
  outlineCoverage?: Array<{ levelCode: string; providerPlaceId: string }>;
  additionalData?: unknown[];
  denyPool?: boolean;
  /** Deny only the anchored single-level lookups (entityType present),
   *  admitting the plain chain read — the P5 shape: the SECOND call of a
   *  probe failing. */
  denyLevelLookups?: boolean;
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
        // Mode selection is the entityType param (the adapter's own law):
        // present = geography-mode single-level lookup, absent = the plain
        // chain read.
        if (config.params.entityType !== undefined) {
          return of({
            data: { addresses: options.levelEntityAddresses ?? [] },
          });
        }
        return of({
          data: options.reverseBodyMalformed
            ? { unexpected: true }
            : { addresses: options.reverseAddresses ?? [] },
        });
      }
      if (url.includes('additionalData')) {
        return of({ data: { additionalData: options.additionalData ?? [] } });
      }
      throw new Error(`unexpected vendor url in spec: ${url}`);
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
      if (options.denyPool) return null;
      if (options.denyLevelLookups && workClass === 'level-entity-lookup') {
        return null;
      }
      return act();
    },
  };
  const prisma = {
    $queryRaw: () =>
      Promise.resolve(
        (options.outlineCoverage ?? []).map((row) => ({
          levelCode: row.levelCode,
          providerPlaceId: row.providerPlaceId,
        })),
      ),
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
    // levelEntityAddresses defaults to [] — the anchored identity lookup
    // finds nothing, so the finest rung stays id-less here and the test
    // isolates PLAIN-reverse parsing.
    const { adapter, calls } = buildAdapter({
      reverseAddresses: [UWS_REVERSE_ENTRY],
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

  it('every rung is answered BY THE POINT: known outline rungs adopt catalog ids free; the rest pay one anchored lookup each', async () => {
    const { adapter, calls } = buildAdapter({
      reverseAddresses: [UWS_REVERSE_ENTRY],
      levelEntityAddresses: [UWS_LEVEL_ENTITY_ENTRY],
      outlineCoverage: [
        { levelCode: 'Country', providerPlaceId: 'geo-us' },
        { levelCode: 'CountrySubdivision', providerPlaceId: 'geo-ny' },
      ],
    });
    const result = await adapter.probe(ANCHOR);
    expect(result.kind).toBe('named');
    const chain = (result as { chain: PlaceSketchNode[] }).chain;

    // Known-by-ground rungs adopted the catalog's identity with NO draw.
    expect(
      chain.find((n) => n.providerLevelCode === 'Country')?.providerPlaceId,
    ).toBe('geo-us');
    expect(
      chain.find((n) => n.providerLevelCode === 'CountrySubdivision')
        ?.providerPlaceId,
    ).toBe('geo-ny');

    // Unknown rungs each got ONE anchored single-level lookup — and only
    // the Neighbourhood ask matched the mock's geography answer; the others
    // came back wrong-level (a vendor ANSWER), leaving those rungs id-less.
    const anchored = calls.filter(
      (c) => c.url.includes('/reverseGeocode/') && c.params.entityType,
    );
    expect(anchored.map((c) => c.params.entityType).sort()).toEqual([
      'Municipality',
      'MunicipalitySubdivision',
      'Neighbourhood',
    ]);
    const uws = chain[0];
    expect(uws.providerPlaceId).toBe('geo-uws');
    // The anchored answer's OUTLINE bbox, never the plain response's
    // position box.
    expect(uws.bbox).toEqual({
      minLat: 40.779488,
      minLng: -73.992672,
      maxLat: 40.807972,
      maxLng: -73.964694,
    });
    // No forward-geocode machinery exists to call.
    expect(calls.every((c) => c.url.includes('/reverseGeocode/'))).toBe(true);
  });

  it("P5 GUARD: a pool denial while resolving a rung is the probe's OWN denied — never a quiet id-less chain", async () => {
    // The round-2 red team's laundering bug: the pool denying the SECOND
    // call of a probe left the finest rung silently id-less, upsertSketch
    // dropped it, the reconciler recorded the view as asked — and the
    // neighbourhood the probe existed for was suppressed for 30 days.
    const { adapter } = buildAdapter({
      reverseAddresses: [UWS_REVERSE_ENTRY],
      levelEntityAddresses: [UWS_LEVEL_ENTITY_ENTRY],
      denyLevelLookups: true,
    });
    const result = await adapter.probe(ANCHOR);
    expect(result.kind).toBe('denied');
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
  it('geography shape: a crossing box keeps minLng>maxLng and contains a point inside the true arc', () => {
    const parsed = parseGeographyBoundingBox({
      northEast: '53,-170',
      southWest: '51,170',
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

  it('geography shape: a non-crossing box still parses correctly and excludes outside points', () => {
    const parsed = parseGeographyBoundingBox({
      northEast: '40.807972,-73.964694',
      southWest: '40.779488,-73.992672',
    });
    expect(parsed).toEqual({
      minLat: 40.779488,
      minLng: -73.992672,
      maxLat: 40.807972,
      maxLng: -73.964694,
    });
    expect(bboxContainsPoint(parsed!, { lat: 40.79, lng: -73.98 })).toBe(true);
    expect(bboxContainsPoint(parsed!, { lat: 40.79, lng: -75.5 })).toBe(false);
  });

  // The reverse-shape F3001 tests died with parseReverseBoundingBox
  // (2026-08-07): the probe's reverse geocode is plain/address-mode and
  // returns no outline, so there is no reverse-shape bbox to parse. F3001's
  // antimeridian law lives in parseForwardBoundingBox — tested above.
});
