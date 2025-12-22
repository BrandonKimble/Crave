import { DISTANCE_MAX_DECIMALS, DISTANCE_MIN_DECIMALS } from '../constants/search';

export const capitalizeFirst = (value: string): string =>
  value.length ? value.charAt(0).toUpperCase() + value.slice(1) : value;

export const formatCoverageLabel = (value?: string | null): string | null => {
  if (!value || typeof value !== 'string') {
    return null;
  }
  const normalized = value.replace(/[_-]+/g, ' ').trim();
  if (!normalized) {
    return null;
  }
  return normalized
    .split(' ')
    .filter(Boolean)
    .map((word) => capitalizeFirst(word))
    .join(' ');
};

const parseTimeDisplayToMinutes = (value?: string | null): number | null => {
  if (!value || typeof value !== 'string') {
    return null;
  }
  const match = value
    .trim()
    .toLowerCase()
    .match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!match) {
    return null;
  }
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const period = match[3];

  if (period === 'pm' && hour < 12) {
    hour += 12;
  } else if (period === 'am' && hour === 12) {
    hour = 0;
  }

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }

  return hour * 60 + minute;
};

export const minutesUntilCloseFromDisplay = (closesAtDisplay?: string | null): number | null => {
  const closeMinutes = parseTimeDisplayToMinutes(closesAtDisplay);
  if (closeMinutes === null) {
    return null;
  }

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  let diff = closeMinutes - currentMinutes;

  if (diff < -60) {
    diff += 24 * 60;
  }

  return diff >= 0 ? diff : null;
};

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
