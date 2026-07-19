/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
/**
 * §2 naming-reconciler fixtures (plans/geo-demand-foundation-rebuild.md §2,
 * §17): probe budget ≤3; sketch-EVERY-probe-result (rejected-commensurability
 * chains still sketch — subjecthood is read-time); region-scale negative
 * observations (30d TTL) answer later viewports; single-flight per cell;
 * noteViewport never blocks and never throws.
 */
import { GeoBbox } from './place-geo';
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

  it('stored places that answer every anchor mean zero probes (reads answered from the catalog)', async () => {
    const { service, probe } = makeHarness({
      placesInView: [
        {
          place: makePlaceRow('Coverall', {
            minLat: -1,
            minLng: -1,
            maxLat: 2,
            maxLng: 2,
          }),
          bbox: { minLat: -1, minLng: -1, maxLat: 2, maxLng: 2 },
          coverageOfView: 1,
          placeArea: 9,
        },
      ],
    });
    service.noteViewport(VIEW);
    await service.whenIdle();
    expect(probe.probe).not.toHaveBeenCalled();
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
        bbox: { minLat: -1, minLng: -1, maxLat: 2, maxLng: 2 },
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
    const { service, probe } = makeHarness({
      probeImpl: () =>
        Promise.resolve({
          chain: [], // no place here
          probedBbox: { minLat: -1, minLng: -1, maxLat: 2, maxLng: 2 },
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
      probedBbox: { minLat: -1, minLng: -1, maxLat: 2, maxLng: 2 },
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
