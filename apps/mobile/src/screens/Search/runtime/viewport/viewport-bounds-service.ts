import type { MutableRefObject } from 'react';
import type { MapBounds } from '../../../../types';
import type { LngLat, OverlapRegion } from '../../utils/overlap-region';

type BoundsSubscriber = (bounds: MapBounds | null) => void;

/** The camera scalars ({center, zoom}) from the SAME native viewport event as the stored
 *  bounds — one value, one instant, never assembled from two trackers. `center` is
 *  [lng, lat] (native event order). */
export type ViewportCameraState = {
  center: [number, number];
  zoom: number;
};

const cloneCamera = (camera: ViewportCameraState | null): ViewportCameraState | null =>
  camera ? { center: [camera.center[0], camera.center[1]], zoom: camera.zoom } : null;

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
  // The live camera ({center, zoom}) riding the same viewport events as `bounds`. The
  // event-payload writers (camera-changed + idle + perf commands) supply it atomically
  // with the bounds; bounds-only writers (native getVisibleBounds reads, static seeds)
  // omit it and the last event's camera stands — at any settled instant the two
  // coincide. This is THE camera source for commit-moment captures; nothing downstream
  // may pair these bounds with a camera read from a second tracker.
  private camera: ViewportCameraState | null = null;
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

  public setBounds(nextBounds: MapBounds | null, camera?: ViewportCameraState): boolean {
    // The camera lands even when the bounds dedupe below short-circuits: it belongs to
    // this event, and subscribers key on bounds — no notify for a camera-only refresh.
    // Deliberately NOT clearable here (no null): a bounds-only write keeps the last
    // event's camera; nothing legitimately un-knows the camera mid-session.
    if (camera !== undefined) {
      this.camera = cloneCamera(camera);
    }
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

  public getCamera(): ViewportCameraState | null {
    return cloneCamera(this.camera);
  }

  /** Pre-first-event seed (bootstrap startup camera): fills the camera ONLY while no
   *  viewport event has supplied one — a real event always wins. Closes the cold-start
   *  window where a deep-link search could commit before the map's first camera event
   *  (the commit-moment capture would otherwise carry a null camera). */
  public seedCamera(camera: ViewportCameraState): void {
    if (this.camera == null) {
      this.camera = cloneCamera(camera);
    }
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
