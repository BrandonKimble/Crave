import type { MapBounds } from '../../../../types';

type SpatialEntryKeyResolver<TEntry> = (entry: TEntry) => string;
type SpatialEntryCoordinateResolver<TEntry> = (entry: TEntry) => [number, number];

type MapSpatialIndexOptions = {
  cellSizeDegrees?: number;
};

const DEFAULT_CELL_SIZE_DEGREES = 0.05;

const toCellIndex = (value: number, cellSizeDegrees: number): number =>
  Math.floor(value / cellSizeDegrees);

const toBucketKey = (x: number, y: number): string => `${x}:${y}`;

const isInsideBounds = (coordinate: [number, number], bounds: MapBounds): boolean => {
  const [lng, lat] = coordinate;
  return (
    lat >= bounds.southWest.lat &&
    lat <= bounds.northEast.lat &&
    lng >= bounds.southWest.lng &&
    lng <= bounds.northEast.lng
  );
};

export class MapSpatialIndex<TEntry> {
  private readonly cellSizeDegrees: number;
  private readonly buckets = new Map<string, TEntry[]>();

  constructor(
    private readonly resolveEntryKey: SpatialEntryKeyResolver<TEntry>,
    private readonly resolveCoordinate: SpatialEntryCoordinateResolver<TEntry>,
    options: MapSpatialIndexOptions = {}
  ) {
    const configuredCellSize = options.cellSizeDegrees ?? DEFAULT_CELL_SIZE_DEGREES;
    this.cellSizeDegrees = configuredCellSize > 0 ? configuredCellSize : DEFAULT_CELL_SIZE_DEGREES;
  }

  public rebuild(entries: readonly TEntry[]): void {
    this.buckets.clear();
    entries.forEach((entry) => {
      const [lng, lat] = this.resolveCoordinate(entry);
      const bucketX = toCellIndex(lng, this.cellSizeDegrees);
      const bucketY = toCellIndex(lat, this.cellSizeDegrees);
      const bucketKey = toBucketKey(bucketX, bucketY);
      const bucket = this.buckets.get(bucketKey);
      if (bucket) {
        bucket.push(entry);
        return;
      }
      this.buckets.set(bucketKey, [entry]);
    });
  }

  public query(bounds: MapBounds): TEntry[] {
    const minX = toCellIndex(bounds.southWest.lng, this.cellSizeDegrees);
    const maxX = toCellIndex(bounds.northEast.lng, this.cellSizeDegrees);
    const minY = toCellIndex(bounds.southWest.lat, this.cellSizeDegrees);
    const maxY = toCellIndex(bounds.northEast.lat, this.cellSizeDegrees);

    const seenKeys = new Set<string>();
    const matches: TEntry[] = [];
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        const bucket = this.buckets.get(toBucketKey(x, y));
        if (!bucket || bucket.length === 0) {
          continue;
        }
        bucket.forEach((entry) => {
          const entryKey = this.resolveEntryKey(entry);
          if (seenKeys.has(entryKey)) {
            return;
          }
          if (!isInsideBounds(this.resolveCoordinate(entry), bounds)) {
            return;
          }
          seenKeys.add(entryKey);
          matches.push(entry);
        });
      }
    }
    return matches;
  }
}
