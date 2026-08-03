import { DISTANCE_MAX_DECIMALS, DISTANCE_MIN_DECIMALS } from '../constants/search';

export const formatDistanceMiles = (distance?: number | null): string | null => {
  if (typeof distance !== 'number' || !Number.isFinite(distance) || distance < 0) {
    return null;
  }
  if (distance >= 10) {
    return `${distance.toFixed(DISTANCE_MAX_DECIMALS)} mi`;
  }
  const rounded = Number(distance.toFixed(DISTANCE_MIN_DECIMALS));
  if (rounded >= 10) {
    return `${rounded.toFixed(DISTANCE_MAX_DECIMALS)} mi`;
  }
  return `${rounded.toFixed(DISTANCE_MIN_DECIMALS)} mi`;
};

export const formatCompactCount = (value?: number | null): string => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return '0';
  }
  if (value < 1000) {
    return Math.round(value).toString();
  }
  const formatWithSuffix = (num: number, divisor: number, suffix: string) => {
    const scaled = num / divisor;
    if (scaled >= 100) {
      return `${Math.round(scaled)}${suffix}`;
    }
    const fixed = Number(scaled.toFixed(1));
    const text = fixed % 1 === 0 ? fixed.toFixed(0) : fixed.toString();
    return `${text}${suffix}`;
  };
  if (value < 1_000_000) {
    return formatWithSuffix(value, 1000, 'K');
  }
  return formatWithSuffix(value, 1_000_000, 'M');
};
