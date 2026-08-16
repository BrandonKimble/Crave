import type {
  ProfileCloseActionModel,
  ProfileRefreshSelectionActionModel,
} from './profile-action-model-contract';
import type {
  ProfileActionExecutionPorts,
  ProfileAutoOpenActionExecutionPorts,
  ProfileRefreshSelectionExecutionPorts,
} from './profile-action-runtime-port-contract';
import { resolveProfileAutoOpenAction } from './profile-auto-open-action-runtime';

export const executeProfileCloseAction = ({
  actionModel: { hasPanelSnapshot, transitionStatus, currentRestaurantId, options },
  ports,
}: {
  actionModel: ProfileCloseActionModel;
  ports: ProfileActionExecutionPorts;
}): void => {
  ports.setMapHighlightedRestaurantId(null);
  if (options?.dismissBehavior) {
    ports.setDismissBehavior(options.dismissBehavior);
  }
  if (options?.clearSearchOnDismiss !== undefined) {
    ports.setShouldClearSearchOnDismiss(options.clearSearchOnDismiss);
  }
  // F1058: a `transitionStatus === 'closing'` early-out USED to sit here, skipping
  // prepareForProfileClose(). It was unreachable: 'opening' and 'closing' have had no
  // writer since the L3 machine deletion — the ONLY non-idle write repo-wide is
  // profile-direct-presentation-runtime.ts:60 `setProfileTransitionStatus('open')`, and the
  // only other writer is resetProfileTransitionState (→ 'idle'). So the hydration-commit
  // preparation ALWAYS ran; the code merely claimed otherwise. (Same rot the RT-2 note at
  // profile-owner-presentation-view-runtime.ts:31-35 already caught once for
  // isTransitionAnimating.) The `ProfileTransitionStatus` union is now NARROWED to
  // 'idle' | 'open' (F9430, done 2026-08-07) — the phantom 'opening'/'closing' states
  // are unrepresentable, so a stray write can no longer slip past this === 'idle' gate.
  if (!hasPanelSnapshot && transitionStatus === 'idle') {
    return;
  }
  ports.prepareForProfileClose();
  ports.closePreparedProfilePresentation(currentRestaurantId);
};

export const executeProfileRefreshSelectionAction = ({
  actionModel: { restaurant, queryLabel },
  ports,
}: {
  actionModel: ProfileRefreshSelectionActionModel;
  ports: ProfileRefreshSelectionExecutionPorts;
}): void => {
  ports.setMapHighlightedRestaurantId(restaurant.placeId);
  ports.seedRestaurantProfile(restaurant, queryLabel);
  ports.focusRestaurantProfileCamera(restaurant, 'autocomplete');
  ports.hydrateRestaurantProfileById(restaurant.placeId);
};

export const executeProfileAutoOpenAction = ({
  actionModel,
  ports,
}: {
  actionModel: Parameters<typeof resolveProfileAutoOpenAction>[0]['actionModel'];
  ports: ProfileAutoOpenActionExecutionPorts;
}): void => {
  executeResolvedProfileAutoOpenAction({
    action: resolveProfileAutoOpenAction({
      actionModel,
    }),
    ports,
  });
};

export const executeResolvedProfileAutoOpenAction = ({
  action,
  ports,
}: {
  action: ReturnType<typeof resolveProfileAutoOpenAction>;
  ports: ProfileAutoOpenActionExecutionPorts;
}): void => {
  if (action.kind === 'none') {
    return;
  }
  if (action.kind === 'clear_pending_selection') {
    ports.clearPendingSelection();
    return;
  }
  ports.clearPendingSelection();
  if (action.kind === 'refresh') {
    ports.refreshOpenRestaurantProfileSelection(action.restaurant, action.queryLabel);
    ports.setLastAutoOpenKey(action.nextAutoOpenKey);
    return;
  }
  ports.openRestaurantProfile(action.restaurant, {
    source: action.source,
  });
  ports.setLastAutoOpenKey(action.nextAutoOpenKey);
};
