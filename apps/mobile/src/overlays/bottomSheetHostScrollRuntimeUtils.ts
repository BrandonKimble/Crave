const TOP_EPSILON = 2;

export const getBottomSheetScrollTopOffset = (contentInsetTop?: number): number => {
  'worklet';
  if (typeof contentInsetTop !== 'number' || !Number.isFinite(contentInsetTop)) {
    return 0;
  }
  return -contentInsetTop;
};

export const isBottomSheetScrollAtTop = (offsetY: number, scrollTopOffset: number): boolean => {
  'worklet';
  return offsetY <= scrollTopOffset + TOP_EPSILON;
};
