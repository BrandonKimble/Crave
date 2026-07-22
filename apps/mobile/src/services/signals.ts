import type { MapBounds } from '../types';
import api from './api';
import { logger } from '../utils';

/** API-boundary clamp mirrors RecordViewportDwellDto (@Min(0) @Max(3_600_000) @IsInt). */
const MAX_VIEWPORT_DWELL_MS = 3_600_000;

/**
 * §3 viewport_dwell observation — subjectless settled-viewport attention
 * (browsing IS demand). FIRE-AND-FORGET by law: a signal write failure never
 * fails (or even surfaces to) the user action. The settle+dwell primitive in
 * use-viewport-subject-store-controller-runtime.ts is the ONLY caller; its
 * dedupe (verdict-change / marginBox-escape) keeps one dwell from spamming.
 */
export const recordViewportDwell = (bounds: MapBounds, dwellMs: number): void => {
  const clampedDwellMs = Math.min(Math.max(Math.round(dwellMs), 0), MAX_VIEWPORT_DWELL_MS);
  void api.post('/signals/viewport-dwell', { bounds, dwellMs: clampedDwellMs }).catch((error) => {
    logger.warn('viewport-dwell signal dropped', {
      message: error instanceof Error ? error.message : 'unknown',
    });
  });
};
