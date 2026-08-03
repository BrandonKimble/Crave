// RED-provable coverage for buildStructuredWeeklyHours — the server-side normalization
// that turns messy raw Google hours (+ businessStatus + tz) into the immutable typed
// schedule the client hours engine consumes. plans/restaurant-profile-revamp.md.

import {
  buildStructuredWeeklyHours,
  evaluateOperatingStatus,
} from './restaurant-status';

describe('buildStructuredWeeklyHours', () => {
  it('normalizes day-keyed "HH:MM-HH:MM" hours into 7 Sunday-indexed days with tz', () => {
    const result = buildStructuredWeeklyHours(
      {
        timezone: 'America/Chicago',
        utc_offset_minutes: -360,
        hours: {
          monday: '11:00-22:00',
          friday: ['11:00-14:00', '17:00-23:00'],
        },
      },
      null,
    );
    expect(result).not.toBeNull();
    expect(result!.timeZone).toBe('America/Chicago');
    expect(result!.utcOffsetMinutes).toBe(-360);
    expect(result!.days).toHaveLength(7);
    // index 1 = Monday
    expect(result!.days[1].intervals).toEqual([{ start: 660, end: 1320 }]);
    // index 5 = Friday, split lunch/dinner
    expect(result!.days[5].intervals).toEqual([
      { start: 660, end: 840 },
      { start: 1020, end: 1380 },
    ]);
    // Sunday closed
    expect(result!.days[0].intervals).toEqual([]);
    expect(result!.hasSchedule).toBe(true);
    expect(result!.open24h).toBe(false);
  });

  it('encodes overnight (close <= open) as end > 1440 so the client rolls it to next day', () => {
    const result = buildStructuredWeeklyHours(
      { hours: { saturday: '20:00-02:00' } },
      null,
    );
    // Saturday = index 6; 8 PM (1200) → 2 AM = 120 + 1440 = 1560
    expect(result!.days[6].intervals).toEqual([{ start: 1200, end: 1560 }]);
  });

  it('collapses all-week 00:00-23:59 into open24h', () => {
    const hours: Record<string, string> = {};
    for (const day of [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ]) {
      hours[day] = '00:00-23:59';
    }
    const result = buildStructuredWeeklyHours({ hours }, null);
    expect(result!.open24h).toBe(true);
  });

  it('carries CLOSED_PERMANENTLY as permanentlyClosed even with a schedule', () => {
    const result = buildStructuredWeeklyHours(
      { hours: { monday: '11:00-22:00' } },
      'CLOSED_PERMANENTLY',
    );
    expect(result!.permanentlyClosed).toBe(true);
    expect(result!.temporarilyClosed).toBe(false);
  });

  it('carries CLOSED_TEMPORARILY as temporarilyClosed', () => {
    const result = buildStructuredWeeklyHours(
      { hours: { monday: '11:00-22:00' } },
      'CLOSED_TEMPORARILY',
    );
    expect(result!.temporarilyClosed).toBe(true);
  });

  it('returns a permanentlyClosed schedule even with NO hours (closed flag alone is worth shipping)', () => {
    const result = buildStructuredWeeklyHours(null, 'CLOSED_PERMANENTLY');
    expect(result).not.toBeNull();
    expect(result!.permanentlyClosed).toBe(true);
    expect(result!.hasSchedule).toBe(false);
  });

  it('returns null when there is neither a schedule nor a closed flag', () => {
    expect(buildStructuredWeeklyHours(null, null)).toBeNull();
    expect(buildStructuredWeeklyHours({ hours: {} }, null)).toBeNull();
  });
});

describe('evaluateOperatingStatus — the closing-time contract the client depends on', () => {
  // THE CONTRACT (F1018): the client NEVER re-derives closing time. It cannot — a device
  // clock does not know the restaurant's timezone. So whenever this returns isOpen:true
  // it MUST also return a numeric closesInMinutes; a display string alone is not enough.
  const metadata = {
    hours: { monday: '11:00-22:00', tuesday: '11:00-22:00' },
    timeZone: 'America/Chicago',
  };

  it('always carries closesInMinutes alongside closesAtDisplay when open', () => {
    // 2026-08-03 is a Monday. 21:00 in Chicago is 02:00 UTC on the 4th.
    const status = evaluateOperatingStatus(
      metadata,
      new Date('2026-08-04T02:00:00Z'),
    );
    expect(status).not.toBeNull();
    expect(status!.isOpen).toBe(true);
    expect(typeof status!.closesInMinutes).toBe('number');
    expect(status!.closesAtDisplay).toBeTruthy();
  });

  it('evaluates against the RESTAURANT timezone, not the caller clock', () => {
    // Same instant, but 23:00 Chicago-local — closed there even though a US-Eastern
    // caller would read midnight and an Asia caller would read midday.
    const status = evaluateOperatingStatus(
      metadata,
      new Date('2026-08-04T04:00:00Z'),
    );
    expect(status!.isOpen).toBe(false);
    expect(status!.closesInMinutes ?? null).toBeNull();
    expect(status!.closesAtDisplay ?? null).toBeNull();
  });
});
