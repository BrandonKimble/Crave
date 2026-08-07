/**
 * Viewport subject controller core — §2.5 polygon-native judgment through the
 * settle+dwell hysteresis pipeline (leg B of the polygon-native header
 * rebuild). The shared law itself is specced in apps/api subjects.spec.ts;
 * these specs pin the CLIENT half: slice rows (ground + parentPlaceIds) are
 * stored verbatim and judged with full-detail ground at every commit, a
 * sketch-grade slice (envelope-rectangle ground — §2.6's ONE representation)
 * still resolves, the per-tick candidate hint judges the envelope-grade
 * shadow (judgment-cadence split), and the marker logs carry the header
 * law's reason union ('finest-centered' | 'nothing-under-center' |
 * 'under-threshold'). The law itself is center-anchored (2026-08-07);
 * apps/api subjects.spec.ts is its spec.
 */
import {
  bboxToGround,
  type GeoBbox,
  type PlaceLike,
  type PlacesInViewSliceResponse,
} from '@crave-search/shared';
import { NETWORK_RETRY_MAX_ATTEMPTS } from '../../../../services/retry/network-retry-ladder';

import {
  getViewportSubjectState,
  resetViewportSubjectStore,
  noteCatalogWatermark,
} from '../../../../store/viewport-subject-store';
import type { MapBounds } from '../../../../types';
import { createViewportBoundsService } from './viewport-bounds-service';
import {
  createViewportSubjectStoreController,
  VIEWPORT_SETTLE_QUIESCENCE_MS,
  VIEWPORT_SUBJECT_DWELL_MS,
} from './viewport-subject-store-controller-core';

/** The test view: 1°×1° over central Texas. */
const VIEW: GeoBbox = { minLat: 29, maxLat: 30, minLng: -100, maxLng: -99 };

const MARGIN_BOX: GeoBbox = { minLat: 20, maxLat: 35, minLng: -110, maxLng: -90 };

const boundsOf = (view: GeoBbox): MapBounds => ({
  southWest: { lat: view.minLat, lng: view.minLng },
  northEast: { lat: view.maxLat, lng: view.maxLng },
});

const place = (partial: Partial<PlaceLike> & Pick<PlaceLike, 'placeId' | 'bbox'>): PlaceLike => ({
  name: partial.placeId,
  providerLevelCode: 'test-level',
  parentPlaceIds: [],
  // §2.6: ground is REQUIRED — default fixture is the sketch-grade envelope.
  ground: bboxToGround(partial.bbox),
  ...partial,
});

/**
 * Texas: real ground covers lat 29.11→30 of the view = 89% (a §2.5 dominator).
 */
const TEXAS = place({
  placeId: 'texas',
  name: 'Texas',
  bbox: { minLat: 29.11, maxLat: 31, minLng: -101, maxLng: -98 },
  ground: [
    [
      [-101, 29.11],
      [-98, 29.11],
      [-98, 31],
      [-101, 31],
    ],
  ],
});

/**
 * Mexico: the §2.5(c) bbox LIE — its index box CONTAINS the whole view, but
 * its real ground touches only the bottom 5% (lat 29→29.05). Polygon truth
 * must disqualify it from ever naming the header.
 */
const MEXICO = place({
  placeId: 'mexico',
  name: 'Mexico',
  bbox: { minLat: 14, maxLat: 33, minLng: -118, maxLng: -86 },
  ground: [
    [
      [-119, 14],
      [-86, 14],
      [-86, 29.05],
      [-119, 29.05],
    ],
  ],
});

const sliceResponse = (places: PlaceLike[]): PlacesInViewSliceResponse => ({
  marginBox: MARGIN_BOX,
  catalogWatermark: 'rev-1',
  places,
});

/** Flush the fetchSlice promise chain under fake timers. */
const flushMicrotasks = async (): Promise<void> => {
  for (let i = 0; i < 4; i += 1) {
    await Promise.resolve();
  }
};

type Harness = {
  dispose: () => void;
  fetchSlice: jest.Mock;
  recordDwell: jest.Mock;
  setBounds: (view: GeoBbox) => void;
  logsFor: (event: string) => Array<Record<string, unknown>>;
};

const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

const startController = (places: PlaceLike[], initialView: GeoBbox = VIEW): Harness => {
  const boundsService = createViewportBoundsService(boundsOf(initialView));
  const fetchSlice = jest.fn(async () => sliceResponse(places));
  const recordDwell = jest.fn();
  const dispose = createViewportSubjectStoreController({
    viewportBoundsService: boundsService,
    fetchSlice,
    recordDwell,
  });
  return {
    dispose,
    fetchSlice,
    recordDwell,
    setBounds: (view) => boundsService.setBounds(boundsOf(view)),
    logsFor: (event) => {
      const prefix = `[SUBJECT-STORE] ${event} `;
      return logSpy.mock.calls
        .map((call) => String(call[0]))
        .filter((line) => line.startsWith(prefix))
        .map((line) => JSON.parse(line.slice(prefix.length)) as Record<string, unknown>);
    },
  };
};

describe('viewport subject controller core (§2.5 polygon-native)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetViewportSubjectStore();
    logSpy.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('commits Texas (89% real ground, centred) over the Mexico bbox lie, reason finest-centered', async () => {
    const harness = startController([TEXAS, MEXICO]);
    await flushMicrotasks(); // slice lands (rows stored verbatim, grounds intact)
    jest.advanceTimersByTime(VIEWPORT_SETTLE_QUIESCENCE_MS); // settle → ground-truth judgment

    const state = getViewportSubjectState();
    expect(state.verdict).toEqual({ kind: 'place', placeId: 'texas', placeName: 'Texas' });
    // The slice kept the §2.5 fields — nothing was mapped away.
    expect(state.slice?.find((row) => row.placeId === 'mexico')?.ground).toBeDefined();
    expect(state.slice?.every((row) => Array.isArray(row.parentPlaceIds))).toBe(true);

    const settleLogs = harness.logsFor('settle');
    expect(settleLogs[settleLogs.length - 1]).toMatchObject({
      candidate: 'place:texas',
      reason: 'finest-centered',
    });
    // F2203: the slice is fetched FOR THE VIEW ON SCREEN. Nothing else in
    // this suite looks at fetchSlice's argument (only its call counts), so
    // without this the controller could ask the server for any box at all —
    // including the whole globe — with every spec here green.
    expect(harness.fetchSlice).toHaveBeenCalledWith(VIEW);
    harness.dispose();
  });

  it('never lets a 5%-ground bbox-container name the header: ground truth judges the COMMIT (nothing under the centre after full dwell)', async () => {
    const harness = startController([MEXICO]);
    await flushMicrotasks();
    jest.advanceTimersByTime(VIEWPORT_SETTLE_QUIESCENCE_MS);

    // 'this area' is an EXIT: it waits the full dwell before landing.
    expect(getViewportSubjectState().verdict).toBeNull();
    const settleLogs = harness.logsFor('settle');
    expect(settleLogs[settleLogs.length - 1]).toMatchObject({
      candidate: 'this-area',
      reason: 'nothing-under-center',
    });

    jest.advanceTimersByTime(VIEWPORT_SUBJECT_DWELL_MS);
    expect(getViewportSubjectState().verdict).toEqual({ kind: 'this-area' });
    const commitLogs = harness.logsFor('commit');
    expect(commitLogs[commitLogs.length - 1]).toMatchObject({
      cause: 'exit-dwell',
      to: 'this-area',
    });
    harness.dispose();
  });

  it('resolves a sketch-grade slice (envelope-rectangle ground — §2.6 one representation, no outline landed yet)', async () => {
    const austin = place({
      placeId: 'austin',
      name: 'Austin',
      bbox: { minLat: 28.8, maxLat: 30.2, minLng: -100.5, maxLng: -98.5 },
      // ground defaults to the sketch envelope (bboxToGround) — exactly
      // what the server ships before the outline drain lands.
    });
    const harness = startController([austin]);
    await flushMicrotasks();
    jest.advanceTimersByTime(VIEWPORT_SETTLE_QUIESCENCE_MS);

    expect(getViewportSubjectState().verdict).toEqual({
      kind: 'place',
      placeId: 'austin',
      placeName: 'Austin',
    });
    const settleLogs = harness.logsFor('settle');
    expect(settleLogs[settleLogs.length - 1]).toMatchObject({ reason: 'finest-centered' });
    harness.dispose();
  });

  it('the straddle reservation is DEAD: two children of a covering county, the CENTERED one names the header', () => {
    // Old behaviour: parentPlaceIds siblinghood declared "this area". The
    // DAG was measurably unfit for that judgment (nested Austin/Travis read
    // as siblings), so the law anchors on the centre instead: Round Rock's
    // ground holds the view centre (-99.5 ∈ [-100.6, -99.45]), Austin's
    // does not, and the county loses on fineness.
    const travis = place({
      placeId: 'travis',
      name: 'Travis County',
      bbox: { minLat: 28, maxLat: 31, minLng: -101, maxLng: -97 },
      ground: [
        [
          [-101, 28],
          [-97, 28],
          [-97, 31],
          [-101, 31],
        ],
      ],
    });
    const westChild = place({
      placeId: 'round-rock',
      name: 'Round Rock',
      bbox: { minLat: 28.8, maxLat: 30.2, minLng: -100.6, maxLng: -99.45 },
      parentPlaceIds: ['travis'],
      ground: [
        [
          [-100.6, 28.8],
          [-99.45, 28.8],
          [-99.45, 30.2],
          [-100.6, 30.2],
        ],
      ],
    });
    const eastChild = place({
      placeId: 'austin',
      name: 'Austin',
      bbox: { minLat: 28.8, maxLat: 30.2, minLng: -99.44, maxLng: -98.4 },
      parentPlaceIds: ['travis'],
      ground: [
        [
          [-99.44, 28.8],
          [-98.4, 28.8],
          [-98.4, 30.2],
          [-99.44, 30.2],
        ],
      ],
    });
    const harness = startController([travis, westChild, eastChild]);
    return (async () => {
      await flushMicrotasks();
      jest.advanceTimersByTime(VIEWPORT_SETTLE_QUIESCENCE_MS);

      const settleLogs = harness.logsFor('settle');
      expect(settleLogs[settleLogs.length - 1]).toMatchObject({
        candidate: 'place:round-rock',
        reason: 'finest-centered',
      });
      expect(getViewportSubjectState().verdict).toEqual({
        kind: 'place',
        placeId: 'round-rock',
        placeName: 'Round Rock',
      });
      harness.dispose();
    })();
  });

  it('judges the per-tick candidate hint at envelope grade (cadence split) while commits stay full-detail ground', async () => {
    const harness = startController([TEXAS, MEXICO]);
    await flushMicrotasks();
    jest.advanceTimersByTime(VIEWPORT_SETTLE_QUIESCENCE_MS);
    expect(getViewportSubjectState().verdict).toMatchObject({ placeId: 'texas' });

    // Pan south (still inside the margin box, so the same slice answers): the
    // view (lat 28.2→29.2) leaves Texas almost entirely (ground floor at
    // 29.11 → 9% coverage). Mid-pan we assert the cadence split only: every
    // camera-candidate log carries the envelope-hint judge marker, and
    // nothing commits before settle.
    const pannedView: GeoBbox = { minLat: 28.2, maxLat: 29.2, minLng: -100, maxLng: -99 };
    harness.setBounds(pannedView);

    const cameraLogs = harness.logsFor('camera-candidate');
    expect(cameraLogs.length).toBeGreaterThan(0);
    expect(cameraLogs.every((entry) => entry.judge === 'envelope-hint')).toBe(true);
    // Mid-pan (before settle) nothing committed: Texas still serves.
    expect(getViewportSubjectState().verdict).toMatchObject({ placeId: 'texas' });

    // At settle the COMMIT re-judges with polygons: Mexico ground covers
    // 28.2→29.05 = 85% of the panned view → Mexico is an honest dominator by
    // its REAL ground here (not its bbox), so the header names it.
    jest.advanceTimersByTime(VIEWPORT_SETTLE_QUIESCENCE_MS);
    expect(getViewportSubjectState().verdict).toMatchObject({ placeId: 'mexico' });
    harness.dispose();
  });

  it('keeps serving the committed verdict while the view escapes the margin box (unknown never overwrites)', async () => {
    const harness = startController([TEXAS, MEXICO]);
    await flushMicrotasks();
    jest.advanceTimersByTime(VIEWPORT_SETTLE_QUIESCENCE_MS);
    expect(getViewportSubjectState().verdict).toMatchObject({ placeId: 'texas' });

    // Escape the margin box; make the re-fetch hang (slice cannot answer).
    harness.fetchSlice.mockImplementation(() => new Promise(() => undefined));
    const farView: GeoBbox = { minLat: 40, maxLat: 41, minLng: -75, maxLng: -74 };
    harness.setBounds(farView);
    jest.advanceTimersByTime(VIEWPORT_SETTLE_QUIESCENCE_MS + VIEWPORT_SUBJECT_DWELL_MS);

    expect(getViewportSubjectState().verdict).toMatchObject({ placeId: 'texas' });
    const settleLogs = harness.logsFor('settle');
    expect(settleLogs[settleLogs.length - 1]).toMatchObject({
      candidate: 'unknown',
      reason: 'no-slice',
    });
    // F2203: the margin-escape refetch asks for the NEW view, not the old one.
    expect(harness.fetchSlice).toHaveBeenLastCalledWith(farView);
    harness.dispose();
  });

  it('re-cuts the slice when a feed reports a CHANGED catalog watermark — and never on a clock (header ideal 2026-08-01)', async () => {
    const harness = startController([TEXAS]);
    jest.advanceTimersByTime(VIEWPORT_SETTLE_QUIESCENCE_MS + 1);
    await flushMicrotasks();
    expect(harness.fetchSlice).toHaveBeenCalledTimes(1);

    // Same revision reported (the common case: feed watermark == slice's) —
    // no refetch.
    noteCatalogWatermark('rev-1');
    await flushMicrotasks();
    expect(harness.fetchSlice).toHaveBeenCalledTimes(1);

    // A DIFFERENT revision (a birth/promotion landed server-side) re-cuts
    // the slice even though the camera never moved.
    harness.fetchSlice.mockImplementation(async () => ({
      marginBox: MARGIN_BOX,
      catalogWatermark: 'rev-2',
      places: [TEXAS],
    }));
    noteCatalogWatermark('rev-2');
    await flushMicrotasks();
    expect(harness.fetchSlice).toHaveBeenCalledTimes(2);
    // CONVERGENCE (red-team): the re-cut aligns seen to the slice's own
    // watermark, so nothing is stale afterwards — no thrash.
    noteCatalogWatermark('rev-2');
    await flushMicrotasks();
    expect(harness.fetchSlice).toHaveBeenCalledTimes(2);

    // Time alone never refetches: no TTL survives.
    jest.advanceTimersByTime(2 * 60 * 60 * 1_000);
    await flushMicrotasks();
    expect(harness.fetchSlice).toHaveBeenCalledTimes(2);

    // EMPTY-REGION convergence (red-team round 3): a re-cut landing a NULL
    // watermark (no grounds — mid-ocean) must align seen to null too, or
    // the region reads permanently stale against the last grounded seen.
    harness.fetchSlice.mockImplementation(async () => ({
      marginBox: MARGIN_BOX,
      catalogWatermark: null,
      places: [],
    }));
    noteCatalogWatermark('rev-3');
    await flushMicrotasks();
    expect(harness.fetchSlice).toHaveBeenCalledTimes(3);
    // seen aligned to null with the empty slice; time alone never re-fires.
    jest.advanceTimersByTime(60 * 60 * 1_000);
    await flushMicrotasks();
    expect(harness.fetchSlice).toHaveBeenCalledTimes(3);

    // ...and the honest positive case (red-team: the assertion above passes
    // via the store's equality dedupe, so pin the real contract too): a feed
    // reporting a REAL revision against a null-watermark slice IS a change,
    // so it re-cuts exactly once and converges again.
    harness.fetchSlice.mockImplementation(async () => ({
      marginBox: MARGIN_BOX,
      catalogWatermark: 'rev-4',
      places: [TEXAS],
    }));
    noteCatalogWatermark('rev-4');
    await flushMicrotasks();
    expect(harness.fetchSlice).toHaveBeenCalledTimes(4);
    noteCatalogWatermark('rev-4');
    await flushMicrotasks();
    expect(harness.fetchSlice).toHaveBeenCalledTimes(4);
    harness.dispose();
  });

  it('A MEASUREMENT MUST NOT OUTLIVE ITS SUBJECT: backgrounding ends the episode, so no dwell is reported for time nobody was looking', async () => {
    // Disease D (re-derivation 2026-08-01): dwell ran on the WALL CLOCK, so a
    // timer armed before the app was suspended reported the whole suspension
    // as human attention — straight into the demand aggregate, a
    // no-fake-estimates violation.
    const foregroundRef: { fn: ((isForeground: boolean) => void) | null } = {
      fn: null,
    };
    const boundsService = createViewportBoundsService(boundsOf(VIEW));
    const recordDwell = jest.fn();
    const dispose = createViewportSubjectStoreController({
      viewportBoundsService: boundsService,
      fetchSlice: jest.fn(async () => sliceResponse([TEXAS])),
      recordDwell,
      subscribeForeground: (listener) => {
        foregroundRef.fn = listener;
        return () => undefined;
      },
    });
    jest.advanceTimersByTime(VIEWPORT_SETTLE_QUIESCENCE_MS + 1);
    await flushMicrotasks();

    // Background BEFORE the dwell completes...
    foregroundRef.fn?.(false);
    jest.advanceTimersByTime(VIEWPORT_SUBJECT_DWELL_MS * 40);
    await flushMicrotasks();

    // ...and nothing is reported: the episode ended with the attention.
    expect(recordDwell).not.toHaveBeenCalled();
    dispose();
  });

  it('ONE RETRY LAW: the slice ladder is BOUNDED — offline stops paying radio instead of retrying forever', async () => {
    // Disease C (re-derivation 2026-08-01): this consumer retried forever at
    // a flat 5s with no visibility gate and no reconnect edge, while the two
    // feeds capped at three rungs — three policies for one question, and the
    // odd one out was a battery leak.
    const boundsService = createViewportBoundsService(boundsOf(VIEW));
    const fetchSlice = jest.fn(async () => {
      throw new Error('offline');
    });
    const dispose = createViewportSubjectStoreController({
      viewportBoundsService: boundsService,
      fetchSlice,
      recordDwell: jest.fn(),
    });
    await flushMicrotasks();
    // Walk far past the whole ladder: the rungs are consumed, then silence.
    for (let i = 0; i < 12; i += 1) {
      jest.advanceTimersByTime(60_000);
      await flushMicrotasks();
    }
    // TWO-SIDED, per F6405(b): the name says BOUNDED, not ABSENT. The upper
    // bound alone stayed green with the ladder removed entirely — a law that
    // can only show green. The lower bound makes "it retried" a fact too.
    expect(fetchSlice.mock.calls.length).toBeGreaterThan(1);
    expect(fetchSlice.mock.calls.length).toBeLessThanOrEqual(NETWORK_RETRY_MAX_ATTEMPTS + 1);
    dispose();
  });

  it('fires the §3 viewport_dwell observation once per meaningful viewport', async () => {
    const harness = startController([TEXAS, MEXICO]);
    await flushMicrotasks();
    jest.advanceTimersByTime(VIEWPORT_SETTLE_QUIESCENCE_MS + VIEWPORT_SUBJECT_DWELL_MS);
    expect(harness.recordDwell).toHaveBeenCalledTimes(1);
    const [, dwellMs] = harness.recordDwell.mock.calls[0] as [MapBounds, number];
    expect(dwellMs).toBeGreaterThanOrEqual(VIEWPORT_SUBJECT_DWELL_MS);
    harness.dispose();
  });
});
