import type { ProfilerOnRenderCallback } from 'react';

export type SearchMapRenderStateSnapshot = {
  isInitialCameraReady: boolean;
  onProfilerRender: ProfilerOnRenderCallback | null;
};
