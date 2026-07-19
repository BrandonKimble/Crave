/**
 * §6 CURSOR PAGINATION for the polls feed — a stable KEYSET cursor (the
 * take-25 hard limit is dead). The keyset is the sort's full ordering tuple,
 * closed by the immutable (createdAt, pollId) pair so pages can neither skip
 * nor duplicate rows when new polls insert mid-pagination:
 *
 *   new      → (createdAt, pollId)                       — fully immutable.
 *   top      → (engagers, createdAt, pollId)             — engagers may move
 *              between pages (live votes); drift is bounded to rows whose
 *              count crossed the cursor value, and a moved row appears at
 *              most once per crossing (documented, accepted — engagement is
 *              live data).
 *   trending → (heat@refEpoch, createdAt, pollId)        — heat is computed
 *              AGAINST THE CURSOR'S REFERENCE EPOCH on every later page, so
 *              pure time-decay (a uniform e^(−λΔt) rescale) cannot reorder
 *              or duplicate; only NEW engagement moves rows, same bounded
 *              drift as `top`.
 *
 * The cursor is an opaque base64url JSON envelope stamped with its sort; a
 * cursor replayed under a different sort (or garbage) is a 400, never a
 * silently-wrong page.
 */
import { BadRequestException } from '@nestjs/common';
import { PollListSort } from './dto/list-polls.dto';

export type PollFeedCursor =
  | { sort: PollListSort.new; createdAtMs: number; pollId: string }
  | {
      sort: PollListSort.top;
      metric: number;
      createdAtMs: number;
      pollId: string;
    }
  | {
      sort: PollListSort.trending;
      /** Fixed reference epoch (ms) the heat metric is computed against. */
      refMs: number;
      metric: number;
      createdAtMs: number;
      pollId: string;
    };

export function encodePollFeedCursor(cursor: PollFeedCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function decodePollFeedCursor(
  raw: string,
  sort: PollListSort,
): PollFeedCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException('Malformed feed cursor');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new BadRequestException('Malformed feed cursor');
  }
  const cursor = parsed as Record<string, unknown>;
  if (cursor.sort !== sort) {
    throw new BadRequestException(
      'Feed cursor does not match the requested sort',
    );
  }
  if (
    !isFiniteNumber(cursor.createdAtMs) ||
    typeof cursor.pollId !== 'string'
  ) {
    throw new BadRequestException('Malformed feed cursor');
  }
  if (sort === PollListSort.new) {
    return {
      sort,
      createdAtMs: cursor.createdAtMs,
      pollId: cursor.pollId,
    };
  }
  if (!isFiniteNumber(cursor.metric)) {
    throw new BadRequestException('Malformed feed cursor');
  }
  if (sort === PollListSort.top) {
    return {
      sort,
      metric: cursor.metric,
      createdAtMs: cursor.createdAtMs,
      pollId: cursor.pollId,
    };
  }
  if (!isFiniteNumber(cursor.refMs)) {
    throw new BadRequestException('Malformed feed cursor');
  }
  return {
    sort: PollListSort.trending,
    refMs: cursor.refMs,
    metric: cursor.metric,
    createdAtMs: cursor.createdAtMs,
    pollId: cursor.pollId,
  };
}
