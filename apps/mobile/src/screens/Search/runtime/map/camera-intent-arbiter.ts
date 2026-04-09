export type CameraIntent = {
  center: [number, number];
  zoom: number;
  animationMode?: 'none' | 'easeTo';
  animationDurationMs?: number;
  allowDuringGesture?: boolean;
  requestToken?: number | null;
};

type RawProgrammaticCameraAnimationCompletionPayload = {
  animationCompletionId: string | null;
  status: 'finished' | 'cancelled';
};

type ProgrammaticCameraAnimationCompletionPayload =
  RawProgrammaticCameraAnimationCompletionPayload & {
    requestToken: number | null;
  };

export type CameraIntentArbiterWriters = {
  commandCameraViewport?: (intent: CameraIntent & { completionId: string | null }) => boolean;
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
  private nextProgrammaticCameraCompletionSeq = 0;
  private onProgrammaticCameraAnimationComplete:
    | ((payload: ProgrammaticCameraAnimationCompletionPayload) => void)
    | null = null;

  constructor(private readonly writers: CameraIntentArbiterWriters) {}

  public setProgrammaticCameraAnimationCompletionHandler(
    handler: ((payload: ProgrammaticCameraAnimationCompletionPayload) => void) | null
  ): void {
    this.onProgrammaticCameraAnimationComplete = handler;
  }

  public setGestureActive(isActive: boolean): void {
    this.gestureActive = isActive;
    if (!isActive || this.pendingProgrammaticCameraCompletionId == null) {
      return;
    }
    const cancelledCompletionId = this.pendingProgrammaticCameraCompletionId;
    const cancelledRequestToken = this.pendingProgrammaticCameraRequestToken;
    this.pendingProgrammaticCameraCompletionId = null;
    this.pendingProgrammaticCameraRequestToken = null;
    this.onProgrammaticCameraAnimationComplete?.({
      animationCompletionId: cancelledCompletionId,
      status: 'cancelled',
      requestToken: cancelledRequestToken,
    });
  }

  public commit(intent: CameraIntent): boolean {
    if (this.gestureActive && intent.allowDuringGesture !== true) {
      return false;
    }
    const animationMode = intent.animationMode ?? 'none';
    const completionId =
      animationMode === 'none'
        ? null
        : `camera-animation:${(this.nextProgrammaticCameraCompletionSeq += 1)}`;
    this.pendingProgrammaticCameraCompletionId = completionId;
    this.pendingProgrammaticCameraRequestToken = intent.requestToken ?? null;
    if (
      this.writers.commandCameraViewport?.({
        ...intent,
        completionId,
      }) === true
    ) {
      return true;
    }
    this.writers.setMapCameraAnimation({
      mode: animationMode,
      durationMs:
        typeof intent.animationDurationMs === 'number' &&
        Number.isFinite(intent.animationDurationMs)
          ? Math.max(0, intent.animationDurationMs)
          : 0,
      completionId,
    });
    this.writers.setMapCenter(intent.center);
    this.writers.setMapZoom(intent.zoom);
    return true;
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

  public handleProgrammaticCameraAnimationCompletion(
    payload: RawProgrammaticCameraAnimationCompletionPayload
  ): boolean {
    const requestToken = this.pendingProgrammaticCameraRequestToken;
    if (!this.consumeProgrammaticCameraCompletion(payload.animationCompletionId)) {
      return false;
    }
    this.onProgrammaticCameraAnimationComplete?.({
      ...payload,
      requestToken,
    });
    return true;
  }

  public hasPendingProgrammaticCameraCompletion(): boolean {
    return this.pendingProgrammaticCameraCompletionId != null;
  }
}

export const createCameraIntentArbiter = (
  writers: CameraIntentArbiterWriters
): CameraIntentArbiter => new CameraIntentArbiter(writers);
