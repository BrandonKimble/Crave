/**
 * Viewport subject controller core — §2.5 polygon-native judgment through the
 * settle+dwell hysteresis pipeline (leg B of the polygon-native header
 * rebuild). The shared law itself is specced in apps/api subjects.spec.ts;
 * these specs pin the CLIENT half: slice rows (ground + parentPlaceIds) are
 * stored verbatim and judged with full-detail ground at every commit, a
 * sketch-grade slice (envelope-rectangle ground — §2.6's ONE representation)
 * still resolves, the per-tick candidate hint judges the envelope-grade
 * shadow (judgment-cadence split), and the marker logs carry the §2.5
 * reason union ('finest-dominator' | 'straddle' | 'unnamed-ground').
 */
import {
  bboxToGround,
  type GeoBbox,
  type PlaceLike,
  type PlacesInViewSliceResponse,
} from '@crave-search/shared';

import {
  getViewportSubjectState,
  resetViewportSubjectStore,
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

  it('commits Texas (89% real ground) over the Mexico bbox lie, reason finest-dominator', async () => {
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
      reason: 'finest-dominator',
    });
    harness.dispose();
  });

  it('never lets a 5%-ground bbox-container name the header: ground truth judges the COMMIT (unnamed-ground after full dwell)', async () => {
    const harness = startController([MEXICO]);
    await flushMicrotasks();
    jest.advanceTimersByTime(VIEWPORT_SETTLE_QUIESCENCE_MS);

    // 'this area' is an EXIT: it waits the full dwell before landing.
    expect(getViewportSubjectState().verdict).toBeNull();
    const settleLogs = harness.logsFor('settle');
    expect(settleLogs[settleLogs.length - 1]).toMatchObject({
      candidate: 'this-area',
      reason: 'unnamed-ground',
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
    expect(settleLogs[settleLogs.length - 1]).toMatchObject({ reason: 'finest-dominator' });
    harness.dispose();
  });

  it('fires the straddle reservation through parentPlaceIds and logs reason straddle', async () => {
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
      bbox: { minLat: 28.8, maxLat: 30.2, minLng: -100.6, maxLng: -99.55 },
      parentPlaceIds: ['travis'],
      ground: [
        [
          [-100.6, 28.8],
          [-99.55, 28.8],
          [-99.55, 30.2],
          [-100.6, 30.2],
        ],
      ],
    });
    const eastChild = place({
      placeId: 'austin',
      name: 'Austin',
      bbox: { minLat: 28.8, maxLat: 30.2, minLng: -99.45, maxLng: -98.4 },
      parentPlaceIds: ['travis'],
      ground: [
        [
          [-99.45, 28.8],
          [-98.4, 28.8],
          [-98.4, 30.2],
          [-99.45, 30.2],
        ],
      ],
    });
    const harness = startController([travis, westChild, eastChild]);
    await flushMicrotasks();
    jest.advanceTimersByTime(VIEWPORT_SETTLE_QUIESCENCE_MS);

    const settleLogs = harness.logsFor('settle');
    expect(settleLogs[settleLogs.length - 1]).toMatchObject({
      candidate: 'this-area',
      reason: 'straddle',
    });
    jest.advanceTimersByTime(VIEWPORT_SUBJECT_DWELL_MS);
    expect(getViewportSubjectState().verdict).toEqual({ kind: 'this-area' });
    harness.dispose();
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
    harness.dispose();
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
