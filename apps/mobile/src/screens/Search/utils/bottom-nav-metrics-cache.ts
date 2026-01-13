import type { LayoutRectangle } from 'react-native';

type BottomNavMetrics = {
  top: number;
  height: number;
};

let cachedBottomNavMetrics: BottomNavMetrics | null = null;

export const getCachedBottomNavMetrics = (): BottomNavMetrics | null => cachedBottomNavMetrics;

export const setCachedBottomNavMetricsFromLayout = (layout: LayoutRectangle): void => {
  const top = layout.y;
  const height = layout.height;
  if (!Number.isFinite(top) || !Number.isFinite(height)) {
    return;
  }
  if (height <= 0) {
    return;
  }
  cachedBottomNavMetrics = { top, height };
};

