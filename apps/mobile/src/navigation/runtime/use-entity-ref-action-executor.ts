import React from 'react';

import { useAppRouteCoordinator } from './AppRouteCoordinator';
import { resolveEntityRefAction, type EntityRef } from './entity-ref-action-policy';
import { useAppOverlayRouteController } from '../../overlays/useAppOverlayRouteController';

/**
 * S-D.1/S-D.2 — THE entity-ref executor: resolves an EntityRef through the ONE policy and
 * dispatches the resulting action. EntityLink (span rendering) and list/row press handlers
 * share this hook — the policy and its execution live in exactly one place each.
 *
 * Execution rides the launch-intent lane for the search-shaped actions until S-D.4
 * dissolves LaunchIntent; pushScene pushes the child route directly.
 */
export const useEntityRefActionExecutor = (): ((ref: EntityRef) => void) => {
  const { dispatchLaunchIntent } = useAppRouteCoordinator();
  const { pushRoute } = useAppOverlayRouteController();
  return React.useCallback(
    (ref: EntityRef) => {
      const action = resolveEntityRefAction(ref);
      // S-D.4: search-shaped actions ride the launch channel AS THE ACTION VALUE (the
      // LaunchIntent vocabulary no longer duplicates EntityRefAction); pure-nav actions
      // push directly.
      if (action.kind === 'pushScene') {
        // Narrow per scene so TS correlates each scene key with its params shape.
        if (action.scene === 'listDetail') {
          pushRoute('listDetail', action.params);
        } else {
          pushRoute('userProfile', action.params);
        }
        return;
      }
      if (action.kind === 'listWorld') {
        // Wave-4 §3 COMPOSITE: push the child (title warm-seeds the header at frame 1)
        // THEN dispatch the world half — the launch consumer writes the list-identity
        // tuple; the reconciler presents the world INTO this pushed entry
        // (preserveSheetState derives from the list identity, so no results takeover).
        pushRoute('listDetail', {
          listId: action.listId,
          title: action.title,
          worldBacked: true,
          ...(action.targetUserId != null ? { targetUserId: action.targetUserId } : {}),
        });
        dispatchLaunchIntent({ type: 'entityAction', action });
        return;
      }
      dispatchLaunchIntent({ type: 'entityAction', action });
    },
    [dispatchLaunchIntent, pushRoute]
  );
};
