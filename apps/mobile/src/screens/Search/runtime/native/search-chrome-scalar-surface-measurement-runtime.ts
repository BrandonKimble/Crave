import {
  SEARCH_CHROME_SCALAR_SURFACE_HOST_KEY,
  searchChromeScalarSurfaceRegistry,
  type SearchChromeScalarSurfaceControlId,
  type SearchChromeScalarSurfaceMeasuredFrame,
  type SearchChromeScalarSurfaceMeasuredFrameSnapshot,
} from './search-chrome-scalar-surface';

export type SearchChromeScalarSurfaceMeasuredFrameMap = Readonly<
  Partial<Record<SearchChromeScalarSurfaceControlId, SearchChromeScalarSurfaceMeasuredFrame>>
>;

export type SearchChromeScalarSurfaceMeasurementSnapshot = {
  hostKey: string;
  revision: number;
  frames: SearchChromeScalarSurfaceMeasuredFrame[];
  framesByControlId: SearchChromeScalarSurfaceMeasuredFrameMap;
};

export type SearchChromeScalarSurfaceMeasurementRuntime = {
  readonly hostKey: string;
  getSnapshot: () => SearchChromeScalarSurfaceMeasurementSnapshot;
  measureNow: () => Promise<SearchChromeScalarSurfaceMeasurementSnapshot>;
  clear: () => void;
};

const EMPTY_FRAMES: SearchChromeScalarSurfaceMeasuredFrame[] = [];
const EMPTY_FRAME_MAP: SearchChromeScalarSurfaceMeasuredFrameMap = {};

const createEmptySnapshot = (hostKey: string): SearchChromeScalarSurfaceMeasurementSnapshot => ({
  hostKey,
  revision: 0,
  frames: EMPTY_FRAMES,
  framesByControlId: EMPTY_FRAME_MAP,
});

const areFramesEqual = (
  left: SearchChromeScalarSurfaceMeasuredFrame,
  right: SearchChromeScalarSurfaceMeasuredFrame
): boolean =>
  left.controlId === right.controlId &&
  Math.abs(left.x - right.x) < 0.5 &&
  Math.abs(left.y - right.y) < 0.5 &&
  Math.abs(left.width - right.width) < 0.5 &&
  Math.abs(left.height - right.height) < 0.5;

const areFrameListsEqual = (
  left: SearchChromeScalarSurfaceMeasuredFrame[],
  right: SearchChromeScalarSurfaceMeasuredFrame[]
): boolean =>
  left.length === right.length &&
  left.every((leftFrame, index) => areFramesEqual(leftFrame, right[index]));

const normalizeFrames = (
  snapshot: SearchChromeScalarSurfaceMeasuredFrameSnapshot | null
): SearchChromeScalarSurfaceMeasuredFrame[] =>
  snapshot == null
    ? EMPTY_FRAMES
    : snapshot.frames
        .filter((frame) => frame.width > 0 && frame.height > 0)
        .slice()
        .sort((left, right) => left.controlId.localeCompare(right.controlId));

const buildFrameMap = (
  frames: SearchChromeScalarSurfaceMeasuredFrame[]
): SearchChromeScalarSurfaceMeasuredFrameMap => {
  if (frames.length === 0) {
    return EMPTY_FRAME_MAP;
  }

  const nextFrameMap: Partial<
    Record<SearchChromeScalarSurfaceControlId, SearchChromeScalarSurfaceMeasuredFrame>
  > = {};
  for (const frame of frames) {
    nextFrameMap[frame.controlId] = frame;
  }
  return nextFrameMap;
};

export const createSearchChromeScalarSurfaceMeasurementRuntime = (
  hostKey = SEARCH_CHROME_SCALAR_SURFACE_HOST_KEY
): SearchChromeScalarSurfaceMeasurementRuntime => {
  let snapshot = createEmptySnapshot(hostKey);

  const applyMeasuredSnapshot = (
    measuredSnapshot: SearchChromeScalarSurfaceMeasuredFrameSnapshot | null
  ): SearchChromeScalarSurfaceMeasurementSnapshot => {
    const nextFrames = normalizeFrames(measuredSnapshot);
    if (areFrameListsEqual(snapshot.frames, nextFrames)) {
      return snapshot;
    }

    snapshot = {
      hostKey,
      revision: snapshot.revision + 1,
      frames: nextFrames,
      framesByControlId: buildFrameMap(nextFrames),
    };
    return snapshot;
  };

  return {
    hostKey,
    getSnapshot: () => snapshot,
    measureNow: async () => {
      const measuredSnapshot =
        await searchChromeScalarSurfaceRegistry.measureRegisteredControls(hostKey);
      return applyMeasuredSnapshot(measuredSnapshot);
    },
    clear: () => {
      snapshot = createEmptySnapshot(hostKey);
    },
  };
};
