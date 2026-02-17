import type { MutableRefObject } from 'react';
import type { MapBounds } from '../../../../types';

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
  private searchBaselineBounds: MapBounds | null = null;
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

  public captureSearchBaseline(bounds: MapBounds | null = this.bounds): void {
    this.searchBaselineBounds = cloneBounds(bounds);
  }

  public getSearchBaselineBounds(): MapBounds | null {
    return cloneBounds(this.searchBaselineBounds);
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
