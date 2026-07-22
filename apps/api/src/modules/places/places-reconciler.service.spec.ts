/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
/**
 * §2 naming-reconciler fixtures (plans/geo-demand-foundation-rebuild.md §2,
 * §17): probe budget ≤3; sketch-EVERY-probe-result (rejected-commensurability
 * chains still sketch — subjecthood is read-time); region-scale negative
 * observations (30d TTL) answer later viewports; single-flight per cell;
 * noteViewport never blocks and never throws.
 */
import { GeoBbox } from '@crave-search/shared';
import { PlacesReconcilerService } from './places-reconciler.service';
import { TomtomChainProbeResult } from './tomtom-chain-probe.port';

const logger: any = {
  setContext: () => logger,
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const VIEW: GeoBbox = { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 };

function makePlaceRow(name: string, bbox: GeoBbox | null) {
  return {
    placeId: `id-${name}`,
    name,
    localScriptAlias: null,
    providerLevelCode: 'municipality',
    countryCode: 'US',
    subdivisionCode: 'TX',
    parentPlaceIds: [],
    centroidLat: null,
    centroidLng: null,
    bboxMinLat: bbox?.minLat ?? null,
    bboxMinLng: bbox?.minLng ?? null,
    bboxMaxLat: bbox?.maxLat ?? null,
    bboxMaxLng: bbox?.maxLng ?? null,
    timeZone: null,
    provider: 'tomtom',
    providerPlaceId: null,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    promotedAt: null,
  };
}

function makeHarness(options: {
  placesInView?: any[];
  probeImpl?: (anchor: {
    lat: number;
    lng: number;
  }) => Promise<TomtomChainProbeResult>;
}) {
  const catalog: any = {
    placesInView: jest.fn().mockResolvedValue(options.placesInView ?? []),
    sketchChain: jest
      .fn()
      .mockImplementation((chain: any[]) =>
        Promise.resolve(
          chain.map((node: any) => makePlaceRow(node.name, node.bbox ?? null)),
        ),
      ),
  };
  const probe = {
    probe: jest.fn(
      options.probeImpl ??
        (() =>
          Promise.resolve({
            chain: [],
            // Tiny negative region: never answers the other anchors.
            probedBbox: { minLat: 0, minLng: 0, maxLat: 0.001, maxLng: 0.001 },
          })),
    ),
    // Promotion-drain port methods (unused by the reconciler).
    resolveGeometryId: jest.fn().mockResolvedValue({ kind: 'miss' as const }),
    fetchPolygon: jest.fn().mockResolvedValue({ kind: 'miss' as const }),
  };
  const service = new PlacesReconcilerService(catalog, probe, logger);
  return { service, catalog, probe };
}

describe('PlacesReconcilerService — §2 background naming', () => {
  it('probe budget: unknown ground costs at most 3 probes per viewport', async () => {
    const { service, probe } = makeHarness({});
    service.noteViewport(VIEW);
    await service.whenIdle();
    expect(probe.probe.mock.calls.length).toBeLessThanOrEqual(3);
    expect(probe.probe.mock.calls.length).toBeGreaterThan(0);
  });

  it('a stored COMMENSURATE place answering every anchor means zero probes (reads answered from the catalog)', async () => {
    // 1.7×1.7 bbox over the 1×1 view: covering AND commensurate-or-smaller
    // (area 2.89 ≤ 3 × viewArea) — known ground that legitimately answers.
    const bbox: GeoBbox = {
      minLat: -0.35,
      minLng: -0.35,
      maxLat: 1.35,
      maxLng: 1.35,
    };
    const { service, probe } = makeHarness({
      placesInView: [
        {
          place: makePlaceRow('Township', bbox),
          bbox,
          coverageOfView: 1,
          placeArea: 2.89,
        },
      ],
    });
    service.noteViewport(VIEW);
    await service.whenIdle();
    expect(probe.probe).not.toHaveBeenCalled();
  });

  it('scale law (§1/§2): an over-scale sketch never marks ground answered — country+city sketched, street zoom still probes', async () => {
    // The permanent-starvation defect: once a country/state/city bbox
    // existed, every anchor inside it read as answered forever — zero probes,
    // so neighborhoods could never enter lazily and the Chongqing street-zoom
    // descent starved. The answered test is scale-aware now: both sketched
    // regions are TOO BIG for this view (the same isCommensurate
    // disqualifier), so the full anchor budget probes.
    const streetView: GeoBbox = {
      minLat: 0.5,
      minLng: 0.5,
      maxLat: 0.502,
      maxLng: 0.502,
    };
    const city: GeoBbox = { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 };
    const country: GeoBbox = {
      minLat: -30,
      minLng: -30,
      maxLat: 30,
      maxLng: 30,
    };
    const { service, probe } = makeHarness({
      placesInView: [
        {
          place: makePlaceRow('Bigcity', city),
          bbox: city,
          coverageOfView: 1,
          placeArea: 1,
        },
        {
          place: makePlaceRow('Broadland', country),
          bbox: country,
          coverageOfView: 1,
          placeArea: 3600,
        },
      ],
    });
    service.noteViewport(streetView);
    await service.whenIdle();
    // Default harness probes return tiny negative regions that answer no
    // other anchor → every budgeted anchor is spent.
    expect(probe.probe).toHaveBeenCalledTimes(3);
  });

  it('sketch-everything: the FULL chain is written, including nodes a read-time judgment would reject', async () => {
    // The chain carries a street-zoom-rejectable country node (massively
    // over-scale for the view) — §2: observation never gates on
    // commensurability; every probe result is sketched.
    const chain = [
      {
        name: 'Hyde Park',
        providerLevelCode: 'neighbourhood',
        countryCode: 'US',
        subdivisionCode: 'TX',
        // Commensurate with the view (area 2.89 ≤ 3 × viewArea) so this one
        // sketch legitimately answers the pass's remaining anchors.
        bbox: { minLat: -0.35, minLng: -0.35, maxLat: 1.35, maxLng: 1.35 },
      },
      {
        name: 'United States',
        providerLevelCode: 'country',
        countryCode: 'US',
        bbox: { minLat: 25, minLng: -125, maxLat: 50, maxLng: -65 },
      },
    ];
    const { service, catalog, probe } = makeHarness({
      probeImpl: () =>
        Promise.resolve({
          chain,
          probedBbox: VIEW,
        }),
    });
    service.noteViewport(VIEW);
    await service.whenIdle();

    expect(catalog.sketchChain).toHaveBeenCalled();
    // Every node of the chain reached the catalog — nothing filtered.
    expect(catalog.sketchChain.mock.calls[0][0]).toEqual(chain);
    // The first probe's sketched neighbourhood bbox covered the remaining
    // anchors → one probe answered the whole pass.
    expect(probe.probe).toHaveBeenCalledTimes(1);
  });

  it('negative observations are region-scale with a TTL: "no place here" answers the next viewport', async () => {
    // The negative region is commensurate with the view — the scale law is
    // SYMMETRIC, so an over-scale negative region would answer nothing, same
    // as an over-scale place.
    const { service, probe } = makeHarness({
      probeImpl: () =>
        Promise.resolve({
          chain: [], // no place here
          probedBbox: {
            minLat: -0.35,
            minLng: -0.35,
            maxLat: 1.35,
            maxLng: 1.35,
          },
        }),
    });

    service.noteViewport(VIEW);
    await service.whenIdle();
    // The region-scale negative bbox answered the pass's other anchors too.
    expect(probe.probe).toHaveBeenCalledTimes(1);

    // A later settle over the same ground: the cached observation answers —
    // no re-probe inside the 30d TTL.
    service.noteViewport(VIEW);
    await service.whenIdle();
    expect(probe.probe).toHaveBeenCalledTimes(1);
  });

  it('asked-ground memory: an OVER-SCALE chain result still stops re-probing the same view (red-team: recurring-spend hole)', async () => {
    // The vendor's finest rung here is a country — over-scale for the view,
    // so the sketched bbox can never answer these anchors. Without the
    // asked-ground view observation, every future settle of this ground
    // would re-spend 3 governed draws forever.
    const country: GeoBbox = {
      minLat: -60,
      minLng: -120,
      maxLat: 60,
      maxLng: 120,
    };
    const { service, probe } = makeHarness({
      probeImpl: () =>
        Promise.resolve({
          chain: [
            {
              name: 'Bigland',
              providerLevelCode: 'Country',
              countryCode: 'US',
              subdivisionCode: null,
              bbox: country,
            },
          ],
          probedBbox: { minLat: 0, minLng: 0, maxLat: 0.001, maxLng: 0.001 },
        }),
    });

    service.noteViewport(VIEW);
    await service.whenIdle();
    const firstPassProbes = probe.probe.mock.calls.length;
    expect(firstPassProbes).toBeGreaterThan(0);

    // Second settle of the same ground: the view-region asked observation
    // answers (commensurate scale by construction) — zero new spend.
    service.noteViewport(VIEW);
    await service.whenIdle();
    expect(probe.probe.mock.calls.length).toBe(firstPassProbes);
  });

  it('single-flight per cell: a second settle while the cell is in flight does not double-probe', async () => {
    let resolveProbe: (result: TomtomChainProbeResult) => void = () =>
      undefined;
    const { service, probe } = makeHarness({
      probeImpl: () =>
        new Promise<TomtomChainProbeResult>((resolve) => {
          resolveProbe = resolve;
        }),
    });

    service.noteViewport(VIEW);
    // Let the first flight reach its (hanging) probe call.
    await new Promise((resolve) => setImmediate(resolve));
    service.noteViewport(VIEW); // same cell, still in flight → coalesced
    await new Promise((resolve) => setImmediate(resolve));
    expect(probe.probe).toHaveBeenCalledTimes(1);

    resolveProbe({
      chain: [],
      // Commensurate region → answers the pass's remaining anchors so the
      // flight drains.
      probedBbox: { minLat: -0.35, minLng: -0.35, maxLat: 1.35, maxLng: 1.35 },
    });
    await service.whenIdle();
  });

  it('never blocks, never throws: noteViewport returns synchronously and probe failures are swallowed + logged', async () => {
    const { service, probe } = makeHarness({
      probeImpl: () => Promise.reject(new Error('tomtom down')),
    });

    // Synchronous, void, no exception even though the probe will fail.
    expect(service.noteViewport(VIEW)).toBeUndefined();
    await service.whenIdle();

    expect(probe.probe).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('reconcile failed'),
      expect.anything(),
    );
  });
});
