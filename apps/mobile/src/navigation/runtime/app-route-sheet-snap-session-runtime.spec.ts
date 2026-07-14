// THE TWO-POSTURE LAW (owner 2026-07-12, plans/root-snap-law.md §Leg 2) — pure-logic pins for
// the posture seats and the gesture-only write contract. The laundering test is the RED-provable
// core: before this change, a programmatic collapsed arrival overwrote the remembered home
// posture (the 2026-07-12 bug); these tests fail loudly if that gate is ever removed.

import {
  CONTENT_SEAT_SEED_SNAP,
  DOCKED_POLLS_RESURRECT_SNAP,
  HOME_SEAT_SEED_SNAP,
  createAppRouteSheetSnapSessionRuntime,
  resolveSheetPostureSeat,
} from './app-route-sheet-snap-session-runtime';
import { resolveSearchLaunchOriginSnap } from './app-route-session-utils';

describe('two-posture snap session (root-snap-law leg 2)', () => {
  it('cold start seeds: home collapsed, content expanded, shared across content pages', () => {
    const runtime = createAppRouteSheetSnapSessionRuntime();
    expect(runtime.actions.getRouteSceneSwitchSceneSnap('polls')).toBe(HOME_SEAT_SEED_SNAP);
    expect(runtime.actions.getRouteSceneSwitchSceneSnap('bookmarks')).toBe(CONTENT_SEAT_SEED_SNAP);
    expect(runtime.actions.getRouteSceneSwitchSceneSnap('profile')).toBe(CONTENT_SEAT_SEED_SNAP);
    expect(HOME_SEAT_SEED_SNAP).toBe('collapsed');
    expect(CONTENT_SEAT_SEED_SNAP).toBe('expanded');
  });

  it('seat membership: home = polls, content = bookmarks/profile, children/search = none', () => {
    expect(resolveSheetPostureSeat('polls')).toBe('home');
    expect(resolveSheetPostureSeat('bookmarks')).toBe('content');
    expect(resolveSheetPostureSeat('profile')).toBe('content');
    expect(resolveSheetPostureSeat('search')).toBeNull();
    expect(resolveSheetPostureSeat('pollDetail')).toBeNull();
    expect(resolveSheetPostureSeat('settings')).toBeNull();
  });

  it('gesture settles write the HOME seat; collapsed is a first-class remembered posture', () => {
    const runtime = createAppRouteSheetSnapSessionRuntime();
    runtime.actions.settleRouteScenePollsSnap({
      rootOverlayKey: 'search',
      snap: 'middle',
      source: 'gesture',
    });
    expect(runtime.actions.getRouteSceneSwitchSceneSnap('polls')).toBe('middle');
    runtime.actions.settleRouteScenePollsSnap({
      rootOverlayKey: 'search',
      snap: 'collapsed',
      source: 'gesture',
    });
    expect(runtime.actions.getRouteSceneSwitchSceneSnap('polls')).toBe('collapsed');
  });

  it('LAUNDERING IS DEAD: a programmatic polls settle never overwrites the home seat', () => {
    const runtime = createAppRouteSheetSnapSessionRuntime();
    runtime.actions.settleRouteScenePollsSnap({
      rootOverlayKey: 'search',
      snap: 'middle',
      source: 'gesture',
    });
    // The old tab-round-trip laundering: programmatic arrival at collapsed.
    runtime.actions.settleRouteScenePollsSnap({
      rootOverlayKey: 'search',
      snap: 'collapsed',
      source: 'programmatic',
    });
    expect(runtime.actions.getRouteSceneSwitchSceneSnap('polls')).toBe('middle');
  });

  it('the content seat is ONE shared posture (favorites drag is profile posture too)', () => {
    const runtime = createAppRouteSheetSnapSessionRuntime();
    runtime.actions.recordRouteSceneSheetSettle({
      sceneKey: 'bookmarks',
      snap: 'middle',
      writer: 'gesture',
    });
    expect(runtime.actions.getRouteSceneSwitchSceneSnap('profile')).toBe('middle');
    expect(runtime.actions.getRouteSceneSwitchSceneSnap('bookmarks')).toBe('middle');
  });

  it('CONTRACT: a programmatic seat write is dropped with a loud __DEV__ error', () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const runtime = createAppRouteSheetSnapSessionRuntime();
      runtime.actions.recordRouteSceneSheetSettle({
        sceneKey: 'profile',
        snap: 'collapsed',
        writer: 'programmatic',
      });
      expect(runtime.actions.getRouteSceneSwitchSceneSnap('profile')).toBe(CONTENT_SEAT_SEED_SNAP);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[snap-law]'));
    } finally {
      errorSpy.mockRestore();
      delete (globalThis as { __DEV__?: boolean }).__DEV__;
    }
  });

  it("CONTRACT: 'hidden' never enters the content seat", () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const runtime = createAppRouteSheetSnapSessionRuntime();
      runtime.actions.recordRouteSceneSheetSettle({
        sceneKey: 'bookmarks',
        snap: 'hidden',
        writer: 'gesture',
      });
      expect(runtime.actions.getRouteSceneSwitchSceneSnap('bookmarks')).toBe(
        CONTENT_SEAT_SEED_SNAP
      );
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[snap-law]'));
    } finally {
      errorSpy.mockRestore();
      delete (globalThis as { __DEV__?: boolean }).__DEV__;
    }
  });

  it('named writers (origin restore / product intents) may write seats', () => {
    const runtime = createAppRouteSheetSnapSessionRuntime();
    runtime.actions.recordRouteSceneSheetSettle({
      sceneKey: 'bookmarks',
      snap: 'middle',
      writer: 'named',
    });
    expect(runtime.actions.getRouteSceneSwitchSceneSnap('bookmarks')).toBe('middle');
    runtime.actions.recordRouteSceneSheetSettle({
      sceneKey: 'polls',
      snap: 'collapsed',
      writer: 'named',
    });
    expect(runtime.actions.getRouteSceneSwitchSceneSnap('polls')).toBe('collapsed');
  });

  it('dismissDockedPolls hides the home seat; a gesture settle resurrects the memory', () => {
    const runtime = createAppRouteSheetSnapSessionRuntime();
    runtime.actions.dismissDockedPolls();
    expect(runtime.actions.getRouteSceneSwitchSceneSnap('polls')).toBe('hidden');
    expect(runtime.authority.getSnapshot().isDockedPollsDismissed).toBe(true);
    runtime.actions.settleRouteScenePollsSnap({
      rootOverlayKey: 'search',
      snap: 'collapsed',
      source: 'gesture',
    });
    expect(runtime.actions.getRouteSceneSwitchSceneSnap('polls')).toBe('collapsed');
    expect(runtime.authority.getSnapshot().isDockedPollsDismissed).toBe(false);
  });

  it('dismissed-flag arms still run on programmatic settles (lane semantics, not memory)', () => {
    const runtime = createAppRouteSheetSnapSessionRuntime();
    runtime.actions.dismissDockedPolls();
    runtime.actions.settleRouteScenePollsSnap({
      rootOverlayKey: 'search',
      snap: 'collapsed',
      source: 'programmatic',
    });
    // The flag clears (resurrect landing) even though the seat write is gesture-only.
    expect(runtime.authority.getSnapshot().isDockedPollsDismissed).toBe(false);
    expect(runtime.actions.getRouteSceneSwitchSceneSnap('polls')).toBe('hidden');
  });

  it('child/search-session facts record for any writer (unchanged per-scene ledger)', () => {
    const runtime = createAppRouteSheetSnapSessionRuntime();
    runtime.actions.recordRouteSceneSheetSettle({
      sceneKey: 'settings',
      snap: 'expanded',
      writer: 'programmatic',
    });
    expect(runtime.actions.getRouteSceneSwitchSceneSnap('settings')).toBe('expanded');
    runtime.actions.recordRouteSceneSheetSettle({
      sceneKey: 'search',
      snap: 'middle',
      writer: 'programmatic',
    });
    expect(runtime.actions.getRouteSceneSwitchSceneSnap('search')).toBe('middle');
    // ...and never bleed into the seats.
    expect(runtime.actions.getRouteSceneSwitchSceneSnap('polls')).toBe(HOME_SEAT_SEED_SNAP);
  });
});

describe('resolveSearchLaunchOriginSnap (seat-backed origin capture)', () => {
  it('home overlays read the home seat; dismissed docked polls capture the resurrect posture', () => {
    expect(
      resolveSearchLaunchOriginSnap({
        overlay: 'search',
        homeSeatSnap: 'middle',
        contentSeatSnap: 'expanded',
      })
    ).toBe('middle');
    expect(
      resolveSearchLaunchOriginSnap({
        overlay: 'polls',
        homeSeatSnap: 'hidden',
        contentSeatSnap: 'expanded',
      })
    ).toBe(DOCKED_POLLS_RESURRECT_SNAP);
  });

  it('content overlays read the ONE shared content seat', () => {
    expect(
      resolveSearchLaunchOriginSnap({
        overlay: 'bookmarks',
        homeSeatSnap: 'collapsed',
        contentSeatSnap: 'middle',
      })
    ).toBe('middle');
    expect(
      resolveSearchLaunchOriginSnap({
        overlay: 'profile',
        homeSeatSnap: 'collapsed',
        contentSeatSnap: 'collapsed',
      })
    ).toBe('collapsed');
  });
});
