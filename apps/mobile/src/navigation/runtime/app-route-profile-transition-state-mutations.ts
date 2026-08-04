import type {
  ProfileTransitionSnapshotCapture,
  ProfileTransitionState,
} from './app-route-profile-transition-state-contract';

// L3 slice 4: the machine's settle/dismiss completion builders are DELETED with their
// fields; the transition state is the pop-teardown owner's small record.
export const createInitialProfileTransitionState = (): ProfileTransitionState => ({
  status: 'idle',
  savedResultsScrollOffset: null,
});

export const resetProfileTransitionState = (transition: ProfileTransitionState): void => {
  Object.assign(transition, createInitialProfileTransitionState());
};

export const applyProfileTransitionSnapshotCapture = ({
  transition,
  snapshotCapture,
}: {
  transition: ProfileTransitionState;
  snapshotCapture: ProfileTransitionSnapshotCapture;
}): void => {
  // D56: the first-write-wins `savedCamera` arm is DELETED with the field (F1506). The scroll
  // offset keeps its own first-write-wins rule — that one is deliberate and unrelated.
  if (transition.savedResultsScrollOffset === null) {
    transition.savedResultsScrollOffset = snapshotCapture.savedResultsScrollOffset;
  }
};
