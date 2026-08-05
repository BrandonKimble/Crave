// ─── G-A11Y falsifiers: THE SCREEN-CHANGE EVENT, real host wiring ────────────
//
// The gap: the ONE TRACK swaps data on a persistent FlashList, so assistive
// tech gets no navigation event — a blind user taps Polls and hears nothing.
// These pin the event the host now states, against the REAL host/page chain:
//
//   1. one announcement per presented-entry change, naming the destination;
//   2. a cold entry's skeleton→real-rows sequence is ONE navigation, not two;
//   3. the screen-reader cursor moves to the DESTINATION's header layer;
//   4. a same-entry re-render (data tick, publication churn) says nothing.

import type { ReactTestRenderer } from 'react-test-renderer';
import { act } from 'react-test-renderer';

import {
  clearRecords,
  focusedNodeTestId,
  harness,
  listPublication,
  renderHost,
  resetHarness,
  setFrame,
} from './render-utils';

describe('the track screen-change announcement — host wiring (G-A11Y)', () => {
  let renderer: ReactTestRenderer;
  let logSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.useFakeTimers();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    resetHarness();
    renderer = await renderHost();
  });

  afterEach(async () => {
    await act(async () => {
      renderer.unmount();
    });
    jest.useRealTimers();
    logSpy.mockRestore();
  });

  it('announces the destination ONCE per presented-entry change', async () => {
    const world = harness.world;
    // The boot entry (home) is itself a screen change — the app arrives somewhere.
    expect(world.a11y.announcements).toEqual(['Home']);
    clearRecords(world);
    await setFrame({ presentedSceneKey: 'polls', activeSceneKey: 'polls' });
    expect(world.a11y.announcements).toEqual(['Polls']);
    clearRecords(world);
    await setFrame({ presentedSceneKey: 'lists', activeSceneKey: 'lists' });
    expect(world.a11y.announcements).toEqual(['Lists']);
  });

  it('a cold entry is ONE navigation: the skeleton commit and the real-rows commit do not double-announce', async () => {
    const world = harness.world;
    clearRecords(world);
    // Cold restaurant: nothing published yet → the page paints the skeleton.
    await setFrame({
      presentedSceneKey: 'restaurant',
      activeSceneKey: 'restaurant',
      presentedEntryId: 'r1',
      activeEntryId: 'r1',
    });
    expect(world.a11y.announcements).toEqual(['Restaurant']);
    // The rows arrive some commits later — the READINESS axis must not reach
    // the a11y story (the user navigated once).
    await act(async () => {
      world.publishSceneInput('restaurant', listPublication(['r-row-1', 'r-row-2'], 'r1'));
    });
    expect(world.a11y.announcements).toEqual(['Restaurant']);
  });

  it('moves the screen-reader cursor to the DESTINATION entry header layer', async () => {
    const world = harness.world;
    expect(focusedNodeTestId(world)).toBe('track-chrome-layer:home#root');
    await setFrame({ presentedSceneKey: 'polls', activeSceneKey: 'polls' });
    expect(focusedNodeTestId(world)).toBe('track-chrome-layer:polls#root');
    expect(world.a11y.focusHandles.length).toBe(2);
  });

  it('a same-entry re-render says nothing and does not steal focus', async () => {
    const world = harness.world;
    await setFrame({ presentedSceneKey: 'polls', activeSceneKey: 'polls' });
    clearRecords(world);
    // Data churn on the presented entry: a republication, then a frame tick
    // that changes nothing about WHICH entry is presented.
    await act(async () => {
      world.publishSceneInput('polls', listPublication(['p1', 'p2']));
    });
    await setFrame({ presentedSceneKey: 'polls', activeSceneKey: 'polls' });
    expect(world.a11y.announcements).toEqual([]);
    expect(world.a11y.focusHandles).toEqual([]);
  });

  it('two entries of the SAME scene are two screens — a same-scene push announces again', async () => {
    const world = harness.world;
    await setFrame({
      presentedSceneKey: 'restaurant',
      activeSceneKey: 'restaurant',
      presentedEntryId: 'r1',
      activeEntryId: 'r1',
    });
    clearRecords(world);
    await setFrame({
      presentedSceneKey: 'restaurant',
      activeSceneKey: 'restaurant',
      presentedEntryId: 'r2',
      activeEntryId: 'r2',
    });
    expect(world.a11y.announcements).toEqual(['Restaurant']);
    expect(focusedNodeTestId(world)).toBe('track-chrome-layer:restaurant#r2');
  });
});
