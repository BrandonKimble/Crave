import type {
  SearchRouteOverlayCommandActions,
  SearchRouteOverlayCommandState,
} from './searchRouteOverlayCommandRuntimeContract';
import {
  coerceSearchRouteSceneDefinition,
  type SearchRouteSceneDefinition,
} from './searchOverlayRouteHostContract';
import type { SearchRouteHostVisualState } from './searchRouteHostVisualState';
import { useSaveListPanelSpec } from './panels/SaveListPanel';
import { EMPTY_SEARCH_ROUTE_VISUAL_STATE } from './searchResolvedRouteHostModelContract';

type UseSearchRouteSaveListPanelSpecArgs = {
  publishedVisualState: SearchRouteHostVisualState | null;
  saveSheetState: SearchRouteOverlayCommandState['saveSheetState'];
  setSaveSheetState: SearchRouteOverlayCommandActions['setSaveSheetState'];
  setSaveSheetSnap: SearchRouteOverlayCommandActions['setSaveSheetSnap'];
};

export const useSearchRouteSaveListPanelSpec = ({
  publishedVisualState,
  saveSheetState,
  setSaveSheetState,
  setSaveSheetSnap,
}: UseSearchRouteSaveListPanelSpecArgs): SearchRouteSceneDefinition | null => {
  const visualState = publishedVisualState ?? EMPTY_SEARCH_ROUTE_VISUAL_STATE;

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

  return coerceSearchRouteSceneDefinition(saveListPanelSpec);
};
