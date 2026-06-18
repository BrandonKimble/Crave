import type { LayoutRectangle } from 'react-native';

import { SEARCH_CONTAINER_PADDING_TOP } from '../../constants/search';

export const cloneSearchLayoutRectangle = (layout: LayoutRectangle): LayoutRectangle => ({
  x: layout.x,
  y: layout.y,
  width: layout.width,
  height: layout.height,
});

export const hasUsableSearchContainerHeight = (height: number): boolean =>
  height > SEARCH_CONTAINER_PADDING_TOP + 0.5;

export const hasUsableSearchHeaderHeight = (height: number): boolean => height > 0.5;

export const areSearchLayoutRectanglesClose = (
  left: LayoutRectangle,
  right: LayoutRectangle
): boolean =>
  Math.abs(left.x - right.x) < 0.5 &&
  Math.abs(left.y - right.y) < 0.5 &&
  Math.abs(left.width - right.width) < 0.5 &&
  Math.abs(left.height - right.height) < 0.5;
