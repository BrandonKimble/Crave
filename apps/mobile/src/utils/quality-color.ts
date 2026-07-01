type RgbTuple = [number, number, number];
import palette from '../constants/score-bucket-palette.json';

// ---------------------------------------------------------------------------
// SCORE BUCKETS — single source of truth for the discrete pin/pill/dot colors.
//
// The map pin is a pre-baked sprite per bucket (scripts/generate-pin-bucket-sprites.js)
// and the result-list rank pills + dots must match their pin EXACTLY, so all three
// derive color from THIS module — and from the canonical palette JSON below — never
// from a per-call continuous gradient.
//
// Display scores span the FLAT 0–10 native scale (public-crave-score). We use TEN
// deciles aligned to the integer rating so color carries fine-grained, intuitive
// signal: tier i covers rating [i, i+1). The ramp runs orange-red (lowest) → green
// (best). Colors are NOT hand-coded here — they come from
// apps/mobile/src/constants/score-bucket-palette.json (key "default"), the same file
// the sprite generators read so pins/dots/pills stay in lockstep. A future colorblind
// (viridis) toggle is available in that file's "colorblind" key — NOT wired at runtime yet.
// ---------------------------------------------------------------------------
export type ScoreBucket = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9; // 0 = [0,1) low … 9 = [9,10] best

export const SCORE_BUCKET_DISPLAY_MIN = 0;
export const SCORE_BUCKET_DISPLAY_MAX = 10;

// Decile aligned to the integer rating: tier = clamp(floor(score), 0, 9).
// null/NaN default to bucket 0. Thresholds: bucket i = scores in [i, i+1), with 10.0 → 9.
export const scoreToBucket = (score?: number | null): ScoreBucket => {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 0;
  return Math.min(9, Math.max(0, Math.floor(score))) as ScoreBucket;
};

// Ten-decile ramp sourced from the canonical palette JSON (index = bucket).
const PALETTE_DEFAULT_HEX = palette.default as string[];
const PALETTE_DEFAULT_RGB = palette.defaultRgb as RgbTuple[];

export const SCORE_BUCKET_COLOR_TUPLES: Record<ScoreBucket, RgbTuple> = {
  0: PALETTE_DEFAULT_RGB[0],
  1: PALETTE_DEFAULT_RGB[1],
  2: PALETTE_DEFAULT_RGB[2],
  3: PALETTE_DEFAULT_RGB[3],
  4: PALETTE_DEFAULT_RGB[4],
  5: PALETTE_DEFAULT_RGB[5],
  6: PALETTE_DEFAULT_RGB[6],
  7: PALETTE_DEFAULT_RGB[7],
  8: PALETTE_DEFAULT_RGB[8],
  9: PALETTE_DEFAULT_RGB[9],
};

export const SCORE_BUCKET_COLORS: Record<ScoreBucket, string> = {
  0: PALETTE_DEFAULT_HEX[0],
  1: PALETTE_DEFAULT_HEX[1],
  2: PALETTE_DEFAULT_HEX[2],
  3: PALETTE_DEFAULT_HEX[3],
  4: PALETTE_DEFAULT_HEX[4],
  5: PALETTE_DEFAULT_HEX[5],
  6: PALETTE_DEFAULT_HEX[6],
  7: PALETTE_DEFAULT_HEX[7],
  8: PALETTE_DEFAULT_HEX[8],
  9: PALETTE_DEFAULT_HEX[9],
};

// Neutral gray for an unknown/missing score — distinct from the red bottom tier so "no data"
// never reads as "worst place in the city". (In practice unscored entities are filtered out of
// results, so this is a defensive default.)
export const NEUTRAL_SCORE_COLOR = '#B0AEA8';

// Convenience: the bucket color for a score, as a CSS string (for rank pills/dots).
// A null/NaN score returns the neutral gray rather than falling to bucket 0 (red).
export const getScoreBucketColor = (score?: number | null): string =>
  typeof score === 'number' && Number.isFinite(score)
    ? SCORE_BUCKET_COLORS[scoreToBucket(score)]
    : NEUTRAL_SCORE_COLOR;

// Off-map preview-dot / splash-backdrop surfaces get the DISCRETE bucket color (not a
// continuous gradient). Kept under this exported name because quality.ts re-exports it.
export const getCraveScoreColorFromScore = (score?: number | null): string =>
  getScoreBucketColor(score);

// ---------------------------------------------------------------------------
// PIN BADGE IMAGE IDS — single source of truth for which pre-baked sprite a pin
// shows. The number is baked INTO the pin icon (see generate-pin-bucket-sprites.js)
// so symbol-z-order:'viewport-y' orders pin+number as one unit (no text bleed).
//
// In the user's submitted-search viewport → show RANK (frozen, contextual to the
// search). Outside it → show SCORE (intrinsic, stable as you pan away). Ranks are
// bounded because only the promoted top-N get pins (MAX_PIN_RANK). These ids MUST
// match the filenames the generator writes: pin-rank-<bucket>-<rank>.png and
// pin-score-<bucket>-<score>.png.
// ---------------------------------------------------------------------------
// Ranks 1..99 are baked per bucket; anything beyond shows the shared "99+" overflow
// sprite (id suffix must match generate-pin-bucket-sprites.js RANK_OVERFLOW_SUFFIX).
export const MAX_PIN_RANK_BADGE = 99;
const RANK_OVERFLOW_SUFFIX = 'overflow';

const bucketName = (bucket: ScoreBucket): string => `b${bucket}`;

// In-viewport rank badge id. Ranks 1..99 resolve to their numbered sprite; rank 100+
// (large search areas) folds to the bucket's shared "99+" overflow sprite.
export const rankBadgeImageId = (score: number | null | undefined, rank: number): string => {
  const bucket = bucketName(scoreToBucket(score));
  const r = Math.round(rank);
  if (r > MAX_PIN_RANK_BADGE) {
    return `pin-rank-${bucket}-${RANK_OVERFLOW_SUFFIX}`;
  }
  return `pin-rank-${bucket}-${Math.max(1, r)}`;
};

// ACTIVE (selected/pressed) rank badge: the SAME number baked in the active color (#ff3368), bucket-
// independent — the pin layer swaps to this on nativeHighlighted so a tapped pin recolors while keeping its
// rank. Matches the `pin-rank-active-<rank>` sprites from scripts/generate-pin-bucket-sprites.js.
export const activeRankBadgeImageId = (rank: number): string => {
  const r = Math.round(rank);
  if (r > MAX_PIN_RANK_BADGE) {
    return `pin-rank-active-${RANK_OVERFLOW_SUFFIX}`;
  }
  return `pin-rank-active-${Math.max(1, r)}`;
};

// Out-of-viewport score badge id (score is the 0–10 display score, clamped/rounded to
// the integer rating; dormant perf-only path, kept consistent with the 0–10 band).
export const scoreBadgeImageId = (score: number | null | undefined): string => {
  // Sprites are keyed by tenths of a point on the 0-10 scale (e.g. 8.7 -> 87, a
  // perfect 10.0 -> 100), matching scripts/generate-pin-bucket-sprites.js.
  const tenths =
    typeof score === 'number' && Number.isFinite(score)
      ? Math.max(0, Math.min(SCORE_BUCKET_DISPLAY_MAX * 10, Math.round(score * 10)))
      : 0;
  // Derive the bucket from the SAME rounded tenths (not floor(score)) so the id always resolves
  // to a baked sprite — the generator bakes b_i over tenths [i*10..(i+1)*10-1] and b9 over 90..100,
  // so e.g. 7.95 (tenths 80) must map to b8, not b7.
  const bucket = Math.min(9, Math.floor(tenths / 10)) as ScoreBucket;
  return `pin-score-${bucketName(bucket)}-${tenths}`;
};

// Pre-baked circle DOT sprite id for a score's bucket (matches scripts/generate-dot-sprites.js
// filenames `dot-b<bucket>.png`). Same bucketing as the pins, so a marker's dot and its pin share
// the exact bucket color.
export const dotBucketImageId = (score: number | null | undefined): string =>
  `dot-${bucketName(scoreToBucket(score))}`;
