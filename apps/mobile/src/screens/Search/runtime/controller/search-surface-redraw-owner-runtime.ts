import type { SearchSurfaceRedrawPhase } from './search-surface-redraw-phase';
import {
  createSearchSurfaceRedrawIdleSnapshot,
  createSearchSurfaceRedrawPublicSnapshot,
  resolveSearchSurfaceRedrawAdvanceSnapshot,
  resolveSearchSurfaceRedrawResetSnapshot,
} from './search-surface-redraw-runtime';
import type {
  SearchSurfaceRedrawAdvanceMetadata,
  SearchSurfaceRedrawSnapshot,
} from './search-surface-redraw-coordinator';

export type SearchSurfaceRedrawOwnerRuntime = {
  advancePhase: (
    phase: SearchSurfaceRedrawPhase,
    metadata?: SearchSurfaceRedrawAdvanceMetadata
  ) => boolean;
  getSnapshot: () => SearchSurfaceRedrawSnapshot;
  reset: (operationId?: string) => boolean;
};

export const createSearchSurfaceRedrawOwnerRuntime = (): SearchSurfaceRedrawOwnerRuntime => {
  let snapshot: SearchSurfaceRedrawSnapshot = createSearchSurfaceRedrawIdleSnapshot();

  return {
    advancePhase: (phase, metadata) => {
      const next = resolveSearchSurfaceRedrawAdvanceSnapshot({
        snapshot,
        phase,
        metadata,
      });
      if (!next.accepted) {
        return false;
      }
      snapshot = next.snapshot;
      return true;
    },
    getSnapshot: () => createSearchSurfaceRedrawPublicSnapshot(snapshot),
    reset: (operationId) => {
      const next = resolveSearchSurfaceRedrawResetSnapshot({
        snapshot,
        operationId,
      });
      if (!next.accepted) {
        return false;
      }
      snapshot = next.snapshot;
      return true;
    },
  };
};
