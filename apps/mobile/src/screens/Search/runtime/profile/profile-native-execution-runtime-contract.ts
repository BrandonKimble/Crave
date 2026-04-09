import type { CameraIntentArbiter } from '../map/camera-intent-arbiter';
import type { PreparedProfilePresentationCompletionEvent } from './profile-prepared-presentation-transaction-contract';
import type { ProfileNativeCommandExecutionModel } from './profile-native-command-runtime';
import type { ProfileNativeTransitionExecutionModel } from './profile-native-transition-runtime';

type OverlaySheetSnap = 'expanded' | 'middle' | 'collapsed' | 'hidden';

export type ProfileNativeExecutionArgs = {
  preparedProfileCompletionHandlerRef: React.MutableRefObject<
    ((event: PreparedProfilePresentationCompletionEvent) => void) | null
  >;
  emitRuntimeMechanismEvent: (
    event: 'profile_intent_cancelled',
    payload: Record<string, unknown>
  ) => void;
  cameraIntentArbiter: CameraIntentArbiter;
  profileCameraAnimationMs: number;
  lastVisibleSheetStateRef: React.MutableRefObject<Exclude<OverlaySheetSnap, 'hidden'> | null>;
  lastCameraStateRef: React.MutableRefObject<{
    center: [number, number];
    zoom: number;
  } | null>;
  setIsFollowingUser: (isFollowingUser: boolean) => void;
  suppressMapMoved: () => void;
  commitCameraViewport: (
    payload: { center: [number, number]; zoom: number },
    options?: {
      allowDuringGesture?: boolean;
      animationMode?: 'none' | 'easeTo';
      animationDurationMs?: number;
      requestToken?: number | null;
    }
  ) => boolean;
};

export type ProfileNativeExecutionModel = {
  transitionExecutionModel: ProfileNativeTransitionExecutionModel;
  commandExecutionModel: ProfileNativeCommandExecutionModel;
};
