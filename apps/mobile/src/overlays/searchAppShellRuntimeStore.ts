import { create } from 'zustand';
import type React from 'react';

import type {
  SearchAppShellModalModel,
  SearchAppShellOverlayModel,
} from '../screens/Search/runtime/shared/search-app-shell-render-contract';

type SearchAppShellRuntimeState = {
  isVisible: boolean;
  version: number;
  publishSearchAppShellRuntimeState: (nextState: {
    isVisible: boolean;
    overlayRenderSurfaceModel: SearchAppShellOverlayModel | null;
    modalSheetRenderSurfaceModel: SearchAppShellModalModel | null;
    profilerRenderCallback: React.ProfilerOnRenderCallback | null;
  }) => void;
  clearSearchAppShellRuntimeState: () => void;
};

type PublishedSearchAppShellRuntimeModels = {
  overlayRenderSurfaceModel: SearchAppShellOverlayModel | null;
  modalSheetRenderSurfaceModel: SearchAppShellModalModel | null;
  profilerRenderCallback: React.ProfilerOnRenderCallback | null;
};

const publishedSearchAppShellRuntimeModels: PublishedSearchAppShellRuntimeModels = {
  overlayRenderSurfaceModel: null,
  modalSheetRenderSurfaceModel: null,
  profilerRenderCallback: null,
};

const isSearchAppShellRuntimeStateEqual = (
  state: Pick<SearchAppShellRuntimeState, 'isVisible' | 'version'>,
  nextState: Pick<SearchAppShellRuntimeState, 'isVisible' | 'version'>
): boolean => state.isVisible === nextState.isVisible && state.version === nextState.version;

const arePublishedModelsEqual = (nextState: PublishedSearchAppShellRuntimeModels): boolean =>
  publishedSearchAppShellRuntimeModels.overlayRenderSurfaceModel ===
    nextState.overlayRenderSurfaceModel &&
  publishedSearchAppShellRuntimeModels.modalSheetRenderSurfaceModel ===
    nextState.modalSheetRenderSurfaceModel &&
  publishedSearchAppShellRuntimeModels.profilerRenderCallback === nextState.profilerRenderCallback;

export const getPublishedSearchAppShellRuntimeModels = (): PublishedSearchAppShellRuntimeModels =>
  publishedSearchAppShellRuntimeModels;

export const useSearchAppShellRuntimeStore = create<SearchAppShellRuntimeState>((set) => ({
  isVisible: false,
  version: 0,
  publishSearchAppShellRuntimeState: (nextState) =>
    set((state) => {
      const nextModels = {
        overlayRenderSurfaceModel: nextState.overlayRenderSurfaceModel,
        modalSheetRenderSurfaceModel: nextState.modalSheetRenderSurfaceModel,
        profilerRenderCallback: nextState.profilerRenderCallback,
      };
      const didModelsChange = !arePublishedModelsEqual(nextModels);

      if (didModelsChange) {
        publishedSearchAppShellRuntimeModels.overlayRenderSurfaceModel =
          nextModels.overlayRenderSurfaceModel;
        publishedSearchAppShellRuntimeModels.modalSheetRenderSurfaceModel =
          nextModels.modalSheetRenderSurfaceModel;
        publishedSearchAppShellRuntimeModels.profilerRenderCallback =
          nextModels.profilerRenderCallback;
      }

      const nextStoreState = {
        isVisible: nextState.isVisible,
        version: didModelsChange ? state.version + 1 : state.version,
      };

      return isSearchAppShellRuntimeStateEqual(state, nextStoreState)
        ? state
        : {
            ...state,
            ...nextStoreState,
          };
    }),
  clearSearchAppShellRuntimeState: () =>
    set((state) => {
      const didModelsChange =
        publishedSearchAppShellRuntimeModels.overlayRenderSurfaceModel != null ||
        publishedSearchAppShellRuntimeModels.modalSheetRenderSurfaceModel != null ||
        publishedSearchAppShellRuntimeModels.profilerRenderCallback != null;

      if (didModelsChange) {
        publishedSearchAppShellRuntimeModels.overlayRenderSurfaceModel = null;
        publishedSearchAppShellRuntimeModels.modalSheetRenderSurfaceModel = null;
        publishedSearchAppShellRuntimeModels.profilerRenderCallback = null;
      }

      const clearedState = {
        isVisible: false,
        version: didModelsChange ? state.version + 1 : state.version,
      };

      return isSearchAppShellRuntimeStateEqual(state, clearedState)
        ? state
        : {
            ...state,
            ...clearedState,
          };
    }),
}));
