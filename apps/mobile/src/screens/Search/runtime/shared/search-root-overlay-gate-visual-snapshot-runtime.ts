import type { SearchOverlayHostGateSnapshot } from './search-overlay-host-gate-snapshot-contract';

export const areSearchOverlayHostGateSnapshotsEqual = (
  left: SearchOverlayHostGateSnapshot,
  right: SearchOverlayHostGateSnapshot
): boolean =>
  left.isFocused === right.isFocused &&
  left.statusBarFadeHeight === right.statusBarFadeHeight &&
  left.onProfilerRender === right.onProfilerRender;

export const createSearchOverlayHostGateSnapshot = ({
  isFocused,
  statusBarFadeHeight,
  onProfilerRender,
}: SearchOverlayHostGateSnapshot): SearchOverlayHostGateSnapshot => ({
  isFocused,
  statusBarFadeHeight,
  onProfilerRender,
});
