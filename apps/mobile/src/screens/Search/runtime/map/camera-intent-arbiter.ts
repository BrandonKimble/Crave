import { withSearchNavSwitchRuntimeAttribution } from '../shared/search-nav-switch-runtime-attribution';
import type { CameraSnapshot } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';

export type CameraIntent = {
  center: [number, number];
  zoom: number;
  padding?: CameraSnapshot['padding'];
  animationMode?: 'none' | 'easeTo';
  animationDurationMs?: number;
  allowDuringGesture?: boolean;
  requestToken?: number | null;
  deferControlledCameraStateUntilCompletion?: boolean;
};

type RawProgrammaticCameraAnimationCompletionPayload = {
  animationCompletionId: string | null;
  status: 'finished' | 'cancelled';
};

export type ProgrammaticCameraAnimationCompletionPayload =
  RawProgrammaticCameraAnimationCompletionPayload & {
    requestToken: number | null;
  };

export type CameraIntentArbiterWriters = {
  commandCameraViewport?: (
    intent: CameraIntent & {
      completionId: string | null;
      onCommandRejected: (completionId: string | null) => void;
    }
  ) => boolean;
  setMapCenter: (center: [number, number]) => void;
  setMapZoom: (zoom: number) => void;
  setMapCameraAnimation: (animation: {
    mode: 'none' | 'easeTo';
    durationMs: number;
    completionId: string | null;
  }) => void;
};

export class CameraIntentArbiter {
  private gestureActive = false;
  private pendingProgrammaticCameraCompletionId: string | null = null;
  private pendingProgrammaticCameraRequestToken: number | null = null;
  private pendingControlledCameraStateSync: {
    completionId: string;
    center: [number, number];
    zoom: number;
    shouldSyncPadding: boolean;
    padding: CameraSnapshot['padding'];
  } | null = null;
  private nextProgrammaticCameraCompletionSeq = 0;
  private readonly programmaticCameraAnimationCompletionListeners = new Set<
    (payload: ProgrammaticCameraAnimationCompletionPayload) => void
  >();
  private onProgrammaticCameraAnimationComplete:
    | ((payload: ProgrammaticCameraAnimationCompletionPayload) => void)
    | null = null;
  private controlledCameraPaddingSyncHandler:
    | ((padding: CameraSnapshot['padding']) => void)
    | null = null;

  constructor(private readonly writers: CameraIntentArbiterWriters) {}

  public setProgrammaticCameraAnimationCompletionHandler(
    handler: ((payload: ProgrammaticCameraAnimationCompletionPayload) => void) | null
  ): void {
    this.onProgrammaticCameraAnimationComplete = handler;
  }

  public setControlledCameraPaddingSyncHandler(
    handler: ((padding: CameraSnapshot['padding']) => void) | null
  ): void {
    this.controlledCameraPaddingSyncHandler = handler;
  }

  public subscribeProgrammaticCameraAnimationCompletion(
    handler: (payload: ProgrammaticCameraAnimationCompletionPayload) => void
  ): () => void {
    this.programmaticCameraAnimationCompletionListeners.add(handler);
    return () => {
      this.programmaticCameraAnimationCompletionListeners.delete(handler);
    };
  }

  private notifyProgrammaticCameraAnimationCompletion(
    payload: ProgrammaticCameraAnimationCompletionPayload
  ): void {
    withSearchNavSwitchRuntimeAttribution('cameraIntentArbiter', 'notifyCompletion', () => {
      this.onProgrammaticCameraAnimationComplete?.(payload);
      this.programmaticCameraAnimationCompletionListeners.forEach((listener) => {
        listener(payload);
      });
    });
  }

  public setGestureActive(isActive: boolean): void {
    withSearchNavSwitchRuntimeAttribution('cameraIntentArbiter', 'setGestureActive', () => {
      this.gestureActive = isActive;
      if (!isActive || this.pendingProgrammaticCameraCompletionId == null) {
        return;
      }
      const cancelledCompletionId = this.pendingProgrammaticCameraCompletionId;
      const cancelledRequestToken = this.pendingProgrammaticCameraRequestToken;
      this.pendingProgrammaticCameraCompletionId = null;
      this.pendingProgrammaticCameraRequestToken = null;
      this.pendingControlledCameraStateSync = null;
      this.notifyProgrammaticCameraAnimationCompletion({
        animationCompletionId: cancelledCompletionId,
        status: 'cancelled',
        requestToken: cancelledRequestToken,
      });
    });
  }

  public commit(intent: CameraIntent): boolean {
    return withSearchNavSwitchRuntimeAttribution('cameraIntentArbiter', 'commit', () => {
      if (this.gestureActive && intent.allowDuringGesture !== true) {
        return false;
      }
      const animationMode = intent.animationMode ?? 'none';
      const animation = {
        mode: animationMode,
        durationMs:
          typeof intent.animationDurationMs === 'number' &&
          Number.isFinite(intent.animationDurationMs)
            ? Math.max(0, intent.animationDurationMs)
            : 0,
        completionId:
          animationMode === 'none'
            ? null
            : `camera-animation:${(this.nextProgrammaticCameraCompletionSeq += 1)}`,
      };
      const completionId = animation.completionId;
      const shouldSyncPadding = Object.prototype.hasOwnProperty.call(intent, 'padding');
      this.pendingProgrammaticCameraCompletionId = completionId;
      this.pendingProgrammaticCameraRequestToken = intent.requestToken ?? null;
      this.pendingControlledCameraStateSync = null;
      if (
        this.writers.commandCameraViewport?.({
          ...intent,
          completionId,
          onCommandRejected: (rejectedCompletionId) => {
            this.handleProgrammaticCameraAnimationCompletion({
              animationCompletionId: rejectedCompletionId,
              status: 'cancelled',
            });
          },
        }) === true
      ) {
        if (intent.deferControlledCameraStateUntilCompletion && completionId) {
          this.pendingControlledCameraStateSync = {
            completionId,
            center: intent.center,
            zoom: intent.zoom,
            shouldSyncPadding,
            padding: intent.padding ?? null,
          };
          return true;
        }
        this.writers.setMapCameraAnimation(animation);
        if (shouldSyncPadding) {
          this.controlledCameraPaddingSyncHandler?.(intent.padding ?? null);
        }
        this.writers.setMapCenter(intent.center);
        this.writers.setMapZoom(intent.zoom);
        return true;
      }
      this.writers.setMapCameraAnimation(animation);
      if (shouldSyncPadding) {
        this.controlledCameraPaddingSyncHandler?.(intent.padding ?? null);
      }
      this.writers.setMapCenter(intent.center);
      this.writers.setMapZoom(intent.zoom);
      return true;
    });
  }

  public consumeProgrammaticCameraCompletion(completionId: string | null): boolean {
    if (
      !completionId ||
      this.gestureActive ||
      this.pendingProgrammaticCameraCompletionId !== completionId
    ) {
      return false;
    }
    this.pendingProgrammaticCameraCompletionId = null;
    this.pendingProgrammaticCameraRequestToken = null;
    return true;
  }

  private flushControlledCameraStateSync(
    completionId: string | null,
    status: 'finished' | 'cancelled'
  ): void {
    const pendingSync = this.pendingControlledCameraStateSync;
    if (!pendingSync || pendingSync.completionId !== completionId) {
      return;
    }
    this.pendingControlledCameraStateSync = null;
    if (status !== 'finished') {
      return;
    }
    this.writers.setMapCameraAnimation({
      mode: 'none',
      durationMs: 0,
      completionId: null,
    });
    if (pendingSync.shouldSyncPadding) {
      this.controlledCameraPaddingSyncHandler?.(pendingSync.padding);
    }
    this.writers.setMapCenter(pendingSync.center);
    this.writers.setMapZoom(pendingSync.zoom);
  }

  public handleProgrammaticCameraAnimationCompletion(
    payload: RawProgrammaticCameraAnimationCompletionPayload
  ): boolean {
    return withSearchNavSwitchRuntimeAttribution('cameraIntentArbiter', 'handleCompletion', () => {
      const requestToken = this.pendingProgrammaticCameraRequestToken;
      if (!this.consumeProgrammaticCameraCompletion(payload.animationCompletionId)) {
        return false;
      }
      this.flushControlledCameraStateSync(payload.animationCompletionId, payload.status);
      this.notifyProgrammaticCameraAnimationCompletion({
        ...payload,
        requestToken,
      });
      return true;
    });
  }

  public resolvePendingProgrammaticCameraAnimation(
    status: 'finished' | 'cancelled' = 'finished'
  ): boolean {
    return withSearchNavSwitchRuntimeAttribution(
      'cameraIntentArbiter',
      'resolvePendingCompletion',
      () => {
        const completionId = this.pendingProgrammaticCameraCompletionId;
        if (!completionId) {
          return false;
        }
        return this.handleProgrammaticCameraAnimationCompletion({
          animationCompletionId: completionId,
          status,
        });
      }
    );
  }

  public syncObservedCameraViewport({
    center,
    zoom,
  }: {
    center: [number, number];
    zoom: number;
  }): boolean {
    return withSearchNavSwitchRuntimeAttribution(
      'cameraIntentArbiter',
      'syncObservedCameraViewport',
      () => {
        if (this.pendingProgrammaticCameraCompletionId != null) {
          return false;
        }
        this.writers.setMapCameraAnimation({
          mode: 'none',
          durationMs: 0,
          completionId: null,
        });
        this.writers.setMapCenter(center);
        this.writers.setMapZoom(zoom);
        return true;
      }
    );
  }

  public hasPendingProgrammaticCameraCompletion(): boolean {
    return this.pendingProgrammaticCameraCompletionId != null;
  }
}

export const createCameraIntentArbiter = (
  writers: CameraIntentArbiterWriters
): CameraIntentArbiter => new CameraIntentArbiter(writers);
