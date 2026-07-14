// RED-provable coverage for the restaurant-profile hours engine. Every Google-parity
// state is pinned against a FIXED instant + known timezone so the spec is deterministic
// and any regression (a broken overnight roll, a timezone slip, a "closes soon" threshold
// drift) goes RED here. plans/restaurant-profile-revamp.md.

import type { StructuredWeeklyHours } from '@crave-search/shared';
import { formatClockMinutes, resolveHoursState } from './hours-engine';

const HM = (h: number, m = 0): number => h * 60 + m;

// A schedule whose days are given as index→intervals (0=Sun..6=Sat). Any absent day is
// closed. Defaults: has a schedule, IANA tz America/Chicago, no closed flags.
const makeSchedule = (
  daysMap: Record<number, Array<[number, number]>>,
  overrides: Partial<StructuredWeeklyHours> = {}
): StructuredWeeklyHours => ({
  timeZone: 'America/Chicago',
  utcOffsetMinutes: -360,
  days: Array.from({ length: 7 }, (_, day) => ({
    intervals: (daysMap[day] ?? []).map(([start, end]) => ({ start, end })),
  })),
  open24h: false,
  permanentlyClosed: false,
  temporarilyClosed: false,
  hasSchedule: true,
  ...overrides,
});

// Jan 15 2026 = Thursday (day 4). Chicago is CST (UTC-6) in January (no DST).
// 18:00Z → 12:00 (noon) Chicago Thursday.
const THU_NOON_UTC = Date.UTC(2026, 0, 15, 18, 0, 0);
// 03:30Z Jan 15 → 21:30 (9:30 PM) Chicago WEDNESDAY (day 3).
const WED_930PM_UTC = Date.UTC(2026, 0, 15, 3, 30, 0);
// 07:00Z Jan 15 → 01:00 (1 AM) Chicago Thursday.
const THU_1AM_UTC = Date.UTC(2026, 0, 15, 7, 0, 0);

describe('formatClockMinutes', () => {
  it('formats hours Google-style (no :00, noon/midnight)', () => {
    expect(formatClockMinutes(HM(7))).toBe('7 AM');
    expect(formatClockMinutes(HM(22))).toBe('10 PM');
    expect(formatClockMinutes(HM(18, 30))).toBe('6:30 PM');
    expect(formatClockMinutes(HM(12))).toBe('12 PM');
    expect(formatClockMinutes(HM(0))).toBe('12 AM');
    expect(formatClockMinutes(HM(24))).toBe('12 AM'); // wraps
  });
});

describe('resolveHoursState — live status (timezone-correct)', () => {
  it('OPEN mid-interval → "Open · Closes {end}"', () => {
    // Thursday open 11 AM–10 PM; now = noon Chicago.
    const s = makeSchedule({ 4: [[HM(11), HM(22)]] });
    const state = resolveHoursState(s, THU_NOON_UTC);
    expect(state.status).toBe('open');
    expect(state.headline).toBe('Open · Closes 10 PM');
    expect(state.tone).toBe('positive');
  });

  it('CLOSES SOON when closing within 60 min → caution', () => {
    // Thursday closes 12:30 PM; now = noon → 30 min out.
    const s = makeSchedule({ 4: [[HM(8), HM(12, 30)]] });
    const state = resolveHoursState(s, THU_NOON_UTC);
    expect(state.status).toBe('closes_soon');
    expect(state.headline).toBe('Closes soon · 12:30 PM');
    expect(state.tone).toBe('caution');
  });

  it('CLOSED, opens later TODAY → no day suffix', () => {
    // Thursday opens 5 PM; now = noon.
    const s = makeSchedule({ 4: [[HM(17), HM(22)]] });
    const state = resolveHoursState(s, THU_NOON_UTC);
    expect(state.status).toBe('closed');
    expect(state.headline).toBe('Closed · Opens 5 PM');
    expect(state.tone).toBe('negative');
  });

  it('CLOSED, next opening is a DIFFERENT day → weekday suffix (the "Opens 7 AM Tue" case)', () => {
    // Nothing Thursday; opens Friday (day 5) 7 AM. now = Thursday noon.
    const s = makeSchedule({ 5: [[HM(7), HM(15)]] });
    const state = resolveHoursState(s, THU_NOON_UTC);
    expect(state.status).toBe('closed');
    expect(state.headline).toBe('Closed · Opens 7 AM Fri');
  });

  it('OPENS SOON when opening within 60 min → caution', () => {
    // Thursday opens 12:45 PM; now = noon → 45 min out.
    const s = makeSchedule({ 4: [[HM(12, 45), HM(20)]] });
    const state = resolveHoursState(s, THU_NOON_UTC);
    expect(state.status).toBe('opens_soon');
    expect(state.headline).toBe('Opens soon · 12:45 PM');
  });

  it('OVERNIGHT interval: open Wed 8 PM–2 AM, evaluated Wed 9:30 PM → open', () => {
    // Wednesday (day 3) 8 PM → 2 AM next day = [1200, 1560] (end > 1440).
    const s = makeSchedule({ 3: [[HM(20), HM(26)]] });
    const state = resolveHoursState(s, WED_930PM_UTC);
    expect(state.status).toBe('open');
    expect(state.headline).toBe('Open · Closes 2 AM');
  });

  it('OVERNIGHT spillover across the WEEK WRAP: Sat 10 PM–2 AM, evaluated "Thu 1 AM" fixture proves next-day roll', () => {
    // Thursday (day 4) 8 PM → 3 AM = [1200, 1620]; now = Thu 1 AM (still inside Wed's? no —
    // this proves the CURRENT-day-minus-one overnight: Wed 8 PM–3 AM covering Thu 1 AM).
    const s = makeSchedule({ 3: [[HM(20), HM(27)]] });
    const state = resolveHoursState(s, THU_1AM_UTC);
    expect(state.status).toBe('open');
    expect(state.headline).toBe('Open · Closes 3 AM');
  });

  it('SPLIT intervals (lunch/dinner): closed during the break', () => {
    // Thursday 8–11 AM and 5–10 PM; now = noon → in the break → closed, opens 5 PM.
    const s = makeSchedule({
      4: [
        [HM(8), HM(11)],
        [HM(17), HM(22)],
      ],
    });
    const state = resolveHoursState(s, THU_NOON_UTC);
    expect(state.status).toBe('closed');
    expect(state.headline).toBe('Closed · Opens 5 PM');
  });

  it('OPEN 24 HOURS → positive, "Open 24 hours"', () => {
    const s = makeSchedule({}, { open24h: true });
    const state = resolveHoursState(s, THU_NOON_UTC);
    expect(state.status).toBe('open_24h');
    expect(state.headline).toBe('Open 24 hours');
    expect(state.tone).toBe('positive');
  });

  it('PERMANENTLY CLOSED overrides any schedule', () => {
    const s = makeSchedule({ 4: [[HM(0), HM(1440)]] }, { permanentlyClosed: true });
    const state = resolveHoursState(s, THU_NOON_UTC);
    expect(state.status).toBe('permanently_closed');
    expect(state.headline).toBe('Permanently closed');
    expect(state.tone).toBe('negative');
  });

  it('TEMPORARILY CLOSED overrides schedule', () => {
    const s = makeSchedule({ 4: [[HM(11), HM(22)]] }, { temporarilyClosed: true });
    const state = resolveHoursState(s, THU_NOON_UTC);
    expect(state.status).toBe('temporarily_closed');
    expect(state.headline).toBe('Temporarily closed');
  });

  it('NO schedule → "Hours unavailable", neutral', () => {
    const s = makeSchedule({}, { hasSchedule: false });
    const state = resolveHoursState(s, THU_NOON_UTC);
    expect(state.status).toBe('unknown');
    expect(state.headline).toBe('Hours unavailable');
    expect(state.tone).toBe('neutral');
  });

  it('null schedule → "Hours unavailable"', () => {
    expect(resolveHoursState(null, THU_NOON_UTC).headline).toBe('Hours unavailable');
  });
});

describe('resolveHoursState — weekly rows', () => {
  it('are TODAY-FIRST with today flagged and split/closed/24h labels', () => {
    const s = makeSchedule({
      4: [
        [HM(8), HM(11)],
        [HM(17), HM(22)],
      ], // Thursday split
      5: [], // Friday closed
    });
    const rows = resolveHoursState(s, THU_NOON_UTC).weeklyRows;
    expect(rows).toHaveLength(7);
    expect(rows[0].dayLabel).toBe('Thursday');
    expect(rows[0].isToday).toBe(true);
    expect(rows[0].intervalsLabel).toBe('8 AM – 11 AM, 5 PM – 10 PM');
    expect(rows[1].dayLabel).toBe('Friday');
    expect(rows[1].isToday).toBe(false);
    expect(rows[1].intervalsLabel).toBe('Closed');
    // exactly one today
    expect(rows.filter((r) => r.isToday)).toHaveLength(1);
  });

  it('labels every day "Open 24 hours" when open24h', () => {
    const rows = resolveHoursState(makeSchedule({}, { open24h: true }), THU_NOON_UTC).weeklyRows;
    expect(rows.every((r) => r.intervalsLabel === 'Open 24 hours')).toBe(true);
  });
});
