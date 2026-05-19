import React from 'react';

import type { SearchRootProfileBridgeAuthorityRuntime } from './search-root-control-ports-runtime-contract';

export const useSearchRootProfileBridgeAuthorityRuntime =
  (): SearchRootProfileBridgeAuthorityRuntime => {
    const profilePresentationActiveRef = React.useRef(false);
    const closeRestaurantProfileRef = React.useRef<
      (options?: { dismissBehavior?: 'restore' | 'clear'; clearSearchOnDismiss?: boolean }) => void
    >(() => {});
    const prepareRestaurantProfileForTerminalSearchDismissRef = React.useRef<() => void>(() => {});
    const clearRestaurantProfileForSearchDismissRef = React.useRef<() => void>(() => {});
    const resetRestaurantProfileFocusSessionRef = React.useRef<() => void>(() => {});
    const cancelToggleInteractionRef = React.useRef<() => void>(() => {});

    const profileBridge = React.useMemo(
      () => ({
        profilePresentationActiveRef,
        closeRestaurantProfileRef,
        prepareRestaurantProfileForTerminalSearchDismissRef,
        clearRestaurantProfileForSearchDismissRef,
        resetRestaurantProfileFocusSessionRef,
        cancelToggleInteractionRef,
      }),
      []
    );

    return React.useMemo(
      () => ({
        profileBridge,
      }),
      [profileBridge]
    );
  };
