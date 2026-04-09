export type BottomSheetSnapPoint = 'expanded' | 'middle' | 'collapsed';

export type BottomSheetSnap = BottomSheetSnapPoint | 'hidden';

export type BottomSheetSnapPoints = Record<BottomSheetSnapPoint, number> & {
  hidden?: number;
};

export type BottomSheetSnapChangeSource = 'gesture' | 'programmatic';

export type BottomSheetSnapChangeMeta = {
  source: BottomSheetSnapChangeSource;
};

export type BottomSheetMotionCommand = {
  snapTo: BottomSheetSnap;
  token: number;
  velocity?: number;
};
