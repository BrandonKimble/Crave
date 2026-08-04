import axios from 'axios';

/**
 * SEARCH REQUEST TELEMETRY — the shared shape-readers for search lifecycle logs.
 *
 * F840 (2026-08-03): every function below existed TWICE. `readCoordinateField` and
 * `readRequestBoundsSummary` were BYTE-FOR-BYTE identical in `services/search.ts` and
 * `hooks/useSearchRequests.ts`; `getAxiosLifecycleErrorFields` (search.ts) and
 * `getRunSearchErrorFields` (useSearchRequests.ts) were the same function under two names.
 * A fix — say, a new axios error code that should read as `timedOut` — landed in one of two
 * places, and the two logs describing the same request would then disagree about whether it
 * timed out. Telemetry that disagrees with itself is worse than none: it is the always-green
 * disease with extra steps.
 *
 * These are PURE shape readers over `unknown`. They never throw and never assume a payload
 * shape — a log line must not be able to break the request it describes.
 */

export const readCoordinateField = (value: unknown): { lat: number; lng: number } | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const lat = record.lat;
  const lng = record.lng;
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return null;
  }
  return { lat, lng };
};

/**
 * Flattens a request payload's `bounds` into log fields. `payloadHasBounds: false` covers
 * every "there is nothing to report" case — absent, wrong type, or half a rectangle — so a
 * reader never has to distinguish a missing field from a malformed one.
 */
export const readRequestBoundsSummary = (payload: unknown): Record<string, unknown> => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { payloadHasBounds: false };
  }
  const bounds = (payload as Record<string, unknown>).bounds;
  if (!bounds || typeof bounds !== 'object' || Array.isArray(bounds)) {
    return { payloadHasBounds: false };
  }
  const boundsRecord = bounds as Record<string, unknown>;
  const northEast = readCoordinateField(boundsRecord.northEast);
  const southWest = readCoordinateField(boundsRecord.southWest);
  if (!northEast || !southWest) {
    return { payloadHasBounds: false };
  }
  return {
    payloadHasBounds: true,
    payloadBoundsNorthEastLat: northEast.lat,
    payloadBoundsNorthEastLng: northEast.lng,
    payloadBoundsSouthWestLat: southWest.lat,
    payloadBoundsSouthWestLng: southWest.lng,
    payloadBoundsCenterLat: Number(((northEast.lat + southWest.lat) / 2).toFixed(6)),
    payloadBoundsCenterLng: Number(((northEast.lng + southWest.lng) / 2).toFixed(6)),
  };
};

/**
 * The ONE error projection for a search lifecycle log. `aborted` and `timedOut` are the two
 * facts every consumer of these logs sorts on first — a cancelled request is not a failure,
 * and a timeout is a different story from a 500.
 */
export const getSearchLifecycleErrorFields = (error: unknown): Record<string, unknown> => {
  if (!axios.isAxiosError(error)) {
    return {
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : 'unknown error',
    };
  }
  const code = typeof error.code === 'string' ? error.code : null;
  return {
    errorName: error.name,
    errorCode: code,
    errorMessage: error.message,
    status: typeof error.response?.status === 'number' ? error.response.status : null,
    aborted: axios.isCancel(error) || code === 'ERR_CANCELED',
    timedOut: code === 'ECONNABORTED' || code === 'ETIMEDOUT',
  };
};
