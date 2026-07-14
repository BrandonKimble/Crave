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
