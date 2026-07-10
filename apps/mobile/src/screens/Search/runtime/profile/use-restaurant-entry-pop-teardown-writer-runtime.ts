import React from 'react';

import { useAppRouteSceneRuntime } from '../../../../navigation/runtime/AppRouteSceneRuntimeProvider';
import type { RouteOverlayNavigationSnapshot } from '../../../../navigation/runtime/route-overlay-navigation-snapshot-contract';
import type { ProfileOwner } from './profile-owner-runtime-contract';

const selectHasRestaurantEntry = (snapshot: RouteOverlayNavigationSnapshot): boolean =>
  snapshot.overlayRouteStack.some((entry) => entry.key === 'restaurant');

/**
 * S-C.5 slices B+C (plans/s-c5-restaurant-stack-fact.md) — THE single writer projecting the
 * route stack's restaurant membership into the profile machine's pop-owned teardown.
 *
 * On the present→absent transition it runs the COMMIT half (handleRestaurantEntryPopped:
 * saved-camera restore + hydration cancel + highlight clear + focus reset; a no-op when the
 * profile machine's own close transaction owns the removal). When the commit half ran, it
 * arms the SETTLE half: once the presentation frame's outgoing clears (the dismissal slide
 * has settled — the outgoing leg no longer renders the snapshot), it finalizes the close
 * state, nulling the restaurant panel snapshot. Re-appearance of the restaurant entry
 * before the settle (a rapid re-open) disarms the pending finalize — the fresh open owns
 * the snapshot now.
 */
export const useRestaurantEntryPopTeardownWriterRuntime = ({
  profileOwner,
}: {
  profileOwner: ProfileOwner;
}): void => {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const actionsRef = React.useRef({
    handleRestaurantEntryPopped: profileOwner.profileActions.handleRestaurantEntryPopped,
    finalizeRestaurantEntryPopTeardown:
      profileOwner.profileActions.finalizeRestaurantEntryPopTeardown,
  });
  React.useEffect(() => {
    actionsRef.current = {
      handleRestaurantEntryPopped: profileOwner.profileActions.handleRestaurantEntryPopped,
      finalizeRestaurantEntryPopTeardown:
        profileOwner.profileActions.finalizeRestaurantEntryPopTeardown,
    };
  }, [
    profileOwner.profileActions.finalizeRestaurantEntryPopTeardown,
    profileOwner.profileActions.handleRestaurantEntryPopped,
  ]);
  React.useEffect(() => {
    let isFinalizePending = false;
    const runPendingFinalizeIfSettled = (): void => {
      if (!isFinalizePending) {
        return;
      }
      const frame = routeSceneRuntime.routeOverlayTransitionActions.getPresentationFrame();
      if (frame.outgoingSceneKey != null) {
        return;
      }
      isFinalizePending = false;
      actionsRef.current.finalizeRestaurantEntryPopTeardown();
    };
    const unsubscribeNavigation = routeSceneRuntime.routeOverlayNavigationAuthority.registerTarget({
      selector: selectHasRestaurantEntry,
      syncNavigationSnapshot: (_snapshot: RouteOverlayNavigationSnapshot, hasEntry: boolean) => {
        if (hasEntry) {
          // A fresh restaurant open owns the snapshot — a still-pending finalize from a
          // previous pop must never clear it.
          isFinalizePending = false;
          return;
        }
        if (actionsRef.current.handleRestaurantEntryPopped()) {
          isFinalizePending = true;
          // The pop may commit with no transition in flight (motionless pop shapes) —
          // finalize immediately in that case rather than waiting for a frame publication.
          runPendingFinalizeIfSettled();
        }
      },
      isEqual: (left: boolean, right: boolean) => left === right,
      attributionLabel: 'RestaurantEntryPopTeardownWriterRuntime',
    });
    const unsubscribeFrame =
      routeSceneRuntime.routeOverlayTransitionActions.subscribePresentationFrame(() => {
        runPendingFinalizeIfSettled();
      });
    return () => {
      unsubscribeNavigation();
      unsubscribeFrame();
    };
  }, [routeSceneRuntime]);
};
