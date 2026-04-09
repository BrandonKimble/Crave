import type { SearchRestaurantRouteCommand } from '../../../../overlays/searchRestaurantRouteController';
import type { CameraSnapshot, ProfileTransitionStatus } from './profile-transition-state-contract';
import type { PreparedProfileCloseFinalization } from './profile-app-close-finalization-runtime';

type OverlaySheetSnap = 'expanded' | 'middle' | 'collapsed' | 'hidden';

export type PreparedProfileRestaurantSheetCommand =
  | {
      type: 'request';
      snap: Exclude<OverlaySheetSnap, 'hidden'>;
    }
  | {
      type: 'clear';
    };

export type PreparedProfileResultsSheetCommand =
  | {
      type: 'request';
      snap: Exclude<OverlaySheetSnap, 'hidden'>;
    }
  | {
      type: 'hide';
    };

export type PreparedProfilePresentationCommandSet = {
  targetCamera?: CameraSnapshot;
  forceSharedMiddleSnap?: boolean;
  restaurantSheetCommand?: PreparedProfileRestaurantSheetCommand;
  resultsSheetCommand?: PreparedProfileResultsSheetCommand;
  clearProfileCameraPadding?: boolean;
};

export type ProfilePresentationCommandExecutionPhase = 'pre_shell' | 'shell' | 'post_shell';

export type ProfilePresentationCommandExecutionContext = {
  transactionId: string | null;
  phase: ProfilePresentationCommandExecutionPhase;
  requestToken: number | null;
};

export type ProfilePresentationCommandExecutionPayload = {
  commandSet?: PreparedProfilePresentationCommandSet;
  executionContext: ProfilePresentationCommandExecutionContext;
};

export type ProfilePresentationStateExecutionPayload = {
  transitionStatus?: ProfileTransitionStatus;
  routeIntent?: SearchRestaurantRouteCommand;
  closeFinalization?: PreparedProfileCloseFinalization;
  executionContext: ProfilePresentationCommandExecutionContext;
};

export type PreparedProfileStateExecution = Omit<
  ProfilePresentationStateExecutionPayload,
  'executionContext'
>;

export type ProfilePresentationPhaseExecutionPayload = {
  commandSet?: PreparedProfilePresentationCommandSet;
  stateExecution?: PreparedProfileStateExecution;
  executionContext: ProfilePresentationCommandExecutionContext;
};

export type PreparedProfilePresentationTransaction = {
  phasePayloads: readonly [
    ProfilePresentationPhaseExecutionPayload,
    ProfilePresentationPhaseExecutionPayload,
    ProfilePresentationPhaseExecutionPayload
  ];
};

export type PreparedProfilePresentationSettleEvent =
  | {
      type: 'sheet_settled';
      snap: Exclude<OverlaySheetSnap, 'hidden'>;
      requestToken: number | null;
    }
  | {
      type: 'camera_settled';
      requestToken: number | null;
    };

export type PreparedProfilePresentationCompletionEvent =
  | PreparedProfilePresentationSettleEvent
  | {
      type: 'overlay_dismissed';
      requestToken: number | null;
    };

export const resolveProfilePresentationExecutionRequestToken = (
  transactionId: string | null,
  phase: ProfilePresentationCommandExecutionPhase
): number | null => {
  if (!transactionId) {
    return null;
  }
  const seed = `${transactionId}:${phase}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) || 1;
};

export const createProfilePresentationCommandExecutionContext = (
  transactionId: string | null,
  phase: ProfilePresentationCommandExecutionPhase
): ProfilePresentationCommandExecutionContext => ({
  transactionId,
  phase,
  requestToken: resolveProfilePresentationExecutionRequestToken(transactionId, phase),
});

export const createPreparedProfilePresentationTransaction = ({
  transactionId,
  preShellCommands,
  shellStateExecution,
  postShellCommands,
  postShellStateExecution,
}: {
  transactionId: string | null;
  preShellCommands?: PreparedProfilePresentationCommandSet;
  shellStateExecution?: PreparedProfileStateExecution;
  postShellCommands?: PreparedProfilePresentationCommandSet;
  postShellStateExecution?: PreparedProfileStateExecution;
}): PreparedProfilePresentationTransaction => ({
  phasePayloads: [
    {
      commandSet: preShellCommands,
      executionContext: createProfilePresentationCommandExecutionContext(
        transactionId,
        'pre_shell'
      ),
    },
    {
      stateExecution: shellStateExecution,
      executionContext: createProfilePresentationCommandExecutionContext(transactionId, 'shell'),
    },
    {
      commandSet: postShellCommands,
      stateExecution: postShellStateExecution,
      executionContext: createProfilePresentationCommandExecutionContext(
        transactionId,
        'post_shell'
      ),
    },
  ] as const,
});
