export type BottomSheetSnapPoint = 'expanded' | 'middle' | 'collapsed';

export type BottomSheetSnap = BottomSheetSnapPoint | 'hidden';

export type BottomSheetSnapPoints = Record<BottomSheetSnapPoint, number> & {
  hidden?: number;
};

export type SnapPoints = BottomSheetSnapPoints;

export type BottomSheetSnapChangeSource = 'gesture' | 'programmatic';

export type BottomSheetSnapChangeMeta = {
  source: BottomSheetSnapChangeSource;
};

export type BottomSheetMotionCommand = {
  snapTo: BottomSheetSnap;
  token: number;
  settleToken?: number | null;
  velocity?: number;
  mode?: 'spring' | 'instant';
  /**
   * Atomic shell+target commit: the TARGET scene's authoritative snap points, resolved by the
   * motion dispatcher from the scene-descriptor authority at dispatch time. When present, the
   * snap execution runtime resolves `snapTo` against THESE values instead of the shared runtime
   * config — which during a scene switch still holds the OUTGOING scene's shell (the config
   * sync follows the frame flip ~50ms after the motion dispatch). Without this, an openChild
   * `snapTo` executes against the old scene's snap set and the sheet lands on the wrong y
   * (e.g. the settings full-snap sheet stuck at the profile top). Absent for commands outside
   * a scene switch: the live config is already correct there.
   */
  snapPoints?: BottomSheetSnapPoints;
};
