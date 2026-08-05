// ─── G-A11Y — THE SCREEN-CHANGE FACT ON A SURFACE THAT NEVER CHANGES SCREENS ──
//
// THE PROBLEM, stated in the model's own terms: the ONE TRACK is a single
// persistent FlashList whose DATA is swapped. Every other navigation stack on
// iOS emits a UIAccessibility screen-changed notification for free because a
// new view controller/screen is pushed; nothing is pushed here, so VoiceOver
// hears nothing and the cursor stays parked on whatever row it was reading —
// a blind user taps Polls and the app appears not to respond.
//
// THE ACCESSIBLE MODEL of a persistent surface whose content is replaced: the
// SWAP IS THE NAVIGATION EVENT, and the event's identity is the identity the
// rest of the track already runs on — the ENTRY (G-ENTRY, `sceneKey#entryId`).
// One presented entry = one screen to the user. So this core has exactly ONE
// input axis: which entry is PAINTED, plus that scene's declared name.
//
// WHAT IS DELIBERATELY UNREPRESENTABLE HERE (this is the design, not an
// omission — each of these was a way the old-shaped "announce on switch" call
// site would have lied):
//
//   • READINESS. A cold entry paints a skeleton first and its real rows a few
//     commits later (R2's phase ledger). That is ONE navigation to the user,
//     not two. Phase is not a parameter of this function, so a skeleton→rows
//     double-announce cannot be written — not merely avoided.
//   • MOTION / THE HIDDEN EXCURSION. A dismiss-to-map defers the swap until
//     the sheet clears the screen edge (A2): while it slides, the PAINTED
//     entry is still the outgoing one, so this core is silent by identity, and
//     the destination announces itself once — when it is actually painted.
//     No motion state is threaded in, so no announcement can be attached to a
//     slide, a detent, or a dismissal.
//   • RE-RENDERS. Data ticks, strip changes, scroll, chrome rebuilds — all
//     keep the same entry key, all silent.
//
// The ledger is the whole state: the last entry key we announced.

import type { TrackEntryKey } from './track-entry-identity';

export type TrackA11yScreenChange =
  | { kind: 'silent'; reason: 'same-entry' }
  | {
      kind: 'announce';
      /** What the screen reader says — the destination's declared name. */
      message: string;
      /** Where the cursor lands: the destination's header, never mid-list. */
      focus: 'destination-header';
    };

export type TrackA11yInput = {
  /** The PAINTED entry (host presentation truth), not the frame's. */
  presentedEntryKey: TrackEntryKey;
  /** SCENE_DECLARATIONS[scene].track.a11yName for the painted scene. */
  destinationName: string;
};

/**
 * THE PURE DECISION. Announce exactly when the painted entry becomes an entry
 * we have not announced; say the destination's name; move the cursor to its
 * header.
 */
export const planTrackA11yScreenChange = (
  input: TrackA11yInput & { announcedEntryKey: TrackEntryKey | null }
): TrackA11yScreenChange => {
  if (input.announcedEntryKey === input.presentedEntryKey) {
    return { kind: 'silent', reason: 'same-entry' };
  }
  return {
    kind: 'announce',
    message: input.destinationName,
    focus: 'destination-header',
  };
};

/** The latch (precedent: TrackEntryReadinessLedger) — decide + record in one. */
export class TrackA11yAnnouncementLedger {
  private announcedEntryKey: TrackEntryKey | null = null;

  decide(input: TrackA11yInput): TrackA11yScreenChange {
    const decision = planTrackA11yScreenChange({
      ...input,
      announcedEntryKey: this.announcedEntryKey,
    });
    if (decision.kind === 'announce') {
      this.announcedEntryKey = input.presentedEntryKey;
    }
    return decision;
  }

  /** Test/diagnostic read — never a control input. */
  lastAnnouncedEntryKey(): TrackEntryKey | null {
    return this.announcedEntryKey;
  }
}
