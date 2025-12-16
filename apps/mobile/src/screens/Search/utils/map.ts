export const getMarkerZIndex = (rank: unknown, total: number): number => {
  if (typeof rank !== 'number' || !Number.isFinite(rank) || rank <= 0) {
    return 0;
  }
  return Math.max(0, total - rank + 1);
};
