/**
 * F3715: the stage-1 poll dedup gate MUST FAIL LOUD, never open.
 *
 * `checkPollDuplicate` feeds a DECISION: PollCreationPanel reads `matches[0]`
 * and, if it is falsy, routes straight to `createPoll`. The old body ended
 * `matches: Array.isArray(data.matches) ? data.matches : []`, so a response
 * that is NOT the contract — a route rename, a wrapper envelope, a 200 proxy
 * error page — was indistinguishable from "this question is new", silently
 * minting the duplicate the check exists to prevent.
 *
 * These tests would BOTH have passed with the `?? []` fallback (a malformed
 * shape returned `{ matches: [] }` with no throw). They can only go RED —
 * i.e. the fallback can only be caught — because the gate now throws a
 * WireShapeError on any non-contract shape. RED recipe: restore the
 * `Array.isArray(data.matches) ? data.matches : []` line and the malformed
 * cases below fail (they resolve to `{ matches: [] }` instead of throwing).
 */
jest.mock('./api', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
  },
  SILENT: {},
}));

import api from './api';
import { checkPollDuplicate } from './polls';
import { WireShapeError } from './expect-shape';

const post = api.post as jest.Mock;

describe('checkPollDuplicate — the dedup gate fails loud on a shape break (F3715)', () => {
  beforeEach(() => post.mockReset());

  it('returns the matches when the server honors the contract', async () => {
    post.mockResolvedValue({
      data: { matches: [{ pollId: 'p1', question: 'Best tacos?', similarity: 0.9 }] },
    });
    const { matches } = await checkPollDuplicate({ question: 'Best tacos?' });
    expect(matches).toHaveLength(1);
    expect(matches[0].pollId).toBe('p1');
  });

  it('THROWS on an empty-envelope shape break (a 200 with no `matches`) — never "no duplicate"', async () => {
    // The exact defect: a proxy/route change answers 200 with `{}`. The old
    // fallback made this "this question is new" and the duplicate was minted.
    post.mockResolvedValue({ data: {} });
    await expect(checkPollDuplicate({ question: 'Best tacos?' })).rejects.toBeInstanceOf(
      WireShapeError
    );
  });

  it('THROWS when `matches` is present but the wrong type (a wrapper envelope)', async () => {
    post.mockResolvedValue({ data: { matches: { items: [] } } });
    await expect(checkPollDuplicate({ question: 'Best tacos?' })).rejects.toBeInstanceOf(
      WireShapeError
    );
  });

  it('THROWS when the body itself is not an object (a proxy error page / null)', async () => {
    post.mockResolvedValue({ data: null });
    await expect(checkPollDuplicate({ question: 'Best tacos?' })).rejects.toBeInstanceOf(
      WireShapeError
    );
  });
});
