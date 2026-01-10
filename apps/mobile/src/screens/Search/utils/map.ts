const MARKER_Z_INDEX_BASE = 10000;

export const getMarkerZIndex = (rank: unknown): number => {
  if (typeof rank !== 'number' || !Number.isFinite(rank) || rank <= 0) {
    return 0;
  }
  return Math.max(0, MARKER_Z_INDEX_BASE - Math.round(rank));
};
