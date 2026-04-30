import { useSnapshotAuthority } from './use-snapshot-authority';
import type { SearchMapRenderHostAuthority } from './search-root-host-authority-contract';
import type { useSearchRootMapHostPublicationSurfaceRuntime } from './use-search-root-map-host-publication-surface-runtime';

export const useSearchRootMapHostPublicationAuthorityRuntime = ({
  hostLayerRuntime,
}: {
  hostLayerRuntime: ReturnType<typeof useSearchRootMapHostPublicationSurfaceRuntime>;
}): SearchMapRenderHostAuthority =>
  useSnapshotAuthority(
    hostLayerRuntime,
    (left, right) =>
      left.isInitialCameraReady === right.isInitialCameraReady &&
      left.onProfilerRender === right.onProfilerRender &&
      left.markerEngineRef === right.markerEngineRef &&
      left.engineInputs === right.engineInputs &&
      left.hostConfig === right.hostConfig &&
      left.presentationProps === right.presentationProps
  );
