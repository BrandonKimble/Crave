import React from 'react';

import type { SearchRootForegroundInputRuntime } from './search-root-control-ports-runtime-contract';
import type {
  FilterModalRuntime,
  ForegroundInteractionRuntime,
  SearchRootFilterModalControlLane,
  SearchRootForegroundInputControlLane,
  SearchRootForegroundInteractionControlLane,
  SearchRootViewportShortcutControlLane,
  SubmitRuntimeResult,
} from './use-search-root-control-plane-runtime-contract';

export const useSearchRootFilterModalControlLane = (
  filterModalRuntime: FilterModalRuntime
): SearchRootFilterModalControlLane =>
  React.useMemo(
    () => ({
      filterModalRuntime,
    }),
    [filterModalRuntime]
  );

export const useSearchRootForegroundInteractionControlLane = (
  foregroundInteractionRuntime: ForegroundInteractionRuntime
): SearchRootForegroundInteractionControlLane =>
  React.useMemo(
    () => ({
      foregroundInteractionRuntime,
    }),
    [foregroundInteractionRuntime]
  );

export const useSearchRootForegroundInputControlLane = (
  foregroundInputRuntime: SearchRootForegroundInputRuntime
): SearchRootForegroundInputControlLane =>
  React.useMemo(
    () => ({
      foregroundInputRuntime,
    }),
    [foregroundInputRuntime]
  );

export const useSearchRootViewportShortcutControlLane = (
  submitViewportShortcut: SubmitRuntimeResult['submitViewportShortcut']
): SearchRootViewportShortcutControlLane =>
  React.useMemo(
    () => ({
      submitViewportShortcut,
    }),
    [submitViewportShortcut]
  );
