import {
  getPollsFeedControlsSnapshot,
  restorePollsFeedControls,
  subscribeToPollsFeedControlChanges,
  usePollsFeedControlsStore,
} from './polls-feed-controls-store';

// Leg 5 failure path: a seam RESTORE must not read as a user press — if the restore
// write reached the press-edge subscription, the revert would schedule a fresh commit
// (revert → commit → fail → revert loop, and engine reentrancy inside 'failed').
describe('polls-feed-controls-store — restore suppression', () => {
  afterEach(() => {
    restorePollsFeedControls({
      feedState: 'active',
      feedSort: 'new',
      feedType: 'all',
      feedTime: 'all_time',
    });
  });

  it('a normal control write fires the press-edge subscription', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToPollsFeedControlChanges(listener);
    usePollsFeedControlsStore.getState().setFeedState('closed');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('Job 4: there is NO placeFilter control — the snapshot carries only the four controls', () => {
    // RED-provable inverse of the old network-control pin: place selection is a
    // camera jump now; a placeFilter key reappearing here means the filter came back.
    const baseline = getPollsFeedControlsSnapshot();
    expect(baseline).not.toHaveProperty('placeFilter');
    expect(Object.keys(baseline).sort()).toEqual(['feedSort', 'feedState', 'feedTime', 'feedType']);
  });

  it('placeOptions is metadata, not a control - writing it never fires the press edge', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToPollsFeedControlChanges(listener);
    usePollsFeedControlsStore
      .getState()
      .setPlaceOptions([
        { placeId: '11111111-1111-1111-1111-111111111111', placeName: 'Round Rock', pollCount: 3 },
      ]);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('liveCount is metadata, not a control - writing it never fires the press edge', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToPollsFeedControlChanges(listener);
    usePollsFeedControlsStore.getState().setLiveCount(7);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('restorePollsFeedControls writes the snapshot back WITHOUT firing the press edge', () => {
    const baseline = getPollsFeedControlsSnapshot();
    usePollsFeedControlsStore.getState().setFeedState('closed');
    const listener = jest.fn();
    const unsubscribe = subscribeToPollsFeedControlChanges(listener);
    restorePollsFeedControls(baseline);
    expect(getPollsFeedControlsSnapshot()).toEqual(baseline);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});
