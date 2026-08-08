import { parseGroundGeoJson } from './places-catalog.service';

/**
 * parseGroundGeoJson THROWS on any shape a place_geometries (MultiPolygon/
 * Polygon) column cannot produce — there is NO bbox fallback (the columns were
 * removed in P4), so the only honest response to a malformed geometry is a loud
 * failure the caller's try/catch can log as "no candidates for this read"
 * (§2.6), never a silent per-row drop (F4952).
 */
describe('parseGroundGeoJson', () => {
  it('flattens a Polygon to its outer ring', () => {
    const ring = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ];
    expect(
      parseGroundGeoJson(
        JSON.stringify({ type: 'Polygon', coordinates: [ring] }),
      ),
    ).toEqual([ring]);
  });

  it('flattens a MultiPolygon to outer rings', () => {
    const ring = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 0],
    ];
    expect(
      parseGroundGeoJson(
        JSON.stringify({ type: 'MultiPolygon', coordinates: [[ring]] }),
      ),
    ).toEqual([ring]);
  });

  it('THROWS on an unexpected geometry type (was a silent null → dropped row)', () => {
    expect(() => parseGroundGeoJson('{"type":"GeometryCollection"}')).toThrow(
      /unexpected geometry type/,
    );
  });

  it('THROWS on malformed JSON rather than swallowing it', () => {
    expect(() => parseGroundGeoJson('not json')).toThrow();
  });

  it('THROWS on a Polygon with no usable ring', () => {
    expect(() =>
      parseGroundGeoJson(
        JSON.stringify({ type: 'Polygon', coordinates: [[[0, 0]]] }),
      ),
    ).toThrow(/no usable outer ring/);
  });
});
