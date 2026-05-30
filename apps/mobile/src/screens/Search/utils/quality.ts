export { getCraveScoreColorFromScore } from '../../../utils/quality-color';

const CRAVE_RATING_SCALE = 10;
const COMPACT_SCORE_FRACTION_DIGITS = 1;
const DETAIL_SCORE_FRACTION_DIGITS = 2;

const roundTo = (value: number, fractionDigits: number): number => {
  const multiplier = 10 ** fractionDigits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
};

const toRatingValue = (score: number): number => score / CRAVE_RATING_SCALE;

const capNonPerfectRating = (
  rating: number,
  score: number,
  fractionDigits: number
): number => {
  if (score >= 100) {
    return Math.min(rating, CRAVE_RATING_SCALE);
  }
  const maxNonPerfect = CRAVE_RATING_SCALE - 1 / 10 ** fractionDigits;
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
  const rounded = roundTo(toRatingValue(score), fractionDigits);
  const rating = capNonPerfectRating(rounded, score, fractionDigits);
  const value = formatNumber(rating, fractionDigits, trimTrailingZero);
  return {
    value,
    accessibilityLabel: `Rating ${value}`,
  };
};

export const formatCraveScoreParts = (
  score?: number | null
): FormattedCraveScoreParts =>
  formatCraveScorePartsForPrecision(score, COMPACT_SCORE_FRACTION_DIGITS, true);

export const formatCraveScoreDetailParts = (
  score?: number | null
): FormattedCraveScoreParts =>
  formatCraveScorePartsForPrecision(score, DETAIL_SCORE_FRACTION_DIGITS, false);

export const formatCraveScore = (score?: number | null): string => {
  const parts = formatCraveScoreParts(score);
  return parts.value;
};

export const formatCraveScoreDetail = (score?: number | null): string => {
  const parts = formatCraveScoreDetailParts(score);
  return parts.value;
};

export const formatCraveScoreMovementDetail = (delta?: number | null): string | null => {
  if (typeof delta !== 'number' || !Number.isFinite(delta)) {
    return null;
  }
  const rounded = roundTo(delta / CRAVE_RATING_SCALE, DETAIL_SCORE_FRACTION_DIGITS);
  if (rounded === 0) {
    return null;
  }
  return `${rounded > 0 ? '↑' : '↓'}${Math.abs(rounded).toFixed(
    DETAIL_SCORE_FRACTION_DIGITS
  )} pts`;
};
