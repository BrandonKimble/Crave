import type React from 'react';

import type { ResultsPresentationLog } from './results-presentation-runtime-contract';
import type { SearchRuntimeBus } from './search-runtime-bus';
import { useResultsPresentationOwnerBridgeRuntime } from './use-results-presentation-owner-bridge-runtime';
import type { RunOneHandoffCoordinator } from '../controller/run-one-handoff-coordinator';

type UseResultsPresentationOwnerBridgeStateRuntimeArgs = {
  activeTab: 'dishes' | 'restaurants';
  setActiveTab: (next: 'dishes' | 'restaurants') => void;
  setActiveTabPreference: (next: 'dishes' | 'restaurants') => void;
  isSearchSessionActive: boolean;
  searchRuntimeBus: SearchRuntimeBus;
  log: ResultsPresentationLog;
  runOneHandoffCoordinatorRef: React.MutableRefObject<RunOneHandoffCoordinator>;
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
  log,
  runOneHandoffCoordinatorRef,
  emitRuntimeMechanismEvent,
}: UseResultsPresentationOwnerBridgeStateRuntimeArgs): ResultsPresentationOwnerBridgeStateRuntime =>
  useResultsPresentationOwnerBridgeRuntime({
    activeTab,
    setActiveTab,
    setActiveTabPreference,
    isSearchSessionActive,
    searchRuntimeBus,
    log,
    runOneHandoffCoordinatorRef,
    emitRuntimeMechanismEvent,
  });
