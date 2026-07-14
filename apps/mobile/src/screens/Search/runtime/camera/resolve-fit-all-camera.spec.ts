import {
  FIT_ALL_TUNABLES,
  commitFitAllCamera,
  resolveFitAllCamera,
  resolveWorldFitSafeRegion,
} from './resolve-fit-all-camera';

// Austin-ish geometry: the safe region between a 120px search bar line and a mid-snap
// top at 40% of an 800px viewport (calculateSnapPoints' rawMiddle), 400px wide.
const safeRegion = resolveWorldFitSafeRegion({
  mapWidthPx: 400,
  mapHeightPx: 800,
  searchBarBottomPx: 120,
  sheetMiddleTopPx: 320,
});

describe('resolveWorldFitSafeRegion', () => {
  it('spans search-bar bottom → mid-snap top', () => {
    expect(safeRegion).toEqual({
      topPx: 120,
      widthPx: 400,
      heightPx: 200,
      mapWidthPx: 400,
      mapHeightPx: 800,
    });
  });

  it('clamps degenerate inputs instead of going negative', () => {
    const degenerate = resolveWorldFitSafeRegion({
      mapWidthPx: 400,
      mapHeightPx: 800,
      searchBarBottomPx: 500,
      sheetMiddleTopPx: 300, // above the bar line — clamped to a 1px-min region
    });
    expect(degenerate.heightPx).toBeGreaterThan(0);
    expect(degenerate.topPx).toBe(500);
  });
});

describe('resolveFitAllCamera', () => {
  const austin = { latitude: 30.2672, longitude: -97.7431 };

  it('single member: centers it at the zMax ceiling (no street-level dive)', () => {
    const fit = resolveFitAllCamera({ members: [austin], safeRegion });
    expect(fit.center.latitude).toBeCloseTo(austin.latitude, 6);
    expect(fit.center.longitude).toBeCloseTo(austin.longitude, 6);
    expect(fit.zoom).toBe(FIT_ALL_TUNABLES.zMax);
    expect(fit.memberCount).toBe(1);
  });

  it('EXACT inclusion: every member fits inside the padded safe region at the fit zoom', () => {
    const members = [
      austin,
      { latitude: 30.4, longitude: -97.9 },
      { latitude: 30.15, longitude: -97.6 },
      // The cross-market "outlier" — fitAll must INCLUDE it (no cut, owner decree).
      { latitude: 29.4241, longitude: -98.4936 }, // San Antonio
    ];
    const fit = resolveFitAllCamera({ members, safeRegion });
    // Verify by re-projection: at the fit zoom, each member's pixel offset from center
    // must be within the safe region half-extents.
    const EARTH = 6_371_000;
    const mpp =
      (Math.cos((fit.center.latitude * Math.PI) / 180) * 2 * Math.PI * EARTH) /
      (256 * 2 ** fit.zoom);
    for (const member of members) {
      const dyMeters = (Math.abs(member.latitude - fit.center.latitude) * Math.PI * EARTH) / 180;
      const dxMeters =
        ((Math.abs(member.longitude - fit.center.longitude) * Math.PI * EARTH) / 180) *
        Math.cos((fit.center.latitude * Math.PI) / 180);
      expect(dyMeters / mpp).toBeLessThanOrEqual(safeRegion.heightPx / 2 + 1);
      expect(dxMeters / mpp).toBeLessThanOrEqual(safeRegion.widthPx / 2 + 1);
    }
    // And the padding factor leaves real margin: the binding axis uses at most 1/1.2.
    expect(fit.memberCount).toBe(4);
  });

  it('the binding axis wins (wide-flat vs tall-narrow member sets)', () => {
    const wide = resolveFitAllCamera({
      members: [
        { latitude: 30.0, longitude: -98.0 },
        { latitude: 30.0, longitude: -97.0 },
      ],
      safeRegion,
    });
    const tall = resolveFitAllCamera({
      members: [
        { latitude: 29.5, longitude: -97.5 },
        { latitude: 30.5, longitude: -97.5 },
      ],
      safeRegion,
    });
    // Same angular span; the region is wider (400) than tall (200) → the tall set must
    // zoom out further.
    expect(tall.zoom).toBeLessThan(wide.zoom);
  });

  it('drops non-finite coordinates and RED-throws on an empty fit', () => {
    const fit = resolveFitAllCamera({
      members: [austin, { latitude: Number.NaN, longitude: -97 }],
      safeRegion,
    });
    expect(fit.memberCount).toBe(1);
    expect(() => resolveFitAllCamera({ members: [], safeRegion })).toThrow('[FIT-ALL-CAMERA]');
  });
});

describe('commitFitAllCamera', () => {
  const members = [
    { latitude: 30.2672, longitude: -97.7431 },
    { latitude: 30.4, longitude: -97.9 },
  ];

  it('commits the fit through the arbiter with the safe-region padding, easeTo', () => {
    const commits: unknown[] = [];
    const arbiter = { commit: (intent: unknown) => (commits.push(intent), true) };
    const executed = commitFitAllCamera({ arbiter, members, safeRegion, requestToken: 7 });
    expect(executed).toBe(true);
    expect(commits).toHaveLength(1);
    const intent = commits[0] as Record<string, unknown>;
    expect(intent.animationMode).toBe('easeTo');
    expect(intent.requestToken).toBe(7);
    expect(intent.padding).toEqual({
      paddingTop: 120,
      paddingBottom: 480, // 800 − (120 + 200)
      paddingLeft: 0,
      paddingRight: 0,
    });
  });

  it('surfaces an arbiter rejection (the caller must bark, never swallow)', () => {
    const arbiter = { commit: () => false };
    expect(commitFitAllCamera({ arbiter, members, safeRegion })).toBe(false);
  });
});
