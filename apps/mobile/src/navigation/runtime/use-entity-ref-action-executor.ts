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
      switch (action.kind) {
        case 'restaurantWorld':
          dispatchLaunchIntent({
            type: 'restaurant',
            restaurantId: action.restaurantId,
            restaurantName: action.restaurantName,
          });
          return;
        case 'entityDesire':
          dispatchLaunchIntent({
            type: 'entity',
            entityId: action.entityId,
            entityType: action.entityType,
            submittedLabel: action.label,
          });
          return;
        case 'listWorld':
          dispatchLaunchIntent({
            type: 'favorites',
            listId: action.listId,
            listType: action.listType,
            submittedLabel: action.label,
          });
          return;
        case 'pushScene':
          pushRoute(action.scene, action.params);
          return;
      }
    },
    [dispatchLaunchIntent, pushRoute]
  );
};
