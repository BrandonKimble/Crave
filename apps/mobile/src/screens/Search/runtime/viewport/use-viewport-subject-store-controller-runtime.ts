import React from 'react';

import {
  bboxContains,
  resolveHeaderPlace,
  subjectCandidatesInView,
  type GeoBbox,
  type HeaderResolution,
} from '@crave-search/shared';

import { fetchPlacesInView } from '../../../../services/places';
import { recordViewportDwell } from '../../../../services/signals';
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
 * THE viewport subject controller (header subject-store design, ratified
 * 2026-07-21): subscribes to the search runtime's viewport stream
 * (ViewportBoundsService — fed by every material camera tick AND map-idle),
 * runs the shared §2 law LOCALLY against the sliding catalog slice on each
 * camera change (microseconds), and commits the verdict to the module-scope
 * viewport-subject-store through the settle+dwell hysteresis primitive.
 *
 * This hook lives in the search-root runtime layer (mounted from
 * use-search-root-session-services-foundation-runtime) where effects FIRE —
 * NEVER in a scene body-spec hook (CLAUDE.md: effects there are dead code).
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
 * The dwell-complete tick is the settle+dwell primitive's single event: it
 * lands any pending exit commit AND fires the §3 viewport_dwell observation
 * (fire-and-forget; dwellMs = actual measured hold since settle). Dedupe:
 * re-fire only after the viewport meaningfully changed, derived from the
 * store's own state — committed-verdict identity change or marginBox
 * replacement (slice escape) — never a new distance constant.
 */

/** Settle = stream quiescence for the runtime's existing map-quiet beat. */
const VIEWPORT_SETTLE_QUIESCENCE_MS = MAP_PLANNER_NORMAL_WORK_FAIRNESS_POLICY.maxWaitMs;

/** K1 (feel pass may tune): the minimal honest "a human paused here" hold. */
const VIEWPORT_SUBJECT_DWELL_MS = 1_000;

/** Failed slice fetch retry (only re-armed while a fetch is still needed). */
const SLICE_FETCH_RETRY_MS = 5_000;

// [SUBJECT-STORE] marker logs (temporary-but-committed, BUILDCHECK-style): the
// owner's Austin→San Antonio pan repro greps these in /tmp/crave-metro.log.
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

type UseViewportSubjectStoreControllerRuntimeArgs = {
  viewportBoundsService: ViewportBoundsService;
};

export const useViewportSubjectStoreControllerRuntime = ({
  viewportBoundsService,
}: UseViewportSubjectStoreControllerRuntimeArgs): void => {
  React.useEffect(() => {
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

    const clearTimer = (timer: ReturnType<typeof setTimeout> | null) => {
      if (timer != null) {
        clearTimeout(timer);
      }
    };

    /** Local §2 read: null = the slice cannot answer this view (unknown). */
    const computeResolution = (view: GeoBbox): HeaderResolution | null => {
      const { slice, marginBox } = getViewportSubjectState();
      if (slice == null || marginBox == null || !bboxContains(marginBox, view)) {
        return null;
      }
      return resolveHeaderPlace(view, subjectCandidatesInView(view, slice));
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
        recordViewportDwell(episode.mapBounds, dwellMs);
        lastDwellFire = { verdictIdentity, marginBox: state.marginBox };
      }
    };

    /** Runs at settle — and again if a slice lands while still settled. */
    const resolveAtSettle = () => {
      const episode = settledEpisode;
      if (episode == null) {
        return;
      }
      const resolution = computeResolution(episode.view);
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
      void fetchPlacesInView(view)
        .then((response) => {
          if (disposed || epoch !== fetchEpoch) {
            return;
          }
          sliceFetchInFlight = false;
          // Replace slice+marginBox atomically; the committed verdict stands
          // until the hysteresis pipeline re-judges (never blank mid-move).
          setViewportSubjectState({
            slice: response.places,
            marginBox: response.marginBox,
          });
          logSubjectStore('slice-landed', {
            places: response.places.length,
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
      // Cheap per-camera-change local read: the CANDIDATE verdict (held, not
      // committed — hysteresis commits it at settle+dwell).
      const resolution = computeResolution(view);
      const candidateIdentity = viewportSubjectVerdictIdentity(
        resolution == null ? null : verdictFromResolution(resolution)
      );
      if (candidateIdentity !== lastLoggedCandidateIdentity) {
        lastLoggedCandidateIdentity = candidateIdentity;
        logSubjectStore('camera-candidate', {
          candidate: candidateIdentity,
          reason: resolution?.reason ?? 'no-slice',
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
  }, [viewportBoundsService]);
};
