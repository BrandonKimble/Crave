export type MainMapReadinessSnapshot = {
  cameraApplied: boolean;
  mapLoaded: boolean;
  fullyRendered: boolean;
};

const EMPTY_MAIN_MAP_READINESS_SNAPSHOT: MainMapReadinessSnapshot = {
  cameraApplied: false,
  mapLoaded: false,
  fullyRendered: false,
};

export class MainMapReadinessAuthority {
  private snapshot = EMPTY_MAIN_MAP_READINESS_SNAPSHOT;

  public getSnapshot(): MainMapReadinessSnapshot {
    return this.snapshot;
  }

  public reset(): boolean {
    if (!this.snapshot.cameraApplied && !this.snapshot.mapLoaded && !this.snapshot.fullyRendered) {
      return false;
    }
    this.snapshot = EMPTY_MAIN_MAP_READINESS_SNAPSHOT;
    return true;
  }

  public markCameraApplied(): boolean {
    return this.patchSnapshot({ cameraApplied: true });
  }

  public markMapLoaded(): boolean {
    return this.patchSnapshot({ mapLoaded: true });
  }

  public markFullyRendered(): boolean {
    return this.patchSnapshot({ fullyRendered: true });
  }

  public isReady(): boolean {
    return this.snapshot.cameraApplied && (this.snapshot.mapLoaded || this.snapshot.fullyRendered);
  }

  private patchSnapshot(partial: Partial<MainMapReadinessSnapshot>): boolean {
    const nextSnapshot: MainMapReadinessSnapshot = {
      ...this.snapshot,
      ...partial,
    };
    if (
      nextSnapshot.cameraApplied === this.snapshot.cameraApplied &&
      nextSnapshot.mapLoaded === this.snapshot.mapLoaded &&
      nextSnapshot.fullyRendered === this.snapshot.fullyRendered
    ) {
      return false;
    }
    this.snapshot = nextSnapshot;
    return true;
  }
}

export const createMainMapReadinessAuthority = (): MainMapReadinessAuthority =>
  new MainMapReadinessAuthority();
