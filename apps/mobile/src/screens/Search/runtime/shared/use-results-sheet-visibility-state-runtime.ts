import React from 'react';

import type { SheetPosition } from '../../../../overlays/sheetUtils';
import type { ResultsSheetRuntimeOwner } from './results-sheet-runtime-contract';

type UseResultsSheetVisibilityStateRuntimeArgs = {
  isSearchOverlay: boolean;
  initialResultsSheetPosition: SheetPosition;
  initialResultsPanelVisible: boolean;
};

export type ResultsSheetVisibilityStateRuntime = Pick<
  ResultsSheetRuntimeOwner,
  | 'panelVisible'
  | 'sheetState'
  | 'shouldRenderResultsSheet'
  | 'shouldRenderResultsSheetRef'
  | 'handleSheetSnapChange'
> & {
  panelVisibleRef: React.MutableRefObject<boolean>;
  sheetStateRef: React.MutableRefObject<SheetPosition>;
  setPanelVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setSheetState: React.Dispatch<React.SetStateAction<SheetPosition>>;
};

export const useResultsSheetVisibilityStateRuntime = ({
  isSearchOverlay,
  initialResultsSheetPosition,
  initialResultsPanelVisible,
}: UseResultsSheetVisibilityStateRuntimeArgs): ResultsSheetVisibilityStateRuntime => {
  const [panelVisible, setPanelVisible] = React.useState(initialResultsPanelVisible);
  const [sheetState, setSheetState] = React.useState<SheetPosition>(initialResultsSheetPosition);
  const panelVisibleRef = React.useRef(initialResultsPanelVisible);
  const sheetStateRef = React.useRef<SheetPosition>(initialResultsSheetPosition);

  const shouldRenderResultsSheet = isSearchOverlay && (panelVisible || sheetState !== 'hidden');
  const shouldRenderResultsSheetRef = React.useRef(shouldRenderResultsSheet);

  panelVisibleRef.current = panelVisible;
  sheetStateRef.current = sheetState;
  shouldRenderResultsSheetRef.current = shouldRenderResultsSheet;

  const handleSheetSnapChange = React.useCallback((nextSnap: SheetPosition | 'hidden') => {
    const nextState: SheetPosition = nextSnap === 'hidden' ? 'hidden' : nextSnap;
    sheetStateRef.current = nextState;
    panelVisibleRef.current = nextSnap !== 'hidden';
    setSheetState(nextState);
    setPanelVisible(nextSnap !== 'hidden');
  }, []);

  return React.useMemo(
    () => ({
      panelVisible,
      sheetState,
      shouldRenderResultsSheet,
      shouldRenderResultsSheetRef,
      handleSheetSnapChange,
      panelVisibleRef,
      sheetStateRef,
      setPanelVisible,
      setSheetState,
    }),
    [handleSheetSnapChange, panelVisible, sheetState, shouldRenderResultsSheet]
  );
};
