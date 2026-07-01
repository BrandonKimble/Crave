export {
  getCraveScoreColorFromScore,
  getScoreBucketColor,
  scoreToBucket,
  SCORE_BUCKET_COLORS,
  SCORE_BUCKET_COLOR_TUPLES,
  type ScoreBucket,
} from '../../../utils/quality-color';

const MAX_RATING = 10;
const COMPACT_SCORE_FRACTION_DIGITS = 1;
const DETAIL_SCORE_FRACTION_DIGITS = 2;

const roundTo = (value: number, fractionDigits: number): number => {
  const multiplier = 10 ** fractionDigits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
};

const capNonPerfectRating = (rating: number, score: number, fractionDigits: number): number => {
  if (score >= MAX_RATING) {
    return Math.min(rating, MAX_RATING);
  }
  const maxNonPerfect = MAX_RATING - 1 / 10 ** fractionDigits;
  return Math.min(rating, maxNonPerfect);
};

const formatNumber = (value: number, fractionDigits: number, trimTrailingZero: boolean): string => {
  const fixed = value.toFixed(fractionDigits);
  return trimTrailingZero ? fixed.replace(/\.0+$/, '') : fixed;
};

export type FormattedCraveScoreParts = {
  value: string;
  accessibilityLabel: string;
};

const formatCraveScorePartsForPrecision = (
  score: number | null | undefined,
  fractionDigits: number,
  trimTrailingZero: boolean
): FormattedCraveScoreParts => {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return {
      value: '—',
      accessibilityLabel: 'Rating unavailable',
    };
  }
  const rounded = roundTo(score, fractionDigits);
  const rating = capNonPerfectRating(rounded, score, fractionDigits);
  const value = formatNumber(rating, fractionDigits, trimTrailingZero);
  return {
    value,
    accessibilityLabel: `Rating ${value}`,
  };
};

export const formatCraveScoreParts = (score?: number | null): FormattedCraveScoreParts =>
  formatCraveScorePartsForPrecision(score, COMPACT_SCORE_FRACTION_DIGITS, true);

export const formatCraveScoreDetailParts = (score?: number | null): FormattedCraveScoreParts =>
  formatCraveScorePartsForPrecision(score, DETAIL_SCORE_FRACTION_DIGITS, false);

const formatCraveScoreMovementForPrecision = (
  delta: number | null | undefined,
  fractionDigits: number,
  trimTrailingZero: boolean
): string | null => {
  if (typeof delta !== 'number' || !Number.isFinite(delta)) {
    return null;
  }
  // The delta is already in 0–10 rating points, the same scale as the rating shown next to
  // it (e.g. a +0.1 move next to a 9.4 rating renders ↑0.1) — no conversion needed.
  const rounded = roundTo(delta, fractionDigits);
  if (rounded === 0) {
    return null;
  }
  return `${rounded > 0 ? '↑' : '↓'}${formatNumber(Math.abs(rounded), fractionDigits, trimTrailingZero)} pts`;
};

// Compact: one decimal, matching the rating shown on result cards (e.g. 9.4). Because it
// rounds to the rating's own precision, sub-0.05-point moves round to 0 and render
// nothing — so the card delta is a notable-movement-only badge.
export const formatCraveScoreMovement = (delta?: number | null): string | null =>
  formatCraveScoreMovementForPrecision(delta, COMPACT_SCORE_FRACTION_DIGITS, true);

// Detail: two decimals, matching the 2-decimal score shown in the score-info sheet.
export const formatCraveScoreMovementDetail = (delta?: number | null): string | null =>
  formatCraveScoreMovementForPrecision(delta, DETAIL_SCORE_FRACTION_DIGITS, false);
