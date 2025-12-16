import type { FoodResult } from '../../../types';
import { CARD_LINE_GAP } from '../constants/search';

export const calculateTopFoodVisibleCount = (
  items: FoodResult[],
  maxRender: number,
  availableWidth: number | undefined,
  itemWidths: Record<string, number> | undefined,
  moreWidths: Record<number, number> | undefined
): number => {
  const maxInline = Math.min(maxRender, items.length);
  if (maxInline <= 1) {
    return maxInline;
  }
  if (!availableWidth || !itemWidths) {
    return maxInline;
  }
  let hasMeasurements = false;
  let bestCount = maxInline;
  for (let count = maxInline; count >= 1; count--) {
    const widths = items.slice(0, count).map((item) => itemWidths[item.connectionId]);
    if (widths.some((width) => typeof width !== 'number')) {
      continue;
    }
    const hiddenCount = items.length - count;
    const needsMore = hiddenCount > 0;
    const moreWidth = needsMore ? moreWidths?.[hiddenCount] : 0;
    if (needsMore && typeof moreWidth !== 'number') {
      continue;
    }
    hasMeasurements = true;
    const elementCount = count + (needsMore ? 1 : 0);
    const gapWidth = Math.max(0, elementCount - 1) * CARD_LINE_GAP;
    const totalWidth =
      widths.reduce((sum, width) => sum + (width ?? 0), 0) +
      gapWidth +
      (needsMore ? moreWidth ?? 0 : 0);
    if (totalWidth <= availableWidth) {
      bestCount = count;
      break;
    }
    if (count === 1) {
      bestCount = 1;
    }
  }
  return hasMeasurements ? bestCount : maxInline;
};

