export type CameraIntent = {
  center: [number, number];
  zoom: number;
  allowDuringGesture?: boolean;
};

export type CameraIntentArbiterWriters = {
  setMapCenter: (center: [number, number]) => void;
  setMapZoom: (zoom: number) => void;
};

export class CameraIntentArbiter {
  private gestureActive = false;

  constructor(private readonly writers: CameraIntentArbiterWriters) {}

  public setGestureActive(isActive: boolean): void {
    this.gestureActive = isActive;
  }

  public commit(intent: CameraIntent): boolean {
    if (this.gestureActive && intent.allowDuringGesture !== true) {
      return false;
    }
    this.writers.setMapCenter(intent.center);
    this.writers.setMapZoom(intent.zoom);
    return true;
  }
}

export const createCameraIntentArbiter = (
  writers: CameraIntentArbiterWriters
): CameraIntentArbiter => new CameraIntentArbiter(writers);
