import type {
  SearchRouteOverlayCommandActions,
  SearchRouteOverlayCommandState,
} from './searchRouteOverlayCommandRuntimeContract';
import type { SearchRouteHostVisualState } from './searchRouteHostVisualState';
import { useSaveListPanelSpec } from './panels/SaveListPanel';
import { EMPTY_SEARCH_ROUTE_VISUAL_STATE } from './searchResolvedRouteHostModelContract';
import type { OverlayContentSpec } from './types';

type UseSearchRouteSaveListPanelSpecArgs = {
  publishedVisualState: SearchRouteHostVisualState | null;
  commandState: SearchRouteOverlayCommandState;
  commandActions: SearchRouteOverlayCommandActions;
};

export const useSearchRouteSaveListPanelSpec = ({
  publishedVisualState,
  commandState,
  commandActions,
}: UseSearchRouteSaveListPanelSpecArgs): OverlayContentSpec<unknown> | null => {
  const visualState = publishedVisualState ?? EMPTY_SEARCH_ROUTE_VISUAL_STATE;
  const { saveSheetState } = commandState;
  const { setSaveSheetState, setSaveSheetSnap } = commandActions;

  const saveListPanelSpec = useSaveListPanelSpec({
    visible: saveSheetState.visible,
    listType: saveSheetState.listType,
    target: saveSheetState.target,
    searchBarTop: visualState.searchBarTop,
    onClose: () => {
      setSaveSheetState((prev) => ({ ...prev, visible: false, target: null }));
    },
    onSnapChange: setSaveSheetSnap,
  });

  return saveListPanelSpec;
};
