import {
  FOCUS_CAMERA_TUNABLES,
  haversineDistanceMeters,
  resolveFocusCamera,
  type FocusCameraLocation,
  type FocusCameraSafeRegion,
} from './resolve-focus-camera';

// Manhattan-ish fixtures. 0.01° lat ≈ 1.11km.
const SAFE_REGION: FocusCameraSafeRegion = { widthPx: 390, heightPx: 280, mapHeightPx: 844 };

const loc = (locationId: string, latitude: number, longitude: number): FocusCameraLocation => ({
  locationId,
  latitude,
  longitude,
});

describe('resolveFocusCamera (§3.3 goldens)', () => {
  const run = (locations: FocusCameraLocation[], currentZoom = 14, anchorLocationId = 'anchor') =>
    resolveFocusCamera({
      locations,
      anchorLocationId,
      safeRegion: SAFE_REGION,
      currentZoom,
    });

  it('single location: centers, keeps the current zoom, includes 1', () => {
    const result = run([loc('anchor', 40.75, -73.98)]);
    expect(result.center).toEqual({ latitude: 40.75, longitude: -73.98 });
    expect(result.zoom).toBe(14);
    expect(result.includedCount).toBe(1);
  });

  it('tight cluster + one cross-market outlier: the outlier is excluded', () => {
    const cluster = [
      loc('anchor', 40.75, -73.98),
      loc('near1', 40.7551, -73.985), // ~700m
      loc('near2', 40.7452, -73.975), // ~700m
      loc('outlier', 41.5, -72.7), // ~110km — another market
    ];
    const result = run(cluster);
    expect(result.includedCount).toBe(3); // anchor + 2 near, outlier cut
    expect(result.center.latitude).toBeCloseTo(40.75, 3);
    // Fit stays close-in: two ~700m siblings never justify city-scale zoom-out.
    expect(result.zoom).toBeGreaterThan(12);
  });

  it('uniform sprawl: the city-scale floor clamps the zoom-out', () => {
    const sprawl = [
      loc('anchor', 40.75, -73.98),
      loc('s1', 40.9, -73.8),
      loc('s2', 40.6, -74.15),
      loc('s3', 41.0, -73.7),
      loc('s4', 40.5, -74.25),
    ];
    const result = run(sprawl);
    expect(result.zoom).toBe(FOCUS_CAMERA_TUNABLES.zCityFloor);
  });

  it('never zooms IN to show context — everything nearby at a far-out current zoom', () => {
    const nearPair = [loc('anchor', 40.75, -73.98), loc('n', 40.751, -73.981)];
    const result = run(nearPair, 10); // currently far out
    expect(result.zoom).toBeLessThanOrEqual(10); // clamp: min(fit, current)
    expect(result.center.latitude).toBeCloseTo(40.75, 3); // center-only motion, on the anchor
  });

  it('nearby cluster growth: floor-distance siblings always join', () => {
    const withinFloor = [
      loc('anchor', 40.75, -73.98),
      loc('f1', 40.757, -73.985), // < 2km floor
      loc('f2', 40.744, -73.972), // < 2km floor
    ];
    expect(run(withinFloor).includedCount).toBe(3);
  });

  it('throws on an anchor id missing from the catalog (broken composition)', () => {
    expect(() => run([loc('anchor', 40.75, -73.98)], 14, 'ghost')).toThrow('[FOCUS-CAMERA]');
  });

  it('haversine sanity: ~1.11km per 0.01° latitude', () => {
    const d = haversineDistanceMeters(
      { latitude: 40.75, longitude: -73.98 },
      { latitude: 40.76, longitude: -73.98 }
    );
    expect(d).toBeGreaterThan(1_050);
    expect(d).toBeLessThan(1_180);
  });
});
