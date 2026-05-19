import type { SearchSurfaceRedrawPhase } from './search-surface-redraw-phase';
import {
  createSearchSurfaceRedrawOwnerRuntime,
  type SearchSurfaceRedrawOwnerRuntime,
} from './search-surface-redraw-owner-runtime';

type SearchSurfaceRedrawCoordinatorListener = (snapshot: SearchSurfaceRedrawSnapshot) => void;

export type SearchSurfaceRedrawAdvanceMetadata = {
  operationId?: string | null;
  requestKey?: string | null;
  markerEnterCommitId?: number | null;
  markerEnterSettledAtMs?: number | null;
  markerEnterSettled?: boolean;
  [key: string]: unknown;
};

export type SearchSurfaceRedrawSnapshot = {
  sessionId: string;
  operationId: string | null;
  seq: number | null;
  page: number | null;
  phase: SearchSurfaceRedrawPhase;
  markerEnterSettledAtMs: number | null;
  metadata: Readonly<Record<string, unknown>>;
  updatedAtMs: number;
};

export class SearchSurfaceRedrawCoordinator {
  private readonly listeners = new Set<SearchSurfaceRedrawCoordinatorListener>();

  private readonly ownerRuntime: SearchSurfaceRedrawOwnerRuntime =
    createSearchSurfaceRedrawOwnerRuntime();

  public beginOperation(
    operationId: string,
    seq: number,
    page: number
  ): SearchSurfaceRedrawSnapshot {
    const previousSnapshot = this.getSnapshot();
    const nextSnapshot = this.ownerRuntime.beginOperation(operationId, seq, page);
    if (nextSnapshot === previousSnapshot) {
      return previousSnapshot;
    }
    this.notify();
    return nextSnapshot;
  }

  public advancePhase(
    phase: SearchSurfaceRedrawPhase,
    metadata?: SearchSurfaceRedrawAdvanceMetadata
  ): boolean {
    if (!this.ownerRuntime.advancePhase(phase, metadata)) {
      return false;
    }
    this.notify();
    return true;
  }

  public getSnapshot(): SearchSurfaceRedrawSnapshot {
    return this.ownerRuntime.getSnapshot();
  }

  public subscribe(listener: SearchSurfaceRedrawCoordinatorListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public reset(operationId?: string): boolean {
    if (!this.ownerRuntime.reset(operationId)) {
      return false;
    }
    this.notify();
    return true;
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

export const createSearchSurfaceRedrawCoordinator = (): SearchSurfaceRedrawCoordinator =>
  new SearchSurfaceRedrawCoordinator();
