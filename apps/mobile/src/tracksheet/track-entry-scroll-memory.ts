// ─── ENTRY-KEYED SCROLL MEMORY (G-ENTRY + G-RESTORE, amendment A4) ───────────
//
// Replaces the page's scene-keyed `sceneScrollMemoryRef` Map. Two laws:
//   • ENTRY-KEYED: two entries of the same scene (userProfile A over B) have
//     independent remembered offsets — a scene-keyed map made them collide.
//   • ZERO IS A MEMORY (A4): `read` returns null for "never visited" and 0 for
//     "remembered at the top". The old `.get(key) ?? 0` collapsed the two —
//     harmless while the default restore was also 0, but any future
//     no-memory policy (seeded restore, skeleton posture) would silently
//     treat a remembered top-of-list as an unvisited entry.

import type { TrackEntryKey } from './track-entry-identity';

/** The switch formula's outgoing-scroll term: the stash (σ) plus any live list
 * scroll past the effective boundary (H+σ). Pure — testable off the track. */
export const computeOutgoingScroll = (tau: number, trackH: number, sigma: number): number =>
  sigma + Math.max(0, tau - trackH - sigma);

export class TrackEntryScrollMemory {
  private readonly offsets = new Map<TrackEntryKey, number>();

  save(entryKey: TrackEntryKey, offset: number): void {
    this.offsets.set(entryKey, offset);
  }

  /** null = no memory; 0 is a real remembered offset, honored as such. */
  read(entryKey: TrackEntryKey): number | null {
    const offset = this.offsets.get(entryKey);
    return offset === undefined ? null : offset;
  }

  /** Scroll memory deliberately SURVIVES element eviction (depth-K retention
   * drops the React instance, not the remembered offset) — call this only for
   * identities that can never return. */
}
