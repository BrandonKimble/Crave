import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { asId, type GeoPlaceId, type PlaceId, type UserId } from './ids';
import { codeOnly } from '../testing/code-only';

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
    const branded = asId<'place'>(raw);
    expect(branded).toBe(raw);
    expect(typeof branded).toBe('string');
  });

  it('cross-type transposition is a COMPILE error (documented here, enforced by tsc)', () => {
    const placeId = asId<'place'>('r') as PlaceId;
    const geoPlaceId = asId<'geo_place'>('p') as GeoPlaceId;
    const takes = (r: PlaceId, p: GeoPlaceId) => Boolean(r) && Boolean(p);

    expect(takes(placeId, geoPlaceId)).toBe(true);
    // @ts-expect-error transposed — this line failing to error means the
    // brand has been weakened (e.g. someone widened a param back to `string`).
    expect(takes(geoPlaceId, placeId)).toBe(true);
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
      const source = codeOnly(read(file));
      const at = source.indexOf(`async ${method}(`);
      expect({ method, found: at >= 0 }).toEqual({ method, found: true });

      // Read the PARAMETER LIST only — from the opening paren to its match.
      // The previous version sliced 260 chars and asked whether it contained
      // `{`, which is true of every method that has a BODY. Reverting
      // blockUser to positional therefore stayed green (red team 2026-08-02).
      const open = source.indexOf('(', at);
      let depth = 0;
      let close = open;
      for (let i = open; i < source.length; i++) {
        if (source[i] === '(') depth++;
        else if (source[i] === ')') {
          depth--;
          if (depth === 0) {
            close = i;
            break;
          }
        }
      }
      const params = source.slice(open + 1, close);

      // The participants must arrive as ONE destructured object, so order
      // carries no meaning. Two bare parameters — under ANY names, not just
      // ones ending in `Id`, since renaming to `blocker`/`blocked` was the
      // obvious evasion — is the shape being forbidden.
      const destructured = /^\s*\{/.test(params);
      expect({ method, destructured }).toEqual({ method, destructured: true });

      const topLevel = params.replace(/\{[^}]*\}/g, 'OBJ');
      const positionalPair =
        /\bOBJ\s*:\s*\{?|\w+\s*:\s*string\s*,\s*\w+\s*:\s*string/.test(
          topLevel.replace(/OBJ/g, ''),
        );
      expect({ method, positionalPair }).toEqual({
        method,
        positionalPair: false,
      });
    });
  }
});
