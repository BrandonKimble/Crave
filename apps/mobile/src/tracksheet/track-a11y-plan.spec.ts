// ─── G-A11Y falsifiers (pure core) ───────────────────────────────────────────
//
// The wiring-level falsifiers (announce fires once per REAL presented-entry
// change, skeleton→rows does not double-announce, focus lands on the
// destination header, a same-entry re-render is silent) live in the render
// lane against the real host: __render__/track-host-a11y.render-spec.tsx.
// This spec pins the decision itself.

import { makeTrackEntryKey } from './track-entry-identity';
import { planTrackA11yScreenChange, TrackA11yAnnouncementLedger } from './track-a11y-plan';
import {
  SCENE_DECLARATIONS,
  resolveSceneA11yName,
} from '../navigation/runtime/scene-foundation-spec';
import type { OverlayKey } from '../overlays/types';

describe('the track screen-change announcement (G-A11Y)', () => {
  it('announces the destination and moves focus to its header when the painted entry changes', () => {
    const decision = planTrackA11yScreenChange({
      presentedEntryKey: makeTrackEntryKey('polls'),
      destinationName: 'Polls',
      announcedEntryKey: makeTrackEntryKey('home'),
    });
    expect(decision).toEqual({ kind: 'announce', message: 'Polls', focus: 'destination-header' });
  });

  it('says nothing when the painted entry is the one already announced', () => {
    const key = makeTrackEntryKey('polls');
    expect(
      planTrackA11yScreenChange({
        presentedEntryKey: key,
        destinationName: 'Polls',
        announcedEntryKey: key,
      })
    ).toEqual({ kind: 'silent', reason: 'same-entry' });
  });

  it('the ledger announces once per entry change — a repeat decision for the same entry is silent', () => {
    const ledger = new TrackA11yAnnouncementLedger();
    const home = makeTrackEntryKey('home');
    const polls = makeTrackEntryKey('polls');
    expect(ledger.decide({ presentedEntryKey: home, destinationName: 'Home' }).kind).toBe(
      'announce'
    );
    // Re-renders (data ticks, readiness phase changes, chrome rebuilds) all
    // arrive as the SAME entry key.
    expect(ledger.decide({ presentedEntryKey: home, destinationName: 'Home' }).kind).toBe('silent');
    expect(ledger.decide({ presentedEntryKey: home, destinationName: 'Home' }).kind).toBe('silent');
    expect(ledger.decide({ presentedEntryKey: polls, destinationName: 'Polls' }).kind).toBe(
      'announce'
    );
    expect(ledger.lastAnnouncedEntryKey()).toBe(polls);
  });

  it('two stacked entries of the SAME scene are two screens — the second announces', () => {
    const ledger = new TrackA11yAnnouncementLedger();
    ledger.decide({
      presentedEntryKey: makeTrackEntryKey('dmSession', 'e1'),
      destinationName: 'C',
    });
    expect(
      ledger.decide({
        presentedEntryKey: makeTrackEntryKey('dmSession', 'e2'),
        destinationName: 'C',
      }).kind
    ).toBe('announce');
  });

  it('every declared scene has a non-empty announcement name — no scene can be silently unannounced', () => {
    const unnamed = (Object.keys(SCENE_DECLARATIONS) as OverlayKey[]).filter(
      (sceneKey) => resolveSceneA11yName(sceneKey).trim().length === 0
    );
    expect(unnamed).toEqual([]);
  });
});
