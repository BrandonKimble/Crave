import type { CameraSnapshot } from './app-route-profile-transition-state-contract';
import {
  createPreparedProfilePresentationTransaction,
  type PreparedProfilePresentationTransaction,
} from './app-route-profile-prepared-presentation-transaction-contract';

export const createFocusedProfileCameraPresentationTransaction = (
  targetCamera: CameraSnapshot
): PreparedProfilePresentationTransaction =>
  createPreparedProfilePresentationTransaction({
    transactionId: null,
    preShellCommands: {
      targetCamera,
    },
  });
