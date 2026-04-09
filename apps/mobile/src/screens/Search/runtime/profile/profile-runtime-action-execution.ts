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
  if (!hasPanelSnapshot && transitionStatus === 'idle') {
    return;
  }
  if (options?.dismissBehavior) {
    ports.setDismissBehavior(options.dismissBehavior);
  }
  if (options?.clearSearchOnDismiss !== undefined) {
    ports.setShouldClearSearchOnDismiss(options.clearSearchOnDismiss);
  }
  ports.prepareForProfileClose();
  if (transitionStatus !== 'closing') {
    ports.closePreparedProfilePresentation(currentRestaurantId);
  }
};

export const executeProfileRefreshSelectionAction = ({
  actionModel: { restaurant, queryLabel },
  ports,
}: {
  actionModel: ProfileRefreshSelectionActionModel;
  ports: ProfileRefreshSelectionExecutionPorts;
}): void => {
  ports.seedRestaurantProfile(restaurant, queryLabel);
  ports.focusRestaurantProfileCamera(restaurant, 'autocomplete');
  ports.hydrateRestaurantProfileById(restaurant.restaurantId);
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
