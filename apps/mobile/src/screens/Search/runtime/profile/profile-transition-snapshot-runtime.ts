import type {
  CameraSnapshot,
  ProfileTransitionSnapshotCapture,
} from './profile-transition-state-contract';

type OverlaySheetSnap = 'expanded' | 'middle' | 'collapsed' | 'hidden';

export const resolveProfileTransitionSnapshotCapture = ({
  sheetTranslateY,
  snapPoints,
  sheetState,
  lastVisibleSheetSnap,
  cameraSnapshot,
  resultsScrollOffset,
}: {
  sheetTranslateY: number;
  snapPoints: {
    expanded: number;
    middle: number;
    collapsed: number;
  };
  sheetState: OverlaySheetSnap;
  lastVisibleSheetSnap: Exclude<OverlaySheetSnap, 'hidden'>;
  cameraSnapshot: CameraSnapshot | null;
  resultsScrollOffset: number;
}): ProfileTransitionSnapshotCapture => {
  const captureCurrentResultsSheetSnap = (): Exclude<OverlaySheetSnap, 'hidden'> => {
    if (typeof sheetTranslateY === 'number' && Number.isFinite(sheetTranslateY)) {
      const candidates: Array<Exclude<OverlaySheetSnap, 'hidden'>> = [
        'expanded',
        'middle',
        'collapsed',
      ];
      let bestSnap: Exclude<OverlaySheetSnap, 'hidden'> = lastVisibleSheetSnap;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const candidate of candidates) {
        const targetY = snapPoints[candidate];
        const distance = Math.abs(sheetTranslateY - targetY);
        if (distance < bestDistance) {
          bestSnap = candidate;
          bestDistance = distance;
        }
      }
      return bestSnap;
    }
    if (sheetState !== 'hidden') {
      return sheetState;
    }
    return lastVisibleSheetSnap;
  };

  return {
    savedSheetSnap: captureCurrentResultsSheetSnap(),
    savedCamera: cameraSnapshot,
    savedResultsScrollOffset: resultsScrollOffset,
  };
};
