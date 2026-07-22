import type { MapBounds } from '../../../types';

/**
 * THE polls-feed refetch edge (leg 3 of the header subject-store design): the
 * feed is bounds-scoped, and the subject store's settle tick is the ONLY honest
 * "the viewport is where the user stopped" signal — so the edge is a SETTLE
 * whose bounds differ from the last-REQUESTED bounds, by exact value
 * inequality. No significance gate: the settle hysteresis (240ms stream
 * quiescence) already rate-limits, and every settled viewport change changes
 * the §6 places-in-view membership the feed queries — the old 0.1mi/8% gate
 * was exactly the machinery that ate small pans and served stale feeds.
 * Pure and separately housed so the spec proves the edge red/green without
 * dragging in the controller's react-native/socket surface.
 */
export const shouldRefetchPollsFeedForSettledBounds = ({
  settledBounds,
  lastRequestedBounds,
}: {
  settledBounds: MapBounds | null;
  lastRequestedBounds: MapBounds | null;
}): boolean => {
  if (settledBounds == null) {
    return false;
  }
  if (lastRequestedBounds == null) {
    return true;
  }
  return (
    settledBounds.northEast.lat !== lastRequestedBounds.northEast.lat ||
    settledBounds.northEast.lng !== lastRequestedBounds.northEast.lng ||
    settledBounds.southWest.lat !== lastRequestedBounds.southWest.lat ||
    settledBounds.southWest.lng !== lastRequestedBounds.southWest.lng
  );
};
