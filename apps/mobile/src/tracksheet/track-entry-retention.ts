// ─── DEPTH-K ENTRY RETENTION (A3: React element identity per entry) ──────────
//
// Child scenes used to be transient (only the presented one mounted): pushing
// userProfile B over A destroyed A's leg — hook state, composer drafts,
// segment selection — so pop-back was never byte-exact. Entries are now
// RETAINED as hidden legs (the hide-never-unmount Fabric constraint the host
// already follows), bounded by a small LRU so retention cannot grow with the
// session. K=3 covers every real stack today (tab → child → grandchild) while
// keeping the all-true activity cost bounded until G-ACTIVITY (R2) lands.
//
// Scroll memory is NOT evicted with the element (see TrackEntryScrollMemory):
// popping past K loses warm React state but never the remembered offset.

import type { TrackEntryKey } from './track-entry-identity';

export const TRACK_CHILD_RETENTION_DEPTH = 3;

export class TrackEntryRetention {
  private order: TrackEntryKey[] = [];

  constructor(private readonly capacity: number) {}

  /** Mark the entry most-recently-presented; returns evicted keys (oldest
   * first). The presented entry is by construction the newest and can never
   * be evicted by its own touch. */
  touch(entryKey: TrackEntryKey): TrackEntryKey[] {
    this.order = this.order.filter((key) => key !== entryKey);
    this.order.push(entryKey);
    const evicted: TrackEntryKey[] = [];
    while (this.order.length > this.capacity) {
      const oldest = this.order.shift();
      if (oldest != null) {
        evicted.push(oldest);
      }
    }
    return evicted;
  }

  keys(): readonly TrackEntryKey[] {
    return this.order;
  }

  get size(): number {
    return this.order.length;
  }

  delete(entryKey: TrackEntryKey): void {
    this.order = this.order.filter((key) => key !== entryKey);
  }
}
