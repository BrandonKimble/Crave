import type { MutableRefObject } from 'react';
import type { MapBounds } from '../../../../types';
import type { LngLat, OverlapRegion } from '../../utils/overlap-region';

type BoundsSubscriber = (bounds: MapBounds | null) => void;

const cloneBounds = (bounds: MapBounds | null): MapBounds | null => {
  if (!bounds) {
    return null;
  }
  return {
    northEast: {
      lat: bounds.northEast.lat,
      lng: bounds.northEast.lng,
    },
    southWest: {
      lat: bounds.southWest.lat,
      lng: bounds.southWest.lng,
    },
  };
};

const areBoundsEqual = (left: MapBounds | null, right: MapBounds | null): boolean => {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.northEast.lat === right.northEast.lat &&
    left.northEast.lng === right.northEast.lng &&
    left.southWest.lat === right.southWest.lat &&
    left.southWest.lng === right.southWest.lng
  );
};

export class ViewportBoundsService {
  private bounds: MapBounds | null;
  // The submitted search viewport, single source of truth: the visible polygon (4
  // screen corners projected to lng/lat at submit — pitch/twist-accurate). The AABB
  // (searchBaselineBounds) is its bounding box, derived for coarse consumers
  // (move-detection, location anchor). The polygon arrives a tick after the sync AABB
  // (async corner projection), so searchBaselineBounds is set first and refined.
  private searchBaselineBounds: MapBounds | null = null;
  private submittedPolygon: LngLat[] | null = null;
  // The frozen overlap-allowed region for the active search (viewport or radius). Pins
  // inside it overlap/rank; outside it collision-cull/score. Resolved at submit time
  // (where userLocation + shortcut intent are known) and read by the source builder.
  private overlapRegion: OverlapRegion | null = null;
  private revision = 0;
  private readonly subscribers = new Set<BoundsSubscriber>();

  public readonly boundsRef: MutableRefObject<MapBounds | null>;

  constructor(initialBounds: MapBounds | null = null) {
    this.bounds = cloneBounds(initialBounds);
    const ref = {} as MutableRefObject<MapBounds | null>;
    Object.defineProperty(ref, 'current', {
      enumerable: true,
      configurable: false,
      get: () => this.bounds,
      set: (nextBounds: MapBounds | null) => {
        this.setBounds(nextBounds);
      },
    });
    this.boundsRef = ref;
  }

  public setBounds(nextBounds: MapBounds | null): boolean {
    if (areBoundsEqual(this.bounds, nextBounds)) {
      return false;
    }
    this.bounds = cloneBounds(nextBounds);
    this.revision += 1;
    const snapshot = this.getBounds();
    this.subscribers.forEach((subscriber) => {
      subscriber(snapshot);
    });
    return true;
  }

  public getBounds(): MapBounds | null {
    return cloneBounds(this.bounds);
  }

  public captureSearchBaseline(
    bounds: MapBounds | null = this.bounds,
    polygon: LngLat[] | null = null
  ): void {
    this.searchBaselineBounds = cloneBounds(bounds);
    this.submittedPolygon =
      polygon && polygon.length >= 3 ? polygon.map(([lng, lat]) => [lng, lat] as LngLat) : null;
  }

  public getSearchBaselineBounds(): MapBounds | null {
    return cloneBounds(this.searchBaselineBounds);
  }

  public getSubmittedPolygon(): LngLat[] | null {
    return this.submittedPolygon
      ? this.submittedPolygon.map(([lng, lat]) => [lng, lat] as LngLat)
      : null;
  }

  public setOverlapRegion(region: OverlapRegion | null): void {
    this.overlapRegion = region;
  }

  public getOverlapRegion(): OverlapRegion | null {
    return this.overlapRegion;
  }

  public getRevision(): number {
    return this.revision;
  }

  public subscribe(subscriber: BoundsSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }
}

export const createViewportBoundsService = (
  initialBounds: MapBounds | null = null
): ViewportBoundsService => new ViewportBoundsService(initialBounds);
