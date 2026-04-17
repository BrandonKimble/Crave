type Position = { lat: number; lng: number };

export const pointWithinBounds = (
  point: Position,
  bounds:
    | {
        northEast: Position;
        southWest: Position;
      }
    | null
    | undefined,
): boolean => {
  if (!bounds) {
    return false;
  }

  return (
    point.lat <= bounds.northEast.lat &&
    point.lat >= bounds.southWest.lat &&
    point.lng <= bounds.northEast.lng &&
    point.lng >= bounds.southWest.lng
  );
};
