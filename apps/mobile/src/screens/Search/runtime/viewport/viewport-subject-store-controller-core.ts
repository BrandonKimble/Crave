import {
  bboxContains,
  bboxToGround,
  resolveHeaderPlace,
  subjectCandidatesInView,
  type GeoBbox,
  type HeaderResolution,
  type PlaceLike,
  type PlacesInViewSliceResponse,
} from '@crave-search/shared';

import {
  getViewportSubjectState,
  setViewportSubjectState,
  viewportSubjectVerdictIdentity,
  type ViewportSubjectVerdict,
} from '../../../../store/viewport-subject-store';
import type { MapBounds } from '../../../../types';
import { MAP_PLANNER_NORMAL_WORK_FAIRNESS_POLICY } from '../map/map-motion-pressure';
import type { ViewportBoundsService } from './viewport-bounds-service';

/**
 * THE viewport subject controller CORE (header subject-store design, ratified
 * 2026-07-21; §2.5 polygon-native header law, ratified 2026-07-22): subscribes
 * to the search runtime's viewport stream (ViewportBoundsService — fed by
 * every material camera tick AND map-idle), runs the shared §2.5 law LOCALLY
 * against the sliding catalog slice, and commits the verdict to the
 * module-scope viewport-subject-store through the settle+dwell hysteresis
 * primitive. Pure Node module — its IO (slice fetch, dwell signal) is
 * injected, so the hysteresis pipeline is spec-able without React or
 * react-native (use-viewport-subject-store-controller-runtime.ts binds the
 * real services and owns the effect lifecycle).
 *
 * SETTLE — the viewport stream has no explicit idle edge for subscribers (the
 * idle event's setBounds dedupes against the last camera tick), so settle is
 * stream quiescence: no bounds change for
 * MAP_PLANNER_NORMAL_WORK_FAIRNESS_POLICY.maxWaitMs (240ms) — the runtime's
 * OWN "coalesced map work must land within this beat" constant, i.e. its
 * existing definition of a map-quiet interval (reused, not invented).
 *
 * DWELL — the short hold after settle that makes attention real. No existing
 * constant maps to "a human paused here", so this is the minimal honest value,
 * K1-STYLE: the eye is the oracle; the feel pass may tune it.
 *
 * HYSTERESIS ASYMMETRY (§2 "commit on settle+dwell, enter/exit asymmetry"):
 *   - ENTER (candidate is a NAMED place differing from the committed verdict)
 *     commits EAGERLY at settle — naming is cheap to be right about and the
 *     header should feel instant when a city fills the view (place→place is
 *     an enter into the new place).
 *   - EXIT (candidate is 'this area') waits the FULL dwell after settle —
 *     drifting across a boundary for a beat must not flap a good name off the
 *     header.
 *   - UNKNOWN (no slice covering the view yet) NEVER overwrites a committed
 *     verdict — the stale verdict keeps serving while the slice re-fetches
 *     (never blank the header while moving); unknown only stands pre-first-
 *     commit.
 *
 * §2.5 JUDGMENT CADENCE (the polygon-cost split, measured 2026-07-22;
 * re-decided under §2.6 GROUND UNIFICATION 2026-07-22): every slice row now
 * carries THE ONE ground (sketch rows a 5-point envelope rectangle, outline
 * rows margin-simplified rings of 300–2000 vertices — detail never
 * decreases, so the outline cost is unchanged from the measurement).
 * Clipping ~40 candidate grounds at full detail costs ~0.3–2ms per call in
 * V8 (Hermes slower still) — too hot for EVERY camera tick of a 60fps pan;
 * a 5-point rectangle clips in ~µs. The split therefore SURVIVES, but as a
 * PRECISION split inside the single representation, never a format branch:
 *   - Every COMMIT judges with GROUND TRUTH: resolveAtSettle (settle tick and
 *     the slice-landed re-judge) feeds the real slice — full rings and all —
 *     through the shared law. The Mexico-bbox lie can never name the header.
 *   - The INTRA-PAN candidate hint (handleBoundsChange's camera-candidate
 *     log — a log, nothing more; verdicts never commit mid-pan) judges an
 *     ENVELOPE-GRADE shadow of the slice: each place's ground replaced by
 *     its bbox rectangle ring (bboxToGround — the same representation a
 *     sketch row stores), through the SAME shared law. Bounded ~5-point
 *     per-candidate cost regardless of outline detail. The shadow derives
 *     once per slice landing (reference-keyed).
 *
 * The dwell-complete tick is the settle+dwell primitive's single event: it
 * lands any pending exit commit AND fires the §3 viewport_dwell observation
 * (fire-and-forget; dwellMs = actual measured hold since settle). Dedupe:
 * re-fire only after the viewport meaningfully changed, derived from the
 * store's own state — committed-verdict identity change or marginBox
 * replacement (slice escape) — never a new distance constant.
 */

/** Settle = stream quiescence for the runtime's existing map-quiet beat. */
export const VIEWPORT_SETTLE_QUIESCENCE_MS = MAP_PLANNER_NORMAL_WORK_FAIRNESS_POLICY.maxWaitMs;

/** K1 (feel pass may tune): the minimal honest "a human paused here" hold. */
export const VIEWPORT_SUBJECT_DWELL_MS = 1_000;

/** Failed slice fetch retry (only re-armed while a fetch is still needed). */
export const SLICE_FETCH_RETRY_MS = 5_000;

// [SUBJECT-STORE] marker logs (temporary-but-committed, BUILDCHECK-style): the
// owner's Austin→San Antonio pan repro greps these in /tmp/crave-metro.log.
// `reason` passes the §2.5 union through verbatim ('finest-dominator' |
// 'straddle' | 'unnamed-ground', or the controller's own 'no-slice').
const logSubjectStore = (event: string, data: Record<string, unknown>): void => {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[SUBJECT-STORE] ${event} ${JSON.stringify(data)}`);
  }
};

const geoBboxFromMapBounds = (bounds: MapBounds): GeoBbox => ({
  // Wrap-aware by construction: west > east (antimeridian crossing) maps to
  // minLng > maxLng, the shared GeoBbox crossing encoding.
  minLat: bounds.southWest.lat,
  minLng: bounds.southWest.lng,
  maxLat: bounds.northEast.lat,
  maxLng: bounds.northEast.lng,
});

const verdictFromResolution = (resolution: HeaderResolution): ViewportSubjectVerdict =>
  resolution.kind === 'place'
    ? {
        kind: 'place',
        placeId: resolution.place.placeId,
        placeName: resolution.place.name,
      }
    : { kind: 'this-area' };

type SettledEpisode = {
  view: GeoBbox;
  mapBounds: MapBounds;
  settledAtMs: number;
};

type LastDwellFire = {
  verdictIdentity: string;
  marginBox: GeoBbox | null;
};

export type ViewportSubjectStoreControllerDeps = {
  viewportBoundsService: Pick<ViewportBoundsService, 'getBounds' | 'subscribe'>;
  /** The sliding-slice read (production: services/places fetchPlacesInView). */
  fetchSlice: (view: GeoBbox) => Promise<PlacesInViewSliceResponse>;
  /** The §3 viewport_dwell observation (production: services/signals). */
  recordDwell: (bounds: MapBounds, dwellMs: number) => void;
};

/** Start the controller; returns its dispose function. */
export const createViewportSubjectStoreController = ({
  viewportBoundsService,
  fetchSlice,
  recordDwell,
}: ViewportSubjectStoreControllerDeps): (() => void) => {
  let disposed = false;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  let dwellTimer: ReturnType<typeof setTimeout> | null = null;
  let sliceRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let sliceFetchInFlight = false;
  let fetchEpoch = 0;
  let settledEpisode: SettledEpisode | null = null;
  let pendingExitVerdict: ViewportSubjectVerdict | null = null;
  let lastLoggedCandidateIdentity: string | null = null;
  let lastDwellFire: LastDwellFire | null = null;
  let latestMapBounds: MapBounds | null = null;
  // §2.5/§2.6 judgment-cadence split: the per-tick hint's envelope-grade
  // shadow (same ground representation, rectangle precision), derived once
  // per slice landing (keyed on the slice reference).
  let hintSliceSource: PlaceLike[] | null = null;
  let hintSlice: PlaceLike[] | null = null;

  const clearTimer = (timer: ReturnType<typeof setTimeout> | null) => {
    if (timer != null) {
      clearTimeout(timer);
    }
  };

  const envelopeGroundSlice = (slice: PlaceLike[]): PlaceLike[] => {
    if (hintSliceSource !== slice) {
      hintSliceSource = slice;
      hintSlice = slice.map((place) => ({ ...place, ground: bboxToGround(place.bbox) }));
    }
    return hintSlice as PlaceLike[];
  };

  /**
   * Local §2.5 read: null = the slice cannot answer this view (unknown).
   * `judge` picks the cadence arm: 'ground' = full-detail rings (every
   * commit); 'envelope-hint' = envelope-grade rings (the per-tick candidate
   * log) — ONE representation, one law, two precisions.
   */
  const computeResolution = (
    view: GeoBbox,
    judge: 'ground' | 'envelope-hint'
  ): HeaderResolution | null => {
    const { slice, marginBox } = getViewportSubjectState();
    if (slice == null || marginBox == null || !bboxContains(marginBox, view)) {
      return null;
    }
    const places = judge === 'ground' ? slice : envelopeGroundSlice(slice);
    return resolveHeaderPlace(view, subjectCandidatesInView(view, places));
  };

  const commitVerdict = (
    verdict: ViewportSubjectVerdict,
    cause: 'enter-eager' | 'exit-dwell'
  ): boolean => {
    const previousIdentity = viewportSubjectVerdictIdentity(getViewportSubjectState().verdict);
    const nextIdentity = viewportSubjectVerdictIdentity(verdict);
    const changed = previousIdentity !== nextIdentity;
    if (changed) {
      setViewportSubjectState({ verdict, lastCommittedAt: Date.now() });
    }
    logSubjectStore('commit', {
      cause,
      changed,
      from: previousIdentity,
      to: nextIdentity,
      name: verdict.kind === 'place' ? verdict.placeName : null,
    });
    return changed;
  };

  const onDwellComplete = () => {
    dwellTimer = null;
    const episode = settledEpisode;
    if (episode == null) {
      return;
    }
    if (pendingExitVerdict != null) {
      // EXIT half of the asymmetry: 'this area' only lands after the FULL dwell.
      commitVerdict(pendingExitVerdict, 'exit-dwell');
      pendingExitVerdict = null;
    }
    const state = getViewportSubjectState();
    const verdictIdentity = viewportSubjectVerdictIdentity(state.verdict);
    const meaningfullyChanged =
      lastDwellFire == null ||
      lastDwellFire.verdictIdentity !== verdictIdentity ||
      lastDwellFire.marginBox !== state.marginBox;
    const dwellMs = Date.now() - episode.settledAtMs;
    logSubjectStore('dwell-complete', {
      dwellMs,
      verdict: verdictIdentity,
      firedSignal: meaningfullyChanged,
    });
    if (meaningfullyChanged) {
      // §3 viewport_dwell: the settle+dwell primitive's observation. Deduped by
      // the store's own change vocabulary (verdict identity / marginBox), so a
      // parked camera fires exactly once per meaningful viewport.
      recordDwell(episode.mapBounds, dwellMs);
      lastDwellFire = { verdictIdentity, marginBox: state.marginBox };
    }
  };

  /**
   * Runs at settle — and again if a slice lands while still settled. This is
   * the ONLY judgment that can commit, and it ALWAYS judges with ground truth
   * (§2.5 cadence split above).
   */
  const resolveAtSettle = () => {
    const episode = settledEpisode;
    if (episode == null) {
      return;
    }
    const resolution = computeResolution(episode.view, 'ground');
    const candidate = resolution == null ? null : verdictFromResolution(resolution);
    const candidateIdentity = viewportSubjectVerdictIdentity(candidate);
    const committedIdentity = viewportSubjectVerdictIdentity(getViewportSubjectState().verdict);
    logSubjectStore('settle', {
      candidate: candidateIdentity,
      reason: resolution?.reason ?? 'no-slice',
      committed: committedIdentity,
    });
    pendingExitVerdict = null;
    if (candidate != null) {
      if (candidate.kind === 'place') {
        // ENTER half of the asymmetry: a named place commits eagerly at settle.
        commitVerdict(candidate, 'enter-eager');
      } else if (candidateIdentity !== committedIdentity) {
        // Leaving to 'this area' waits the full dwell (see onDwellComplete).
        pendingExitVerdict = candidate;
      }
    }
    // UNKNOWN (candidate == null) never overwrites: stale verdict keeps serving.
    clearTimer(dwellTimer);
    dwellTimer = setTimeout(onDwellComplete, VIEWPORT_SUBJECT_DWELL_MS);
  };

  const ensureSliceFetch = (view: GeoBbox) => {
    if (sliceFetchInFlight) {
      return;
    }
    const { slice, marginBox } = getViewportSubjectState();
    if (slice != null && marginBox != null && bboxContains(marginBox, view)) {
      return;
    }
    sliceFetchInFlight = true;
    const epoch = ++fetchEpoch;
    const cause = slice == null ? 'no-slice' : 'margin-escape';
    logSubjectStore('slice-fetch', { cause, view });
    void fetchSlice(view)
      .then((response) => {
        if (disposed || epoch !== fetchEpoch) {
          return;
        }
        sliceFetchInFlight = false;
        // Replace slice+marginBox atomically; the committed verdict stands
        // until the hysteresis pipeline re-judges (never blank mid-move).
        // Rows are stored VERBATIM (PlaceLike) — §2.5 ground rings and
        // parentPlaceIds ride along untouched for the shared law to judge.
        setViewportSubjectState({
          slice: response.places,
          marginBox: response.marginBox,
        });
        logSubjectStore('slice-landed', {
          places: response.places.length,
          grounded: response.places.filter((place) => (place.ground?.length ?? 0) > 0).length,
          marginBox: response.marginBox,
        });
        if (settledEpisode != null && settleTimer == null) {
          // Camera is already quiescent (cold start / parked pan): re-judge the
          // settled view now instead of waiting for another camera move.
          resolveAtSettle();
        }
      })
      .catch((error: unknown) => {
        if (disposed || epoch !== fetchEpoch) {
          return;
        }
        sliceFetchInFlight = false;
        logSubjectStore('slice-fetch-failed', {
          message: error instanceof Error ? error.message : 'unknown',
        });
        clearTimer(sliceRetryTimer);
        sliceRetryTimer = setTimeout(() => {
          sliceRetryTimer = null;
          const mapBounds = latestMapBounds;
          if (mapBounds != null) {
            ensureSliceFetch(geoBboxFromMapBounds(mapBounds));
          }
        }, SLICE_FETCH_RETRY_MS);
      });
  };

  const handleBoundsChange = (mapBounds: MapBounds | null) => {
    if (mapBounds == null) {
      return;
    }
    latestMapBounds = mapBounds;
    const view = geoBboxFromMapBounds(mapBounds);
    // Motion voids the previous settled episode and any pending exit commit.
    settledEpisode = null;
    pendingExitVerdict = null;
    clearTimer(dwellTimer);
    dwellTimer = null;
    // Cheap per-camera-change local read: the CANDIDATE hint (held, not
    // committed — hysteresis commits at settle+dwell, with full-detail
    // ground). Judges envelope-grade rings (§2.5/§2.6 cadence split):
    // bounded microseconds per tick.
    const resolution = computeResolution(view, 'envelope-hint');
    const candidateIdentity = viewportSubjectVerdictIdentity(
      resolution == null ? null : verdictFromResolution(resolution)
    );
    if (candidateIdentity !== lastLoggedCandidateIdentity) {
      lastLoggedCandidateIdentity = candidateIdentity;
      logSubjectStore('camera-candidate', {
        candidate: candidateIdentity,
        reason: resolution?.reason ?? 'no-slice',
        judge: 'envelope-hint',
      });
    }
    ensureSliceFetch(view);
    clearTimer(settleTimer);
    settleTimer = setTimeout(() => {
      settleTimer = null;
      settledEpisode = {
        view,
        mapBounds,
        settledAtMs: Date.now(),
      };
      // Leg 3: publish THE settled viewport. A settle only follows a real
      // bounds change (ViewportBoundsService dedupes byte-equal writes), so
      // this reference turnover is the store's settle event — the polls feed
      // subscribes to it as its refetch edge.
      setViewportSubjectState({ settledBounds: mapBounds });
      resolveAtSettle();
    }, VIEWPORT_SETTLE_QUIESCENCE_MS);
  };

  // Seed from the current bounds (startup bounds land before this mounts).
  handleBoundsChange(viewportBoundsService.getBounds());
  const unsubscribe = viewportBoundsService.subscribe(handleBoundsChange);

  return () => {
    disposed = true;
    unsubscribe();
    clearTimer(settleTimer);
    clearTimer(dwellTimer);
    clearTimer(sliceRetryTimer);
  };
};
