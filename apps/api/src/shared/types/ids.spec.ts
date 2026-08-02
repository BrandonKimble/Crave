import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { asId, type PlaceId, type RestaurantId, type UserId } from './ids';

// TWO FAILURE MODES, TWO MECHANISMS.
//
// Measured across apps/api: 93 signatures take two or more distinct id
// parameters, every one of them a bare `string`, so transposition type-checks
// perfectly and the values are opaque uuids that survive review.
//
// Branding separates DIFFERENT entity types. It cannot separate two ids of the
// SAME type — `blockUser(blockerUserId, blockedUserId)` is two UserIds — and
// those are the more dangerous ones, because transposing blocks the wrong
// person. Same-type pairs take a named object parameter instead, so order
// stops carrying meaning at all.

describe('branded ids', () => {
  it('a brand is erased at runtime — it costs nothing', () => {
    const raw = '11111111-1111-1111-1111-111111111111';
    const branded = asId<'restaurant'>(raw);
    expect(branded).toBe(raw);
    expect(typeof branded).toBe('string');
  });

  it('cross-type transposition is a COMPILE error (documented here, enforced by tsc)', () => {
    const restaurantId = asId<'restaurant'>('r') as RestaurantId;
    const placeId = asId<'place'>('p') as PlaceId;
    const takes = (r: RestaurantId, p: PlaceId) => Boolean(r) && Boolean(p);

    expect(takes(restaurantId, placeId)).toBe(true);
    // @ts-expect-error transposed — this line failing to error means the
    // brand has been weakened (e.g. someone widened a param back to `string`).
    expect(takes(placeId, restaurantId)).toBe(true);
  });

  it('a branded id still behaves as a string everywhere it must', () => {
    const userId: UserId = asId<'user'>('abc');
    expect(userId.toUpperCase()).toBe('ABC');
    expect(`${userId}`).toBe('abc');
    expect([userId].join(',')).toBe('abc');
  });
});

describe('same-type id pairs take named participants', () => {
  const dir = join(__dirname, '..', '..', 'modules', 'identity');
  const read = (f: string) => readFileSync(join(dir, f), 'utf8');

  // These take two ids of the SAME entity type, so branding is blind to them.
  // Positional parameters would let a transposition block, follow, or report
  // the wrong person with no signal anywhere.
  const cases: Array<[string, string]> = [
    ['user-block.service.ts', 'blockUser'],
    ['user-block.service.ts', 'unblockUser'],
    ['user-follow.service.ts', 'followUser'],
    ['user-follow.service.ts', 'unfollowUser'],
    ['user-report.service.ts', 'reportUser'],
  ];

  for (const [file, method] of cases) {
    it(`${method} cannot be called positionally`, () => {
      const source = read(file);
      const at = source.indexOf(`async ${method}(`);
      expect({ method, found: at >= 0 }).toEqual({ method, found: true });
      // The signature must destructure an object, not accept `x: string,`
      // followed by another id.
      const signature = source.slice(at, at + 260);
      expect({ method, destructured: signature.includes('{') }).toEqual({
        method,
        destructured: true,
      });
      const positionalIdPair =
        /\(\s*\w*[Ii]d\s*:\s*string\s*,\s*\w*[Ii]d\s*:\s*string/.test(
          signature,
        );
      expect({ method, positionalIdPair }).toEqual({
        method,
        positionalIdPair: false,
      });
    });
  }
});
