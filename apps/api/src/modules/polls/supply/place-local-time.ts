/**
 * Local-time helpers for the §4 weekly ritual: one tick per place at Sunday
 * 09:00 LOCAL, keyed by the place's timeZone.
 *
 * Seeded places (scripts/seed-us-places.ts) carry NULL timeZone. Per the §1
 * law ("offline centroid→tz at creation") the honest offline fallback is the
 * nautical timezone derived from the centroid longitude (15° of longitude per
 * hour — a definitional astronomical fact, K6-class, not a tunable). We
 * deliberately DERIVE AT READ and DO NOT persist the derived zone: the
 * catalog's merge law only gap-fills NULL scalars, so persisting the nautical
 * approximation would permanently block a later provider-derived political
 * timezone from landing. The approximation can be 2h+ off political time
 * (DST plus wide political zones — Austin in summer is UTC-5 while its
 * nautical zone is UTC-7), which is still well inside the ritual's tolerance:
 * the tick fires anywhere in the local Sunday 09:00-23:59 window (~15h), so
 * the derived zone still lands on the SAME local Sunday.
 */

export const DEGREES_PER_HOUR = 15; // definitional: 360° / 24h

export interface LocalParts {
  /** 0 = Sunday … 6 = Saturday, in the place's local time. */
  dayOfWeek: number;
  hour: number;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Nautical (fixed-offset) zone from a centroid longitude. Note the POSIX
 *  Etc/GMT sign inversion: Etc/GMT+6 means UTC-6. */
export function derivedTimeZoneFromLongitude(lng: number): string {
  const offsetHours = Math.round(lng / DEGREES_PER_HOUR);
  // Etc/GMT zones are inverted: positive longitude (east, UTC+n) = Etc/GMT-n.
  if (offsetHours === 0) return 'Etc/GMT';
  return offsetHours > 0 ? `Etc/GMT-${offsetHours}` : `Etc/GMT+${-offsetHours}`;
}

/** True when the IANA zone id is resolvable by the runtime's ICU data. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The place's effective zone: its stored (valid) timeZone, else the nautical
 * derivation from its centroid longitude, else null (un-sketched centroid —
 * such a place cannot host the ritual yet and is skipped, documented).
 */
export function effectiveTimeZone(place: {
  timeZone: string | null;
  centroidLng: unknown;
}): string | null {
  if (place.timeZone && isValidTimeZone(place.timeZone)) {
    return place.timeZone;
  }
  if (place.centroidLng === null || place.centroidLng === undefined) {
    return null;
  }
  const lng = Number(place.centroidLng);
  if (!Number.isFinite(lng)) {
    return null;
  }
  return derivedTimeZoneFromLongitude(lng);
}

/** Local wall-clock parts of `at` in `timeZone`. */
export function localParts(at: Date, timeZone: string): LocalParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  });
  const parts = new Map(
    formatter.formatToParts(at).map((part) => [part.type, part.value]),
  );
  const hourRaw = Number(parts.get('hour'));
  return {
    dayOfWeek: WEEKDAY_INDEX[parts.get('weekday') ?? ''] ?? -1,
    // ICU may render midnight as "24" with hour12: false.
    hour: hourRaw === 24 ? 0 : hourRaw,
    date: `${parts.get('year')}-${parts.get('month')}-${parts.get('day')}`,
  };
}

/**
 * Deterministic per-place jitter within the ritual minute (§4: "per-place
 * jitter within the minute"). Pure hash of the placeId — stable across runs,
 * spread across [0, 60s). The 60_000 is K1: "within the minute" is a fact of
 * the ratified ritual sentence (§16), not a tunable.
 */
export function ritualJitterMs(placeId: string): number {
  let hash = 0;
  for (let i = 0; i < placeId.length; i += 1) {
    hash = (hash * 31 + placeId.charCodeAt(i)) >>> 0;
  }
  return hash % 60_000;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The CURRENT ritual cycle's weekOf label in `timeZone`: the local calendar
 * date of the most recent `ritualDayOfWeek` (today when today IS that day).
 * Label arithmetic is pure calendar math on the local date — immune to DST
 * transitions and wall-clock ms drift, which is why cohort closure compares
 * weekOf LABELS, never elapsed milliseconds (§4 red-team 1a).
 */
export function currentWeekOfLabel(
  at: Date,
  timeZone: string,
  ritualDayOfWeek: number,
): string {
  const local = localParts(at, timeZone);
  const [year, month, day] = local.date.split('-').map(Number);
  const daysSinceRitualDay = (local.dayOfWeek - ritualDayOfWeek + 7) % 7;
  const label = new Date(
    Date.UTC(year, month - 1, day) - daysSinceRitualDay * MS_PER_DAY,
  );
  return label.toISOString().slice(0, 10);
}

/** Exact day count between two YYYY-MM-DD labels (later − earlier). */
export function labelDayDiff(laterLabel: string, earlierLabel: string): number {
  const parse = (label: string) => {
    const [year, month, day] = label.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((parse(laterLabel) - parse(earlierLabel)) / MS_PER_DAY);
}

/**
 * True when ANY timezone on earth is currently inside the local window
 * (dayOfWeek, hour >= minHour). Political UTC offsets live inside the IANA
 * envelope UTC-12:00 … UTC+14:00 in 15-minute steps (an earthly/vendor fact,
 * not a tunable) — scanning that envelope is a pure derivation from the UTC
 * instant, so hours in which NO zone can be in its Sunday ritual window are
 * skipped without touching the database (§4 red-team 3a).
 */
export function anyZoneInsideLocalWindow(
  at: Date,
  dayOfWeek: number,
  minHour: number,
): boolean {
  const MS_PER_MINUTE = 60 * 1000;
  for (let offset = -12 * 60; offset <= 14 * 60; offset += 15) {
    const shifted = new Date(at.getTime() + offset * MS_PER_MINUTE);
    if (shifted.getUTCDay() === dayOfWeek && shifted.getUTCHours() >= minHour) {
      return true;
    }
  }
  return false;
}
