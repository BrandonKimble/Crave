import type { SearchRouteSceneStackFrameEntry } from '../../overlays/searchRouteSceneStackSheetContract';
import type {
  SearchRouteOverlayRouteScope,
  SearchRouteOverlaySheetPolicy,
} from '../../overlays/searchRouteOverlayRuntimeContract';
import type {
  BottomSheetProgrammaticRuntimeModel,
  BottomSheetRuntimeModel,
} from '../../overlays/useBottomSheetRuntime';

export type SearchRouteSheetFrameHostInput = {
  activeSemanticOverlayKey: SearchRouteOverlayRouteScope['activeOverlayRouteKey'] | null;
  overlaySheetPolicy: SearchRouteOverlaySheetPolicy | null;
  expandedSnapPoint: number;
  middleSnapPoint: number;
  collapsedSnapPoint: number;
  sheetY: BottomSheetRuntimeModel['presentationState']['sheetY'] | null;
};

export type SearchRouteSheetMotionPersistenceInput = {
  activeShellSpec: NonNullable<
    SearchRouteSceneStackFrameEntry['shellSpec']
  > | null;
  resolvedShellIdentityKey: string;
  activeSemanticOverlayKey: SearchRouteOverlayRouteScope['activeOverlayRouteKey'];
  rootOverlayKey: SearchRouteOverlayRouteScope['rootOverlayKey'];
  overlayRouteStackLength: SearchRouteOverlayRouteScope['overlayRouteStackLength'];
};

export type SearchRouteSheetMotionCallbacksInput = {
  activeShellSpec: NonNullable<
    SearchRouteSceneStackFrameEntry['shellSpec']
  > | null;
  visible: boolean;
  resolvedRuntimeModel:
    | BottomSheetRuntimeModel
    | BottomSheetProgrammaticRuntimeModel
    | null;
  motionPersistenceInput: SearchRouteSheetMotionPersistenceInput;
  handleDragStateChange: ((isDragging: boolean) => void) | undefined;
  handleSettleStateChange: ((isSettling: boolean) => void) | undefined;
};
