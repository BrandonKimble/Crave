import React from 'react';

import { useKeyedCallback } from '../../../hooks/useCallbackFactory';
import type { FavoriteListType } from '../../../types';

/**
 * State shape for the save sheet overlay
 */
type SaveSheetState = {
  visible: boolean;
  listType: FavoriteListType;
  target: { restaurantId?: string; connectionId?: string } | null;
};

const INITIAL_SAVE_SHEET_STATE: SaveSheetState = {
  visible: false,
  listType: 'restaurant',
  target: null,
};

/**
 * Return type of the useSaveSheetState hook
 */
type UseSaveSheetStateResult = {
  /** Current save sheet state */
  saveSheetState: SaveSheetState;

  /** Direct state setter */
  setSaveSheetState: React.Dispatch<React.SetStateAction<SaveSheetState>>;

  /** Factory that returns a stable callback for opening save sheet for a dish */
  getDishSaveHandler: (connectionId: string) => () => void;

  /** Factory that returns a stable callback for opening save sheet for a restaurant */
  getRestaurantSaveHandler: (restaurantId: string) => () => void;

  /** Direct callback for opening save sheet for a restaurant (for profile overlay) */
  handleRestaurantSavePress: (restaurantId: string) => void;

  /** Close the save sheet */
  handleCloseSaveSheet: () => void;

  /** Suspend save sheet (hide and store state for later restoration) */
  suspendSaveSheet: () => void;

  /** Restore previously suspended save sheet state */
  restoreSaveSheet: () => void;

  /** Whether the save sheet is currently visible */
  showSaveListOverlay: boolean;
};

/**
 * Hook that manages save sheet state including:
 * - Opening/closing the sheet
 * - Factory callbacks for list items (stable references)
 * - Suspension/restoration when opening restaurant profile
 *
 * This hook extracts save sheet state management from the main Search component
 * to reduce complexity and improve maintainability.
 *
 * @example
 * ```tsx
 * const {
 *   saveSheetState,
 *   getDishSaveHandler,
 *   getRestaurantSaveHandler,
 *   handleCloseSaveSheet,
 *   showSaveListOverlay,
 * } = useSaveSheetState();
 *
 * // In list item render
 * <DishResultCard onSavePress={getDishSaveHandler(item.connectionId)} />
 * ```
 */
function useSaveSheetState(): UseSaveSheetStateResult {
  const [saveSheetState, setSaveSheetState] =
    React.useState<SaveSheetState>(INITIAL_SAVE_SHEET_STATE);

  // Ref to store suspended state during profile view
  const previousSaveSheetStateRef = React.useRef<SaveSheetState | null>(null);

  // Factory callbacks for list items - these return stable references
  const getDishSaveHandler = useKeyedCallback(
    (connectionId: string) =>
      setSaveSheetState({
        visible: true,
        listType: 'dish',
        target: { connectionId },
      }),
    []
  );

  const getRestaurantSaveHandler = useKeyedCallback(
    (restaurantId: string) =>
      setSaveSheetState({
        visible: true,
        listType: 'restaurant',
        target: { restaurantId },
      }),
    []
  );

  // Direct callback for restaurant profile overlay
  const handleRestaurantSavePress = React.useCallback((restaurantId: string) => {
    setSaveSheetState({
      visible: true,
      listType: 'restaurant',
      target: { restaurantId },
    });
  }, []);

  const handleCloseSaveSheet = React.useCallback(() => {
    setSaveSheetState((prev) => ({ ...prev, visible: false, target: null }));
  }, []);

  // Suspend: hide save sheet and store state for restoration
  const suspendSaveSheet = React.useCallback(() => {
    if (saveSheetState.visible && !previousSaveSheetStateRef.current) {
      previousSaveSheetStateRef.current = saveSheetState;
      setSaveSheetState((prev) => ({ ...prev, visible: false }));
    }
  }, [saveSheetState]);

  // Restore: bring back previously suspended save sheet state
  const restoreSaveSheet = React.useCallback(() => {
    if (previousSaveSheetStateRef.current?.visible) {
      setSaveSheetState(previousSaveSheetStateRef.current);
    }
    previousSaveSheetStateRef.current = null;
  }, []);

  const showSaveListOverlay = saveSheetState.visible;

  return {
    saveSheetState,
    setSaveSheetState,
    getDishSaveHandler,
    getRestaurantSaveHandler,
    handleRestaurantSavePress,
    handleCloseSaveSheet,
    suspendSaveSheet,
    restoreSaveSheet,
    showSaveListOverlay,
  };
}

export {
  useSaveSheetState,
  type SaveSheetState,
  type UseSaveSheetStateResult,
};
