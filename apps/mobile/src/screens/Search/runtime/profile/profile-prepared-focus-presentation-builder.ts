import type { CameraSnapshot } from './profile-transition-state-contract';
import {
  createPreparedProfilePresentationTransaction,
  type PreparedProfilePresentationTransaction,
} from './profile-prepared-presentation-transaction-contract';

export const createFocusedProfileCameraPresentationTransaction = (
  targetCamera: CameraSnapshot
): PreparedProfilePresentationTransaction =>
  createPreparedProfilePresentationTransaction({
    preShellCommands: {
      targetCamera,
    },
  });
