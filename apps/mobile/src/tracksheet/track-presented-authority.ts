// ─── THE PRESENTED-ENTRY AUTHORITY (R8 opener item 1) ────────────────────────
//
// "Who is presented" used to be tracked by FOUR refs across two files —
// TrackSheetRouteHost's paintedRef, the leg resolver's presentedEntryKeyLiveRef,
// and TrackSheetPage's presentedEntryKeyRef + prevEntryKeyRef — four stored
// flavors of one fact, the exact echo class §2 of plans/redteam-abstractions.md
// condemned ("ONE stored authority per fact, everything else derived at read
// time"). This latch is the one store: the HOST owns it (it is written where
// the painted entry is decided, resolveHiddenPresentation's output) and hands
// it down; the resolver and the page READ it instead of mirroring it.
//
// The entry KEY is derived here with the same G-ENTRY rule the resolver used
// to apply inline: residents pin to `scene#root` (a top-level tab is ONE entry
// forever), children ride their stack entryId.
//
// RN-free on purpose (pure jest lane).

import { sceneIsResidentTrackScene } from '../navigation/runtime/scene-foundation-spec';
import type { OverlayKey } from '../overlays/types';
import { makeTrackEntryKey, type TrackEntryKey } from './track-entry-identity';

export type TrackEntrySwitchEdge = { from: TrackEntryKey; to: TrackEntryKey };

export class TrackPresentedEntryLatch {
  private scene: OverlayKey;

  private entryId: string | null;

  private key: TrackEntryKey;

  private previousKey: TrackEntryKey | null = null;

  /** The one unconsumed switch edge (set when the key changes on commit;
   * consumed once by the page's switch executor). */
  private pendingSwitch: TrackEntrySwitchEdge | null = null;

  constructor(scene: OverlayKey, entryId: string | null) {
    this.scene = scene;
    this.entryId = entryId;
    this.key = deriveTrackPresentedEntryKey(scene, entryId);
  }

  /** Written at ONE place: the host commit that decides what is painted
   * (after resolveHiddenPresentation). Idempotent per commit. */
  commitPainted(scene: OverlayKey, entryId: string | null): void {
    this.scene = scene;
    this.entryId = entryId;
    const nextKey = deriveTrackPresentedEntryKey(scene, entryId);
    if (nextKey !== this.key) {
      this.previousKey = this.key;
      this.pendingSwitch = { from: this.key, to: nextKey };
      this.key = nextKey;
    }
  }

  get paintedScene(): OverlayKey {
    return this.scene;
  }

  get paintedEntryId(): string | null {
    return this.entryId;
  }

  get entryKey(): TrackEntryKey {
    return this.key;
  }

  get previousEntryKey(): TrackEntryKey | null {
    return this.previousKey;
  }

  /** One-shot: the page's switch executor consumes the edge exactly once —
   * a re-run of its effect for unrelated deps (physics rebind) reads null and
   * must not replay the switch. */
  consumeEntrySwitch(): TrackEntrySwitchEdge | null {
    const edge = this.pendingSwitch;
    this.pendingSwitch = null;
    return edge;
  }
}

/** The G-ENTRY key rule, stated once (was inline in the leg resolver). */
export const deriveTrackPresentedEntryKey = (
  scene: OverlayKey,
  entryId: string | null
): TrackEntryKey => makeTrackEntryKey(scene, sceneIsResidentTrackScene(scene) ? null : entryId);
