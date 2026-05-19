import type React from 'react';

import type { ResultsPresentationLog } from './results-presentation-runtime-contract';
import type { ResultsPresentationAuthority } from './results-presentation-authority';
import type { ResultsPresentationSurfaceAuthority } from './results-presentation-surface-authority';
import type { SearchMapSourceFramePort } from '../map/search-map-source-frame-port';
import type { SearchRuntimeBus } from './search-runtime-bus';
import { useResultsPresentationOwnerBridgeRuntime } from './use-results-presentation-owner-bridge-runtime';
import type { SearchSurfaceRedrawCoordinator } from '../controller/search-surface-redraw-coordinator';

type UseResultsPresentationOwnerBridgeStateRuntimeArgs = {
  activeTab: 'dishes' | 'restaurants';
  setActiveTab: (next: 'dishes' | 'restaurants') => void;
  setActiveTabPreference: (next: 'dishes' | 'restaurants') => void;
  isSearchSessionActive: boolean;
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationAuthority: ResultsPresentationAuthority;
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
  searchMapSourceFramePort: SearchMapSourceFramePort;
  log: ResultsPresentationLog;
  searchSurfaceRedrawCoordinatorRef: React.MutableRefObject<SearchSurfaceRedrawCoordinator>;
  emitRuntimeMechanismEvent: (event: string, payload: Record<string, unknown>) => void;
};

export type ResultsPresentationOwnerBridgeStateRuntime = ReturnType<
  typeof useResultsPresentationOwnerBridgeRuntime
>;

export const useResultsPresentationOwnerBridgeStateRuntime = ({
  activeTab,
  setActiveTab,
  setActiveTabPreference,
  isSearchSessionActive,
  searchRuntimeBus,
  resultsPresentationAuthority,
  resultsPresentationSurfaceAuthority,
  searchMapSourceFramePort,
  log,
  searchSurfaceRedrawCoordinatorRef,
  emitRuntimeMechanismEvent,
}: UseResultsPresentationOwnerBridgeStateRuntimeArgs): ResultsPresentationOwnerBridgeStateRuntime =>
  useResultsPresentationOwnerBridgeRuntime({
    activeTab,
    setActiveTab,
    setActiveTabPreference,
    isSearchSessionActive,
    searchRuntimeBus,
    resultsPresentationAuthority,
    resultsPresentationSurfaceAuthority,
    searchMapSourceFramePort,
    log,
    searchSurfaceRedrawCoordinatorRef,
    emitRuntimeMechanismEvent,
  });
