import type { ResultsPresentationLog } from './results-presentation-runtime-contract';
import type { ResultsPresentationAuthority } from './results-presentation-authority';
import type { ResultsPresentationSurfaceAuthority } from './results-presentation-surface-authority';
import type { SearchMapSourceFramePort } from '../map/search-map-source-frame-port';
import type { SearchRuntimeBus } from './search-runtime-bus';
import { useResultsPresentationOwnerBridgeRuntime } from './use-results-presentation-owner-bridge-runtime';

type UseResultsPresentationOwnerBridgeStateRuntimeArgs = {
  setActiveTab: (next: 'dishes' | 'restaurants') => void;
  setActiveTabPreference: (next: 'dishes' | 'restaurants') => void;
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationAuthority: ResultsPresentationAuthority;
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
  searchMapSourceFramePort: SearchMapSourceFramePort;
  log: ResultsPresentationLog;
};

export type ResultsPresentationOwnerBridgeStateRuntime = ReturnType<
  typeof useResultsPresentationOwnerBridgeRuntime
>;

export const useResultsPresentationOwnerBridgeStateRuntime = ({
  setActiveTab,
  setActiveTabPreference,
  searchRuntimeBus,
  resultsPresentationAuthority,
  resultsPresentationSurfaceAuthority,
  searchMapSourceFramePort,
  log,
}: UseResultsPresentationOwnerBridgeStateRuntimeArgs): ResultsPresentationOwnerBridgeStateRuntime =>
  useResultsPresentationOwnerBridgeRuntime({
    setActiveTab,
    setActiveTabPreference,
    searchRuntimeBus,
    resultsPresentationAuthority,
    resultsPresentationSurfaceAuthority,
    searchMapSourceFramePort,
    log,
  });
