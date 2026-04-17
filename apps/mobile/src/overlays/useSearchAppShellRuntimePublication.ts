import React from 'react';

import type {
  SearchAppShellModalModel,
  SearchAppShellOverlayModel,
} from '../screens/Search/runtime/shared/search-app-shell-render-contract';
import { useSearchAppShellRuntimeStore } from './searchAppShellRuntimeStore';

type UseSearchAppShellRuntimePublicationArgs = {
  isVisible: boolean;
  overlayRenderSurfaceModel: SearchAppShellOverlayModel | null;
  modalSheetRenderSurfaceModel: SearchAppShellModalModel | null;
  profilerRenderCallback: React.ProfilerOnRenderCallback | null;
};

export const useSearchAppShellRuntimePublication = ({
  isVisible,
  overlayRenderSurfaceModel,
  modalSheetRenderSurfaceModel,
  profilerRenderCallback,
}: UseSearchAppShellRuntimePublicationArgs): void => {
  const publishSearchAppShellRuntimeState = useSearchAppShellRuntimeStore(
    (state) => state.publishSearchAppShellRuntimeState
  );
  const clearSearchAppShellRuntimeState = useSearchAppShellRuntimeStore(
    (state) => state.clearSearchAppShellRuntimeState
  );

  React.useEffect(() => {
    publishSearchAppShellRuntimeState({
      isVisible,
      overlayRenderSurfaceModel,
      modalSheetRenderSurfaceModel,
      profilerRenderCallback,
    });
  }, [
    clearSearchAppShellRuntimeState,
    isVisible,
    modalSheetRenderSurfaceModel,
    overlayRenderSurfaceModel,
    profilerRenderCallback,
    publishSearchAppShellRuntimeState,
  ]);

  React.useEffect(
    () => () => {
      clearSearchAppShellRuntimeState();
    },
    [clearSearchAppShellRuntimeState]
  );
};
