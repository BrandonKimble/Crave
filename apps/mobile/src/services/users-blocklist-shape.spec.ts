/**
 * F3716 — THE BOUNDARY LAW ON A PRIVACY SURFACE.
 *
 * `listMyBlocks` feeds Settings → Privacy. The old body ended `response.data ?? []`,
 * so a non-array wire shape (a route rename, a wrapper envelope, a 200 proxy error
 * page) rendered as "you have blocked nobody" — materially different from "we could
 * not read your block list", and indistinguishable to the user. It now validates at
 * the boundary via expectArray, so a broken shape THROWS instead of fabricating empty.
 *
 * RED recipe: restore `return response.data ?? []` in users.ts and the malformed
 * cases below fail (they resolve to `[]` instead of throwing WireShapeError).
 */
jest.mock('./api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
  SILENT: {},
}));

import api from './api';
import { usersService } from './users';
import { WireShapeError } from './expect-shape';

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;

describe('usersService boundary validation (F3716)', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });

  it('listMyBlocks returns the array when the server honors the contract', async () => {
    get.mockResolvedValue({ data: [{ userId: 'u1', username: 'a' }] });
    await expect(usersService.listMyBlocks()).resolves.toEqual([{ userId: 'u1', username: 'a' }]);
  });

  it('listMyBlocks THROWS on a malformed block list — never renders empty-as-fact', async () => {
    get.mockResolvedValue({ data: {} });
    await expect(usersService.listMyBlocks()).rejects.toBeInstanceOf(WireShapeError);
  });

  it('listFollowers throws on a non-array shape', async () => {
    get.mockResolvedValue({ data: { followers: [] } });
    await expect(usersService.listFollowers('u1')).rejects.toBeInstanceOf(WireShapeError);
  });

  it('suggestUsername throws when suggestions is not an array', async () => {
    post.mockResolvedValue({ data: {} });
    await expect(usersService.suggestUsername('x')).rejects.toBeInstanceOf(WireShapeError);
  });
});
