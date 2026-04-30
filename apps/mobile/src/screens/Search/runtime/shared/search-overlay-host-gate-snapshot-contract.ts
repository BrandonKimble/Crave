import type { ProfilerOnRenderCallback } from 'react';

export type SearchOverlayHostGateSnapshot = {
  isFocused: boolean;
  statusBarFadeHeight: number | null;
  onProfilerRender: ProfilerOnRenderCallback | null;
};
