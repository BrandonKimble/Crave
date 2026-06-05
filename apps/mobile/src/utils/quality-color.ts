type RgbTuple = [number, number, number];
import colorPaletteData from '../constants/color-palette.json';

const colorPalette = colorPaletteData as unknown as {
  qualityGradientStops: Array<{ t: number; color: RgbTuple }>;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const QUALITY_GRADIENT_STOPS = colorPalette.qualityGradientStops;

const QUALITY_GRADIENT_STOPS_REVERSED = [...QUALITY_GRADIENT_STOPS].reverse();

const getCraveScoreColorForT = (t: number): string => {
  const clampedT = clamp01(t);
  const next =
    QUALITY_GRADIENT_STOPS.find((stop) => stop.t >= clampedT) ??
    QUALITY_GRADIENT_STOPS[QUALITY_GRADIENT_STOPS.length - 1];
  const prev =
    QUALITY_GRADIENT_STOPS_REVERSED.find((stop) => stop.t <= clampedT) ?? QUALITY_GRADIENT_STOPS[0];
  const span = Math.max(next.t - prev.t, 0.0001);
  const localT = (clampedT - prev.t) / span;
  const mix = prev.color.map((channel, channelIndex) =>
    Math.round(channel + (next.color[channelIndex] - channel) * localT)
  ) as RgbTuple;
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
};

export const getCraveScoreColorFromScore = (score?: number | null): string => {
  const normalizedScore =
    typeof score === 'number' && Number.isFinite(score) ? clamp01(score / 100) : null;
  if (normalizedScore === null) {
    return getCraveScoreColorForT(0.5);
  }
  return getCraveScoreColorForT(1 - normalizedScore);
};

// ---------------------------------------------------------------------------
// SCORE BUCKETS — single source of truth for the discrete pin/pill/dot colors.
//
// The map pin is a pre-baked sprite per bucket (scripts/generate-pin-bucket-sprites.js)
// and the result-list rank pills + dots must match their pin EXACTLY, so all three
// derive color from THIS module — never from a per-call continuous gradient.
//
// Display scores span ~60–100 (public-crave-score displayMin/Max). We use EIGHT
// buckets in 5-point increments so color carries fine-grained, intuitive signal:
//   95+  90-94  85-89  80-84  75-79  70-74  65-69  60-64
// The ramp runs green (best) → orange-red (lowest shown) — a hand-tuned,
// perceptually-smooth, brand-aligned scale (endpoints match the app palette's
// green #28BA82 and orange-red #FF6E52).
// ---------------------------------------------------------------------------
export type ScoreBucket = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7; // 0 = 60-64 (low) … 7 = 95+ (best)

export const SCORE_BUCKET_DISPLAY_MIN = 60;
export const SCORE_BUCKET_DISPLAY_MAX = 100;

// 5-point thresholds across 60–100. Anything below 65 floors to bucket 0; 95+ is bucket 7.
export const scoreToBucket = (score?: number | null): ScoreBucket => {
  const s = typeof score === 'number' && Number.isFinite(score) ? score : SCORE_BUCKET_DISPLAY_MIN;
  if (s < 65) return 0; // 60–64  orange-red
  if (s < 70) return 1; // 65–69  orange
  if (s < 75) return 2; // 70–74  amber-orange
  if (s < 80) return 3; // 75–79  gold
  if (s < 85) return 4; // 80–84  chartreuse
  if (s < 90) return 5; // 85–89  lime-green
  if (s < 95) return 6; // 90–94  green
  return 7; //            95+     vivid green
};

// Hand-picked green→orange-red ramp (index = bucket). Saturated but not garish,
// each step clearly distinct at pin size, smooth transitions between neighbors.
export const SCORE_BUCKET_COLOR_TUPLES: Record<ScoreBucket, RgbTuple> = {
  0: [239, 83, 68], //  60–64  orange-red
  1: [245, 124, 56], // 65–69  orange
  2: [247, 158, 52], // 70–74  amber-orange
  3: [242, 196, 70], // 75–79  gold
  4: [203, 199, 74], // 80–84  chartreuse
  5: [146, 198, 84], // 85–89  lime-green
  6: [78, 188, 110], // 90–94  green
  7: [40, 178, 123], // 95+    vivid green
};

export const SCORE_BUCKET_COLORS: Record<ScoreBucket, string> = {
  0: `rgb(${SCORE_BUCKET_COLOR_TUPLES[0].join(', ')})`,
  1: `rgb(${SCORE_BUCKET_COLOR_TUPLES[1].join(', ')})`,
  2: `rgb(${SCORE_BUCKET_COLOR_TUPLES[2].join(', ')})`,
  3: `rgb(${SCORE_BUCKET_COLOR_TUPLES[3].join(', ')})`,
  4: `rgb(${SCORE_BUCKET_COLOR_TUPLES[4].join(', ')})`,
  5: `rgb(${SCORE_BUCKET_COLOR_TUPLES[5].join(', ')})`,
  6: `rgb(${SCORE_BUCKET_COLOR_TUPLES[6].join(', ')})`,
  7: `rgb(${SCORE_BUCKET_COLOR_TUPLES[7].join(', ')})`,
};

// Convenience: the bucket color for a score, as a CSS string (for rank pills/dots).
export const getScoreBucketColor = (score?: number | null): string =>
  SCORE_BUCKET_COLORS[scoreToBucket(score)];

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
export const MAX_PIN_RANK_BADGE = 40;

const bucketName = (bucket: ScoreBucket): string => `b${bucket}`;

// In-viewport rank badge id, clamped to the baked range.
export const rankBadgeImageId = (score: number | null | undefined, rank: number): string => {
  const r = Math.max(1, Math.min(MAX_PIN_RANK_BADGE, Math.round(rank)));
  return `pin-rank-${bucketName(scoreToBucket(score))}-${r}`;
};

// Out-of-viewport score badge id (score is the 0–100 display score; baked per
// bucket within that bucket's own range, so this always resolves to a real file).
export const scoreBadgeImageId = (score: number | null | undefined): string => {
  const bucket = scoreToBucket(score);
  const s =
    typeof score === 'number' && Number.isFinite(score)
      ? Math.max(SCORE_BUCKET_DISPLAY_MIN, Math.min(SCORE_BUCKET_DISPLAY_MAX, Math.round(score)))
      : SCORE_BUCKET_DISPLAY_MIN;
  return `pin-score-${bucketName(bucket)}-${s}`;
};
