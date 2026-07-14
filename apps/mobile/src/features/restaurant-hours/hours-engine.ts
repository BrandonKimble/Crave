// THE client hours engine (restaurant profile revamp, 2026-07-13). Pure + timezone-aware.
//
// Design of record: plans/restaurant-profile-revamp.md. The server ships an IMMUTABLE
// `StructuredWeeklyHours` schedule (cacheable); THIS computes the LIVE open/closed state
// from the device clock in the LOCATION's timezone. One engine feeds both the compact
// status line AND the expandable weekly card — one tested source of truth. No React, no
// network, no Date.now inside (the caller passes `nowUtcMs`, so it's deterministic + the
// spec can pin every state RED-provably).
//
// Google-parity states: Open · Closes 10 PM / Open 24 hours / Closed · Opens 7 AM Tue /
// Closes soon / Opens soon / Temporarily closed / Permanently closed / Hours unavailable.
// Handles overnight spillover (end > 1440), same-day splits (lunch/dinner), and the
// Saturday→Sunday week wrap.

import type { StructuredWeeklyHours } from '@crave-search/shared';

export type HoursStatus =
  | 'open'
  | 'closes_soon'
  | 'open_24h'
  | 'closed'
  | 'opens_soon'
  | 'permanently_closed'
  | 'temporarily_closed'
  | 'unknown';

export type HoursTone = 'positive' | 'caution' | 'negative' | 'neutral';

export interface HoursWeeklyRow {
  /** Full weekday name ("Monday"). */
  dayLabel: string;
  /** True for the location-local current weekday — the card bolds this row. */
  isToday: boolean;
  /** "7 AM – 3 PM" · "11 AM – 2 PM, 5 – 10 PM" · "Open 24 hours" · "Closed". */
  intervalsLabel: string;
}

export interface HoursState {
  status: HoursStatus;
  /** The one-glance line, Google-style. "Open · Closes 10 PM", "Closed · Opens 7 AM Tue". */
  headline: string;
  tone: HoursTone;
  /** 7 rows, TODAY FIRST (rows[0] is the location-local today), then the following days. */
  weeklyRows: HoursWeeklyRow[];
}

const MINUTES_PER_DAY = 1440;
const MINUTES_PER_WEEK = MINUTES_PER_DAY * 7; // 10080
const SOON_WINDOW_MIN = 60;

const FULL_DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const SHORT_DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Location-local weekday (0=Sun) + minutes-from-midnight for a UTC instant. */
const resolveLocalNow = (
  schedule: StructuredWeeklyHours,
  nowUtcMs: number
): { day: number; minutes: number } => {
  if (schedule.timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: schedule.timeZone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(new Date(nowUtcMs));
      const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
      const hourRaw = parts.find((p) => p.type === 'hour')?.value ?? '0';
      const minuteRaw = parts.find((p) => p.type === 'minute')?.value ?? '0';
      const day = SHORT_DAY_NAMES.indexOf(weekday);
      // Intl hour12:false can emit "24" at midnight — normalize to 0.
      const hour = Number(hourRaw) % 24;
      const minute = Number(minuteRaw);
      if (day >= 0 && Number.isFinite(hour) && Number.isFinite(minute)) {
        return { day, minutes: hour * 60 + minute };
      }
    } catch {
      // fall through to offset / device
    }
  }
  if (schedule.utcOffsetMinutes != null && Number.isFinite(schedule.utcOffsetMinutes)) {
    const shifted = new Date(nowUtcMs + schedule.utcOffsetMinutes * 60_000);
    return {
      day: shifted.getUTCDay(),
      minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    };
  }
  const local = new Date(nowUtcMs);
  return { day: local.getDay(), minutes: local.getHours() * 60 + local.getMinutes() };
};

/** minutes-from-midnight → "7 AM" / "6:30 PM" / "12 PM" (noon) / "12 AM" (midnight). */
export const formatClockMinutes = (minutesFromMidnight: number): string => {
  const normalized =
    ((Math.round(minutesFromMidnight) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour24 = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const period = hour24 < 12 ? 'AM' : 'PM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minute === 0
    ? `${hour12} ${period}`
    : `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
};

type AbsInterval = { start: number; end: number; day: number };

/** All intervals as absolute week-minute ranges (day*1440 + local minute). Overnight
 *  spill (end > 1440) naturally extends past the day boundary. */
const toAbsoluteIntervals = (schedule: StructuredWeeklyHours): AbsInterval[] => {
  const out: AbsInterval[] = [];
  for (let day = 0; day < 7; day += 1) {
    const intervals = schedule.days[day]?.intervals ?? [];
    for (const interval of intervals) {
      if (interval.end <= interval.start) {
        continue;
      }
      out.push({
        start: day * MINUTES_PER_DAY + interval.start,
        end: day * MINUTES_PER_DAY + interval.end,
        day,
      });
    }
  }
  return out;
};

/** Is `weekMinutes` inside [start,end) considering the Sat→Sun wrap? */
const containsWithWrap = (start: number, end: number, weekMinutes: number): boolean =>
  (weekMinutes >= start && weekMinutes < end) ||
  (weekMinutes + MINUTES_PER_WEEK >= start && weekMinutes + MINUTES_PER_WEEK < end);

const buildWeeklyRows = (schedule: StructuredWeeklyHours, todayDay: number): HoursWeeklyRow[] => {
  const rows: HoursWeeklyRow[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const day = (todayDay + offset) % 7;
    const intervals = schedule.days[day]?.intervals ?? [];
    let intervalsLabel: string;
    if (schedule.open24h) {
      intervalsLabel = 'Open 24 hours';
    } else if (intervals.length === 0) {
      intervalsLabel = 'Closed';
    } else {
      intervalsLabel = intervals
        .map((i) => `${formatClockMinutes(i.start)} – ${formatClockMinutes(i.end)}`)
        .join(', ');
    }
    rows.push({ dayLabel: FULL_DAY_NAMES[day], isToday: offset === 0, intervalsLabel });
  }
  return rows;
};

export const resolveHoursState = (
  schedule: StructuredWeeklyHours | null | undefined,
  nowUtcMs: number
): HoursState => {
  const emptyRows: HoursWeeklyRow[] = [];
  if (
    !schedule ||
    (!schedule.hasSchedule &&
      !schedule.permanentlyClosed &&
      !schedule.temporarilyClosed &&
      !schedule.open24h)
  ) {
    return {
      status: 'unknown',
      headline: 'Hours unavailable',
      tone: 'neutral',
      weeklyRows: emptyRows,
    };
  }

  const { day: todayDay, minutes } = resolveLocalNow(schedule, nowUtcMs);
  const weeklyRows = buildWeeklyRows(schedule, todayDay);

  if (schedule.permanentlyClosed) {
    return {
      status: 'permanently_closed',
      headline: 'Permanently closed',
      tone: 'negative',
      weeklyRows,
    };
  }
  if (schedule.temporarilyClosed) {
    return {
      status: 'temporarily_closed',
      headline: 'Temporarily closed',
      tone: 'negative',
      weeklyRows,
    };
  }
  if (schedule.open24h) {
    return { status: 'open_24h', headline: 'Open 24 hours', tone: 'positive', weeklyRows };
  }

  const weekMinutes = todayDay * MINUTES_PER_DAY + minutes;
  const abs = toAbsoluteIntervals(schedule);

  // OPEN? — find the active interval and how soon it closes.
  for (const interval of abs) {
    if (containsWithWrap(interval.start, interval.end, weekMinutes)) {
      const effectiveNow =
        weekMinutes >= interval.start ? weekMinutes : weekMinutes + MINUTES_PER_WEEK;
      const closesInMinutes = interval.end - effectiveNow;
      const closesAt = formatClockMinutes(interval.end % MINUTES_PER_DAY);
      if (closesInMinutes <= SOON_WINDOW_MIN) {
        return {
          status: 'closes_soon',
          headline: `Closes soon · ${closesAt}`,
          tone: 'caution',
          weeklyRows,
        };
      }
      return {
        status: 'open',
        headline: `Open · Closes ${closesAt}`,
        tone: 'positive',
        weeklyRows,
      };
    }
  }

  // CLOSED — find the nearest forward opening.
  let bestDelta = Number.POSITIVE_INFINITY;
  let bestStart: AbsInterval | null = null;
  for (const interval of abs) {
    // forward distance from now to this opening, within the rolling week
    let delta = interval.start - weekMinutes;
    if (delta < 0) {
      delta += MINUTES_PER_WEEK;
    }
    if (delta < bestDelta) {
      bestDelta = delta;
      bestStart = interval;
    }
  }
  if (!bestStart) {
    return { status: 'unknown', headline: 'Hours unavailable', tone: 'neutral', weeklyRows };
  }
  const opensAt = formatClockMinutes(bestStart.start % MINUTES_PER_DAY);
  const opensDay = Math.floor((bestStart.start % MINUTES_PER_WEEK) / MINUTES_PER_DAY);
  const daySuffix = opensDay === todayDay ? '' : ` ${SHORT_DAY_NAMES[opensDay]}`;
  if (bestDelta <= SOON_WINDOW_MIN) {
    return {
      status: 'opens_soon',
      headline: `Opens soon · ${opensAt}${daySuffix}`,
      tone: 'caution',
      weeklyRows,
    };
  }
  return {
    status: 'closed',
    headline: `Closed · Opens ${opensAt}${daySuffix}`,
    tone: 'negative',
    weeklyRows,
  };
};
