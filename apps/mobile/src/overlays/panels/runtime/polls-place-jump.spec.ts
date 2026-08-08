// Job 4 (owner-ratified): selecting a place in the polls place chip FLIES THE
// MAP — it dispatches a camera intent and NEVER sets a feed filter. RED-provable
// both ways: the dispatch is asserted on a mock camera seam, and the feed
// controls store is asserted untouched (no placeFilter key exists at all).
import type { PlaceLike } from '@crave-search/shared';

import {
  getPollsFeedControlsSnapshot,
  subscribeToPollsFeedControlChanges,
} from './polls-feed-controls-store';
import { executePollsPlaceJump } from './polls-place-jump';
import {
  registerMapCameraBboxFlyHandler,
  requestMapCameraFlyToBbox,
  resetMapCameraCommandStore,
} from '../../../store/map-camera-command-store';

const place = (placeId: string): PlaceLike => ({
  placeId,
  name: `Place ${placeId}`,
  bbox: { minLat: 30, minLng: -98, maxLat: 30.5, maxLng: -97.5 },
  providerLevelCode: 'Municipality',
  ground: {
    rings: [
      [
        [-98, 30],
        [-97.5, 30],
        [-97.5, 30.5],
        [-98, 30.5],
        [-98, 30],
      ],
    ],
  } as unknown as PlaceLike['ground'],
});

describe('polls place chip = a camera JUMP (Job 4)', () => {
  afterEach(() => {
    resetMapCameraCommandStore();
  });

  it('select dispatches the camera intent with the place bbox', () => {
    const fly = jest.fn().mockReturnValue(true);
    const result = executePollsPlaceJump({
      placeId: 'p1',
      slice: [place('p0'), place('p1')],
      requestFly: fly,
    });
    expect(result).toBe('dispatched');
    expect(fly).toHaveBeenCalledTimes(1);
    expect(fly).toHaveBeenCalledWith({ minLat: 30, minLng: -98, maxLat: 30.5, maxLng: -97.5 });
  });

  it('select does NOT touch the feed controls (no filter, no press edge)', () => {
    const pressEdge = jest.fn();
    const unsubscribe = subscribeToPollsFeedControlChanges(pressEdge);
    const before = getPollsFeedControlsSnapshot();
    executePollsPlaceJump({
      placeId: 'p1',
      slice: [place('p1')],
      requestFly: jest.fn().mockReturnValue(true),
    });
    expect(getPollsFeedControlsSnapshot()).toEqual(before);
    expect(getPollsFeedControlsSnapshot()).not.toHaveProperty('placeFilter');
    expect(pressEdge).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('no catalog bbox → honest no-op (never a guessed camera target)', () => {
    const fly = jest.fn();
    const result = executePollsPlaceJump({
      placeId: 'missing',
      slice: [place('p1')],
      requestFly: fly,
    });
    expect(result).toBe('no-bbox');
    expect(fly).not.toHaveBeenCalled();
  });

  it('the default seam is the module camera-command store (registered handler receives the bbox)', () => {
    const handler = jest.fn().mockReturnValue(true);
    const unregister = registerMapCameraBboxFlyHandler(handler);
    const result = executePollsPlaceJump({ placeId: 'p1', slice: [place('p1')] });
    expect(result).toBe('dispatched');
    expect(handler).toHaveBeenCalledWith({ minLat: 30, minLng: -98, maxLat: 30.5, maxLng: -97.5 });
    unregister();
    expect(requestMapCameraFlyToBbox(place('p1').bbox)).toBe(false);
  });
});
