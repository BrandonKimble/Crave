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
    providerLevelCode: 'Municipality',
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
  // P4: extents are DERIVED from grounds via catalog.derivedBboxes — the
  // mock remembers what sketchChain minted and answers from the node bboxes.
  const mintedBboxes = new Map<string, GeoBbox>();
  const catalog: any = {
    placesInView: jest.fn().mockResolvedValue(options.placesInView ?? []),
    sketchChain: jest.fn().mockImplementation((chain: any[]) =>
      Promise.resolve(
        chain.map((node: any) => {
          const row = makePlaceRow(node.name, node.bbox ?? null);
          if (node.bbox) mintedBboxes.set(row.placeId, node.bbox as GeoBbox);
          return row;
        }),
      ),
    ),
    derivedBboxes: jest.fn().mockImplementation((ids: string[]) => {
      const out = new Map<string, GeoBbox>();
      for (const id of ids) {
        const bbox = mintedBboxes.get(id);
        if (bbox) out.set(id, bbox);
      }
      return Promise.resolve(out);
    }),
  };
  const probe = {
    probe: jest.fn(
      options.probeImpl ??
        (() =>
          Promise.resolve({
            kind: 'empty' as const,
            // Tiny negative region: never answers the other anchors.
            probedRegion: {
              kind: 'disc' as const,
              center: { lat: 0.0005, lng: 0.0005 },
              radiusMeters: 100,
            },
          })),
    ),
    // Promotion-drain port methods (unused by the reconciler).
    resolveGeometryId: jest.fn().mockResolvedValue({ kind: 'miss' as const }),
    fetchPolygon: jest.fn().mockResolvedValue({ kind: 'miss' as const }),
  };
  const prismaMock = (() => {
    // Stateful memory mock: the asked-region tests are ABOUT the memory,
    // so the mock must actually remember (docket #7 moved it to the DB).
    const rows: any[] = [];
    return {
      // The view-scoped READ is raw SQL, and a mock cannot honestly execute a
      // spatial predicate — so the PREDICATE's law is pinned against real
      // Postgres in places-containment.integration.spec. Here the raw read
      // just returns what was remembered, which is what these behavioural
      // tests are about.
      $executeRaw: jest.fn().mockImplementation((...args: any[]) => {
        // The write is RAW now (partial unique on the cell). Values ride in
        // order: kind, cellKey, disc lat/lng/radius, box min/max...
        const v = (args[0]?.values ?? []) as any[];
        const [
          kind,
          cellKey,
          cLat,
          cLng,
          radius,
          minLat,
          minLng,
          maxLat,
          maxLng,
        ] = v;
        const key = `${cellKey}:${kind}`;
        const row = {
          __key: key,
          kind,
          centerLat: cLat,
          centerLng: cLng,
          radiusMeters: radius,
          minLat,
          minLng,
          maxLat,
          maxLng,
        };
        const at = rows.findIndex((r: any) => r.__key === key);
        if (at >= 0) rows[at] = row;
        else rows.push(row);
        return Promise.resolve(1);
      }),
      $queryRaw: jest.fn().mockImplementation(() =>
        Promise.resolve(
          rows.map((r: any) => ({
            kind: r.kind,
            center_lat: r.centerLat ?? null,
            center_lng: r.centerLng ?? null,
            radius_meters: r.radiusMeters ?? null,
            min_lat: r.minLat ?? null,
            min_lng: r.minLng ?? null,
            max_lat: r.maxLat ?? null,
            max_lng: r.maxLng ?? null,
          })),
        ),
      ),
      probedRegion: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
  })();
  const service = new PlacesReconcilerService(
    catalog,
    probe,
    prismaMock as never,
    logger,
  );
  return { service, catalog, probe, prismaMock };
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
          kind: 'named' as const,
          chain,
          probedRegion: { kind: 'box' as const, bbox: VIEW },
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
          kind: 'empty' as const, // the vendor OBSERVED nothing here
          // A big "nothing here" region: expressed as the BOX it honestly
          // is (a probed viewport), not a squared disc.
          probedRegion: {
            kind: 'box' as const,
            bbox: { minLat: -0.35, minLng: -0.35, maxLat: 1.35, maxLng: 1.35 },
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
          kind: 'named' as const,
          chain: [
            {
              name: 'Bigland',
              providerLevelCode: 'Country',
              countryCode: 'US',
              subdivisionCode: null,
              bbox: country,
            },
          ],
          probedRegion: {
            kind: 'disc' as const,
            center: { lat: 0.0005, lng: 0.0005 },
            radiusMeters: 100,
          },
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
      kind: 'empty' as const,
      // Commensurate region → answers the pass's remaining anchors so the
      // flight drains.
      probedRegion: {
        kind: 'box' as const,
        bbox: { minLat: -0.35, minLng: -0.35, maxLat: 1.35, maxLng: 1.35 },
      },
    });
    await service.whenIdle();
  });

  it('EACH REGION IS KEYED BY THE GROUND IT SPEAKS FOR: two empty anchors in one view keep TWO discs, never overwrite each other', async () => {
    // Red-team of my own disease-B fix: keying every region by the VIEW's
    // cell meant a pass with two "nothing here" anchors wrote the same
    // (cell,'disc') key twice — the second silently ERASED the first, and
    // the discarded anchor re-probed on every future settle. A disc speaks
    // for ~100m around ITS OWN anchor (MAX_CELL_LEVEL is derived to be
    // exactly that scale); a box speaks for the view it exhausted.
    let call = 0;
    const { service, prismaMock } = makeHarness({
      probeImpl: () => {
        call += 1;
        return Promise.resolve({
          kind: 'empty' as const,
          probedRegion: {
            kind: 'disc' as const,
            // Two anchors far enough apart to be different 100m cells.
            center: { lat: 0.1 * call, lng: 0.1 * call },
            radiusMeters: 100,
          },
        });
      },
    });
    service.noteViewport(VIEW);
    await service.whenIdle();

    const discKeys = prismaMock.$executeRaw.mock.calls
      .map((c: any) => (c[0]?.values ?? [])[1])
      .filter((k: unknown): k is string => typeof k === 'string');
    // Distinct anchors ⇒ distinct memories.
    expect(new Set(discKeys).size).toBe(discKeys.length);
    expect(discKeys.length).toBeGreaterThan(1);
  });

  it('the TTL prune is throttled OFF the settle path (housekeeping, not a read)', async () => {
    const { service, prismaMock } = makeHarness({});
    service.noteViewport(VIEW);
    await service.whenIdle();
    expect(prismaMock.probedRegion.deleteMany).toHaveBeenCalledTimes(1);
    service.noteViewport({
      minLat: VIEW.minLat + 5,
      maxLat: VIEW.maxLat + 5,
      minLng: VIEW.minLng + 5,
      maxLng: VIEW.maxLng + 5,
    });
    await service.whenIdle();
    expect(prismaMock.probedRegion.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('A FAILURE IS NOT AN OBSERVATION: a faulted anchor remembers nothing, and an all-faulted pass never marks the view asked', async () => {
    // The observation type (2026-08-01) makes this unrepresentable rather
    // than merely discouraged: only 'empty' carries a region to remember.
    // Before it, a malformed vendor body / a missing country field / an
    // unnamed ladder all reduced to `{chain: []}` and were written as a
    // 30-day "nothing lives here" over ground the vendor never denied.
    const { service, probe, prismaMock } = makeHarness({
      probeImpl: () =>
        Promise.resolve({
          kind: 'failed' as const,
          reason: 'tomtom_body_shape',
        }),
    });
    service.noteViewport(VIEW);
    await service.whenIdle();
    // Anchors were attempted...
    expect(probe.probe.mock.calls.length).toBeGreaterThan(0);
    // ...and NOTHING was remembered: not the disc, not the view box.
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
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
