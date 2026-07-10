import type { CameraIntentArbiter } from '../map/camera-intent-arbiter';
import type { CameraSnapshot } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';
import type { ProfileNativeCommandExecutionModel } from './profile-native-command-runtime';
import type { ProfileNativeTransitionExecutionModel } from './profile-native-transition-runtime';

export type ProfileNativeExecutionArgs = {
  emitRuntimeMechanismEvent: (
    event: 'profile_intent_cancelled',
    payload: Record<string, unknown>
  ) => void;
  cameraIntentArbiter: CameraIntentArbiter;
  profileCameraAnimationMs: number;
  lastCameraStateRef: React.MutableRefObject<{
    center: [number, number];
    zoom: number;
  } | null>;
  setIsFollowingUser: (isFollowingUser: boolean) => void;
  suppressMapMoved: () => void;
  commitCameraViewport: (
    payload: { center: [number, number]; zoom: number; padding?: CameraSnapshot['padding'] },
    options?: {
      allowDuringGesture?: boolean;
      animationMode?: 'none' | 'easeTo';
      animationDurationMs?: number;
      requestToken?: number | null;
      deferControlledCameraStateUntilCompletion?: boolean;
    }
  ) => boolean;
};

export type ProfileNativeExecutionModel = {
  transitionExecutionModel: ProfileNativeTransitionExecutionModel;
  commandExecutionModel: ProfileNativeCommandExecutionModel;
};
