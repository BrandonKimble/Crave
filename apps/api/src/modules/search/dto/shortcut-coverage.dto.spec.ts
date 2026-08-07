import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ShortcutCoverageRequestDto } from './shortcut-coverage.dto';

/**
 * The viewportPolygon is interpolated one ST_MakePoint per point into the
 * coverage SQL text, so its length MUST be bounded at the DTO edge. The client
 * only ever sends the four screen corners; the cap is 8. Without @ArrayMaxSize
 * a client-supplied 10k-point polygon becomes a 10k-term SQL string.
 */
const baseBounds = {
  northEast: { lat: 30.4, lng: -97.6 },
  southWest: { lat: 30.1, lng: -97.9 },
};

function makeDto(polygon: Array<[number, number]>): ShortcutCoverageRequestDto {
  return plainToInstance(ShortcutCoverageRequestDto, {
    bounds: baseBounds,
    viewportPolygon: polygon,
  });
}

describe('ShortcutCoverageRequestDto viewportPolygon bound', () => {
  it('accepts the real four-corner quad', async () => {
    const errors = await validate(
      makeDto([
        [-97.9, 30.1],
        [-97.6, 30.1],
        [-97.6, 30.4],
        [-97.9, 30.4],
      ]),
    );
    expect(errors).toHaveLength(0);
  });

  it('accepts up to the cap of 8 points', async () => {
    const eight: Array<[number, number]> = Array.from({ length: 8 }, (_, i) => [
      -97.9 + i * 0.01,
      30.1 + i * 0.01,
    ]);
    const errors = await validate(makeDto(eight));
    expect(errors).toHaveLength(0);
  });

  it('rejects a polygon longer than the cap (the unbounded-SQL abuse)', async () => {
    const overflow: Array<[number, number]> = Array.from(
      { length: 9 },
      (_, i) => [-97.9 + i * 0.01, 30.1 + i * 0.01],
    );
    const errors = await validate(makeDto(overflow));
    const polygonError = errors.find((e) => e.property === 'viewportPolygon');
    expect(polygonError).toBeDefined();
    expect(polygonError?.constraints).toHaveProperty('arrayMaxSize');
  });
});
